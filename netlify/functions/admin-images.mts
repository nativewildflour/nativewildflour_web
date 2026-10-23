/**
 * Photo API — a Netlify Function (v2) backing the admin photo library and every photo field.
 *
 * Routes (under `/admin/`, behind the same Basic-auth edge guard and the same in-function
 * re-check as `./admin-content.mts`):
 *
 *   GET    /admin/api/images      -> 200 { images: ImageRecord[] }, newest first
 *   POST   /admin/api/images      -> multipart upload; 201 { ok: true, image }
 *   GET    /admin/api/images/:id  -> the JPEG bytes (this is what the editor previews from)
 *   DELETE /admin/api/images/:id  -> 200, or 409 while a document still references it
 *
 * The bytes live in the `site-images` blob store under the photo's id, which is also the last
 * segment of its public URL: `./uploads.mts` serves `/images/uploads/:id` from the same store,
 * so an upload is live the moment it lands here. Nothing rewrites or re-encodes it — the browser
 * has already downscaled it to at most 1600px and re-encoded it as JPEG, so this endpoint's job
 * is to refuse anything that is not what it claims to be and to store it under a stable id.
 *
 * A photo wider than 800px arrives with an 800px copy in the same upload (`small`). It is
 * stored under `w800/<id>` in the same store, served at `/images/uploads/w800/<id>`, and
 * deleted, put back and purged together with the photo; the library never lists it on its own.
 *
 * Deletion is guarded rather than cascading. Nothing reads the store at build time any more, so
 * a document referencing a deleted photo would fail nowhere and simply render a broken picture
 * on a live page: the owner is asked to clear the reference first and told where it is. The
 * guard covers version history as well as the live pages, because a restore puts a snapshot's
 * photos back on the site; publish and restore separately refuse a photo that is missing.
 *
 * Those two checks race: a publish can check its photos, a delete can then check the documents,
 * and both pass. So each side re-checks after its own write. A delete keeps the bytes and
 * metadata it removed and, if a current document references the photo once the delete has
 * landed, puts both back exactly and answers 409; a publish re-checks its photos after its write
 * and rolls itself back (`./admin-content.mts`). Whichever order the writes land in, no live
 * page is left pointing at a photo that is gone. When both re-checks fire, both back off — the
 * photo stays, the page keeps its previous version, and the owner simply tries again.
 *
 * A delete also asks Netlify's CDN to drop its copies (cache tag `upload-<id>`, shared by the
 * photo and its small copy), so the public URLs stop answering straight away rather than
 * whenever the cached copies would have expired.
 */

import { getStore } from '@netlify/blobs';
import { purgeCache } from '@netlify/functions';
import {
  DOCUMENTS,
  DOCUMENT_KEYS,
  collectImageIds,
  type DocumentKey,
} from '../../src/lib/content-docs';
import {
  IMAGE_ID,
  MAX_IMAGE_DIMENSION,
  SMALL_IMAGE_WIDTH,
  smallImageKey,
} from '../../src/lib/content/images';
import { guardAdmin } from '../shared/admin-gate';
import type { DeployContext } from '../shared/basic-auth';
import { guardWrite } from '../shared/request-guard';
import { failure, json } from '../shared/responses';
import {
  CONTENT_STORE,
  IMAGE_STORE,
  canonicalKey,
  currentKey,
  isVersionKey,
  versionPrefix,
} from '../shared/stores';
import { writeOutcome } from '../shared/write-outcome';

/** Netlify routes requests to this function by exact path — no wildcard, no `/api/` root. */
export const config = {
  path: ['/admin/api/images', '/admin/api/images/:id'],
};

const IMAGES_ROUTE = '/admin/api/images';
/** Uploads above this are refused with a 413. The editor downscales first, so a photo that
 *  arrives this large is one the resize step could not handle. */
const MAX_IMAGE_BYTES = 2_000_000;
/** The original filename is a label in the library, never a path — long ones are trimmed. */
const MAX_NAME_LENGTH = 200;
/** Lowercase alphanumerics only: the id doubles as a filename and must satisfy `IMAGE_ID`. */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** How long the CDN purge may take before the delete answers without it. */
const PURGE_TIMEOUT_MS = 5_000;

