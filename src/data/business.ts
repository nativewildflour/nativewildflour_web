/**
 * Single source of truth for the business facts.
 * Every fact here is verified — see docs/BRIEF.md §1. Do not add anything that is not in the brief.
 */

export type Weekday =
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday';

export interface PostalAddressData {
  readonly street: string;
  readonly locality: string;
  /** Two-letter state code, e.g. `AK`. */
  readonly region: string;
  /** Spelled-out state, e.g. `Alaska`. */
  readonly regionName: string;
  readonly postalCode: string;
  /** ISO country code, e.g. `US`. */
  readonly country: string;
}

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PhoneData {
  /** Human-readable, e.g. `+1 907-612-0002`. */
  readonly display: string;
  /** E.164, e.g. `+19076120002`. */
  readonly e164: string;
  /** Ready for an anchor `href`, e.g. `tel:+19076120002`. */
  readonly href: string;
}

export interface OpeningHoursSpec {
  readonly dayOfWeek: readonly Weekday[];
  /** 24-hour `HH:MM`. */
  readonly opens: string;
  /** 24-hour `HH:MM`. */
  readonly closes: string;
}

export interface HoursRow {
  readonly day: Weekday;
  /** Display string, e.g. `9:00 AM – 4:00 PM` or `Closed`. */
  readonly hours: string;
  readonly closed: boolean;
}

export const WEEKDAYS: readonly Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const BUSINESS_NAME = 'Native WILDFlour';

export const ADDRESS: PostalAddressData = {
  street: 'First Avenue & State Street',
  locality: 'Skagway',
  region: 'AK',
  regionName: 'Alaska',
  postalCode: '99840',
  country: 'US',
};

/** `First Avenue & State Street, Skagway, AK 99840` */
export const ADDRESS_ONE_LINE = `${ADDRESS.street}, ${ADDRESS.locality}, ${ADDRESS.region} ${ADDRESS.postalCode}`;

export const GEO: GeoPoint = {
  latitude: 59.4539,
  longitude: -135.3209,
};

export const PHONE: PhoneData = {
  display: '+1 907-612-0002',
  e164: '+19076120002',
  href: 'tel:+19076120002',
};

export const FACEBOOK_URL = 'https://www.facebook.com/NativeWILDFlour/';

export const MOTTO = 'Made in Skagway • Made with Love • Made to Go';

export const COFFEE_ROASTER = 'Kaladi Brothers Coffee';

/** Schema.org-ready. Sunday through Friday, 9:00 AM – 4:00 PM. Saturday is closed. */
export const OPENING_HOURS: readonly OpeningHoursSpec[] = [
  {
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',
    closes: '16:00',
  },
];

const OPEN_DAYS: ReadonlySet<Weekday> = new Set(OPENING_HOURS[0]?.dayOfWeek ?? []);

/** 24-hour `HH:MM` -> `h:MM AM/PM`, e.g. `09:00` -> `9:00 AM`. */
function formatTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** Display form of the opening hours, derived from `OPENING_HOURS` so they cannot drift. */
const OPEN_HOURS_DISPLAY = OPENING_HOURS[0]
  ? `${formatTime(OPENING_HOURS[0].opens)} – ${formatTime(OPENING_HOURS[0].closes)}`
  : 'Closed';

/** One row per day of the week, in display order, for `HoursTable`. */
export const HOURS_ROWS: readonly HoursRow[] = WEEKDAYS.map((day) => {
  const open = OPEN_DAYS.has(day);
  return { day, hours: open ? OPEN_HOURS_DISPLAY : 'Closed', closed: !open };
});

/** Long form, for body copy. */
export const HOURS_SUMMARY = 'Sunday–Friday, 9:00 AM – 4:00 PM. Closed Saturday.';

/** Compact form, for the hero pill. */
export const HOURS_SHORT = 'Open Sun–Fri 9 AM–4 PM · Closed Sat';

/** Seasonality note — the brief allows this general wording only. */
export const SEASON_NOTE =
  'Open for the summer cruise season — seasonal updates are posted on Facebook.';

export const OWNER = {
  firstName: 'Kelly',
  training: 'Culinary Art Institute in Seattle',
  inspiration: 'her Grammy',
} as const;

export interface Testimonial {
  readonly quote: string;
  readonly attribution: string;
}

/** Quote verbatim; attribute exactly as written. */
export const TESTIMONIAL: Testimonial = {
  quote:
    'This is the ONLY authentic bannock available in Skagway. The owner, Kelly, is an absolute gem… Armed with her passed down family recipe, her bannock melts in your mouth and fills you with joy. Enjoy a variety of toppings including her own hand made rhubarb jam!',
  attribution: 'Kayla F., Facebook recommendation',
};

/** Respectful, general description of bannock — see docs/BRIEF.md §1. */
export const BANNOCK_EXPLAINER =
  'Bannock is a simple, hearty bread — flour, water, a little fat and leavening — pan-fried or baked until golden. It is a beloved staple across Alaska Native and First Nations communities and throughout the North, and families pass down their own versions.';
