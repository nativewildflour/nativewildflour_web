'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { NavLink } from '@/data/nav';

export interface NavLinksProps {
  readonly links: readonly NavLink[];
}

/**
 * Wide-screen primary-nav list. A client component only for `usePathname`,
 * which powers the same current-page state the disclosure nav already has:
 * blueberry text plus the honey underline held open via
 * `.nav-link[aria-current="page"]` in globals.css.
 */
export function NavLinks({ links }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1">
      {links.map((link) => {
        const isCurrent = pathname === link.href;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={`nav-link inline-flex min-h-11 items-center rounded-lg px-3 font-bold no-underline transition-colors duration-200 hover:text-blueberry ${
                isCurrent ? 'text-blueberry' : 'text-bark'
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
