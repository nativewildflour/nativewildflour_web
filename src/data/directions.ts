/**
 * Getting here: map links, dock-by-dock walking directions, and the FAQ.
 * See docs/BRIEF.md §4 `/directions/`.
 */

import { GEO, HOURS_SUMMARY, SEASON_NOTE } from './business';

const COORDS = `${GEO.latitude},${GEO.longitude}`;

/**
 * Half-span of the embedded map's viewport, in degrees — hand-tuned to frame downtown
 * Skagway. The centre itself comes from `GEO`, like every other link here, so correcting
 * the coordinates moves the visible pin and not just the buttons.
 */
const EMBED_SPAN = { longitude: 0.00575, latitude: 0.00325 };

const EMBED_BBOX = [
  GEO.longitude - EMBED_SPAN.longitude,
  GEO.latitude - EMBED_SPAN.latitude,
  GEO.longitude + EMBED_SPAN.longitude,
  GEO.latitude + EMBED_SPAN.latitude,
]
  .map((value) => value.toFixed(4))
  .join(',');

export interface MapLinks {
  /** `src` for the OpenStreetMap iframe. */
  readonly osmEmbed: string;
  /** Full OpenStreetMap page. */
  readonly osmPage: string;
  /** Google Maps place lookup — used for schema.org `hasMap`. */
  readonly googleMaps: string;
  /** Google Maps turn-by-turn directions. */
  readonly googleDirections: string;
  /** Apple Maps walking directions. */
  readonly appleDirections: string;
}

export const MAP_LINKS: MapLinks = {
  osmEmbed: `https://www.openstreetmap.org/export/embed.html?bbox=${EMBED_BBOX}&layer=mapnik&marker=${COORDS}`,
  osmPage: `https://www.openstreetmap.org/?mlat=${GEO.latitude}&mlon=${GEO.longitude}#map=17/${GEO.latitude}/${GEO.longitude}`,
  googleMaps: `https://www.google.com/maps/search/?api=1&query=${COORDS}`,
  googleDirections: `https://www.google.com/maps/dir/?api=1&destination=${COORDS}`,
  appleDirections: `https://maps.apple.com/?daddr=${COORDS}&dirflg=w`,
};

/** Accessible title for the embedded map iframe. */
export const MAP_TITLE =
  'Map showing Native WILDFlour at First Avenue and State Street, Skagway';

export interface Dock {
  /** Stable slug, used for React keys and anchors. */
  readonly id: string;
  readonly name: string;
  /** Display string, e.g. `~5–8 minutes`. */
  readonly walkMinutes: string;
  /** One-line summary shown under the dock name. */
  readonly summary: string;
  /** Ordered walking directions. */
  readonly steps: readonly string[];
}

/** Shown once above the dock cards. */
export const WALKING_CAVEAT =
  "Walking times are approximate; follow port signage and your ship’s all-aboard time.";

const BROADWAY_DOCK: Dock = {
  id: 'broadway-dock',
  name: 'Broadway Dock',
  walkMinutes: '~5–8 minutes',
  summary: 'The closest dock to us. Flat and paved the whole way.',
  steps: [
    'Walk off the pier toward town along Congress Way.',
    'Continue to the foot of Broadway at 1st Avenue, beside Centennial Park.',
    'Turn left (west) on 1st Avenue.',
    "We’re one block ahead, at the corner of 1st Avenue and State Street.",
  ],
};

export const DOCKS: readonly Dock[] = [
  BROADWAY_DOCK,
  {
    id: 'ore-dock',
    name: 'Ore Dock',
    walkMinutes: '~8–12 minutes',
    summary: 'A slightly longer waterfront walk. Flat and paved.',
    steps: [
      'Follow the waterfront path east toward the Small Boat Harbor and Congress Way.',
      'Head north on Congress Way to 1st Avenue.',
      'Turn left on 1st Avenue and walk to State Street.',
    ],
  },
  {
    id: 'railroad-dock',
    name: 'Railroad Dock',
    walkMinutes: '~15–20 minutes',
    summary:
      'The farthest dock. Walk it, ride the port shuttle, or take the SMART shuttle bus downtown.',
    steps: [
      "Depending on your berth you may walk the paved harbor path, ride the port’s free shuttle through the rock-fall zone, or tender to shore.",
      'Follow the harbor path west to Congress Way.',
      'Head north to 1st Avenue, then turn left to State Street.',
      'Prefer to ride? Hop on the SMART shuttle bus downtown.',
    ],
  },
];