type ImageStore = ReturnType<typeof getStore>;

/** What this function reads of Netlify's runtime `context`: the deploy, and `waitUntil`. */
interface FunctionContext extends DeployContext {
  readonly waitUntil?: (promise: Promise<unknown>) => void;
}

/** One photo as the library and the photo fields see it. */
interface ImageRecord {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly uploadedAt: string;
  readonly originalName: string;
  /** Documents whose *saved* content references this photo — the delete guard. */
  readonly usedBy: DocumentKey[];
  /** Documents whose saved versions still hold this photo — the other half of the guard. */
  readonly inHistory: DocumentKey[];
}

/**
 * `20260902-153000-a1b2c3.jpg` — UTC date, UTC time, then six random characters. The timestamp
 * prefix is what makes a plain key sort double as "newest first", so the listing needs no
 * metadata read to order itself correctly.
 */
function newImageId(uploadedAt: string): string {
  const date = uploadedAt.slice(0, 10).replace(/-/g, '');
  const time = uploadedAt.slice(11, 19).replace(/:/g, '');
  const random = new Uint8Array(6);
  crypto.getRandomValues(random);
  let suffix = '';
  for (const value of random) suffix += ID_ALPHABET.charAt(value % ID_ALPHABET.length);
  return `${date}-${time}-${suffix}.jpg`;
}

