/**
 * End-to-end smoke test for the server side of the site: the three Netlify Functions and the
 * loader the public pages read through, driven against a real local blob store.
 *
 * Usage:  npm run smoke:admin
 * Exits 0 when every scenario passes, 1 otherwise.
 *
 * `npm run verify` is the acceptance gate for what the site *renders* from the committed
 * defaults; nothing there can see the publish pipeline, because that pipeline only exists at
 * request time on Netlify. This covers the other half: auth posture, validation,
 * snapshot/restore, the photo lifecycle, photo delivery, the refresh call a save makes, and the
 * loader that turns a saved blob into a rendered page — the paths where a regression would
 * either lock the owner out of her own site or quietly serve the wrong content.
 *
 * It is a real harness, not a mock one. `BlobsServer` from `@netlify/blobs/server` is the same
 * store implementation `netlify dev` runs against, and the handlers are imported unmodified and
 * called with real `Request` objects. Two pieces of plumbing make that possible:
 *
 *   - a `module.register()` loader hook, because the functions are written for Netlify's
 *     bundler: their relative imports leave the extension off, and their JSON imports carry no
 *     `with { type: 'json' }` attribute. The hook supplies both (and Next's `@/` alias, for the
 *     page loader), so the sources stay exactly what gets deployed. (TypeScript itself needs no
 *     help — Node strips types natively.)
 *   - `NETLIFY_BLOBS_CONTEXT`, the base64 payload Netlify injects into a function process,
 *     pointed at the local server so `getStore()` resolves without a single code change.
 *
 * A publish refreshes the site the request reached, so every request here is addressed to a
 * local `node:http` stand-in for the site: a passing run must never reach the outside world.
 * For most of the run that stand-in refuses every call at once (so `revalidated: false` is the
 * asserted contract); the scenarios that exercise the refresh call address their requests to a
 * second server started for the purpose, which records what it was asked for.
 *
 * A thin wrapper around `fetch` sits between the Blobs client and the local store. It is
 * transparent unless a scenario arms it, to answer a write with a failure status (the store
 * refusing a save) or to stamp read responses with the etag production sends, which turns every
 * save into the conditional write it is on Netlify.
 */

import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BlobsServer } from '@netlify/blobs/server';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Loader hook
// ---------------------------------------------------------------------------

/**
 * Resolution rules two bundlers apply for free, restated for plain Node: extensionless
 * specifiers get a TypeScript extension, `.json` specifiers get the import attribute Node
 * requires, and `@/` resolves to `src/` — Netlify's function bundler supplies the first two for
 * `netlify/**`, and Next supplies all three for `src/lib/server/content.ts`, which the page
 * loader scenarios import directly. Nothing here names a module format: letting Node work it out
 * costs one `MODULE_TYPELESS_PACKAGE_JSON` warning per TypeScript file and keeps the hook off
 * internal format strings, which is the right trade for a script that has to run on the Node 22
 * the deploy pins as well as on whatever a developer has installed.
 */
const LOADER = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = ${JSON.stringify(`${pathToFileURL(path.join(ROOT, 'src')).href}/`)};
const EXTENSIONS = ['.ts', '.mts', '.tsx', '/index.ts', '/index.mts', '/index.tsx'];

/** The URL a specifier really points at, once a missing extension is filled in. */
function withExtension(url) {
  if (existsSync(fileURLToPath(url))) return url;
  for (const extension of EXTENSIONS) {
    const candidate = new URL(url.href + extension);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.json')) {
    return { ...(await nextResolve(specifier, context)), importAttributes: { type: 'json' } };
  }
  if (specifier.startsWith('@/')) {
    const resolved = withExtension(new URL(specifier.slice(2), SRC));
    if (resolved) return nextResolve(resolved.href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const direct = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(direct))) {
      const resolved = withExtension(direct);
      if (resolved) return nextResolve(resolved.href, context);
    }
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(LOADER)}`);

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

/** Everything the handlers and the page loader import that another agent owns. Named here so a
 *  run that starts too early reports which file it is waiting on instead of an import stack. */
const PREREQUISITES = [
  'src/lib/copy-rules.ts',
  'src/lib/content-schema.ts',
  'src/lib/content-docs.ts',
  'src/lib/content/images.ts',
  'src/lib/server/content.ts',
  'src/data/content-rules.json',
  'src/data/defaults/menu.json',
  'src/data/defaults/home.json',
  'src/data/defaults/about.json',
  'src/data/defaults/directions.json',
];

function stop(message, detail) {
  console.error(`\nSTOPPED: ${message}`);
  if (detail) console.error(`  ${String(detail).split('\n').join('\n  ')}`);
  process.exit(1);
}

const missing = [];
for (const relative of PREREQUISITES) {
  const exists = await stat(path.join(ROOT, relative))
    .then((entry) => entry.isFile())
    .catch(() => false);
  if (!exists) missing.push(relative);
}
if (missing.length > 0) {
  stop(
    'the admin handlers cannot be imported yet — these files do not exist:',
    missing.map((file) => `- ${file}`).join('\n'),
  );
}

const readJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));

const RULES = await readJson('src/data/content-rules.json');
const MENU_SEED = await readJson('src/data/defaults/menu.json');
const HOME_SEED = await readJson('src/data/defaults/home.json');
const DIRECTIONS_SEED = await readJson('src/data/defaults/directions.json');
const ABOUT_SEED = await readJson('src/data/defaults/about.json');
/** The banned vocabulary is rule data: read from the canonical JSON at run time, never typed
 *  into a source file. See the vocabulary note in `scripts/verify-build.mjs`. */
const BANNED_WORD = RULES.forbiddenWords[0];
assert.equal(typeof BANNED_WORD, 'string', 'content-rules.json has no forbidden words to test with');

// ---------------------------------------------------------------------------
// Blob store + environment
// ---------------------------------------------------------------------------

const workspace = await mkdtemp(path.join(tmpdir(), 'nwf-smoke-'));
const server = new BlobsServer({
  directory: path.join(workspace, 'blobs'),
  token: 'smoke-token',
});
const { port } = await server.start();
const edgeURL = `http://localhost:${port}`;

// Both URLs are required: the client refuses a strong-consistency read when only the cached
// edge URL is configured, and both function handlers open their stores with `strong`.
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({ edgeURL, uncachedEdgeURL: edgeURL, token: 'smoke-token', siteID: 'smoke' }),
).toString('base64');
process.env.ADMIN_USERNAME = 'owner';
process.env.ADMIN_PASSWORD = 'a-long-enough-passphrase';
// The refresh call goes to the request's own origin now; these are cleared so nothing in the
// environment can point it anywhere else.
delete process.env.URL;
delete process.env.DEPLOY_PRIME_URL;

/**
 * The Blobs wire, wrapped. `blobFaults.put(entry)` may return a Response to answer a PUT with
 * instead of the store; `blobFaults.etagReads` stamps successful reads with the store's own etag
 * (the local server sends none, Netlify always does). Both are reset by `withBlobFaults`.
 */
const blobFaults = { put: null, etagReads: false, before: null };
/**
 * Netlify's cache purge API, stood in for: `purgeCache` from `@netlify/functions` posts to
 * `https://api.netlify.com/api/v1/purge`, and no smoke run may reach the real one. Each call is
 * recorded; `purgeApi.status` is what it answers.
 */
