/**
 * The copy-rule engine shared by every owner-editable document (docs/BRIEF.md §2).
 *
 * It was extracted from `menu-content.ts` when the menu stopped being the only editable
 * document: the menu validator, the schema-driven validator in `content-schema.ts`, and the
 * acceptance gate must all apply the *same* checks, and the only way to guarantee that is one
 * implementation. The gate (`scripts/verify-build.mjs`) imports this very module — the matchers
 * below are what it runs over the rendered pages, so the two can never drift. The publish
 * endpoint is the last gate the owner's words pass: the pages read the saved document at request
 * time, so anything this engine lets through is on the site the moment it is published, with no
 * build left to catch it.
 *
 * Like `menu-content.ts`, this runs in four places — the rendering server, the admin editor's
 * client bundle, the Netlify Functions and the acceptance gate (plain Node, types stripped) — so
 * it stays dependency-free, browser-safe, free of Node APIs, imports nothing at all, and uses
 * only erasable TypeScript syntax.
 *
 * NOTE ON VOCABULARY: BRIEF §2 bans a list of words from the site. This module enforces the ban
 * but never spells the words out — and it deliberately imports no JSON, `content-rules.json`
 * included. Anything the admin client imports is inlined into the public chunks under
 * `_next/`, and the rules hold strings (the wrong third-party phone number among them) that
 * may never ship. So the rules are injected instead: the Netlify Functions and the acceptance
 * gate import the JSON server-side, while the editor fetches it at runtime from the auth-gated
 * `/admin/api/rules` endpoint and passes fetched-or-null. With `null`, only the rules-driven
 * checks (forbidden words, hours and open days, placeholders) are skipped — casing, prices,
 * phone format, the `{hours}`/`{season}` tokens, empties and duplicates still run, and the server always
 * re-validates with the real rules on publish.
 */

/** One copy-rule violation, addressed by a path label like `sections[2].items[0].name`. */
export interface CopyIssue {
  readonly path: string;
  readonly message: string;
  /**
   * A house-style steer rather than a rule the gate enforces: it blocks a publish (the owner
   * can fix it in seconds), but not a restore — a saved version can't be edited, and what it
   * says is still correct. Today only the "type {hours} instead" and "type {season} instead"
   * steers are advisory.
   */
  readonly advisory?: true;
}

/**
 * The injected content rules — the parsed shape of `src/data/content-rules.json`. Callers that
 * hold the JSON (the Netlify Functions, the acceptance gate) pass it straight through; the admin
 * client passes whatever the gated `/admin/api/rules` endpoint returned, or `null` when the
 * fetch failed (offline, plain `next dev`).
 */
export interface ContentRules {
  readonly forbiddenWords: readonly string[];
  readonly expectedHours: {
    /** 24-hour `HH:MM`, e.g. `09:00`. */
    readonly opens: string;
    /** 24-hour `HH:MM`, e.g. `16:00`. */
    readonly closes: string;
    /** The open days, spelled out (`Sunday` … `Saturday`); every other day is closed. */
    readonly days: readonly string[];
  };
  /** Template-bug markers matched as case-sensitive substrings, e.g. `[object Object]`. */
  readonly placeholders: readonly string[];
}

const BRAND = 'Native WILDFlour';
const PHONE_DISPLAY = '+1 907-612-0002';

const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The rules-driven scanners, built once per validation pass from the injected rules. */
export interface RuleChecks {
  readonly forbidden: readonly { readonly word: string; readonly pattern: RegExp }[];
  readonly placeholders: readonly string[];
  readonly opens: string;
  readonly closes: string;
  /** Day indexes (0 = Sunday) the cafe is open. */
  readonly openDays: ReadonlySet<number>;
  /** Human rendering of the expected week, e.g. "Sunday–Friday, 9:00 AM–4:00 PM; closed Saturday". */
  readonly hoursDisplay: string;
}

/**
 * Banned-vocabulary patterns are separator-tolerant: a space or hyphen inside a rule also
 * matches the joined spelling and the other common separators, spaced or not ("a - b"), and a
 * trailing "s" catches plurals. Whole-word, case-insensitive. They run on `normalizeCopy()`
 * output, so typographic dashes, non-breaking spaces and invisible characters can't split a word
 * past them.
 */
export function buildRuleChecks(rules: ContentRules): RuleChecks {
  // The editor validates on every keystroke against the same rules object for the life of the
  // page; compiling one RegExp per banned word each time is pure waste, so the result is kept
  // per rules object (weakly — a rules object nothing holds any more takes its checks with it).
  const cached = RULE_CHECKS.get(rules);
  if (cached !== undefined) return cached;
  const checks = compileRuleChecks(rules);
  RULE_CHECKS.set(rules, checks);
  return checks;
}

const RULE_CHECKS = new WeakMap<ContentRules, RuleChecks>();

function compileRuleChecks(rules: ContentRules): RuleChecks {
  const openDays = new Set(
    rules.expectedHours.days.map((day) => WEEK.indexOf(day)).filter((index) => index >= 0),
  );
  return {
    forbidden: rules.forbiddenWords.map((word) => ({
      word,
      pattern: new RegExp(
        `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '\\s*[.-]?\\s*')}s?\\b`,
        'i',
      ),
    })),
    placeholders: rules.placeholders,
    opens: rules.expectedHours.opens,
    closes: rules.expectedHours.closes,
    openDays,
    hoursDisplay: describeWeek(openDays, rules.expectedHours.opens, rules.expectedHours.closes),
  };
}

