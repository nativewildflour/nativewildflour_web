import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ButtonLink } from '@/components/ButtonLink';
import { ChipList } from '@/components/ChipList';
import { FireweedSprig, TitleStroke } from '@/components/Decor';
import { HoursTable } from '@/components/HoursTable';
import { JsonLd } from '@/components/JsonLd';
import { Section } from '@/components/Section';
import { PhotoSlot } from '@/components/PhotoSlot';
import {
  ADDRESS_ONE_LINE,
  BANNOCK_EXPLAINER,
  BUSINESS_NAME,
  COFFEE_ROASTER,
  FACEBOOK_URL,
  HOURS_SUMMARY,
  MOTTO,
  OWNER,
  PHONE,
  SEASON_NOTE,
} from '@/data/business';
import { BANNOCK_TOPPINGS } from '@/data/menu';
import type { BreadcrumbItem } from '@/lib/schema';
import { breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'About Kelly & Our Story',
  description:
    'Meet Kelly and the passed-down family bannock recipe behind Native WILDFlour, a small independent cafe and coffee stop in Skagway, Alaska.',
  path: '/about/',
});

/** The same array feeds the visible trail and the JSON-LD, so they can never disagree. */
const BREADCRUMBS: readonly BreadcrumbItem[] = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about/' },
];