function numberFrom(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Which documents reference which photo, read from the store rather than the seeds. A document
 * with nothing saved over it contributes nothing on purpose: the seeds ship no uploads, so
 * before the owner's first save on a page there is nothing there to hold a photo. A saved
 * document that will not parse is skipped too — its page is already failing to render, and the
 * editor's error mode (a restore) is where that gets fixed.
 */
async function readReferences(): Promise<Map<string, DocumentKey[]>> {
  const store = getStore(CONTENT_STORE, { consistency: 'strong' });
  const references = new Map<string, DocumentKey[]>();
  // The four reads are independent, so they go out together; the fold below runs in
  // `DOCUMENT_KEYS` order so `usedBy` lists pages in a stable order.
  const raws: (string | null)[] = await Promise.all(
    DOCUMENT_KEYS.map((doc) => store.get(currentKey(doc), { type: 'text' })),
  );
  for (const [position, doc] of DOCUMENT_KEYS.entries()) {
    const raw = raws[position];
    if (raw === null || raw === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const id of collectImageIds(parsed)) {
      const docs = references.get(id);
      if (docs) docs.push(doc);
      else references.set(id, [doc]);
    }
  }
  return references;
}

/** The slice of `store.list()` results this API reads. */
interface ImageListing {
  blobs: { etag: string; key: string }[];
}

/**
 * Which documents' version history holds which photo: one pass over every snapshot (at most 20
 * per document, all read in parallel), for the delete guard and for the photo library (asked
 * for with `?history=1` — the photo pickers have no use for it). The snapshots are exactly the
 * ones the version history lists (`isVersionKey`), so the guard and the history agree on what a
 * version is. An unreadable snapshot holds nothing — a restore refuses it anyway.
 */
async function readHistoryReferences(): Promise<Map<string, DocumentKey[]>> {
  const store = getStore(CONTENT_STORE, { consistency: 'strong' });
  const perDocument = await Promise.all(
    DOCUMENT_KEYS.map(async (doc) => {
      const { blobs } = (await store.list({ prefix: versionPrefix(doc) })) as ImageListing;
      const keys = blobs.map((blob) => canonicalKey(blob.key)).filter((key) => isVersionKey(doc, key));
      const raws: (string | null)[] = await Promise.all(
        keys.map((key) => store.get(key, { type: 'text' })),
      );
      const ids = new Set<string>();
      for (const raw of raws) {
        if (raw === null || raw === undefined) continue;
        try {
          for (const id of collectImageIds(JSON.parse(raw))) ids.add(id);
        } catch {
          // Skipped: see above.
        }
      }
      return ids;
    }),
  );
  const references = new Map<string, DocumentKey[]>();
  // Folded in `DOCUMENT_KEYS` order so `inHistory` lists pages in a stable order.
  for (const [position, doc] of DOCUMENT_KEYS.entries()) {
    for (const id of perDocument[position] ?? []) {
      const docs = references.get(id);
      if (docs) docs.push(doc);
      else references.set(id, [doc]);
    }
  }
  return references;
}

/**
 * Ask Netlify's CDN to forget a deleted photo and its small copy. Both answer with the cache tag
 * `upload-<id>` (`./uploads.mts`), so one tag covers both. `purgeCache` reads the
 * `NETLIFY_PURGE_API_TOKEN` and `SITE_ID` the platform injects into a function's environment.
 *
 * Best-effort: the photo is already gone from the store, and with nothing on the site pointing
 * at it a cached copy only lingers at a URL nothing links to. Skipped where no token is set
 * (`dev:admin`, the smoke harness), where the library would otherwise throw for want of a site
 * id; and bounded, because the library takes no abort signal and a stalled API must not hold up
 * the delete's answer.
 */
async function purgeUpload(id: string): Promise<void> {
  if (!process.env.NETLIFY_PURGE_API_TOKEN) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      purgeCache({ tags: [`upload-${id}`] }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), PURGE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(`[admin-images] the cache purge for ${id} failed`, error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /admin/api/images — every stored photo with its dimensions, size, date and the pages
 * using it. `?history=1` adds which pages' saved versions still hold each one (`inHistory`, for
 * the library's delete guard); without it — the photo pickers — that list stays empty, and the
 * scan of every saved version is not made.
 */
async function listImages(store: ImageStore, withHistory: boolean): Promise<Response> {
  const [{ blobs }, references, history] = await Promise.all([
    store.list() as Promise<ImageListing>,
    readReferences(),
    withHistory ? readHistoryReferences() : Promise.resolve(new Map<string, DocumentKey[]>()),
  ]);
  // Photos only: the small copies under `w800/` share the store but belong to the photo with
  // the same id, and their slash fails `IMAGE_ID`.
  const keys = blobs
    .map((blob) => canonicalKey(blob.key))
    .filter((key) => IMAGE_ID.test(key))
    .sort((a, b) => b.localeCompare(a));
  // The listing carries no metadata, so each photo costs a HEAD; they go out together rather
  // than one at a time — a library of a few dozen photos read serially would run past the
  // function's time limit and take every photo picker down with it.
  const entries = await Promise.all(keys.map((id) => store.getMetadata(id)));
  const images: ImageRecord[] = [];
  for (const [position, id] of keys.entries()) {
    const metadata = entries[position]?.metadata ?? {};
    images.push({
      id,
      width: numberFrom(metadata.width),
      height: numberFrom(metadata.height),
      bytes: numberFrom(metadata.bytes),
      uploadedAt: stringFrom(metadata.uploadedAt),
      originalName: stringFrom(metadata.originalName),
      usedBy: references.get(id) ?? [],
      inHistory: history.get(id) ?? [],
    });
  }
  return json(200, { images });
}

/** The bytes of one uploaded JPEG part, or the refusal to answer with. */
async function readJpegPart(
  part: FormDataEntryValue | null,
  field: string,
): Promise<ArrayBuffer | Response> {
  if (!(part instanceof Blob)) {
    return failure(400, 'No photo was attached to that upload.', field);
  }
  if (part.size > MAX_IMAGE_BYTES) {
    return failure(413, 'That photo is too large — please pick one under 2 MB.', field);
  }
  const buffer = await part.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return failure(413, 'That photo is too large — please pick one under 2 MB.', field);
  }
  const head = new Uint8Array(buffer, 0, Math.min(3, buffer.byteLength));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return failure(415, 'That file is not a JPEG photo.', field);
  }
  return buffer;
}

/** A pixel dimension from the form, or the refusal to answer with. */
function readDimension(form: FormData, field: string, label: string): number | Response {
  const value = Number(form.get(field));
  if (!Number.isInteger(value) || value < 1 || value > MAX_IMAGE_DIMENSION) {
    return failure(400, `That photo's ${label} is not a usable size.`, field);
  }
  return value;
}

/**
 * POST /admin/api/images — multipart `file` plus the `width`/`height` the browser resized to
 * and the original `name`; and, for a photo wider than 800px, its 800px copy as `small` with
 * `smallWidth`/`smallHeight`. The copy is checked the same way and must be exactly 800px wide
 * and the photo's shape, because the public pages announce it as `800w` in `srcset`.
 *
 * Size is checked before the magic bytes so an oversized upload gets the one answer that tells
 * the owner what to do about it, and the magic-byte check is what stops a renamed PNG (or
 * anything else) from being stored under a `.jpg` id and served as `image/jpeg` forever after.
 */
async function uploadImage(store: ImageStore, request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure(400, 'That upload could not be read — try again.');
  }

  const buffer = await readJpegPart(form.get('file'), 'file');
  if (buffer instanceof Response) return buffer;
  const width = readDimension(form, 'width', 'width');
  if (width instanceof Response) return width;
  const height = readDimension(form, 'height', 'height');
  if (height instanceof Response) return height;

  // The small copy is optional — a photo no wider than 800px has none — but when it comes it
  // has to be what `srcset` will say it is.
  let small: { buffer: ArrayBuffer; width: number; height: number } | null = null;
  if (form.get('small') !== null) {
    const smallBuffer = await readJpegPart(form.get('small'), 'small');
    if (smallBuffer instanceof Response) return smallBuffer;
    const smallWidth = readDimension(form, 'smallWidth', 'small copy width');
    if (smallWidth instanceof Response) return smallWidth;
    const smallHeight = readDimension(form, 'smallHeight', 'small copy height');
    if (smallHeight instanceof Response) return smallHeight;
    const expectedHeight = Math.round((height * SMALL_IMAGE_WIDTH) / width);
    if (
      width <= SMALL_IMAGE_WIDTH ||
      smallWidth !== SMALL_IMAGE_WIDTH ||
      Math.abs(smallHeight - expectedHeight) > 1
    ) {
      return failure(
        400,
        `The photo's small copy must be ${SMALL_IMAGE_WIDTH} pixels wide and the same shape as the photo — try uploading it again.`,
        'small',
      );
    }
    small = { buffer: smallBuffer, width: smallWidth, height: smallHeight };
  }

  const uploadedAt = new Date().toISOString();
  const id = newImageId(uploadedAt);
  const record: ImageRecord = {
    id,
    width,
    height,
    bytes: buffer.byteLength,
    uploadedAt,
    originalName: stringFrom(form.get('name')).slice(0, MAX_NAME_LENGTH),
    usedBy: [],
    inHistory: [],
  };

  // `onlyIfNew` cannot realistically trip — six random characters inside a one-second bucket —
  // but if it ever did, an unconditional write would silently replace someone's photo.
  // Whether it landed is `writeOutcome`'s call (`../shared/write-outcome.ts`): a real write
  // comes back with its etag; otherwise the photo must read back under its id with this upload's
  // own stamp — the id was minted for this request, so nothing else can have written it.
  const landing = await writeOutcome(
    await store.set(id, buffer, {
      onlyIfNew: true,
      metadata: {
        width: record.width,
        height: record.height,
        bytes: record.bytes,
        uploadedAt: record.uploadedAt,
        originalName: record.originalName,
      },
    }),
    async () => {
      const entry = await store.getMetadata(id);
      return {
        matches:
          entry !== null &&
          entry.metadata.uploadedAt === record.uploadedAt &&
          entry.metadata.bytes === record.bytes,
      };
    },
  );
  if (landing.outcome !== 'landed') {
    return landing.outcome === 'conflict'
      ? failure(409, 'That photo could not be saved — try uploading it again.')
      : failure(503, 'The photo did not finish uploading — try again in a moment.');
  }

  // The small copy goes in after the photo, and failing to store it does not fail the upload:
  // the public endpoint answers `/images/uploads/w800/<id>` with the full photo when the copy
  // is missing, so a page that offers it in `srcset` still shows the right picture.
  if (small !== null) {
    const key = smallImageKey(id);
    try {
      const copy = await writeOutcome(
        await store.set(key, small.buffer, {
          onlyIfNew: true,
          metadata: { width: small.width, height: small.height, bytes: small.buffer.byteLength },
        }),
        async () => ({
          matches: (await store.getMetadata(key))?.metadata.bytes === small.buffer.byteLength,
        }),
      );
      if (copy.outcome !== 'landed') {
        console.warn(`[admin-images] the small copy of ${id} was not stored (${copy.outcome})`);
      }
    } catch (error) {
      console.warn(`[admin-images] the small copy of ${id} was not stored`, error);
    }
  }

  return json(201, { ok: true, image: record });
}

