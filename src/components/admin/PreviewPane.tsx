'use client';

import { MenuSection } from '@/components/MenuSection';
import type { MenuContent } from '@/lib/menu-content';

export interface PreviewPaneProps {
  readonly menu: MenuContent;
  readonly className?: string;
}

/**
 * Live preview of the draft, rendered with the same `MenuSection` cards the public `/menu/`
 * page uses — same featured treatment, same accents, same chips — so what the owner sees here
 * is what publishes. Read-only by nature: nothing in it is interactive.
 */
export function PreviewPane({ menu, className = '' }: PreviewPaneProps) {
  return (
    <section
      aria-labelledby="preview-heading"
      className={`rounded-3xl bg-parchment p-4 ring-1 ring-bark/10 sm:p-6 ${className}`.trim()}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="preview-heading" className="text-xl font-black text-bark">
          Preview
        </h2>
        <p className="text-xs font-bold tracking-[0.14em] text-wood uppercase">The menu page</p>
      </div>

      <div className="mt-4 space-y-4">
        <p className="text-bark/80">{menu.intro}</p>

        <aside
          aria-label="Specials note preview"
          className="rounded-2xl border-2 border-dashed border-fireweed/50 bg-fireweed/5 p-4"
        >
          <h3 className="font-display text-lg font-black text-bark">Today’s special</h3>
          <p className="mt-1 text-sm text-bark/80">{menu.specialsNote}</p>
        </aside>

        {menu.sections.map((section, index) => (
          <MenuSection
            key={`${section.id}-${index}`}
            section={section}
            {...(section.toppings?.length
              ? { chips: section.toppings, chipsLabel: 'Choose a topping' }
              : {})}
          />
        ))}
      </div>
    </section>
  );
}
