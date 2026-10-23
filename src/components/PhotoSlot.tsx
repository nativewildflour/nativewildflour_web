import Image from 'next/image';

import type { PhotoContent } from '@/lib/content/images';
import { imageSrc, imageSrcSet } from '@/lib/content/images';

/**
 * PHOTO SLOT — an owner-replaceable image placeholder.
 *
 * The site ships with no photographs of the cafe: per docs/BRIEF.md §2.3 the only raster
 * asset is the logo, and every real picture has to come from the owner. Until one arrives,
 * this renders a tasteful dashed frame with the logo badge in the middle so the layout
 * already reserves the space a photo will occupy.
 *
 * The slot belongs to a content document: the owner uploads a picture in the admin editor and
 * it appears here once she publishes; nothing in the code changes. The caption does double duty
 * as the visible caption and the alt text. A photo wider than 800px also offers its 800px copy
 * in `srcset`. Uploads carry their pixel size in the document, so the frame is sized before
 * the bytes arrive (`images.unoptimized` means nothing else would size it).
 */

/** The reserved space's shape — every slot on the site is 4:3. */
const ASPECT = 'aspect-[4/3]';

export interface PhotoSlotProps {
  /** Caption and image travel together, as the document stores them. */
  readonly photo: PhotoContent;
  /**
   * Where uploaded images are served from. Defaults to the live site's uploads endpoint; the
   * admin preview reads the auth-gated image endpoint instead (full size, with no `srcset`).
   */
  readonly imageBase?: string;
  readonly className?: string;
}

/** Every slot is full width on phones and two fifths of a ≤ 72rem column from `md` up. */
const SIZES = '(min-width: 768px) min(40vw, 29rem), 100vw';

/** An owner-supplied photograph, or the dashed placeholder holding its space until one arrives. */
export function PhotoSlot({ photo, imageBase, className = '' }: PhotoSlotProps) {
  const caption = photo.caption;
  const image =
    photo.image === null
      ? null
      : {
          src: imageSrc(photo.image, imageBase),
          width: photo.image.width,
          height: photo.image.height,
          // The admin preview reads the auth-gated endpoint, which serves the full image only —
          // so it gets no `srcset`, and shows exactly the bytes that were uploaded.
          srcSet: imageBase === undefined ? imageSrcSet(photo.image) : undefined,
        };

  return (
    <figure
      className={`w-full transition-transform duration-300 ease-out motion-safe:rotate-1 motion-safe:hover:rotate-0 ${className}`.trim()}
    >
      {image?.srcSet !== undefined ? (
        // A plain `<img>` on purpose: `images.unoptimized` makes `next/image` drop both `srcSet`
        // and `sizes`, and this is the one picture with a smaller file to offer. Sized and lazy
        // the way `next/image` would emit it, so nothing shifts as it loads.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={SIZES}
          alt={caption}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          className={`w-full rounded-3xl object-cover shadow-card ${ASPECT}`}
        />
      ) : image ? (
        <Image
          src={image.src}
          alt={caption}
          width={image.width}
          height={image.height}
          // Documents the rendered size; `images.unoptimized` emits no srcset of its own.
          sizes={SIZES}
          className={`w-full rounded-3xl object-cover shadow-card ${ASPECT}`}
        />
      ) : (
        <div
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-wood/40 bg-parchment/70 p-6 text-center shadow-card ${ASPECT}`}
        >
          {/* Logo watermark. The logo art has a white background, so it sits on a white badge. */}
          <span className="inline-flex items-center justify-center rounded-2xl bg-snow p-2 shadow-sm ring-1 ring-bark/10">
            <Image
              src="/images/logo-256.webp"
              alt=""
              width={256}
              height={256}
              className="h-16 w-16 rounded-xl sm:h-20 sm:w-20"
            />
          </span>
          <span className="text-sm font-bold tracking-wide text-bark/70 uppercase">
            Photo coming soon
          </span>
        </div>
      )}
      <figcaption className="mt-3 text-sm text-bark/70">{caption}</figcaption>
    </figure>
  );
}