/** "Sunday–Friday, 9:00 AM–4:00 PM; closed Saturday" — for owner-facing messages. */
function describeWeek(openDays: ReadonlySet<number>, opens: string, closes: string): string {
  const time = `${to12Hour(opens)}–${to12Hour(closes)}`;
  if (openDays.size === 7) return `every day, ${time}`;
  if (openDays.size === 0) return time;
  const runs: number[][] = [];
  // Start the walk just after a closed day, so a run that wraps the week stays in one piece.
  const start = [...Array(7).keys()].find((day) => !openDays.has(day)) ?? 0;
  for (let step = 1; step <= 7; step += 1) {
    const day = (start + step) % 7;
    const last = runs.at(-1);
    if (!openDays.has(day)) continue;
    if (last !== undefined && (last.at(-1)! + 1) % 7 === day) last.push(day);
    else runs.push([day]);
  }
  const span = (run: number[]) =>
    run.length === 1 ? WEEK[run[0]!] : `${WEEK[run[0]!]}–${WEEK[run.at(-1)!]}`;
  const closed = WEEK.filter((_, day) => !openDays.has(day));
  return `${runs.map(span).join(' and ')}, ${time}; closed ${closed.join(' and ')}`;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * The invisible format characters a paste can carry in the Basic Multilingual Plane — soft
 * hyphens, zero-width spaces and joiners, direction marks and embeddings, variation selectors,
 * fillers — as a character-class body, for the patterns that must see past them in raw text (the
 * content tokens). `normalizeCopy` drops these and every other default-ignorable character.
 */
const INVISIBLE = String.raw`\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0`;

/**
 * The text every matcher reads: soft hyphens, zero-width and direction-mark characters (every
 * default-ignorable code point) dropped, every dash and hyphen variant (en/em dash, U+2011
 * non-breaking hyphen, minus sign, …) folded to `-`, every space variant (no-break, narrow
 * no-break, figure, thin, …) folded to a plain space, and runs of spaces collapsed. Line breaks
 * survive (as single `\n`) because the hours matchers treat them as sentence ends. Without this,
 * a wrong phone number typed with non-breaking hyphens, or a banned word with an invisible
 * character in the middle, would sail past patterns written for ASCII.
 */
export function normalizeCopy(text: string): string {
  return text
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[\s]*/g, '\n');
}

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

/** One clock time: `9`, `9:00`, `9.30 am`, `4 PM`, `noon`. Matched on `normalizeCopy()` text
 *  with dotted `a.m.`/`p.m.` already folded to `am`/`pm` (see `foldMeridiem`). */
const TIME = String.raw`(?:noon|midday|midnight|\d{1,2}(?:[:.]\d{2})?(?:\s*[ap]m(?![a-z]))?)`;
const RANGE_SEPARATOR = String.raw`(?:-|\bto\b|\buntil\b|\btill?\b|'til\b|\bthrough\b|\bthru\b)`;

/**
 * `9 AM – 4 PM`, `9:00am to 4:00pm`, `9 until 4 p.m.`, `11 till noon`, … — never starting inside a
 * number ("10:30", "1.5"), but right after a colon or a full stop that ends a word ("Hours:9 AM").
 */
const TIME_RANGE = new RegExp(
  String.raw`(?<!\d[:.]?)(${TIME})\s*${RANGE_SEPARATOR}\s*(${TIME})(?!\d)`,
  'gi',
);
/** "open at 7 AM", "opens from 10:30 am", "opening 8am". */
const OPENS_AT = new RegExp(String.raw`\bopen(?:s|ing)?\s+(?:at\s+|from\s+)?(${TIME})`, 'gi');
/** "close at 2 PM", "closes 3pm", "closing at noon", "open until 2 PM". */
const CLOSES_AT = new RegExp(
  String.raw`\b(?:clos(?:e|es|ing)\s+(?:at\s+)?|open\s+(?:until|till?|'til)\s+)(${TIME})`,
  'gi',
);

/**
 * A day name or abbreviation, plural or not ("Tues", "Thurs.", "Saturdays"). Each spelling has
 * exactly one way to match — the trailing `s?` is the only optional "s" — because the day-list
 * patterns repeat this, and two ways per day would make a failing match on a long list of days
 * backtrack exponentially.
 */
const DAY = String.raw`(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thur|thu|fri|sat)s?\.?(?![a-z])`;
const DAY_WORD = new RegExp(String.raw`\b${DAY}`, 'gi');
const DAY_RANGE = new RegExp(
  String.raw`\b(${DAY})\s*(?:-|\bto\b|\bthrough\b|\bthru\b|\buntil\b|\btill?\b)\s*(${DAY})`,
  'gi',
);
/** Claims of opening every day of the week. "Fresh every day" is about the baking, not hours. */
const EVERY_DAY = [
  /\bopens?\s+(?:daily|every\s*day|all\s+week(?:\s+long)?|(?:7|seven)\s+days)\b/gi,
  /\b(?:7|seven)\s+days\s+a\s+week\b/gi,
  /\b(?:daily|every\s*day)\s*,?\s*(?:from\s+)?(?:noon|\d{1,2}(?:[:.]\d{2})?\s*[ap]m(?![a-z]))/gi,
];
/** The time first — "Open 9am–4pm daily", "9 AM–4 PM every day of the week". It counts only
 *  after an opening word in the same clause (`OPENING_LEAD`), so "we bake from 6am every day"
 *  and "up at 5 a.m. every day, so the bannock is hot when the doors open" stay fine. */
const TIME_THEN_DAILY =
  /(?:noon|\d{1,2}(?:[:.]\d{2})?\s*[ap]m(?![a-z]))\s*,?\s*(?:daily|every\s*day|(?:7|seven)\s+days)\b/gi;
/**
 * An opening word earlier in the same clause — what makes a time "the cafe's" for the readings
 * that need it (`TIME_THEN_DAILY`, a bare closing number): no comma, semicolon or sentence end
 * between the word and the time.
 */
