'use client';

/**
 * The editor a field spec draws.
 *
 * The menu has hand-written controls because its shape is one of a kind. The page documents
 * are all made of the same half-dozen pieces, so instead of three near-identical editors this
 * walks a `DocumentSpec` and renders the controls it describes. One consequence worth stating:
 * a field added to a spec appears here, validates, and publishes without a line of UI code.
 *
 * Two contracts hold this together with the rest of the editor:
 *
 * - **Ids follow validator paths.** Every control is `id="field-<path>"`, and every container
 *   on the way down — group card, list, list item, photo slot — carries the id of its own
 *   path. `focusIssue` walks a path upwards until something answers, so a gap anywhere in
 *   that ladder would silently strand every issue beneath it.
 * - **Reorder buttons are `move-up-<path>` / `move-down-<path>`.** After a move the ids are
 *   positional, so the same-direction button at the destination is where focus goes.
 *
 * Read-only mode is one `<fieldset disabled>` around the lot: it turns off every input,
 * button and select underneath without each control having to know about it.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';

import { ActionButton, IconButton } from '@/components/admin/buttons';
import { stopUndoRedoPropagation, TextAreaField, TextField } from '@/components/admin/fields';
import { PhotoField } from '@/components/admin/PhotoField';
import type { ConfirmRequest } from '@/components/admin/use-document-editor';
import { focusSoon } from '@/components/admin/use-document-editor';
import type {
  DocumentSpec,
  FieldMap,
  FieldSpec,
  ListFieldSpec,
  ParagraphsFieldSpec,
  StringsFieldSpec,
} from '@/lib/content-schema';
import { emptyFields } from '@/lib/content-schema';
import type { PhotoContent } from '@/lib/content/images';
import { isBlank, isPlainObject, slugify } from '@/lib/copy-rules';

/** What every control needs from the editor around it, threaded down the tree unchanged. */
interface FieldContext {
  readonly readOnly: boolean;
  readonly announce: (text: string) => void;
  readonly requestConfirm: (request: ConfirmRequest) => void;
  readonly closeConfirm: () => void;
}

/** Replaces the value at one node. `coalesceKey` is set only for keystroke-level edits. */
type ValueHandler = (next: unknown, coalesceKey?: string) => void;

const LABEL_CLASS = 'block text-sm font-bold text-bark/80';
const HINT_CLASS = 'mt-1 text-sm text-bark/70';
const SUBLABEL_CLASS = 'text-sm font-bold tracking-wide text-bark/70 uppercase';

/** Heading level tracks nesting depth, so a page never jumps from an h2 to an h4. */
function Heading({
  depth,
  id,
  children,
}: {
  readonly depth: number;
  readonly id: string;
  readonly children: ReactNode;
}) {
  const className =
    depth <= 0 ? 'text-xl font-black text-bark' : 'text-lg font-black text-bark';
  if (depth <= 0) {
    return (
      <h2 id={id} className={className}>
        {children}
      </h2>
    );
  }
  if (depth === 1) {
    return (
      <h3 id={id} className={className}>
        {children}
      </h3>
    );
  }
  if (depth === 2) {
    return (
      <h4 id={id} className={className}>
        {children}
      </h4>
    );
  }
  return (
    <h5 id={id} className={className}>
      {children}
    </h5>
  );
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).map((entry) => (typeof entry === 'string' ? entry : ''));
}

function itemsOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/** The name an item goes by in the editor, in announcements and in a delete confirmation. */
function itemTitle(item: unknown, field: ListFieldSpec, index: number): string {
  const fallback = `${field.itemLabel} ${index + 1}`;
  if (field.titleField === undefined || !isPlainObject(item)) return fallback;
  const title = item[field.titleField];
  return typeof title === 'string' && !isBlank(title) ? title : fallback;
}

/**
 * Has the owner put anything in here worth a confirmation before it goes? A generated slug
 * does not count — it was derived, never typed — and neither does a select, which always
 * holds one of its options whether or not anyone chose it.
 */
