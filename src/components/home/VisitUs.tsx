import { ButtonLink } from '@/components/ButtonLink';
import { Section } from '@/components/Section';
import { ClockIcon, MapPinIcon, PhoneIcon, ShipIcon } from '@/components/home/HomeIcons';
import { ADDRESS, HOURS_SUMMARY, PHONE, SEASON_NOTE } from '@/data/business';
import { MAP_LINKS } from '@/data/map';
import type { HomeContent } from '@/lib/content/home';

const CARD = 'rounded-3xl bg-cream p-6 shadow-card ring-1 ring-bark/10 sm:p-8';

export interface VisitUsProps {
  readonly content: HomeContent['visit'];
}

/** "Visit us" — address, hours, phone, map links and the cruise-passenger teaser. */
export function VisitUs({ content }: VisitUsProps) {
  return (
    <Section id="visit" tone="snow" eyebrow={content.eyebrow} title={content.title} width="6xl">
      {/* items-start: each card hugs its content instead of stretching to the taller one. */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className={CARD}>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-fireweed/10 text-fireweed">
            <MapPinIcon className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-xl font-black text-bark">Where to find us</h3>

          <address className="mt-3 text-lg not-italic text-bark/85">
            {ADDRESS.street}
            <br />
            {ADDRESS.locality}, {ADDRESS.region} {ADDRESS.postalCode}
          </address>

          <p className="mt-2 text-bark/75">{content.locationNote}</p>

          <p className="mt-4">
            <a
              href={PHONE.href}
              className="inline-flex min-h-11 items-center gap-2 font-bold text-blueberry underline decoration-blueberry/40 underline-offset-4 transition-colors duration-200 hover:decoration-blueberry"
            >
              <PhoneIcon className="h-5 w-5 shrink-0" />
              {PHONE.display}
            </a>
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href={MAP_LINKS.googleDirections} variant="secondary">
              Open in Google Maps
            </ButtonLink>
            <ButtonLink href={MAP_LINKS.appleDirections} variant="secondary">
              Open in Apple Maps
            </ButtonLink>
          </div>
        </div>

        <div className={CARD}>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-spruce/10 text-spruce">
            <ClockIcon className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-xl font-black text-bark">Hours</h3>
          {/* One line here; the full day-by-day table lives in the footer on every page. */}
          <p className="mt-3 text-lg text-bark/85">{HOURS_SUMMARY}</p>
          <p className="mt-4 text-bark/75">{SEASON_NOTE}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5 rounded-3xl bg-sky/40 p-6 shadow-card ring-1 ring-blueberry/15 sm:flex-row sm:items-center sm:p-8">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-snow text-blueberry shadow-press">
          <ShipIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 break-words">
          <h3 className="text-xl font-black text-bark">{content.cruiseTitle}</h3>
          <p className="mt-2 text-bark/85">{content.cruiseBody}</p>
          <div className="mt-4">
            <ButtonLink href="/directions/" variant="secondary">
              See directions from every dock
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}