const purgeApi = { calls: [], status: 200 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === 'https://api.netlify.com') {
    purgeApi.calls.push({
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      authorization: new Headers(init.headers).get('authorization'),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    });
    return new Response(purgeApi.status < 400 ? null : 'purge refused', { status: purgeApi.status });
  }
  if (url.origin !== new URL(edgeURL).origin) return realFetch(input, init);
  const method = (init.method ?? 'GET').toUpperCase();
  const parts = url.pathname.split('/').slice(1);
  const entry = {
    method,
    store: decodeURIComponent(parts[1] ?? ''),
    key: parts.length > 2 ? decodeURIComponent(parts.slice(2).join('/')) : null,
  };
  // `blobFaults.before` — `{ match(entry), run() }` — runs once, just before the first matching
  // call goes out: the way a scenario lands another request in the middle of this one. Cleared
  // before it runs, so the nested request's own blob calls pass straight through.
  if (blobFaults.before && blobFaults.before.match(entry)) {
    const hook = blobFaults.before;
    blobFaults.before = null;
    await hook.run();
  }
  if (method === 'PUT' && blobFaults.put) {
    const forced = blobFaults.put(entry);
    if (forced) return forced;
  }
  const response = await realFetch(input, init);
  if (
    blobFaults.etagReads &&
    (method === 'GET' || method === 'HEAD') &&
    entry.key !== null &&
    response.status === 200 &&
    !response.headers.has('etag')
  ) {
    const { dataPath } = server.getLocalPaths(url);
    const headers = new Headers(response.headers);
    headers.set('etag', await BlobsServer.generateETag(dataPath));
    return new Response(method === 'HEAD' ? null : await response.arrayBuffer(), {
      status: 200,
      headers,
    });
  }
  return response;
};

async function withBlobFaults(faults, run) {
  Object.assign(blobFaults, faults);
  try {
    return await run();
  } finally {
    blobFaults.put = null;
    blobFaults.etagReads = false;
    blobFaults.before = null;
  }
}

/** A blob call to `key` in site store `store` by `method` — the shape `blobFaults.before` matches. */
const blobCall = (method, store, key) => (entry) =>
  entry.method === method && entry.store === `site:${store}` && entry.key === key;

/** A PUT of `key` (any key: `null`) in `store` answered with `status`. The wire spells a site store `site:<name>`. */
const refusePut = (store, key, status = 403) => (entry) =>
  entry.store === `site:${store}` && (key === null || entry.key === key)
    ? new Response(`refused ${status}`, { status })
    : null;

const AUTH = `Basic ${Buffer.from('owner:a-long-enough-passphrase').toString('base64')}`;
const WRONG_AUTH = `Basic ${Buffer.from('owner:not-the-passphrase').toString('base64')}`;

let contentHandler;
let imagesHandler;
let uploadsHandler;
let getContent;
let getStore;
try {
  ({ default: contentHandler } = await import('../netlify/functions/admin-content.mts'));
  ({ default: imagesHandler } = await import('../netlify/functions/admin-images.mts'));
  ({ default: uploadsHandler } = await import('../netlify/functions/uploads.mts'));
  ({ getContent } = await import('../src/lib/server/content.ts'));
  ({ getStore } = await import('@netlify/blobs'));
} catch (error) {
  await server.stop();
  stop('one of the modules under test could not be loaded.', error?.stack ?? error);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * The site every request is addressed to — and so the site a publish asks to refresh. Starts as
 * a stand-in that refuses at once; `recordingSite` swaps in its own origin while it runs.
 */
const refusingSite = http.createServer((req, res) => {
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('no site here');
});
await new Promise((resolve) => refusingSite.listen(0, '127.0.0.1', resolve));
const REFUSING_ORIGIN = `http://127.0.0.1:${refusingSite.address().port}`;
let siteOrigin = REFUSING_ORIGIN;

function request(method, route, { body, auth = AUTH, headers: extra = {} } = {}) {
  const headers = auth === null ? {} : { authorization: auth };
  const init = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  Object.assign(headers, extra);
  return new Request(`${siteOrigin}${route}`, init);
}

const content = (method, route, options) => contentHandler(request(method, route, options));
const images = (method, route, options) => imagesHandler(request(method, route, options));
/** The public photo endpoint: no credentials, because a visitor has none. */
const serveUpload = (method, route) => uploadsHandler(request(method, route, { auth: null }));

/**
 * A stand-in for the deployed site, recording what the publish endpoint asks of it. The
 * function refreshes the origin the request reached, so addressing requests here is enough to
 * exercise the real path — headers included, which is the half that matters: the refresh
 * endpoint is auth-gated and a publish that forgot to forward its credentials would fail
 * silently in production.
 */
async function recordingSite(status) {
  const requests = [];
  const site = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization ?? null,
    });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: status < 400 }));
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  siteOrigin = `http://127.0.0.1:${site.address().port}`;
  return {
    requests,
    async stop() {
      siteOrigin = REFUSING_ORIGIN;
      // `fetch` keeps its socket alive, so a plain close() would wait for a timeout.
      site.closeAllConnections();
      await new Promise((resolve) => site.close(resolve));
    },
  };
}

/** Assert the status and hand back the parsed body, quoting it when the status is wrong —
 *  a bare "expected 200, got 400" hides the very issue list that explains why. */
async function expectJson(response, status) {
  const payload = await response.json();
  assert.equal(
    response.status,
    status,
    `expected ${status}, got ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

let failed = 0;
async function scenario(name, run) {
  try {
    await run();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.log(detail.split('\n').map((line) => `          ${line}`).join('\n'));
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const jpeg = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 214, g: 176, b: 122 } } })
    .jpeg({ quality: 80 })
    .toBuffer();

const png = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 58, g: 95, b: 168 } } })
    .png()
    .toBuffer();

/**
 * A JPEG over the 2 MB ceiling. Random noise, encoded at full quality without chroma
 * subsampling: a flat colour of any size compresses to a few kilobytes, and a fixture that
 * tripped the magic-byte check instead of the size check would pass for the wrong reason.
 */
async function oversizedJpeg(limit) {
  for (const size of [1400, 2200, 3000]) {
    const noise = Buffer.allocUnsafe(size * size * 3);
    for (let offset = 0; offset < noise.length; offset += 65536) {
      randomFillSync(noise, offset, Math.min(65536, noise.length - offset));
    }
    const buffer = await sharp(noise, { raw: { width: size, height: size, channels: 3 } })
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .toBuffer();
    if (buffer.length > limit) return { buffer, size };
  }
  throw new Error('could not generate a JPEG over the size limit');
}

/** `small`: `{ buffer, width, height, type? }` — the 800px copy the editor sends with a wide photo. */
function upload(buffer, { width, height, name, type = 'image/jpeg', small = null }) {
  const form = new FormData();
  form.set('file', new Blob([buffer], { type }), name);
  form.set('width', String(width));
  form.set('height', String(height));
  form.set('name', name);
  if (small !== null) {
    form.set('small', new Blob([small.buffer], { type: small.type ?? 'image/jpeg' }), 'small.jpg');
    form.set('smallWidth', String(small.width));
    form.set('smallHeight', String(small.height));
  }
  return images('POST', '/admin/api/images', { body: form });
}

/** A photo nothing references yet, uploaded fresh — what each race scenario starts from. */
async function freshPhoto(name, { width = 240, height = 180 } = {}) {
  const small =
    width > 800
      ? { buffer: await jpeg(800, Math.round((height * 800) / width)), width: 800, height: Math.round((height * 800) / width) }
      : null;
  const { image } = await expectJson(
    await upload(await jpeg(width, height), { width, height, name, small }),
    201,
  );
  return { image, small };
}

/** The current home document, with one edit applied — the shape every content scenario uses. */
function homeWith(edit) {
  const document = structuredClone(HOME_SEED);
  edit(document);
  return document;
}

/** The gate's opening-hours range, as `scripts/verify-build.mjs` matches it (no `g` flag: a
 *  sticky lastIndex would make the same test alternate between true and false). */
/** Where a document states the hours: the `{hours}` token, or a range typed out. */
const HOURS_RANGE =
  /\{hours\}|\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:–|—|-|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i;

/**
 * The first string in a document that renders an opening-hours range, with a handle to rewrite
 * it. Found rather than hard-coded so the parity check below survives an edit to the seed copy.
 */
function findHoursField(document) {
  let found = null;
  const walk = (value, path, parent, key) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`, value, index));
    } else if (value !== null && typeof value === 'object') {
      for (const [name, entry] of Object.entries(value)) {
        walk(entry, path === '' ? name : `${path}.${name}`, value, name);
      }
    } else if (found === null && typeof value === 'string' && HOURS_RANGE.test(value)) {
      found = { path, parent, key, value };
    }
  };
  walk(document, '', null, null);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Auth posture
