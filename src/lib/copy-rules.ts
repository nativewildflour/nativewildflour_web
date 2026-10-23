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
 * The text every matcher reads: soft hyphens and zero-width characters dropped, every dash and
 * hyphen variant (en/em dash, U+2011 non-breaking hyphen, minus sign, …) folded to `-`, every
 * space variant (no-break, narrow no-break, figure, thin, …) folded to a plain space, and runs
 * of spaces collapsed. Line breaks survive (as single `\n`) because the hours matchers treat
 * them as sentence ends. Without this, a wrong phone number typed with non-breaking hyphens, or a banned word
 * with an invisible character in the middle, would sail past patterns written for ASCII.
 */
export function normalizeCopy(text: string): string {
  return text
    .replace(/[\u00AD\u180E\u200B-\u200D\u2060\uFEFF]/g, '')
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

/** `9 AM – 4 PM`, `9:00am to 4:00pm`, `9 until 4 p.m.`, `11 till noon`, … */
const TIME_RANGE = new RegExp(
  String.raw`(?<![\d:.])(${TIME})\s*${RANGE_SEPARATOR}\s*(${TIME})(?!\d)`,
  'gi',
);
/** "open at 7 AM", "opens from 10:30 am", "opening 8am". */
const OPENS_AT = new RegExp(String.raw`\bopen(?:s|ing)?\s+(?:at\s+|from\s+)?(${TIME})`, 'gi');
/** "close at 2 PM", "closes 3pm", "closing at noon", "open until 2 PM". */
const CLOSES_AT = new RegExp(
  String.raw`\b(?:clos(?:e|es|ing)\s+(?:at\s+)?|open\s+(?:until|till?|'til)\s+)(${TIME})`,
  'gi',
);

const DAY = String.raw`(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|weds?|thur?s?|fri|sat)s?\.?(?![a-z])`;
const DAY_WORD = new RegExp(String.raw`\b${DAY}`, 'gi');
const DAY_RANGE = new RegExp(
  String.raw`\b(${DAY})\s*(?:-|\bto\b|\bthrough\b|\bthru\b|\buntil\b|\btill?\b)\s*(${DAY})`,
  'gi',
);
/** Claims of opening every day of the week. "Fresh every day" is about the baking, not hours. */
const EVERY_DAY = [
  /\bopen\s+(?:daily|every\s*day|all\s+week(?:\s+long)?|(?:7|seven)\s+days)\b/gi,
  /\b(?:7|seven)\s+days\s+a\s+week\b/gi,
  /\b(?:daily|every\s*day)\s*,?\s*(?:from\s+)?(?:noon|\d{1,2}(?:[:.]\d{2})?\s*[ap]m(?![a-z]))/gi,
];
const OPEN_WEEKENDS = /\bopen\s+(?:on\s+)?(?:the\s+)?weekends?\b/gi;

/** `a.m.` / `p.m.` / `a. m.` -> `am` / `pm`, so one time pattern reads every spelling. */
function foldMeridiem(text: string): string {
  return text.replace(/\b([ap])\.\s?m\.?(?![a-z])/gi, '$1m');
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
 * "through". The closing time must carry am/pm (or be noon/midnight) — "5–8 minutes" is not a
 * range of hours; a bare opening number takes the closing time's half of the day unless that
 * would put it after the close ("9–4 PM" is 9 AM).
 */
export function findHoursRanges(text: string): HoursRange[] {
  const folded = foldMeridiem(normalizeCopy(text));
  const ranges: HoursRange[] = [];
  for (const match of folded.matchAll(TIME_RANGE)) {
    const first = parseTime(match[1] ?? '');
    const second = parseTime(match[2] ?? '');
    if (second.suffix === null) continue;
    const firstSuffix =
      first.suffix ??
      (first.hour % 12 <= second.hour % 12 ? second.suffix : second.suffix === 'pm' ? 'am' : 'pm');
    ranges.push({
      found: match[0] ?? '',
      opens: clock(first, firstSuffix),
      closes: clock(second, second.suffix),
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
  for (const sentence of folded.split(/(?<=[.!?;·•|])\s+|\n+/)) {
    const aboutOpening =
      /\bopen\b/i.test(sentence) || findHoursRanges(sentence).length > 0 || /\d\s*[ap]m(?![a-z])/i.test(sentence);
    const hasTime = findHoursRanges(sentence).length > 0;

    if (!allWeek) {
      // "Open 7 days a week" matches two of the patterns; report the claim once.
      const claimed: [number, number][] = [];
      for (const pattern of EVERY_DAY) {
        for (const match of sentence.matchAll(pattern)) {
          const start = match.index ?? 0;
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
    if (!aboutOpening) continue;

    const covered: [number, number][] = [];
    for (const match of sentence.matchAll(DAY_RANGE)) {
      const from = dayIndex(match[1] ?? '');
      const to = dayIndex(match[2] ?? '');
      if (from === null || to === null) continue;
      const start = match.index ?? 0;
      covered.push([start, start + (match[0] ?? '').length]);
      if (/\bclosed\s+(?:on\s+)?$/i.test(sentence.slice(0, start))) continue;
      const span = daySpan(from, to);
      const takesClosedDay = span.some((day) => !checks.openDays.has(day));
      // Beside a time, a range must be a whole run of open days: every day in it open, and the
      // days either side of it closed. That accepts each run of a split week ("Sunday–Tuesday …
      // Closed Wednesday. Thursday–Friday …") and refuses one that drops an open day.
      const wholeRun =
        span.length === 7 ||
        (!takesClosedDay &&
          !checks.openDays.has((from + 6) % 7) &&
          !checks.openDays.has((to + 1) % 7));
      const leavesOutOpenDay = hasTime && !wholeRun;
      if (takesClosedDay || leavesOutOpenDay) problems.push({ found: match[0] ?? '', kind: 'days' });
    }
    for (const match of sentence.matchAll(DAY_WORD)) {
      const start = match.index ?? 0;
      if (covered.some(([from, to]) => start >= from && start < to)) continue;
      const day = dayIndex(match[0] ?? '');
      if (day === null || checks.openDays.has(day)) continue;
      const before = sentence.slice(0, start);
      const after = sentence.slice(start + (match[0] ?? '').length);
      const markedClosed =
        /\bclosed\s+(?:on\s+)?(?:(?:every|all|most)\s+)?$/i.test(before) ||
        /^[^,;]*\b(?:closed|off)\b/i.test(after);
      if (!markedClosed) problems.push({ found: match[0] ?? '', kind: 'days' });
    }
  }
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
const HOURS_TOKEN_PATTERN = /\{\s*hours\s*\}/gi;

/**
 * The season token, the same idea for `SEASON_NOTE`: fields marked `seasonToken: true` (the
 * about page's "Made in Skagway" card text) may write `{season}`, and the page and the editor
 * preview print the note from `src/data/business.ts` in its place.
 */
export const SEASON_TOKEN = '{season}';
const SEASON_TOKEN_PATTERN = /\{\s*season\s*\}/gi;

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

/** Currency amounts — symbols and units. No prices are known, so none may be printed. */
export const PRICE_CURRENCY =
  /[$€£¢]\s*\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*(?:¢|USD\b|dollars?\b|bucks?\b|cents?\b)/i;

/** Prices in words: "five dollars", "a buck", "a couple of bucks", "ten-dollar". */
export const PRICE_WORDS =
  /\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|few|couple(?:\s+of)?|half\s+a)[\s-]+(?:dollars?|bucks?|cents?)\b/i;

/**
 * Bare two-decimal numbers read as prices too — unless a unit says what they measure
 * ("0.25 miles", "1.50 hours", "2.50 lbs").
 */
export const PRICE_DECIMAL =
  /\b\d{1,3}\.\d{2}\b(?!\s*(?:%|percent|mi\b|miles?|km\b|kilomet|m\b|meters?|metres?|ft\b|feet|foot|in\b|inch|lbs?\b|pounds?|oz\b|ounces?|kg\b|g\b|grams?|hours?|hrs?\b|minutes?|mins?\b|[ap]\.?\s?m\b|acres?|cups?|lit(?:er|re)s?|l\b|gal))/i;

/** Any 907-612 phone rendering; only the exact `907-612-0002` spelling is allowed. */
export const PHONE_LIKE = /\(?907\)?\s*[.-]?\s*612\s*[.-]?\s*\d{4}/g;
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
  // For the hours claims, read each token as what it prints, so the words around it are judged in
  // context ("Saturday: {hours}" reads as Saturday hours).
  let asRendered =
    options.hoursToken && rules !== null
      ? normalized.replace(HOURS_TOKEN_PATTERN, ` ${rules.hoursDisplay} `)
      : options.hoursToken
        ? normalized.replace(HOURS_TOKEN_PATTERN, ' ')
        : normalized;
  if (seasonNote !== undefined) {
    asRendered = asRendered.replace(SEASON_TOKEN_PATTERN, ` ${normalizeCopy(seasonNote)} `);
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
