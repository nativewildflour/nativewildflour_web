import { Faq } from '@/components/Faq';
import { Section } from '@/components/Section';
import { HOURS_SUMMARY, SEASON_NOTE } from '@/data/business';
import type { DirectionsContent } from '@/lib/content/directions';
import { expandHoursToken, expandSeasonToken } from '@/lib/copy-rules';

export interface DirectionsFaqProps {
  readonly content: DirectionsContent['faq'];
}

/**
 * The question list. The page also emits these as FAQPage structured data (`faqSchema`). Both
 * fill in `{hours}` from `HOURS_SUMMARY` and `{season}` from `SEASON_NOTE`, so an answer written
 * with the tokens always shows the wording in `src/data/business.ts` — on the page, in the
 * structured data and in the preview.
 */
export function DirectionsFaq({ content }: DirectionsFaqProps) {
  const items = content.items.map((item) => ({
    question: item.question,
    answer: expandSeasonToken(expandHoursToken(item.answer, HOURS_SUMMARY), SEASON_NOTE),
  }));
  return (
    <Section title={content.title}>
      <Faq items={items} />
    </Section>
  );
}
