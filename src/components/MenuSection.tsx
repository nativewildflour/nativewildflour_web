import type { CSSProperties } from 'react';

import { ChipList } from '@/components/ChipList';
import { TitleStroke } from '@/components/Decor';
import { menuAccent } from '@/components/menu/accents';
import type { MenuSectionContent } from '@/lib/menu-content';

export interface MenuSectionProps {
  readonly section: MenuSectionContent;
  /** Optional chip list rendered under the items, e.g. the bannock toppings. */
  readonly chips?: readonly string[];
  /** Heading for the chip list. */
  readonly chipsLabel?: string;
  readonly className?: string;
}

/**
 * The DOM id (and `/menu/` anchor) of a section card. Section ids are the owner's slugs, so a
 * bare slug could land on a fixed id ("main", "todays-special-heading", an admin heading) or on
 * another section's derived id ("bannock" + "-heading" = a section named "bannock-heading").
 * `SLUG` forbids "--" and no fixed id on the site contains it, so ids built with "--" as the
 * separator can equal neither.
 */
export function menuSectionDomId(sectionId: string, part?: 'heading' | 'chips'): string {
  return part ? `menu--${sectionId}--${part}` : `menu--${sectionId}`;
}

/** One menu section, set like a printed menu card. No prices, ever. */
export function MenuSection({ section, chips, chipsLabel, className = '' }: MenuSectionProps) {
  const headingId = menuSectionDomId(section.id, 'heading');
  const chipsHeadingId = menuSectionDomId(section.id, 'chips');
  const featured = Boolean(chips && chips.length > 0);
  const accent = menuAccent(section.id);

  return (
    <section
      id={menuSectionDomId(section.id)}
      aria-labelledby={headingId}
      // `menu-card` + the accent variable drive the `:target` flash after a jump-link hop.
      style={{ '--target-accent': accent.color } as CSSProperties}
      className={`menu-card rounded-3xl p-6 shadow-card sm:p-8 ${
        featured
          ? 'bg-gradient-to-br from-snow to-wheat/20 ring-2 ring-wheat'
          : 'bg-snow ring-1 ring-bark/10'
      } ${className}`.trim()}
    >
      <h3 id={headingId} className="text-2xl font-black text-bark">
        {section.name}
      </h3>
      <TitleStroke className={`mt-2 h-2 w-16 ${accent.stroke}`} />
      {section.description ? (
        <p className="mt-3 text-bark/80">{section.description}</p>
      ) : null}

      <ul className="mt-6">
        {/* Items carry no identity and the list is order-stable within a render, so the index
            is the key — names can repeat (or be blank mid-edit in the admin preview). */}
        {section.items.map((item, index) => (
          <li
            key={index}
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
