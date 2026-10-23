import { ButtonLink } from '@/components/ButtonLink';
import { HoursTable } from '@/components/HoursTable';
import { Section } from '@/components/Section';
import { ABOUT_CARD } from '@/components/about/card';
import {
  ADDRESS_ONE_LINE,
  BUSINESS_NAME,
  FACEBOOK_URL,
  HOURS_SUMMARY,
  PHONE,
} from '@/data/business';
import type { AboutContent } from '@/lib/content/about';

const LINK =
  'inline-flex min-h-11 items-center font-bold text-blueberry underline decoration-blueberry/40 underline-offset-4 transition-colors duration-200 hover:decoration-blueberry';

const ICON = 'mt-0.5 h-5 w-5 shrink-0 text-spruce';

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
      className={ICON}
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
      className={ICON}
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
      className={ICON}
    >
      <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3H6.5A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z" />
    </svg>
  );
}

export interface AboutSayHelloProps {
  readonly content: AboutContent['sayHello'];
}

/**
 * The closing "come say hello" block. The address, phone, Facebook link and hours all come from
 * the business data, so only the words around them are editable.
 */
export function AboutSayHello({ content }: AboutSayHelloProps) {
  return (
    <Section tone="snow" eyebrow={content.eyebrow} title={content.title} lead={content.lead}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={`bg-cream ${ABOUT_CARD}`}>
          <h3 className="text-xl font-bold text-bark">Find us</h3>
          <ul className="mt-4 space-y-4">
            <li className="flex gap-3">
              <PinIcon />
              <span className="min-w-0">
                {ADDRESS_ONE_LINE}
                <span className="block text-bark/70">{content.locationNote}</span>
              </span>
            </li>
            <li className="flex gap-3">
              <PhoneIcon />
              <a href={PHONE.href} className={LINK}>
                {PHONE.display}
              </a>
            </li>
            <li className="flex gap-3">
              <ChatIcon />
              <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                {/* One inline span around the whole label: as separate flex items, the name
                    and " on Facebook" would lose the space between them. */}
                <span>
                  <span translate="no">{BUSINESS_NAME}</span> on Facebook
                </span>
              </a>
            </li>
          </ul>
        </div>

        <div className={`bg-cream ${ABOUT_CARD}`}>
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
  );
}
