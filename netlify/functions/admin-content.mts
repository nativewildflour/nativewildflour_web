/**
 * Content API — a Netlify Function (v2) backing the admin editors.
 *
 * Routes (all under `/admin/` so the browser re-sends the Basic credentials it already holds
 * for the admin pages; the edge guard in `../edge-functions/admin-auth.ts` covers them too):
 *
 *   GET  /admin/api/content/:doc           -> 200 { source: 'blob' | 'seed', document, updatedAt? }
 *   PUT  /admin/api/content/:doc           -> validate, snapshot, write, refresh the live pages
 *   GET  /admin/api/content/:doc/versions  -> 200 { versions: [{ key, updatedAt, replacedAt }] }, newest first
 *   POST /admin/api/content/:doc/restore   -> load a snapshot, then the same pipeline as PUT
 *   GET  /admin/api/rules                  -> 200 the ContentRules the editors' live validation needs
 *
 * `:doc` is one of the keys in `src/lib/content-docs.ts` — menu, home, about, directions —
 * each with its own blob key and snapshot prefix, and its own validator from the registry.
 * The current document lives at key `<doc>.json` in the `site-content` blob store. Every save
 * first snapshots the version being replaced under `<doc>-versions/<ISO timestamp>-<random>.json`
 * (newest 20 kept), so a bad publish is one restore away. Auth is re-checked on every
 * request — defense in depth behind the edge guard, which fails closed the same way — and every
 * write is refused when it comes from another website (`../shared/request-guard.ts`).
 *
 * The routes are matched by hand from the pathname rather than through the `:doc` params
 * Netlify would populate, so the handler behaves identically when driven with a plain
 * `Request` — which is exactly how `scripts/smoke-admin.mjs` exercises this pipeline.
 */

import { getStore } from '@netlify/blobs';
import {
  DOCUMENTS,
  collectImageUses,
  isDocumentKey,
  type DocumentKey,
} from '../../src/lib/content-docs';
import type { ContentRules, CopyIssue } from '../../src/lib/copy-rules';
import menuSeed from '../../src/data/defaults/menu.json';
import homeSeed from '../../src/data/defaults/home.json';
import aboutSeed from '../../src/data/defaults/about.json';
import directionsSeed from '../../src/data/defaults/directions.json';
import contentRules from '../../src/data/content-rules.json';
import { checkBasicAuth, unauthorized } from '../shared/basic-auth';
import { guardWrite } from '../shared/request-guard';

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
const IMAGE_STORE = 'site-images';
const CONTENT_ROUTE = '/admin/api/content/';
const VERSION_SUFFIX = '.json';
/**
 * What a snapshot key may look like after its `<doc>-versions/` prefix: the exact ISO timestamp
 * `publish` writes, optionally followed by the random suffix it has added since (older
 * snapshots have none), and nothing else. A prefix test alone would accept
 * `<doc>-versions/../menu.json` and let a restore reach for a different blob — harmless against
 * Netlify's API, where keys are opaque, but the local dev store resolves a key as a path.
 */
const VERSION_STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)(?:-[a-z0-9]{6})?$/;
/** Lowercase alphanumerics for the snapshot key suffix. */
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Snapshots beyond the newest 20 are pruned on save. */
const MAX_VERSIONS = 20;
/** A document larger than this (in JSON characters) is refused with a 413. */
const MAX_RECORD_LENGTH = 300_000;
/**
 * The site's refresh endpoint, with the trailing slash `trailingSlash: true` gives every route:
 * the slash-less spelling only works via a 308 that undici follows, and `scripts/smoke-admin.mjs`
 * pins this exact URL.
 */
const REFRESH_ROUTE = '/admin/api/revalidate/';
/** How long the refresh call may take before the save answers without it. */
const REFRESH_TIMEOUT_MS = 5_000;
/** Set after the first save that had to go without the etag guard; see `publish`. */
let warnedNoEtag = false;

const CHANGED_ELSEWHERE =
  'This page was changed somewhere else (another tab or device) after you opened it — reload to see the newest version before publishing.';
const WRITE_FAILED =
  'The save did not go through, so nothing was published — try again in a moment.';
