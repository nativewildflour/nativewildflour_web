import type { ComponentType } from 'react';

import type { IconProps } from '@/components/directions/Icons';
import { CheckIcon, CompassIcon, SignpostIcon } from '@/components/directions/Icons';

export type NoteIcon = 'signpost' | 'compass' | 'check';

interface NoteIconStyle {
  readonly Icon: ComponentType<IconProps>;
  readonly tint: string;
}

const NOTE_ICONS: Record<NoteIcon, NoteIconStyle> = {
  signpost: { Icon: SignpostIcon, tint: 'bg-spruce/10 text-spruce' },
  compass: { Icon: CompassIcon, tint: 'bg-blueberry/10 text-blueberry' },
  check: { Icon: CheckIcon, tint: 'bg-fireweed/10 text-fireweed' },
};

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

const SURFACES = {
  snow: 'bg-snow',
  cream: 'bg-cream',
} as const;

export interface NoteListProps {
  readonly items: readonly string[];
  readonly icon: NoteIcon;
  /** Card columns from the `sm` breakpoint up. Defaults to 3; `1` stays a single column. */
  readonly columns?: 1 | 2 | 3;
  /** Card background — pick the one that contrasts with the section tone. */
  readonly surface?: keyof typeof SURFACES;
  readonly className?: string;
}

/** A grid of short notes, each in its own card with a decorative icon. */
export function NoteList({
  items,
  icon,
  columns = 3,
  surface = 'snow',
  className = '',
}: NoteListProps) {
  const { Icon, tint } = NOTE_ICONS[icon];

  return (
    <ul className={`grid gap-4 ${COLUMNS[columns]} ${className}`.trim()}>
      {items.map((item, index) => (
        <li
          key={index}
          className={`flex h-full items-start gap-3 rounded-3xl ${SURFACES[surface]} p-5 shadow-card ring-1 ring-bark/10`}
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${tint}`}
          >
            <Icon />
          </span>
          <span className="text-bark/85">{item}</span>
        </li>
      ))}
    </ul>
  );
}
