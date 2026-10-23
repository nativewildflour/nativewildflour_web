import type { NextConfig } from 'next';

/**
 * Security headers for every response the Next server renders. On Netlify the pages (the four
 * ISR pages, the 404 and the admin screens) are served by the Next runtime's function, and
 * netlify.toml's [[headers]] reach only files from the static store, so these values must be
 * set here as well. Keep them identical to the "/*" rule in netlify.toml.
 *
 * No Cache-Control here for public routes: Next only writes the ISR Cache-Control when none is
 * set yet, so a value from this file would replace the pages' revalidation policy.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/**
 * The admin screens are never cached. The edge guard stamps the same headers on what it passes
 * through; this is the backstop for the Next-rendered admin pages and the revalidate route.
 * The admin APIs and /images/uploads/ are Netlify Functions, which this file never reaches —
 * they set their own headers.
 */
const ADMIN_HEADERS = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // "/admin/:path*" should match the landing page too; it is listed on its own anyway, as
      // netlify.toml has to do for its edge-function routes.
      { source: '/admin', headers: ADMIN_HEADERS },
      { source: '/admin/:path*', headers: ADMIN_HEADERS },
    ];
  },
};

export default nextConfig;
