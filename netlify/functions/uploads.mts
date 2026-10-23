/**
 * Photo delivery — a Netlify Function (v2) serving the owner's uploaded pictures to the public
 * site. This is the one function with no auth in front of it, by design: what it serves is a
 * picture already published on a page anyone can read.
 *
 *   GET  /images/uploads/:id       -> the JPEG bytes, cached forever
 *   HEAD /images/uploads/:id       -> the same headers, no body
 *   GET  /images/uploads/w800/:id  -> the photo's 800px copy (`srcset`); the full photo when
 *                                     it has none (uploads from before the copies existed)
 *   HEAD /images/uploads/w800/:id  -> the same headers, no body
 *
 * The paths are the literal spellings of `UPLOADS_BASE` and `SMALL_IMAGE_PREFIX` in
 * `src/lib/content/images.ts` — Netlify
 * reads `config.path` by parsing this file, so it cannot be built from an import. Keep the two
 * in step; `imageSrc()` is what writes these URLs into the markup.
 *
 * Until v2 the bytes were copied into `public/images/uploads/` before each build and shipped as
 * static files. Nothing writes into the repository any more: the pictures live in the
 * `site-images` blob store and this endpoint is how they reach a visitor. That is affordable
 * because an id is immutable — it is minted per upload and never reused, so the bytes behind a
 * URL can never change and the response is cached indefinitely at the CDN and in the browser.
 * A delete is guarded in `./admin-images.mts` — refused while any saved document or saved
 * version still references the id — and then purges the CDN copies by their per-id cache tag.
 *
 * Netlify routes by path specificity, so this beats the Next runtime's catch-all `/*` the same
 * way the `/admin/api/*` functions do.
 */

import { getStore } from '@netlify/blobs';
import {
  IMAGE_ID,
  SMALL_IMAGE_PREFIX,
  UPLOADS_BASE,
  smallImageKey,
} from '../../src/lib/content/images';
import { IMAGE_STORE } from '../shared/stores';

/** Must stay the literal `UPLOADS_BASE` + `/:id` and its `SMALL_IMAGE_PREFIX` twin. See above. */
export const config = {
  path: ['/images/uploads/:id', '/images/uploads/w800/:id'],
};

const ROUTE_PREFIX = `${UPLOADS_BASE}/`;
const SMALL_ROUTE_PREFIX = `${UPLOADS_BASE}/${SMALL_IMAGE_PREFIX}/`;
/** Ids are minted once and never reused, so the bytes behind a URL cannot change. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/**
 * The CDN's copy, under the same terms — and `durable`, so one cached copy serves every edge
 * location instead of each one calling this function the first time it is asked. A delete's
 * purge by cache tag reaches the durable copy too.
 */
const CDN_IMMUTABLE = `${IMMUTABLE}, durable`;

type ImageStore = ReturnType<typeof getStore>;

/** Errors are plain text: this endpoint's client is an `<img>`, not the admin editor. */
function text(status: number, message: string): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Never cache a miss: a photo published seconds ago may simply not have propagated yet.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * A strong read that degrades rather than failing. `BlobsConsistencyError` is raised locally,
 * before any request goes out, purely because the environment offers no uncached edge URL — it
 * says nothing about the data, so the cached read is the right answer. Any other error is a real
 * store failure and propagates to the 500 below. (Same posture as the old build plugin's reader.)
 *
 * Strong matters here because of the timing: the editor uploads a photo and publishes the
 * document referencing it moments later, and the first visitor can arrive before an eventually
 * consistent read would see the bytes.
 */
async function readImage(store: ImageStore, id: string): Promise<ReadableStream | null> {
  // Streamed, not buffered: the first byte goes out as soon as the store sends it.
  try {
    return await store.get(id, { type: 'stream', consistency: 'strong' });
  } catch (error) {
    if ((error as { name?: string })?.name !== 'BlobsConsistencyError') throw error;
    return store.get(id, { type: 'stream' });
  }
}

/** The metadata half of the same read, with the same degrade, for HEAD. */
async function readMetadata(
  store: ImageStore,
  id: string,
): Promise<{ metadata: Record<string, unknown> } | null> {
  try {
    return await store.getMetadata(id, { consistency: 'strong' });
  } catch (error) {
    if ((error as { name?: string })?.name !== 'BlobsConsistencyError') throw error;
    return store.getMetadata(id);
  }
}

export default async function uploads(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text(405, `${request.method} is not supported here — use GET.`);
    }

    const route = new URL(request.url).pathname;
    const small = route.startsWith(SMALL_ROUTE_PREFIX);
    const id = small
      ? route.slice(SMALL_ROUTE_PREFIX.length)
      : route.startsWith(ROUTE_PREFIX)
        ? route.slice(ROUTE_PREFIX.length)
        : '';
    // The same pattern the upload endpoint mints against: an id this check would refuse is an
    // id no upload could have written, so it is a bad request rather than a missing photo.
    if (!IMAGE_ID.test(id)) {
      return text(400, 'That is not a photo id.');
    }

    const store = getStore(IMAGE_STORE);
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      'Cache-Control': IMMUTABLE,
      // The CDN keeps its own copy (see `CDN_IMMUTABLE`); the tag is per-id so the purge a
      // delete makes is aimed at one photo rather than the whole site, and the small copy
      // shares it so that one purge drops both.
      'Netlify-CDN-Cache-Control': CDN_IMMUTABLE,
      'Netlify-Cache-Tag': `upload-${id}`,
    };
    // The small copy's key, falling back to the photo itself: an upload from before the copies
    // existed (or one whose copy failed to store) still answers its `srcset` URL correctly.
    // Caching that answer forever is right too — a photo without a copy never gains one (a
    // delete that has to put a photo back restores its copy first, so this never answers in
    // the moment between the two).
    const keys = small ? [smallImageKey(id), id] : [id];
    if (request.method === 'HEAD') {
      // Same headers, no body. The upload records the byte count in the blob's metadata, so the
      // length the GET would send comes from a metadata read rather than the bytes themselves.
      let entry: { metadata: Record<string, unknown> } | null = null;
      for (const key of keys) {
        entry = await readMetadata(store, key);
        if (entry !== null) break;
      }
      if (entry === null) {
        return text(404, `No photo found for "${id}".`);
      }
      const bytes = entry.metadata.bytes;
      return new Response(null, {
        status: 200,
        headers:
          typeof bytes === 'number' && Number.isInteger(bytes) && bytes >= 0
            ? { ...headers, 'Content-Length': String(bytes) }
            : headers,
      });
    }

    let body: ReadableStream | null = null;
    for (const key of keys) {
      body = (await readImage(store, key)) ?? null;
      if (body !== null) break;
    }
    if (body === null) {
      return text(404, `No photo found for "${id}".`);
    }
    return new Response(body, { status: 200, headers });
  } catch (error) {
    // Raw exception text can leak infrastructure details; log it, answer generically.
    console.error(error);
    return text(500, 'That photo could not be loaded — try again in a moment.');
  }
}
