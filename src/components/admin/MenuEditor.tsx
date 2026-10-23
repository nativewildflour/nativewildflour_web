'use client';

/**
 * The menu editor: the fields for the bespoke menu document, wired to the shared editor core.
 *
 * `useDocumentEditor` holds every piece of state (load, history, draft, validation, publish,
 * restore) and `DocumentEditorFrame` draws the chrome around it, so what lives here is what is
 * genuinely about menus — the section and item controls, their focus and announcements, and
 * the path labels the issues panel reads out.
 *
 * The same screen edits the words around the menu on `/menu/` (the document's `page` block),
 * laid out in the order the page prints them. Its single lines are drawn here like the rest of
 * the menu's fields; the "Good to know" notes are a repeatable list, so `SchemaFields` draws
 * them from the block's field spec — the same list controls the page editors use.
 */

import { useState } from 'react';

import type { DocumentParser } from '@/components/admin/api';
import { ActionButton } from '@/components/admin/buttons';
import { DocumentEditorFrame } from '@/components/admin/DocumentEditorFrame';
import { stopUndoRedoPropagation, TextAreaField, TextField } from '@/components/admin/fields';
import type { TextFieldProps } from '@/components/admin/fields';
import * as ops from '@/components/admin/menu-ops';
import { countMenu } from '@/components/admin/menu-ops';
import type { MenuPageTextKey } from '@/components/admin/menu-ops';
import { PreviewPane } from '@/components/admin/PreviewPane';
import { SchemaFields } from '@/components/admin/SchemaFields';
import type { SectionActions } from '@/components/admin/SectionEditor';
import { SectionEditor } from '@/components/admin/SectionEditor';
import { focusSoon, useDocumentEditor } from '@/components/admin/use-document-editor';
import type { DocumentSpec } from '@/lib/content-schema';
import { describeSpecPath } from '@/lib/content-schema';
import { DEFAULT_MENU, menuPageCopy } from '@/lib/default-menu';
import type { MenuContent } from '@/lib/menu-content';
import {
  MENU_PAGE_FIELDS,
  MENU_PRICE_NOTE,
  parseMenuContent,
  slugify,
  validateMenu,
  validateMenuCopy,
} from '@/lib/menu-content';

/** The menu's structural check, in the shape the editor core asks for. */
const parseMenu: DocumentParser<MenuContent> = (value) => {
  const { menu, errors } = parseMenuContent(value);
  return { document: menu, errors };
};

/** First sentence of the publish confirmation — for a menu, the counts say the most. */
function summarizeMenu(menu: MenuContent): string {
  const { sections, items } = countMenu(menu);
  return `${sections === 1 ? '1 section' : `${sections} sections`} and ${
    items === 1 ? '1 item' : `${items} items`
  } go live on the site.`;
}

/** The page wording as a spec of its own, for naming the fields an issue points at. */
const PAGE_SPEC: DocumentSpec = { fields: MENU_PAGE_FIELDS };

/** The one part of the page wording `SchemaFields` draws: the "Good to know" card. */
const GOOD_TO_KNOW_SPEC: DocumentSpec = { fields: { goodToKnow: MENU_PAGE_FIELDS.goodToKnow } };

const PAGE_PREFIX = 'page.';

/** `sections[2].items[0].name` → a label the owner can read, e.g. `House-Baked Goods · item 1 · name`. */
function describeMenuPath(menu: MenuContent, path: string): string {
  if (path === '') return 'Menu';
  if (path === 'page') return 'Menu page wording';
  if (path.startsWith(PAGE_PREFIX)) {
    return describeSpecPath(PAGE_SPEC, menuPageCopy(menu), path.slice(PAGE_PREFIX.length));
  }
  if (path === 'intro') return 'Menu intro';
  if (path === 'specialsNote') return 'Specials note';
  if (path === 'sections') return 'Sections';

  const match = path.match(/^sections\[(\d+)\](.*)$/);
  if (!match) return path;
  const index = Number(match[1] ?? 0);
  const rest = match[2] ?? '';
  const section = menu.sections[index];
  const sectionLabel = section?.name.trim() ? section.name : `Section ${index + 1}`;
  if (rest === '') return sectionLabel;

  const item = rest.match(/^\.items\[(\d+)\](\.(\w+))?$/);
  if (item) {
    const itemLabel = `item ${Number(item[1] ?? 0) + 1}`;
    return item[3] ? `${sectionLabel} · ${itemLabel} · ${item[3]}` : `${sectionLabel} · ${itemLabel}`;
  }
  const topping = rest.match(/^\.toppings\[(\d+)\]$/);
  if (topping) return `${sectionLabel} · topping ${Number(topping[1] ?? 0) + 1}`;
  if (rest === '.items') return `${sectionLabel} · items`;
  if (rest === '.id') return `${sectionLabel} · anchor id`;
  return `${sectionLabel} · ${rest.replace(/^\./, '')}`;
}