const OPENING_LEAD = /\b(?:(?:re)?open(?:s|ing)?|hours)\b[^,;.!?\n]*$/i;
const OPEN_WEEKENDS = /\bopen\s+(?:on\s+)?(?:the\s+)?weekends?\b/gi;
/** "open", "opens", "opening", "reopen" — not "opened" (history, not hours). */
const OPEN_WORD = /\b(?:re)?open(?:s|ing)?\b/i;
/**
 * Words just before a day that say the cafe is NOT open then — "closed (on) Saturdays",
 * "except (for) Saturday", "other than", "apart from", "never on", "not (open) on", "aren't open",
 * "off on Saturdays" (not "10% off"), "every day but Saturday" — optionally through a list joined
 * by and/&/or ("closed Saturday and Sunday").
 */
const NOT_OPEN_BEFORE = new RegExp(
  String.raw`(?:\b(?:closed|except(?:\s+for)?|excluding|other\s+than|apart\s+from)|(?<![%\d]\s?)\boff|(?:\bnot|\bnever|n['’]t)(?:\s+(?:be\s+)?open)?|\b(?:daily|every\s*day|all\s+week(?:\s+long)?|days\s+a\s+week)\s*,?\s+but(?:\s+not)?)\s+(?:on\s+)?(?:(?:every|any|all|most)\s+)?(?:${DAY}\s*(?:&|\band\b|\bor\b)\s*)*$`,
  'i',
);
/** "off" right after the day — "Saturdays off", "Saturday: off", "Saturday is our day off" —
 *  never "10% off" or "off-season" later in the clause. */
const OFF_AFTER = /^\s*(?:[:-]\s*)?(?:(?:is|are)\s+(?:our|a|the)\s+)?(?:days?\s+)?off\b(?!-)/i;
/** "closed" later in the clause ("Saturday: closed", "Saturdays we're closed"), unless it
 *  belongs to the next day named ("open Saturday and closed Sunday"). */
const CLOSED_AFTER = new RegExp(
  String.raw`^[^,;]*?\bclosed\b(?!\s+(?:on\s+)?(?:(?:every|all|most)\s+)?${DAY})`,
  'i',
);
/** A clock time, on folded text (`foldMeridiem`). */
const CLOCK_TIME = /\d\s*[ap]m(?![a-z])|\b(?:noon|midday|midnight)\b/i;
/**
 * The cafe as the one closing — what makes a day it is open, named closed, a contradiction:
 * "we're closed Sundays", "our day off", "the cafe is closed", a sentence that starts "Closed …",
 * or a schedule line "Sundays: closed". The museum, the ferry or a visitor taking a day off are
 * someone else's hours.
 */
const CAFE_CLOSES = new RegExp(
  String.raw`^\W*(?:closed\b|(?:${DAY}[\s,&-]*(?:(?:and|to|through|thru)\s+)?)+:\s*closed\b)|\b(?:we|we['’]re|us|our|the\s+cafe|native\s+wild\s*flour)\b[^,;]*?\b(?:closed|off)\b`,
  'i',
);
/** A capitalised day abbreviation's period ("Mon." in "Mon. – Sat.") doesn't end a sentence
 *  when what follows continues it: not a capital, or a day / range word. */
const DAY_ABBREVIATION_END = /\b(?:Sun|Mon|Tues?|Weds?|Thur?s?|Fri|Sat|SUN|MON|TUES?|WEDS?|THUR?S?|FRI|SAT)s?\.$/;
const DAY_OR_RANGE_START = new RegExp(String.raw`^(?:${DAY}|(?:through|thru|to|till?|until|and)\b)`, 'i');

function sentencesOf(text: string): string[] {
  const parts = text.split(/((?<=[.!?;·•|])\s+|\n+)/);
  const out: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const piece = parts[index] ?? '';
    const separator = parts[index - 1];
    const previous = out.at(-1);
    if (
      previous !== undefined &&
      separator !== undefined &&
      !separator.includes('\n') &&
      DAY_ABBREVIATION_END.test(previous) &&
      (!/^[A-Z]/.test(piece) || DAY_OR_RANGE_START.test(piece))
    ) {
      out[out.length - 1] = `${previous}${separator}${piece}`;
    } else {
      out.push(piece);
    }
  }
  return out;
}

/** What a bare number right after a time may be counting instead of naming an hour. */
const COUNT_NOUN =
  /^\s*(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|blocks?|miles?|mi\b|km\b|kilomet(?:er|re)s?|feet|ft\b|people|guests|persons?|shuttles?|ships?|bus(?:es)?|cars?|days?|weeks?|months?|years?|times?|more|later|after|before|earlier)\b/i;

/** "between 9 AM and 4 PM" — a range, written the long way. */
const BETWEEN = new RegExp(String.raw`\bbetween\s+(${TIME})\s*(?:and|&)\s*(?=${TIME})`, 'gi');

/**
 * The hours matchers' reading of a text, so one time pattern reads every spelling: curly
 * apostrophes (smart punctuation's "’til") as `'`; `a.m.` / `p.m.` / `a. m.`, attached to the
 * digit or not, as `am` / `pm`; "12 noon" as "noon"; an unambiguous 24-hour time ("17:00") as its
 * 12-hour form; a meridiem run into "to" ("4 PMto") pulled apart; "between X and Y" as "X to Y".
 */
function foldMeridiem(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/(?<![a-z])([ap])\.\s?m\.?(?![a-z])/gi, '$1m')
    .replace(/\b12(?:[:.]00)?\s*(noon|midday|midnight)\b/gi, '$1')
    // (Not where a dash and a number follow: "13:00–16:00" reads right with its first half bare,
    // and "Luke 14:23-24" is no time at all.)
    .replace(
      /(?<![\d:.])(0\d|1[3-9]|2[0-3]):([0-5]\d)(?![\d:])(?!\s*[ap]m(?![a-z]))(?!\s*-\s*\d)/g,
      (_, hour: string, minute: string) =>
        `${Number(hour) % 12 || 12}:${minute} ${Number(hour) >= 12 ? 'pm' : 'am'}`,
    )
    .replace(/(\d\s*[ap]m)(?=(?:to|until|till?|thru|through)(?![a-z]))/gi, '$1 ')
    .replace(BETWEEN, '$1 to ');
}

