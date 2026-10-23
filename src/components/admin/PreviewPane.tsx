'use client';

import { BrandText } from '@/components/BrandText';
import { MenuSection } from '@/components/MenuSection';
import { GoodToKnow } from '@/components/menu/GoodToKnow';
import { menuPageCopy } from '@/lib/default-menu';
import { specialsText, type MenuContent } from '@/lib/menu-content';

export interface PreviewPaneProps {
  readonly menu: MenuContent;
  readonly className?: string;
}

/**
 * Live preview of the draft, rendered with the same `MenuSection` cards and "Good to know"
 * notes the public `/menu/` page uses — same featured treatment, same accents, same chips — so
 * what the owner sees here is what publishes. Read-only by nature: nothing in it is
 * interactive, which is why the specials box is drawn here without its Facebook button.
 */
export function PreviewPane({ menu, className = '' }: PreviewPaneProps) {
  const page = menuPageCopy(menu);

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
        <div>
          {/* Uppercase labels go through `BrandText`, as on the page, so the name keeps its casing. */}
          <p className="text-xs font-bold tracking-[0.18em] text-wood uppercase">
            <BrandText text={page.eyebrow} />
          </p>
          <p className="mt-2 text-bark/80">{menu.intro}</p>
        </div>

        <aside
          aria-label="Specials box preview"
          className="rounded-2xl border-2 border-dashed border-fireweed/50 bg-fireweed/5 p-4"
        >
          <h3 className="font-display text-lg font-black text-bark">{page.specialsTitle}</h3>
          <p className="mt-1 text-sm text-bark/80">
            {specialsText(page.specialsLead, menu.specialsNote)}
          </p>
        </aside>

        <h3 className="pt-2 font-display text-2xl font-black text-bark">{page.sectionsTitle}</h3>

        {menu.sections.map((section, index) => (
          <MenuSection
            key={`${section.id}-${index}`}
            section={section}
            {...(section.toppings?.length
              ? { chips: section.toppings, chipsLabel: 'Choose a topping' }
              : {})}
          />
        ))}

        <div className="rounded-2xl bg-sky/40 p-4 ring-1 ring-blueberry/15">
          <p className="text-xs font-bold tracking-[0.18em] text-wood uppercase">
            <BrandText text={page.goodToKnow.eyebrow} />
          </p>
          <h3 className="mt-1 font-display text-2xl font-black text-bark">
            {page.goodToKnow.title}
          </h3>
          {/* The pane is narrower than the viewport the `sm` breakpoint reads, so one column. */}
          <GoodToKnow notes={page.goodToKnow.notes} compact className="mt-4" />
        </div>
      </div>
    </section>
  );
}
