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
 * `URL` and `DEPLOY_PRIME_URL` are deliberately left unset for most of the run: a passing run
 * must never reach the outside world, and `revalidated: false` is an asserted part of the
 * contract. The two scenarios that do exercise the refresh call point `URL` at a `node:http`
 * server started here, which records what it was asked for.
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
// No site to refresh unless a scenario stands one up. See the header note.
delete process.env.URL;
delete process.env.DEPLOY_PRIME_URL;

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

function request(method, route, { body, auth = AUTH } = {}) {
  const headers = auth === null ? {} : { authorization: auth };
  const init = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  return new Request(`https://nativewildflour.test${route}`, init);
}

const content = (method, route, options) => contentHandler(request(method, route, options));
const images = (method, route, options) => imagesHandler(request(method, route, options));
/** The public photo endpoint: no credentials, because a visitor has none. */
const serveUpload = (method, route) => uploadsHandler(request(method, route, { auth: null }));

/**
 * A stand-in for the deployed site, recording what the publish endpoint asks of it. The
 * function reads `URL` per call, so pointing it here is enough to exercise the real path —
 * headers included, which is the half that matters: the refresh endpoint is auth-gated and a
 * publish that forgot to forward its credentials would fail silently in production.
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
  process.env.URL = `http://127.0.0.1:${site.address().port}`;
  return {
    requests,
    async stop() {
      delete process.env.URL;
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

function upload(buffer, { width, height, name, type = 'image/jpeg' }) {
  const form = new FormData();
  form.set('file', new Blob([buffer], { type }), name);
  form.set('width', String(width));
  form.set('height', String(height));
  form.set('name', name);
  return images('POST', '/admin/api/images', { body: form });
}

/** The current home document, with one edit applied — the shape every content scenario uses. */
function homeWith(edit) {
  const document = structuredClone(HOME_SEED);
  edit(document);
  return document;
}

/** The gate's opening-hours range, as `scripts/verify-build.mjs` matches it (no `g` flag: a
 *  sticky lastIndex would make the same test alternate between true and false). */
const HOURS_RANGE =
  /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:–|—|-|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i;

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
 * Gate-validator parity, the failure CLAUDE.md warns about loudest: a rule the acceptance gate
 * enforces on rendered copy but the publish validator does not check would let the owner save
 * cleanly and then wedge *every* deploy after it, because the blob feeds the bad copy into each
 * rebuild. Until this wave only the menu page rendered owner-editable text; three more pages do
 * now, so the two rule families reachable from their copy are pinned here. Both markers are read
 * from the canonical rules JSON, never typed in.
 */
await scenario('content: an hours range that contradicts the spec is refused', async () => {
  const document = structuredClone(DIRECTIONS_SEED);
  const field = findHoursField(document);
  assert.ok(field, 'the directions seed renders no opening-hours range to test the gate against');
  field.parent[field.key] = field.value.replace(HOURS_RANGE, '10:00 AM – 3:00 PM');

  const payload = await expectJson(
    await content('PUT', '/admin/api/content/directions', { body: { document } }),
    400,
  );
  assert.ok(
    payload.issues.some((issue) => issue.path === field.path),
    `expected an issue on ${field.path}, got ${JSON.stringify(payload.issues)}`,
  );
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
  assert.equal(payload.revalidated, false, 'no site URL is configured, so nothing may be called');
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
      [{ method: 'POST', url: '/admin/api/revalidate', authorization: AUTH }],
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

  const payload = await expectJson(await images('DELETE', `/admin/api/images/${photo.id}`), 200);
  assert.equal(payload.ok, true);
  await expectJson(await images('GET', `/admin/api/images/${photo.id}`), 404);
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

await server.stop();
await rm(workspace, { recursive: true, force: true });

console.log('');
if (failed > 0) {
  console.error(`${failed} scenario(s) failed.`);
  process.exit(1);
}
console.log('All admin smoke scenarios passed.');
