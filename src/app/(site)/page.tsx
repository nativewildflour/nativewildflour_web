import { BannockIntro } from '@/components/home/BannockIntro';
import { FacebookCta } from '@/components/home/FacebookCta';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTestimonial } from '@/components/home/HomeTestimonial';
import { MeetKelly } from '@/components/home/MeetKelly';
import { MenuHighlights } from '@/components/home/MenuHighlights';
import { VisitUs } from '@/components/home/VisitUs';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, buildMetadata } from '@/lib/seo';
import { getContent } from '@/lib/server/content';

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

/**
 * The safety net under on-demand revalidation: a publish refreshes this page within seconds,
 * and if that call never lands the next visitor after a minute picks the change up anyway.
 */
export const revalidate = 60;

export default async function HomePage() {
  const [{ document: home }, { document: menu }] = await Promise.all([
    getContent('home'),
    getContent('menu'),
  ]);

  return (
    <>
      <HomeHero hero={home.hero} />
      <BannockIntro content={home.bannock} />
      <MenuHighlights content={home.highlights} sections={menu.sections} />
      <VisitUs content={home.visit} />
      <HomeTestimonial content={home.testimonial} />
      <MeetKelly content={home.meetKelly} />
      <FacebookCta content={home.facebook} />
    </>
  );
}
