import type { Metadata, Viewport } from 'next';
import { Fraunces, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import { JsonLd } from '@/components/JsonLd';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { BUSINESS_NAME } from '@/data/business';
import { restaurantSchema, webSiteSchema } from '@/lib/schema';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, TITLE_TEMPLATE } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  display: 'swap',
  variable: '--font-fraunces',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-nunito',
});

/**
 * Site-wide defaults only. Canonical, Open Graph, Twitter and robots tags are set
 * per page by `buildMetadata()` — putting them here would leak the home page's
 * canonical and `index, follow` onto the 404 page.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  description: DEFAULT_DESCRIPTION,
  title: {
    default: DEFAULT_TITLE,
    template: TITLE_TEMPLATE,
  },
  applicationName: BUSINESS_NAME,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Backgrounds bleed edge-to-edge on notched phones; Container's safe-area
  // gutter (`.container-gutter`) keeps the content itself clear of the notch.
  viewportFit: 'cover',
  themeColor: '#3A5FA8',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <body className="flex min-h-screen flex-col bg-cream text-bark">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <JsonLd id="schema-organization" data={[restaurantSchema(), webSiteSchema()]} />
      </body>
    </html>
  );
}
