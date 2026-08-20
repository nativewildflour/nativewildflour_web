import Image from 'next/image';

import { ButtonLink } from '@/components/ButtonLink';
import { Container } from '@/components/Container';
import { FireweedSprig, RidgeDivider } from '@/components/Decor';
import { ClockIcon } from '@/components/home/HomeIcons';
import { ADDRESS, BUSINESS_NAME, COFFEE_ROASTER, HOURS_SHORT, MOTTO } from '@/data/business';
import { CLOSEST_DOCK, CLOSEST_DOCK_WALK } from '@/data/directions';

/**
 * Home hero: a Skagway scene — sky wash, a low sun, mountain ridges along the
 * bottom — with the logo badge, the page `<h1>`, lede, calls to action and the
 * hours tag. Every moving part is CSS; the entrance collapses under
 * `prefers-reduced-motion`.
 */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden border-b border-bark/10">
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
      {/* The ridge line the town sits under. */}
      <RidgeDivider className="absolute bottom-0 left-0 h-14 text-spruce/20 sm:h-20" />

      <Container width="6xl" className="relative">
        {/* Text is DOM-first so the h1 leads for screen readers and on small screens,
            where the message must own the first viewport; md+ places the logo badge
            back into the left column via explicit grid placement. */}
        <div className="grid items-center gap-10 py-16 sm:py-24 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14">
          <div className="md:col-start-2 md:row-start-1">
            <p className="rise flex items-center gap-2 font-display text-base font-bold tracking-wide text-wood">
              <FireweedSprig bloom className="h-7 w-5 shrink-0" />
              {MOTTO}
            </p>

            <h1 className="rise rise-2 mt-4 text-4xl font-black text-bark sm:text-6xl lg:text-[4.25rem] lg:leading-[1.05]">
              Authentic Alaskan <span className="text-fireweed">Bannock</span> in Skagway, Alaska
            </h1>

            <p className="rise rise-3 mt-6 max-w-2xl text-lg text-bark/85 sm:text-xl">
              Fresh-fried bannock from a passed-down family recipe, house-baked cookies and muffins,
              and Alaska-roasted {COFFEE_ROASTER}. Find our little cafe at {ADDRESS.street} in
              downtown Skagway — about {CLOSEST_DOCK_WALK} on foot from the {CLOSEST_DOCK.name}.
            </p>

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

          {/* On phones the badge closes the scene, centered above the ridge. */}
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
