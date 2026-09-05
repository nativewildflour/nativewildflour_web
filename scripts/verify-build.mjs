/**
 * Acceptance checks for the built site (plus a source scan of `src/`) — docs/BRIEF.md §5.
 *
 * Usage:  npm run build && npm run verify
 * Exits 0 when every check passes, 1 otherwise.
 *
 * There is no `out/` any more. Next renders the pages on Netlify from the blob store, so the
 * only honest way to check what a visitor receives is to ask for it: this script starts the
 * build with `next start` on a free port and runs every check that used to read a file against
 * the response body instead. Two things are still read from disk, because no URL exposes them —
 * the compiled client chunks under `.next/static` (the JavaScript every visitor downloads) and
 * `.next/app-path-routes-manifest.json` (the route registry, which replaces walking `out/` for
 * pages nobody registered here).
 *
 * The spawned server gets no Blobs context, so the pages render the committed defaults in
 * `src/data/defaults/`. That is the right thing to check: those are the words this deploy ships
 * with, and anything the owner saves over them went through the same rules at publish time —
 * see the gate/validator parity note in CLAUDE.md.
 *
 * NOTE ON VOCABULARY: BRIEF §2 bans a list of words from the published site. The canonical
 * machine-readable rules are `src/data/content-rules.json` — the banned words plus the expected
 * opening hours and placeholder markers this script checks against. The same JSON is imported by
 * the publish endpoint (`netlify/functions/admin-content.mts`) and served to the admin editors
 * through the auth-gated `/admin/api/rules` endpoint — never bundled into client JS — so this
 * checker and the copy validators (`src/lib/copy-rules.ts`, which takes the rules as an
 * argument) can never drift apart, and the rule strings are never rendered and never shipped to
 * a browser (the `forbidden words: chunks` group below enforces the digits half of that
 * invariant). A checker that cannot name what it checks is useless: the JSON and this script are
 * the only repo files (besides docs/BRIEF.md, the rule book) allowed to contain the banned
 * strings.
 */

import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXT_DIR = path.join(ROOT, '.next');
const require = createRequire(import.meta.url);

/** How long `next start` gets to answer its first request before the run is abandoned. */
const START_TIMEOUT_MS = 90_000;

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
/** Must match `--color-blueberry` / `--color-cream` in src/app/globals.css. */
const THEME_COLOR = '#3A5FA8';
const BACKGROUND_COLOR = '#FFF8EC';

/**
 * The machine-readable content rules — the single source this gate shares with the publish
 * validator (which gets the same JSON injected), so a document that publishes cleanly can never
 * fail these checks at deploy time. Each field is hard-guarded: a missing or empty rule would
 * silently disable its scan.
 */
const CONTENT_RULES = JSON.parse(
  await readFile(path.join(ROOT, 'src', 'data', 'content-rules.json'), 'utf8'),
);

/** Whole-word, case-insensitive. See the vocabulary note at the top of this file. */
const FORBIDDEN_WORDS = CONTENT_RULES.forbiddenWords;
if (!Array.isArray(FORBIDDEN_WORDS) || FORBIDDEN_WORDS.length === 0) {
  console.error(
    'src/data/content-rules.json must provide a non-empty `forbiddenWords` array — an empty list would silently disable the vocabulary scan.',
  );
  process.exit(1);
}

/** The opening hours every rendered range and JSON-LD spec must match (24-hour HH:MM). */
const OPENS = CONTENT_RULES.expectedHours?.opens;
const CLOSES = CONTENT_RULES.expectedHours?.closes;
if (typeof OPENS !== 'string' || typeof CLOSES !== 'string' || OPENS === '' || CLOSES === '') {
  console.error(
    'src/data/content-rules.json must provide `expectedHours.opens` and `expectedHours.closes` strings — without them the hours checks compare against nothing.',
  );
  process.exit(1);
}

/** Template-bug markers that must never reach rendered copy. */
const PLACEHOLDERS = CONTENT_RULES.placeholders;
if (!Array.isArray(PLACEHOLDERS) || PLACEHOLDERS.length === 0) {
  console.error(
    'src/data/content-rules.json must provide a non-empty `placeholders` array — an empty list would silently disable the placeholder scan.',
  );
  process.exit(1);
}

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

