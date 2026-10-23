import { FireweedSprig } from '@/components/Decor';
import { Section } from '@/components/Section';
import { QuoteMarkIcon } from '@/components/home/HomeIcons';
import type { HomeContent } from '@/lib/content/home';

export interface HomeTestimonialProps {
  readonly content: HomeContent['testimonial'];
}

/** A visitor's recommendation, quoted verbatim. */
export function HomeTestimonial({ content }: HomeTestimonialProps) {
  return (
    <Section tone="sky" width="3xl">
      {/* Visually the quote speaks for itself; the heading exists for screen-reader
          section navigation, which otherwise skips this block entirely. */}
      <h2 className="sr-only">A visitor’s recommendation</h2>
      <figure className="relative overflow-hidden rounded-[2rem] bg-snow p-8 shadow-lift ring-1 ring-bark/10 sm:p-12">
        {/* Oversized watermark quote mark behind the text. */}
        <QuoteMarkIcon className="absolute -top-4 -left-2 h-28 w-28 text-fireweed/10" />

        <QuoteMarkIcon className="relative h-9 w-9 text-fireweed/60" />
        <blockquote className="relative mt-4 font-display text-xl leading-snug font-semibold text-bark sm:text-2xl">
          <p>{content.quote}</p>
        </blockquote>
        <figcaption className="relative mt-6 flex items-center gap-2 text-sm font-bold tracking-wide text-bark/70">
          <FireweedSprig className="h-6 w-4 shrink-0" />
          <span className="min-w-0">{content.attribution}</span>
        </figcaption>
      </figure>
    </Section>
  );
}
