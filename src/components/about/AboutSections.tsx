import type { ReactNode } from 'react';

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

export interface AboutSectionsProps {
  readonly about: AboutContent;
  /** The menu the recipe section's topping chips are drawn from. */
  readonly menu: MenuContent;
  /** The breadcrumb trail, set inside the intro — the page passes one, the preview none. */
  readonly breadcrumbs?: ReactNode;
  /** Where photos are served from; the live uploads endpoint unless the admin preview says so. */
  readonly imageBase?: string;
}

/**
 * The about page's sections, in order. The page renders them from the published documents and
 * the admin preview from a draft, so a section added here shows up in both.
 */
export function AboutSections({ about, menu, breadcrumbs, imageBase }: AboutSectionsProps) {
  return (
    <>
      <AboutIntro content={about.intro}>{breadcrumbs}</AboutIntro>

      <AboutMeetKelly content={about.meetKelly} imageBase={imageBase} />
      <AboutGrammy content={about.grammy} />
      <AboutRecipe content={about.recipe} toppings={bannockToppings(menu)} />
      <AboutWhatIsBannock content={about.whatIsBannock} />
      <AboutMadeInSkagway content={about.madeInSkagway} />
      <AboutSayHello content={about.sayHello} />
    </>
  );
}
