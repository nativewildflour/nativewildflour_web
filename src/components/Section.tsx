import type { ReactNode } from 'react';

import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export type SectionTone = 'cream' | 'snow' | 'sky' | 'parchment';

export interface SectionProps {
  readonly children: ReactNode;
  /** Anchor id on the `<section>`. */
  readonly id?: string;
  /** Rendered as the section heading. Omit to supply your own heading in `children`. */
  readonly title?: string;
  /** Heading level for `title`. Defaults to `h2`. */
  readonly headingLevel?: 'h1' | 'h2' | 'h3';
  /** Small-caps kicker line above the heading. */
  readonly eyebrow?: string;
  /** Optional short paragraph under the heading. */
  readonly lead?: string;
  /** The hand-drawn stroke under the title. On by default whenever there is a title. */
  readonly flourish?: boolean;
  /** Background surface. Defaults to `cream` (the page background). */
  readonly tone?: SectionTone;
  readonly width?: '3xl' | '5xl' | '6xl';
  readonly className?: string;
}

const TONES: Record<SectionTone, string> = {
  cream: 'bg-cream',
  snow: 'bg-snow',
  sky: 'bg-sky/40',
  parchment: 'bg-parchment',
};

/** A full-width band with a centered container, an optional heading and lead. */
export function Section({
  children,
  id,
  title,
  headingLevel: Heading = 'h2',
  eyebrow,
  lead,
  flourish = true,
  tone = 'cream',
  width = '5xl',
  className = '',
}: SectionProps) {
  return (
    <section id={id} className={`py-14 sm:py-20 ${TONES[tone]} ${className}`.trim()}>
      <Container width={width}>
        {eyebrow ? (
          <p className="mb-3 text-sm font-bold tracking-[0.18em] text-wood uppercase">
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <Heading className="text-3xl font-black text-bark sm:text-4xl">{title}</Heading>
        ) : null}
        {title && flourish ? <TitleStroke /> : null}
        {lead ? <p className="mt-4 max-w-2xl text-lg text-bark/80">{lead}</p> : null}
        <div className={title || lead ? 'mt-8' : ''}>{children}</div>
      </Container>
    </section>
  );
}
