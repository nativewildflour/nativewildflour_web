import { Section } from '@/components/Section';
import type { AboutContent } from '@/lib/content/about';

export interface AboutWhatIsBannockProps {
  readonly content: AboutContent['whatIsBannock'];
}

/** The respectful, general explainer — described in general terms, with no historical claim. */
export function AboutWhatIsBannock({ content }: AboutWhatIsBannockProps) {
  return (
    <Section tone="sky" title={content.title} width="3xl">
      <div className="space-y-4 text-lg text-bark/85">
        {content.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}
