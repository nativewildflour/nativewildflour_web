import { BannockIntro } from '@/components/home/BannockIntro';
import { FacebookCta } from '@/components/home/FacebookCta';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTestimonial } from '@/components/home/HomeTestimonial';
import { MeetKelly } from '@/components/home/MeetKelly';
import { MenuHighlights } from '@/components/home/MenuHighlights';
import { VisitUs } from '@/components/home/VisitUs';
import type { HomeContent } from '@/lib/content/home';
import type { MenuContent } from '@/lib/menu-content';

export interface HomeSectionsProps {
  readonly home: HomeContent;
  /** The menu the highlight cards and their topping chips are drawn from. */
  readonly menu: MenuContent;
  /** Where photos are served from; the live uploads endpoint unless the admin preview says so. */
  readonly imageBase?: string;
}

/**
 * The home page's sections, in order. The page renders them from the published documents and
 * the admin preview from a draft, so a section added here shows up in both.
 */
export function HomeSections({ home, menu, imageBase }: HomeSectionsProps) {
  return (
    <>
      <HomeHero hero={home.hero} />
      <BannockIntro content={home.bannock} imageBase={imageBase} />
      <MenuHighlights content={home.highlights} sections={menu.sections} />
      <VisitUs content={home.visit} />
      <HomeTestimonial content={home.testimonial} />
      <MeetKelly content={home.meetKelly} />
      <FacebookCta content={home.facebook} />
    </>
  );
}