interface ClockTime {
  readonly hour: number;
  readonly minute: string;
  /** `am`/`pm`, or null for a bare number. */
  readonly suffix: 'am' | 'pm' | null;
}

function parseTime(token: string): ClockTime {
  const lower = token.toLowerCase();
  if (lower === 'noon' || lower === 'midday') return { hour: 12, minute: '00', suffix: 'pm' };
  if (lower === 'midnight') return { hour: 12, minute: '00', suffix: 'am' };
  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap]m)?$/i.exec(lower.trim());
  return {
    hour: Number(match?.[1] ?? 0),
    minute: match?.[2] ?? '00',
    suffix: (match?.[3]?.toLowerCase() as 'am' | 'pm' | undefined) ?? null,
  };
}

function clock(time: ClockTime, suffix: 'am' | 'pm'): string {
  return to24Hour(String(time.hour), time.minute, suffix);
}

/** One opening-hours range found in copy, already converted to 24-hour `HH:MM`. */
export interface HoursRange {
  readonly found: string;
  readonly opens: string;
  readonly closes: string;
  readonly index: number;
}

/**
 * Every opening-hours range in `text`: either side may be dotted (`9 a.m.`), carry minutes
 * (`9:00`, `9.30`), be `noon`, and the two may be joined by a dash, "to", "until", "till" or
 * "through". One side must carry am/pm (or be noon/midnight) — "5–8 minutes" is not a range of
 * hours. In an opening clause a bare closing number takes the half of the day that follows the
 * opening time ("Open 9am until 5" is 5 PM); a bare opening number takes the closing time's half
 * unless that would put it after the close ("9–4 PM" is 9 AM).
 */
export function findHoursRanges(text: string): HoursRange[] {
  const folded = foldMeridiem(normalizeCopy(text));
  const ranges: HoursRange[] = [];
  for (const match of folded.matchAll(TIME_RANGE)) {
    const first = parseTime(match[1] ?? '');
    const second = parseTime(match[2] ?? '');
    // A bare closing number takes the opening time's half of the day only in an opening clause
    // ("Open 9am until 5", "Hours: 9am until 5" — not "the shuttle runs from 7am to 9"), and only
    // when nothing after it says it counts something else ("open at 9 AM - 5 minutes after …").
    const start = match.index ?? 0;
    const end = start + (match[0] ?? '').length;
    const inferable =
      OPENING_LEAD.test(folded.slice(0, start)) && !COUNT_NOUN.test(folded.slice(end));
    const closing =
      second.suffix ??
      (first.suffix === null || !inferable
        ? null
        : first.hour % 12 <= second.hour % 12
          ? first.suffix
          : first.suffix === 'am'
            ? 'pm'
            : 'am');
    if (closing === null) continue;
    const firstSuffix =
      first.suffix ??
      (first.hour % 12 <= second.hour % 12 ? closing : closing === 'pm' ? 'am' : 'pm');
    ranges.push({
      found: match[0] ?? '',
      opens: clock(first, firstSuffix),
      closes: clock(second, closing),
      index: match.index ?? 0,
    });
  }
  return ranges;
}

function dayIndex(word: string): number | null {
  // Abbreviations count only when capitalised: "Sat" is a day, "sat" is a verb.
  const lower = word.toLowerCase().replace(/\.$/, '');
  const full = WEEK.some((day) => lower.startsWith(day.toLowerCase()));
  if (!full && !/^[A-Z]/.test(word)) return null;
  const index = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'].indexOf(lower.slice(0, 2));
  return index < 0 ? null : index;
}

/** Days `from` through `to`, wrapping the week ("Fri–Sun" is Friday, Saturday, Sunday). */
function daySpan(from: number, to: number): number[] {
  const days = [from];
  for (let day = from; day !== to; ) {
    day = (day + 1) % 7;
    days.push(day);
  }
  return days;
}

/** One statement in copy that contradicts the real opening hours or open days. */
export interface HoursProblem {
  readonly found: string;
  /** `range`/`time`: a clock time; `days`: open on a closed day; `every-day`: open-daily claim. */
  readonly kind: 'range' | 'time' | 'days' | 'every-day';
}

/**
 * Every statement in `text` that contradicts the injected hours: a time range other than the
 * real one, an opening or closing time that doesn't match, a day range that takes in a closed
 * day (or, beside a time, leaves out an open one), a closed day named as open, and "open daily"
 * style claims when the cafe is closed one day a week. Only sentences that talk about opening —
 * "open", a time, a time range — are read for days, so "the shuttle runs Monday–Saturday" or
 * "fresh every day" stay fine.
 */