// ---------------------------------------------------------------------------

const ENDPOINTS = [
  { label: 'content', call: content, route: '/admin/api/content/home' },
  { label: 'images', call: images, route: '/admin/api/images' },
];

console.log('\nadmin smoke test\n');

await scenario('auth: unconfigured credentials fail closed with 503', async () => {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  try {
    for (const { label, call, route } of ENDPOINTS) {
      const response = await call('GET', route);
      assert.equal(response.status, 503, `${label} answered ${response.status}`);
    }
  } finally {
    process.env.ADMIN_USERNAME = ADMIN_USERNAME;
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  }
});

await scenario('auth: no credentials and wrong credentials both get 401', async () => {
  for (const { label, call, route } of ENDPOINTS) {
    for (const auth of [null, WRONG_AUTH]) {
      const response = await call('GET', route, { auth });
      assert.equal(response.status, 401, `${label} answered ${response.status}`);
      assert.match(response.headers.get('www-authenticate') ?? '', /^Basic realm=/);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Content: read, validate, publish, snapshot, restore
// ---------------------------------------------------------------------------

await scenario('content: an unsaved page serves the committed seed', async () => {
  const payload = await expectJson(await content('GET', '/admin/api/content/home'), 200);
  assert.equal(payload.source, 'seed');
  assert.deepEqual(payload.document, HOME_SEED);
});

await scenario('content: an unknown page is a 404', async () => {
  const payload = await expectJson(await content('GET', '/admin/api/content/specials'), 404);
  assert.equal(payload.ok, false);
});

await scenario('content: an empty blob serves the committed seed', async () => {
  // A key with nothing in it — wiped, or half-written — is "nothing saved", not corruption:
  // there is no saved copy a fallback could hide, and the seed is what the site shows.
  const store = getStore('site-content', { consistency: 'strong' });
  await store.set('about.json', '   ');
  const payload = await expectJson(await content('GET', '/admin/api/content/about'), 200);
  assert.equal(payload.source, 'seed');
  assert.deepEqual(payload.document, ABOUT_SEED);
});

await scenario('content: publishing over an empty blob keeps no empty version', async () => {
  const document = structuredClone(ABOUT_SEED);
  document.intro.lede = `${document.intro.lede} Come find us.`;
  await expectJson(await content('PUT', '/admin/api/content/about', { body: { document } }), 200);
  const saved = await expectJson(await content('GET', '/admin/api/content/about'), 200);
  assert.equal(saved.source, 'blob');
  assert.equal(saved.document.intro.lede, document.intro.lede);
  // An empty page is not a version worth restoring, so none was kept.
  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/about/versions'),
    200,
  );
  assert.equal(versions.length, 0);
});

await scenario('content: a blob that holds no page document is reported, not defaulted', async () => {
  // Valid JSON that is not a page (`null` here) is content the site cannot render. Unlike an
  // empty blob it might be the wreck of a real save, so the API says so and points at version
  // history instead of quietly serving the seed. Written to `menu.json`, which no later
  // scenario publishes, and cleared again so the plugin scenarios see an unsaved menu.
  const store = getStore('site-content', { consistency: 'strong' });
  await store.set('menu.json', 'null');
  const payload = await expectJson(await content('GET', '/admin/api/content/menu'), 500);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0].message, /not a page document/);
  await store.delete('menu.json');
  const cleared = await expectJson(await content('GET', '/admin/api/content/menu'), 200);
  assert.equal(cleared.source, 'seed');
});

await scenario('content: copy that breaks a rule is refused with the offending path', async () => {
  const document = homeWith((home) => {
    home.hero.lede = `${home.hero.lede} ${BANNED_WORD}`;
  });
  const payload = await expectJson(
    await content('PUT', '/admin/api/content/home', { body: { document } }),
    400,
  );
  assert.equal(payload.ok, false);
  assert.ok(
    payload.issues.some((issue) => issue.path === 'hero.lede'),
    `expected an issue on hero.lede, got ${JSON.stringify(payload.issues)}`,
  );
});

/**
 * The menu is bespoke, but its `page` wording is walked by the field-spec engine: these pin that
 * the walk is actually wired into the menu validator the publish endpoint runs — copy rules on
 * a nested list entry, and the structural check on a value the page has no drawing for.
 */
await scenario('content: menu page wording that breaks a rule is refused with its path', async () => {
  const document = structuredClone(MENU_SEED);
  document.page.goodToKnow.notes[0].body = `${document.page.goodToKnow.notes[0].body} ${BANNED_WORD}`;
  const payload = await expectJson(
    await content('PUT', '/admin/api/content/menu', { body: { document } }),
    400,
  );
  assert.ok(
    payload.issues.some((issue) => issue.path === 'page.goodToKnow.notes[0].body'),
    `expected an issue on page.goodToKnow.notes[0].body, got ${JSON.stringify(payload.issues)}`,
  );
});

await scenario('content: a menu note icon the page cannot draw is refused', async () => {
  const document = structuredClone(MENU_SEED);
  document.page.goodToKnow.notes[0].icon = 'rocket';
  const payload = await expectJson(
    await content('PUT', '/admin/api/content/menu', { body: { document } }),
    400,
  );
  assert.ok(
    payload.issues.some((issue) => issue.path === 'page.goodToKnow.notes[0].icon'),
    `expected an issue on page.goodToKnow.notes[0].icon, got ${JSON.stringify(payload.issues)}`,
  );
});

/**
 * Gate-validator parity, the failure CLAUDE.md warns about loudest: a rule the acceptance gate
 * enforces on rendered copy but the publish validator does not check would let the owner save
 * cleanly and then wedge *every* deploy after it, because the blob feeds the bad copy into each
 * rebuild. Until this wave only the menu page rendered owner-editable text; three more pages do
 * now, so the two rule families reachable from their copy are pinned here. Both markers are read
 * from the canonical rules JSON, never typed in.
 */
await scenario('content: hours or open days that contradict the spec are refused', async () => {
  // Every common way of writing hours, not only the one the pages print: dotted a.m./p.m.,
  // "until", a day range that takes in the closed day, an "open daily" claim — and
  // no-break spaces and a non-breaking hyphen, which must read as what they look like.
  const wrong = [
    '10:00 AM – 3:00 PM',
    'Sunday–Friday, 7 a.m. – 2 p.m.',
    '7 AM until 2 PM',
    'Monday–Saturday, 9:00 AM – 4:00 PM.',
    'Open daily.',
    '7\u00A0AM\u20112\u00A0PM',
  ];
  for (const replacement of wrong) {
    const document = structuredClone(DIRECTIONS_SEED);
    const field = findHoursField(document);
    assert.ok(field, 'the directions seed states no opening hours to test the gate against');
    field.parent[field.key] = field.value.replace(HOURS_RANGE, replacement);

    const payload = await expectJson(
      await content('PUT', '/admin/api/content/directions', { body: { document } }),
      400,
    );
    assert.ok(
      payload.issues.some((issue) => issue.path === field.path),
      `"${replacement}": expected an issue on ${field.path}, got ${JSON.stringify(payload.issues)}`,
    );
  }
});

await scenario('content: a template placeholder in the copy is refused', async () => {
  const marker = RULES.placeholders[0];
  assert.equal(typeof marker, 'string', 'content-rules.json has no placeholder markers');
  const document = homeWith((home) => {
    home.hero.lede = `${home.hero.lede} ${marker}`;
  });
  const payload = await expectJson(
    await content('PUT', '/admin/api/content/home', { body: { document } }),
    400,
  );
  assert.ok(
    payload.issues.some((issue) => issue.path === 'hero.lede'),
    `expected an issue on hero.lede, got ${JSON.stringify(payload.issues)}`,
  );
});

const FIRST_LEDE = `${HOME_SEED.hero.lede} Fresh bannock every morning.`;
const SECOND_LEDE = `${HOME_SEED.hero.lede} Fresh bannock every afternoon.`;
const REFRESHED_LEDE = `${HOME_SEED.hero.lede} Sourdough on Fridays.`;
const UNREFRESHED_LEDE = `${HOME_SEED.hero.lede} Soup most afternoons.`;
const LOADED_LEDE = `${HOME_SEED.hero.lede} Coffee from open to close.`;

await scenario('content: a valid save publishes and stamps updatedAt', async () => {
  const document = homeWith((home) => {
    home.hero.lede = FIRST_LEDE;
  });
  const payload = await expectJson(
    await content('PUT', '/admin/api/content/home', { body: { document } }),
    200,
  );
  assert.equal(payload.ok, true);
  assert.equal(payload.revalidated, false, 'the stand-in site refuses the refresh, and that must not fail the save');
  assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const saved = await expectJson(await content('GET', '/admin/api/content/home'), 200);
  assert.equal(saved.source, 'blob');
  assert.equal(saved.document.hero.lede, FIRST_LEDE);
  assert.equal(saved.updatedAt, payload.updatedAt);
});

await scenario('content: a second save snapshots exactly one version', async () => {
  const document = homeWith((home) => {
    home.hero.lede = SECOND_LEDE;
  });
  await expectJson(await content('PUT', '/admin/api/content/home', { body: { document } }), 200);

  const payload = await expectJson(await content('GET', '/admin/api/content/home/versions'), 200);
  assert.equal(payload.versions.length, 1);
  assert.ok(payload.versions[0].key.startsWith('home-versions/'));
  assert.match(payload.versions[0].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

await scenario('content: restore brings the previous copy back', async () => {
  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/home/versions'),
    200,
  );
  const payload = await expectJson(
    await content('POST', '/admin/api/content/home/restore', { body: { key: versions[0].key } }),
    200,
  );
  assert.equal(payload.ok, true);

  const restored = await expectJson(await content('GET', '/admin/api/content/home'), 200);
  assert.equal(restored.document.hero.lede, FIRST_LEDE);
});

await scenario('content: a menu snapshot from before the page wording restores', async () => {
  // Restore re-validates the snapshot against today's validator, so a version saved before the
  // `page` block existed must still pass — the other half of keeping that block optional.
  const older = structuredClone(MENU_SEED);
  delete older.page;
  older.intro = `${older.intro} Saved before the page wording.`;
  await expectJson(await content('PUT', '/admin/api/content/menu', { body: { document: older } }), 200);

  const newer = structuredClone(MENU_SEED);
  newer.page.sectionsTitle = 'On the menu today';
  await expectJson(await content('PUT', '/admin/api/content/menu', { body: { document: newer } }), 200);

  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/menu/versions'),
    200,
  );
  await expectJson(
    await content('POST', '/admin/api/content/menu/restore', { body: { key: versions[0].key } }),
    200,
  );

  const restored = await expectJson(await content('GET', '/admin/api/content/menu'), 200);
  assert.equal(restored.document.intro, older.intro);
  assert.equal(restored.document.page, undefined);
});

await scenario('content: restore refuses a key outside this page history', async () => {
  const foreign = await expectJson(
    await content('POST', '/admin/api/content/home/restore', {
      body: { key: 'about-versions/2026-01-01T00:00:00.000Z.json' },
    }),
    400,
  );
  assert.equal(foreign.issues[0].path, 'key');

  // A prefix test on its own would let this one through to a store that resolves keys as paths.
  await expectJson(
    await content('POST', '/admin/api/content/home/restore', {
      body: { key: 'home-versions/../home.json' },
    }),
    400,
  );

  await expectJson(
    await content('POST', '/admin/api/content/home/restore', {
      body: { key: 'home-versions/1999-01-01T00:00:00.000Z.json' },
    }),
    404,
  );
});

/**
 * The publish -> live-site handshake. v1 POSTed a build hook and the owner waited for a deploy;
 * the pages now read the store at request time behind a 60-second cache, so a save's last act is
 * to ask the site to drop that cache. Both halves are pinned: that the call is made with the
 * caller's own credentials, and that a save survives it failing — the document is already
 * written, and a refresh that could fail a publish would be worse than the minute of staleness
 * it saves.
 */
await scenario('content: a publish asks the site to refresh', async () => {
  const site = await recordingSite(200);
  try {
    const document = homeWith((home) => {
      home.hero.lede = REFRESHED_LEDE;
    });
    const payload = await expectJson(
      await content('PUT', '/admin/api/content/home', { body: { document } }),
      200,
    );
    assert.equal(payload.revalidated, true);
    assert.deepEqual(
      site.requests,
      [{ method: 'POST', url: '/admin/api/revalidate/', authorization: AUTH }],
      'the publish should make exactly one refresh call, carrying the caller’s credentials',
    );
  } finally {
    await site.stop();
  }
});

await scenario('content: a publish still succeeds when the refresh call fails', async () => {
  const site = await recordingSite(500);
  try {
    const document = homeWith((home) => {
      home.hero.lede = UNREFRESHED_LEDE;
    });
    const payload = await expectJson(
      await content('PUT', '/admin/api/content/home', { body: { document } }),
      200,
    );
    assert.equal(payload.ok, true);
    assert.equal(payload.revalidated, false);
    assert.equal(site.requests.length, 1);

    const saved = await expectJson(await content('GET', '/admin/api/content/home'), 200);
    assert.equal(saved.document.hero.lede, UNREFRESHED_LEDE, 'the save must have landed anyway');
  } finally {
    await site.stop();
  }
});

/** The stored home lede and the number of home snapshots, read straight from the store. */
async function homeState() {
  const store = getStore('site-content', { consistency: 'strong' });
  const raw = await store.get('home.json', { type: 'text' });
  const { blobs } = await store.list({ prefix: 'home-versions/' });
  return { lede: JSON.parse(raw).hero.lede, versions: blobs.length };
}

/**
 * `@netlify/blobs` answers a conditional write with `{ modified: true }` for any status but 412,
 * so a store that refuses the save must still be reported as a failure: nothing published, no
 * refresh, no stray snapshot. Reads carry etags here, so every save is the conditional write it
 * is in production.
 */
await scenario('content: a save the store refuses is reported, not published', async () => {
  const site = await recordingSite(200);
  try {
    const before = await homeState();
    const document = homeWith((home) => {
      home.hero.lede = `${HOME_SEED.hero.lede} Refused by the store.`;
    });
    for (const key of ['home.json', null]) {
      // First the page write is refused, then every write (the snapshot goes first).
      const response = await withBlobFaults(
        { etagReads: true, put: refusePut('site-content', key) },
        () => content('PUT', '/admin/api/content/home', { body: { document } }),
      );
      const payload = await expectJson(response, 503);
      assert.equal(payload.ok, false);
      assert.deepEqual(await homeState(), before, 'the store must be exactly as it was');
    }
    assert.deepEqual(site.requests, [], 'a save that did not land must not refresh the site');

    // The same save goes through once the store accepts it, conditional write and all.
    const landed = await withBlobFaults({ etagReads: true }, () =>
      content('PUT', '/admin/api/content/home', { body: { document } }),
    );
    await expectJson(landed, 200);
    assert.equal((await homeState()).lede, document.hero.lede);
  } finally {
    await site.stop();
  }
});

await scenario('content: a save based on an older version is refused with 409', async () => {
  const loaded = await expectJson(await content('GET', '/admin/api/content/home'), 200);
  const base = loaded.updatedAt;
  const first = homeWith((home) => {
    home.hero.lede = `${HOME_SEED.hero.lede} Edited on the phone.`;
  });
  const published = await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document: first, baseUpdatedAt: base },
    }),
    200,
  );

  // A second tab still holding `base` must not overwrite what the first one published.
  const stale = homeWith((home) => {
    home.hero.lede = `${HOME_SEED.hero.lede} Edited on the laptop.`;
  });
  const refused = await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document: stale, baseUpdatedAt: base },
    }),
    409,
  );
  assert.equal(refused.ok, false);
  // `null` means "I started from nothing saved", which is not true of home any more.
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document: stale, baseUpdatedAt: null },
    }),
    409,
  );
  assert.equal((await homeState()).lede, first.hero.lede);

  // Based on the version that is actually live, the same edit goes through.
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document: stale, baseUpdatedAt: published.updatedAt },
    }),
    200,
  );
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document: stale, baseUpdatedAt: 42 },
    }),
    400,
  );
});

