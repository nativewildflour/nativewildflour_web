'use client';

/**
 * Get a photograph ready to upload, in the browser.
 *
 * Everything the owner picks — a picture straight off a phone, a scan, a screenshot — is
 * decoded, shrunk to fit the site and re-encoded as JPEG before a single byte leaves the
 * page. Three reasons it happens here rather than on the server:
 *
 * - the upload endpoint never decodes an image, so the pixel size the pages render at has to
 *   be measured somewhere, and this is the only place that already has the pixels;
 * - a modern camera file is several megabytes, well past the endpoint's limit, and shrinking
 *   first turns "that photo is too big" into a non-event;
 * - the export is unoptimized, so whatever ships is what a visitor downloads.
 *
 * It never throws. Every failure comes back as a sentence the owner can act on, because the
 * one thing worse than a refused photo is a refused photo with no explanation.
 */

import { SMALL_IMAGE_WIDTH } from '@/lib/content/images';

/** Longest edge of a stored photo, in pixels. Comfortably past any slot the site renders. */
export const MAX_EDGE = 1600;

/** Visibly indistinguishable from the original at these sizes, at a fraction of the bytes. */
const QUALITY = 0.85;

export interface EncodedImage {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

export interface ResizedImage extends EncodedImage {
  /**
   * The `SMALL_IMAGE_WIDTH`-wide copy the public pages offer phones in `srcset`, made only
   * when the stored photo is wider than that. Uploaded alongside the photo itself.
   */
  readonly small: EncodedImage | null;
}

export interface ResizeFailure {
  readonly error: string;
}

export type ResizeResult = ResizedImage | ResizeFailure;

const UNREADABLE = 'That file couldn’t be read as a photo — try a JPEG or PNG.';
const NO_CANVAS =
  'This browser couldn’t prepare the photo. Try again in a different browser, or with a smaller picture.';

/** A decoded picture plus whatever has to be let go of once it has been drawn. */
interface DecodedSource {
  readonly draw: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly release: () => void;
}

/**
 * The fallback path. Older engines (and a few image formats) refuse `createImageBitmap`, but
 * every one of them will load the same file into an `<img>` from an object URL.
 */
function decodeWithElement(file: Blob): Promise<DecodedSource | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => {
      const width = element.naturalWidth;
      const height = element.naturalHeight;
      if (width === 0 || height === 0) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      resolve({ draw: element, width, height, release: () => URL.revokeObjectURL(url) });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    element.src = url;
  });
}

/**
 * `imageOrientation: 'from-image'` is the whole reason this path comes first: a phone stores
 * a sideways picture upright with a rotation tag, and drawing the raw pixels to a canvas
 * would bake the sideways version in. The `<img>` fallback applies the tag by itself.
 */
async function decode(file: Blob): Promise<DecodedSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          draw: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Fall through: the element path handles what this one cannot.
    }
  }
  return decodeWithElement(file);
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', QUALITY);
    } catch {
      resolve(null);
    }
  });
}

/** `source` drawn at `width` × `height` on a white ground, or `null` without a 2D context. */
function draw(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) return null;

  // JPEG has no transparency, and an unpainted canvas encodes as black — a picture with a
  // see-through background would arrive with a black surround without this.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** The canvas encoded as JPEG, or `null`. */
async function encode(canvas: HTMLCanvasElement): Promise<EncodedImage | null> {
  const { width, height } = canvas;
  const blob = await toJpeg(canvas);
  if (blob === null || blob.size === 0) return null;
  return { blob, width, height };
}

/**
 * Hands a canvas's pixels back now rather than whenever it is collected — some engines (Safari
 * above all) cap the memory all canvases may hold at once, and a phone hits that cap first.
 */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * One picture, shrunk to fit and encoded as JPEG, with the pixel size the document will store —
 * plus, for a photo wider than `SMALL_IMAGE_WIDTH`, a copy exactly that wide.
 * A file smaller than the ceiling is re-encoded rather than passed through, so every stored
 * photo is a JPEG the endpoint will accept.
 *
 * Memory is the constraint on a phone: a camera picture decodes to tens of megabytes. So the
 * decoded original is drawn once, at the stored size, and let go of straight away; the small
 * copy is drawn from that canvas (a clean 2:1 step from a full-size photo), and only then is
 * anything encoded.
 */
export async function resizeImage(file: File): Promise<ResizeResult> {
  try {
    const source = await decode(file);
    if (source === null) return { error: UNREADABLE };

    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    let fullCanvas: HTMLCanvasElement | null;
    try {
      fullCanvas = draw(source.draw, width, height);
    } finally {
      source.release();
    }
    if (fullCanvas === null) return { error: NO_CANVAS };

    let smallCanvas: HTMLCanvasElement | null = null;
    try {
      if (width > SMALL_IMAGE_WIDTH) {
        const smallHeight = Math.max(1, Math.round((height * SMALL_IMAGE_WIDTH) / width));
        smallCanvas = draw(fullCanvas, SMALL_IMAGE_WIDTH, smallHeight);
        if (smallCanvas === null) return { error: NO_CANVAS };
      }

      const full = await encode(fullCanvas);
      if (full === null) return { error: NO_CANVAS };
      // Encoded, the full-size pixels are done with — let them go before the second encode.
      releaseCanvas(fullCanvas);

      let small: EncodedImage | null = null;
      if (smallCanvas !== null) {
        small = await encode(smallCanvas);
        if (small === null) return { error: NO_CANVAS };
      }
      return { ...full, small };
    } finally {
      // Every way out, a failure part-way included. Releasing a canvas twice is harmless.
      releaseCanvas(fullCanvas);
      if (smallCanvas !== null) releaseCanvas(smallCanvas);
    }
  } catch {
    return { error: UNREADABLE };
  }
}
