/**
 * Shared contract for the owner-editable menu content: structural validation of untrusted JSON
 * plus copy-rule validation (docs/BRIEF.md §2).
 *
 * This module runs in three places — the rendering server (via `src/lib/server/content.ts`),
 * the admin editor's client bundle, and the Netlify Function that stores the content — so it
 * must stay dependency-free, browser-safe, and free of Node APIs.
 *
 * The menu's *shape* is bespoke (sections of items with toppings), so its structural walk lives
 * here rather than in the `content-schema.ts` field-spec DSL the other documents use. The one
 * exception is `page` — the wording around the menu on `/menu/` — which is made of the same
 * pieces as the other pages, so the DSL describes and walks it. The copy
 * rules are not bespoke: they come from `copy-rules.ts`, the one implementation the gate, the
 * publish endpoint and every other document share. See that module for why the rules are
 * injected rather than imported.
 */

import type { FieldMap, GroupFieldSpec, SelectOption } from './content-schema';
import {
  envelopeIssues,
  fieldCopyIssues,
  fieldStructureIssues,
  fieldWithOptionalFilled,
  rejectUnknownKeys,
} from './content-schema';
import type { ContentRules, CopyIssue, RuleChecks } from './copy-rules';
import {
  SLUG,
  buildRuleChecks,
  describe,
  isBlank,
  isPlainObject,
  scanId,
  scanText,
} from './copy-rules';

// Re-exported so the admin editor and the Netlify Functions keep one import for the whole menu
// contract — the rule types travel with the validator that consumes them.
export type { ContentRules, CopyIssue } from './copy-rules';
export { slugify } from './copy-rules';

/** One menu item. The description is optional, one line, and never a price. */
export interface MenuItemContent {
  readonly name: string;
  readonly description?: string;
}

/**
 * One menu section. `id` is a stable slug: the React key, the accent colour's seed, and the
 * root of the card's DOM ids and `/menu/` anchor — namespaced as `menu--<id>` by
 * `menuSectionDomId` (`src/components/MenuSection.tsx`) so no slug can collide with a fixed id.
 */
export interface MenuSectionContent {
  readonly id: string;
  readonly name: string;
  /** Optional one-line lead-in shown under the section heading. */
  readonly description?: string;
  readonly items: readonly MenuItemContent[];
  /**
   * Topping chips rendered under the section. Presence also marks the section as the
   * full-width feature card on the menu page and in the home-page highlights.
   */
  readonly toppings?: readonly string[];
  /** Set false to leave a section out of the home page's "Menu highlights" preview. */
  readonly highlight?: boolean;
}

/** Icon names drawn by `src/components/menu/GoodToKnow.tsx`. */
export const MENU_NOTE_ICONS = ['flame', 'timer', 'bag', 'cup', 'heart', 'chat'] as const;

export type MenuNoteIcon = (typeof MENU_NOTE_ICONS)[number];

const NOTE_ICON_LABELS: Readonly<Record<MenuNoteIcon, string>> = {
  flame: 'Flame',
  timer: 'Timer',
  bag: 'Takeaway bag',
  cup: 'Coffee cup',
  heart: 'Heart',
  chat: 'Speech bubble',
};

/** Derived from the icon list, so the validator accepts exactly the icons the page can draw. */
const NOTE_ICON_OPTIONS: readonly SelectOption[] = MENU_NOTE_ICONS.map((value) => ({
  value,
  label: NOTE_ICON_LABELS[value],
}));

/** One card in the menu page's "Good to know" row. */
export interface MenuNote {
  readonly icon: MenuNoteIcon;
  readonly title: string;
  readonly body: string;
}

/**
 * The words on `/menu/` around the menu itself: the line over the page heading, the specials
 * box, the heading over the sections, and the "Good to know" notes. The page `<h1>` ("Menu") and
 * the prices card stay fixed — the first names the page everywhere else, the second is
 * rule-driven copy (docs/BRIEF.md §1).
 */
