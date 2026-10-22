import type { Metadata } from 'next';

import { BUSINESS_NAME } from '@/data/business';
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  SITE_INDEXABLE,
  absoluteUrl,
} from '@/lib/site';

export const SITE_NAME = BUSINESS_NAME;

/** Applied by the root layout to every page title that is not marked `absoluteTitle`. */
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

/** Resolves `TITLE_TEMPLATE` where the finished string is needed (OG/Twitter, the 404 page). */
export function formatPageTitle(title: string): string {
  return TITLE_TEMPLATE.replace('%s', title);
}

export const OG_IMAGE_ALT = `${SITE_NAME} — authentic Alaskan bannock in Skagway, Alaska`;

/** Home page title. Already ends with the business name, so it is used verbatim. */
export const DEFAULT_TITLE =
  'Native WILDFlour | Authentic Alaskan Bannock & Coffee in Skagway, Alaska';

/** Home page meta description (≤ 155 characters). */
export const DEFAULT_DESCRIPTION =
  'Fresh-fried Alaskan bannock from a family recipe, house-baked goods and Kaladi Brothers coffee in downtown Skagway, Alaska — steps from the docks.';

export interface BuildMetadataOptions {
  /** Page title. Gets ` | Native WILDFlour` appended unless `absoluteTitle` is true. */
  readonly title: string;
  /** Meta description, one sentence, ideally ≤ 155 characters. */
  readonly description: string;
  /** Site-relative path with a leading and trailing slash, e.g. `/menu/`. */
  readonly path: string;
  /** Set on the home page, whose title already ends with the business name. */
  readonly absoluteTitle?: boolean;
}

/**
 * Robots directives for the public pages. Until launch (`SITE_INDEXABLE` off) the pages still
 * declare their canonical URLs — self-referencing canonicals sit fine beside `noindex`, and
 * flipping the switch then changes this tag and nothing else.
 */
const PAGE_ROBOTS: Metadata['robots'] = SITE_INDEXABLE
  ? {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    }
  : { index: false, follow: false };

/**
 * Builds the per-page `metadata` export: canonical, Open Graph, Twitter and robots.
 * The canonical URL is absolute and keeps its trailing slash.
 */
export function buildMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: BuildMetadataOptions): Metadata {
  const canonical = absoluteUrl(path);
  const fullTitle = absoluteTitle ? title : formatPageTitle(title);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: canonical,
      title: fullTitle,
      description,
      images: [
        {
          url: OG_IMAGE_URL,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE_URL, alt: OG_IMAGE_ALT }],
    },
    robots: PAGE_ROBOTS,
  };
}