export function findHoursProblems(text: string, checks: RuleChecks): HoursProblem[] {
  const problems: HoursProblem[] = [];
  const folded = foldMeridiem(normalizeCopy(text));

  const ranges = findHoursRanges(folded);
  for (const range of ranges) {
    if (range.opens !== checks.opens || range.closes !== checks.closes) {
      problems.push({ found: range.found, kind: 'range' });
    }
  }
  const insideRange = (index: number) =>
    ranges.some((range) => index >= range.index && index < range.index + range.found.length);
  const singleTimes: [RegExp, string][] = [
    [OPENS_AT, checks.opens],
    [CLOSES_AT, checks.closes],
  ];
  for (const [pattern, expected] of singleTimes) {
    for (const match of folded.matchAll(pattern)) {
      const time = parseTime(match[1] ?? '');
      const at = (match.index ?? 0) + (match[0] ?? '').length - (match[1] ?? '').length;
      if (time.suffix === null || insideRange(at)) continue;
      if (clock(time, time.suffix) !== expected) problems.push({ found: match[0] ?? '', kind: 'time' });
    }
  }

  const allWeek = checks.openDays.size === 7;
  const closedDays = WEEK.map((_, day) => day).filter((day) => !checks.openDays.has(day));
  // A range beside a time that leaves out an open day is reported only if the text as a
  // whole never gives that day its hours ("Sunday 9am–4pm. Monday–Friday 9am–4pm." is the week).
  const partialRuns: HoursProblem[] = [];
  const daysWithHours = new Set<number>();
  for (const sentence of sentencesOf(folded)) {
    const hasTime = findHoursRanges(sentence).length > 0;
    // A day the cafe is open, named closed, only contradicts the hours when the cafe is the one
    // closing — not the museum or the ferry.
    const cafeCloses = CAFE_CLOSES.test(sentence);
    const aboutOpening =
      OPEN_WORD.test(sentence) || /\bclosed\b/i.test(sentence) || hasTime || /\d\s*[ap]m(?![a-z])/i.test(sentence);
    // A clock time after the day ends the day's clause whatever the punctuation says — the period
    // after "4 p.m." is folded away — so "Open Saturday 9am–4pm. Closed on holidays." is not read
    // as Saturday closed.
    const notOpen = (start: number, end: number) => {
      const after = sentence.slice(end);
      return (
        NOT_OPEN_BEFORE.test(sentence.slice(0, start)) ||
        OFF_AFTER.test(after) ||
        CLOSED_AFTER.test(after.split(CLOCK_TIME)[0] ?? '')
      );
    };

    const dayProblems: HoursProblem[] = [];
    const namedClosed = new Set<number>();
    const covered: [number, number][] = [];
    for (const match of sentence.matchAll(DAY_RANGE)) {
      const from = dayIndex(match[1] ?? '');
      const to = dayIndex(match[2] ?? '');
      // One day "to" itself is no range ("Closed Saturday – Saturdays we open…"): both day
      // names are left to the single-day check below.
      if (from === null || to === null || from === to) continue;
      const start = match.index ?? 0;
      const end = start + (match[0] ?? '').length;
      covered.push([start, end]);
      const span = daySpan(from, to);
      if (notOpen(start, end)) {
        // "Closed Monday–Tuesday" names open days closed.
        for (const day of span) namedClosed.add(day);
        if (cafeCloses && span.some((day) => checks.openDays.has(day))) {
          dayProblems.push({ found: match[0] ?? '', kind: 'days' });
        }
        continue;
      }
      const takesClosedDay = span.some((day) => !checks.openDays.has(day));
      // Beside a time, a range must be a whole run of open days: every day in it open, and the
      // days either side of it closed. That accepts each run of a split week ("Sunday–Tuesday …
      // Closed Wednesday. Thursday–Friday …") and refuses one that drops an open day.
      const wholeRun =
        span.length === 7 ||
        (!takesClosedDay &&
          !checks.openDays.has((from + 6) % 7) &&
          !checks.openDays.has((to + 1) % 7));
      if (takesClosedDay) dayProblems.push({ found: match[0] ?? '', kind: 'days' });
      else if (hasTime) {
        for (const day of span) daysWithHours.add(day);
        if (!wholeRun) partialRuns.push({ found: match[0] ?? '', kind: 'days' });
      }
    }
    for (const match of sentence.matchAll(DAY_WORD)) {
      const start = match.index ?? 0;
      if (covered.some(([from, to]) => start >= from && start < to)) continue;
      const day = dayIndex(match[0] ?? '');
      if (day === null) continue;
      const closed = notOpen(start, start + (match[0] ?? '').length);
      if (closed) namedClosed.add(day);
      // An open day the cafe names closed contradicts the hours as much as a closed day named open.
      const open = checks.openDays.has(day);
      if (open ? closed && cafeCloses : !closed) dayProblems.push({ found: match[0] ?? '', kind: 'days' });
      else if (hasTime && !closed) daysWithHours.add(day);
    }
    if (aboutOpening) problems.push(...dayProblems);

    // "open daily except Saturdays" / "open every day (closed Saturdays)" is not an every-day
    // claim — the sentence itself names every closed day as closed.
    if (!allWeek && !closedDays.every((day) => namedClosed.has(day))) {
      // "Open 7 days a week" matches two of the patterns; report the claim once.
      const claimed: [number, number][] = [];
      for (const pattern of [...EVERY_DAY, TIME_THEN_DAILY]) {
        for (const match of sentence.matchAll(pattern)) {
          const start = match.index ?? 0;
          if (pattern === TIME_THEN_DAILY && !OPENING_LEAD.test(sentence.slice(0, start))) continue;
          const end = start + (match[0] ?? '').length;
          if (claimed.some(([from, to]) => start < to && end > from)) continue;
          claimed.push([start, end]);
          problems.push({ found: match[0] ?? '', kind: 'every-day' });
        }
      }
    }
    if (!checks.openDays.has(0) || !checks.openDays.has(6)) {
      for (const match of sentence.matchAll(OPEN_WEEKENDS)) problems.push({ found: match[0] ?? '', kind: 'days' });
    }
  }
  if (![...checks.openDays].every((day) => daysWithHours.has(day))) problems.push(...partialRuns);
  return problems;
}

/** `9:00 AM` / `4 PM` -> 24-hour `HH:MM`. */
export function to24Hour(hour: string, minute: string | undefined, suffix: string): string {
  const base = Number(hour) % 12;
  const hours = /p\.?\s?m/i.test(suffix) ? base + 12 : base;
  return `${String(hours).padStart(2, '0')}:${(minute ?? '00').padStart(2, '0')}`;
}

