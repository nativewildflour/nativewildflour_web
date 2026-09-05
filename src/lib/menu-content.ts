/**
 * Shared contract for the owner-editable menu content: structural validation of untrusted JSON
 * plus copy-rule validation (docs/BRIEF.md §2).
 *
 * This module runs in three places — the rendering server (via `src/lib/server/content.ts`),
 * the admin editor's client bundle, and the Netlify Function that stores the content — so it
 * must stay dependency-free, browser-safe, and free of Node APIs.
 *
 * The menu's *shape* is bespoke (sections of items with toppings), so its structural walk lives
 * here rather than in the `content-schema.ts` field-spec DSL the other documents use. The copy
 * rules are not bespoke: they come from `copy-rules.ts`, the one implementation the gate, the
 * publish endpoint and every other document share. See that module for why the rules are
 * injected rather than imported.
 */

import type { ContentRules, CopyIssue, RuleChecks } from './copy-rules';
import { SLUG, buildRuleChecks, describe, isBlank, isPlainObject, scanText } from './copy-rules';

// Re-exported so the admin editor and the Netlify Functions keep one import for the whole menu
// contract — the rule types travel with the validator that consumes them.
export type { ContentRules, CopyIssue } from './copy-rules';
export { slugify } from './copy-rules';

/** One menu item. The description is optional, one line, and never a price. */
export interface MenuItemContent {
  readonly name: string;
  readonly description?: string;
}

/** One menu section. `id` doubles as the `/menu/` anchor, so it must stay a stable slug. */
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

/** The whole owner-editable menu document, as stored in the `site-content` blob store. */
export interface MenuContent {
  readonly version: 1;
  /** ISO 8601 timestamp, set by the publish endpoint on save; the committed default omits it. */
  readonly updatedAt?: string;
  readonly intro: string;
  readonly specialsNote: string;
  readonly sections: readonly MenuSectionContent[];
}

/**
 * Printed near the top of the menu page and anywhere the menu is summarized. Rule-driven copy
 * (docs/BRIEF.md §1), not owner-editable — deliberately hard-coded rather than derived.
 */
export const MENU_PRICE_NOTE = 'Prices are posted at the counter.';

/**
 * The topping chips the about page lists — the first section that declares any. The menu owns
 * them, so both the menu page and the about page read them from the same document.
 */
export function bannockToppings(menu: MenuContent): readonly string[] {
  return menu.sections.find((section) => section.toppings !== undefined)?.toppings ?? [];
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

/** Typos in field names must fail loudly rather than silently dropping content. */
function rejectUnknownKeys(
  owner: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: CopyIssue[],
): void {
  for (const key of Object.keys(owner)) {
    if (!allowed.includes(key)) {
      issues.push({
        path: path === '' ? key : `${path}.${key}`,
        message: 'unknown field — remove it',
      });
    }
  }
}

/** Structural walk shared by `parseMenuContent` and `validateMenu`. */
function collectStructuralIssues(value: unknown): CopyIssue[] {
  const issues: CopyIssue[] = [];
  if (!isPlainObject(value)) {
    issues.push({ path: '', message: `expected the menu content object, got ${describe(value)}` });
    return issues;
  }

  rejectUnknownKeys(value, ['version', 'updatedAt', 'intro', 'specialsNote', 'sections'], '', issues);
  if (value.version !== 1) {
    issues.push({ path: 'version', message: `expected the number 1, got ${describe(value.version)}` });
  }
  if (
    value.updatedAt !== undefined &&
    (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt)))
  ) {
    issues.push({
      path: 'updatedAt',
      message: `expected an ISO 8601 date-time string, got ${describe(value.updatedAt)}`,
    });
  }
  requireString(value, 'intro', 'intro', issues);
  requireString(value, 'specialsNote', 'specialsNote', issues);

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
  return { menu: value as MenuContent, errors: [] };
}

/**
 * Copy-rule validation: wrong WILDFlour casing, price-like strings ($ amounts, X.XX), the
 * wrong phone number, empty names, duplicate section ids — plus, when `rules` were injected,
 * banned words, off-spec opening-hours ranges, and placeholder markers. Also flags empty
 * intro/specials-note text, a menu with no sections, and a section with no items, since each
 * would render a broken page, and two cross-page contracts: the about page needs one section
 * with toppings, the home page needs one highlighted section. Each issue carries a path label
 * like `sections[2].items[0].name`.
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

    // Ids render as anchor attributes on the public page, so they get the full copy scan too.
    scanText(section.id, `${base}.id`, issues, ruleChecks);
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
  const menu = value as MenuContent;
  return { menu, issues: validateMenuCopy(menu, rules) };
}
