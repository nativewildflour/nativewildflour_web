/**
 * Content API — a Netlify Function (v2) backing the admin editors.
 *
 * Routes (all under `/admin/` so the browser re-sends the Basic credentials it already holds
 * for the admin pages; the edge guard in `../edge-functions/admin-auth.ts` covers them too):
 *
 *   GET  /admin/api/content/:doc           -> 200 { source: 'blob' | 'seed', document, updatedAt? }
 *   PUT  /admin/api/content/:doc           -> validate, snapshot, write, refresh the live pages
 *   GET  /admin/api/content/:doc/versions  -> 200 { versions: [{ key, updatedAt }] }, newest first
 *   POST /admin/api/content/:doc/restore   -> load a snapshot, then the same pipeline as PUT
 *   GET  /admin/api/rules                  -> 200 the ContentRules the editors' live validation needs
 *
 * `:doc` is one of the keys in `src/lib/content-docs.ts` — menu, home, about, directions —
 * each with its own blob key and snapshot prefix, and its own validator from the registry.
 * The current document lives at key `<doc>.json` in the `site-content` blob store. Every save
 * first snapshots the version being replaced under `<doc>-versions/<ISO timestamp>.json`
 * (newest 20 kept), so a bad publish is one restore away. Auth is re-checked on every
 * request — defense in depth behind the edge guard, which fails closed the same way.
 *
 * The routes are matched by hand from the pathname rather than through the `:doc` params
 * Netlify would populate, so the handler behaves identically when driven with a plain
 * `Request` — which is exactly how `scripts/smoke-admin.mjs` exercises this pipeline.
 */

import { getStore } from '@netlify/blobs';
import {
  DOCUMENTS,
  isDocumentKey,
  type DocumentKey,
} from '../../src/lib/content-docs';
import type { ContentRules } from '../../src/lib/copy-rules';
import menuSeed from '../../src/data/defaults/menu.json';
import homeSeed from '../../src/data/defaults/home.json';
import aboutSeed from '../../src/data/defaults/about.json';
import directionsSeed from '../../src/data/defaults/directions.json';
import contentRules from '../../src/data/content-rules.json';
import { checkBasicAuth, unauthorized } from '../shared/basic-auth';

/** Netlify routes requests to this function by exact path — no wildcard, no `/api/` root. */
export const config = {
  path: [
    '/admin/api/content/:doc',
    '/admin/api/content/:doc/versions',
    '/admin/api/content/:doc/restore',
    '/admin/api/rules',
  ],
};

const STORE_NAME = 'site-content';
const CONTENT_ROUTE = '/admin/api/content/';
const VERSION_SUFFIX = '.json';
/**
 * What a snapshot key may look like after its `<doc>-versions/` prefix: the exact ISO timestamp
 * `publish` writes, nothing else. A prefix test alone would accept `<doc>-versions/../menu.json`
 * and let a restore reach for a different blob — harmless against Netlify's API, where keys are
 * opaque, but the local dev store resolves a key as a path.
 */
const VERSION_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Snapshots beyond the newest 20 are pruned on save. */
const MAX_VERSIONS = 20;
/** A document larger than this (in JSON characters) is refused with a 413. */
const MAX_RECORD_LENGTH = 300_000;

/**
 * The committed defaults (`src/data/defaults/`), served before the owner's first save on a
 * document. The pages fall back to the same files when the store holds nothing for a document,
 * so the editor opens on exactly what the live site is rendering.
 */
const SEEDS: Readonly<Record<DocumentKey, unknown>> = {
  menu: menuSeed,
  home: homeSeed,
  about: aboutSeed,
  directions: directionsSeed,
};

/**
 * The content rules, server-side. This bundle never reaches a browser, so importing the
 * banned-word list here is safe; the editor clients fetch the same rules from
 * `GET /admin/api/rules` instead of bundling them. Always passed to the registry's validator —
 * the server enforces every rule family on every write, whatever the client checked.
 */
