'use client';

/**
 * Labeled text controls for the editor. Every field takes an explicit `id`: the issues panel
 * focuses fields through `document.getElementById`, so ids follow the validator's path labels
 * (`field-sections[2].items[0].name` for the issue path `sections[2].items[0].name`).
 */

import type { KeyboardEvent } from 'react';

// Placeholders sit at /70 for contrast: on item and topping rows the placeholder is the only
// visible label, so it must clear WCAG AA like real text.
const FIELD_CLASS =
  'w-full rounded-xl border border-bark/20 bg-snow px-3 py-2 text-bark shadow-press ' +
  'transition-colors duration-150 placeholder:text-bark/70 hover:border-bark/35 ' +
  'focus:border-blueberry';

const LABEL_CLASS = 'mb-1 block text-sm font-bold text-bark/80';

/**
 * For scratch inputs whose text is not part of the document history (a name typed but not
 * yet added): stops Ctrl/Cmd+Z/Y from reaching the editor's global undo/redo handler, so the
 * browser's native text undo applies inside the field instead of rewinding the menu.
 */
export function stopUndoRedoPropagation(event: KeyboardEvent<HTMLInputElement>): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'z' || key === 'y') event.stopPropagation();
}

export interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  /** Visually hide the label (still announced) for dense rows that label themselves. */
  readonly hideLabel?: boolean;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly className?: string;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hideLabel = false,
  onKeyDown,
  className = '',
}: TextFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        className={FIELD_CLASS}
      />
    </div>
  );
}

export interface TextAreaFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly rows?: number;
  /** Short helper line rendered under the label. */
  readonly hint?: string;
  readonly className?: string;
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  rows = 3,
  hint,
  className = '',
}: TextAreaFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-sm text-bark/70">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        aria-describedby={hintId}
        className={`${FIELD_CLASS} resize-y`}
      />
    </div>
  );
}

export interface CheckboxFieldProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly className?: string;
}

export function CheckboxField({ id, label, checked, onChange, className = '' }: CheckboxFieldProps) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-bark ${className}`.trim()}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4.5 w-4.5 shrink-0 accent-blueberry"
      />
      {label}
    </label>
  );
}
