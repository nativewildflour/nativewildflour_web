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

/** 24-hour `HH:MM` -> `h:MM AM/PM`, e.g. `09:00` -> `9:00 AM`. */
function formatTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** The same clock time, compact: `09:00` -> `9 AM`, `16:30` -> `4:30 PM`. */
function formatTimeShort(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return minutes === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

const SHORT_DAY: Record<Weekday, string> = {
  Sunday: 'Sun',
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
};

/**
 * Every open day mapped to the entry that opens it — read from *all* of `OPENING_HOURS`,
 * not just the first. Splitting the week across several entries (which the schema.org shape
 * and the README both allow) then stays impossible to get wrong: the rendered table, the
 * summary strings and the JSON-LD all read the same map.
 */
const SPEC_BY_DAY: ReadonlyMap<Weekday, OpeningHoursSpec> = new Map(
  OPENING_HOURS.flatMap((spec) => spec.dayOfWeek.map((day) => [day, spec] as const)),
);

/** One row per day of the week, in display order, for `HoursTable`. */
export const HOURS_ROWS: readonly HoursRow[] = WEEKDAYS.map((day) => {
  const spec = SPEC_BY_DAY.get(day);
  return {
    day,
    hours: spec ? `${formatTime(spec.opens)} – ${formatTime(spec.closes)}` : 'Closed',
    closed: !spec,
  };
});

/** Contiguous runs of days sharing the same hours — "Sunday–Friday", then "Saturday". */
const HOURS_RUNS = (() => {
  const runs: { days: Weekday[]; hours: string; spec: OpeningHoursSpec | undefined }[] = [];
  for (const row of HOURS_ROWS) {
    const last = runs.at(-1);
    if (last && last.hours === row.hours) last.days.push(row.day);
    else runs.push({ days: [row.day], hours: row.hours, spec: SPEC_BY_DAY.get(row.day) });
  }
  return runs;
})();

function runDays(days: readonly Weekday[], short: boolean): string {
  const name = (day: Weekday) => (short ? SHORT_DAY[day] : day);
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return '';
  return first === last ? name(first) : `${name(first)}–${name(last)}`;
}

/** Long form, for body copy: "Sunday–Friday, 9:00 AM – 4:00 PM. Closed Saturday." */
export const HOURS_SUMMARY = `${HOURS_RUNS.map((run) =>
  run.spec
    ? `${runDays(run.days, false)}, ${run.hours}`
    : `Closed ${runDays(run.days, false)}`,
).join('. ')}.`;

/** Compact form, for the hero pill: "Open Sun–Fri 9 AM–4 PM · Closed Sat". */
export const HOURS_SHORT = `Open ${HOURS_RUNS.map((run) =>
  run.spec
    ? `${runDays(run.days, true)} ${formatTimeShort(run.spec.opens)}–${formatTimeShort(run.spec.closes)}`
    : `Closed ${runDays(run.days, true)}`,
).join(' · ')}`;

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