/** The closest dock — surfaces that quote one walking time (home hero, cruise panel) read from here. */
export const CLOSEST_DOCK: Dock = BROADWAY_DOCK;

/** `walkMinutes` without the `~`, for prose: "about 5–8 minutes on foot". */
export const CLOSEST_DOCK_WALK = CLOSEST_DOCK.walkMinutes.replace('~', '');

export interface ShuttleInfo {
  readonly name: string;
  readonly description: string;
  readonly notes: readonly string[];
}

export const SMART_SHUTTLE: ShuttleInfo = {
  name: 'SMART shuttle',
  description:
    "Skagway’s town bus loops between the docks and downtown roughly every 15 minutes in season.",
  notes: [
    'Small per-ride fare; day passes are available.',
    'Ask the driver for the stop nearest 1st Avenue & State Street.',
  ],
};

/** "Where we are in town" — orientation facts. */
export const IN_TOWN_NOTES: readonly string[] = [
  'We are at 1st Avenue & State Street, at the southern end of downtown, one block west of Broadway.',
  'Centennial Park — home of the big rotary snowplow at 1st & Broadway — is our nearest landmark.',
  'State Street is the Klondike Highway as it enters town.',
];

/** "Arriving by car, RV, ferry or train". */
export const ARRIVING_NOTES: readonly string[] = [
  'By road: the Klondike Highway becomes State Street. Follow it south to 1st Avenue.',
  'By ferry: the Alaska Marine Highway terminal is at the south end of town, near the docks.',
  'By train: the White Pass & Yukon Route depot is at 2nd Avenue & Spring Street, two short blocks east.',
];

export const VISIT_TIPS: readonly string[] = [
  'Budget 20–30 minutes round trip from the closest docks.',
  'Specials sell out — come early.',
  'We are a grab-and-go spot: order at the window, made to go.',
  'Mornings are best for coffee and bannock; the lunch special lands around midday.',
];

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

/**
 * "About 5–8 minutes on foot from the Broadway Dock, 8–12 minutes from the Ore Dock, and
 * 15–20 minutes from the Railroad Dock." Composed from `DOCKS` so the FAQ answer — which is
 * also the FAQPage rich result — cannot outlive a change to a dock's walking time.
 */
const DOCK_WALK_SENTENCE = `About ${DOCKS.map((dock, index) => {
  const walk = dock.walkMinutes.replace('~', '');
  const lead = index > 0 && index === DOCKS.length - 1 ? 'and ' : '';
  const onFoot = index === 0 ? ' on foot' : '';
  return `${lead}${walk}${onFoot} from the ${dock.name}`;
}).join(', ')}.`;

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'How far is Native WILDFlour from the cruise ship docks?',
    answer: `${DOCK_WALK_SENTENCE} ${WALKING_CAVEAT}`,
  },
  {
    question: 'Is the walk flat and wheelchair friendly?',
    answer:
      'The walk from the Broadway Dock and the Ore Dock is flat and paved on downtown sidewalks and streets. From the Railroad Dock you can also ride the SMART shuttle bus into town.',
  },
  {
    // Composed, not restated: this answer feeds the FAQPage rich result, so it must not be
    // able to disagree with the hours table rendered on the same page.
    question: 'What are your hours?',
    answer: `${HOURS_SUMMARY} ${SEASON_NOTE}`,
  },
  {
    question: 'Do you take reservations?',
    answer: 'No — walk up and order at the window.',
  },
  {
    question: 'Where can I see today’s special?',
    answer: 'Today’s lunch special is posted on our Facebook page.',
  },
];
