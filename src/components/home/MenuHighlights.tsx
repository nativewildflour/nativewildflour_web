import { ButtonLink } from '@/components/ButtonLink';
import { ChipList } from '@/components/ChipList';
import { TitleStroke } from '@/components/Decor';
import { Section } from '@/components/Section';
import { menuAccent } from '@/components/menu/accents';
import type { HomeContent } from '@/lib/content/home';
import type { MenuSectionContent } from '@/lib/menu-content';
import { MENU_PRICE_NOTE } from '@/lib/menu-content';

export interface MenuHighlightsProps {
  readonly content: HomeContent['highlights'];
  /** Every menu section; the ones marked `highlight: false` are left out here. */
  readonly sections: readonly MenuSectionContent[];
}

/**
 * The span the last plain card of a run gets, by the run's length: on two columns an odd run
 * leaves one card alone in its row, on three a run leaves one or two. Written out in full —
 * Tailwind only generates classes it finds spelled out in the source.
 */
function closingSpan(run: number): string {
  const spans: string[] = [];
  if (run % 2 === 1) spans.push('sm:col-span-2');
  if (run % 3 === 1) spans.push('lg:col-span-3');
  else if (run % 3 === 2) spans.push('lg:col-span-2');
  // The run fills its last row on three columns: undo the two-column span, which carries over.
  else if (run % 2 === 1) spans.push('lg:col-span-1');
  return spans.join(' ');
}

/**
 * Per-card span classes, in the owner's order. A featured card takes the full row, so each run
 * of plain cards before one (and the run after the last) has its final card widened to fill
 * the row it ends: a featured card always starts a row, and no card is moved to plug a hole.
 */
function highlightSpans(featured: readonly boolean[]): string[] {
  const spans = featured.map(() => '');
  let run = 0;
  featured.forEach((full, index) => {
    if (!full) {
      run += 1;
      return;
    }
    if (run > 0) spans[index - 1] = closingSpan(run);
    run = 0;
  });
  if (run > 0) spans[featured.length - 1] = closingSpan(run);
  return spans;
}

/** "Menu highlights" — a short preview of the menu with a link to the full page. */
export function MenuHighlights({ content, sections }: MenuHighlightsProps) {
  const highlights = sections.filter((section) => section.highlight !== false);
  const spans = highlightSpans(highlights.map((section) => (section.toppings ?? []).length > 0));

  return (
    <Section
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
      width="6xl"
    >
      {/* Cards keep the owner's order; `highlightSpans` closes the gaps a full-row featured
          card would leave, without moving any card out of place. */}
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((section, index) => {
          const toppings = section.toppings ?? [];
          const featured = toppings.length > 0;

          return (
            <li
              key={`${index}-${section.id}`}
              className={`relative rounded-3xl p-6 shadow-card transition duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lift ${
                featured
                  ? 'bg-gradient-to-br from-snow to-wheat/20 ring-2 ring-wheat sm:col-span-2 lg:col-span-3 sm:p-8'
                  : `bg-snow ring-1 ring-bark/10 ${spans[index] ?? ''}`.trim()
              }`}
            >
              {featured ? (
                <p className="absolute -top-3 left-6 rounded-full bg-wheat px-3 py-1 text-xs font-black tracking-[0.14em] text-bark uppercase shadow-press">
                  House specialty
                </p>
              ) : null}

              <h3 className={`font-black text-bark ${featured ? 'text-2xl' : 'text-xl'}`}>
                {section.name}
              </h3>
              {/* The same accent this section answers with on the menu page. */}
              <TitleStroke className={`mt-1.5 h-1.5 w-12 ${menuAccent(section.id).stroke}`} />

              {section.description ? (
                <p className="mt-2 text-bark/85">{section.description}</p>
              ) : null}

              {featured ? (
                <>
                  <p className="mt-5 text-sm font-bold tracking-wide text-bark/70 uppercase">
                    Toppings
                  </p>
                  <ChipList items={toppings} className="mt-2" />
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-bark/70">
                  {section.items.map((item) => item.name).join(' · ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <ButtonLink href="/menu/">See the full menu</ButtonLink>
        <p className="text-bark/75">{MENU_PRICE_NOTE}</p>
      </div>
    </Section>
  );
}
