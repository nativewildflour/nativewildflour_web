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
  SMALL_IMAGE_PREFIX,
  SMALL_IMAGE_WIDTH,
} from '../../src/lib/content/images';
import { checkBasicAuth, unauthorized } from '../shared/basic-auth';
import { guardWrite } from '../shared/request-guard';

/** Netlify routes requests to this function by exact path — no wildcard, no `/api/` root. */
export const config = {
  path: ['/admin/api/images', '/admin/api/images/:id'],
};

const IMAGE_STORE = 'site-images';
const CONTENT_STORE = 'site-content';
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

/** The blob key of a photo's 800px copy. */
const smallKey = (id: string): string => `${SMALL_IMAGE_PREFIX}/${id}`;

type ImageStore = ReturnType<typeof getStore>;

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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Error responses share one shape with the content API: `{ ok, issues }`. */
function failure(status: number, message: string, path = ''): Response {
  return json(status, { ok: false, issues: [{ path, message }] });
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
 * document that will not parse is skipped too — it is already failing every build, and the
 * publish endpoint is where that gets fixed.
 */
async function readReferences(): Promise<Map<string, DocumentKey[]>> {
  const store = getStore(CONTENT_STORE, { consistency: 'strong' });
  const references = new Map<string, DocumentKey[]>();
  // The four reads are independent, so they go out together; the fold below runs in
  // `DOCUMENT_KEYS` order so `usedBy` lists pages in a stable order.
  const raws: (string | null)[] = await Promise.all(
    DOCUMENT_KEYS.map((doc) => store.get(`${doc}.json`, { type: 'text' })),
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
 * per document, all read in parallel), shared by the library listing and the delete guard. An
 * unreadable snapshot holds nothing — a restore refuses it anyway.
 */
async function readHistoryReferences(): Promise<Map<string, DocumentKey[]>> {
  const store = getStore(CONTENT_STORE, { consistency: 'strong' });
  const perDocument = await Promise.all(
    DOCUMENT_KEYS.map(async (doc) => {
      const { blobs } = (await store.list({ prefix: `${doc}-versions/` })) as ImageListing;
      const raws: (string | null)[] = await Promise.all(
        blobs.map((blob) => store.get(canonicalKey(blob.key), { type: 'text' })),
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

/** A listed key back in the form it was written; see `canonicalKey` in `./admin-content.mts`. */
function canonicalKey(key: string): string {
  if (!key.includes('%')) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
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

/** GET /admin/api/images — every stored photo with its dimensions, size, date and users. */
async function listImages(store: ImageStore): Promise<Response> {
  const [{ blobs }, references, history] = await Promise.all([
    store.list() as Promise<ImageListing>,
    readReferences(),
    readHistoryReferences(),
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
  const result: { modified: boolean; etag?: string } = await store.set(id, buffer, {
    onlyIfNew: true,
    metadata: {
      width: record.width,
      height: record.height,
      bytes: record.bytes,
      uploadedAt: record.uploadedAt,
      originalName: record.originalName,
    },
  });
  if (!result.modified) {
    return failure(409, 'That photo could not be saved — try uploading it again.');
  }
  // `@netlify/blobs` reports `modified: true` for ANY answer to a conditional write other than
  // 412, a refused or failed one included. A real write comes back with its etag; without one,
  // the photo must be readable under its id before the upload is called a success.
  if (typeof result.etag !== 'string' || result.etag === '') {
    let stored = false;
    try {
      const entry = await store.getMetadata(id);
      stored =
        entry !== null &&
        entry.metadata.uploadedAt === record.uploadedAt &&
        entry.metadata.bytes === record.bytes;
    } catch {
      stored = false;
    }
    if (!stored) {
      return failure(503, 'The photo did not finish uploading — try again in a moment.');
    }
  }

  // The small copy goes in after the photo, and failing to store it does not fail the upload:
  // the public endpoint answers `/images/uploads/w800/<id>` with the full photo when the copy
  // is missing, so a page that offers it in `srcset` still shows the right picture.
  if (small !== null) {
    try {
      const written: { modified: boolean } = await store.set(smallKey(id), small.buffer, {
        onlyIfNew: true,
        metadata: { width: small.width, height: small.height, bytes: small.buffer.byteLength },
      });
      if (!written.modified) {
        console.warn(`[admin-images] a small copy of ${id} already existed and was kept`);
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
 * practice nothing is). Read back when the store answers without an etag, as on upload.
 */
async function putBack(store: ImageStore, blob: StoredBlob): Promise<boolean> {
  try {
    const result: { modified: boolean; etag?: string } = await store.set(blob.key, blob.data, {
      onlyIfNew: true,
      metadata: blob.metadata,
    });
    if (!result.modified) return false;
    if (typeof result.etag === 'string' && result.etag !== '') return true;
    const back = await store.getMetadata(blob.key);
    return back !== null && back.metadata.bytes === blob.metadata.bytes;
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * DELETE /admin/api/images/:id — refused while any saved document, or any saved version of one,
 * still points at it; and undone if a publish that shows it lands while the delete runs.
 */
async function deleteImage(store: ImageStore, id: string): Promise<Response> {
  const entry = await store.getMetadata(id);
  if (entry === null) {
    return failure(404, `No photo found for "${id}".`);
  }
  const usedBy = (await readReferences()).get(id) ?? [];
  if (usedBy.length > 0) return inUse(usedBy);
  const inHistory = (await readHistoryReferences()).get(id) ?? [];
  if (inHistory.length > 0) {
    const where = inHistory.map((doc) => DOCUMENTS[doc].label).join(', ');
    return failure(
      409,
      `That photo is still kept in the saved versions of the ${where}, and restoring one of them would put it back on the site. It can be deleted once those versions have aged out of the history.`,
    );
  }

  // Everything the delete removes is read first — bytes and metadata — so it can be put back
  // exactly if a publish turns out to have claimed the photo in the meantime.
  const [main, small] = await Promise.all([readStored(store, id), readStored(store, smallKey(id))]);
  if (main === null) {
    return failure(404, `No photo found for "${id}".`);
  }
  await store.delete(id);
  if (small !== null) await store.delete(small.key);

  // The re-check that closes the race with a publish: one that checked its photos before this
  // delete landed, and wrote after the checks above, references the photo by now.
  const claimedBy = (await readReferences()).get(id) ?? [];
  if (claimedBy.length > 0) {
    const restored = await putBack(store, main);
    if (small !== null) await putBack(store, small);
    if (!restored) {
      // The publish re-checks its photos after its own write and rolls itself back when one is
      // gone, so the live page is still safe; this only has to be findable in the logs.
      console.error(`[admin-images] ${id} was claimed mid-delete and could not be put back`);
    }
    return inUse(claimedBy);
  }

  await purgeUpload(id);
  return json(200, { ok: true });
}

export default async function adminImages(request: Request): Promise<Response> {
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
    // Strong consistency store-wide: `list()` has no per-operation override, and a library
    // that does not show the photo just uploaded is a library the owner cannot use.
    const store = getStore(IMAGE_STORE, { consistency: 'strong' });

    if (route === IMAGES_ROUTE) {
      // Awaited, not returned bare, so a rejection lands in this function's catch.
      if (request.method === 'GET') return await listImages(store);
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
        return guardWrite(request, null) ?? (await deleteImage(store, id));
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
