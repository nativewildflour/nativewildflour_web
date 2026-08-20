import Image from 'next/image';

/**
 * PHOTO SLOT — an owner-replaceable image placeholder.
 *
 * The site ships with no photographs of the cafe: per docs/BRIEF.md §2.3 the only raster
 * asset is the logo, and every real picture has to come from the owner. Until one arrives,
 * this renders a tasteful dashed frame with the logo badge in the middle so the layout
 * already reserves the space a photo will occupy.
 *
 * HOW TO DROP IN A REAL PHOTO — edit the *usage*, never this file. The component renders on
 * more than one page, so hardcoding an image here would put the same photo under every
 * caption on the site.
 *
 *   1. Save the image into `public/images/`, already cropped and resized. Images are
 *      exported unoptimized, so ship the file at the size it will be displayed.
 *   2. Add `src` plus the file's true pixel dimensions at the call site, e.g. in
 *      `src/app/about/page.tsx`:
 *        <PhotoSlot
 *          caption="Kelly at the counter"
 *          src="/images/kelly-at-the-counter.jpg"
 *          width={1200}
 *          height={900}
 *        />
 *   3. Nothing else changes: `caption` is already both the visible caption and the alt
 *      text, so each usage keeps describing its own photo.
 */

const ASPECTS = {
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '1/1': 'aspect-square',
} as const;

export type PhotoSlotAspect = keyof typeof ASPECTS;

interface PhotoSlotBase {
  /** Describes the photo that belongs here — the visible caption, and the alt text once real. */
  readonly caption: string;
  /** Shape of the reserved space. Defaults to `4/3`. */
  readonly aspect?: PhotoSlotAspect;
  readonly className?: string;
}

/**
 * `src` arrives with the file's true pixel dimensions or not at all: the export is
 * unoptimized, so a real photo without them would ship unsized and shift the layout.
 */
export type PhotoSlotProps = PhotoSlotBase &
  (
    | { readonly src?: undefined; readonly width?: undefined; readonly height?: undefined }
    | { readonly src: string; readonly width: number; readonly height: number }
  );

/** An owner-supplied photograph, or the dashed placeholder holding its space until one arrives. */
export function PhotoSlot(props: PhotoSlotProps) {
  const { caption, aspect = '4/3', className = '' } = props;

  return (
    <figure
      className={`w-full transition-transform duration-300 ease-out motion-safe:rotate-1 motion-safe:hover:rotate-0 ${className}`.trim()}
    >
      {props.src ? (
        <Image
          src={props.src}
          alt={caption}
          width={props.width}
          height={props.height}
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
