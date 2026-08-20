import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    // The static export ships RSC prefetch payloads as `.txt` files. Netlify's header
    // rules cannot target them (no extension globs), so keep them out of search results
    // here instead — Google and Bing both support wildcard disallow rules.
    rules: [{ userAgent: '*', allow: '/', disallow: '/*.txt$' }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