/**
 * The route registry: every page the site serves, and the single place routes are enumerated.
 * `CANONICAL_PATHS` derives from it, and the `routes` group compares it against the build's own
 * manifest in both directions, so neither an unregistered page nor a stale entry can survive.
 *
 * `route` is the URL this gate fetches (trailing slash: `trailingSlash: true`). `appRoute` is
 * how the App Router names the same page in `.next/app-path-routes-manifest.json` — the two
 * differ for the dynamic preview route, which serves three URLs from one page file, and for the
 * not-found page, which has no URL of its own at all.
 *
 * `requiredTypes` are the schema.org `@type` values BRIEF §3 requires on that page, counting
 * nested nodes (`MenuSection`, `MenuItem`, `Question`, `Answer`). Every page inherits
 * `Restaurant` + `WebSite` from the root layout.
 *
 * `canonical: null` marks a page that must not be indexed: no canonical link, exactly one
 * noindex robots tag, and automatic exclusion from the sitemap's expected set. `copy: false`
 * marks a page that deliberately carries no contact or hours copy of its own, so the `phone`
 * and `hours` groups skip it — every other check still applies in full.
 */
const PAGES = [
  {
    group: 'page:/',
    route: '/',
    appRoute: '/',
    canonical: '/',
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/menu/',
    route: '/menu/',
    appRoute: '/menu',
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
    route: '/about/',
    appRoute: '/about',
    canonical: '/about/',
    requiredTypes: ['Restaurant', 'WebSite', 'BreadcrumbList'],
  },
  {
    group: 'page:/directions/',
    route: '/directions/',
    appRoute: '/directions',
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
  // The 404 route is intentionally noindex and declares no canonical URL. A server has no
  // `404.html` to fetch: the not-found page is what any unmatched URL renders, so the check
  // asks for one — a path no route could ever claim — and expects the 404 status with it.
  {
    group: 'page:404',
    route: '/this-route-does-not-exist/',
    appRoute: '/_not-found',
    status: 404,
    canonical: null,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  // The admin pages sit behind the Basic-auth edge gate (which only exists on Netlify, so they
  // answer unauthenticated here): noindex, no canonical, never in the sitemap, and no contact
  // or hours copy of their own.
  {
    group: 'page:/admin/',
    route: '/admin/',
    appRoute: '/admin',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/menu/',
    route: '/admin/menu/',
    appRoute: '/admin/menu',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/home/',
    route: '/admin/home/',
    appRoute: '/admin/home',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/about/',
    route: '/admin/about/',
    appRoute: '/admin/about',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/directions/',
    route: '/admin/directions/',
    appRoute: '/admin/directions',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/photos/',
    route: '/admin/photos/',
    appRoute: '/admin/photos',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  // The page editors' preview frames: each renders one public page from a draft, so it
  // carries that page's <h1> and contact copy, but it is admin — noindex, no canonical. All
  // three are the one dynamic `[doc]` page, which is why they share an `appRoute`.
  {
    group: 'page:/admin/preview/home/',
    route: '/admin/preview/home/',
    appRoute: '/admin/preview/[doc]',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/preview/about/',
    route: '/admin/preview/about/',
    appRoute: '/admin/preview/[doc]',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
  {
    group: 'page:/admin/preview/directions/',
    route: '/admin/preview/directions/',
    appRoute: '/admin/preview/[doc]',
    canonical: null,
    copy: false,
    requiredTypes: ['Restaurant', 'WebSite'],
  },
];

/**
 * App Router pages that exist in every build and serve no route of the site's own.
 * `_global-error` is the framework's last-resort error boundary.
 */
const FRAMEWORK_ROUTES = new Set(['/_global-error']);

/** The indexable routes — every page that declares a canonical URL. Derived, never retyped. */
const CANONICAL_PATHS = PAGES.flatMap((page) => (page.canonical === null ? [] : [page.canonical]));

/**
 * Files that must be reachable beside the pages: the metadata routes Next generates and the
 * artwork in `public/`. Fetched, not stat'ed — a file present on disk but unroutable is still a
 * broken link, and the two used to be the same thing only because the site was a pile of files.
 */
const REQUIRED_ASSETS = [
  '/icon.png',
  '/apple-icon.png',
  '/favicon.ico',
  '/images/og-default.png',
  '/images/icon-512.png',
  '/images/logo-160.webp',
  '/images/logo-256.png',
  '/images/logo-256.webp',
  '/images/logo-512.webp',
  '/images/logo-1024.webp',
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
// The server under test
// ---------------------------------------------------------------------------

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A port the OS just confirmed is free. Racy in principle, reliable in a build step. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Start `next start` against the build in `.next` and wait until it answers.
 *
 * Its output is buffered rather than inherited: a healthy run should print nothing but the
 * checks below, and a run that dies during startup needs the whole log, not a banner mixed into
 * the report. The child's exit is watched alongside the readiness poll, so a server that cannot
 * boot fails in a second with its own error message instead of burning the timeout.
 */
async function startServer() {
  const port = await freePort();
  const nextBin = require.resolve('next/dist/bin/next');
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  // The gate checks the copy this deploy ships — the committed defaults. A developer with a
  // local blob store in the environment must not get a different verdict from CI.
  delete env.NETLIFY_BLOBS_CONTEXT;
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  /** Everything, for a server that never came up; stderr alone, for one that came up and then
   *  logged a problem — its stdout is a banner and nothing else. */
  const output = [];
  const errors = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => {
    output.push(String(chunk));
    errors.push(String(chunk));
  });
  let exited = null;
  child.once('exit', (code, signal) => {
    exited = code ?? signal;
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`next start exited (${exited}) before answering:\n${output.join('')}`);
    }
    try {
      // Any answer means the server is listening; whether it is the right answer is the
      // `page:/` group's job to say.
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(10_000) });
      await response.arrayBuffer();
      return { child, base, errors };
    } catch {
      await delay(250);
    }
  }
  child.kill();
  throw new Error(
    `next start did not answer on ${base} within ${START_TIMEOUT_MS / 1000}s:\n${output.join('')}`,
  );
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill();
    // A server that ignores the polite signal must not hold the build open.
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000).unref();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every text document a visitor receives on this run, for the vocabulary scan. */
const documents = [];

/**
 * `9:00 AM` / `4 PM` -> 24-hour `HH:MM`, so rendered hours can be compared to the spec.
 */
function to24Hour(hour, minute, suffix) {
  const base = Number(hour) % 12;
  const hours = /pm/i.test(suffix) ? base + 12 : base;
  return `${String(hours).padStart(2, '0')}:${(minute ?? '00').padStart(2, '0')}`;
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
 * Every `.ts`/`.tsx`/`.css` file under `src/`. BRIEF §5 requires the forbidden-word scan to
 * cover the sources too, not just what the pages happen to render this build.
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

/**
 * Every compiled `.js` chunk under a directory — the JavaScript every visitor downloads.
 * Returns what it found even when the directory is missing; the caller asserts non-emptiness.
 */
async function collectChunkFiles(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectChunkFiles(full, acc);
    } else if (entry.name.endsWith('.js')) {
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

async function runChecks(base) {
  /** GET a route and hand back its status and body. */
  async function get(route) {
    const response = await fetch(`${base}${route}`);
    return { status: response.status, body: await response.text() };
  }

  /**
   * The status of an asset request. HEAD is the cheap question and the one a CDN asks, but a
   * route that only implements GET may answer it with 405 — so a non-OK HEAD is re-asked as a
   * GET before it counts as missing, and the body is drained either way.
   */
  async function assetStatus(route) {
    const head = await fetch(`${base}${route}`, { method: 'HEAD' });
    await head.arrayBuffer();
    if (head.ok) return head.status;
    const full = await fetch(`${base}${route}`);
    await full.arrayBuffer();
    return full.status;
  }

  // --- Routes ---------------------------------------------------------------
  // Compared against the build's own route manifest in both directions: a page added without a
  // PAGES entry would ship unchecked and missing from the sitemap, and an entry left behind
  // after a page is deleted would quietly stop checking anything.
  group('routes');
  let manifest = {};
  try {
    manifest = JSON.parse(
      await readFile(path.join(NEXT_DIR, 'app-path-routes-manifest.json'), 'utf8'),
    );
  } catch (error) {
    check(false, `cannot read .next/app-path-routes-manifest.json: ${error}`);
  }
  // Keys ending in `/page` are pages; `/route` entries are handlers (sitemap.xml, the admin
  // API), which serve no HTML and are checked elsewhere or not at all.
  const builtRoutes = Object.entries(manifest)
    .filter(([key]) => key.endsWith('/page'))
    .map(([, route]) => route)
    .filter((route) => !FRAMEWORK_ROUTES.has(route));
  const registeredRoutes = new Set(PAGES.map((page) => page.appRoute));
  for (const route of builtRoutes) {
    check(
      registeredRoutes.has(route),
      `${route} is a page in this build with no PAGES entry in this script — add it here (and to src/app/sitemap.ts if it is indexable)`,
    );
  }
  for (const route of registeredRoutes) {
    check(
      builtRoutes.includes(route),
      `PAGES registers ${route}, which this build does not contain — remove the entry, or restore the page`,
    );
  }

  // --- Per-page HTML --------------------------------------------------------
  /**
   * The origin every canonical and sitemap URL must share, taken from the home page's own
   * canonical. Checks compare whole URLs against it; matching on a path suffix would accept
   * any URL that merely ends the same way. It is the deployed origin, not the loopback address
   * this run fetches from: `SITE_URL` resolves from the environment, not the request.
   */
  const home = await get('/');
  const ORIGIN = (
    home.body.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1] ?? ''
  ).replace(/\/$/, '');
  check(
    /^https?:\/\/[^/]+$/.test(ORIGIN),
    `home canonical does not yield an absolute origin (got "${ORIGIN}")`,
  );

  /** @type {Map<string, {html: string, jsonLd: object[]}>} */
  const loaded = new Map();

  for (const page of PAGES) {
    group(page.group);
    let html;
    try {
      const response = await get(page.route);
      html = response.body;
      const expected = page.status ?? 200;
      check(
        response.status === expected,
        `GET ${page.route} answered ${response.status}, expected ${expected}`,
      );
    } catch (error) {
      check(false, `cannot fetch ${page.route}: ${error}`);
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
      check(
        !canonical,
        `a noindex page must not declare a canonical URL (found ${canonical})`,
      );
      const robotsTags = html.match(/<meta\s+name="robots"[^>]*>/gi) ?? [];
      check(
        robotsTags.length === 1 && /noindex/i.test(robotsTags[0] ?? ''),
        `a noindex page needs exactly one noindex robots tag, found ${JSON.stringify(robotsTags)}`,
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

    // Template-bug markers, in rendered copy only. The public pages render owner-editable
    // content, so this exact check (case-sensitive substring) must also exist in the publish
    // validator — drift here would wedge every deploy after a clean publish.
    const text = renderedText(html);
    for (const marker of PLACEHOLDERS) {
      check(!text.includes(marker), `rendered copy contains "${marker}"`);
    }

    loaded.set(page.route, { html, jsonLd: nodes });
    documents.push({ label: `GET ${page.route}`, contents: html, html: true });
  }

  // --- Required assets ------------------------------------------------------
  group('required assets');
  for (const route of REQUIRED_ASSETS) {
    const status = await assetStatus(route);
    check(status === 200, `GET ${route} answered ${status}, expected 200`);
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
  const sitemap = await get('/sitemap.xml');
  check(sitemap.status === 200, `GET /sitemap.xml answered ${sitemap.status}`);
  documents.push({ label: 'GET /sitemap.xml', contents: sitemap.body });
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
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
  const robots = await get('/robots.txt');
  check(robots.status === 200, `GET /robots.txt answered ${robots.status}`);
  documents.push({ label: 'GET /robots.txt', contents: robots.body });
  check(/^user-agent:\s*\*/im.test(robots.body), 'no wildcard User-Agent rule');
  check(/^allow:\s*\//im.test(robots.body), 'does not allow /');
  check(
    /^sitemap:\s*https?:\/\/\S+\/sitemap\.xml\s*$/im.test(robots.body),
    'missing an absolute Sitemap: URL',
  );

  // --- manifest -------------------------------------------------------------
  group('manifest.webmanifest');
  const manifestResponse = await get('/manifest.webmanifest');
  check(
    manifestResponse.status === 200,
    `GET /manifest.webmanifest answered ${manifestResponse.status}`,
  );
  documents.push({ label: 'GET /manifest.webmanifest', contents: manifestResponse.body });
  try {
    const webmanifest = JSON.parse(manifestResponse.body);
    check(webmanifest.short_name === BRAND, `short_name is "${webmanifest.short_name}"`);
    check(
      webmanifest.theme_color === THEME_COLOR,
      `theme_color is "${webmanifest.theme_color}", expected "${THEME_COLOR}"`,
    );
    check(
      webmanifest.background_color === BACKGROUND_COLOR,
      `background_color is "${webmanifest.background_color}", expected "${BACKGROUND_COLOR}"`,
    );
    for (const icon of webmanifest.icons ?? []) {
      const status = await assetStatus(icon.src);
      check(status === 200, `icon ${icon.src} answered ${status}`);
    }
  } catch (error) {
    check(false, `does not parse: ${error}`);
  }

  // --- Forbidden words, everything a visitor receives ------------------------
  group('forbidden words');
  for (const { label, contents, html } of documents) {
    if (html) {
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
  // BRIEF §5 scans `src/`, the rendered site and `README.md`. `docs/` is deliberately excluded:
  // BRIEF.md is the rule book and necessarily spells every banned word out.
  group('forbidden words: source');
  const sourceFiles = [
    ...(await collectSourceFiles(path.join(ROOT, 'src'))),
    path.join(ROOT, 'README.md'),
  ];
  for (const file of sourceFiles) {
    const label = path.relative(ROOT, file).replace(/\\/g, '/');
    // BRIEF §2 exempts the `MobileNav` component identifier, which never renders as text.
    const contents = (await readFile(file, 'utf8')).split('MobileNav').join(' ');
    scanForbidden(contents, label, current.failures);
  }

  // --- Forbidden digits, the public chunks ----------------------------------
  // Compiled JS is exempt from the word scan above (bundled identifiers collide with English
  // words), but digits can't collide with framework identifiers the way words can. The admin
  // editors must fetch their content rules from the auth-gated /admin/api/rules endpoint, never
  // import them into client code — this group turns that no-shipped-rules invariant into an
  // enforced check. `.next/static` is precisely what is served under /_next/static, i.e. every
  // byte of JavaScript a visitor's browser downloads.
  group('forbidden words: chunks');
  const WRONG_NUMBER = /612[\s.-]?0303/;
  const ANY_PHONE_DIGITS = /907[\s.-]?612[\s.-]?\d{4}/g;
  const chunkFiles = await collectChunkFiles(path.join(NEXT_DIR, 'static'));
  check(chunkFiles.length > 0, 'no JS found under .next/static — the build looks incomplete');
  for (const file of chunkFiles) {
    const label = path.relative(ROOT, file).replace(/\\/g, '/');
    const contents = await readFile(file, 'utf8');
    check(
      !WRONG_NUMBER.test(contents),
      `${label}: contains the wrong-listing digits 612-0303 — rule data is leaking into a public bundle`,
    );
    for (const found of contents.match(ANY_PHONE_DIGITS) ?? []) {
      check(
        found.replace(/\D/g, '').endsWith('0002'),
        `${label}: contains phone digits "${found}" that are not the real 907-612-0002`,
      );
    }
  }

  // --- Phone ----------------------------------------------------------------
  group('phone');
  for (const page of PAGES) {
    const entry = loaded.get(page.route);
    if (!entry) continue;
    // Admin pages carry no contact copy at all; even the wrong-format scan would only trip on
    // owner-editable admin chrome, not published copy. (The 404 page keeps that scan below.)
    if (page.copy === false) continue;
    const label = page.route;
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
  // The public pages render owner-editable content, so this exact check (same range regex,
  // same 24-hour conversion) must also exist in the publish validator — drift here would wedge
  // every deploy after a clean publish, with the blob feeding the bad copy into each render.
  group('hours');
  const HOURS_RANGE =
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi;
  for (const page of PAGES) {
    const entry = loaded.get(page.route);
    if (!entry) continue;
    // Admin pages render no opening-hours copy, by design.
    if (page.copy === false) continue;
    const label = page.route;
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
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function main() {
  if (!(await stat(path.join(NEXT_DIR, 'BUILD_ID')).catch(() => null))) {
    console.error('.next/BUILD_ID not found — run `npm run build` first.');
    process.exit(1);
  }

  const server = await startServer();
  const stop = () => stopServer(server.child);
  // Ctrl-C during a check run must not leave a server holding the port.
  process.once('SIGINT', () => {
    void stop().then(() => process.exit(130));
  });
  try {
    await runChecks(server.base);
  } finally {
    await stop();
  }

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
    // A render that threw shows up here and nowhere else — the page still returns HTML, so the
    // checks above only see the symptom.
    const tail = server.errors.join('').split('\n').slice(-20).join('\n').trim();
    if (tail !== '') console.error(`\nnext start logged:\n${tail}`);
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
