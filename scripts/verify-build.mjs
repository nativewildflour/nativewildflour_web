/**
 * Static acceptance checks for the exported site in `out/` (plus a source scan of `src/`) — docs/BRIEF.md §5.
 *
 * Usage:  npm run build && npm run verify
 * Exits 0 when every check passes, 1 otherwise.
 *
 * NOTE ON VOCABULARY: BRIEF §2 bans a list of words from the published site. This file is the
 * checker, so it necessarily spells those words out in `FORBIDDEN_WORDS` below. They are pattern
 * literals in a build script — they are never rendered, never shipped to `out/`, and a checker
 * that cannot name what it checks is useless. This is the only place they may appear.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');

// ---------------------------------------------------------------------------
// Expected values
// ---------------------------------------------------------------------------

const BRAND = 'Native WILDFlour';
const PHONE_DISPLAY = '+1 907-612-0002';
const PHONE_E164 = '+19076120002';
const PHONE_HREF = `tel:${PHONE_E164}`;
/** JSON-LD must publish the same string the pages render — docs/BRIEF.md §5. */
const SCHEMA_TELEPHONE = PHONE_DISPLAY;
const OPEN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const CLOSED_DAY = 'Saturday';
const OPENS = '09:00';
const CLOSES = '16:00';
/** Must match `--color-blueberry` / `--color-cream` in src/app/globals.css. */
const THEME_COLOR = '#3A5FA8';
const BACKGROUND_COLOR = '#FFF8EC';

/** Whole-word, case-insensitive. See the vocabulary note at the top of this file. */
const FORBIDDEN_WORDS = [
  'food truck',
  'truck',
  'trailer',
  'mobile',
  'cart',
  'van',
  'wheels',
  'pop-up',
  '612-0303',
];

const FORBIDDEN_PATTERNS = FORBIDDEN_WORDS.map((word) => ({
  word,
  // Separator-tolerant: a space or hyphen in the rule also matches the joined spelling and
  // the other common separators ("pop-up" catches "popup", "612-0303" catches "6120303"
  // and the dot-formatted "612.0303" that phone listings favour).
  pattern: new RegExp(
    `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[\\s.-]?')}s?\\b`,
    'i',
  ),
}));

/**
 * Wrong brand casing: any standalone "wildflour" token whose casing is not exactly
 * `WILDFlour`. Word boundaries keep `nativewildflour` (the domain) exempt.
 */
const WRONG_CASING = /\b(?!WILDFlour\b)[Ww][Ii][Ll][Dd][Ff][Ll][Oo][Uu][Rr]\b/;

/** Template-bug markers that must never reach rendered copy. */
const PLACEHOLDERS = ['undefined', '[object Object]', 'NaN'];

/**
 * The route registry: every exported page, and the single place routes are enumerated.
 * `REQUIRED_FILES` and `CANONICAL_PATHS` derive from it, and the `routes` group fails when
 * `out/` contains a page this list does not, so a new route cannot ship unchecked.
 *
 * `requiredTypes` are the schema.org `@type` values BRIEF §3 requires on that page, counting
 * nested nodes (`MenuSection`, `MenuItem`, `Question`, `Answer`). Every page inherits
 * `Restaurant` + `WebSite` from the root layout.
 */