await scenario('content: version history is labelled by when each version was published', async () => {
  const stamps = [];
  for (const word of ['one', 'two', 'three']) {
    const document = homeWith((home) => {
      home.hero.lede = `${HOME_SEED.hero.lede} Version ${word}.`;
    });
    const payload = await expectJson(
      await content('PUT', '/admin/api/content/home', { body: { document } }),
      200,
    );
    stamps.push(payload.updatedAt);
  }
  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/home/versions'),
    200,
  );
  // The newest snapshot holds version two: labelled with two's publish time, replaced by three.
  assert.equal(versions[0].updatedAt, stamps[1]);
  assert.equal(versions[0].replacedAt, stamps[2]);
  assert.equal(versions[1].updatedAt, stamps[0]);
  // Each save's snapshot key is its own, so a racing save can never delete another's.
  assert.match(versions[0].key, /^home-versions\/\d{4}-\d{2}-\d{2}T[\d:.]+Z-[a-z0-9]{6}\.json$/);

  const restored = await expectJson(
    await content('POST', '/admin/api/content/home/restore', { body: { key: versions[0].key } }),
    200,
  );
  assert.equal(restored.ok, true);
  assert.equal((await homeState()).lede, `${HOME_SEED.hero.lede} Version two.`);
});

await scenario('content: a snapshot saved under the older key format still lists and restores', async () => {
  const store = getStore('site-content', { consistency: 'strong' });
  const older = homeWith((home) => {
    home.hero.lede = `${HOME_SEED.hero.lede} From the old history.`;
  });
  older.updatedAt = '2020-01-01T09:00:00.000Z';
  const key = 'home-versions/2020-01-02T09:00:00.000Z.json';
  await store.set(key, JSON.stringify(older));
  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/home/versions'),
    200,
  );
  const entry = versions.find((version) => version.key === key);
  assert.ok(entry, 'the older snapshot is missing from the listing');
  assert.equal(entry.updatedAt, older.updatedAt, 'labelled by its own publish time, read from the blob');
  await expectJson(
    await content('POST', '/admin/api/content/home/restore', { body: { key } }),
    200,
  );
  assert.equal((await homeState()).lede, older.hero.lede);
});