const CARD = 'rounded-3xl p-6 shadow-card ring-1 ring-bark/10 sm:p-8';

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-5 w-5 shrink-0 text-spruce"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-5 w-5 shrink-0 text-spruce"
    >
      <path d="M6.5 3.5h3l1.4 4-2 1.4a12.5 12.5 0 0 0 6.2 6.2l1.4-2 4 1.4v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-5 w-5 shrink-0 text-spruce"
    >
      <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3H6.5A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <>
      <Section tone="parchment">
        <Breadcrumbs items={BREADCRUMBS} />
        <p className="mt-6 text-sm font-bold tracking-[0.18em] text-wood uppercase">
          Kelly, Grammy and a family recipe
        </p>
        <h1 className="mt-2 text-4xl font-black text-bark sm:text-6xl">Our Story</h1>
        <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
        <p className="mt-5 max-w-2xl text-lg text-bark/80">
          {BUSINESS_NAME} is a small, independent cafe on the corner of First Avenue and State
          Street in Skagway, Alaska. It starts with Kelly, her Grammy, and a passed-down family
          bannock recipe.
        </p>
      </Section>

      <Section tone="snow" title="Meet Kelly">
        <div className="grid gap-10 md:grid-cols-5 md:items-start">
          <div className="space-y-4 text-bark/85 md:col-span-3">
            <p>
              Kelly trained at the {OWNER.training}. Today she bakes and fries in Skagway, at a
              little counter one block west of Broadway, close enough to the water that you can
              walk over from the docks.
            </p>
            <p>
              The bannock is fresh fried and made to order, one piece at a time. Alongside it she
              bakes cookies and muffins by hand and puts together a savory bannock lunch special
              that changes daily.
            </p>
            <p>
              Nothing here is big or complicated: bread fried to order, baked goods made by hand,
              and a menu short enough to keep it that way.
            </p>
          </div>
          <PhotoSlot caption="Kelly at the counter" className="md:col-span-2" />
        </div>
      </Section>

      <Section tone="cream" title="Grammy’s kitchen">
        <div className="grid gap-8 md:grid-cols-5 md:items-center">
          <div className="space-y-4 text-bark/85 md:col-span-3">
            <p>
              Ask Kelly where all of this comes from and the answer is {OWNER.inspiration}. Kelly
              calls her the greatest inspiration in her life.
            </p>
            <p>Her love, generosity and recipes inspire everything Kelly makes.</p>
          </div>
          <figure className={`bg-parchment md:col-span-2 ${CARD}`}>
            <FireweedSprig className="h-8 w-6" />
            <blockquote className="mt-3">
              <p className="font-display text-xl leading-snug font-bold text-bark sm:text-2xl">
                &ldquo;filled our hearts and tummies with the smell of fresh baking&rdquo;
              </p>
            </blockquote>
            <figcaption className="mt-4 text-sm font-bold tracking-wide text-bark/70 uppercase">
              Kelly, on her Grammy
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section
        tone="snow"
        title="The family bannock recipe"
        lead="Handed down through the family, and made to order every time."
      >
        <p className="max-w-2xl text-bark/85">
          Every piece is fried to order, so it reaches you hot and golden. Then you choose how to
          finish it.
        </p>

        <h3 className="mt-8 text-sm font-bold tracking-wide text-bark/70 uppercase">
          Toppings to choose from
        </h3>
        <ChipList items={BANNOCK_TOPPINGS} className="mt-3" />

        <p className="mt-8 max-w-2xl text-bark/85">
          The savory lunch specials rotate daily and often sell out, so it is worth coming early.
          Whatever is on today, it is posted on Facebook.
        </p>

        <div className="mt-8">
          <ButtonLink href="/menu/">See the full menu</ButtonLink>
        </div>
      </Section>

      <Section tone="sky" title="What is bannock?" width="3xl">
        <div className="space-y-4 text-lg text-bark/85">
          <p>{BANNOCK_EXPLAINER}</p>
          <p>
            Ours is the Alaskan kind: fresh fried bread, made to order, served plain or under a
            spoonful of something sweet.
          </p>
        </div>
      </Section>

      <Section
        tone="cream"
        eyebrow="No chain behind us"
        title="Made in Skagway"
        lead="Small, independent and open for the season."
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <div className={`bg-snow ${CARD}`}>
            <h3 className="text-xl font-bold text-bark">One little cafe</h3>
            <p className="mt-3 text-bark/80">
              No chain behind us. The person who owns {BUSINESS_NAME} is the person doing the
              baking.
            </p>
          </div>
          <div className={`bg-snow ${CARD}`}>
            <h3 className="text-xl font-bold text-bark">Open for the season</h3>
            <p className="mt-3 text-bark/80">{SEASON_NOTE}</p>
          </div>
          <div className={`bg-snow ${CARD}`}>
            <h3 className="text-xl font-bold text-bark">Alaska-roasted coffee</h3>
            <p className="mt-3 text-bark/80">
              We proudly pour {COFFEE_ROASTER}, roasted in Alaska, alongside hot tea and cold
              drinks.
            </p>
          </div>
        </div>

        <p className="mt-10 rounded-[2rem] bg-gradient-to-br from-spruce to-spruce-deep px-6 py-10 text-center font-display text-2xl font-black text-snow shadow-lift sm:text-3xl">
          {MOTTO}
        </p>
      </Section>

      <Section
        tone="snow"
        eyebrow="Stop by"
        title="Come say hello"
        lead="We are a short walk from the cruise docks, at the south end of downtown Skagway."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className={`bg-cream ${CARD}`}>
            <h3 className="text-xl font-bold text-bark">Find us</h3>
            <ul className="mt-4 space-y-4">
              <li className="flex gap-3">
                <PinIcon />
                <span>
                  {ADDRESS_ONE_LINE}
                  <span className="block text-bark/70">One block west of Broadway.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <PhoneIcon />
                <a
                  href={PHONE.href}
                  className="inline-flex min-h-11 items-center font-bold text-blueberry underline decoration-blueberry/40 underline-offset-4 transition-colors duration-200 hover:decoration-blueberry"
                >
                  {PHONE.display}
                </a>
              </li>
              <li className="flex gap-3">
                <ChatIcon />
                <a
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-bold text-blueberry underline decoration-blueberry/40 underline-offset-4 transition-colors duration-200 hover:decoration-blueberry"
                >
                  {BUSINESS_NAME} on Facebook
                </a>
              </li>
            </ul>
          </div>

          <div className={`bg-cream ${CARD}`}>
            <h3 className="text-xl font-bold text-bark">Hours</h3>
            <HoursTable className="mt-4" caption="Opening hours" />
            <p className="mt-4 text-sm text-bark/70">{HOURS_SUMMARY}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/menu/">See the menu</ButtonLink>
          <ButtonLink href="/directions/" variant="secondary">
            Directions from the docks
          </ButtonLink>
        </div>
      </Section>

      <JsonLd id="schema-breadcrumb-about" data={breadcrumbSchema(BREADCRUMBS)} />
    </>
  );
}
