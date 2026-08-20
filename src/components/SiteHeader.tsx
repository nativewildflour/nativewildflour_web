import Image from 'next/image';
import Link from 'next/link';

import { Container } from '@/components/Container';
import { MobileNav } from '@/components/MobileNav';
import { NavLinks } from '@/components/NavLinks';
import { BUSINESS_NAME } from '@/data/business';
import { NAV_LINKS } from '@/data/nav';

/** Site header: brand ribbon, logo badge, wordmark and the primary navigation. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-bark/10 bg-cream/90 backdrop-blur-md">
      {/* The awning ribbon: one stripe per brand color, repeating. */}
      <div
        aria-hidden="true"
        className="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-spruce)_0_72px,var(--color-honey)_72px_144px,var(--color-fireweed)_144px_216px,var(--color-blueberry)_216px_288px)]"
      />
      <Container>
        {/* The sticky header itself is the positioned ancestor for the disclosure panel. */}
        <div className="flex min-h-20 items-center justify-between gap-4 py-3">
          <Link
            href="/"
            className="group flex items-center gap-3 no-underline"
            aria-label={`${BUSINESS_NAME} — home`}
          >
            <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-snow p-1 shadow-card ring-1 ring-bark/10 transition-transform duration-200 ease-out motion-safe:group-hover:-rotate-3">
              {/* Decorative here: the wrapping link already carries the accessible name,
                  and the hero logo keeps the one named logo image on the page. */}
              <Image
                src="/images/logo-256.webp"
                alt=""
                width={256}
                height={256}
                loading="eager"
                sizes="56px"
                className="h-12 w-12 rounded-lg sm:h-14 sm:w-14"
              />
            </span>
            <span
              translate="no"
              className="font-display text-xl leading-tight font-black text-bark sm:text-2xl"
            >
              Native <span className="text-wood">WILDFlour</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <NavLinks links={NAV_LINKS} />
          </nav>

          <MobileNav links={NAV_LINKS} />
        </div>
      </Container>
    </header>
  );
}
