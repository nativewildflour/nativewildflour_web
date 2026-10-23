'use client';

/**
 * The home page, drawn from the draft with the very components the published page uses.
 *
 * The highlight cards and their topping chips come from the menu document, which is edited on
 * its own screen: the preview shows the published menu (the built-in one until a menu has been
 * published, or when it can't be loaded). Everything the home page document owns is live as it
 * is typed.
 */

import { PREVIEW_IMAGE_BASE } from '@/components/admin/previews/PreviewFrame';
import { BannockIntro } from '@/components/home/BannockIntro';
import { FacebookCta } from '@/components/home/FacebookCta';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTestimonial } from '@/components/home/HomeTestimonial';
import { MeetKelly } from '@/components/home/MeetKelly';
import { MenuHighlights } from '@/components/home/MenuHighlights';
import { VisitUs } from '@/components/home/VisitUs';
import type { HomeContent } from '@/lib/content/home';
import type { MenuContent } from '@/lib/menu-content';

export interface HomePreviewProps {
  readonly content: HomeContent;
  /** The menu the highlights are drawn from. */
  readonly menu: MenuContent;
}

export function HomePreview({ content, menu }: HomePreviewProps) {
  return (
    <>
      <HomeHero hero={content.hero} />
      <BannockIntro content={content.bannock} imageBase={PREVIEW_IMAGE_BASE} />
      <MenuHighlights content={content.highlights} sections={menu.sections} />
      <VisitUs content={content.visit} />
      <HomeTestimonial content={content.testimonial} />
      <MeetKelly content={content.meetKelly} />
      <FacebookCta content={content.facebook} />
    </>
  );
}
