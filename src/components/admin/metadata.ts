import type { Metadata } from 'next';

import { formatPageTitle } from '@/lib/seo';
import { OG_IMAGE_HEIGHT, OG_IMAGE_URL, OG_IMAGE_WIDTH } from '@/lib/site';

export interface AdminMetadataOptions {
  /** Page title. Gets ` | Native WILDFlour` appended by the root layout's template. */
  readonly title: string;
  /** Meta description, one sentence. */
  readonly description: string;
}

/**
 * Metadata for the admin pages. Deliberately not `buildMetadata()`: admin pages are
 * `noindex, nofollow` and declare no canonical URL (the verify gate asserts both), but they
 * still need the title/description/OG/Twitter tags every exported page must carry.
 */
export function buildAdminMetadata({ title, description }: AdminMetadataOptions): Metadata {
  const fullTitle = formatPageTitle(title);

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE_URL, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE_URL }],
    },
  };
}