await scenario('content: restoring a damaged snapshot answers 422 with an owner message', async () => {
  const store = getStore('site-content', { consistency: 'strong' });
  const before = await homeState();
  // Unparseable bytes, under a key in today's format, so only the content is wrong.
  const garbled = 'home-versions/2021-03-04T05:06:07.000Z-zz9zz9.json';
  await store.set(garbled, '{"version":1,"hero":{"lede":"cut off mid-wri');
  const damaged = await expectJson(
    await content('POST', '/admin/api/content/home/restore', { body: { key: garbled } }),
    422,
  );
  assert.equal(damaged.ok, false);
  assert.match(damaged.issues[0].message, /damaged and can't be restored/);

  // Valid JSON that is no longer a page document is just as unrestorable.
  const misshapen = 'home-versions/2021-03-04T05:06:08.000Z-zz8zz8.json';
  await store.set(misshapen, JSON.stringify({ version: 1, hero: 'not a section' }));
  const shapeless = await expectJson(
    await content('POST', '/admin/api/content/home/restore', { body: { key: misshapen } }),
    422,
  );
  assert.match(shapeless.issues[0].message, /damaged and can't be restored/);

  // The damaged entries still list (labelled by their key's time), and nothing went live.
  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/home/versions'),
    200,
  );
  assert.ok(versions.some((version) => version.key === garbled));
  await store.delete(garbled);
  await store.delete(misshapen);
  assert.deepEqual(await homeState(), before);
});

await scenario('content: the directions FAQ publishes with the {hours} token, not hand-typed hours', async () => {
  // The default answers "What are your hours?" with the token; it publishes as-is…
  const withToken = structuredClone(DIRECTIONS_SEED);
  await expectJson(
    await content('PUT', '/admin/api/content/directions', { body: { document: withToken } }),
    200,
  );
  // …while the same answer typed out by hand (correct today, stale after the next change) is
  // refused with a pointer to the token, and the token anywhere else is refused too.
  const handTyped = structuredClone(DIRECTIONS_SEED);
  const faq = handTyped.faq.items.find((item) => item.answer.includes('{hours}'));
  assert.ok(faq, 'the directions default no longer uses {hours}');
  faq.answer = 'Sunday–Friday, 9:00 AM – 4:00 PM. Closed Saturday.';
  const refused = await expectJson(
    await content('PUT', '/admin/api/content/directions', { body: { document: handTyped } }),
    400,
  );
  assert.ok(refused.issues.some((issue) => /\{hours\}/.test(issue.message)));
  const misplaced = structuredClone(DIRECTIONS_SEED);
  misplaced.tips.items[0] = 'We are here {hours}';
  await expectJson(
    await content('PUT', '/admin/api/content/directions', { body: { document: misplaced } }),
    400,
  );

  // The steer is advisory: a version saved before it existed — the right hours, typed by hand —
  // still restores, because a snapshot can't be edited first.
  const store = getStore('site-content', { consistency: 'strong' });
  const key = 'directions-versions/2021-05-06T07:08:09.000Z-old0ld.json';
  await store.set(key, JSON.stringify({ ...handTyped, updatedAt: '2021-05-06T07:00:00.000Z' }));
  await expectJson(
    await content('POST', '/admin/api/content/directions/restore', { body: { key } }),
    200,
  );
  const live = await expectJson(await content('GET', '/admin/api/content/directions'), 200);
  assert.ok(live.document.faq.items.some((item) => item.answer === faq.answer));
  // Wrong hours in a snapshot are still refused: only the steer is advisory.
  const stale = structuredClone(handTyped);
  stale.faq.items.find((item) => item.answer === faq.answer).answer = 'Sunday–Friday, 8 AM – 3 PM.';
  const staleKey = 'directions-versions/2021-05-06T07:08:10.000Z-old1ld.json';
  await store.set(staleKey, JSON.stringify(stale));
  await expectJson(
    await content('POST', '/admin/api/content/directions/restore', { body: { key: staleKey } }),
    400,
  );
  await store.delete(staleKey);
});

await scenario('content: writes from another website, or not sent as JSON, are refused', async () => {
  const before = await homeState();
  const document = homeWith((home) => {
    home.hero.lede = `${HOME_SEED.hero.lede} Sent from elsewhere.`;
  });
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document },
      headers: { origin: 'https://elsewhere.example' },
    }),
    403,
  );
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document },
      headers: { 'content-type': 'text/plain' },
    }),
    415,
  );
  const { versions } = await expectJson(
    await content('GET', '/admin/api/content/home/versions'),
    200,
  );
  await expectJson(
    await content('POST', '/admin/api/content/home/restore', {
      body: { key: versions[0].key },
      headers: { origin: 'null' },
    }),
    403,
  );
  assert.deepEqual(await homeState(), before);

  // The site's own origin, and no origin at all (server-side callers), still go through.
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document },
      headers: { origin: siteOrigin },
    }),
    200,
  );
});

