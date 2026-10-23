/**
 * Canonical origin for the site. Netlify sets `URL` automatically; set
 * `NEXT_PUBLIC_SITE_URL` once a custom domain is connected.
 * Always stored without a trailing slash.
 */
const FALLBACK_SITE_URL = 'https://nativewildflour.netlify.app';

/**
 * `||`, not `??`: a defined-but-blank env var (an empty Netlify UI field, or a bare
 * `NEXT_PUBLIC_SITE_URL=` line) must fall through to the next candidate rather than
 * becoming an empty origin that fails later as a bare `Invalid URL`.
 */
function resolveSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.URL?.trim() || FALLBACK_SITE_URL;

  if (!/^https?:\/\/[^/]+/.test(configured)) {
    const source = process.env.NEXT_PUBLIC_SITE_URL?.trim() ? 'NEXT_PUBLIC_SITE_URL' : 'URL';
    throw new Error(
      `${source} must be an absolute http(s) origin (e.g. https://example.com) — got "${configured}".`,
    );
  }

  return configured.replace(/\/$/, '');
}

export const SITE_URL = resolveSiteUrl();

/**
 * Whether search engines may index the site: on only when `NEXT_PUBLIC_SITE_INDEXABLE` is
 * exactly `true`. Off, every public page carries `noindex, nofollow` and robots.txt stops
 * advertising the sitemap — the site is a pitch that must not be listed as the cafe's own until
 * the owner approves it (PRODUCT.md). Failing closed means a deploy nobody configured stays out
 * of search results; set it for the production context only, at launch.
 *
 * `NEXT_PUBLIC_` for its build-time inlining, not for the browser (nothing client-side reads
 * it): the build prerenders the pages and robots.txt, then ISR re-renders the pages at request
 * time, and an inlined value is the only kind both are guaranteed to agree on. Changing it
 * therefore takes a redeploy. `scripts/verify-build.mjs` reads the same variable and fails a
 * build whose output disagrees with it.
 */
export const SITE_INDEXABLE = process.env.NEXT_PUBLIC_SITE_INDEXABLE?.trim() === 'true';

/** Absolute URL for a site-relative path (`/menu/` -> `https://…/menu/`). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Default social share image, absolute. */
export const OG_IMAGE_PATH = '/images/og-default.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_URL = absoluteUrl(OG_IMAGE_PATH);

/** Square logo used for schema.org `logo` / `image`, absolute. */
export const LOGO_PATH = '/images/logo-512.webp';
export const LOGO_URL = absoluteUrl(LOGO_PATH);
