import { ButtonLink } from '@/components/ButtonLink';
import { Section } from '@/components/Section';
import type { HomeContent } from '@/lib/content/home';

export interface MeetKellyProps {
  readonly content: HomeContent['meetKelly'];
}

/** "Meet Kelly" — the short about teaser that links to `/about/`. */
export function MeetKelly({ content }: MeetKellyProps) {
  return (
    <Section eyebrow={content.eyebrow} title={content.title} width="3xl">
      <div className="space-y-4 text-lg text-bark/85">
        {content.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-8">
        <ButtonLink href="/about/" variant="secondary">
          Read our story
        </ButtonLink>
      </div>
    </Section>
  );
}