await scenario('content: a field added as optional does not break documents saved before it', async () => {
  // `hero.accentWord` is an optional text field: a stored page without the key must publish
  // and load, with the field read as blank.
  const document = homeWith((home) => {
    delete home.hero.accentWord;
  });
  await expectJson(await content('PUT', '/admin/api/content/home', { body: { document } }), 200);
  const loaded = await getContent('home');
  assert.equal(loaded.document.hero.accentWord, '');
});

// ---------------------------------------------------------------------------
// 3. Photos: upload, list, serve, reference, delete
// ---------------------------------------------------------------------------

let photo = null;

await scenario('images: a JPEG upload is stored and listed', async () => {
  const bytes = await jpeg(240, 180);
  const payload = await expectJson(
    await upload(bytes, { width: 240, height: 180, name: 'front-counter.jpg' }),
    201,
  );
  assert.equal(payload.ok, true);
  photo = payload.image;
  assert.match(photo.id, /^\d{8}-\d{6}-[a-z0-9]{6}\.jpg$/);
  assert.equal(photo.width, 240);
  assert.equal(photo.height, 180);
  assert.equal(photo.bytes, bytes.length);
  assert.equal(photo.originalName, 'front-counter.jpg');

  const listing = await expectJson(await images('GET', '/admin/api/images'), 200);
  const found = listing.images.find((image) => image.id === photo.id);
  assert.ok(found, 'the upload is missing from the library listing');
  assert.deepEqual(found.usedBy, []);
  assert.equal(found.bytes, bytes.length);
});

