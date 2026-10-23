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
 * There are two ways to fill it, and both keep the caption doing double duty as the visible
 * caption and the alt text:
 *
 *   - `photo` — a slot from a content document. The owner uploads a picture in the admin
 *     editor and it appears here once she publishes; nothing in the code changes. A photo wider
 *     than 800px also offers its 800px copy in `srcset`. `imageBase` points the `src`
 *     somewhere other than the live site's uploads endpoint (the admin preview reads the
 *     auth-gated image endpoint instead, full size, with no `srcset`).
 *   - `src` plus the file's true pixel `width`/`height` — for a picture committed to
 *     `public/images/`, already cropped and resized. The export is unoptimized, so a photo
 *     without its real dimensions would ship unsized and shift the layout.
 */

const ASPECTS = {
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '1/1': 'aspect-square',
} as const;

export type PhotoSlotAspect = keyof typeof ASPECTS;

interface PhotoSlotBase {
  /** Shape of the reserved space. Defaults to `4/3`. */
  readonly aspect?: PhotoSlotAspect;
  readonly className?: string;
}

/** A file committed to `public/`, or nothing yet. `src` always arrives with its dimensions. */
type PhotoSlotFileProps = PhotoSlotBase & {
  /** Describes the photo that belongs here — the visible caption, and the alt text once real. */
  readonly caption: string;
  readonly photo?: undefined;
  readonly imageBase?: undefined;
} & (
    | { readonly src?: undefined; readonly width?: undefined; readonly height?: undefined }
    | { readonly src: string; readonly width: number; readonly height: number }
  );

/** A photo slot owned by a content document — caption and image travel together. */
type PhotoSlotDocumentProps = PhotoSlotBase & {
  readonly photo: PhotoContent;
  /** Where uploaded images are served from. Defaults to the live site's uploads folder. */
  readonly imageBase?: string;
  readonly caption?: undefined;
  readonly src?: undefined;
  readonly width?: undefined;
  readonly height?: undefined;
};

export type PhotoSlotProps = PhotoSlotFileProps | PhotoSlotDocumentProps;

interface ResolvedPhoto {
  readonly caption: string;
  readonly image: {
    readonly src: string;
    readonly width: number;
    readonly height: number;
    /** Set only for a public upload wider than its 800px copy. */
    readonly srcSet?: string;
  } | null;
}

/** Every slot is full width on phones and two fifths of a ≤ 72rem column from `md` up. */
const SIZES = '(min-width: 768px) min(40vw, 29rem), 100vw';

/** Collapses the two prop forms into the one thing the markup needs. */
function resolvePhoto(props: PhotoSlotProps): ResolvedPhoto {
  if (props.photo !== undefined) {
    const image = props.photo.image;
    return {
      caption: props.photo.caption,
      image:
        image === null
          ? null
          : {
              src: imageSrc(image, props.imageBase),
              width: image.width,
              height: image.height,
              // The admin preview reads the auth-gated endpoint, which serves the full image
              // only — so it gets no `srcset`, and shows exactly the bytes that were uploaded.
              srcSet: props.imageBase === undefined ? imageSrcSet(image) : undefined,
            },
    };
  }
  return {
    caption: props.caption,
    image:
      props.src === undefined
        ? null
        : { src: props.src, width: props.width, height: props.height },
  };
}

/** An owner-supplied photograph, or the dashed placeholder holding its space until one arrives. */
export function PhotoSlot(props: PhotoSlotProps) {
  const { aspect = '4/3', className = '' } = props;
  const { caption, image } = resolvePhoto(props);

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
          className={`w-full rounded-3xl object-cover shadow-card ${ASPECTS[aspect]}`}
        />
      ) : image ? (
        <Image
          src={image.src}
          alt={caption}
          width={image.width}
          height={image.height}
          // Documents the rendered size; `images.unoptimized` emits no srcset of its own.
          sizes={SIZES}
          className={`w-full rounded-3xl object-cover shadow-card ${ASPECTS[aspect]}`}
        />
      ) : (
        <div
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-wood/40 bg-parchment/70 p-6 text-center shadow-card ${ASPECTS[aspect]}`}
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
