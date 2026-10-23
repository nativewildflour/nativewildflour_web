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
import { guardAdmin } from '../shared/admin-gate';
import type { DeployContext } from '../shared/basic-auth';
import { guardWrite } from '../shared/request-guard';
import { failure, json } from '../shared/responses';
import {
  CONTENT_STORE,
  IMAGE_STORE,
  VERSION_STAMP,
  VERSION_SUFFIX,
  canonicalKey,
  currentKey,
  isVersionKey,
  stampOf,
  versionPrefix,
} from '../shared/stores';
import type { Landing, ReadBack } from '../shared/write-outcome';
import { writeOutcome } from '../shared/write-outcome';

/** Netlify routes requests to this function by exact path — no wildcard, no `/api/` root. */
export const config = {
  path: [
    '/admin/api/content/:doc',
    '/admin/api/content/:doc/versions',
    '/admin/api/content/:doc/restore',
    '/admin/api/rules',
  ],
};

const CONTENT_ROUTE = '/admin/api/content/';
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
const WRITE_UNCONFIRMED =
  'The save could not be confirmed — reload the page to see whether it went through before publishing again.';
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
 * Ask the site to re-render the public pages that show `doc` now that the store has changed.
 *
 * The pages read the store at request time and cache the result, so a save only has to
 * invalidate that cache: `/admin/api/revalidate?doc=<doc>` calls `revalidatePath` for each page
 * that renders the document (`src/data/pages.ts` — the menu shows on three of them) and for the
 * sitemap, and the next visitor gets the new copy; the pages it does not touch keep their cached
 * render. Failure is non-fatal — the document is already saved, and each page's 60-second
 * `revalidate` window picks the change up on its own shortly after.
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
async function refreshSite(request: Request, doc: DocumentKey): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  if (authorization === null) return false;
  try {
    const target = new URL(REFRESH_ROUTE, new URL(request.url).origin);
    target.searchParams.set('doc', doc);
    const response = await fetch(target, {
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
 * Trim snapshot history to the newest `MAX_VERSIONS`. ISO keys sort chronologically; the
 * deletes are independent, so they go out together.
 */
async function pruneVersions(store: ContentStore, doc: DocumentKey): Promise<void> {
  const { blobs }: VersionListing = await store.list({ prefix: versionPrefix(doc) });
  const keys = blobs.map((blob) => canonicalKey(blob.key)).sort((a, b) => b.localeCompare(a));
  await Promise.all(keys.slice(MAX_VERSIONS).map((key) => store.delete(key)));
}

/** What a text blob holds now, as a read-back reports it (`null`: nothing). */
type StoredText = string | null;

/**
 * A read-back of a text blob for `writeOutcome` (`../shared/write-outcome.ts`): whether it holds
 * exactly `expected`, under which etag, and what it holds — the snapshot clean-up in `publish`
 * decides on that.
 */
function readsBack(
  store: ContentStore,
  key: string,
  expected: string,
): () => Promise<ReadBack<StoredText>> {
  return async () => {
    const entry = await store.getWithMetadata(key, { type: 'text' });
    const etag = typeof entry?.etag === 'string' && entry.etag !== '' ? entry.etag : undefined;
    const data = entry === null ? null : entry.data;
    return { matches: data === expected, etag, data };
  };
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

  // The photo check and the read of the current document are independent: they go out together.
  const [photoIssues, current] = await Promise.all([
    missingPhotoIssues(record),
    store.getWithMetadata(currentKey(doc), { type: 'text' }),
  ]);
  if (photoIssues.length > 0) {
    return json(400, { ok: false, issues: photoIssues });
  }

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
  /** The main write's fate, and the etag it landed with (what makes the rollback conditional). */
  let landing: Landing<StoredText>;
  if (current !== null) {
    // A blob with nothing in it is not a version worth keeping — restoring it would only put an
    // empty page back — and neither is one that is not a document at all (truncated or garbled
    // JSON): no restore could ever bring it back, so as a "version" it would only take one of
    // the history's places. Either way the snapshot is skipped; the conditional write below
    // still guards against a racing save.
    if (hasContent(currentData) && isDocumentText(currentData)) {
      const key = `${versionPrefix(doc)}${updatedAt}-${randomSuffix()}${VERSION_SUFFIX}`;
      // The snapshot's own `updatedAt` rides along as metadata, so the history can say when
      // that content was published without reading every snapshot back.
      const snapshot = await writeOutcome(
        await store.set(key, currentData, {
          onlyIfNew: true,
          metadata: { updatedAt: typeof currentStamp === 'string' ? currentStamp : '' },
        }),
        readsBack(store, key, currentData),
      );
      // A snapshot that landed after all only duplicates a history entry; nothing is lost.
      if (snapshot.outcome !== 'landed') {
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
    landing = await writeOutcome(
      await store.setJSON(currentKey(doc), record, { onlyIfMatch: current.etag }),
      readsBack(store, currentKey(doc), payload),
    );
  } else {
    landing = await writeOutcome(
      await store.setJSON(currentKey(doc), record, { onlyIfNew: true }),
      readsBack(store, currentKey(doc), payload),
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

  if (landing.outcome !== 'landed') {
    // The snapshot comes back out only when the store provably still holds the version this save
    // started from: the write did not land and nothing replaced it, so the snapshot merely
    // repeats the current document. Other content may be this save landing and then being
    // replaced by a racing one (an answer lost and retried into a 412), and a failed read-back
    // tells nothing — either way the snapshot may be the only copy left of the version replaced,
    // and keeping one that turns out to be a duplicate costs nothing.
    if (landing.stored !== undefined && landing.stored === currentData) await dropSnapshot();
    return landing.outcome === 'conflict'
      ? failure(409, 'This page changed while you were saving — reload the page and try again.')
      : failure(503, landing.outcome === 'unknown' ? WRITE_UNCONFIRMED : WRITE_FAILED);
  }

  // The photo check above and a photo delete race: a delete can check the documents after that
  // check and before this write, find nothing using the photo, and remove it. So the photos are
  // checked again now that the write has landed (the delete re-checks from its side too; see
  // `./admin-images.mts`). A photo missing now means this save would put a broken
  // picture on the live page, so the previous document goes back — conditional on the etag this
  // save just wrote, so a newer save is never overwritten — and the snapshot of it is dropped,
  // since it is the current document again. Nothing was refreshed yet, so the pages never asked
  // for the rolled-back version (the 60-second window aside, which this revert also covers).
  // The save has landed by now, so a re-check that cannot run is logged rather than turned into
  // a reported failure — the delete re-checks from its side too.
  let deleted: CopyIssue[] = [];
  try {
    deleted = await missingPhotoIssues(record);
  } catch (error) {
    console.error(error);
  }
  if (deleted.length > 0) {
    // A document that had nothing saved before goes back to a blank blob, which the loader and
    // this API both read as "nothing saved"; a delete could not be made conditional.
    const previous = current === null ? '' : (currentData ?? '');
    let reverted: Landing<StoredText>['outcome'];
    if (landing.etag === undefined) {
      // Without the etag this save wrote, the revert could not be made conditional, and an
      // unconditional one could overwrite a newer save that has landed since.
      reverted = 'unknown';
    } else {
      try {
        reverted = (
          await writeOutcome(
            await store.set(currentKey(doc), previous, { onlyIfMatch: landing.etag }),
            readsBack(store, currentKey(doc), previous),
          )
        ).outcome;
      } catch (error) {
        console.error(error);
        reverted = 'failed';
      }
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
  // failed prune is logged and the save still reports success and refreshes the site. The prune
  // and the refresh are independent, so they run side by side.
  const pruned =
    snapshotKey === null
      ? Promise.resolve()
      : pruneVersions(store, doc).catch((error: unknown) => console.error(error));
  const [revalidated] = await Promise.all([refreshSite(request, doc), pruned]);
  return json(200, { ok: true, updatedAt, revalidated });
}

/** True when a blob holds something. Absent, empty and whitespace-only all mean "nothing saved". */
function hasContent(raw: string | null): raw is string {
  return raw !== null && raw.trim() !== '';
}

/** True when stored text is a JSON object — something a restore could read back as a document. */
function isDocumentText(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
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
  // `damaged: true` tells the editor the stored document itself is the problem (restore a
  // version), unlike the generic 500 below, which is the server failing to read it (reload).
  const damaged = (message: string): Response =>
    json(500, { ok: false, damaged: true, issues: [{ path: '', message }] });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return damaged('The stored content is not valid JSON — publish again, or restore a version.');
  }
  // Valid JSON that is not an object (`null`, a number, a list) is content the site cannot
  // render, so it gets the same answer as malformed JSON rather than a generic failure.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return damaged('The stored content is not a page document — publish again, or restore a version.');
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
    const text = await request.text();
    // Refused before it is parsed or validated: the size limit is what keeps the copy checks on
    // a field fast, so it must not wait for them to run.
    if (text.length > MAX_RECORD_LENGTH) {
      return failure(413, 'That page is too large to save — trim it down and try again.');
    }
    body = JSON.parse(text);
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
    .filter((key) => isVersionKey(doc, key))
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
  if (typeof key !== 'string' || !isVersionKey(doc, key)) {
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

export default async function adminContent(
  request: Request,
  context?: DeployContext,
): Promise<Response> {
  try {
    // The edge guard's checks, repeated here: an older production deploy, unset credentials,
    // wrong credentials (see `../shared/admin-gate.ts`).
    const refused = guardAdmin(request, context);
    if (refused !== null) return refused;

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
      const store = getStore(CONTENT_STORE, { consistency: 'strong' });

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
