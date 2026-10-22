/**
 * Map links and the embed viewport, all derived from `GEO`.
 *
 * These are deliberately code, not owner-editable content: a correction to the coordinates has
 * to move the embedded pin, the Google and Apple directions buttons and the schema.org `hasMap`
 * URL together, and the only way to guarantee that is to compute them all from one number pair.
 */

import { GEO } from './business';

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