const RULES: ContentRules = {
  forbiddenWords: contentRules.forbiddenWords,
  expectedHours: contentRules.expectedHours,
  placeholders: contentRules.placeholders,
};

type ContentStore = ReturnType<typeof getStore>;

/**
 * All the pipeline needs to know about a document: it is a plain object, and the server stamps
 * `updatedAt` on it. The real per-document shapes live in `src/lib/content/` and are enforced
 * by the registry validator that runs before anything reaches here.
 */
type ContentDocument = Record<string, unknown> & { updatedAt?: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Error responses share one shape with validation failures: `{ ok, issues }`. */
function failure(status: number, message: string, path = ''): Response {
  return json(status, { ok: false, issues: [{ path, message }] });
}

const currentKey = (doc: DocumentKey): string => `${doc}.json`;
const versionPrefix = (doc: DocumentKey): string => `${doc}-versions/`;

/** `home-versions/2026-09-02T17:00:00.000Z.json` -> the ISO timestamp in the middle. */
function timestampOf(doc: DocumentKey, key: string): string {
  const end = key.endsWith(VERSION_SUFFIX) ? key.length - VERSION_SUFFIX.length : key.length;
  return key.slice(versionPrefix(doc).length, end);
}

/** The named property out of a request body object, or undefined when the shape is off. */
function propertyOf(body: unknown, name: string): unknown {
  if (typeof body !== 'object' || body === null || !(name in body)) return undefined;
  return (body as Record<string, unknown>)[name];
}

/**
 * Ask the site to re-render the public pages now that the store has changed.
 *
 * v1 POSTed a build hook and the owner waited ~2 minutes for a deploy. The pages now read the
 * store at request time and cache the result, so a save only has to invalidate that cache:
 * `/admin/api/revalidate` calls `revalidatePath` for the four public routes and the next visitor
 * gets the new copy. Failure is non-fatal — the document is already saved, and each page's
 * 60-second `revalidate` window picks the change up on its own shortly after.
 *
 * The caller's own `Authorization` header is forwarded rather than credentials being rebuilt
 * here: the route handler re-checks Basic auth, and the request that reached this function has
 * already proved it carries credentials that pass. The origin is read per call, not at module
 * scope, because a function process outlives any one deploy — and because the smoke harness
 * points `URL` at a recording server after this module is imported.
 */
async function refreshSite(authorization: string | null): Promise<boolean> {
  // DEPLOY_PRIME_URL is the deploy actually serving this request (branch or preview deploys
  // included); URL is the production address. Neither is set locally, where there is no site to
  // refresh — `next dev` reads the same store directly.
  const origin = process.env.DEPLOY_PRIME_URL || process.env.URL;
  if (!origin || authorization === null) return false;
  try {
    const response = await fetch(new URL('/admin/api/revalidate', origin), {
      method: 'POST',
      headers: { authorization },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The slice of `store.list()` results this API reads. Spelled out so the file type-checks
 *  the same before and after the integrator installs `@netlify/blobs`. */
interface VersionListing {
  blobs: { etag: string; key: string }[];
}

/**
 * A key as `list()` reported it, back in the form the rest of the store speaks.
 *
 * The local blob server keeps each blob as a file, so on Windows it percent-encodes whatever a
 * Windows filename cannot hold — the colons in an ISO timestamp — and its listing reports that
 * encoded filename instead of the key that was written. Netlify's own API round-trips keys
 * untouched, where this is a no-op; without it, `netlify dev` on Windows lists versions that
 * restore and prune then cannot address. Safe for this key space: a snapshot key is an ISO
 * timestamp plus `.json` and never holds a literal percent sign of its own.
 */
function canonicalKey(key: string): string {
  if (!key.includes('%')) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

/** Trim snapshot history to the newest `MAX_VERSIONS`. ISO keys sort chronologically. */
async function pruneVersions(store: ContentStore, doc: DocumentKey): Promise<void> {
  const { blobs }: VersionListing = await store.list({ prefix: versionPrefix(doc) });
  const keys = blobs.map((blob) => canonicalKey(blob.key)).sort((a, b) => b.localeCompare(a));
  for (const key of keys.slice(MAX_VERSIONS)) {
    await store.delete(key);
  }
}

/**
 * The shared publish pipeline behind PUT and restore: stamp `updatedAt`, snapshot whatever
 * is being replaced, write the new current document, then ask the site to re-render.
 *
 * The write is conditional on the etag read alongside the current document, so two saves
 * racing each other can't silently drop one: whichever lands second gets `modified: false`
 * back and answers 409 instead of overwriting — no refresh is triggered for a save that
 * didn't land.
 */
async function publish(
  store: ContentStore,
  doc: DocumentKey,
  document: ContentDocument,
  authorization: string | null,
): Promise<Response> {
  const updatedAt = new Date().toISOString();
  const record: ContentDocument = { ...document, updatedAt };

  if (JSON.stringify(record).length > MAX_RECORD_LENGTH) {
    return failure(413, 'That page is too large to save — trim it down and try again.');
  }

  const current = await store.getWithMetadata(currentKey(doc), { type: 'text' });
  let modified: boolean;
  if (current !== null) {
    // A blob with nothing in it is not a version worth keeping — restoring it would only
    // put an empty page back — so the snapshot is skipped; the conditional write below still
    // guards against a racing save.
    if (hasContent(current.data)) {
      // `onlyIfNew` keeps a racing publish from clobbering a snapshot written the same
      // millisecond; losing that race is fine, so the result is ignored.
      await store.set(`${versionPrefix(doc)}${updatedAt}${VERSION_SUFFIX}`, current.data, {
        onlyIfNew: true,
      });
      await pruneVersions(store, doc);
    }
    ({ modified } = await store.setJSON(currentKey(doc), record, { onlyIfMatch: current.etag }));
  } else {
    ({ modified } = await store.setJSON(currentKey(doc), record, { onlyIfNew: true }));
  }
  if (!modified) {
    return failure(
      409,
      'This page changed while you were saving — reload the page and try again.',
    );
  }

  const revalidated = await refreshSite(authorization);
  return json(200, { ok: true, updatedAt, revalidated });
}

/** True when a blob holds something. Absent, empty and whitespace-only all mean "nothing saved". */
function hasContent(raw: string | null): raw is string {
  return raw !== null && raw.trim() !== '';
}

/**
 * GET /admin/api/content/:doc — the saved document, or the committed seed when nothing has
 * been saved. An empty blob counts as nothing saved: the seed is the content the live site is
 * showing, so it is the right default, and there is no saved copy that a fallback could hide.
 */
async function getDocument(store: ContentStore, doc: DocumentKey): Promise<Response> {
  const raw: string | null = await store.get(currentKey(doc), { type: 'text' });
  if (!hasContent(raw)) {
    return json(200, { source: 'seed', document: SEEDS[doc] });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure(
      500,
      'The stored content is not valid JSON — publish again, or restore a version.',
    );
  }
  // Valid JSON that is not an object (`null`, a number, a list) is content the site cannot
  // render, so it gets the same answer as malformed JSON rather than a generic failure.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return failure(
      500,
      'The stored content is not a page document — publish again, or restore a version.',
    );
  }
  const document = parsed as ContentDocument;
  return json(200, { source: 'blob', document, updatedAt: document.updatedAt });
}

/** PUT /admin/api/content/:doc — body `{ document }`; every validation issue blocks the save. */
async function putDocument(
  store: ContentStore,
  doc: DocumentKey,
  request: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, 'The request body is not valid JSON.');
  }
  const { document, issues } = DOCUMENTS[doc].validate(propertyOf(body, 'document'), RULES);
  if (document === null || issues.length > 0) {
    return json(400, { ok: false, issues });
  }
  return publish(store, doc, document as ContentDocument, request.headers.get('authorization'));
}

/** GET /admin/api/content/:doc/versions — snapshot keys with their timestamps, newest first. */
async function getVersions(store: ContentStore, doc: DocumentKey): Promise<Response> {
  const { blobs }: VersionListing = await store.list({ prefix: versionPrefix(doc) });
  const versions = blobs
    .map((blob) => canonicalKey(blob.key))
    .map((key) => ({ key, updatedAt: timestampOf(doc, key) }))
    .sort((a, b) => b.key.localeCompare(a.key));
  return json(200, { versions });
}

/**
 * POST /admin/api/content/:doc/restore — body `{ key }`; re-publishes a snapshot through
 * `publish`. The prefix check is what keeps a restore from reaching another document's
 * history (or any other key in the store).
 */
async function restore(
  store: ContentStore,
  doc: DocumentKey,
  request: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, 'The request body is not valid JSON.');
  }
  const key = propertyOf(body, 'key');
  if (
    typeof key !== 'string' ||
    !key.startsWith(versionPrefix(doc)) ||
    !VERSION_TIMESTAMP.test(timestampOf(doc, key))
  ) {
    return failure(400, 'Pass the key of a saved version to restore.', 'key');
  }

  const raw: string | null = await store.get(key, { type: 'text' });
  // A blank snapshot is as good as a missing one: nothing in it could be put back.
  if (!hasContent(raw)) {
    return failure(404, `No saved version found for "${key}".`, 'key');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure(500, 'That saved version is not valid JSON.');
  }
  const { document, issues } = DOCUMENTS[doc].validate(parsed, RULES);
  if (document === null || issues.length > 0) {
    return json(400, { ok: false, issues });
  }
  return publish(store, doc, document as ContentDocument, request.headers.get('authorization'));
}