export interface MenuPageCopy {
  readonly eyebrow: string;
  readonly specialsTitle: string;
  /** Printed just before `specialsNote`, in the same paragraph. May be blank. */
  readonly specialsLead: string;
  readonly sectionsTitle: string;
  readonly goodToKnow: {
    readonly eyebrow: string;
    readonly title: string;
    readonly notes: readonly MenuNote[];
  };
}

/**
 * The page wording described in the field-spec DSL, so its checks, its issue labels and the
 * editor's "Good to know" card all come from one declaration, exactly as on the other pages.
 * The menu itself stays bespoke; only this part is spec-driven.
 *
 * Labels and hints are what the owner reads in the editor. `satisfies` rather than a type
 * annotation keeps the keys known, so the editor can read a label without an index check.
 */
export const MENU_PAGE_FIELDS = {
  eyebrow: {
    kind: 'text',
    label: 'Small line above the Menu heading',
    hint: 'A few words, printed in capitals.',
  },
  specialsTitle: { kind: 'text', label: 'Specials box heading' },
  specialsLead: {
    kind: 'text',
    label: 'Specials box opening line',
    hint: 'Printed just before the specials note, in the same paragraph.',
    optional: true,
  },
  sectionsTitle: {
    kind: 'text',
    label: 'Heading above the sections',
    hint: 'Printed over the section cards on the menu page.',
  },
  goodToKnow: {
    kind: 'group',
    label: 'Good to know',
    hint: 'The practical notes at the foot of the menu page. A “Prices at the counter” card always closes the row — it is part of the site and isn’t edited here.',
    fields: {
      eyebrow: { kind: 'text', label: 'Small line above the heading' },
      title: { kind: 'text', label: 'Heading' },
      notes: {
        kind: 'list',
        label: 'Notes',
        itemLabel: 'Note',
        titleField: 'title',
        max: 5,
        item: {
          icon: { kind: 'select', label: 'Icon', options: NOTE_ICON_OPTIONS },
          title: { kind: 'text', label: 'Note heading' },
          body: { kind: 'text', label: 'Note text', multiline: true },
        },
      },
    },
  },
} satisfies FieldMap;

/** The whole wording block as one field, for the structural and copy walks. */
const MENU_PAGE_FIELD: GroupFieldSpec = {
  kind: 'group',
  label: 'Menu page wording',
  fields: MENU_PAGE_FIELDS,
};

/** The whole owner-editable menu document, as stored in the `site-content` blob store. */
export interface MenuContent {
  readonly version: 1;
  /** ISO 8601 timestamp, set by the publish endpoint on save; the committed default omits it. */
  readonly updatedAt?: string;
  readonly intro: string;
  readonly specialsNote: string;
  /**
   * Optional because menus published before it existed have no such key: those keep loading,
   * and the page falls back to the committed default's wording (see `menuPageCopy`).
   */
  readonly page?: MenuPageCopy;
  readonly sections: readonly MenuSectionContent[];
}

/**
 * The specials box's one paragraph: the opening line, when there is one, then the note. Lives
 * here rather than in the component so the validator scans exactly the string the page prints —
 * a banned word, a price or an hours claim split across the two fields is still one sentence.
 */
export function specialsText(lead: string, note: string): string {
  const opening = lead.trim();
  return opening === '' ? note : `${opening} ${note}`;
}

/**
 * The committed default's `page.specialsLead` (`src/data/defaults/menu.json`) — what the page
 * prints before the note for a menu saved before the page wording existed, which has no `page`
 * block of its own. Restated because this module may not import JSON; the acceptance gate checks
 * the two are identical, and `default-menu.ts` refuses to load if they are not.
 */
export const DEFAULT_SPECIALS_LEAD = 'The savory bannock special is different most days.';

