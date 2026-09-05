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
 * Deletion is guarded rather than cascading. Nothing reads the store at build time any more, so
 * a document referencing a deleted photo would fail nowhere and simply render a broken picture
 * on a live page: the owner is asked to clear the reference first and told where it is.
 */

import { getStore } from '@netlify/blobs';
import {
  DOCUMENTS,
  DOCUMENT_KEYS,
  collectImageIds,
  type DocumentKey,
} from '../../src/lib/content-docs';
import { IMAGE_ID, MAX_IMAGE_DIMENSION } from '../../src/lib/content/images';
import { checkBasicAuth, unauthorized } from '../shared/basic-auth';

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
  for (const doc of DOCUMENT_KEYS) {
    const raw: string | null = await store.get(`${doc}.json`, { type: 'text' });
    if (raw === null) continue;
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

/** GET /admin/api/images — every stored photo with its dimensions, size, date and users. */
async function listImages(store: ImageStore): Promise<Response> {
  const [{ blobs }, references] = await Promise.all([
    store.list() as Promise<ImageListing>,
    readReferences(),
  ]);
  const keys = blobs.map((blob) => blob.key).sort((a, b) => b.localeCompare(a));
  const images: ImageRecord[] = [];
  for (const id of keys) {
    const entry = await store.getMetadata(id);
    const metadata = entry?.metadata ?? {};
    images.push({
      id,
      width: numberFrom(metadata.width),
      height: numberFrom(metadata.height),
      bytes: numberFrom(metadata.bytes),
      uploadedAt: stringFrom(metadata.uploadedAt),
      originalName: stringFrom(metadata.originalName),
      usedBy: references.get(id) ?? [],
    });
  }
  return json(200, { images });
}

/**
 * POST /admin/api/images — multipart `file` plus the `width`/`height` the browser resized to
 * and the original `name`.
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

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return failure(400, 'No photo was attached to that upload.', 'file');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return failure(413, 'That photo is too large — please pick one under 2 MB.', 'file');
  }
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return failure(413, 'That photo is too large — please pick one under 2 MB.', 'file');
  }
  const head = new Uint8Array(buffer, 0, Math.min(3, buffer.byteLength));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return failure(415, 'That file is not a JPEG photo.', 'file');
  }

  const width = Number(form.get('width'));
  const height = Number(form.get('height'));
  for (const [label, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_IMAGE_DIMENSION) {
      return failure(400, `That photo's ${label} is not a usable size.`, label);
    }
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
  };

  // `onlyIfNew` cannot realistically trip — six random characters inside a one-second bucket —
  // but if it ever did, an unconditional write would silently replace someone's photo.
  const { modified } = await store.set(id, buffer, {
    onlyIfNew: true,
    metadata: {
      width: record.width,
      height: record.height,
      bytes: record.bytes,
      uploadedAt: record.uploadedAt,
      originalName: record.originalName,
    },
  });
  if (!modified) {
    return failure(409, 'That photo could not be saved — try uploading it again.');
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
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
  });
}

/** DELETE /admin/api/images/:id — refused while any saved document still points at it. */
async function deleteImage(store: ImageStore, id: string): Promise<Response> {
  const entry = await store.getMetadata(id);
  if (entry === null) {
    return failure(404, `No photo found for "${id}".`);
  }
  const usedBy = (await readReferences()).get(id) ?? [];
  if (usedBy.length > 0) {
    const where = usedBy.map((doc) => DOCUMENTS[doc].label).join(', ');
    return failure(
      409,
      `That photo is still in use on ${where} — remove it there first, then delete it here.`,
    );
  }
  await store.delete(id);
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
      if (request.method === 'GET') return listImages(store);
      if (request.method === 'POST') return uploadImage(store, request);
      return failure(405, `${request.method} is not supported here — use GET or POST.`);
    }

    if (route.startsWith(`${IMAGES_ROUTE}/`)) {
      const id = route.slice(IMAGES_ROUTE.length + 1);
      // The id is also a public URL segment, so it is checked against the same pattern here —
      // a key this endpoint would not accept is a key `./uploads.mts` would refuse to serve.
      if (!IMAGE_ID.test(id)) {
        return failure(400, 'That is not a photo id.');
      }
      if (request.method === 'GET') return getImage(store, id);
      if (request.method === 'DELETE') return deleteImage(store, id);
      return failure(405, `${request.method} is not supported here — use GET or DELETE.`);
    }

    return failure(404, `No admin API route at ${route}.`);
  } catch (error) {
    // Raw exception text can leak infrastructure details; log it, answer generically.
    console.error(error);
    return failure(500, 'Something went wrong handling that request — try again in a moment.');
  }
}
