import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * Pinned so the exported `sitemap.xml` is byte-identical between builds.
 * Bump the date whenever page content changes materially.
 */
const LAST_MODIFIED = '2026-09-02';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = LAST_MODIFIED;

  return [
    {
      url: absoluteUrl('/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/menu/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/directions/'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/about/'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
