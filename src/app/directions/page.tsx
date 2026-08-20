import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ButtonLink } from '@/components/ButtonLink';
import { TitleStroke } from '@/components/Decor';
import { Faq } from '@/components/Faq';
import { JsonLd } from '@/components/JsonLd';
import { MapEmbed } from '@/components/MapEmbed';
import { Section } from '@/components/Section';
import { DockCard } from '@/components/directions/DockCard';
import {
  ClockIcon,
  InfoIcon,
  PhoneIcon,
  PinIcon,
  WalkIcon,
} from '@/components/directions/Icons';
import { NoteList } from '@/components/directions/NoteList';
import { ShuttleCard } from '@/components/directions/ShuttleCard';
import { ADDRESS, HOURS_SUMMARY, PHONE, SEASON_NOTE } from '@/data/business';
import {
  ARRIVING_NOTES,
  DOCKS,
  FAQ_ITEMS,
  IN_TOWN_NOTES,
  MAP_LINKS,
  VISIT_TIPS,
  WALKING_CAVEAT,
} from '@/data/directions';
import type { BreadcrumbItem } from '@/lib/schema';
import { breadcrumbSchema, faqSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Directions & Cruise Ship Passenger Guide',
  description:
    'Walking directions to Native WILDFlour at First Avenue & State Street in Skagway, Alaska from the Broadway, Ore and Railroad cruise ship docks.',
  path: '/directions/',
});

/** Rendered as the visible trail and as the BreadcrumbList JSON-LD. */
const BREADCRUMBS: readonly BreadcrumbItem[] = [
  { name: 'Home', path: '/' },
  { name: 'Directions', path: '/directions/' },
];

export default function DirectionsPage() {
  return (
    <>
      <JsonLd
        id="schema-directions"
        data={[breadcrumbSchema(BREADCRUMBS), faqSchema(FAQ_ITEMS)]}
      />

      <Section tone="sky" className="pt-8 sm:pt-10">
        <Breadcrumbs items={BREADCRUMBS} />

        <h1 className="mt-6 text-4xl font-black text-bark sm:text-5xl">
          Find Us: Directions for Cruise Passengers &amp; Visitors
        </h1>
        <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />

        <p className="mt-5 max-w-2xl text-lg text-bark/80">
          We are on the corner of First Avenue &amp; State Street in downtown Skagway, one block
          west of Broadway and a short walk from the cruise ship docks.
        </p>

        <p className="mt-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-snow px-4 py-2 text-sm font-bold text-bark shadow-card ring-1 ring-wheat">
            <WalkIcon className="size-4 text-spruce" />
            Roughly 5 to 20 minutes on foot, depending on your dock
          </span>
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div className="rounded-3xl bg-snow p-6 shadow-card ring-1 ring-bark/10 sm:p-8">
            <h2 className="text-2xl font-black text-bark">Address and hours</h2>

            <div className="mt-6 space-y-5">
              <div className="flex gap-3">
                <span className="text-blueberry">
                  <PinIcon />
                </span>
                <div>
                  <p className="text-sm font-bold tracking-wide text-bark/70 uppercase">
                    Address
                  </p>
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

      <Section
        tone="snow"
        eyebrow="Getting oriented"
        title="Where we are in town"
        lead="Our corner sits at the southern end of downtown. Here is what to steer by."
      >
        <NoteList items={IN_TOWN_NOTES} icon="signpost" surface="cream" />
      </Section>

      <Section
        id="from-the-docks"
        eyebrow="Dock by dock"
        title="From your cruise ship"
        lead="Find your dock below for the walk into town, step by step."
      >
        <p className="flex items-start gap-3 rounded-3xl border-2 border-dashed border-honey/50 bg-wheat/15 p-4 text-bark/85">
          <span className="mt-0.5 text-honey">
            <InfoIcon />
          </span>
          <span>{WALKING_CAVEAT}</span>
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {DOCKS.map((dock) => (
            <DockCard key={dock.id} dock={dock} />
          ))}
        </div>

        <ShuttleCard className="mt-6" />
      </Section>

      <Section tone="snow" title="Arriving by car, RV, ferry or train">
        <NoteList items={ARRIVING_NOTES} icon="compass" surface="cream" />
      </Section>

      <Section
        tone="sky"
        title="Tips for your visit"
        lead="A few things worth knowing before you walk over."
      >
        <NoteList items={VISIT_TIPS} icon="check" columns={2} />

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/menu/">See the full menu</ButtonLink>
          <ButtonLink href="/about/" variant="secondary">
            Meet Kelly and our story
          </ButtonLink>
        </div>
      </Section>

      <Section title="Frequently asked questions">
        <Faq items={FAQ_ITEMS} />
      </Section>
    </>
  );
}