export default async function adminContent(request: Request): Promise<Response> {
  try {
    const username = process.env.ADMIN_USERNAME ?? '';
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (username === '' || password === '') {
      // Same fail-closed posture as the edge guard.
      return failure(503, 'Admin is not configured.');
    }
    if (!checkBasicAuth(request.headers.get('authorization'), username, password)) {
      return unauthorized();
    }

    const route = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (route === '/admin/api/rules') {
      if (request.method === 'GET') return json(200, RULES);
      return failure(405, `${request.method} is not supported here — use GET.`);
    }

    if (route.startsWith(CONTENT_ROUTE)) {
      // Segment count, not a suffix test: it is what keeps a document literally named
      // "versions" from being read as the action on some other document.
      const segments = route.slice(CONTENT_ROUTE.length).split('/');
      const [doc, action] = segments;
      if (!isDocumentKey(doc)) {
        return failure(404, `There is no editable page called "${doc}".`);
      }

      // Strong consistency is set store-wide because `list()` has no per-operation override
      // and the version listing needs it too. With the default eventual reads, publish()
      // could snapshot stale content, and a GET right after a restore could still return the
      // pre-restore document.
      const store = getStore(STORE_NAME, { consistency: 'strong' });

      if (segments.length === 1) {
        if (request.method === 'GET') return getDocument(store, doc);
        if (request.method === 'PUT') return putDocument(store, doc, request);
        return failure(405, `${request.method} is not supported here — use GET or PUT.`);
      }
      if (segments.length === 2 && action === 'versions') {
        if (request.method === 'GET') return getVersions(store, doc);
        return failure(405, `${request.method} is not supported here — use GET.`);
      }
      if (segments.length === 2 && action === 'restore') {
        if (request.method === 'POST') return restore(store, doc, request);
        return failure(405, `${request.method} is not supported here — use POST.`);
      }
    }

    return failure(404, `No admin API route at ${route}.`);
  } catch (error) {
    // Raw exception text can leak infrastructure details; log it, answer generically.
    console.error(error);
    return failure(500, 'Something went wrong handling that request — try again in a moment.');
  }
}
