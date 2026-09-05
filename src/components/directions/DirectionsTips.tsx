import { ButtonLink } from '@/components/ButtonLink';
import { Section } from '@/components/Section';
import { NoteList } from '@/components/directions/NoteList';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsTipsProps {
  readonly content: DirectionsContent['tips'];
}

/** A few practical notes, then the two onward links. */
export function DirectionsTips({ content }: DirectionsTipsProps) {
  return (
    <Section tone="sky" title={content.title} lead={content.lead}>
      <NoteList items={content.items} icon="check" columns={2} />

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/menu/">See the full menu</ButtonLink>
        <ButtonLink href="/about/" variant="secondary">
          Meet Kelly and our story
        </ButtonLink>
      </div>
    </Section>
  );
}
