import type { ReactNode } from 'react';

import { ChatIcon, CupIcon, HeartIcon } from '@/components/home/HomeIcons';
import type { MenuNote, MenuNoteIcon } from '@/lib/menu-content';

export interface GoodToKnowProps {
  /** The owner's notes, from the menu document's page wording. */
  readonly notes: readonly MenuNote[];
  /** One column at every width — for the editor preview, which is narrower than the viewport. */
  readonly compact?: boolean;
  readonly className?: string;
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

/** One drawing per icon name the editor offers (`MENU_NOTE_ICONS`). */
const ICONS: Record<MenuNoteIcon, ReactNode> = {
  flame: (
    <svg {...ICON_PROPS} className={ICON_CLASS}>
      <path d="M12 3c2.2 2.7 1.4 4.3 0 5.7-1.8 1.8-2.9 3.2-2.9 5.1a4.9 4.9 0 0 0 9.8 0c0-3.5-2.3-5.6-3.4-6.8" />
      <path d="M8.6 13.4C6.9 14.5 5.5 16 5.5 17.8A4.9 4.9 0 0 0 8 21.9" />
    </svg>
  ),
  timer: (
    <svg {...ICON_PROPS} className={ICON_CLASS}>
      <circle cx="12" cy="12.8" r="8.2" />
      <path d="M12 8.4v4.4l3 2" />
      <path d="M9 2.6h6" />
    </svg>
  ),
  bag: (
    <svg {...ICON_PROPS} className={ICON_CLASS}>
      <path d="M5.2 8.4h13.6l-1.1 11a1.9 1.9 0 0 1-1.9 1.7H8.2a1.9 1.9 0 0 1-1.9-1.7Z" />
      <path d="M9 8.4V6.6a3 3 0 0 1 6 0v1.8" />
    </svg>
  ),
  cup: <CupIcon className={ICON_CLASS} />,
  heart: <HeartIcon className={ICON_CLASS} />,
  chat: <ChatIcon className={ICON_CLASS} />,
};

/**
 * The card that always closes the row. Rule-driven copy (docs/BRIEF.md §1: prices are posted at
 * the counter, never on the site), so it is part of the page rather than the owner's notes.
 */
const PRICES_NOTE = {
  title: 'Prices at the counter',
  body: 'You will find prices posted at the counter when you order.',
  icon: (
    <svg {...ICON_PROPS} className={ICON_CLASS}>
      <rect x="3.2" y="4.5" width="17.6" height="15" rx="2.2" />
      <path d="M7 9.2h10M7 13h7" />
    </svg>
  ),
} as const;

function NoteCard({
  title,
  body,
  icon,
}: {
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 rounded-3xl bg-snow p-6 shadow-card ring-1 ring-bark/10">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-spruce/10">
        {icon}
      </span>
      <div className="min-w-0 break-words">
        <h3 className="text-lg font-black text-bark">{title}</h3>
        <p className="mt-1 text-bark/80">{body}</p>
      </div>
    </li>
  );
}

/**
 * Short practical notes about ordering: the owner's, then the fixed prices card. Headings are
 * `h3` — supply the `h2` above. Keyed by position: two notes may share a heading while the
 * owner is mid-edit, and the list is never reordered in place on the public page.
 */
export function GoodToKnow({ notes, compact = false, className = '' }: GoodToKnowProps) {
  const columns = compact ? 'gap-4' : 'gap-5 sm:grid-cols-2';
  return (
    <ul className={`grid ${columns} ${className}`.trim()}>
      {notes.map((note, index) => (
        <NoteCard key={index} title={note.title} body={note.body} icon={ICONS[note.icon]} />
      ))}
      <NoteCard title={PRICES_NOTE.title} body={PRICES_NOTE.body} icon={PRICES_NOTE.icon} />
    </ul>
  );
}
