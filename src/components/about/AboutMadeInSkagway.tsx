import { Section } from '@/components/Section';
import { ABOUT_CARD } from '@/components/about/card';
import { MOTTO, SEASON_NOTE } from '@/data/business';
import type { AboutContent } from '@/lib/content/about';
import { expandSeasonToken } from '@/lib/copy-rules';

export interface AboutMadeInSkagwayProps {
  readonly content: AboutContent['madeInSkagway'];
}

/**
 * Three short cards about being small and independent, closing on the motto banner. A card's
 * text may hold `{season}`, filled in here from `SEASON_NOTE` — on the page and in the editor
 * preview alike, since both render this component.
 */
export function AboutMadeInSkagway({ content }: AboutMadeInSkagwayProps) {
  return (
    <Section tone="cream" eyebrow={content.eyebrow} title={content.title} lead={content.lead}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {content.cards.map((card, index) => (
          <div key={index} className={`bg-snow ${ABOUT_CARD}`}>
            <h3 className="text-xl font-bold text-bark">{card.title}</h3>
            <p className="mt-3 text-bark/80">{expandSeasonToken(card.body, SEASON_NOTE)}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 rounded-[2rem] bg-gradient-to-br from-spruce to-spruce-deep px-6 py-10 text-center font-display text-2xl font-black text-snow shadow-lift sm:text-3xl">
        {MOTTO}
      </p>
    </Section>
  );
}
