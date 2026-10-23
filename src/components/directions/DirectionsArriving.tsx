import { Section } from '@/components/Section';
import { NoteList } from '@/components/directions/NoteList';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsArrivingProps {
  readonly content: DirectionsContent['arriving'];
}

/** Getting here without a cruise ship: by road, by ferry, by train. */
export function DirectionsArriving({ content }: DirectionsArrivingProps) {
  return (
    <Section tone="snow" title={content.title}>
      <NoteList items={content.notes} icon="compass" surface="cream" />
    </Section>
  );
}
