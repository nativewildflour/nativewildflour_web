/**
 * Photo delivery — a Netlify Function (v2) serving the owner's uploaded pictures to the public
 * site. This is the one function with no auth in front of it, by design: what it serves is a
 * picture already published on a page anyone can read.
 *
 *   GET  /images/uploads/:id  -> the JPEG bytes, cached forever
 *   HEAD /images/uploads/:id  -> the same headers, no body
 *
 * The path is the literal spelling of `UPLOADS_BASE` in `src/lib/content/images.ts` — Netlify
 * reads `config.path` by parsing this file, so it cannot be built from an import. Keep the two
 * in step; `imageSrc()` is what writes these URLs into the markup.
 *
 * Until v2 the bytes were copied into `public/images/uploads/` before each build and shipped as
 * static files. Nothing writes into the repository any more: the pictures live in the
 * `site-images` blob store and this endpoint is how they reach a visitor. That is affordable
 * because an id is immutable — it is minted per upload and never reused, so the bytes behind a
 * URL can never change and the response is cached indefinitely at the CDN and in the browser.
 * A deleted photo needs no purge either: the delete guard in `./admin-images.mts` refuses while
 * any saved document still references the id, so nothing is left pointing at the URL.
 *
 * Netlify routes by path specificity, so this beats the Next runtime's catch-all `/*` the same
 * way the `/admin/api/*` functions do.
 */

import { getStore } from '@netlify/blobs';
import { IMAGE_ID } from '../../src/lib/content/images';

/** Must stay the literal `UPLOADS_BASE` + `/:id`. See the note above. */
export const config = {
  path: '/images/uploads/:id',
};

const IMAGE_STORE = 'site-images';
const ROUTE_PREFIX = '/images/uploads/';
/** Ids are minted once and never reused, so the bytes behind a URL cannot change. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

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
async function readImage(store: ImageStore, id: string): Promise<ArrayBuffer | null> {
  try {
    return await store.get(id, { type: 'arrayBuffer', consistency: 'strong' });
  } catch (error) {
    if ((error as { name?: string })?.name !== 'BlobsConsistencyError') throw error;
    return store.get(id, { type: 'arrayBuffer' });
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
    const id = route.startsWith(ROUTE_PREFIX) ? route.slice(ROUTE_PREFIX.length) : '';
    // The same pattern the upload endpoint mints against: an id this check would refuse is an
    // id no upload could have written, so it is a bad request rather than a missing photo.
    if (!IMAGE_ID.test(id)) {
      return text(400, 'That is not a photo id.');
    }

    const store = getStore(IMAGE_STORE);
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      'Cache-Control': IMMUTABLE,
      // The CDN keeps its own copy under the same terms; the tag is per-id so a purge could
      // ever be aimed at one photo rather than the whole site.
      'Netlify-CDN-Cache-Control': IMMUTABLE,
      'Netlify-Cache-Tag': `upload-${id}`,
    };
    if (request.method === 'HEAD') {
      // Same headers, no body. The upload records the byte count in the blob's metadata, so the
      // length the GET would send comes from a metadata read rather than the bytes themselves.
      const entry = await readMetadata(store, id);
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

    const bytes = await readImage(store, id);
    if (bytes === null || bytes === undefined) {
      return text(404, `No photo found for "${id}".`);
    }
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    // Raw exception text can leak infrastructure details; log it, answer generically.
    console.error(error);
    return text(500, 'That photo could not be loaded — try again in a moment.');
  }
}
