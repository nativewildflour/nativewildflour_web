import { Section } from '@/components/Section';
import { DockCard } from '@/components/directions/DockCard';
import { InfoIcon } from '@/components/directions/Icons';
import { ShuttleCard } from '@/components/directions/ShuttleCard';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsDocksProps {
  readonly content: DirectionsContent['docks'];
  readonly shuttle: DirectionsContent['shuttle'];
}

/** "From your cruise ship" — the caution, one card per dock, then the ride-instead option. */
export function DirectionsDocks({ content, shuttle }: DirectionsDocksProps) {
  return (
    <Section
      id="from-the-docks"
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
    >
      <p className="flex items-start gap-3 rounded-3xl border-2 border-dashed border-honey/50 bg-wheat/15 p-4 text-bark/85">
        <span className="mt-0.5 text-honey">
          <InfoIcon />
        </span>
        <span>{content.caveat}</span>
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {content.items.map((dock) => (
          <DockCard key={dock.id} dock={dock} />
        ))}
      </div>

      <ShuttleCard shuttle={shuttle} className="mt-6" />
    </Section>
  );
}
