import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ButtonLink } from '@/components/ButtonLink';
import { TitleStroke } from '@/components/Decor';
import { JsonLd } from '@/components/JsonLd';
import { MenuSection } from '@/components/MenuSection';
import { Section } from '@/components/Section';
import { GoodToKnow } from '@/components/menu/GoodToKnow';
import { MenuJumpLinks } from '@/components/menu/MenuJumpLinks';
import { SpecialsCallout } from '@/components/menu/SpecialsCallout';
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
  description:
    'Alaskan bannock with toppings from butter to homemade rhubarb jam, savory lunch specials, house-baked goods and Kaladi Brothers coffee in Skagway, Alaska.',
  path: '/menu/',
});

/** See the home page: on-demand revalidation is the fast path, this is the safety net. */
export const revalidate = 60;

export default async function MenuPage() {
  const { document: menu } = await getContent('menu');
  const page = menuPageCopy(menu);

  return (
    <>
      <JsonLd
        id="menu-jsonld"
        data={[menuSchema(menu.sections), breadcrumbSchema(BREADCRUMBS)]}
      />

      <Section tone="parchment" flourish={false}>
        <Breadcrumbs items={BREADCRUMBS} />
        <p className="mt-6 text-sm font-bold tracking-[0.18em] text-wood uppercase">
          {page.eyebrow}
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
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {menu.sections.map((section) => {
            const featured = Boolean(section.toppings?.length);
            return (
              <MenuSection
                key={section.id}
                section={section}
                className={featured ? 'sm:col-span-2' : ''}
                {...(section.toppings?.length
                  ? { chips: section.toppings, chipsLabel: 'Choose a topping' }
                  : {})}
              />
            );
          })}
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
