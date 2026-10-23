import { PhotoSlot } from '@/components/PhotoSlot';
import { Section } from '@/components/Section';
import { NoteList } from '@/components/directions/NoteList';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsOrientationProps {
  readonly content: DirectionsContent['orientation'];
  /** Where an uploaded photo is served from. The admin preview overrides it. */
  readonly imageBase?: string;
}

/**
 * "Where we are in town" — the landmarks to steer by, with room for a picture of the corner
 * beside them. The notes stack in one column so the photo can sit alongside at `md` and up.
 */
export function DirectionsOrientation({ content, imageBase }: DirectionsOrientationProps) {
  return (
    <Section tone="snow" eyebrow={content.eyebrow} title={content.title} lead={content.lead}>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-5 md:items-start">
        <div className="md:col-span-3">
          <NoteList items={content.notes} icon="signpost" surface="cream" columns={1} />
        </div>
        <PhotoSlot photo={content.photo} imageBase={imageBase} className="md:col-span-2" />
      </div>
    </Section>
  );
}