/** GET /admin/api/images/:id — the bytes, for the editor's previews. */
async function getImage(store: ImageStore, id: string): Promise<Response> {
  const bytes: ArrayBuffer | null = await store.get(id, { type: 'arrayBuffer' });
  if (bytes === null || bytes === undefined) {
    return failure(404, `No photo found for "${id}".`);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // An id is minted per upload and never reused, so the bytes behind it cannot change;
      // `private` keeps the copy in the signed-in browser only, so the library, the pickers and
      // the preview stop re-downloading every photo through a function call each time they open.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

/** "That photo is still in use on …" — the 409 for a photo a current document references. */
function inUse(usedBy: readonly DocumentKey[]): Response {
  const where = usedBy.map((doc) => DOCUMENTS[doc].label).join(', ');
  return failure(
    409,
    `That photo is still in use on ${where} — remove it there first, then delete it here.`,
  );
}

/** One blob exactly as stored — what a delete needs to put it back. */
interface StoredBlob {
  readonly key: string;
  readonly data: ArrayBuffer;
  readonly metadata: Record<string, unknown>;
}

async function readStored(store: ImageStore, key: string): Promise<StoredBlob | null> {
  const entry = await store.getWithMetadata(key, { type: 'arrayBuffer' });
  if (entry === null || entry === undefined) return null;
  return { key, data: entry.data, metadata: entry.metadata };
}

/**
 * Put a deleted blob back under its own key, with its own bytes and metadata. `onlyIfNew`:
 * anything written there since is not this delete's to overwrite (ids are never reused, so in
 * practice nothing is). Confirmed by `writeOutcome`, as on upload — a lost answer retried into a
 * 412 means the blob is already back.
 */
async function putBack(store: ImageStore, blob: StoredBlob): Promise<boolean> {
  try {
    const landing = await writeOutcome(
      await store.set(blob.key, blob.data, { onlyIfNew: true, metadata: blob.metadata }),
      async () => {
        const back = await store.getMetadata(blob.key);
        return { matches: back !== null && back.metadata.bytes === blob.metadata.bytes };
      },
    );
    if (landing.outcome === 'unknown') {
      console.error(`[admin-images] could not confirm that ${blob.key} is back`);
    }
    return landing.outcome === 'landed';
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * Put back everything a delete removed: the small copy before the photo, so that a request in
 * between never finds the photo without its copy (`./uploads.mts` would answer the copy's URL with
 * the full photo, cached for good). Each one gets a second try. True when all are back.
 */
async function putBackAll(store: ImageStore, removed: readonly StoredBlob[]): Promise<boolean> {
  let allBack = true;
  for (const blob of [...removed].reverse()) {
    const back = (await putBack(store, blob)) || (await putBack(store, blob));
    if (!back) allBack = false;
  }
  return allBack;
}

/** The pages' labels, for a sentence: "Home page, Menu". */
const labelsOf = (docs: readonly DocumentKey[]): string =>
  docs.map((doc) => DOCUMENTS[doc].label).join(', ');

/**
 * DELETE /admin/api/images/:id — refused while any saved document, or any saved version of one,
 * still points at it; and undone if a publish that shows it lands while the delete runs, or if
 * the delete cannot finish.
 */
async function deleteImage(
  store: ImageStore,
  id: string,
  context: FunctionContext | undefined,
): Promise<Response> {
  // The three reads are independent, so they go out together.
  const [entry, references, history] = await Promise.all([
    store.getMetadata(id),
    readReferences(),
    readHistoryReferences(),
  ]);
  if (entry === null) {
    return failure(404, `No photo found for "${id}".`);
  }
  const usedBy = references.get(id) ?? [];
  if (usedBy.length > 0) return inUse(usedBy);
  const inHistory = history.get(id) ?? [];
  if (inHistory.length > 0) {
    return failure(
      409,
      `That photo is still kept in the saved versions of the ${labelsOf(inHistory)}, and restoring one of them would put it back on the site. It can be deleted once those versions have aged out of the history.`,
    );
  }

  // Everything the delete removes is read first — bytes and metadata — so it can be put back
  // exactly if a publish turns out to have claimed the photo in the meantime.
  const [main, small] = await Promise.all([
    readStored(store, id),
    readStored(store, smallImageKey(id)),
  ]);
  if (main === null) {
    return failure(404, `No photo found for "${id}".`);
  }

  // The photo goes first: a publish's photo check looks for it under its own id, so its delete
  // is the moment a publish starts seeing the photo as gone. Anything that fails from here on —
  // the copy's delete, the re-check — puts back what was removed, rather than leaving the
  // photo half-deleted with its copy still served or a page pointing at it.
  const removed: StoredBlob[] = [];
  let claimedBy: DocumentKey[];
  try {
    await store.delete(main.key);
    removed.push(main);
    if (small !== null) {
      await store.delete(small.key);
      removed.push(small);
    }
    // The re-check that closes the race with a publish: one that checked its photos before this
    // delete landed, and wrote after the checks above, references the photo by now.
    claimedBy = (await readReferences()).get(id) ?? [];
  } catch (error) {
    console.error(error);
    if (await putBackAll(store, removed)) {
      return failure(503, 'The photo could not be deleted just now — nothing was changed. Try again in a moment.');
    }
    console.error(`[admin-images] ${id}: a delete failed partway and could not be put back`);
    return failure(500, 'The delete stopped partway and the photo could not be put back — reload the photo library before trying again.');
  }

  if (claimedBy.length > 0) {
    if (await putBackAll(store, removed)) return inUse(claimedBy);
    // A publish that already passed its own photo re-check is live and showing the photo, and
    // the photo could not be restored: say so, naming the page, rather than claim it is in use.
    console.error(`[admin-images] ${id} was claimed mid-delete and could not be put back`);
    return failure(
      500,
      `The photo was deleted while the ${labelsOf(claimedBy)} was being published with it, and it could not be put back — open that page in its editor, choose another photo, and publish it again.`,
    );
  }

  // The purge is best-effort and the photo is already gone: hand it to the platform to finish
  // after the answer is sent where it can (`context.waitUntil`), so the owner is not kept waiting.
  const purge = purgeUpload(id);
  if (context?.waitUntil) context.waitUntil(purge);
  else await purge;
  return json(200, { ok: true });
}

export default async function adminImages(
  request: Request,
  context?: FunctionContext,
): Promise<Response> {
  try {
    // The edge guard's checks, repeated here: an older production deploy, unset credentials,
    // wrong credentials (see `../shared/admin-gate.ts`).
    const refused = guardAdmin(request, context);
    if (refused !== null) return refused;

    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, '') || '/';
    // Strong consistency store-wide: `list()` has no per-operation override, and a library
    // that does not show the photo just uploaded is a library the owner cannot use.
    const store = getStore(IMAGE_STORE, { consistency: 'strong' });

    if (route === IMAGES_ROUTE) {
      // Awaited, not returned bare, so a rejection lands in this function's catch.
      if (request.method === 'GET') {
        return await listImages(store, url.searchParams.get('history') === '1');
      }
      if (request.method === 'POST') {
        return guardWrite(request, 'multipart/form-data') ?? (await uploadImage(store, request));
      }
      return failure(405, `${request.method} is not supported here — use GET or POST.`);
    }

    if (route.startsWith(`${IMAGES_ROUTE}/`)) {
      const id = route.slice(IMAGES_ROUTE.length + 1);
      // The id is also a public URL segment, so it is checked against the same pattern here —
      // a key this endpoint would not accept is a key `./uploads.mts` would refuse to serve.
      if (!IMAGE_ID.test(id)) {
        return failure(400, 'That is not a photo id.');
      }
      if (request.method === 'GET') return await getImage(store, id);
      if (request.method === 'DELETE') {
        return guardWrite(request, null) ?? (await deleteImage(store, id, context));
      }
      return failure(405, `${request.method} is not supported here — use GET or DELETE.`);
    }

    return failure(404, `No admin API route at ${route}.`);
  } catch (error) {
    // Raw exception text can leak infrastructure details; log it, answer generically.
    console.error(error);
    return failure(500, 'Something went wrong handling that request — try again in a moment.');
  }
}
