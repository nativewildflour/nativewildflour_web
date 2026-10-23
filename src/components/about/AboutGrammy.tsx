import { BrandText } from '@/components/BrandText';
import { FireweedSprig } from '@/components/Decor';
import { Section } from '@/components/Section';
import { ABOUT_CARD } from '@/components/about/card';
import type { AboutContent } from '@/lib/content/about';

export interface AboutGrammyProps {
  readonly content: AboutContent['grammy'];
}

/** Where the recipes come from, with Kelly's words about her Grammy pulled out beside it. */
export function AboutGrammy({ content }: AboutGrammyProps) {
  return (
    <Section tone="cream" title={content.title}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-5 md:items-center">
        <div className="space-y-4 text-bark/85 md:col-span-3">
          {content.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <figure className={`bg-parchment md:col-span-2 ${ABOUT_CARD}`}>
          <FireweedSprig className="h-8 w-6" />
          <blockquote className="mt-3">
            {/* Curly quotes are added here, so the stored quote stays plain text. Composed as
                one string rather than three children, which would render as three text nodes. */}
            <p className="font-display text-xl leading-snug font-bold text-bark sm:text-2xl">
              {`“${content.quote}”`}
            </p>
          </blockquote>
          <figcaption className="mt-4 text-sm font-bold tracking-wide text-bark/70 uppercase">
            <BrandText text={content.quoteAttribution} />
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
