/**
 * schema.org JSON-LD builders. The business facts come from `src/data/*` and `SITE_URL`; the
 * menu arrives as an argument, from the same loaded document the page renders — so the
 * structured data can never drift from what the visitor sees.
 */

import {
  ADDRESS,
  BUSINESS_NAME,
  COFFEE_ROASTER,
  FACEBOOK_URL,
  GEO,
  HOURS_SUMMARY,
  OPENING_HOURS,
  PHONE,
  SEASON_NOTE,
} from '@/data/business';
import { MAP_LINKS } from '@/data/map';
import type { FaqItem } from '@/lib/content/directions';
import { expandHoursToken, expandSeasonToken } from '@/lib/copy-rules';
import type { MenuSectionContent } from '@/lib/menu-content';
import { LOGO_URL, OG_IMAGE_URL, SITE_URL, absoluteUrl } from '@/lib/site';

const SCHEMA_CONTEXT = 'https://schema.org' as const;

export const RESTAURANT_ID = `${SITE_URL}/#restaurant`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export interface PostalAddressSchema {
  readonly '@type': 'PostalAddress';
  readonly streetAddress: string;
  readonly addressLocality: string;
  readonly addressRegion: string;
  readonly postalCode: string;
  readonly addressCountry: string;
}

export interface GeoCoordinatesSchema {
  readonly '@type': 'GeoCoordinates';
  readonly latitude: number;
  readonly longitude: number;
}

export interface OpeningHoursSchema {
  readonly '@type': 'OpeningHoursSpecification';
  readonly dayOfWeek: readonly string[];
  readonly opens: string;
  readonly closes: string;
}

export interface RestaurantSchema {
  readonly '@context': typeof SCHEMA_CONTEXT;
  readonly '@type': readonly ['Restaurant', 'CafeOrCoffeeShop'];
  readonly '@id': string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly image: readonly string[];
  readonly logo: string;
  readonly telephone: string;
  readonly address: PostalAddressSchema;
  readonly geo: GeoCoordinatesSchema;
  readonly openingHoursSpecification: readonly OpeningHoursSchema[];
  readonly servesCuisine: readonly string[];
  readonly sameAs: readonly string[];
  readonly hasMenu: string;
  readonly acceptsReservations: boolean;
  readonly hasMap: string;
}

export interface WebSiteSchema {
  readonly '@context': typeof SCHEMA_CONTEXT;
  readonly '@type': 'WebSite';
  readonly '@id': string;
  readonly url: string;
  readonly name: string;
  readonly description: string;
  readonly inLanguage: string;
  readonly publisher: { readonly '@id': string };
}

export interface MenuItemSchema {
  readonly '@type': 'MenuItem';
  readonly name: string;
  readonly description?: string;
}

export interface MenuSectionSchema {
  readonly '@type': 'MenuSection';
  readonly name: string;
  readonly description?: string;
  readonly hasMenuItem: readonly MenuItemSchema[];
}

export interface MenuSchema {
  readonly '@context': typeof SCHEMA_CONTEXT;
  readonly '@type': 'Menu';
  readonly '@id': string;
  readonly name: string;
  readonly url: string;
  readonly inLanguage: string;
  readonly hasMenuSection: readonly MenuSectionSchema[];
}

export interface BreadcrumbItem {
  readonly name: string;
  /** Site-relative path with a trailing slash, e.g. `/menu/`. */
  readonly path: string;
}

export interface BreadcrumbListSchema {
  readonly '@context': typeof SCHEMA_CONTEXT;
  readonly '@type': 'BreadcrumbList';
  readonly itemListElement: readonly {
    readonly '@type': 'ListItem';
    readonly position: number;
    readonly name: string;
    readonly item: string;
  }[];
}

export interface FaqPageSchema {
  readonly '@context': typeof SCHEMA_CONTEXT;
  readonly '@type': 'FAQPage';
  readonly mainEntity: readonly {
    readonly '@type': 'Question';
    readonly name: string;
    readonly acceptedAnswer: {
      readonly '@type': 'Answer';
      readonly text: string;
    };
  }[];
}

/** Matches the visible phone string exactly — see docs/BRIEF.md §5. */
const TELEPHONE = PHONE.display;

const BUSINESS_DESCRIPTION =
  `A small independent cafe in Skagway, Alaska serving authentic Alaskan bannock, house-baked goods, and Alaska-roasted ${COFFEE_ROASTER}.`;

export function restaurantSchema(): RestaurantSchema {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': ['Restaurant', 'CafeOrCoffeeShop'],
    '@id': RESTAURANT_ID,
    name: BUSINESS_NAME,
    description: BUSINESS_DESCRIPTION,
    url: `${SITE_URL}/`,
    image: [OG_IMAGE_URL, LOGO_URL],
    logo: LOGO_URL,
    telephone: TELEPHONE,
    address: {
      '@type': 'PostalAddress',
      streetAddress: ADDRESS.street,
      addressLocality: ADDRESS.locality,
      addressRegion: ADDRESS.region,
      postalCode: ADDRESS.postalCode,
      addressCountry: ADDRESS.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: GEO.latitude,
      longitude: GEO.longitude,
    },
    openingHoursSpecification: OPENING_HOURS.map((spec) => ({
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: [...spec.dayOfWeek],
      opens: spec.opens,
      closes: spec.closes,
    })),
    servesCuisine: ['Alaskan', 'Bannock', 'Bakery', 'Coffee'],
    sameAs: [FACEBOOK_URL],
    hasMenu: absoluteUrl('/menu/'),
    acceptsReservations: false,
    hasMap: MAP_LINKS.googleMaps,
  };
}

export function webSiteSchema(): WebSiteSchema {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: BUSINESS_NAME,
    description: BUSINESS_DESCRIPTION,
    inLanguage: 'en-US',
    publisher: { '@id': RESTAURANT_ID },
  };
}

export function menuSchema(sections: readonly MenuSectionContent[]): MenuSchema {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Menu',
    '@id': `${absoluteUrl('/menu/')}#menu`,
    name: `${BUSINESS_NAME} Menu`,
    url: absoluteUrl('/menu/'),
    inLanguage: 'en-US',
    hasMenuSection: sections.map((section) => ({
      '@type': 'MenuSection' as const,
      name: section.name,
      ...(section.description ? { description: section.description } : {}),
      hasMenuItem: section.items.map((item) => ({
        '@type': 'MenuItem' as const,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
      })),
    })),
  };
}

export function breadcrumbSchema(items: readonly BreadcrumbItem[]): BreadcrumbListSchema {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem' as const,
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqSchema(items: readonly FaqItem[]): FaqPageSchema {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question' as const,
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        // Same expansion as `DirectionsFaq`: the structured data says what the page says.
        text: expandSeasonToken(expandHoursToken(item.answer, HOURS_SUMMARY), SEASON_NOTE),
      },
    })),
  };
}

/** Anything the `JsonLd` component can render. */
export type SchemaObject =
  | RestaurantSchema
  | WebSiteSchema
  | MenuSchema
  | BreadcrumbListSchema
  | FaqPageSchema;