const PHOTO_DELETED_MID_SAVE =
  'A photo on this page was deleted while you were publishing — choose another photo and publish again.';

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

/** `home-versions/2026-09-02T17:00:00.000Z-a1b2c3.json` -> the part between prefix and suffix. */
function stampOf(doc: DocumentKey, key: string): string {
  const end = key.endsWith(VERSION_SUFFIX) ? key.length - VERSION_SUFFIX.length : key.length;
  return key.slice(versionPrefix(doc).length, end);
}

/** When the snapshot under `key` was taken — the moment the save that replaced it landed. */
function replacedAtOf(doc: DocumentKey, key: string): string {
  return VERSION_STAMP.exec(stampOf(doc, key))?.[1] ?? stampOf(doc, key);
}

function randomSuffix(): string {
  const random = new Uint8Array(6);
  crypto.getRandomValues(random);
  let suffix = '';
  for (const value of random) suffix += SUFFIX_ALPHABET.charAt(value % SUFFIX_ALPHABET.length);
  return suffix;
}

/** The named property out of a request body object, or undefined when the shape is off. */
function propertyOf(body: unknown, name: string): unknown {
  if (typeof body !== 'object' || body === null || !(name in body)) return undefined;
  return (body as Record<string, unknown>)[name];
}

/** A usable ISO date-time string, or null. */
function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

/**
 * The `updatedAt` stamped inside a stored document's text: the string, `null` for a blob that
 * holds nothing, `undefined` for content that has no readable stamp (unparsable, or unstamped).
 */