export function MenuEditor() {
  const editor = useDocumentEditor<MenuContent>({
    doc: 'menu',
    label: 'menu',
    seed: DEFAULT_MENU,
    parse: parseMenu,
    validate: validateMenuCopy,
    summarize: summarizeMenu,
  });
  const { announce, applyEdit, closeConfirm, requestConfirm, rules } = editor;
  const menu = editor.present;

  const page = menuPageCopy(menu);

  /**
   * Props for one hand-drawn line of the page wording: label, hint and id from its spec, the
   * hint drawn and linked to the field as `SchemaFields` does it.
   */
  function pageText(key: MenuPageTextKey): TextFieldProps {
    const field = MENU_PAGE_FIELDS[key];
    return {
      id: `field-page.${key}`,
      label: 'optional' in field && field.optional ? `${field.label} (optional)` : field.label,
      hint: 'hint' in field ? field.hint : undefined,
      value: page[key],
      onChange: (value) => applyEdit(ops.setPageText(menu, key, value), `page.${key}`),
    };
  }

  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionError, setNewSectionError] = useState<string | null>(null);

  function sectionActions(index: number): SectionActions {
    const section = menu.sections[index];
    const label = section?.name.trim() || `section ${index + 1}`;
    return {
      rename: (value) => applyEdit(ops.renameSection(menu, index, value), `sections[${index}].name`),
      describe: (value) =>
        applyEdit(ops.setSectionDescription(menu, index, value), `sections[${index}].description`),
      setHighlight: (shown) => applyEdit(ops.setSectionHighlight(menu, index, shown)),
      setFeatured: (on) => applyEdit(ops.setSectionFeatured(menu, index, on)),
      move: (direction) => {
        const to = index + direction;
        if (!menu.sections[to]) return;
        applyEdit(ops.moveSection(menu, index, to));
        // Refocus the same-direction button where the section landed (ids are positional,
        // so the moved section now owns them); at a list edge it is disabled and focus
        // falls through to the opposite button, then the name field.
        const same = direction === -1 ? 'up' : 'down';
        const opposite = direction === -1 ? 'down' : 'up';
        focusSoon([
          `move-${same}-sections[${to}]`,
          `move-${opposite}-sections[${to}]`,
          `field-sections[${to}].name`,
        ]);
        announce(`${label} moved to section ${to + 1} of ${menu.sections.length}.`);
      },
      remove: () =>
        requestConfirm({
          title: `Delete “${label}”?`,
          body:
            section && section.items.length > 0
              ? `The section and its ${section.items.length === 1 ? 'one item' : `${section.items.length} items`} come off the menu. Undo can bring it back before you publish.`
              : 'The empty section comes off the menu. Undo can bring it back before you publish.',
          confirmLabel: 'Delete section',
          tone: 'danger',
          onConfirm: () => {
            closeConfirm();
            applyEdit(ops.removeSection(menu, index));
            // The confirm button (and the dialog's opener) is gone with the section, so
            // land on the neighbor that slid into this slot, else the one before, else
            // the add-section field.
            focusSoon([
              `field-sections[${index}]`,
              `field-sections[${index - 1}]`,
              'field-sections',
            ]);
            announce(`${label} removed from the menu — Undo can bring it back.`);
          },
        }),
      addItem: () => {
        const itemCount = menu.sections[index]?.items.length ?? 0;
        applyEdit(ops.addItem(menu, index));
        focusSoon(`field-sections[${index}].items[${itemCount}].name`);
      },
      itemName: (itemIndex, value) =>
        applyEdit(
          ops.updateItem(menu, index, itemIndex, { name: value }),
          `sections[${index}].items[${itemIndex}].name`,
        ),
      itemDescription: (itemIndex, value) =>
        applyEdit(
          ops.updateItem(menu, index, itemIndex, { description: value }),
          `sections[${index}].items[${itemIndex}].description`,
        ),
      moveItem: (from, to) => {
        const items = menu.sections[index]?.items ?? [];
        const item = items[from];
        if (!item || to < 0 || to >= items.length) return;
        applyEdit(ops.moveItem(menu, index, from, to));
        const same = to < from ? 'up' : 'down';
        const opposite = to < from ? 'down' : 'up';
        focusSoon([
          `move-${same}-sections[${index}].items[${to}]`,
          `move-${opposite}-sections[${index}].items[${to}]`,
          `field-sections[${index}].items[${to}].name`,
        ]);
        announce(`${item.name.trim() || `Item ${from + 1}`} moved to item ${to + 1} of ${items.length}.`);
      },
      removeItem: (itemIndex) => {
        const item = menu.sections[index]?.items[itemIndex];
        applyEdit(ops.removeItem(menu, index, itemIndex));
        focusSoon(`field-sections[${index}]`);
        announce(
          `${item?.name.trim() || `Item ${itemIndex + 1}`} removed from ${label} — Undo can bring it back.`,
        );
      },
      moveItemToSection: (itemIndex, target) => {
        const item = menu.sections[index]?.items[itemIndex];
        const targetSection = menu.sections[target];
        if (!item || !targetSection) return;
        applyEdit(ops.moveItemToSection(menu, index, itemIndex, target));
        focusSoon(`field-sections[${target}]`);
        announce(
          `${item.name.trim() || `Item ${itemIndex + 1}`} moved to ${targetSection.name.trim() || `section ${target + 1}`}.`,
        );
      },
      toppingAdd: (text) => applyEdit(ops.addTopping(menu, index, text)),
      toppingUpdate: (toppingIndex, text) =>
        applyEdit(
          ops.updateTopping(menu, index, toppingIndex, text),
          `sections[${index}].toppings[${toppingIndex}]`,
        ),
      toppingRemove: (toppingIndex) => {
        const topping = menu.sections[index]?.toppings?.[toppingIndex];
        applyEdit(ops.removeTopping(menu, index, toppingIndex));
        focusSoon(`field-sections[${index}]`);
        announce(
          `${topping?.trim() || `Topping ${toppingIndex + 1}`} removed from ${label} — Undo can bring it back.`,
        );
      },
      toppingMove: (from, to) => {
        const toppings = menu.sections[index]?.toppings ?? [];
        if (to < 0 || to >= toppings.length) return;
        applyEdit(ops.moveTopping(menu, index, from, to));
        const same = to < from ? 'up' : 'down';
        const opposite = to < from ? 'down' : 'up';
        focusSoon([
          `move-${same}-sections[${index}].toppings[${to}]`,
          `move-${opposite}-sections[${index}].toppings[${to}]`,
          `field-sections[${index}].toppings[${to}]`,
        ]);
        announce(
          `${toppings[from]?.trim() || `Topping ${from + 1}`} moved to topping ${to + 1} of ${toppings.length}.`,
        );
      },
    };
  }

  function addNewSection() {
    const name = newSectionName.trim();
    if (name === '') return;
    // Without the rules the probe below can't see banned words, and the id a section gets
    // here is permanent — so no section is added until they load.
    if (rules === null) {
      setNewSectionError(
        'The content rules haven’t loaded, so a new section can’t be checked yet. Reload the page and try again.',
      );
      return;
    }
    // A name that breaks the copy rules would mint a permanently rule-breaking anchor id
    // (renames never touch ids), leaving a blocked publish nothing can fix — so the
    // candidate runs through the validator in a minimal probe menu before it exists.
    const probe = {
      version: 1,
      intro: 'x',
      specialsNote: 'x',
      sections: [{ id: slugify(name), name, items: [{ name: 'x' }] }],
    };
    const blocking = validateMenu(probe, rules).issues.find(
      (issue) => issue.path === 'sections[0].name' || issue.path === 'sections[0].id',
    );
    if (blocking) {
      setNewSectionError(blocking.message);
      return;
    }
    setNewSectionError(null);
    const nextIndex = menu.sections.length;
    applyEdit(ops.addSection(menu, name));
    setNewSectionName('');
    focusSoon(`field-sections[${nextIndex}].name`);
  }

  const sectionOptions = menu.sections.map((section, index) => ({
    index,
    id: section.id,
    name: section.name,
  }));

  return (
    <DocumentEditorFrame
      editor={editor}
      describePath={(path) => describeMenuPath(menu, path)}
      preview={<PreviewPane menu={menu} />}
    >
      {/* Read-only (offline, signed out, or a store error) is one disabled fieldset, as in
          `SchemaFields`: the editor then holds the built-in menu, not the live one, so no
          control may edit it into something that looks like the owner's work. */}
      <fieldset disabled={editor.readOnly} className="min-w-0 space-y-6">
        <legend className="sr-only">The menu</legend>
        <section
          aria-labelledby="menu-copy-heading"
          className="rounded-3xl bg-snow p-5 shadow-card ring-1 ring-bark/10 sm:p-6"
        >
          <h2 id="menu-copy-heading" className="text-xl font-black text-bark">
            Top of the page
          </h2>
          <div className="mt-4 space-y-4">
            <TextField {...pageText('eyebrow')} />
            <TextAreaField
              id="field-intro"
              label="Menu intro"
              hint="The welcome under the Menu heading — a sentence or two."
              value={menu.intro}
              onChange={(value) => applyEdit(ops.setIntro(menu, value), 'intro')}
            />
            <div className="rounded-xl bg-parchment p-3 ring-1 ring-bark/10">
              <p className="text-xs font-bold tracking-[0.14em] text-wood uppercase">
                Always printed
              </p>
              <p className="mt-1 text-sm text-bark/80">
                “{MENU_PRICE_NOTE}” — this line is part of the site and isn’t editable, so
                prices never need to appear in the menu text.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="specials-heading"
          className="rounded-3xl bg-snow p-5 shadow-card ring-1 ring-bark/10 sm:p-6"
        >
          <h2 id="specials-heading" className="text-xl font-black text-bark">
            Today’s special box
          </h2>
          <p className="mt-1 text-sm text-bark/70">
            The dashed box above the menu. The Facebook button under the words is added for you.
          </p>
          <div className="mt-4 space-y-4">
            <TextField {...pageText('specialsTitle')} />
            <TextField {...pageText('specialsLead')} />
            <TextAreaField
              id="field-specialsNote"
              label="Specials note"
              hint="Follows the opening line — point people to where today’s special is posted."
              rows={2}
              value={menu.specialsNote}
              onChange={(value) => applyEdit(ops.setSpecialsNote(menu, value), 'specialsNote')}
            />
          </div>
        </section>

        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" className="text-xl font-black text-bark">
            Sections
          </h2>
          <div className="mt-4 rounded-3xl bg-snow p-5 shadow-card ring-1 ring-bark/10 sm:p-6">
            <TextField {...pageText('sectionsTitle')} />
          </div>
          <div className="mt-5 space-y-5">
            {/* Keyed by id (unique via `uniqueSectionId`): per-section local state — like an
                unsent "New topping" — follows the section, not the position. */}
            {menu.sections.map((section, index) => (
              <SectionEditor
                key={section.id}
                sectionIndex={index}
                sectionCount={menu.sections.length}
                section={section}
                sectionOptions={sectionOptions}
                actions={sectionActions(index)}
              />
            ))}
          </div>

          <form
            className="mt-5 flex flex-wrap items-end gap-2 rounded-3xl border-2 border-dashed border-bark/20 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              addNewSection();
            }}
          >
            <TextField
              id="field-sections"
              label="New section name"
              value={newSectionName}
              onChange={(value) => {
                setNewSectionName(value);
                setNewSectionError(null);
              }}
              onKeyDown={stopUndoRedoPropagation}
              placeholder="e.g. Seasonal Treats"
              className="min-w-56 flex-1"
            />
            <ActionButton variant="secondary" onClick={addNewSection}>
              Add section
            </ActionButton>
            {newSectionError ? (
              <p className="basis-full text-sm font-semibold text-fireweed-deep">
                {newSectionError}
              </p>
            ) : null}
          </form>
        </section>

        <SchemaFields
          spec={GOOD_TO_KNOW_SPEC}
          document={page}
          basePath="page"
          legend="Good to know notes"
          onChange={(next, coalesceKey) => applyEdit(ops.setPage(menu, next), coalesceKey)}
          readOnly={editor.readOnly}
          announce={announce}
          requestConfirm={requestConfirm}
          closeConfirm={closeConfirm}
        />
      </fieldset>
    </DocumentEditorFrame>
  );
}
