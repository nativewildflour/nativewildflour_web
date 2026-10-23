import { BrandText } from '@/components/BrandText';
import { ButtonLink } from '@/components/ButtonLink';
import { ChipList } from '@/components/ChipList';
import { Section } from '@/components/Section';
import type { AboutContent } from '@/lib/content/about';

export interface AboutRecipeProps {
  readonly content: AboutContent['recipe'];
  /** The topping chips, which live in the menu document rather than this page's copy. */
  readonly toppings: readonly string[];
}

/** The recipe section, wrapped around the topping chips the menu supplies. */
export function AboutRecipe({ content, toppings }: AboutRecipeProps) {
  return (
    <Section tone="snow" title={content.title} lead={content.lead}>
      <p className="max-w-2xl text-bark/85">{content.intro}</p>

      <h3 className="mt-8 text-sm font-bold tracking-wide text-bark/70 uppercase">
        <BrandText text={content.toppingsHeading} />
      </h3>
      <ChipList items={toppings} className="mt-3" />

      <p className="mt-8 max-w-2xl text-bark/85">{content.outro}</p>

      <div className="mt-8">
        <ButtonLink href="/menu/">See the full menu</ButtonLink>
      </div>
    </Section>
  );
}
