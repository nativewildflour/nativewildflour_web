import type { ReactNode } from 'react';

export interface GoodToKnowProps {
  readonly className?: string;
}

interface GoodToKnowItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
}

const ICON_CLASS = 'h-6 w-6 shrink-0 text-spruce';
const ICON_PROPS = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ITEMS: readonly GoodToKnowItem[] = [
  {
    id: 'fresh',
    title: 'Made fresh daily',
    body: 'Bannock is fried to order, and the house-baked cookies and muffins change from day to day.',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <path d="M12 3c2.2 2.7 1.4 4.3 0 5.7-1.8 1.8-2.9 3.2-2.9 5.1a4.9 4.9 0 0 0 9.8 0c0-3.5-2.3-5.6-3.4-6.8" />
        <path d="M8.6 13.4C6.9 14.5 5.5 16 5.5 17.8A4.9 4.9 0 0 0 8 21.9" />
      </svg>
    ),
  },
  {
    id: 'early',
    title: 'Specials sell out',
    body: 'The savory bannock lunch special rotates and often sells out, so come early if you have your heart set on it.',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <circle cx="12" cy="12.8" r="8.2" />
        <path d="M12 8.4v4.4l3 2" />
        <path d="M9 2.6h6" />
      </svg>
    ),
  },
  {
    id: 'prices',
    title: 'Prices at the counter',
    body: 'You will find prices posted at the counter when you order.',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <rect x="3.2" y="4.5" width="17.6" height="15" rx="2.2" />
        <path d="M7 9.2h10M7 13h7" />
      </svg>
    ),
  },
  {
    id: 'to-go',
    title: 'Made to go',
    body: 'We are a grab-and-go spot: order at the window and take it with you.',
    icon: (
      <svg {...ICON_PROPS} className={ICON_CLASS}>
        <path d="M5.2 8.4h13.6l-1.1 11a1.9 1.9 0 0 1-1.9 1.7H8.2a1.9 1.9 0 0 1-1.9-1.7Z" />
        <path d="M9 8.4V6.6a3 3 0 0 1 6 0v1.8" />
      </svg>
    ),
  },
];

/** Four short practical notes about ordering. Headings are `h3` — supply the `h2` above. */
export function GoodToKnow({ className = '' }: GoodToKnowProps) {
  return (
    <ul className={`grid gap-5 sm:grid-cols-2 ${className}`.trim()}>
      {ITEMS.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-4 rounded-3xl bg-snow p-6 shadow-card ring-1 ring-bark/10"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-spruce/10">
            {item.icon}
          </span>
          <div>
            <h3 className="text-lg font-black text-bark">{item.title}</h3>
            <p className="mt-1 text-bark/80">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
