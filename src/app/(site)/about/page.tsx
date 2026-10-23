import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { AboutSections } from '@/components/about/AboutSections';
import type { BreadcrumbItem } from '@/lib/schema';
import { breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';
import { getContent } from '@/lib/server/content';

export const metadata = buildMetadata({
  title: 'About Kelly & Our Story',
  description:
    'Meet Kelly and the passed-down family bannock recipe behind Native WILDFlour, a small independent cafe and coffee stop in Skagway, Alaska.',
  path: '/about/',
});

/** The same array feeds the visible trail and the JSON-LD, so they can never disagree. */
const BREADCRUMBS: readonly BreadcrumbItem[] = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about/' },
];

/** See the home page: on-demand revalidation is the fast path, this is the safety net. */
export const revalidate = 60;

export default async function AboutPage() {
  // The topping chips belong to the menu document, so this page loads both.
  const [{ document: about }, { document: menu }] = await Promise.all([
    getContent('about'),
    getContent('menu'),
  ]);

  return (
    <>
      <AboutSections
        about={about}
        menu={menu}
        breadcrumbs={<Breadcrumbs items={BREADCRUMBS} />}
      />

      <JsonLd id="schema-breadcrumb-about" data={breadcrumbSchema(BREADCRUMBS)} />
    </>
  );
}