const PAGES = [
  { group: 'page:/', file: 'index.html', canonical: '/', requiredTypes: ['Restaurant', 'WebSite'] },
  {
    group: 'page:/menu/',
    file: 'menu/index.html',
    canonical: '/menu/',
    requiredTypes: [
      'Restaurant',
      'WebSite',
      'BreadcrumbList',
      'Menu',
      'MenuSection',
      'MenuItem',
    ],
  },
  {
    group: 'page:/about/',
    file: 'about/index.html',
    canonical: '/about/',
    requiredTypes: ['Restaurant', 'WebSite', 'BreadcrumbList'],
  },
  {
    group: 'page:/directions/',
    file: 'directions/index.html',
    canonical: '/directions/',
    requiredTypes: [
      'Restaurant',
      'WebSite',
      'BreadcrumbList',
      'FAQPage',
      'Question',
      'Answer',
    ],
  },
  // The 404 route is intentionally noindex and declares no canonical URL.
  {
    group: 'page:404',
    file: '404.html',
    canonical: null,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
];

/** The indexable routes — every page that declares a canonical URL. Derived, never retyped. */
const CANONICAL_PATHS = PAGES.flatMap((page) => (page.canonical === null ? [] : [page.canonical]));

const REQUIRED_FILES = [
  ...PAGES.map((page) => page.file),
  'sitemap.xml',
  'robots.txt',
  'manifest.webmanifest',
  'icon.png',
  'apple-icon.png',
  'images/og-default.png',
  'images/icon-512.png',
  'images/logo-160.webp',
  'images/logo-256.png',
  'images/logo-256.webp',
  'images/logo-512.webp',
  'images/logo-1024.webp',
];

// ---------------------------------------------------------------------------
// Result collection
// ---------------------------------------------------------------------------

/** @type {{ group: string, failures: string[] }[]} */
const groups = [];
/** @type {{ group: string, failures: string[] } | null} */
let current = null;

function group(name) {
  current = { group: name, failures: [] };
  groups.push(current);
}

function check(condition, message) {
  if (!condition) current.failures.push(message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isFile(relative) {
  try {
    return (await stat(path.join(OUT, relative))).isFile();
  } catch {
    return false;
  }
}

async function readOut(relative) {
  try {
    return await readFile(path.join(OUT, relative), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Every emitted text file in `out/` — HTML plus `sitemap.xml`, `robots.txt` and
 * `manifest.webmanifest`, all of which carry copy. The `_next` chunk directory is skipped:
 * it holds compiled JS/CSS whose identifiers BRIEF §2 exempts.
 */
async function collectTextFiles(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_next') await collectTextFiles(full, acc);
    } else if (/\.(html|xml|txt|webmanifest)$/i.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Rendered copy only: `<script>` and `<style>` blocks removed. This drops Next's RSC flight
 * payload (which legitimately contains `$undefined`) and every chunk path in a `<script src>`
 * — including bundle filenames derived from the `MobileNav` component identifier, which
 * BRIEF §2 explicitly exempts. JSON-LD is scanned separately, from the parsed objects.
 */
function renderedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

/**
 * Every route `out/` actually contains, as paths relative to `out/` (`index.html`,
 * `menu/index.html`, `404.html`). Discovered rather than assumed, so a page added without a
 * `PAGES` entry is caught instead of silently skipping every structural check.
 */
async function collectRouteFiles(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_next') await collectRouteFiles(full, acc);
    } else if (entry.name === 'index.html' || entry.name === '404.html') {
      acc.push(path.relative(OUT, full).replace(/\\/g, '/'));
    }
  }
  return acc;
}

/** `9:00 AM` / `4 PM` -> 24-hour `HH:MM`, so rendered hours can be compared to the spec. */
function to24Hour(hour, minute, suffix) {
  const base = Number(hour) % 12;
  const hours = /pm/i.test(suffix) ? base + 12 : base;
  return `${String(hours).padStart(2, '0')}:${(minute ?? '00').padStart(2, '0')}`;
}

/**
 * Every `.ts`/`.tsx`/`.css` file under `src/`. BRIEF §5 requires the forbidden-word scan to
 * cover the sources too, not just what `out/` happens to render this build.
 */
async function collectSourceFiles(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx|css)$/i.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract, parse and flatten every JSON-LD block. Returns `{ nodes, errors, count }`. */
function parseJsonLd(html) {
  const nodes = [];
  const errors = [];
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const [, raw] of blocks) {
    // `JsonLd.tsx` unicode-escapes every `<` before embedding; JSON.parse decodes those natively.
    try {
      const parsed = JSON.parse(raw);
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) nodes.push(node);
    } catch (error) {
      errors.push(String(error));
    }
  }
  return { nodes, errors, count: blocks.length };
}

function typesOf(node) {
  const type = node?.['@type'];
  if (!type) return [];
  return Array.isArray(type) ? type : [type];
}

/** Every `@type` anywhere in the tree, including nested objects and arrays. */
function collectTypes(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, found);
  } else if (value && typeof value === 'object') {
    for (const type of typesOf(value)) found.add(type);
    for (const item of Object.values(value)) collectTypes(item, found);
  }
  return found;
}

function scanForbidden(text, label, sink) {
  for (const { word, pattern } of FORBIDDEN_PATTERNS) {
    const match = text.match(pattern);
    if (match) sink.push(`${label}: forbidden word "${match[0]}" (rule: ${word})`);
  }
  const casing = text.match(WRONG_CASING);
  if (casing) sink.push(`${label}: wrong brand casing "${casing[0]}" — must be ${BRAND}`);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function main() {
  if (!(await stat(OUT).catch(() => null))) {
    console.error('out/ not found — run `npm run build` first.');
    process.exit(1);
  }

  // --- Required files -------------------------------------------------------
  group('required files');
  for (const file of REQUIRED_FILES) {
    check(await isFile(file), `missing out/${file}`);
  }

  // --- Routes ---------------------------------------------------------------
  // Discovered from out/, so adding a page without registering it here fails loudly rather
  // than shipping it unchecked and missing from the sitemap.
  group('routes');
  /**
   * A static export emits the not-found route three ways — `404.html` (the one Netlify
   * serves), `404/index.html` and `_not-found/index.html` — all byte-identical. They are
   * framework artifacts of the page already registered as `404.html`, not extra routes.
   */
  const ROUTE_ALIASES = new Set(['404/index.html', '_not-found/index.html']);
  const knownFiles = new Set(PAGES.map((page) => page.file));
  for (const file of await collectRouteFiles(OUT)) {
    check(
      knownFiles.has(file) || ROUTE_ALIASES.has(file),
      `out/${file} is an exported route with no PAGES entry in this script — add it here and to src/app/sitemap.ts`,
    );
  }

  // --- Per-page HTML --------------------------------------------------------
  /**
   * The origin every canonical and sitemap URL must share, taken from the home page's own
   * canonical. Checks compare whole URLs against it; matching on a path suffix would accept
   * any URL that merely ends the same way.
   */
  const homeHtml = await readOut('index.html');
  const ORIGIN = (
    homeHtml?.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1] ?? ''
  ).replace(/\/$/, '');
  check(
    /^https?:\/\/[^/]+$/.test(ORIGIN),
    `home canonical does not yield an absolute origin (got "${ORIGIN}")`,
  );

  /** @type {Map<string, {html: string, jsonLd: object[]}>} */
  const loaded = new Map();

  for (const page of PAGES) {
    group(page.group);
    const html = await readOut(page.file);
    if (html === null) {
      check(false, `cannot read out/${page.file}`);
      continue;
    }

    check(/<html[^>]*\slang="en"/i.test(html), 'missing lang="en" on <html>');

    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
    check(h1Count === 1, `expected exactly one <h1>, found ${h1Count}`);

    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    check(Boolean(title), 'missing <title>');
    check(!title || title.includes(BRAND), `<title> omits "${BRAND}": ${title}`);

    const description = html
      .match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]
      ?.trim();
    check(Boolean(description), 'missing meta description');

    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1];
    if (page.canonical === null) {
      check(!canonical, `404 must not declare a canonical URL (found ${canonical})`);
      const robotsTags = html.match(/<meta\s+name="robots"[^>]*>/gi) ?? [];
      check(
        robotsTags.length === 1 && /noindex/i.test(robotsTags[0] ?? ''),
        `404 needs exactly one noindex robots tag, found ${JSON.stringify(robotsTags)}`,
      );
    } else {
      // Whole-URL comparison: a copy-pasted canonical from another page ends in "/" too.
      const expectedCanonical = `${ORIGIN}${page.canonical}`;
      check(Boolean(canonical), 'missing canonical link');
      check(
        !canonical || canonical === expectedCanonical,
        `canonical is "${canonical}", expected "${expectedCanonical}"`,
      );
    }

    for (const tag of ['og:title', 'og:description', 'og:image']) {
      check(
        new RegExp(`<meta\\s+property="${tag}"\\s+content="[^"]+"`, 'i').test(html),
        `missing ${tag}`,
      );
    }
    check(
      /<meta\s+name="twitter:card"\s+content="summary_large_image"/i.test(html),
      'missing twitter:card=summary_large_image',
    );

    // JSON-LD: present on the four indexable pages, parses, every node carries an @type.
    const { nodes, errors, count } = parseJsonLd(html);
    for (const error of errors) check(false, `JSON-LD does not parse: ${error}`);
    if (page.canonical !== null) {
      check(count > 0, 'no JSON-LD block found');
      check(nodes.length > 0, 'JSON-LD contains no objects');
    }
    for (const [index, node] of nodes.entries()) {
      check(typesOf(node).length > 0, `JSON-LD node ${index} has no @type`);
    }

    // Every schema BRIEF §3 requires for this route is actually present.
    const foundTypes = collectTypes(nodes);
    for (const type of page.requiredTypes ?? []) {
      check(foundTypes.has(type), `JSON-LD is missing required @type ${type}`);
    }

    // Images must all carry an alt attribute.
    const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
    const missingAlt = imgs.filter((tag) => !/\salt=/i.test(tag));
    check(missingAlt.length === 0, `${missingAlt.length} <img> without alt: ${missingAlt[0]}`);

    // Template-bug markers, in rendered copy only.
    const text = renderedText(html);
    for (const marker of PLACEHOLDERS) {
      check(!text.includes(marker), `rendered copy contains "${marker}"`);
    }

    loaded.set(page.file, { html, jsonLd: nodes });
  }

  // --- Restaurant JSON-LD ---------------------------------------------------
  group('json-ld:restaurant');
  const restaurant = [...loaded.values()]
    .flatMap((entry) => entry.jsonLd)
    .find((node) => typesOf(node).includes('Restaurant'));

  if (!restaurant) {
    check(false, 'no node with @type "Restaurant" found in any page');
  } else {
    const types = typesOf(restaurant);
    check(Array.isArray(restaurant['@type']), '@type must be an array');
    check(types.includes('Restaurant'), '@type is missing "Restaurant"');
    check(types.includes('CafeOrCoffeeShop'), '@type is missing "CafeOrCoffeeShop"');
    check(
      restaurant.telephone === SCHEMA_TELEPHONE,
      `telephone is "${restaurant.telephone}", expected "${SCHEMA_TELEPHONE}"`,
    );
    check(restaurant.name === BRAND, `name is "${restaurant.name}", expected "${BRAND}"`);

    const specs = restaurant.openingHoursSpecification ?? [];
    check(Array.isArray(specs) && specs.length > 0, 'openingHoursSpecification is empty');
    const covered = new Set();
    for (const spec of specs) {
      const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
      check(
        !days.includes(CLOSED_DAY),
        `openingHoursSpecification lists ${CLOSED_DAY}, which is a closed day`,
      );
      check(spec.opens === OPENS, `opens is "${spec.opens}", expected "${OPENS}"`);
      check(spec.closes === CLOSES, `closes is "${spec.closes}", expected "${CLOSES}"`);
      for (const day of days) covered.add(day);
    }
    for (const day of OPEN_DAYS) {
      check(covered.has(day), `openingHoursSpecification does not cover ${day}`);
    }
  }

  // --- Sitemap --------------------------------------------------------------
  group('sitemap.xml');
  const sitemap = (await readOut('sitemap.xml')) ?? '';
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // Exact set equality against the routes registered above — every indexable page present,
  // nothing else, each spelled as the full canonical URL.
  const expectedLocs = CANONICAL_PATHS.map((canonical) => `${ORIGIN}${canonical}`);
  check(
    locs.length === expectedLocs.length,
    `expected exactly ${expectedLocs.length} <loc> entries, found ${locs.length}`,
  );
  for (const url of expectedLocs) {
    check(locs.includes(url), `sitemap is missing ${url}`);
  }
  for (const loc of locs) {
    check(expectedLocs.includes(loc), `unexpected sitemap URL: ${loc}`);
  }

  // --- robots.txt -----------------------------------------------------------
  group('robots.txt');
  const robots = (await readOut('robots.txt')) ?? '';
  check(/^user-agent:\s*\*/im.test(robots), 'no wildcard User-Agent rule');
  check(/^allow:\s*\//im.test(robots), 'does not allow /');
  check(
    /^sitemap:\s*https?:\/\/\S+\/sitemap\.xml\s*$/im.test(robots),
    'missing an absolute Sitemap: URL',
  );

  // --- manifest -------------------------------------------------------------
  group('manifest.webmanifest');
  const manifestRaw = (await readOut('manifest.webmanifest')) ?? '';
  try {
    const manifest = JSON.parse(manifestRaw);
    check(manifest.short_name === BRAND, `short_name is "${manifest.short_name}"`);
    check(
      manifest.theme_color === THEME_COLOR,
      `theme_color is "${manifest.theme_color}", expected "${THEME_COLOR}"`,
    );
    check(
      manifest.background_color === BACKGROUND_COLOR,
      `background_color is "${manifest.background_color}", expected "${BACKGROUND_COLOR}"`,
    );
    for (const icon of manifest.icons ?? []) {
      check(await isFile(icon.src.replace(/^\//, '')), `icon ${icon.src} is not in out/`);
    }
  } catch (error) {
    check(false, `does not parse: ${error}`);
  }

  // --- Forbidden words, every emitted text file -----------------------------
  group('forbidden words');
  for (const file of await collectTextFiles(OUT)) {
    const label = path.relative(ROOT, file).replace(/\\/g, '/');
    const contents = await readFile(file, 'utf8');
    if (file.endsWith('.html')) {
      scanForbidden(renderedText(contents), label, current.failures);
      // JSON-LD is stripped along with the other scripts, so scan it from the parsed objects.
      const { nodes } = parseJsonLd(contents);
      if (nodes.length > 0) {
        scanForbidden(JSON.stringify(nodes), `${label} (JSON-LD)`, current.failures);
      }
    } else {
      // sitemap.xml / robots.txt / manifest.webmanifest — copy, scanned whole.
      scanForbidden(contents, label, current.failures);
    }
  }

  // --- Forbidden words, the sources ----------------------------------------
  // BRIEF §5 scans `src/`, `out/` and `README.md`. `docs/` is deliberately excluded: BRIEF.md
  // is the rule book and necessarily spells every banned word out.
  group('forbidden words: source');
  const sourceFiles = [...(await collectSourceFiles(path.join(ROOT, 'src'))), path.join(ROOT, 'README.md')];
  for (const file of sourceFiles) {
    const label = path.relative(ROOT, file).replace(/\\/g, '/');
    // BRIEF §2 exempts the `MobileNav` component identifier, which never renders as text.
    const contents = (await readFile(file, 'utf8')).split('MobileNav').join(' ');
    scanForbidden(contents, label, current.failures);
  }

  // --- Phone ----------------------------------------------------------------
  group('phone');
  for (const page of PAGES) {
    const entry = loaded.get(page.file);
    if (!entry) continue;
    const label = `out/${page.file}`;
    const text = renderedText(entry.html);
    // 404 is a link list; it carries no contact block.
    if (page.canonical !== null) {
      check(text.includes(PHONE_DISPLAY), `${label}: does not render "${PHONE_DISPLAY}"`);
      check(entry.html.includes(PHONE_HREF), `${label}: no ${PHONE_HREF} link`);
    }
    // Any other rendering of a 907-612 number is wrong. Drop the (correct) `tel:` hrefs first,
    // otherwise `tel:+19076120002` reads as an unformatted number. Only the full href is
    // removed: splitting on the bare E.164 string too would also erase a visibly rendered
    // `+19076120002` — exactly the mistake this check exists to catch.
    const humanText = text.split(PHONE_HREF).join(' ');
    const wrongFormat = humanText.match(/\(?907\)?[\s.-]?612[\s.-]?\d{4}/g) ?? [];
    for (const found of wrongFormat) {
      check(
        found === '907-612-0002',
        `${label}: phone rendered as "${found}", expected "${PHONE_DISPLAY}"`,
      );
    }
  }

  // --- Hours ----------------------------------------------------------------
  // The other half of "phone + hours must match the rendered copy": every opening-hours
  // range a page actually prints is parsed and compared to the spec, so a hand-edited
  // display string cannot contradict the table and the JSON-LD it sits beside.
  group('hours');
  const HOURS_RANGE =
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi;
  for (const page of PAGES) {
    const entry = loaded.get(page.file);
    if (!entry) continue;
    const label = `out/${page.file}`;
    const text = renderedText(entry.html);
    const ranges = [...text.matchAll(HOURS_RANGE)];
    check(ranges.length > 0, `${label}: renders no opening-hours range`);
    for (const [found, openHour, openMinute, openSuffix, closeHour, closeMinute, closeSuffix] of ranges) {
      const opens = to24Hour(openHour, openMinute, openSuffix);
      const closes = to24Hour(closeHour, closeMinute, closeSuffix);
      check(
        opens === OPENS && closes === CLOSES,
        `${label}: renders hours "${found}" (${opens}–${closes}), expected ${OPENS}–${CLOSES}`,
      );
    }
    // The closed day must be named as closed wherever the week is listed.
    check(
      !text.includes(CLOSED_DAY) || /Closed/.test(text),
      `${label}: names ${CLOSED_DAY} without marking it closed`,
    );
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  const width = Math.max(...groups.map((g) => g.group.length), 12);
  const failed = groups.filter((g) => g.failures.length > 0);

  console.log('');
  console.log(`  ${'CHECK'.padEnd(width)}  RESULT`);
  console.log(`  ${'-'.repeat(width)}  ------`);
  for (const g of groups) {
    const ok = g.failures.length === 0;
    console.log(
      `  ${g.group.padEnd(width)}  ${ok ? 'PASS' : `FAIL (${g.failures.length})`}`,
    );
  }
  console.log('');

  if (failed.length > 0) {
    console.error('Failures:');
    for (const g of failed) {
      for (const failure of g.failures) console.error(`  x [${g.group}] ${failure}`);
    }
    console.error(
      `\n${failed.reduce((n, g) => n + g.failures.length, 0)} check(s) failed in ${failed.length} group(s).`,
    );
    process.exit(1);
  }

  console.log(`All ${groups.length} check groups passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
