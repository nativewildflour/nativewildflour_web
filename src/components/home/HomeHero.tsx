import Image from 'next/image';
import type { ReactNode } from 'react';

import { ButtonLink } from '@/components/ButtonLink';
import { Container } from '@/components/Container';
import { FireweedSprig } from '@/components/Decor';
import { ClockIcon } from '@/components/home/HomeIcons';
import { TaiyaInletScene } from '@/components/home/TaiyaInletScene';
import { BUSINESS_NAME, HOURS_SHORT, MOTTO } from '@/data/business';
import type { HomeContent } from '@/lib/content/home';

export interface HomeHeroProps {
  readonly hero: HomeContent['hero'];
}

/**
 * The headline with one word picked out in fireweed pink. The word is content, not markup, so
 * the owner can move the emphasis without touching a component; a word that is not in the
 * headline simply leaves it unmarked (the editor refuses to publish that, so it never ships).
 */
function accentedHeading(heading: string, accentWord: string): ReactNode {
  const at = accentWord === '' ? -1 : heading.indexOf(accentWord);
  if (at < 0) return heading;
  return (
    <>
      {heading.slice(0, at)}
      <span className="text-fireweed">{accentWord}</span>
      {heading.slice(at + accentWord.length)}
    </>
  );
}

/**
 * Home hero: Skagway's own view — sky wash, a low sun, and Taiya Inlet under the Coast
 * Mountains along the bottom — with the logo badge, the page `<h1>`, lede, calls to action
 * and the hours tag. Every moving part is CSS; the entrance collapses under
 * `prefers-reduced-motion`.
 *
 * The scene's dark layers (water, spruce) stay inside the bottom padding, below all the copy;
 * only the pale far peaks rise behind the solid-backed buttons and hours tag, so the text never
 * sits on a mid-tone. Its white shore is the next section's snow, which is why the hero has no
 * bottom border.
 */
export function HomeHero({ hero }: HomeHeroProps) {
  return (
    <section className="relative overflow-hidden">
      {/* Sky wash. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-sky/70 via-sky/25 to-cream"
      />
      {/* Low summer sun, up and to the right. */}
      <div
        aria-hidden="true"
        className="absolute -top-28 right-[6%] size-80 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-wheat)_50%,transparent),transparent_65%)] sm:size-[26rem]"
      />
      {/* Short on phones, so the narrow crop still reaches the glacier left of the badge. */}
      <TaiyaInletScene className="absolute inset-x-0 bottom-0 h-48 w-full sm:h-72 lg:h-80" />

      <Container width="6xl" className="relative">
        {/* Text is DOM-first so the h1 leads for screen readers and on small screens,
            where the message must own the first viewport; md+ places the logo badge
            back into the left column via explicit grid placement. */}
        <div className="grid items-center gap-10 pt-16 pb-28 sm:pt-24 sm:pb-36 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14 lg:pb-44">
          <div className="md:col-start-2 md:row-start-1">
            <p className="rise flex items-center gap-2 font-display text-base font-bold tracking-wide text-wood">
              <FireweedSprig bloom className="h-7 w-5 shrink-0" />
              {MOTTO}
            </p>

            <h1 className="rise rise-2 mt-4 text-4xl font-black text-bark sm:text-6xl lg:text-[4.25rem] lg:leading-[1.05]">
              {/* Trimmed, as the validator trims it: a word typed with a stray space around it
                  would otherwise pass the "is it in the headline?" check and highlight nothing. */}
              {accentedHeading(hero.heading, hero.accentWord.trim())}
            </h1>

            <p className="rise rise-3 mt-6 max-w-2xl text-lg text-bark/85 sm:text-xl">{hero.lede}</p>

            <div className="rise rise-4 mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/menu/" size="lg">
                See the Menu
              </ButtonLink>
              <ButtonLink href="/directions/" variant="secondary" size="lg">
                Directions from the Docks
              </ButtonLink>
            </div>

            <p className="rise rise-4 mt-8 inline-flex items-center gap-2 rounded-full bg-snow px-5 py-2.5 text-sm font-bold text-bark shadow-card ring-1 ring-wheat">
              <ClockIcon className="h-4 w-4 shrink-0 text-spruce" />
              {HOURS_SHORT}
            </p>
          </div>

          {/* On phones the badge closes the scene, centered in front of the far peaks. */}
          <div className="rise justify-self-center rounded-3xl bg-snow p-4 shadow-lift ring-1 ring-bark/10 transition-transform duration-300 ease-out motion-safe:-rotate-2 motion-safe:hover:rotate-0 md:col-start-1 md:row-start-1 md:justify-self-start">
            <Image
              src="/images/logo-512.webp"
              alt={`${BUSINESS_NAME} logo`}
              width={512}
              height={512}
              preload
              className="h-36 w-36 rounded-2xl sm:h-52 sm:w-52 lg:h-60 lg:w-60"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
