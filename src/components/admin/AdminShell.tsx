import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/Container';

export interface AdminShellProps {
  readonly children: ReactNode;
}

/**
 * The admin workroom frame: a compact header (brand wordmark + "Back to site") over a plain
 * cream page. Admin routes live outside the `(site)` route group, so the marketing
 * `SiteChrome` never renders here — this shell supplies its own skip link and `main#main`
 * landmark instead.
 */
export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-cream pb-16">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="border-b border-bark/10 bg-snow">
        <Container width="6xl">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="flex items-center gap-3">
              <span translate="no" className="font-display text-lg leading-tight font-black text-bark">
                Native <span className="text-wood">WILDFlour</span>
              </span>
              <span className="rounded-full bg-spruce/10 px-2.5 py-0.5 text-xs font-bold tracking-[0.14em] text-spruce uppercase">
                Admin
              </span>
            </div>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold text-blueberry no-underline transition-colors duration-200 hover:text-blueberry-deep"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 6l-6 6 6 6" />
              </svg>
              Back to site
            </Link>
          </div>
        </Container>
      </div>

      <main id="main">{children}</main>
    </div>
  );
}
