/**
 * The menu document's operations: every control in the menu editor dispatches through one of
 * these. Each takes a `MenuContent` and returns a new one (or the input, unchanged, when the
 * addressed section/item does not exist), so the history reducer in `editor-state.ts` stays
 * pure and each operation is trivially unit-testable.
 *
 * The menu's shape is bespoke, so its editing verbs are too — the other documents are edited
 * generically through their field spec.
 */

import { menuPageCopy } from '@/lib/default-menu';
import type {
  MenuContent,
  MenuItemContent,
  MenuPageCopy,
  MenuSectionContent,
} from '@/lib/menu-content';
import { slugify } from '@/lib/menu-content';

/** Sections and item totals, for the publish confirmation summary. */
export function countMenu(menu: MenuContent): { readonly sections: number; readonly items: number } {
  return {
    sections: menu.sections.length,
    items: menu.sections.reduce((total, section) => total + section.items.length, 0),
  };
}

function moveInArray<T>(list: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const moved = next.splice(from, 1)[0];
  if (moved === undefined) return list;
  next.splice(to, 0, moved);
  return next;
}

/** Rebuilds an item, dropping an empty description so the stored JSON stays clean. */
function buildItem(name: string, description: string | undefined): MenuItemContent {
  return description === undefined || description === '' ? { name } : { name, description };
}

interface SectionShape {
  readonly id: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly items: readonly MenuItemContent[];
  readonly toppings: readonly string[] | undefined;
  readonly highlight: boolean | undefined;
}

/** Rebuilds a section, omitting every optional key that is unset — same shape as the seed. */
function buildSection(shape: SectionShape): MenuSectionContent {
  return {
    id: shape.id,
    name: shape.name,
    ...(shape.description !== undefined && shape.description !== ''
      ? { description: shape.description }
      : {}),
    items: shape.items,
    ...(shape.toppings !== undefined ? { toppings: shape.toppings } : {}),
    ...(shape.highlight !== undefined ? { highlight: shape.highlight } : {}),
  };
}

function toShape(section: MenuSectionContent): SectionShape {
  return {
    id: section.id,
    name: section.name,
    description: section.description,
    items: section.items,
    toppings: section.toppings,
    highlight: section.highlight,
  };
}

function withSection(
  menu: MenuContent,
  index: number,
  update: (shape: SectionShape) => SectionShape,
): MenuContent {
  const section = menu.sections[index];
  if (!section) return menu;
  const sections = [...menu.sections];
  sections[index] = buildSection(update(toShape(section)));
  return { ...menu, sections };
}

