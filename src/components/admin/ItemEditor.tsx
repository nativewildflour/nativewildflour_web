'use client';

import { useState } from 'react';

import { ActionButton, IconButton } from '@/components/admin/buttons';
import { TextField } from '@/components/admin/fields';
import type { MenuItemContent } from '@/lib/menu-content';

export interface SectionOption {
  readonly index: number;
  /** The section's permanent id — what a chosen move target is remembered by. */
  readonly id: string;
  readonly name: string;
}

export interface ItemEditorProps {
  readonly sectionIndex: number;
  readonly itemIndex: number;
  readonly itemCount: number;
  readonly item: MenuItemContent;
  /** Every section, in order — the move-to target list (the current one is filtered out). */
  readonly sectionOptions: readonly SectionOption[];
  readonly onName: (value: string) => void;
  readonly onDescription: (value: string) => void;
  readonly onMove: (from: number, to: number) => void;
  readonly onRemove: () => void;
  readonly onMoveToSection: (targetSection: number) => void;
}

/** One menu item: name + optional one-line description, reorder, remove, move to another section. */
export function ItemEditor({
  sectionIndex,
  itemIndex,
  itemCount,
  item,
  sectionOptions,
  onName,
  onDescription,
  onMove,
  onRemove,
  onMoveToSection,
}: ItemEditorProps) {
  const label = item.name.trim() || `item ${itemIndex + 1}`;
  const moveSelectId = `move-item-${sectionIndex}-${itemIndex}`;
  const targets = sectionOptions.filter((option) => option.index !== sectionIndex);
  /**
   * The section picked in the select, by id. Picking only chooses — the Move button moves: on
   * Windows an arrow key on a closed select fires `change`, so a select that acted on its own
   * would move the item while a keyboard user was still reading the options. By id, not index,
   * so a reorder or a deletion between the pick and the press can't send it somewhere else; a
   * pick whose section has gone (or is now this one) reads as no pick at all.
   */
  const [targetId, setTargetId] = useState('');
  const target = targets.find((option) => option.id === targetId);

  function moveToTarget() {
    if (target === undefined) return;
    // Rows are keyed by position, so the item that slides into this slot would otherwise
    // inherit the pick.
    setTargetId('');
    onMoveToSection(target.index);
  }

  return (
    <li className="rounded-2xl border border-bark/10 bg-cream/60 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <TextField
            id={`field-sections[${sectionIndex}].items[${itemIndex}].name`}
            label={`Name of item ${itemIndex + 1}`}
            hideLabel
            value={item.name}
            onChange={onName}
            placeholder="Item name"
          />
          <TextField
            id={`field-sections[${sectionIndex}].items[${itemIndex}].description`}
            label={`Description of ${label} (optional)`}
            hideLabel
            value={item.description ?? ''}
            onChange={onDescription}
            placeholder="One-line description (optional)"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <IconButton
            icon="up"
            id={`move-up-sections[${sectionIndex}].items[${itemIndex}]`}
            label={`Move ${label} up`}
            disabled={itemIndex === 0}
            onClick={() => onMove(itemIndex, itemIndex - 1)}
          />
          <IconButton
            icon="down"
            id={`move-down-sections[${sectionIndex}].items[${itemIndex}]`}
            label={`Move ${label} down`}
            disabled={itemIndex === itemCount - 1}
            onClick={() => onMove(itemIndex, itemIndex + 1)}
          />
          <IconButton icon="remove" label={`Remove ${label}`} onClick={onRemove} />
        </div>
      </div>

      {targets.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={moveSelectId} className="sr-only">
            {`Move ${label} to another section`}
          </label>
          <select
            id={moveSelectId}
            value={target === undefined ? '' : target.id}
            onChange={(event) => setTargetId(event.target.value)}
            className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl border border-bark/20 bg-snow px-3 py-1.5 text-sm font-semibold text-bark/80 shadow-press transition-colors duration-150 hover:border-bark/35"
          >
            <option value="" disabled>
              Move to another section…
            </option>
            {targets.map((option) => (
              <option key={option.index} value={option.id}>
                {option.name.trim() || `Section ${option.index + 1}`}
              </option>
            ))}
          </select>
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={target === undefined}
            ariaLabel={`Move ${label} to the chosen section`}
            onClick={moveToTarget}
          >
            Move
          </ActionButton>
        </div>
      ) : null}
    </li>
  );
}