function storedUpdatedAt(raw: string | null): string | null | undefined {
  if (!hasContent(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isoOrNull(propertyOf(parsed, 'updatedAt')) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ask the site to re-render the public pages now that the store has changed.
 *
 * The pages read the store at request time and cache the result, so a save only has to
 * invalidate that cache: `/admin/api/revalidate` calls `revalidatePath` for the four public
 * routes and the sitemap, and the next visitor gets the new copy. Failure is non-fatal — the
 * document is already saved, and each page's 60-second `revalidate` window picks the change up
 * on its own shortly after.
 *
 * The caller's own `Authorization` header is forwarded rather than credentials being rebuilt
 * here: the route handler re-checks Basic auth, and the request that reached this function has
 * already proved it carries credentials that pass.
 *
 * The site to refresh is the one this request reached. Netlify serves a function on the same
 * host as the deploy it belongs to — the primary domain in production, the branch or preview
 * address on a preview — so the request URL names the right deploy everywhere, with no
 * cross-origin redirect to strip the credentials. (The build-time `CONTEXT` and
 * `DEPLOY_PRIME_URL` variables are not available to a function at runtime, which is why they
 * are not read here.) `npm run dev:admin` serves the functions on the same origin as the site,
 * so the same rule holds there.
 */
async function refreshSite(request: Request): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  if (authorization === null) return false;
  try {
    const response = await fetch(new URL(REFRESH_ROUTE, new URL(request.url).origin), {
      method: 'POST',
      headers: { authorization },
      // Bounded: this runs inside a synchronous function that has already done its writes, and
      // a cold or stalled Next runtime must not turn a landed save into a timeout the editor
      // reports as "publishing failed". A timeout lands in the catch → `revalidated: false`.
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The slice of `store.list()` results this API reads. */
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
 * timestamp, a lowercase suffix and `.json`, and never holds a literal percent sign of its own.
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

/** What a conditional write reports. */
interface WriteResult {
  readonly modified: boolean;
  readonly etag?: string;
}

/**
 * Whether a write really landed. `@netlify/blobs` reports `{ modified: true, etag: '' }` for ANY
 * answer to a conditional write other than 412 — a 403 or a 503 included — so `modified` alone
 * proves nothing. A real write comes back with the new etag; without one, the blob is read back
 * and compared with what was sent before the write is believed.
 */
async function writeOutcome(
  result: WriteResult,
  readBack: () => Promise<boolean>,
): Promise<'landed' | 'conflict' | 'failed'> {
  if (!result.modified) return 'conflict';
  if (typeof result.etag === 'string' && result.etag !== '') return 'landed';
  try {
    return (await readBack()) ? 'landed' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Every photo the document shows must still be in the photo library. A deleted one would render
 * as a broken picture on a live page, so the save is refused with the slot named.
 */
async function missingPhotoIssues(document: ContentDocument): Promise<CopyIssue[]> {
  const uses = collectImageUses(document);
  if (uses.length === 0) return [];
  const images = getStore(IMAGE_STORE, { consistency: 'strong' });
  const ids = [...new Set(uses.map((use) => use.id))];
  const found = await Promise.all(ids.map((id) => images.getMetadata(id)));
  const missing = new Set(ids.filter((_, position) => found[position] === null));
  return uses
    .filter((use) => missing.has(use.id))
    .map((use) => ({
      path: use.path,
      message:
        use.caption.trim() === ''
          ? 'A photo on this page is no longer in the photo library — pick another photo for it or remove it, then publish again.'
          : `The photo “${use.caption.trim()}” is no longer in the photo library — pick another photo for it or remove it, then publish again.`,
    }));
}

/**
 * The shared publish pipeline behind PUT and restore: check the photos, check the base version,
 * stamp `updatedAt`, snapshot whatever is being replaced, write the new current document, then
 * ask the site to re-render.
 *
 * `base` is the `updatedAt` of the version the editor started from (`null`: it started from
 * nothing saved), or `undefined` when the caller sent none. A base that no longer matches the
 * stored document means someone published in between, and the save is refused with a 409
 * rather than silently overwriting their work.
 *
 * The write is also conditional on the etag read alongside the current document, so two saves
 * racing each other can't silently drop one: whichever lands second answers 409 instead of
 * overwriting — and no refresh is triggered for a save that didn't land. Once the write has
 * landed the photos are checked once more, and a save whose photo was deleted in the meantime
 * is rolled back and answered with a 409 naming the photo's field.
 */
async function publish(
  store: ContentStore,
  doc: DocumentKey,
  document: ContentDocument,
  request: Request,
  base: string | null | undefined,
): Promise<Response> {
  const updatedAt = new Date().toISOString();
  const record: ContentDocument = { ...document, updatedAt };
  const payload = JSON.stringify(record);

  if (payload.length > MAX_RECORD_LENGTH) {
    return failure(413, 'That page is too large to save — trim it down and try again.');
  }

  const photoIssues = await missingPhotoIssues(record);
  if (photoIssues.length > 0) {
    return json(400, { ok: false, issues: photoIssues });
  }

  const current = await store.getWithMetadata(currentKey(doc), { type: 'text' });
  const currentData: string | null = current === null ? null : current.data;
  const currentStamp = storedUpdatedAt(currentData);
  if (base !== undefined && currentStamp !== base) {
    return failure(409, CHANGED_ELSEWHERE);
  }

  // Set once the version being replaced has been snapshotted, so a save that then fails or
  // loses the race can take its own snapshot back out. The random suffix makes the key this
  // save's alone: a racing save in the same millisecond can never collide with it, so the
  // clean-up below can never delete the winner's snapshot.
  let snapshotKey: string | null = null;
  let outcome: 'landed' | 'conflict' | 'failed';
  /** The etag the write below came back with, when the store sent one (Netlify always does). */
  let writtenEtag: string | undefined;
  const written = (result: WriteResult): WriteResult => {
    writtenEtag = typeof result.etag === 'string' && result.etag !== '' ? result.etag : undefined;
    return result;
  };
  if (current !== null) {
    // A blob with nothing in it is not a version worth keeping — restoring it would only
    // put an empty page back — so the snapshot is skipped; the conditional write below still
    // guards against a racing save.
    if (hasContent(currentData)) {
      const key = `${versionPrefix(doc)}${updatedAt}-${randomSuffix()}${VERSION_SUFFIX}`;
      // The snapshot's own `updatedAt` rides along as metadata, so the history can say when
      // that content was published without reading every snapshot back.
      const snapshot = await writeOutcome(
        await store.set(key, currentData, {
          onlyIfNew: true,
          metadata: { updatedAt: typeof currentStamp === 'string' ? currentStamp : '' },
        }),
        async () => (await store.get(key, { type: 'text' })) === currentData,
      );
      if (snapshot !== 'landed') {
        return failure(503, WRITE_FAILED);
      }
      snapshotKey = key;
    }
    if (current.etag === undefined && !warnedNoEtag) {
      // The guard needs the etag the read came with. Netlify's API always sends one; the local
      // blob server (`netlify dev`, `dev:admin`, the smoke harness) never does, and the client
      // silently drops an undefined `onlyIfMatch`, so say so (once per process) rather than
      // pretend the write below is conditional.
      warnedNoEtag = true;
      console.warn(
        `[admin-content] the store returned no etag for ${currentKey(doc)} — saving without the concurrent-save guard (expected on the local blob server only).`,
      );
    }
    outcome = await writeOutcome(
      written(await store.setJSON(currentKey(doc), record, { onlyIfMatch: current.etag })),
      async () => (await store.get(currentKey(doc), { type: 'text' })) === payload,
    );
  } else {
    outcome = await writeOutcome(
      written(await store.setJSON(currentKey(doc), record, { onlyIfNew: true })),
      async () => (await store.get(currentKey(doc), { type: 'text' })) === payload,
    );
  }

  /** Take this save's own snapshot back out — it never became (or no longer is) history. */
  const dropSnapshot = async (): Promise<void> => {
    if (snapshotKey === null) return;
    try {
      await store.delete(snapshotKey);
    } catch (error) {
      console.error(error);
    }
  };

  if (outcome !== 'landed') {
    await dropSnapshot();
    return outcome === 'conflict'
      ? failure(409, 'This page changed while you were saving — reload the page and try again.')
      : failure(503, WRITE_FAILED);
  }

  // The photo check above and a photo delete race: a delete can check the documents after that
  // check and before this write, find nothing using the photo, and remove it. So the photos are
  // checked again now that the write has landed (the delete re-checks from its side too; see
  // `./admin-images.mts`). A photo missing now means this save would put a broken
  // picture on the live page, so the previous document goes back — conditional on the etag this
  // save just wrote, so a newer save is never overwritten — and the snapshot of it is dropped,
  // since it is the current document again. Nothing was refreshed yet, so the pages never asked
  // for the rolled-back version (the 60-second window aside, which this revert also covers).
  const deleted = await missingPhotoIssues(record);
  if (deleted.length > 0) {
    // A document that had nothing saved before goes back to a blank blob, which the loader and
    // this API both read as "nothing saved"; a delete could not be made conditional.
    const previous = current === null ? '' : (currentData ?? '');
    let reverted: 'landed' | 'conflict' | 'failed';
    try {
      reverted = await writeOutcome(
        await store.set(currentKey(doc), previous, { onlyIfMatch: writtenEtag }),
        async () => (await store.get(currentKey(doc), { type: 'text' })) === previous,
      );
    } catch (error) {
      console.error(error);
      reverted = 'failed';
    }
    if (reverted === 'landed') {
      await dropSnapshot();
    } else {
      console.error(
        `[admin-content] ${currentKey(doc)} references a deleted photo and could not be rolled back (${reverted}).`,
      );
    }
    return json(409, {
      ok: false,
      issues: deleted.map((issue) => ({ path: issue.path, message: PHOTO_DELETED_MID_SAVE })),
    });
  }

  // Prune only for a save that landed: pruning first could drop the oldest real version to
  // make room for a snapshot that then had to be taken back. The save has landed by now, so a
  // failed prune is logged and the save still reports success and refreshes the site.
  if (snapshotKey !== null) {
    try {
      await pruneVersions(store, doc);
    } catch (error) {
      console.error(error);
    }
  }

  const revalidated = await refreshSite(request);
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

/**
 * PUT /admin/api/content/:doc — body `{ document, baseUpdatedAt? }`; every validation issue
 * blocks the save. `baseUpdatedAt` is the `updatedAt` the editor loaded (`null` when it loaded
 * the seed); leaving it out skips the check.
 */
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
  const base = propertyOf(body, 'baseUpdatedAt');
  if (base !== undefined && base !== null && typeof base !== 'string') {
    return failure(400, 'baseUpdatedAt must be a date-time string or null.', 'baseUpdatedAt');
  }
  const { document, issues } = DOCUMENTS[doc].validate(propertyOf(body, 'document'), RULES);
  if (document === null || issues.length > 0) {
    return json(400, { ok: false, issues });
  }
  return publish(store, doc, document as ContentDocument, request, base);
}

/**
 * GET /admin/api/content/:doc/versions — newest first. Each entry is labelled with the moment
 * its own content was published (`updatedAt`), not the moment a later save replaced it
 * (`replacedAt`, which is what the key records). The publish stamp is stored as metadata on
 * every snapshot written since; older snapshots are read to find it, and one with no stamp at
 * all falls back to its key.
 */
async function getVersions(store: ContentStore, doc: DocumentKey): Promise<Response> {
  const { blobs }: VersionListing = await store.list({ prefix: versionPrefix(doc) });
  const keys = blobs
    .map((blob) => canonicalKey(blob.key))
    .filter((key) => VERSION_STAMP.test(stampOf(doc, key)))
    .sort((a, b) => b.localeCompare(a));
  const versions = await Promise.all(
    keys.map(async (key) => {
      const replacedAt = replacedAtOf(doc, key);
      const entry = await store.getMetadata(key);
      let updatedAt = isoOrNull(entry?.metadata?.updatedAt);
      if (updatedAt === null) {
        updatedAt = storedUpdatedAt(await store.get(key, { type: 'text' })) ?? null;
      }
      return { key, updatedAt: updatedAt ?? replacedAt, replacedAt };
    }),
  );
  return json(200, { versions });
}

/**
 * POST /admin/api/content/:doc/restore — body `{ key }`; re-publishes a snapshot through
 * `publish`. The prefix check is what keeps a restore from reaching another document's
 * history (or any other key in the store).
 */
const DAMAGED_VERSION =
  "That saved version is damaged and can't be restored — please pick another version from the list.";

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
    !key.endsWith(VERSION_SUFFIX) ||
    !VERSION_STAMP.test(stampOf(doc, key))
  ) {
    return failure(400, 'Pass the key of a saved version to restore.', 'key');
  }

  const raw: string | null = await store.get(key, { type: 'text' });
  // A blank snapshot is as good as a missing one: nothing in it could be put back.
  if (!hasContent(raw)) {
    return failure(404, `No saved version found for "${key}".`, 'key');
  }
  // A snapshot that can't be read back is the stored data's fault, not the request's and not
  // the server's: 422, with a message the owner can act on (pick another version), rather than
  // a 500 the editor would report as the admin being broken.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure(422, DAMAGED_VERSION, 'key');
  }
  const { document, issues: found } = DOCUMENTS[doc].validate(parsed, RULES);
  // Advisory issues (the "type {hours} instead" steer) never block a restore: a snapshot saved
  // before the steer existed says the right hours by hand and has no way to be edited first.
  const issues = found.filter((issue) => issue.advisory !== true);
  if (document === null) {
    return json(422, { ok: false, issues: [{ path: 'key', message: DAMAGED_VERSION }, ...issues] });
  }
  if (issues.length > 0) {
    return json(400, { ok: false, issues });
  }
  // A restore is a deliberate choice of version, so it carries no base to check against.
  return publish(store, doc, document as ContentDocument, request, undefined);
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

      // Every route below is awaited, not returned bare: a rejection must land in this
      // function's catch, which answers in the API's own shape.
      if (segments.length === 1) {
        if (request.method === 'GET') return await getDocument(store, doc);
        if (request.method === 'PUT') {
          return guardWrite(request, 'application/json') ?? (await putDocument(store, doc, request));
        }
        return failure(405, `${request.method} is not supported here — use GET or PUT.`);
      }
      if (segments.length === 2 && action === 'versions') {
        if (request.method === 'GET') return await getVersions(store, doc);
        return failure(405, `${request.method} is not supported here — use GET.`);
      }
      if (segments.length === 2 && action === 'restore') {
        if (request.method === 'POST') {
          return guardWrite(request, 'application/json') ?? (await restore(store, doc, request));
        }
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