/** 24-hour `HH:MM` -> `9:00 AM`, for owner-facing messages about the expected range. */
export function to12Hour(time: string): string {
  const [hourText = '0', minuteText = '00'] = time.split(':');
  const hours = Number(hourText);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const base = hours % 12 === 0 ? 12 : hours % 12;
  return `${base}:${minuteText} ${suffix}`;
}

/**
 * The hours token. Owner text in a field that accepts it (the spec marks those with
 * `hoursToken: true` — the directions FAQ answers) may write `{hours}`, and the page, its
 * structured data and the editor preview print the current `HOURS_SUMMARY` in its place. A
 * change to the opening hours in `src/data/business.ts` then reaches that text with the next
 * deploy, instead of leaving a stored answer saying the old hours.
 */
export const HOURS_TOKEN = '{hours}';

/**
 * A token's pattern: the word in braces, any case, spaces allowed inside the braces — and the
 * invisible characters a paste can carry (`INVISIBLE`, the Basic Multilingual Plane's) allowed
 * anywhere in it, so a token the validator reads (on `normalizeCopy` text) is one the page
 * expands (on the raw text).
 */
function tokenPattern(word: string): RegExp {
  const pad = `[\\s${INVISIBLE}]*`;
  return new RegExp(`\\{${pad}${[...word].join(`[${INVISIBLE}]*`)}${pad}\\}`, 'gi');
}

const HOURS_TOKEN_PATTERN = tokenPattern('hours');

/**
 * Where a token's printed text starts, in the hours matchers' reading of a field (`scanText`): a
 * control character no copy contains, which no day or range pattern crosses.
 */
const TOKEN_START = String.fromCharCode(1);

/**
 * The season token, the same idea for `SEASON_NOTE`: fields marked `seasonToken: true` (the
 * about page's "Made in Skagway" card text) may write `{season}`, and the page and the editor
 * preview print the note from `src/data/business.ts` in its place.
 */
export const SEASON_TOKEN = '{season}';
const SEASON_TOKEN_PATTERN = tokenPattern('season');

const ANY_TOKEN = /\{\s*[A-Za-z_][\w ]*\}/g;

/** One fill-in token: how it is spelled, where the site fills it in, and what it stands for. */
interface ContentToken {
  readonly token: string;
  /** Global — build a fresh `RegExp(pattern.source, 'i')` before calling `test`. */
  readonly pattern: RegExp;
  /** For the "only filled in inside …" message. */
  readonly where: string;
  /** For "… or leave the hours out". */
  readonly subject: string;
}

const HOURS: ContentToken = {
  token: HOURS_TOKEN,
  pattern: HOURS_TOKEN_PATTERN,
  where: "the directions page's FAQ answers",
  subject: 'the hours',
};
const SEASON: ContentToken = {
  token: SEASON_TOKEN,
  pattern: SEASON_TOKEN_PATTERN,
  where: "the about page's Made in Skagway cards",
  subject: 'the season note',
};

/** Every token the site knows — the gate fails a page that renders one unexpanded. */
export const CONTENT_TOKENS: readonly ContentToken[] = [HOURS, SEASON];

/** `text` with every `{hours}` replaced by `summary`. Callers pass `HOURS_SUMMARY`. */
export function expandHoursToken(text: string, summary: string): string {
  return text.replace(HOURS_TOKEN_PATTERN, summary);
}

/** `text` with every `{season}` replaced by `note`. Callers pass `SEASON_NOTE`. */
export function expandSeasonToken(text: string, note: string): string {
  return text.replace(SEASON_TOKEN_PATTERN, note);
}

/**
 * Wrong brand casing: any standalone brand token whose casing is not exactly `WILDFlour`.
 * Word boundaries keep the run-together domain spelling exempt. Also catches the name split
 * in two words, with or without "Native" (both capitals required when it stands alone);
 * the lowercase two-word phrase is ordinary English and passes.
 */
export const WRONG_CASING =
  /\b(?!WILDFlour\b)[Ww][Ii][Ll][Dd][Ff][Ll][Oo][Uu][Rr]\b|\b[Nn][Aa][Tt][Ii][Vv][Ee][\s-]+[Ww][Ii][Ll][Dd][\s-]+[Ff][Ll][Oo][Uu][Rr]\b|\bW[Ii][Ll][Dd][\s-]+F[Ll][Oo][Uu][Rr]\b/;

/**
 * Currency amounts — symbols and units, either side of the number ("$5", "$.50", "5$", "5-dollar",
 * "USD 5"). No prices are known, so none may be printed. A number is only read from its first
 * digit (never from inside "1,000"), which also keeps the scan linear on long runs of digits.
 */
export const PRICE_CURRENCY =
  /[$€£¢]\s*\.?\d[\d,]*(?:\.\d+)?|\b(?<!\d,)\d+(?:,\d+)*(?:\.\d+)?\s*-?\s*(?:[$€£¢]|USD\b|dollars?\b|bucks?\b|cents?\b)|\bUSD\s*\d/i;

/** Prices in words: "five dollars", "a buck", "a couple of bucks", "ten-dollar", "sixty cents". */
export const PRICE_WORDS =
  /\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|(?:thir|four|fif|six|seven|eigh|nine)teen|(?:twen|thir|for|fif|six|seven|eigh|nine)ty|hundred|thousand|few|couple(?:\s+of)?|half\s+a)[\s-]+(?:dollars?|bucks?|cents?)\b/i;

/**
 * Bare two-decimal numbers read as prices too — unless a whole unit word says what they measure
 * ("0.25 miles", "1.50 hours", "2.50 lbs"). A unit must end at a word boundary and never be the
 * start of a food ("pound cake", "cupcake", "footlong"); a lone letter ("M", "L") is a size, not a
 * unit.
 */
