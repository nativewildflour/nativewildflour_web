'use client';

import { useState } from 'react';

import { ActionButton, IconButton } from '@/components/admin/buttons';
import { stopUndoRedoPropagation, TextField } from '@/components/admin/fields';

export interface ToppingsEditorProps {
  readonly sectionIndex: number;
  readonly sectionName: string;
  readonly toppings: readonly string[];
  readonly onUpdate: (toppingIndex: number, text: string) => void;
  readonly onRemove: (toppingIndex: number) => void;
  readonly onMove: (from: number, to: number) => void;
  readonly onAdd: (text: string) => void;
  readonly className?: string;
}

/**
 * The topping-chip editor, shown when a section is the featured card. Each chip is an
 * editable row with reorder and remove; new chips append from the small form at the bottom.
 */
export function ToppingsEditor({
  sectionIndex,
  sectionName,
  toppings,
  onUpdate,
  onRemove,
  onMove,
  onAdd,
  className = '',
}: ToppingsEditorProps) {
  const [newTopping, setNewTopping] = useState('');
  const inSection = `in ${sectionName.trim() || `section ${sectionIndex + 1}`}`;

  function submit() {
    const text = newTopping.trim();
    if (text === '') return;
    onAdd(text);
    setNewTopping('');
  }

  return (
    <div className={`rounded-2xl bg-wheat/15 p-4 ring-1 ring-wheat ${className}`.trim()}>
      <h4 className="text-sm font-bold tracking-wide text-bark/70 uppercase">Topping chips</h4>
      {toppings.length === 0 ? (
        <p className="mt-2 text-sm text-bark/70">
          No toppings yet — add the first one below. The card shows its featured style once a
          chip exists.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {toppings.map((topping, toppingIndex) => (
            <li key={toppingIndex} className="flex items-center gap-2">
              <TextField
                id={`field-sections[${sectionIndex}].toppings[${toppingIndex}]`}
                label={`Topping ${toppingIndex + 1} ${inSection}`}
                hideLabel
                value={topping}
                onChange={(value) => onUpdate(toppingIndex, value)}
                className="flex-1"
              />
              <IconButton
                icon="up"
                id={`move-up-sections[${sectionIndex}].toppings[${toppingIndex}]`}
                label={`Move topping ${toppingIndex + 1} up`}
                disabled={toppingIndex === 0}
                onClick={() => onMove(toppingIndex, toppingIndex - 1)}
              />
              <IconButton
                icon="down"
                id={`move-down-sections[${sectionIndex}].toppings[${toppingIndex}]`}
                label={`Move topping ${toppingIndex + 1} down`}
                disabled={toppingIndex === toppings.length - 1}
                onClick={() => onMove(toppingIndex, toppingIndex + 1)}
              />
              <IconButton
                icon="remove"
                label={`Remove topping ${toppingIndex + 1} (${topping.trim() || 'blank'})`}
                onClick={() => onRemove(toppingIndex)}
              />
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          id={`add-topping-${sectionIndex}`}
          label={`New topping ${inSection}`}
          hideLabel
          value={newTopping}
          onChange={setNewTopping}
          onKeyDown={stopUndoRedoPropagation}
          placeholder="New topping, e.g. Honey"
          className="flex-1"
        />
        <ActionButton variant="secondary" size="sm" onClick={submit}>
          Add topping
        </ActionButton>
      </form>
    </div>
  );
}
