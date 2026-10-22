import { Faq } from '@/components/Faq';
import { Section } from '@/components/Section';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsFaqProps {
  readonly content: DirectionsContent['faq'];
}

/** The question list. The page also emits these as FAQPage structured data. */
export function DirectionsFaq({ content }: DirectionsFaqProps) {
  return (
    <Section title={content.title}>
      <Faq items={content.items} />
    </Section>
  );
}
