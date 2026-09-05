import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

/**
 * The public-site frame: skip link, header, `main#main`, footer. Rendered by the `(site)`
 * route-group layout and by the root 404 boundary (which sits outside every group). The
 * admin routes deliberately do not use it — `AdminShell` is their frame.
 */
export function SiteChrome({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
