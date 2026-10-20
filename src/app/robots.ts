import type { MetadataRoute } from 'next';

import { SITE_INDEXABLE, absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    // The `.txt` rule is kept from the static-export era, when per-route RSC prefetch
    // payloads shipped as real `.txt` files: Netlify's header rules cannot target them
    // (no extension globs), so they were kept out of search results here instead. The
    // runtime serves those payloads on the page URLs now, but the rule costs nothing and
    // still covers any stray text file. Google and Bing both support wildcard rules.
    //
    // `/admin` is Basic-auth gated and served with noindex headers and meta tags already;
    // disallowing it here (both spellings, with and without the trailing slash) keeps
    // crawlers from requesting those URLs at all.
    //
    // The public pages stay crawlable even before launch (`SITE_INDEXABLE` off): their
    // `noindex` lives in the page, and a crawler blocked here would never read it — a
    // disallowed URL can still be listed from links alone. Only the sitemap is withheld.
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/admin/', '/*.txt$'] }],
    ...(SITE_INDEXABLE ? { sitemap: absoluteUrl('/sitemap.xml') } : {}),
  };
}
