import { menuSectionDomId } from '@/components/MenuSection';
import { menuAccent } from '@/components/menu/accents';
import type { MenuSectionContent } from '@/lib/menu-content';

export interface MenuJumpLinksProps {
  readonly sections: readonly MenuSectionContent[];
  readonly className?: string;
}

/**
 * Anchor chips that jump to each menu section. Each chip carries its section's accent as a
 * legend dot — the same color the section card answers with in its heading stroke and
 * `:target` flash.
 */
export function MenuJumpLinks({ sections, className = '' }: MenuJumpLinksProps) {
  return (
    <nav aria-label="Jump to a menu section" className={className}>
      <ul className="flex flex-wrap gap-2">
        {sections.map((section, index) => (
          // `max-w-full` caps the chip at the row width, so one long name wraps inside it.
          <li key={`${index}-${section.id}`} className="max-w-full">
            <a
              href={`#${menuSectionDomId(section.id)}`}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-snow px-4 py-2 text-sm font-bold text-bark no-underline shadow-press ring-1 ring-wood/25 transition duration-200 ease-out hover:bg-wheat/25 hover:ring-wood motion-safe:hover:-translate-y-0.5"
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${menuAccent(section.id).dot}`}
              />
              <span className="min-w-0">{section.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
