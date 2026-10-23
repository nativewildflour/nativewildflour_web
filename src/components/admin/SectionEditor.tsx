'use client';

import { ActionButton, IconButton } from '@/components/admin/buttons';
import { CheckboxField, TextField } from '@/components/admin/fields';
import type { SectionOption } from '@/components/admin/ItemEditor';
import { ItemEditor } from '@/components/admin/ItemEditor';
import { ToppingsEditor } from '@/components/admin/ToppingsEditor';
import { menuSectionDomId } from '@/components/MenuSection';
import type { MenuSectionContent } from '@/lib/menu-content';

/** Everything a section card can do, bound to its index by the editor. */
export interface SectionActions {
  readonly rename: (value: string) => void;
  readonly describe: (value: string) => void;
  readonly setHighlight: (shown: boolean) => void;
  readonly setFeatured: (on: boolean) => void;
  readonly move: (direction: -1 | 1) => void;
  /** The editor confirms in a dialog before the section actually goes. */
  readonly remove: () => void;
  readonly addItem: () => void;
  readonly itemName: (itemIndex: number, value: string) => void;
  readonly itemDescription: (itemIndex: number, value: string) => void;
  readonly moveItem: (from: number, to: number) => void;
  readonly removeItem: (itemIndex: number) => void;
  readonly moveItemToSection: (itemIndex: number, targetSection: number) => void;
  readonly toppingAdd: (text: string) => void;
  readonly toppingUpdate: (toppingIndex: number, text: string) => void;
  readonly toppingRemove: (toppingIndex: number) => void;
  readonly toppingMove: (from: number, to: number) => void;
}

export interface SectionEditorProps {
  readonly sectionIndex: number;
  readonly sectionCount: number;
  readonly section: MenuSectionContent;
  readonly sectionOptions: readonly SectionOption[];
  readonly actions: SectionActions;
}

/**
 * One editable menu section: name, description, the two toggles, the topping-chip editor
 * (when featured), and the item list. The wrapper carries `id="field-sections[N]"` with
 * `tabIndex={-1}` so section-level validation issues have a focus target.
 */
export function SectionEditor({
  sectionIndex,
  sectionCount,
  section,
  sectionOptions,
  actions,
}: SectionEditorProps) {
  const label = section.name.trim() || `section ${sectionIndex + 1}`;
  const featured = section.toppings !== undefined;

  return (
    <section
      id={`field-sections[${sectionIndex}]`}
      tabIndex={-1}
      aria-label={`Section ${sectionIndex + 1}: ${label}`}
      className="rounded-3xl bg-snow p-5 shadow-card ring-1 ring-bark/10 sm:p-6"
    >
      <h3 className="sr-only">{`Section ${sectionIndex + 1}: ${label}`}</h3>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-[0.16em] text-wood uppercase">
          {`Section ${sectionIndex + 1} of ${sectionCount}`}
          {/* The anchor the menu page really links to — section ids are namespaced there. */}
          <span className="ml-2 font-mono text-bark/75 normal-case tracking-normal">
            {`#${menuSectionDomId(section.id)}`}
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          <IconButton
            icon="up"
            id={`move-up-sections[${sectionIndex}]`}
            label={`Move ${label} earlier in the menu`}
            disabled={sectionIndex === 0}
            onClick={() => actions.move(-1)}
          />
          <IconButton
            icon="down"
            id={`move-down-sections[${sectionIndex}]`}
            label={`Move ${label} later in the menu`}
            disabled={sectionIndex === sectionCount - 1}
            onClick={() => actions.move(1)}
          />
          <IconButton icon="remove" label={`Delete ${label}`} onClick={actions.remove} />
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <TextField
          id={`field-sections[${sectionIndex}].name`}
          label="Section name"
          value={section.name}
          onChange={actions.rename}
          placeholder="Section name"
        />
        <TextField
          id={`field-sections[${sectionIndex}].description`}
          label="Section description (optional)"
          value={section.description ?? ''}
          onChange={actions.describe}
          placeholder="One-line lead-in shown under the heading"
        />
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <CheckboxField
            id={`section-highlight-${sectionIndex}`}
            label="Show in home-page highlights"
            checked={section.highlight !== false}
            onChange={actions.setHighlight}
          />
          <CheckboxField
            id={`section-featured-${sectionIndex}`}
            label="Featured card with topping chips"
            checked={featured}
            onChange={actions.setFeatured}
          />
        </div>
      </div>

      {featured ? (
        <ToppingsEditor
          className="mt-4"
          sectionIndex={sectionIndex}
          sectionName={section.name}
          toppings={section.toppings ?? []}
          onAdd={actions.toppingAdd}
          onUpdate={actions.toppingUpdate}
          onRemove={actions.toppingRemove}
          onMove={actions.toppingMove}
        />
      ) : null}

      <div className="mt-5">
        <h4 className="text-sm font-bold tracking-wide text-bark/70 uppercase">
          {section.items.length === 1 ? '1 item' : `${section.items.length} items`}
        </h4>
        {section.items.length === 0 ? (
          <p className="mt-2 text-sm text-bark/70">Nothing here yet — add the first item.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {section.items.map((item, itemIndex) => (
              <ItemEditor
                key={itemIndex}
                sectionIndex={sectionIndex}
                itemIndex={itemIndex}
                itemCount={section.items.length}
                item={item}
                sectionOptions={sectionOptions}
                onName={(value) => actions.itemName(itemIndex, value)}
                onDescription={(value) => actions.itemDescription(itemIndex, value)}
                onMove={actions.moveItem}
                onRemove={() => actions.removeItem(itemIndex)}
                onMoveToSection={(target) => actions.moveItemToSection(itemIndex, target)}
              />
            ))}
          </ul>
        )}
        <ActionButton variant="subtle" size="sm" className="mt-3" onClick={actions.addItem}>
          {`+ Add an item to ${label}`}
        </ActionButton>
      </div>
    </section>
  );
}
