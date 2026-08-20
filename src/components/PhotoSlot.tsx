import Image from 'next/image';

/**
 * PHOTO SLOT — an owner-replaceable image placeholder.
 *
 * The site ships with no photographs of the cafe: per docs/BRIEF.md §2.3 the only raster
 * asset is the logo, and every real picture has to come from the owner. Until one arrives,
 * this renders a tasteful dashed frame with the logo badge in the middle so the layout
 * already reserves the space a photo will occupy.
 *
 * HOW TO DROP IN A REAL PHOTO
 *   1. Save the image into `public/images/`, e.g. `public/images/kelly-at-the-counter.jpg`.
 *   2. In this file, replace the dashed `<div>` below with:
 *        <Image
 *          src="/images/kelly-at-the-counter.jpg"
 *          alt={caption}
 *          width={1200}
 *          height={900}
 *          className="h-auto w-full rounded-2xl object-cover shadow-sm"
 *        />
 *      Images are exported unoptimized, so always pass the file's real pixel width/height.
 *   3. Nothing else changes: the `caption` prop is already both the visible caption and the
 *      alt text, so each usage keeps describing its own photo.
 */

const ASPECTS = {
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '1/1': 'aspect-square',
} as const;

export type PhotoSlotAspect = keyof typeof ASPECTS;

export interface PhotoSlotProps {
  /** Describes the photo that belongs here. Shown as the caption; becomes the alt text later. */
  readonly caption: string;
  /** Shape of the reserved space. Defaults to `4/3`. */
  readonly aspect?: PhotoSlotAspect;
  readonly className?: string;
}

/** Dashed placeholder standing in for a photograph the owner will supply. */
export function PhotoSlot({ caption, aspect = '4/3', className = '' }: PhotoSlotProps) {
  return (
    <figure
      className={`w-full transition-transform duration-300 ease-out motion-safe:rotate-1 motion-safe:hover:rotate-0 ${className}`.trim()}
    >
      <div
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-wood/40 bg-parchment/70 p-6 text-center shadow-card ${ASPECTS[aspect]}`}
      >
        {/* Logo watermark. The logo art has a white background, so it always sits on a white badge. */}
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
      <figcaption className="mt-3 text-sm text-bark/70">{caption}</figcaption>
    </figure>
  );
}
