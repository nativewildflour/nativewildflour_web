import type { ReactNode } from 'react';

import { ButtonLink } from '@/components/ButtonLink';
import { TitleStroke } from '@/components/Decor';
import { MapEmbed } from '@/components/MapEmbed';
import { Section } from '@/components/Section';
import { ClockIcon, PhoneIcon, PinIcon, WalkIcon } from '@/components/directions/Icons';
import { ADDRESS, HOURS_SUMMARY, PHONE, SEASON_NOTE } from '@/data/business';
import { MAP_LINKS } from '@/data/map';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsIntroProps {
  readonly content: DirectionsContent['intro'];
  /** Rendered above the heading — the page puts its breadcrumb trail here. */
  readonly children?: ReactNode;
}

/**
 * The top of `/directions/`: the page `<h1>`, the walking-time badge, the address-and-hours
 * card, the map, and the three map buttons. Everything factual in the card comes from the
 * business data and the map links, so only the words around them are editable.
 */
export function DirectionsIntro({ content, children }: DirectionsIntroProps) {
  return (
    <Section tone="sky" className="pt-8 sm:pt-10">
      {children}

      <h1 className="mt-6 text-4xl font-black text-bark sm:text-5xl">{content.title}</h1>
      <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />

      <p className="mt-5 max-w-2xl text-lg text-bark/80">{content.lede}</p>

      <p className="mt-5">
        <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-snow px-4 py-2 text-sm font-bold text-bark shadow-card ring-1 ring-wheat">
          <WalkIcon className="size-4 shrink-0 text-spruce" />
          <span className="min-w-0">{content.walkBadge}</span>
        </span>
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="rounded-3xl bg-snow p-6 shadow-card ring-1 ring-bark/10 sm:p-8">
          <h2 className="text-2xl font-black text-bark">Address and hours</h2>

          <div className="mt-6 space-y-5">
            <div className="flex gap-3">
              <span className="text-blueberry">
                <PinIcon />
              </span>
              <div>
                <p className="text-sm font-bold tracking-wide text-bark/70 uppercase">Address</p>
                <div className="mt-1">
                  <address className="text-bark not-italic">
                    {ADDRESS.street}
                    <br />
                    {ADDRESS.locality}, {ADDRESS.region} {ADDRESS.postalCode}
                  </address>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="text-blueberry">
                <PhoneIcon />
              </span>
              <div>
                <p className="text-sm font-bold tracking-wide text-bark/70 uppercase">Phone</p>
                <div className="mt-1">
                  <a
                    href={PHONE.href}
                    className="inline-flex min-h-11 items-center font-bold text-blueberry underline decoration-blueberry/40 underline-offset-4 transition-colors duration-200 hover:decoration-blueberry"
                  >
                    {PHONE.display}
                  </a>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="text-blueberry">
                <ClockIcon />
              </span>
              <div>
                <p className="text-sm font-bold tracking-wide text-bark/70 uppercase">Hours</p>
                <div className="mt-1 text-bark">{HOURS_SUMMARY}</div>
              </div>
            </div>
          </div>

          <p className="mt-6 border-t border-bark/10 pt-4 text-sm text-bark/70">{SEASON_NOTE}</p>
        </div>

        <MapEmbed />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={MAP_LINKS.googleDirections}>Get directions in Google Maps</ButtonLink>
        <ButtonLink href={MAP_LINKS.appleDirections} variant="secondary">
          Walking directions in Apple Maps
        </ButtonLink>
        <ButtonLink href={MAP_LINKS.osmPage} variant="secondary">
          View the map on OpenStreetMap
        </ButtonLink>
      </div>
    </Section>
  );
}