function isEmptyValue(value: unknown, field: FieldSpec): boolean {
  switch (field.kind) {
    case 'text':
      return typeof value !== 'string' || isBlank(value);
    case 'select':
      return true;
    case 'paragraphs':
    case 'strings':
      return stringsOf(value).every((entry) => isBlank(entry));
    case 'photo': {
      const photo = value as PhotoContent | undefined;
      if (photo === undefined || photo === null) return true;
      return photo.image === null && (typeof photo.caption !== 'string' || isBlank(photo.caption));
    }
    case 'group':
      return isEmptyRecord(value, field.fields);
    case 'list':
      return itemsOf(value).length === 0;
  }
}

function isEmptyRecord(value: unknown, fields: FieldMap, skipKey?: string): boolean {
  const record = isPlainObject(value) ? value : {};
  return Object.entries(fields).every(
    ([key, field]) => key === skipKey || isEmptyValue(record[key], field),
  );
}

/** A slug no sibling has yet: `broadway-dock`, then `broadway-dock-2`, … */
function uniqueSlug(name: string, items: readonly unknown[], slugField: string): string {
  const taken = new Set(
    items.flatMap((item) => {
      const slug = isPlainObject(item) ? item[slugField] : undefined;
      return typeof slug === 'string' ? [slug] : [];
    }),
  );
  const base = slugify(name);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Leaf controls
// ---------------------------------------------------------------------------

/** A list of paragraphs or of short lines: the same rows, one wrapping and one not. */
function StringListField({
  path,
  field,
  value,
  onChange,
  context,
}: {
  readonly path: string;
  readonly field: ParagraphsFieldSpec | StringsFieldSpec;
  readonly value: unknown;
  readonly onChange: ValueHandler;
  readonly context: FieldContext;
}) {
  const entries = stringsOf(value);
  const multiline = field.kind === 'paragraphs';
  const noun = multiline ? 'Paragraph' : field.itemLabel;
  const lowerNoun = noun.toLowerCase();

  function nameOf(index: number): string {
    const entry = entries[index] ?? '';
    return isBlank(entry) ? `${noun} ${index + 1}` : `“${entry.trim().slice(0, 40)}”`;
  }

  function update(index: number, text: string) {
    const next = [...entries];
    next[index] = text;
    onChange(next, `${path}[${index}]`);
  }

  function move(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= entries.length) return;
    const next = [...entries];
    const moved = next.splice(from, 1);
    next.splice(to, 0, ...moved);
    onChange(next);
    const same = direction === -1 ? 'up' : 'down';
    const opposite = direction === -1 ? 'down' : 'up';
    focusSoon([
      `move-${same}-${path}[${to}]`,
      `move-${opposite}-${path}[${to}]`,
      `field-${path}[${to}]`,
    ]);
    context.announce(`${nameOf(from)} moved to ${lowerNoun} ${to + 1} of ${entries.length}.`);
  }

  function remove(index: number) {
    const name = nameOf(index);
    onChange(entries.filter((_, position) => position !== index));
    focusSoon([`field-${path}[${index}]`, `field-${path}[${index - 1}]`, `field-${path}`]);
    context.announce(`${name} removed — Undo can bring it back.`);
  }

  function add() {
    onChange([...entries, '']);
    focusSoon(`field-${path}[${entries.length}]`);
  }

  return (
    <div
      id={`field-${path}`}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${path}-label`}
      className="rounded-2xl bg-parchment/60 p-4 ring-1 ring-bark/10"
    >
      <p id={`${path}-label`} className={SUBLABEL_CLASS}>
        {field.label}
      </p>
      {field.hint ? <p className={HINT_CLASS}>{field.hint}</p> : null}

      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-bark/70">
          {`Nothing here yet — add the first ${lowerNoun}.`}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry, index) => (
            // Keyed by position: these are plain strings with no id of their own, and the row
            // holds no state that has to follow a reorder.
            <li key={index} className={multiline ? undefined : 'flex items-center gap-2'}>
              {multiline ? (
                <div className="rounded-xl bg-snow p-3 ring-1 ring-bark/10">
                  <TextAreaField
                    id={`field-${path}[${index}]`}
                    label={`${noun} ${index + 1}`}
                    value={entry}
                    onChange={(text) => update(index, text)}
                  />
                  <div className="mt-2 flex justify-end gap-1.5">
                    <IconButton
                      icon="up"
                      id={`move-up-${path}[${index}]`}
                      label={`Move ${noun.toLowerCase()} ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      icon="down"
                      id={`move-down-${path}[${index}]`}
                      label={`Move ${noun.toLowerCase()} ${index + 1} down`}
                      disabled={index === entries.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      icon="remove"
                      label={`Remove ${noun.toLowerCase()} ${index + 1}`}
                      onClick={() => remove(index)}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <TextField
                    id={`field-${path}[${index}]`}
                    label={`${field.label}: ${noun} ${index + 1}`}
                    hideLabel
                    value={entry}
                    onChange={(text) => update(index, text)}
                    placeholder={`${noun} ${index + 1}`}
                    className="flex-1"
                  />
                  <IconButton
                    icon="up"
                    id={`move-up-${path}[${index}]`}
                    label={`Move ${lowerNoun} ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <IconButton
                    icon="down"
                    id={`move-down-${path}[${index}]`}
                    label={`Move ${lowerNoun} ${index + 1} down`}
                    disabled={index === entries.length - 1}
                    onClick={() => move(index, 1)}
                  />
                  <IconButton
                    icon="remove"
                    label={`Remove ${lowerNoun} ${index + 1}`}
                    onClick={() => remove(index)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ActionButton variant="subtle" size="sm" className="mt-3" onClick={add}>
        {`+ Add a ${lowerNoun}`}
      </ActionButton>
    </div>
  );
}

/** A repeatable record: dock cards, feature cards, questions. */
function ListField({
  path,
  field,
  value,
  onChange,
  depth,
  context,
}: {
  readonly path: string;
  readonly field: ListFieldSpec;
  readonly value: unknown;
  readonly onChange: ValueHandler;
  readonly depth: number;
  readonly context: FieldContext;
}) {
  const items = itemsOf(value);
  const [newName, setNewName] = useState('');
  const lowerLabel = field.itemLabel.toLowerCase();
  const atMax = field.max !== undefined && items.length >= field.max;
  /** With a slug the add form is the only safe route in — see `addNamed`. */
  const slugField = field.slugField;
  const titleField = field.titleField;
  const firstKey = titleField ?? Object.keys(field.item)[0];

  function replace(index: number, item: unknown, coalesceKey?: string) {
    const next = [...items];
    next[index] = item;
    onChange(next, coalesceKey);
  }

  function move(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= items.length) return;
    const title = itemTitle(items[from], field, from);
    const next = [...items];
    const moved = next.splice(from, 1);
    next.splice(to, 0, ...moved);
    onChange(next);
    const same = direction === -1 ? 'up' : 'down';
    const opposite = direction === -1 ? 'down' : 'up';
    focusSoon([
      `move-${same}-${path}[${to}]`,
      `move-${opposite}-${path}[${to}]`,
      `field-${path}[${to}]`,
    ]);
    context.announce(`${title} moved to ${lowerLabel} ${to + 1} of ${items.length}.`);
  }

  function remove(index: number) {
    const title = itemTitle(items[index], field, index);
    const drop = () => {
      onChange(items.filter((_, position) => position !== index));
      focusSoon([`field-${path}[${index}]`, `field-${path}[${index - 1}]`, `field-${path}`]);
      context.announce(`${title} removed — Undo can bring it back.`);
    };

    // Nothing typed in it yet: taking it away loses no work, so it just goes.
    if (isEmptyRecord(items[index], field.item, slugField)) {
      drop();
      return;
    }
    context.requestConfirm({
      title: `Delete “${title}”?`,
      body: `It comes off the page along with everything written in it. Undo can bring it back before you publish.`,
      confirmLabel: `Delete ${lowerLabel}`,
      tone: 'danger',
      onConfirm: () => {
        context.closeConfirm();
        drop();
      },
    });
  }

  function focusNewItem(index: number) {
    focusSoon(
      firstKey === undefined
        ? `field-${path}[${index}]`
        : [`field-${path}[${index}].${firstKey}`, `field-${path}[${index}]`],
    );
  }

  /**
   * The slug route. A blank item would carry a blank id, which the structural parser rejects
   * outright — the document would stop rendering the moment it was added. So the name comes
   * first, the slug is derived from it and de-duplicated, and only then does the item exist.
   */
  function addNamed() {
    const name = newName.trim();
    if (name === '' || atMax) return;
    const item = emptyFields(field.item);
    if (titleField !== undefined) item[titleField] = name;
    if (slugField !== undefined) item[slugField] = uniqueSlug(name, items, slugField);
    onChange([...items, item]);
    setNewName('');
    focusNewItem(items.length);
    context.announce(`${name} added.`);
  }

  function addBlank() {
    if (atMax) return;
    onChange([...items, emptyFields(field.item)]);
    focusNewItem(items.length);
    context.announce(`${field.itemLabel} ${items.length + 1} added — fill it in.`);
  }

  return (
    <div
      id={`field-${path}`}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${path}-heading`}
      className="rounded-2xl bg-parchment/60 p-4 ring-1 ring-bark/10"
    >
      <Heading depth={depth} id={`${path}-heading`}>
        {field.label}
      </Heading>
      {field.hint ? <p className={HINT_CLASS}>{field.hint}</p> : null}

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-bark/70">
          {`Nothing here yet — add the first ${lowerLabel}.`}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((item, index) => {
            const title = itemTitle(item, field, index);
            const record = isPlainObject(item) ? item : {};
            return (
              // Keyed by the slug where there is one, so per-item state follows the item
              // rather than the position; by position otherwise, as the menu items do.
              <li
                key={
                  slugField !== undefined && typeof record[slugField] === 'string'
                    ? `${record[slugField]}`
                    : index
                }
                id={`field-${path}[${index}]`}
                tabIndex={-1}
                className="rounded-2xl bg-snow p-4 shadow-card ring-1 ring-bark/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Heading depth={depth + 1} id={`${path}[${index}]-heading`}>
                    <span className="text-xs font-bold tracking-[0.16em] text-wood uppercase">
                      {`${field.itemLabel} ${index + 1} of ${items.length}`}
                    </span>
                    <span className="mt-0.5 block">{title}</span>
                  </Heading>
                  <div className="flex items-center gap-1.5">
                    <IconButton
                      icon="up"
                      id={`move-up-${path}[${index}]`}
                      label={`Move ${title} earlier`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      icon="down"
                      id={`move-down-${path}[${index}]`}
                      label={`Move ${title} later`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      icon="remove"
                      label={`Delete ${title}`}
                      onClick={() => remove(index)}
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-4">
                  {Object.entries(field.item).map(([key, child]) => (
                    <FieldNode
                      key={key}
                      path={`${path}[${index}].${key}`}
                      field={child}
                      value={record[key]}
                      depth={depth + 2}
                      context={context}
                      onChange={(next, coalesceKey) =>
                        replace(index, { ...record, [key]: next }, coalesceKey)
                      }
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {atMax ? (
        <p className="mt-3 text-sm text-bark/70">
          {`That is as many as this part of the page holds. Remove a ${lowerLabel} to make room for another.`}
        </p>
      ) : slugField !== undefined || titleField !== undefined ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border-2 border-dashed border-bark/20 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            addNamed();
          }}
        >
          <TextField
            id={`add-${path}`}
            label={`New ${lowerLabel} name`}
            value={newName}
            onChange={setNewName}
            onKeyDown={stopUndoRedoPropagation}
            placeholder={`New ${lowerLabel} name`}
            className="min-w-48 flex-1"
          />
          <ActionButton variant="secondary" size="sm" onClick={addNamed}>
            {`Add ${lowerLabel}`}
          </ActionButton>
        </form>
      ) : (
        <ActionButton variant="subtle" size="sm" className="mt-3" onClick={addBlank}>
          {`+ Add a ${lowerLabel}`}
        </ActionButton>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

function FieldNode({
  path,
  field,
  value,
  onChange,
  depth,
  context,
}: {
  readonly path: string;
  readonly field: FieldSpec;
  readonly value: unknown;
  readonly onChange: ValueHandler;
  readonly depth: number;
  readonly context: FieldContext;
}) {
  switch (field.kind) {
    case 'text': {
      const text = typeof value === 'string' ? value : '';
      const label = field.optional === true ? `${field.label} (optional)` : field.label;
      if (field.multiline === true) {
        return (
          <TextAreaField
            id={`field-${path}`}
            label={label}
            hint={field.hint}
            value={text}
            onChange={(next) => onChange(next, path)}
          />
        );
      }
      return (
        <div>
          <TextField
            id={`field-${path}`}
            label={label}
            value={text}
            onChange={(next) => onChange(next, path)}
          />
          {field.hint ? <p className={HINT_CLASS}>{field.hint}</p> : null}
        </div>
      );
    }

    case 'select': {
      const current = typeof value === 'string' ? value : '';
      return (
        <div>
          <label htmlFor={`field-${path}`} className={`mb-1 ${LABEL_CLASS}`}>
            {field.label}
          </label>
          <select
            id={`field-${path}`}
            value={current}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-bark/20 bg-snow px-3 py-2 font-semibold text-bark shadow-press transition-colors duration-150 hover:border-bark/35 focus:border-blueberry"
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {field.hint ? <p className={HINT_CLASS}>{field.hint}</p> : null}
        </div>
      );
    }

    case 'paragraphs':
    case 'strings':
      return (
        <StringListField
          path={path}
          field={field}
          value={value}
          onChange={onChange}
          context={context}
        />
      );

    case 'photo': {
      const photo: PhotoContent = isPlainObject(value)
        ? {
            caption: typeof value.caption === 'string' ? value.caption : '',
            image: isPlainObject(value.image)
              ? {
                  id: typeof value.image.id === 'string' ? value.image.id : '',
                  width: typeof value.image.width === 'number' ? value.image.width : 0,
                  height: typeof value.image.height === 'number' ? value.image.height : 0,
                }
              : null,
          }
        : { caption: '', image: null };
      return (
        <PhotoField
          path={path}
          label={field.label}
          hint={field.hint}
          value={photo}
          onChange={(next, coalesceKey) => onChange(next, coalesceKey)}
          readOnly={context.readOnly}
          announce={context.announce}
        />
      );
    }

    case 'group': {
      const record = isPlainObject(value) ? value : {};
      return (
        <section
          id={`field-${path}`}
          tabIndex={-1}
          aria-labelledby={`${path}-heading`}
          className={
            depth === 0
              ? 'rounded-3xl bg-snow p-5 shadow-card ring-1 ring-bark/10 sm:p-6'
              : 'rounded-2xl bg-parchment/60 p-4 ring-1 ring-bark/10'
          }
        >
          <Heading depth={depth} id={`${path}-heading`}>
            {field.label}
          </Heading>
          {field.hint ? <p className={HINT_CLASS}>{field.hint}</p> : null}
          <div className="mt-4 space-y-4">
            {Object.entries(field.fields).map(([key, child]) => (
              <FieldNode
                key={key}
                path={`${path}.${key}`}
                field={child}
                value={record[key]}
                depth={depth + 1}
                context={context}
                onChange={(next, coalesceKey) =>
                  onChange({ ...record, [key]: next }, coalesceKey)
                }
              />
            ))}
          </div>
        </section>
      );
    }

    case 'list':
      return (
        <ListField
          path={path}
          field={field}
          value={value}
          onChange={onChange}
          depth={depth}
          context={context}
        />
      );
  }
}

export interface SchemaFieldsProps<T> {
  readonly spec: DocumentSpec;
  readonly document: T;
  readonly onChange: (next: T, coalesceKey?: string) => void;
  readonly readOnly: boolean;
  readonly announce: (text: string) => void;
  readonly requestConfirm: (request: ConfirmRequest) => void;
  readonly closeConfirm: () => void;
}

export function SchemaFields<T extends object>({
  spec,
  document,
  onChange,
  readOnly,
  announce,
  requestConfirm,
  closeConfirm,
}: SchemaFieldsProps<T>) {
  // The walk is driven by the spec, not by the document's type: the two casts here are the
  // one place the typed document meets the untyped tree, and `parse` upstream is what
  // guarantees the shape they assume.
  const record = document as unknown as Record<string, unknown>;
  const context: FieldContext = { readOnly, announce, requestConfirm, closeConfirm };

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-6">
      <legend className="sr-only">The words on this page</legend>
      {Object.entries(spec.fields).map(([key, field]) => (
        <FieldNode
          key={key}
          path={key}
          field={field}
          value={record[key]}
          depth={0}
          context={context}
          onChange={(next, coalesceKey) =>
            onChange({ ...record, [key]: next } as unknown as T, coalesceKey)
          }
        />
      ))}
    </fieldset>
  );
}
