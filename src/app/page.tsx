import { BannockIntro } from '@/components/home/BannockIntro';
import { FacebookCta } from '@/components/home/FacebookCta';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTestimonial } from '@/components/home/HomeTestimonial';
import { MeetKelly } from '@/components/home/MeetKelly';
import { MenuHighlights } from '@/components/home/MenuHighlights';
import { VisitUs } from '@/components/home/VisitUs';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, buildMetadata } from '@/lib/seo';

/**
 * The home title already ends with the business name, so it bypasses the `%s | …` template.
 * `restaurantSchema()` and `webSiteSchema()` are emitted once by the root layout; the home page
 * is not a subpage, so it adds no breadcrumb schema.
 */
export const metadata = buildMetadata({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: '/',
  absoluteTitle: true,
});

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <BannockIntro />
      <MenuHighlights />
      <VisitUs />
      <HomeTestimonial />
      <MeetKelly />
      <FacebookCta />
    </>
  );
}