/** A slug not used by any existing section: `baked-goods`, then `baked-goods-2`, … */
function uniqueSectionId(name: string, existing: readonly MenuSectionContent[]): string {
  const taken = new Set(existing.map((section) => section.id));
  const base = slugify(name);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** New section at the end, id slugified from the name and de-duplicated. Starts empty. */
export function addSection(menu: MenuContent, name: string): MenuContent {
  const section: MenuSectionContent = {
    id: uniqueSectionId(name, menu.sections),
    name,
    items: [],
  };
  return { ...menu, sections: [...menu.sections, section] };
}

export function renameSection(menu: MenuContent, index: number, name: string): MenuContent {
  return withSection(menu, index, (shape) => ({ ...shape, name }));
}

export function setSectionDescription(
  menu: MenuContent,
  index: number,
  description: string,
): MenuContent {
  return withSection(menu, index, (shape) => ({
    ...shape,
    description: description === '' ? undefined : description,
  }));
}

/**
 * "Show in home-page highlights". The data default is highlighted, so the key is dropped when
 * on and written as `highlight: false` when off — the exact convention the seed uses.
 */
export function setSectionHighlight(menu: MenuContent, index: number, shown: boolean): MenuContent {
  return withSection(menu, index, (shape) => ({
    ...shape,
    highlight: shown ? undefined : false,
  }));
}

/**
 * "Featured card with topping chips". On: keeps (or creates) the toppings list, which marks
 * the section as the full-width feature card. Off: removes the list entirely.
 */
export function setSectionFeatured(menu: MenuContent, index: number, featured: boolean): MenuContent {
  return withSection(menu, index, (shape) => ({
    ...shape,
    toppings: featured ? (shape.toppings ?? []) : undefined,
  }));
}

export function moveSection(menu: MenuContent, from: number, to: number): MenuContent {
  const sections = moveInArray(menu.sections, from, to);
  return sections === menu.sections ? menu : { ...menu, sections };
}

export function removeSection(menu: MenuContent, index: number): MenuContent {
  if (!menu.sections[index]) return menu;
  return { ...menu, sections: menu.sections.filter((_, i) => i !== index) };
}

/** New item at the end of the section, blank — the validator prompts for a name until typed. */
export function addItem(menu: MenuContent, sectionIndex: number): MenuContent {
  return withSection(menu, sectionIndex, (shape) => ({
    ...shape,
    items: [...shape.items, { name: '' }],
  }));
}

export function updateItem(
  menu: MenuContent,
  sectionIndex: number,
  itemIndex: number,
  patch: { readonly name?: string; readonly description?: string },
): MenuContent {
  return withSection(menu, sectionIndex, (shape) => {
    const item = shape.items[itemIndex];
    if (!item) return shape;
    const items = [...shape.items];
    items[itemIndex] = buildItem(patch.name ?? item.name, patch.description ?? item.description);
    return { ...shape, items };
  });
}

export function removeItem(menu: MenuContent, sectionIndex: number, itemIndex: number): MenuContent {
  return withSection(menu, sectionIndex, (shape) => ({
    ...shape,
    items: shape.items.filter((_, i) => i !== itemIndex),
  }));
}

export function moveItem(
  menu: MenuContent,
  sectionIndex: number,
  from: number,
  to: number,
): MenuContent {
  return withSection(menu, sectionIndex, (shape) => ({
    ...shape,
    items: moveInArray(shape.items, from, to),
  }));
}

/** Moves an item to the end of another section. */
export function moveItemToSection(
  menu: MenuContent,
  fromSection: number,
  itemIndex: number,
  toSection: number,
): MenuContent {
  if (fromSection === toSection) return menu;
  const item = menu.sections[fromSection]?.items[itemIndex];
  if (!item || !menu.sections[toSection]) return menu;
  const removed = withSection(menu, fromSection, (shape) => ({
    ...shape,
    items: shape.items.filter((_, i) => i !== itemIndex),
  }));
  return withSection(removed, toSection, (shape) => ({
    ...shape,
    items: [...shape.items, item],
  }));
}

export function addTopping(menu: MenuContent, sectionIndex: number, text: string): MenuContent {
  return withSection(menu, sectionIndex, (shape) => ({
    ...shape,
    toppings: [...(shape.toppings ?? []), text],
  }));
}

export function updateTopping(
  menu: MenuContent,
  sectionIndex: number,
  toppingIndex: number,
  text: string,
): MenuContent {
  return withSection(menu, sectionIndex, (shape) => {
    const toppings = [...(shape.toppings ?? [])];
    if (toppingIndex < 0 || toppingIndex >= toppings.length) return shape;
    toppings[toppingIndex] = text;
    return { ...shape, toppings };
  });
}

export function removeTopping(
  menu: MenuContent,
  sectionIndex: number,
  toppingIndex: number,
): MenuContent {
  return withSection(menu, sectionIndex, (shape) => ({
    ...shape,
    toppings: (shape.toppings ?? []).filter((_, i) => i !== toppingIndex),
  }));
}

export function moveTopping(
  menu: MenuContent,
  sectionIndex: number,
  from: number,
  to: number,
): MenuContent {
  return withSection(menu, sectionIndex, (shape) => ({
    ...shape,
    toppings: shape.toppings === undefined ? shape.toppings : moveInArray(shape.toppings, from, to),
  }));
}

export function setIntro(menu: MenuContent, intro: string): MenuContent {
  return { ...menu, intro };
}

export function setSpecialsNote(menu: MenuContent, specialsNote: string): MenuContent {
  return { ...menu, specialsNote };
}

/** The single-line fields of the page wording that the menu editor draws by hand. */
export type MenuPageTextKey = 'eyebrow' | 'specialsTitle' | 'specialsLead' | 'sectionsTitle';

/**
 * Replaces the page wording. A menu that predates it starts from the wording the site shows
 * today (the default's), so the first edit writes the whole block, never a partial one.
 */
export function setPage(menu: MenuContent, page: MenuPageCopy): MenuContent {
  return { ...menu, page };
}

export function setPageText(menu: MenuContent, key: MenuPageTextKey, value: string): MenuContent {
  return setPage(menu, { ...menuPageCopy(menu), [key]: value });
}
