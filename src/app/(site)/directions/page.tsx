import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { DirectionsArriving } from '@/components/directions/DirectionsArriving';
import { DirectionsDocks } from '@/components/directions/DirectionsDocks';
import { DirectionsFaq } from '@/components/directions/DirectionsFaq';
import { DirectionsIntro } from '@/components/directions/DirectionsIntro';
import { DirectionsOrientation } from '@/components/directions/DirectionsOrientation';
import { DirectionsTips } from '@/components/directions/DirectionsTips';
import type { BreadcrumbItem } from '@/lib/schema';
import { breadcrumbSchema, faqSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';
import { getContent } from '@/lib/server/content';

export const metadata = buildMetadata({
  title: 'Directions & Cruise Ship Passenger Guide',
  description:
    'Walking directions to Native WILDFlour at First Avenue & State Street in Skagway, Alaska from the Broadway, Ore and Railroad cruise ship docks.',
  path: '/directions/',
});

/** Rendered as the visible trail and as the BreadcrumbList JSON-LD. */
const BREADCRUMBS: readonly BreadcrumbItem[] = [
  { name: 'Home', path: '/' },
  { name: 'Directions', path: '/directions/' },
];

/** See the home page: on-demand revalidation is the fast path, this is the safety net. */
export const revalidate = 60;

export default async function DirectionsPage() {
  const { document: directions } = await getContent('directions');

  return (
    <>
      <JsonLd
        id="schema-directions"
        data={[breadcrumbSchema(BREADCRUMBS), faqSchema(directions.faq.items)]}
      />

      <DirectionsIntro content={directions.intro}>
        <Breadcrumbs items={BREADCRUMBS} />
      </DirectionsIntro>

      <DirectionsOrientation content={directions.orientation} />
      <DirectionsDocks content={directions.docks} shuttle={directions.shuttle} />
      <DirectionsArriving content={directions.arriving} />
      <DirectionsTips content={directions.tips} />
      <DirectionsFaq content={directions.faq} />
    </>
  );
}
