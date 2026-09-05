'use client';

/**
 * The home page, drawn from the draft with the very components the published page uses.
 *
 * Two things come from elsewhere and so show the built-in menu rather than the live one: the
 * highlight cards and their topping chips are drawn from the committed default menu, since the
 * menu document is edited on its own screen. Everything the home page document owns is live as
 * it is typed.
 */

import { DEFAULT_MENU } from '@/components/admin/default-menu';
import { PREVIEW_IMAGE_BASE } from '@/components/admin/previews/PreviewFrame';
import { BannockIntro } from '@/components/home/BannockIntro';
import { FacebookCta } from '@/components/home/FacebookCta';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTestimonial } from '@/components/home/HomeTestimonial';
import { MeetKelly } from '@/components/home/MeetKelly';
import { MenuHighlights } from '@/components/home/MenuHighlights';
import { VisitUs } from '@/components/home/VisitUs';
import type { HomeContent } from '@/lib/content/home';

export interface HomePreviewProps {
  readonly content: HomeContent;
}

export function HomePreview({ content }: HomePreviewProps) {
  return (
    <>
      <HomeHero hero={content.hero} />
      <BannockIntro content={content.bannock} imageBase={PREVIEW_IMAGE_BASE} />
      <MenuHighlights content={content.highlights} sections={DEFAULT_MENU.sections} />
      <VisitUs content={content.visit} />
      <HomeTestimonial content={content.testimonial} />
      <MeetKelly content={content.meetKelly} />
      <FacebookCta content={content.facebook} />
    </>
  );
}
