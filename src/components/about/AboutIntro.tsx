import type { ReactNode } from 'react';

import { BrandText } from '@/components/BrandText';
import { TitleStroke } from '@/components/Decor';
import { Section } from '@/components/Section';
import type { AboutContent } from '@/lib/content/about';

export interface AboutIntroProps {
  readonly content: AboutContent['intro'];
  /** Rendered above the kicker — the page puts its breadcrumb trail here. */
  readonly children?: ReactNode;
}

/** The top of `/about/`: kicker, the page `<h1>`, and the opening paragraph. */
export function AboutIntro({ content, children }: AboutIntroProps) {
  return (
    <Section tone="parchment">
      {children}
      <p className="mt-6 text-sm font-bold tracking-[0.18em] text-wood uppercase">
        <BrandText text={content.eyebrow} />
      </p>
      <h1 className="mt-2 text-4xl font-black text-bark sm:text-6xl">{content.title}</h1>
      <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
      <p className="mt-5 max-w-2xl text-lg text-bark/80">{content.lede}</p>
    </Section>
  );
}