await scenario('images: the bytes come back as a JPEG', async () => {
  const response = await images('GET', `/admin/api/images/${photo.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(body.length, photo.bytes);
  assert.deepEqual([...body.slice(0, 3)], [0xff, 0xd8, 0xff]);
});

await scenario('images: an unknown id is a 404 and a malformed one a 400', async () => {
  await expectJson(await images('GET', '/admin/api/images/20260101-000000-zzzzzz.jpg'), 404);
  await expectJson(await images('GET', '/admin/api/images/not-an-id'), 400);
});

await scenario('images: a photo in use cannot be deleted', async () => {
  const document = homeWith((home) => {
    home.hero.lede = FIRST_LEDE;
    home.bannock.photo.image = { id: photo.id, width: photo.width, height: photo.height };
  });
  await expectJson(await content('PUT', '/admin/api/content/home', { body: { document } }), 200);

  const listing = await expectJson(await images('GET', '/admin/api/images'), 200);
  const found = listing.images.find((image) => image.id === photo.id);
  assert.deepEqual(found.usedBy, ['home']);

  const refused = await expectJson(await images('DELETE', `/admin/api/images/${photo.id}`), 409);
  assert.equal(refused.ok, false);
  assert.ok(refused.issues[0].message.length > 0);
});

await scenario('images: once the reference is cleared the photo deletes', async () => {
  const document = homeWith((home) => {
    home.hero.lede = FIRST_LEDE;
    home.bannock.photo.image = null;
  });
  await expectJson(await content('PUT', '/admin/api/content/home', { body: { document } }), 200);

  // The page no longer shows it, but the version just replaced does — and a restore would put
  // it back on the site — so the library still refuses, naming the history.
  // The library says so up front: not on a page, but held by the home page's history.
  const listing = await expectJson(await images('GET', '/admin/api/images'), 200);
  const listed = listing.images.find((image) => image.id === photo.id);
  assert.deepEqual(listed.usedBy, []);
  assert.deepEqual(listed.inHistory, ['home']);
  const kept = await expectJson(await images('DELETE', `/admin/api/images/${photo.id}`), 409);
  assert.match(kept.issues[0].message, /saved versions/);

  // Once no saved version holds it either, it deletes.
  const store = getStore('site-content', { consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'home-versions/' });
  for (const blob of blobs) {
    const raw = await store.get(decodeURIComponent(blob.key), { type: 'text' });
    if (raw?.includes(photo.id)) await store.delete(decodeURIComponent(blob.key));
  }
  const cleared = await expectJson(await images('GET', '/admin/api/images'), 200);
  assert.deepEqual(cleared.images.find((image) => image.id === photo.id).inHistory, []);
  const payload = await expectJson(await images('DELETE', `/admin/api/images/${photo.id}`), 200);
  assert.equal(payload.ok, true);
  await expectJson(await images('GET', `/admin/api/images/${photo.id}`), 404);
});

await scenario('images: a page that shows a deleted photo is refused, naming the slot', async () => {
  // `photo` was deleted just above. Publishing it (or restoring a version holding it) would put
  // a broken picture on the live page.
  const document = homeWith((home) => {
    home.bannock.photo.image = { id: photo.id, width: photo.width, height: photo.height };
  });
  const payload = await expectJson(
    await content('PUT', '/admin/api/content/home', { body: { document } }),
    400,
  );
  assert.equal(payload.issues[0].path, 'bannock.photo.image');
  assert.match(payload.issues[0].message, /no longer in the photo library/);
});

/** Every key under `prefix` in the content store, as written. */
async function contentKeys(prefix) {
  const { blobs } = await getStore('site-content', { consistency: 'strong' }).list({ prefix });
  return blobs.map((blob) => decodeURIComponent(blob.key)).sort();
}

await scenario('race: a delete that lands mid-publish rolls the publish back', async () => {
  // The publish checks its photos, then — before its write — the delete checks the documents,
  // finds nothing using the photo and removes it. The publish's re-check after its write must
  // catch that and put the previous page back.
  const { image } = await freshPhoto('mid-publish.jpg');
  const store = getStore('site-content', { consistency: 'strong' });
  const before = await store.get('home.json', { type: 'text' });
  const snapshotsBefore = await contentKeys('home-versions/');
  let deleted = null;

  const document = homeWith((home) => {
    home.hero.lede = SECOND_LEDE;
    home.bannock.photo.image = { id: image.id, width: image.width, height: image.height };
  });
  const response = await withBlobFaults(
    {
      before: {
        match: blobCall('PUT', 'site-content', 'home.json'),
        run: async () => {
          deleted = await expectJson(await images('DELETE', `/admin/api/images/${image.id}`), 200);
        },
      },
    },
    () => content('PUT', '/admin/api/content/home', { body: { document } }),
  );
  assert.ok(deleted?.ok, 'the delete never ran in the middle of the publish');

  const payload = await expectJson(response, 409);
  assert.equal(payload.issues[0].path, 'bannock.photo.image');
  assert.match(payload.issues[0].message, /deleted while you were publishing/);
  assert.equal(await store.get('home.json', { type: 'text' }), before, 'the previous page is back');
  assert.deepEqual(
    await contentKeys('home-versions/'),
    snapshotsBefore,
    'the rolled-back save left a snapshot behind',
  );
  await expectJson(await images('GET', `/admin/api/images/${image.id}`), 404);
});

await scenario('race: a publish that lands mid-delete puts the photo back exactly', async () => {
  // The other order: the delete checks the documents, then — before it removes anything — a
  // publish showing the photo checks it (still there) and lands. The delete's re-check after
  // its own delete must find that and restore the photo and its small copy, bytes and all.
  const { image } = await freshPhoto('mid-delete.jpg', { width: 1200, height: 900 });
  const imageStore = getStore('site-images', { consistency: 'strong' });
  const mainBefore = await imageStore.getWithMetadata(image.id, { type: 'arrayBuffer' });
  const smallBefore = await imageStore.getWithMetadata(`w800/${image.id}`, { type: 'arrayBuffer' });
  assert.ok(smallBefore, 'the small copy was not stored on upload');
  let published = null;

  const document = homeWith((home) => {
    home.hero.lede = SECOND_LEDE;
    home.bannock.photo.image = { id: image.id, width: image.width, height: image.height };
  });
  const response = await withBlobFaults(
    {
      before: {
        match: blobCall('DELETE', 'site-images', image.id),
        run: async () => {
          published = await expectJson(
            await content('PUT', '/admin/api/content/home', { body: { document } }),
            200,
          );
        },
      },
    },
    () => images('DELETE', `/admin/api/images/${image.id}`),
  );
  assert.ok(published?.ok, 'the publish never ran in the middle of the delete');

  const refused = await expectJson(response, 409);
  assert.match(refused.issues[0].message, /still in use on/);
  const mainAfter = await imageStore.getWithMetadata(image.id, { type: 'arrayBuffer' });
  const smallAfter = await imageStore.getWithMetadata(`w800/${image.id}`, { type: 'arrayBuffer' });
  assert.deepEqual(Buffer.from(mainAfter.data), Buffer.from(mainBefore.data));
  assert.deepEqual(mainAfter.metadata, mainBefore.metadata);
  assert.deepEqual(Buffer.from(smallAfter.data), Buffer.from(smallBefore.data));
  assert.deepEqual(smallAfter.metadata, smallBefore.metadata);
  assert.equal((await serveUpload('GET', `/images/uploads/${image.id}`)).status, 200);
  assert.equal((await serveUpload('GET', `/images/uploads/w800/${image.id}`)).status, 200);

  // Leave the home page as the scenarios below expect it: no photo.
  await expectJson(
    await content('PUT', '/admin/api/content/home', {
      body: { document: homeWith((home) => void (home.hero.lede = SECOND_LEDE)) },
    }),
    200,
  );
});

await scenario('images: a delete purges the CDN copy through Netlify, best-effort', async () => {
  const saved = { token: process.env.NETLIFY_PURGE_API_TOKEN, site: process.env.SITE_ID };
  process.env.NETLIFY_PURGE_API_TOKEN = 'smoke-purge-token';
  process.env.SITE_ID = 'smoke-site-id';
  purgeApi.calls = [];
  try {
    const { image } = await freshPhoto('purged.jpg', { width: 1000, height: 750 });
    await expectJson(await images('DELETE', `/admin/api/images/${image.id}`), 200);
    assert.equal(purgeApi.calls.length, 1, 'one purge call per delete');
    const [call] = purgeApi.calls;
    assert.equal(call.method, 'POST');
    assert.equal(call.path, '/api/v1/purge');
    assert.equal(call.authorization, 'Bearer smoke-purge-token');
    // One tag covers the photo and its small copy: `uploads.mts` stamps both with it.
    assert.deepEqual(call.body.cache_tags, [`upload-${image.id}`]);
    assert.equal(call.body.site_id, 'smoke-site-id');
    const store = getStore('site-images', { consistency: 'strong' });
    assert.equal(await store.getMetadata(`w800/${image.id}`), null, 'the small copy was left behind');

    // A purge the API refuses is logged, never a failed delete — the photo is already gone.
    purgeApi.status = 500;
    const { image: second } = await freshPhoto('purge-refused.jpg');
    await expectJson(await images('DELETE', `/admin/api/images/${second.id}`), 200);
    assert.equal(purgeApi.calls.length, 2);
  } finally {
    purgeApi.status = 200;
    if (saved.token === undefined) delete process.env.NETLIFY_PURGE_API_TOKEN;
    else process.env.NETLIFY_PURGE_API_TOKEN = saved.token;
    if (saved.site === undefined) delete process.env.SITE_ID;
    else process.env.SITE_ID = saved.site;
  }
});

await scenario('images: without a purge token a delete skips the purge', async () => {
  purgeApi.calls = [];
  const { image } = await freshPhoto('unpurged.jpg');
  await expectJson(await images('DELETE', `/admin/api/images/${image.id}`), 200);
  assert.equal(purgeApi.calls.length, 0);
});

await scenario('images: a wide photo stores its 800px copy, which the library never lists', async () => {
  const smallBytes = await jpeg(800, 600);
  const { image } = await expectJson(
    await upload(await jpeg(1200, 900), {
      width: 1200,
      height: 900,
      name: 'wide.jpg',
      small: { buffer: smallBytes, width: 800, height: 600 },
    }),
    201,
  );
  const listing = await expectJson(await images('GET', '/admin/api/images'), 200);
  assert.ok(listing.images.some((entry) => entry.id === image.id));
  assert.ok(
    listing.images.every((entry) => !entry.id.includes('/')),
    'a small copy was listed as a photo of its own',
  );
  const stored = await getStore('site-images', { consistency: 'strong' }).getMetadata(
    `w800/${image.id}`,
  );
  assert.deepEqual(stored.metadata, { width: 800, height: 600, bytes: smallBytes.length });
  await expectJson(await images('DELETE', `/admin/api/images/${image.id}`), 200);
});

await scenario('images: a small copy that is not what srcset would claim is refused', async () => {
  const wide = await jpeg(1200, 900);
  const cases = [
    // Not 800 wide.
    [{ width: 1200, height: 900, small: { buffer: await jpeg(640, 480), width: 640, height: 480 } }, 400],
    // The wrong shape.
    [{ width: 1200, height: 900, small: { buffer: await jpeg(800, 800), width: 800, height: 800 } }, 400],
    // A photo no wider than its copy would be.
    [{ width: 800, height: 600, small: { buffer: await jpeg(800, 600), width: 800, height: 600 } }, 400],
    // Not a JPEG.
    [
      {
        width: 1200,
        height: 900,
        small: { buffer: await png(800, 600), width: 800, height: 600, type: 'image/png' },
      },
      415,
    ],
  ];
  for (const [form, status] of cases) {
    const payload = await expectJson(
      await upload(form.width === 800 ? await jpeg(800, 600) : wide, { ...form, name: 'bad-small.jpg' }),
      status,
    );
    assert.equal(payload.issues[0].path, 'small');
  }
});

await scenario('images: an upload the store refuses is reported as failed, not stored', async () => {
  const before = await expectJson(await images('GET', '/admin/api/images'), 200);
  const response = await withBlobFaults({ put: refusePut('site-images', null) }, async () =>
    upload(await jpeg(64, 48), { width: 64, height: 48, name: 'refused.jpg' }),
  );
  const payload = await expectJson(response, 503);
  assert.equal(payload.ok, false);
  const after = await expectJson(await images('GET', '/admin/api/images'), 200);
  assert.equal(after.images.length, before.images.length, 'a refused upload must not be listed');
});

await scenario('images: an upload from another website is refused', async () => {
  const form = new FormData();
  form.set('file', new Blob([await jpeg(32, 32)], { type: 'image/jpeg' }), 'x.jpg');
  form.set('width', '32');
  form.set('height', '32');
  form.set('name', 'x.jpg');
  await expectJson(
    await images('POST', '/admin/api/images', {
      body: form,
      headers: { origin: 'https://elsewhere.example' },
    }),
    403,
  );
  await expectJson(
    await images('DELETE', '/admin/api/images/20260101-000000-zzzzzz.jpg', {
      headers: { origin: 'https://elsewhere.example' },
    }),
    403,
  );
});

await scenario('images: a PNG is refused as the wrong file type', async () => {
  const payload = await expectJson(
    await upload(await png(64, 64), {
      width: 64,
      height: 64,
      name: 'harbor.png',
      type: 'image/png',
    }),
    415,
  );
  assert.equal(payload.ok, false);
});

await scenario('images: an upload over the size ceiling is refused with 413', async () => {
  const { buffer, size } = await oversizedJpeg(2_000_000);
  const payload = await expectJson(
    await upload(buffer, { width: size, height: size, name: 'huge.jpg' }),
    413,
  );
  assert.equal(payload.ok, false);
});

await scenario('images: unusable dimensions are refused with 400', async () => {
  const payload = await expectJson(
    await upload(await jpeg(64, 64), { width: 64, height: 99999, name: 'tall.jpg' }),
    400,
  );
  assert.equal(payload.issues[0].path, 'height');
});

// ---------------------------------------------------------------------------
// 4. Photo delivery: the public /images/uploads/ endpoint
// ---------------------------------------------------------------------------

/** What `netlify/functions/uploads.mts` must promise a browser and the CDN. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

await scenario('uploads: a stored photo is served with immutable cache headers', async () => {
  const bytes = await jpeg(320, 240);
  const { image } = await expectJson(
    await upload(bytes, { width: 320, height: 240, name: 'porch.jpg' }),
    201,
  );
  photo = image;

  const response = await serveUpload('GET', `/images/uploads/${photo.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  // An id is minted per upload and never reused, so the bytes behind this URL cannot change.
  // Both headers matter: one is the browser's copy, the other the CDN's.
  assert.equal(response.headers.get('cache-control'), IMMUTABLE);
  assert.equal(response.headers.get('netlify-cdn-cache-control'), IMMUTABLE);
  assert.equal(response.headers.get('netlify-cache-tag'), `upload-${photo.id}`);

  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(body.length, bytes.length);
  assert.deepEqual([...body.slice(0, 3)], [0xff, 0xd8, 0xff]);

  const head = await serveUpload('HEAD', `/images/uploads/${photo.id}`);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), IMMUTABLE);
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0, 'a HEAD response carries no body');
});

