import { BrandText } from '@/components/BrandText';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ButtonLink } from '@/components/ButtonLink';
import { TitleStroke } from '@/components/Decor';
import { JsonLd } from '@/components/JsonLd';
import { MenuSection } from '@/components/MenuSection';
import { Section } from '@/components/Section';
import { GoodToKnow } from '@/components/menu/GoodToKnow';
import { MenuJumpLinks } from '@/components/menu/MenuJumpLinks';
import { SpecialsCallout } from '@/components/menu/SpecialsCallout';
import { COFFEE_ROASTER } from '@/data/business';
import { menuPageCopy } from '@/lib/default-menu';
import type { BreadcrumbItem } from '@/lib/schema';
import { breadcrumbSchema, menuSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';
import { getContent } from '@/lib/server/content';

const BREADCRUMBS: readonly BreadcrumbItem[] = [
  { name: 'Home', path: '/' },
  { name: 'Menu', path: '/menu/' },
];

export const metadata = buildMetadata({
  title: 'Menu',
  // Names only what the code pins down (bannock, the roaster, the town): every menu item is the
  // owner's to rename or remove, and this description is not regenerated when she does.
  description: `Our menu: fresh-fried Alaskan bannock with your pick of toppings, house-baked treats and ${COFFEE_ROASTER}, made fresh daily in Skagway, Alaska.`,
  path: '/menu/',
});

/** See the home page: on-demand revalidation is the fast path, this is the safety net. */
export const revalidate = 60;

/**
 * The column span of each section card on the two-column grid, in the owner's order. A
 * featured card takes the full row. A run of half-width cards (the ones between two featured
 * cards, or after the last) fills whole rows when its length is even; when it is odd, its last
 * card takes the full row too — so a featured card always starts a row, no hole is left beside
 * the card before it, and nothing is reordered to plug one.
 */
function sectionSpans(featured: readonly boolean[]): string[] {
  const spans = featured.map((full) => (full ? 'sm:col-span-2' : ''));
  let run = 0;
  featured.forEach((full, index) => {
    if (!full) {
      run += 1;
      return;
    }
    if (run % 2 === 1) spans[index - 1] = 'sm:col-span-2';
    run = 0;
  });
  if (run % 2 === 1) spans[featured.length - 1] = 'sm:col-span-2';
  return spans;
}

export default async function MenuPage() {
  const { document: menu } = await getContent('menu');
  const page = menuPageCopy(menu);
  const spans = sectionSpans(menu.sections.map((section) => Boolean(section.toppings?.length)));

  return (
    <>
      <JsonLd
        id="menu-jsonld"
        data={[menuSchema(menu.sections), breadcrumbSchema(BREADCRUMBS)]}
      />

      <Section tone="parchment" flourish={false}>
        <Breadcrumbs items={BREADCRUMBS} />
        <p className="mt-6 text-sm font-bold tracking-[0.18em] text-wood uppercase">
          <BrandText text={page.eyebrow} />
        </p>
        <h1 className="mt-2 text-4xl font-black text-bark sm:text-6xl">Menu</h1>
        <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
        <p className="mt-5 max-w-2xl text-lg text-bark/80">{menu.intro}</p>
        <MenuJumpLinks sections={menu.sections} className="mt-8" />
      </Section>

      <Section>
        <SpecialsCallout
          title={page.specialsTitle}
          lead={page.specialsLead}
          note={menu.specialsNote}
        />

        <h2 className="mt-14 text-3xl font-black text-bark sm:text-4xl">{page.sectionsTitle}</h2>
        <TitleStroke />
        {/* Cards keep the owner's order; `sectionSpans` closes the gaps a full-row featured
            card would leave, without moving any card out of place. */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {menu.sections.map((section, index) => (
            <MenuSection
              key={`${index}-${section.id}`}
              section={section}
              className={spans[index] ?? ''}
              {...(section.toppings?.length
                ? { chips: section.toppings, chipsLabel: 'Choose a topping' }
                : {})}
            />
          ))}
        </div>
      </Section>

      <Section tone="sky" eyebrow={page.goodToKnow.eyebrow} title={page.goodToKnow.title}>
        <GoodToKnow notes={page.goodToKnow.notes} />
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/directions/">Directions from the docks</ButtonLink>
          <ButtonLink href="/about/" variant="secondary">
            Meet Kelly and our story
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
