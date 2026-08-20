import type { CSSProperties } from 'react';

import { ChipList } from '@/components/ChipList';
import { TitleStroke } from '@/components/Decor';
import { menuAccent } from '@/components/menu/accents';
import type { MenuSectionData } from '@/data/menu';

export interface MenuSectionProps {
  readonly section: MenuSectionData;
  /** Optional chip list rendered under the items, e.g. the bannock toppings. */
  readonly chips?: readonly string[];
  /** Heading for the chip list. */
  readonly chipsLabel?: string;
  readonly className?: string;
}

/** One menu section, set like a printed menu card. No prices, ever. */
export function MenuSection({ section, chips, chipsLabel, className = '' }: MenuSectionProps) {
  const chipsHeadingId = `${section.id}-chips`;
  const featured = Boolean(chips && chips.length > 0);
  const accent = menuAccent(section.id);

  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-heading`}
      // `menu-card` + the accent variable drive the `:target` flash after a jump-link hop.
      style={{ '--target-accent': accent.color } as CSSProperties}
      className={`menu-card rounded-3xl p-6 shadow-card sm:p-8 ${
        featured
          ? 'bg-gradient-to-br from-snow to-wheat/20 ring-2 ring-wheat'
          : 'bg-snow ring-1 ring-bark/10'
      } ${className}`.trim()}
    >
      <h3 id={`${section.id}-heading`} className="text-2xl font-black text-bark">
        {section.name}
      </h3>
      <TitleStroke className={`mt-2 h-2 w-16 ${accent.stroke}`} />
      {section.description ? (
        <p className="mt-3 text-bark/80">{section.description}</p>
      ) : null}

      <ul className="mt-6">
        {section.items.map((item) => (
          <li
            key={item.name}
            className="border-b border-dotted border-wood/30 py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <p className="font-display text-lg font-bold text-bark">{item.name}</p>
            {item.description ? <p className="mt-0.5 text-bark/75">{item.description}</p> : null}
          </li>
        ))}
      </ul>

      {chips && chips.length > 0 ? (
        <div className="mt-6">
          {chipsLabel ? (
            <h4
              id={chipsHeadingId}
              className="text-sm font-bold tracking-wide text-bark/70 uppercase"
            >
              {chipsLabel}
            </h4>
          ) : null}
          <ChipList
            items={chips}
            className="mt-3"
            {...(chipsLabel ? { labelledBy: chipsHeadingId } : {})}
          />
        </div>
      ) : null}
    </section>
  );
}