/**
 * Printed near the top of the menu page and anywhere the menu is summarized. Rule-driven copy
 * (docs/BRIEF.md §1), not owner-editable — deliberately hard-coded rather than derived.
 */
export const MENU_PRICE_NOTE = 'Prices are posted at the counter.';

/**
 * The topping chips the about page lists — the first section that has any. The menu owns them,
 * so both the menu page and the about page read them from the same document. "Has any" rather
 * than "declares the key": the pages decide a section is featured by `toppings.length`, and an
 * empty list (the editor's "featured" toggle with no chips added yet) must not hide the real
 * chips in a later section.
 */
export function bannockToppings(menu: MenuContent): readonly string[] {
  return menu.sections.find((section) => (section.toppings?.length ?? 0) > 0)?.toppings ?? [];
}

function requireString(
  owner: Record<string, unknown>,
  key: string,
  path: string,
  issues: CopyIssue[],
): void {
  if (typeof owner[key] !== 'string') {
    issues.push({ path, message: `expected a string, got ${describe(owner[key])}` });
  }
}

function optionalString(
  owner: Record<string, unknown>,
  key: string,
  path: string,
  issues: CopyIssue[],
): void {
  if (owner[key] !== undefined && typeof owner[key] !== 'string') {
    issues.push({ path, message: `expected a string or nothing, got ${describe(owner[key])}` });
  }
}

/** Structural walk shared by `parseMenuContent` and `validateMenu`. */
function collectStructuralIssues(value: unknown): CopyIssue[] {
  const issues: CopyIssue[] = [];
  if (!isPlainObject(value)) {
    issues.push({ path: '', message: `expected the menu content object, got ${describe(value)}` });
    return issues;
  }

  envelopeIssues(value, ['intro', 'specialsNote', 'page', 'sections'], issues);
  requireString(value, 'intro', 'intro', issues);
  requireString(value, 'specialsNote', 'specialsNote', issues);
  // Absent is fine (an older menu); present must be whole.
  if (value.page !== undefined) {
    issues.push(...fieldStructureIssues(value.page, 'page', MENU_PAGE_FIELD));
  }

  if (!Array.isArray(value.sections)) {
    issues.push({
      path: 'sections',
      message: `expected an array of sections, got ${describe(value.sections)}`,
    });
    return issues;
  }

  const sections: readonly unknown[] = value.sections;
  sections.forEach((section, index) => {
    const base = `sections[${index}]`;
    if (!isPlainObject(section)) {
      issues.push({ path: base, message: `expected a section object, got ${describe(section)}` });
      return;
    }

    rejectUnknownKeys(section, ['id', 'name', 'description', 'items', 'toppings', 'highlight'], base, issues);
    if (typeof section.id !== 'string' || !SLUG.test(section.id)) {
      issues.push({
        path: `${base}.id`,
        message: `expected a kebab-case slug (lowercase letters, digits, hyphens), got ${describe(section.id)}`,
      });
    }
    requireString(section, 'name', `${base}.name`, issues);
    optionalString(section, 'description', `${base}.description`, issues);
    if (section.highlight !== undefined && typeof section.highlight !== 'boolean') {
      issues.push({
        path: `${base}.highlight`,
        message: `expected true or false, got ${describe(section.highlight)}`,
      });
    }

    if (section.toppings !== undefined) {
      if (!Array.isArray(section.toppings)) {
        issues.push({
          path: `${base}.toppings`,
          message: `expected an array of strings, got ${describe(section.toppings)}`,
        });
      } else {
        const toppings: readonly unknown[] = section.toppings;
        toppings.forEach((topping, toppingIndex) => {
          if (typeof topping !== 'string') {
            issues.push({
              path: `${base}.toppings[${toppingIndex}]`,
              message: `expected a string, got ${describe(topping)}`,
            });
          }
        });
      }
    }

    if (!Array.isArray(section.items)) {
      issues.push({
        path: `${base}.items`,
        message: `expected an array of items, got ${describe(section.items)}`,
      });
      return;
    }
    const items: readonly unknown[] = section.items;
    items.forEach((item, itemIndex) => {
      const itemBase = `${base}.items[${itemIndex}]`;
      if (!isPlainObject(item)) {
        issues.push({ path: itemBase, message: `expected an item object, got ${describe(item)}` });
        return;
      }
      rejectUnknownKeys(item, ['name', 'description'], itemBase, issues);
      requireString(item, 'name', `${itemBase}.name`, issues);
      optionalString(item, 'description', `${itemBase}.description`, issues);
    });
  });

  return issues;
}

