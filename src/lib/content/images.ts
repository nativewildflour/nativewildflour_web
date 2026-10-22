/**
 * Owner-uploaded photographs: the reference stored inside a content document, and how a public
 * page turns that reference into a `src`.
 *
 * The bytes never live in the document. The admin editor downscales a picture in the browser,
 * uploads it to the `site-images` blob store under a generated id, and the document keeps only
 * `{ id, width, height }`. A public page asks for `/images/uploads/<id>`, which a Netlify
 * Function answers from that store with an immutable cache header — ids never change, so a new
 * picture is a new id and nothing has to be purged.
 *
 * Width and height are stored, not measured, because images are unoptimized: `next/image`
 * needs the true pixel size as it renders or the page shifts as photos load.
 *
 * Relative imports only — the Netlify Functions import this module through their own bundler,
 * which does not know Next's `@/` alias.
 */

/** A photograph in the image store, sized so `next/image` can reserve its space. */
export interface ImageRef {
  /** Blob key and file name, e.g. `20260902-153000-a1b2c3.jpg`. */
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/** A photo slot in a document: always captioned (the caption is also the alt text). */
export interface PhotoContent {
  readonly caption: string;
  readonly image: ImageRef | null;
}

/**
 * Generated ids only: `<yyyymmdd>-<hhmmss>-<random>.jpg`. Uploads are re-encoded to JPEG in the
 * browser, so the extension is always `.jpg`; the shape doubles as the URL-safety check for the
 * `/admin/api/images/:id` route.
 */
export const IMAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/;

/** Largest accepted pixel dimension, matching the editor's downscale ceiling with headroom. */
export const MAX_IMAGE_DIMENSION = 8000;

/** The public path the uploads function answers on. */
export const UPLOADS_BASE = '/images/uploads';

/**
 * The `src` for a stored image. `base` exists for the admin preview, which points at the
 * auth-gated `/admin/api/images` endpoint instead, so everything the editor loads stays inside
 * the signed-in section (cached privately in that browser only).
 */
export function imageSrc(image: ImageRef, base: string = UPLOADS_BASE): string {
  return `${base}/${image.id}`;
}