export const PRICE_DECIMAL =
  /\b\d+\.\d{2}\b(?!\s*(?:%|percent|mi\b|miles?\b|km\b|kilomet(?:er|re)s?\b|meters?\b|metres?\b|ft\b|feet\b|foot\b(?![\s-]*longs?\b)|inch(?:es)?\b|lbs?\b|pounds?\b(?![\s-]*cakes?\b)|oz\b|ounces?\b|kg\b|g\b|grams?\b|hours?\b|hrs?\b|minutes?\b|mins?\b|[ap]\.?\s?m\b|acres?\b|cups?\b(?![\s-]*cakes?\b)|lit(?:er|re)s?\b|gal(?:lons?)?\b))/i;

/**
 * Any 907-612 phone rendering, taking in a digit run on either side ("907-612-00020",
 * "5907-612-0002") so a mistyped number can never pass as the right one; only the exact
 * `907-612-0002` spelling is allowed. The "1" of a leading "+1" is not part of the number.
 */
export const PHONE_LIKE = /(?:(?<!\+)\d)?\(?907\)?\s*[.-]?\s*612\s*[.-]?\s*\d+/g;
const PHONE_ALLOWED = '907-612-0002';

/** Ids render as URL anchors and React keys, so they must be kebab-case slugs. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isBlank(text: string): boolean {
  return text.trim() === '';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Human-readable description of a wrong value for structural error messages. */
export function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object' && value !== null) return 'an object';
  return JSON.stringify(value);
}

/** Every banned-vocabulary hit in `text` (normalized first). The gate reads this too. */
export function findForbidden(
  text: string,
  checks: RuleChecks,
): { readonly word: string; readonly found: string }[] {
  const normalized = normalizeCopy(text);
  const hits: { word: string; found: string }[] = [];
  for (const { word, pattern } of checks.forbidden) {
    const match = normalized.match(pattern);
    if (match) hits.push({ word, found: match[0] ?? word });
  }
  return hits;
}

/** Options for one field's scan, from its spec. */
export interface ScanOptions {
  /** The field fills in `{hours}` (see `HOURS_TOKEN`); elsewhere the token would print as-is. */
  readonly hoursToken?: boolean;
  /**
   * What the page prints in place of `{hours}` — callers pass `HOURS_SUMMARY`, so the words around
   * the token are judged exactly as a visitor reads them. Absent, the rules' own description of
   * the week stands in.
   */
  readonly hoursSummary?: string;
  /**
   * The field fills in `{season}` (see `SEASON_TOKEN`) with this text — callers pass
   * `SEASON_NOTE`. Absent, the token would print as-is. It is also what a hand-typed copy is
   * compared against for the "type {season} instead" steer.
   */
  readonly seasonNote?: string;
}

