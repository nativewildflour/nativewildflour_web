import type { MetadataRoute } from 'next';

import { BUSINESS_NAME } from '@/data/business';
import { DEFAULT_DESCRIPTION } from '@/lib/seo';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BUSINESS_NAME} — Authentic Alaskan Bannock in Skagway, Alaska`,
    short_name: BUSINESS_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#3A5FA8',
    background_color: '#FFF8EC',
    lang: 'en-US',
    icons: [
      // The 512 an install wants lives in /images/ and is fetched only by installs;
      // /icon.png is the 192px tab icon linked from every page.
      {
        src: '/images/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
