'use client';

/**
 * The about page, drawn from the draft with the published page's own components. The
 * breadcrumb trail and the structured data are left out — neither is editable, and neither
 * tells the owner anything about the words she is writing.
 *
 * The topping chips in the recipe section come from the published menu (the built-in one until
 * a menu has been published, or when it can't be loaded): they belong to the menu document and
 * are edited there.
 */

import { PREVIEW_IMAGE_BASE } from '@/components/admin/previews/PreviewFrame';
import { AboutGrammy } from '@/components/about/AboutGrammy';
import { AboutIntro } from '@/components/about/AboutIntro';
import { AboutMadeInSkagway } from '@/components/about/AboutMadeInSkagway';
import { AboutMeetKelly } from '@/components/about/AboutMeetKelly';
import { AboutRecipe } from '@/components/about/AboutRecipe';
import { AboutSayHello } from '@/components/about/AboutSayHello';
import { AboutWhatIsBannock } from '@/components/about/AboutWhatIsBannock';
import type { AboutContent } from '@/lib/content/about';
import type { MenuContent } from '@/lib/menu-content';
import { bannockToppings } from '@/lib/menu-content';

export interface AboutPreviewProps {
  readonly content: AboutContent;
  /** The menu the topping chips are drawn from. */
  readonly menu: MenuContent;
}

export function AboutPreview({ content, menu }: AboutPreviewProps) {
  return (
    <>
      <AboutIntro content={content.intro} />
      <AboutMeetKelly content={content.meetKelly} imageBase={PREVIEW_IMAGE_BASE} />
      <AboutGrammy content={content.grammy} />
      <AboutRecipe content={content.recipe} toppings={bannockToppings(menu)} />
      <AboutWhatIsBannock content={content.whatIsBannock} />
      <AboutMadeInSkagway content={content.madeInSkagway} />
      <AboutSayHello content={content.sayHello} />
    </>
  );
}
