import { menuAccent } from '@/components/menu/accents';
import { MENU_SECTIONS } from '@/data/menu';

export interface MenuJumpLinksProps {
  readonly className?: string;
}

/**
 * Anchor chips that jump to each menu section. Reads the menu data itself.
 * Each chip carries its section's accent as a legend dot — the same color the
 * section card answers with in its heading stroke and `:target` flash.
 */
export function MenuJumpLinks({ className = '' }: MenuJumpLinksProps) {
  return (
    <nav aria-label="Jump to a menu section" className={className}>
      <ul className="flex flex-wrap gap-2">
        {MENU_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-snow px-4 py-2 text-sm font-bold text-bark no-underline shadow-press ring-1 ring-wood/25 transition duration-200 ease-out hover:bg-wheat/25 hover:ring-wood motion-safe:hover:-translate-y-0.5"
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${menuAccent(section.id).dot}`}
              />
              {section.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