/**
 * A structurally valid menu with its page wording's absent optional fields filled in as `''`,
 * the way `parseWithSpec` fills the page documents. The structural walk lets an optional text
 * field be missing (a menu saved before the field existed), but the page, its preview and the
 * editor all read every page field as a string. Never mutates its input.
 */
function withPageFilled(value: unknown): MenuContent {
  const menu = value as MenuContent;
  if (menu.page === undefined) return menu;
  const page = fieldWithOptionalFilled(menu.page, MENU_PAGE_FIELD) as MenuContent['page'];
  return page === menu.page ? menu : { ...menu, page };
}

/**
 * Structural validation of untrusted JSON. Returns the typed value, or null plus every error
 * found (each prefixed with its path label).
 */
export function parseMenuContent(value: unknown): { menu: MenuContent | null; errors: string[] } {
  const issues = collectStructuralIssues(value);
  if (issues.length > 0) {
    return {
      menu: null,
      errors: issues.map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`)),
    };
  }
  return { menu: withPageFilled(value), errors: [] };
}

/**
 * Copy-rule validation: wrong WILDFlour casing, price-like strings ($ amounts, X.XX), the
 * wrong phone number, empty names, duplicate section ids — plus, when `rules` were injected,
 * banned words, off-spec opening-hours ranges, and placeholder markers. Also flags empty
 * intro/specials-note text, a menu with no sections, and a section with no items, since each
 * would render a broken page, and two cross-page contracts: the about page needs one section
 * with toppings, the home page needs one highlighted section. The page wording, when present,
 * gets the field-spec copy walk. Each issue carries a path label like
 * `sections[2].items[0].name` or `page.goodToKnow.notes[0].title`.
 */
export function validateMenuCopy(menu: MenuContent, rules: ContentRules | null): CopyIssue[] {
  const ruleChecks: RuleChecks | null = rules === null ? null : buildRuleChecks(rules);
  const issues: CopyIssue[] = [];

  scanText(menu.intro, 'intro', issues, ruleChecks);
  if (isBlank(menu.intro)) {
    issues.push({ path: 'intro', message: 'The menu intro is empty — add a sentence or two.' });
  }
  scanText(menu.specialsNote, 'specialsNote', issues, ruleChecks);
  if (isBlank(menu.specialsNote)) {
    issues.push({ path: 'specialsNote', message: 'The specials note is empty — add a short line.' });
  }
  if (menu.page !== undefined) {
    issues.push(...fieldCopyIssues(menu.page, 'page', MENU_PAGE_FIELD, ruleChecks));
  }

  // The page prints the lead and the note as one paragraph, so scan that paragraph too — with
  // the lead the page really prints: the document's own, or, for a menu with no `page` block,
  // the default's (`DEFAULT_SPECIALS_LEAD`, the same words `menuPageCopy` resolves to). A
  // problem inside either field has already been reported against it (same message); what is
  // left only exists across the join, and is reported on the note.
  const lead = menu.page === undefined ? DEFAULT_SPECIALS_LEAD : (menu.page.specialsLead ?? '');
  const seen = new Set(
    issues
      .filter((issue) => issue.path === 'specialsNote' || issue.path === 'page.specialsLead')
      .map((issue) => issue.message),
  );
  const joined: CopyIssue[] = [];
  scanText(specialsText(lead, menu.specialsNote), 'specialsNote', joined, ruleChecks);
  for (const issue of joined) {
    if (seen.has(issue.message)) continue;
    seen.add(issue.message);
    issues.push({
      path: 'specialsNote',
      message: `Read together with the specials box opening line: ${issue.message}`,
    });
  }

  if (menu.sections.length === 0) {
    issues.push({ path: 'sections', message: 'The menu needs at least one section.' });
  }

  // Cross-page contracts (rules-independent): pages outside /menu/ render parts of this
  // document too, so removing the last of either would quietly break those pages.
  if (!menu.sections.some((section) => (section.toppings?.length ?? 0) > 0)) {
    issues.push({
      path: 'sections',
      message:
        'No section has topping chips any more — the about page lists them under "Toppings to choose from", so keep at least one section\'s toppings.',
    });
  }
  if (!menu.sections.some((section) => section.highlight !== false)) {
    issues.push({
      path: 'sections',
      message:
        'Every section is hidden from the home page — switch "Show in home-page highlights" back on for at least one.',
    });
  }

  const seenIds = new Set<string>();
  menu.sections.forEach((section, index) => {
    const base = `sections[${index}]`;

    // Ids render only as attributes (`menu--<id>` DOM ids and anchors), so they get the id scan:
    // banned words and placeholder markers, not the reading rules — a section named after the
    // cafe gets an all-lowercase id, which is fine.
    scanId(section.id, `${base}.id`, issues, ruleChecks);
    if (seenIds.has(section.id)) {
      issues.push({
        path: `${base}.id`,
        message: `Two sections share the id "${section.id}" — give each section its own.`,
      });
    }
    seenIds.add(section.id);

    scanText(section.name, `${base}.name`, issues, ruleChecks);
    if (isBlank(section.name)) {
      issues.push({ path: `${base}.name`, message: 'This section needs a name.' });
    }
    if (section.description !== undefined) {
      scanText(section.description, `${base}.description`, issues, ruleChecks);
    }

    if (section.items.length === 0) {
      issues.push({
        path: `${base}.items`,
        message: 'This section has no items yet — add one, or remove the section.',
      });
    }
    section.items.forEach((item, itemIndex) => {
      const itemBase = `${base}.items[${itemIndex}]`;
      scanText(item.name, `${itemBase}.name`, issues, ruleChecks);
      if (isBlank(item.name)) {
        issues.push({ path: `${itemBase}.name`, message: 'This item needs a name.' });
      }
      if (item.description !== undefined) {
        scanText(item.description, `${itemBase}.description`, issues, ruleChecks);
      }
    });

    // The editor's "featured" toggle creates an empty list; the pages treat an empty list as
    // not featured, so a section left this way looks featured in the editor and plain on the
    // site. Ask for chips, or for the toggle to go back off.
    if (section.toppings !== undefined && section.toppings.length === 0) {
      issues.push({
        path: `${base}.toppings`,
        message:
          'This section is marked as the featured card but has no topping chips — add at least one, or turn "Featured card with topping chips" off.',
      });
    }
    (section.toppings ?? []).forEach((topping, toppingIndex) => {
      const toppingPath = `${base}.toppings[${toppingIndex}]`;
      scanText(topping, toppingPath, issues, ruleChecks);
      if (isBlank(topping)) {
        issues.push({ path: toppingPath, message: 'This topping is empty — type something or remove it.' });
      }
    });
  });

  return issues;
}

/** Both checks in one call; publishable iff `issues.length === 0` and `menu !== null`. */
export function validateMenu(
  value: unknown,
  rules: ContentRules | null,
): { menu: MenuContent | null; issues: CopyIssue[] } {
  const structural = collectStructuralIssues(value);
  if (structural.length > 0) {
    return { menu: null, issues: structural };
  }
  const menu = withPageFilled(value);
  return { menu, issues: validateMenuCopy(menu, rules) };
}
