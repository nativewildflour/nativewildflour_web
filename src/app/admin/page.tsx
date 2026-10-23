import Link from 'next/link';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/AdminShell';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export const metadata = buildAdminMetadata({
  title: 'Admin',
  description:
    'The workroom for the Native WILDFlour site — edit and publish the pages, the menu and the photos.',
});

const ICON_PROPS = {
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  className: 'h-7 w-7',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

interface Tool {
  readonly href: string;
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  /** Icon badge tint. Kept off wheat and honey — neither reads on a light card. */
  readonly badge: string;
  readonly icon: ReactNode;
}

const TOOLS: readonly Tool[] = [
  {
    href: '/admin/home/',
    title: 'Home page',
    body: 'The welcome, the bannock story, the visitor quote and the panels that close the page.',
    cta: 'Edit the home page',
    badge: 'bg-fireweed/10 text-fireweed',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 11.2 12 4.5l8 6.7" />
        <path d="M6.5 10v9.5h11V10" />
        <path d="M10 19.5V14h4v5.5" />
      </svg>
    ),
  },
  {
    href: '/admin/menu/',
    title: 'Menu',
    body: 'Sections, items and toppings, checked against the site’s copy rules before they go live.',
    cta: 'Edit the menu',
    badge: 'bg-blueberry/10 text-blueberry',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v12.5l-3.2-2-2.8 2-2.8-2-3.2 2V7A2.5 2.5 0 0 1 7.5 4.5" />
        <path d="M8.5 9h5M8.5 12.5h5" />
      </svg>
    ),
  },
  {
    href: '/admin/about/',
    title: 'About page',
    body: 'Your story, Grammy’s kitchen, the family recipe and the note that closes the page.',
    cta: 'Edit the about page',
    badge: 'bg-spruce/10 text-spruce',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 7.5C10.6 6.1 8.7 5.5 5 5.5V18c3.7 0 5.6.6 7 2 1.4-1.4 3.3-2 7-2V5.5c-3.7 0-5.6.6-7 2Z" />
        <path d="M12 7.5V20" />
      </svg>
    ),
  },
  {
    href: '/admin/directions/',
    title: 'Directions page',
    body: 'The walk from each dock, the landmarks to steer by, and the questions visitors ask.',
    cta: 'Edit the directions page',
    badge: 'bg-wood/10 text-wood',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 21s6.5-5.9 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.1 12 21 12 21Z" />
        <circle cx="12" cy="10.5" r="2.4" />
      </svg>
    ),
  },
  {
    href: '/admin/photos/',
    title: 'Photos',
    body: 'Every picture the site can use — add one, see where it is used, remove the spares.',
    cta: 'Open the photo library',
    badge: 'bg-blueberry/10 text-blueberry',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 8.5h3L8.5 6.5h7L17 8.5h3v10H4Z" />
        <circle cx="12" cy="13" r="3.2" />
      </svg>
    ),
  },
];

/**
 * `/admin/` — the landing page behind Basic auth. One card per thing the owner can edit; the
 * pages and the menu each publish on their own, so they each get their own door.
 */
export default function AdminPage() {
  return (
    <AdminShell>
      <Container width="5xl">
        <div className="pt-10 sm:pt-14">
          <h1 className="text-4xl font-black text-bark sm:text-5xl">Admin</h1>
          <TitleStroke draw className="mt-3 h-2 w-24 text-honey" />
          <p className="mt-4 max-w-2xl text-lg text-bark/80">
            Welcome back. Pick what you’d like to work on — changes go live on the site moments
            after you publish.
          </p>
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="group block h-full rounded-3xl bg-snow p-6 no-underline shadow-card ring-1 ring-bark/10 transition duration-200 ease-out hover:shadow-lift hover:ring-blueberry/40 motion-safe:hover:-translate-y-0.5 sm:p-8"
              >
                <span
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tool.badge}`}
                >
                  {tool.icon}
                </span>
                <h2 className="mt-4 text-2xl font-black text-bark transition-colors duration-200 group-hover:text-blueberry">
                  {tool.title}
                </h2>
                <p className="mt-2 text-bark/75">{tool.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 font-bold text-blueberry">
                  {tool.cta}
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14m0 0l-5-5m5 5l-5 5" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </AdminShell>
  );
}
