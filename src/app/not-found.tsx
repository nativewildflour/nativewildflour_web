import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/Container';
import { FireweedSprig } from '@/components/Decor';
import { NAV_LINKS } from '@/data/nav';
import { OG_IMAGE_ALT, SITE_NAME, formatPageTitle } from '@/lib/seo';
import { OG_IMAGE_HEIGHT, OG_IMAGE_URL, OG_IMAGE_WIDTH } from '@/lib/site';

const NOT_FOUND_TITLE = 'Page Not Found';
const NOT_FOUND_DESCRIPTION =
  'That page could not be found. Browse the menu, our story, or directions to Native WILDFlour in Skagway, Alaska.';

/**
 * Written out by hand rather than via `buildMetadata()`: this route must NOT declare a
 * canonical URL, and Next.js already emits `noindex` for it — `buildMetadata()` would add
 * a second, conflicting `robots` tag.
 */
export const metadata: Metadata = {
  title: NOT_FOUND_TITLE,
  description: NOT_FOUND_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: formatPageTitle(NOT_FOUND_TITLE),
    description: NOT_FOUND_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_URL,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: formatPageTitle(NOT_FOUND_TITLE),
    description: NOT_FOUND_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
};

export default function NotFound() {
  return (
    <Container width="3xl">
      <div className="py-20 text-center">
        <FireweedSprig bloom className="mx-auto h-10 w-8" />
        {/* Real, screen-reader-visible text, so it must clear WCAG AA for large text:
            wood at 75% over cream is 3.31:1 (wood/40 was 1.79:1). */}
        <p className="mt-4 font-display text-6xl font-black tracking-tight text-wood/75 sm:text-7xl">
          404
        </p>
        <h1 className="mt-3 text-4xl font-black text-bark sm:text-5xl">
          We couldn’t find that page
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-bark/80">
          The page you were looking for isn’t here. Here is everything on the site — the
          bannock is still fresh.
        </p>
        <ul className="mt-8 flex flex-wrap justify-center gap-3">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-full border-2 border-bark px-5 font-bold text-bark no-underline transition duration-200 ease-out hover:bg-bark hover:text-snow hover:shadow-card motion-safe:hover:-translate-y-0.5"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
