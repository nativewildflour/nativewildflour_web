import { PhotoSlot } from '@/components/PhotoSlot';
import { Section } from '@/components/Section';
import type { AboutContent } from '@/lib/content/about';

export interface AboutMeetKellyProps {
  readonly content: AboutContent['meetKelly'];
  /** Where an uploaded photo is served from. The admin preview overrides it. */
  readonly imageBase?: string;
}

/** "Meet Kelly" — the story in three short paragraphs, with room for a photo beside it. */
export function AboutMeetKelly({ content, imageBase }: AboutMeetKellyProps) {
  return (
    <Section tone="snow" title={content.title}>
      <div className="grid gap-10 md:grid-cols-5 md:items-start">
        <div className="space-y-4 text-bark/85 md:col-span-3">
          {content.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <PhotoSlot photo={content.photo} imageBase={imageBase} className="md:col-span-2" />
      </div>
    </Section>
  );
}
