/**
 * The copy-rule engine shared by every owner-editable document (docs/BRIEF.md §2).
 *
 * It was extracted from `menu-content.ts` when the menu stopped being the only editable
 * document: the menu validator, the schema-driven validator in `content-schema.ts`, and the
 * acceptance gate must all apply the *same* checks, and the only way to guarantee that is one
 * implementation. The publish endpoint is the last gate the owner's words pass: the pages read
 * the saved document at request time, so anything this engine lets through is on the site the
 * moment it is published, with no build left to catch it.
 *
 * Like `menu-content.ts`, this runs in three places — the rendering server, the admin editor's
 * client bundle, and the Netlify Functions — so it stays dependency-free, browser-safe, free of
 * Node APIs, and imports NO JSON.
 *
 * NOTE ON VOCABULARY: BRIEF §2 bans a list of words from the site. This module enforces the ban
 * but never spells the words out — and it deliberately imports no JSON, `content-rules.json`
 * included. Anything the admin client imports is inlined into the public chunks under
 * `_next/`, and the rules hold strings (the wrong third-party phone number among them) that
 * may never ship. So the rules are injected instead: the Netlify Functions and the acceptance
 * gate import the JSON server-side, while the editor fetches it at runtime from the auth-gated
 * `/admin/api/rules` endpoint and passes fetched-or-null. With `null`, only the rules-driven
 * checks (forbidden words, hours ranges, placeholders) are skipped — casing, prices, phone
 * format, empties and duplicates still run, and the server always re-validates with the real
 * rules on publish.
 */

/** One copy-rule violation, addressed by a path label like `sections[2].items[0].name`. */
export interface CopyIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * The injected content rules — the parsed shape of `src/data/content-rules.json`. Callers that
 * hold the JSON (the Netlify Functions, the acceptance gate) pass it straight through; the admin
 * client passes whatever the gated `/admin/api/rules` endpoint returned, or `null` when the
 * fetch failed (offline, plain `next dev`).
 */
export interface ContentRules {
  readonly forbiddenWords: readonly string[];
  /** 24-hour `HH:MM` strings, e.g. `09:00` / `16:00`. */
  readonly expectedHours: { readonly opens: string; readonly closes: string };
  /** Template-bug markers matched as case-sensitive substrings, e.g. `[object Object]`. */
  readonly placeholders: readonly string[];
}

const BRAND = 'Native WILDFlour';
const PHONE_DISPLAY = '+1 907-612-0002';

/** The rules-driven scanners, built once per validation pass from the injected rules. */
export interface RuleChecks {
  readonly forbidden: readonly { readonly word: string; readonly pattern: RegExp }[];
  readonly placeholders: readonly string[];
  readonly opens: string;
  readonly closes: string;
  /** Human rendering of the expected range, e.g. "9:00 AM–4:00 PM", for messages. */
  readonly hoursDisplay: string;
}

/**
 * Banned-vocabulary patterns use the same separator-tolerant construction
 * `scripts/verify-build.mjs` uses: a space or hyphen inside a rule also matches the joined
 * spelling and the other common separators, and a trailing "s" catches plurals. Whole-word,
 * case-insensitive.
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
  return {
    forbidden: rules.forbiddenWords.map((word) => ({
      word,
      pattern: new RegExp(
        `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[\\s.-]?')}s?\\b`,
        'i',
      ),
    })),
    placeholders: rules.placeholders,
    opens: rules.expectedHours.opens,
    closes: rules.expectedHours.closes,
    hoursDisplay: `${to12Hour(rules.expectedHours.opens)}–${to12Hour(rules.expectedHours.closes)}`,
  };
}

/**
 * The same separator-tolerant AM/PM range `scripts/verify-build.mjs` parses out of rendered
 * copy. Any gate check reachable from owner-editable content must exist here too — drift would
 * let a clean publish put copy on the live site that the gate would have refused.
 */
export const HOURS_RANGE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi;

/** `9:00 AM` / `4 PM` -> 24-hour `HH:MM` — the gate's conversion, verbatim. */
export function to24Hour(hour: string, minute: string | undefined, suffix: string): string {
  const base = Number(hour) % 12;
  const hours = /pm/i.test(suffix) ? base + 12 : base;
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
 * Wrong brand casing: any standalone brand token whose casing is not exactly `WILDFlour`.
 * Word boundaries keep the run-together domain spelling exempt — same rule as
 * `scripts/verify-build.mjs`.
 */
export const WRONG_CASING = /\b(?!WILDFlour\b)[Ww][Ii][Ll][Dd][Ff][Ll][Oo][Uu][Rr]\b/;

/** Currency amounts. No prices are known, so none may be printed (docs/BRIEF.md §1). */
export const PRICE_CURRENCY = /\$\s*\d[\d,]*(?:\.\d+)?/;

/** Bare two-decimal numbers read as prices too. */
export const PRICE_DECIMAL = /\b\d+\.\d{2}\b/;

/** Any 907-612 phone rendering; only the exact `907-612-0002` spelling is allowed. */
export const PHONE_LIKE = /\(?907\)?[\s.-]?612[\s.-]?\d{4}/g;
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

/**
 * Copy scan for one text field: banned vocabulary, off-spec hours ranges and placeholder
 * markers (only when rules were injected), plus brand casing, price-like strings, and phone
 * numbers other than the one real one. Messages are owner-facing — plain and kind.
 */
export function scanText(
  text: string,
  path: string,
  issues: CopyIssue[],
  rules: RuleChecks | null,
): void {
  if (rules !== null) {
    for (const { word, pattern } of rules.forbidden) {
      const match = text.match(pattern);
      if (match) {
        issues.push({
          path,
          message: `The wording "${match[0] ?? word}" can't appear on the site — it's on the do-not-use list. Please say it another way.`,
        });
      }
    }

    // Mirrors the gate's rendered-copy hours check: a range matching the real opening hours
    // publishes fine; anything else the gate would reject is caught here, before it renders.
    for (const match of text.matchAll(HOURS_RANGE)) {
      const opens = to24Hour(match[1] ?? '', match[2], match[3] ?? '');
      const closes = to24Hour(match[4] ?? '', match[5], match[6] ?? '');
      if (opens !== rules.opens || closes !== rules.closes) {
        issues.push({
          path,
          message: `"${match[0] ?? ''}" looks like opening hours that don't match the cafe's (${rules.hoursDisplay}) — hours copy lives outside the menu.`,
        });
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

  const casing = text.match(WRONG_CASING);
  if (casing) {
    issues.push({
      path,
      message: `The name is always written "${BRAND}" — capital WILD, capital F. Found "${casing[0] ?? ''}".`,
    });
  }

  const price = text.match(PRICE_CURRENCY) ?? text.match(PRICE_DECIMAL);
  if (price) {
    issues.push({
      path,
      message: `"${price[0] ?? ''}" looks like a price. Prices are never printed on the site — they're posted at the counter.`,
    });
  }

  for (const match of text.matchAll(PHONE_LIKE)) {
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
 * Kebab-case slug for new ids: ASCII lowercase, `&` becomes "and", apostrophes drop, accents
 * fold, every other run of non-alphanumerics collapses to one hyphen. Falls back to "section"
 * when nothing survives, so the result always passes the structural id check.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u2018\u2019']/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'section' : slug;
}