await scenario('uploads: the 800px copy is served at w800, and older photos fall back', async () => {
  const smallBytes = await jpeg(800, 600);
  const { image } = await expectJson(
    await upload(await jpeg(1200, 900), {
      width: 1200,
      height: 900,
      name: 'deck.jpg',
      small: { buffer: smallBytes, width: 800, height: 600 },
    }),
    201,
  );
  const response = await serveUpload('GET', `/images/uploads/w800/${image.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), IMMUTABLE);
  assert.equal(response.headers.get('netlify-cdn-cache-control'), IMMUTABLE);
  // The photo's own tag, so the purge a delete makes drops both copies.
  assert.equal(response.headers.get('netlify-cache-tag'), `upload-${image.id}`);
  assert.equal((await response.arrayBuffer()).byteLength, smallBytes.length);
  const head = await serveUpload('HEAD', `/images/uploads/w800/${image.id}`);
  assert.equal(head.headers.get('content-length'), String(smallBytes.length));

  // `photo` (uploaded above at 320px) has no copy — the w800 URL answers with the photo itself.
  const fallback = await serveUpload('GET', `/images/uploads/w800/${photo.id}`);
  assert.equal(fallback.status, 200);
  assert.equal((await fallback.arrayBuffer()).byteLength, photo.bytes);
  const fallbackHead = await serveUpload('HEAD', `/images/uploads/w800/${photo.id}`);
  assert.equal(fallbackHead.headers.get('content-length'), String(photo.bytes));

  assert.equal((await serveUpload('GET', '/images/uploads/w800/20260101-000000-zzzzzz.jpg')).status, 404);
  assert.equal((await serveUpload('GET', '/images/uploads/w800/not-an-id')).status, 400);
});

await scenario('uploads: the public srcset offers the 800px copy only for wider photos', async () => {
  const { imageSrcSet } = await import('../src/lib/content/images.ts');
  assert.equal(
    imageSrcSet({ id: 'a.jpg', width: 1600, height: 1200 }),
    '/images/uploads/w800/a.jpg 800w, /images/uploads/a.jpg 1600w',
  );
  assert.equal(imageSrcSet({ id: 'a.jpg', width: 800, height: 600 }), undefined);
});

await scenario('uploads: an unknown id is a 404 and a malformed one a 400', async () => {
  const missing = await serveUpload('GET', '/images/uploads/20260101-000000-zzzzzz.jpg');
  assert.equal(missing.status, 404);
  // Not a photo id at all: refused before the store is asked, because the id is also a blob key.
  const malformed = await serveUpload('GET', '/images/uploads/not-an-id');
  assert.equal(malformed.status, 400);
});

// ---------------------------------------------------------------------------
// 5. The page loader: what a public page reads at request time
// ---------------------------------------------------------------------------

/**
 * `src/lib/server/content.ts` is the other half of the publish pipeline — the piece that turns
 * a saved blob into a rendered page — and the only piece with no HTTP surface, so it is called
 * directly here. Its two default paths (nothing saved, no Blobs context at all) are what every
 * `next build` and every unsaved document depend on; its throwing path is deliberate, because
 * serving the defaults over a document the owner *has* saved would silently undo her work.
 */
await scenario('loader: an unsaved document renders the committed default', async () => {
  await getStore('site-content', { consistency: 'strong' }).delete('menu.json');
  const loaded = await getContent('menu');
  assert.equal(loaded.source, 'default');
  assert.deepEqual(loaded.document, MENU_SEED);
});

await scenario('loader: an empty blob renders the committed default', async () => {
  // Wiped or half-written is "nothing saved", not corruption — the same rule the API follows.
  await getStore('site-content', { consistency: 'strong' }).set('about.json', '   ');
  const loaded = await getContent('about');
  assert.equal(loaded.source, 'default');
  assert.deepEqual(loaded.document, ABOUT_SEED);
});

await scenario('loader: a published document is what the pages render', async () => {
  const document = homeWith((home) => {
    home.hero.lede = LOADED_LEDE;
  });
  await expectJson(await content('PUT', '/admin/api/content/home', { body: { document } }), 200);

  const loaded = await getContent('home');
  assert.equal(loaded.source, 'blob');
  assert.equal(loaded.document.hero.lede, LOADED_LEDE);
});

await scenario('loader: a menu saved before the page wording existed still publishes and loads', async () => {
  // The `page` block is optional precisely so these keep working: a spec change must never
  // turn a menu the owner already published into a page that fails to render.
  const document = structuredClone(MENU_SEED);
  delete document.page;
  await expectJson(await content('PUT', '/admin/api/content/menu', { body: { document } }), 200);

  const loaded = await getContent('menu');
  assert.equal(loaded.source, 'blob');
  assert.equal(loaded.document.page, undefined);
  assert.deepEqual(loaded.document.sections, MENU_SEED.sections);
});

await scenario('loader: with no Blobs context the pages render the defaults', async () => {
  // `next build` prerenders in exactly this environment: Netlify injects the Blobs context into
  // functions and plugins, never into the build command. It must be a fallback, not a failure.
  const context = process.env.NETLIFY_BLOBS_CONTEXT;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  try {
    const loaded = await getContent('home');
    assert.equal(loaded.source, 'default');
    assert.deepEqual(loaded.document, HOME_SEED);
  } finally {
    process.env.NETLIFY_BLOBS_CONTEXT = context;
  }
});

await scenario('loader: a document the site cannot parse throws, naming it', async () => {
  await getStore('site-content', { consistency: 'strong' }).set('directions.json', '{"version":');
  await assert.rejects(
    () => getContent('directions'),
    (error) => {
      assert.match(String(error?.message ?? error), /directions/i);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

refusingSite.closeAllConnections();
await new Promise((resolve) => refusingSite.close(resolve));
await server.stop();
await rm(workspace, { recursive: true, force: true });

console.log('');
if (failed > 0) {
  console.error(`${failed} scenario(s) failed.`);
  process.exit(1);
}
console.log('All admin smoke scenarios passed.');
