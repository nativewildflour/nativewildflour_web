'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { NavLink } from '@/data/nav';

export interface MobileNavProps {
  readonly links: readonly NavLink[];
}

const PANEL_ID = 'site-nav-panel';

/**
 * Small-screen disclosure navigation.
 * The only client component on the site: a `<button aria-expanded>` plus a `<ul>` of links.
 */
export function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [renderedPath, setRenderedPath] = useState(pathname);

  // Close on navigation. Adjusting state during render is React's recommended
  // alternative to an effect here — see "You Might Not Need an Effect".
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    setOpen(false);
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-bark/15 bg-snow px-4 font-bold text-bark shadow-card transition-colors duration-200 hover:border-bark/30"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {open ? (
            <>
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </>
          ) : (
            <>
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </>
          )}
        </svg>
        {/* "Pages", not "Menu": on a cafe site "Menu" belongs to the food menu alone,
            and the footer's page list already uses the same word. */}
        <span>{open ? 'Close' : 'Pages'}</span>
      </button>

      <nav
        id={PANEL_ID}
        aria-label="Primary"
        hidden={!open}
        // `nav-panel` plays the drop-in each time [hidden] comes off (globals.css).
        className="nav-panel absolute inset-x-0 top-full z-40 rounded-b-3xl border-b border-bark/10 bg-cream shadow-lift"
      >
        <ul className="container-gutter mx-auto w-full max-w-5xl py-3">
          {links.map((link) => {
            const isCurrent = pathname === link.href;
            return (
              <li key={link.href} className="border-b border-dotted border-wood/25 last:border-b-0">
                <Link
                  href={link.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-2 py-3 text-lg font-bold no-underline transition-colors duration-200 hover:bg-wheat/20 ${
                    isCurrent ? 'text-blueberry' : 'text-bark'
                  }`}
                >
                  {isCurrent ? (
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-fireweed" />
                  ) : null}
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
