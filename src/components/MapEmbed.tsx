import { MAP_LINKS, MAP_TITLE } from '@/data/map';

export interface MapEmbedProps {
  /** Accessible name for the iframe. Defaults to `MAP_TITLE`. */
  readonly title?: string;
  readonly className?: string;
}

/** Lazy OpenStreetMap embed. No tracking scripts, no API key. */
export function MapEmbed({ title = MAP_TITLE, className = '' }: MapEmbedProps) {
  return (
    <div
      className={`overflow-hidden rounded-3xl bg-snow shadow-card ring-1 ring-bark/15 ${className}`.trim()}
    >
      <iframe
        src={MAP_LINKS.osmEmbed}
        title={title}
        loading="lazy"
        className="block h-72 w-full border-0 sm:h-96"
        width={640}
        height={384}
      />
    </div>
  );
}