/** Normalized, whitespace-collapsed, trimmed and lowercased — for "is this the same sentence". */
function foldForCompare(text: string): string {
  return normalizeCopy(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

function hoursMessage(problem: HoursProblem, checks: RuleChecks, options: ScanOptions): string {
  const what =
    problem.kind === 'every-day'
      ? `"${problem.found}" says the cafe opens every day, but it's open ${checks.hoursDisplay}.`
      : problem.kind === 'days'
        ? `"${problem.found}" doesn't match the days the cafe is open (${checks.hoursDisplay}).`
        : `"${problem.found}" doesn't match the cafe's opening hours (${checks.hoursDisplay}).`;
  return options.hoursToken
    ? `${what} Type ${HOURS_TOKEN} instead and the site fills in the current hours for you.`
    : `${what} The real hours are printed for you at the foot of every page — please correct them here or leave them out.`;
}

/**
 * Copy scan for one text field: banned vocabulary, opening hours and days that contradict the
 * real ones, and placeholder markers (only when rules were injected), plus brand casing,
 * price-like strings, phone numbers other than the one real one, the `{hours}` and `{season}`
 * tokens in a field that can't fill them in, and either one typed out by hand where it can. Messages are owner-facing — plain and kind.
 */
export function scanText(
  text: string,
  path: string,
  issues: CopyIssue[],
  rules: RuleChecks | null,
  options: ScanOptions = {},
): void {
  const normalized = normalizeCopy(text);

  // The tokens themselves: in a field that fills one in, other `{…}` words are typos; a known
  // token in a field that doesn't fill it in would print literally. Rules-independent, so the
  // offline editor catches it too.
  const { seasonNote } = options;
  const allowed: ContentToken[] = [];
  if (options.hoursToken) allowed.push(HOURS);
  if (seasonNote !== undefined) allowed.push(SEASON);
  const tokens = normalized.match(ANY_TOKEN) ?? [];
  for (const token of tokens) {
    const known = CONTENT_TOKENS.find((entry) => new RegExp(entry.pattern.source, 'i').test(token));
    if (known !== undefined && allowed.includes(known)) continue;
    if (known !== undefined) {
      issues.push({
        path,
        message: `${known.token} is only filled in inside ${known.where} — here it would print as-is. Please write the words out, or leave ${known.subject} out.`,
      });
    } else if (allowed.length === 0) {
      issues.push({
        path,
        message: `"${token}" would print on the page exactly like that — please remove the curly brackets.`,
      });
    } else {
      issues.push({
        path,
        message: `"${token}" isn't something the site can fill in — the only one it knows is ${allowed.map((entry) => entry.token).join(' or ')}.`,
      });
    }
  }
  // A token expands to copy the site vouches for (the real hours, the season note), so it is
  // never a contradiction.
  let scanned = options.hoursToken ? normalized.replace(HOURS_TOKEN_PATTERN, ' ') : normalized;
  if (seasonNote !== undefined) scanned = scanned.replace(SEASON_TOKEN_PATTERN, ' ');
  // For the hours claims, read each token as exactly what it prints — no padding, so the sentence
  // breaks fall where the visitor sees them — and judge the words around it in that context
  // ("Saturday: {hours}" reads as Saturday hours).
  // Each printed text starts after `TOKEN_START`, so a day range never runs from the owner's
  // words into it ("Closed Saturdays - {hours}" is not "Saturdays - Sunday").
  const hoursPrinted = options.hoursSummary ?? rules?.hoursDisplay;
  let asRendered = options.hoursToken
    ? normalized.replace(HOURS_TOKEN_PATTERN, () =>
        hoursPrinted === undefined ? ' ' : `${TOKEN_START}${normalizeCopy(hoursPrinted)}`,
      )
    : normalized;
  if (seasonNote !== undefined) {
    asRendered = asRendered.replace(SEASON_TOKEN_PATTERN, () => `${TOKEN_START}${normalizeCopy(seasonNote)}`);
  }

  // Each token prints whole sentences, full stop included, so it has to end the sentence it sits
  // in: "Stop in {hours} on your way" would print "… Closed Saturday. on your way". A house-style
  // steer — it blocks a publish, never a restore.
  for (const entry of allowed) {
    const printed = entry === HOURS ? hoursPrinted : seasonNote;
    for (const match of normalized.matchAll(entry.pattern)) {
      const after = normalized.slice((match.index ?? 0) + match[0].length);
      if (/^\s*[a-z.,;:!?-]/.test(after)) {
        issues.push({
          path,
          advisory: true,
          message: `${entry.token} prints whole sentences${printed === undefined ? '' : ` ("${printed}")`}, so the words after it would run on past its full stop. Put ${entry.token} last in its sentence, with no full stop of your own after it, and start what follows as a new sentence.`,
        });
        break;
      }
    }
  }

  // Where the season token works, the note typed out by hand is a frozen copy that won't follow
  // a change to SEASON_NOTE — steer it to the token, like the hand-typed hours below.
  if (seasonNote !== undefined && foldForCompare(scanned).includes(foldForCompare(seasonNote))) {
    issues.push({
      path,
      advisory: true,
      message: `This repeats the site's season note word for word. Type ${SEASON_TOKEN} instead — the site fills in the current note, so this card stays right if it ever changes.`,
    });
  }

  if (rules !== null) {
    for (const { word, found } of findForbidden(scanned, rules)) {
      issues.push({
        path,
        message: `The wording "${found || word}" can't appear on the site — it's on the do-not-use list. Please say it another way.`,
      });
    }

    for (const problem of findHoursProblems(asRendered, rules)) {
      issues.push({ path, message: hoursMessage(problem, rules, options) });
    }
    // Where the token works, a correct range typed out by hand is the stale answer of the next
    // hours change waiting to happen — steer it to the token.
    if (options.hoursToken) {
      for (const range of findHoursRanges(scanned)) {
        if (range.opens === rules.opens && range.closes === rules.closes) {
          issues.push({
            path,
            advisory: true,
            message: `"${range.found}" spells the opening hours out by hand. Type ${HOURS_TOKEN} instead — the site fills in the current hours, so this answer stays right if they ever change.`,
          });
        }
      }
    }

    // Same substring semantics as the gate's placeholder scan: case-sensitive `includes`.
    for (const marker of rules.placeholders) {
      if (text.includes(marker)) {
        issues.push({
          path,
          message: `This text contains "${marker}", which reads like an editing glitch — please rewrite it without that bit.`,
        });
      }
    }
  }

  const casing = scanned.match(WRONG_CASING);
  if (casing) {
    issues.push({
      path,
      message: `The name is always written "${BRAND}" — capital WILD, capital F. Found "${casing[0] ?? ''}".`,
    });
  }

  const price =
    scanned.match(PRICE_CURRENCY) ?? scanned.match(PRICE_WORDS) ?? scanned.match(PRICE_DECIMAL);
  if (price) {
    issues.push({
      path,
      message: `"${price[0] ?? ''}" looks like a price. Prices are never printed on the site — they're posted at the counter.`,
    });
  }

  for (const match of scanned.matchAll(PHONE_LIKE)) {
    const found = match[0] ?? '';
    if (found !== PHONE_ALLOWED) {
      issues.push({
        path,
        message: `"${found}" looks like a phone number that isn't the cafe's. The only number the site may show is ${PHONE_DISPLAY}.`,
      });
    }
  }
}

/**
 * The scan for an id (a section or dock slug). Ids only ever reach the page as attribute values
 * — anchors and DOM ids — so the copy rules about how words *read* (brand casing, prices, hours)
 * don't apply; a section named after the cafe gets an id that spells the name in lowercase, which
 * is how every slug is made. Banned vocabulary and placeholder markers still can't appear,
 * because the gate scans attribute values for both.
 */
export function scanId(text: string, path: string, issues: CopyIssue[], rules: RuleChecks | null): void {
  // A wrong number would reach the page's markup through the id (the gate's payload scan reads
  // the digits the same way): rules-independent, like the phone check in `scanText`.
  for (const match of text.matchAll(PHONE_LIKE)) {
    const found = match[0] ?? '';
    const digits = found.replace(/\D/g, '');
    if (digits !== '9076120002' && digits !== '19076120002') {
      issues.push({
        path,
        message: `This id contains "${found}", which looks like a phone number that isn't the cafe's — please pick another id.`,
      });
    }
  }
  if (rules === null) return;
  for (const { word, found } of findForbidden(text, rules)) {
    issues.push({
      path,
      message: `The wording "${found || word}" can't appear on the site, even in a link id — please pick another id.`,
    });
  }
  for (const marker of rules.placeholders) {
    if (text.includes(marker)) {
      issues.push({ path, message: `This id contains "${marker}" — please pick another id.` });
    }
  }
}

/**
 * Kebab-case slug for new ids: ASCII lowercase, `&` becomes "and", apostrophes drop, accents
 * fold, every other run of non-alphanumerics collapses to one hyphen. Falls back to "section"
 * when nothing survives, so the result always passes the structural id check.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[‘’']/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'section' : slug;
}
