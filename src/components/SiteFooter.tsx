import Link from 'next/link';

import { Container } from '@/components/Container';
import { FireweedSprig, RidgeDivider } from '@/components/Decor';
import { HoursTable } from '@/components/HoursTable';
import {
  ADDRESS,
  ADDRESS_ONE_LINE,
  BUSINESS_NAME,
  FACEBOOK_URL,
  MOTTO,
  PHONE,
} from '@/data/business';
import { NAV_LINKS } from '@/data/nav';

const FOOTER_LINK =
  'inline-flex min-h-11 items-center font-bold text-snow underline decoration-wheat/60 ' +
  'underline-offset-4 transition-colors duration-200 hover:text-cream hover:decoration-wheat';

const COLUMN_HEADING = 'text-sm font-bold tracking-[0.18em] text-sky uppercase';

/** Site footer: a spruce band under its own mountain ridge — address, phone, hours, pages. */
export function SiteFooter() {
  // Evaluated once at build time (static export): the © year refreshes with each
  // seasonal rebuild, not on Jan 1. Accepted tradeoff — no client JS beyond the nav.
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16">
      {/* The ridge is transparent above its peaks, so it rises out of whatever
          section tone the page ends with. */}
      <RidgeDivider className="-mb-px text-spruce" />

      <div className="bg-gradient-to-b from-spruce to-spruce-deep text-cream">
        <Container>
          <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              {/* "Contact" rather than "Visit us"/"Find us": both of those already head a
                  section in <main> on some page, and the footer must not duplicate them. */}
              <h2 className={COLUMN_HEADING}>Contact</h2>
              <address className="mt-4 not-italic text-cream/90">
                {ADDRESS.street}
                <br />
                {ADDRESS.locality}, {ADDRESS.region} {ADDRESS.postalCode}
              </address>
              <p className="mt-3">
                <a href={PHONE.href} className={FOOTER_LINK}>
                  {PHONE.display}
                </a>
              </p>
              <p className="mt-1">
                <a
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={FOOTER_LINK}
                >
                  Facebook
                </a>
              </p>
            </div>

            <div>
              <h2 className={COLUMN_HEADING}>Hours</h2>
              <HoursTable className="mt-4" tone="dark" />
            </div>

            <nav aria-label="Footer">
              <h2 className={COLUMN_HEADING}>Pages</h2>
              <ul className="mt-4 space-y-1">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={FOOTER_LINK}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="flex flex-col gap-3 border-t border-snow/15 py-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 font-display text-xl font-black tracking-wide text-wheat">
              <FireweedSprig className="h-7 w-5 shrink-0" />
              {/* Wrap between phrases, never inside one ("Made / to Go"). */}
              <span>
                {MOTTO.split(' • ').map((phrase, index) => (
                  <span key={phrase} className="whitespace-nowrap">
                    {index > 0 ? ' • ' : ''}
                    {phrase}
                  </span>
                ))}
              </span>
            </p>
            <p className="text-sm text-cream/75">
              © {year} <span translate="no">{BUSINESS_NAME}</span> · {ADDRESS_ONE_LINE}
            </p>
          </div>
        </Container>
      </div>
    </footer>
  );
}
