/**
 * The registry of owner-editable documents: one entry per document, each knowing its label, its
 * field spec (the menu has none — its editor is bespoke), and how to parse and validate it.
 *
 * The publish endpoint, the server-side loader and the admin editor all address documents by
 * key, so this table is the only place that has to know the set. Adding a document means adding
 * a default JSON file in `src/data/defaults/`, an entry here, and an admin page.
 *
 * Relative imports only — the Netlify Functions import this module without Next's `@/` alias.
 */

import type { DocumentSpec } from './content-schema';
import { parseWithSpec, validateWithSpec } from './content-schema';
import type { AboutContent } from './content/about';
import { ABOUT_SPEC, aboutExtraChecks } from './content/about';
import type { DirectionsContent } from './content/directions';
import { DIRECTIONS_SPEC, directionsExtraChecks } from './content/directions';
import type { HomeContent } from './content/home';
import { HOME_SPEC, homeExtraChecks } from './content/home';
import { IMAGE_ID } from './content/images';
import type { ContentRules, CopyIssue } from './copy-rules';
import { isPlainObject } from './copy-rules';
import type { MenuContent } from './menu-content';
import { parseMenuContent, validateMenu } from './menu-content';

export const DOCUMENT_KEYS = ['menu', 'home', 'about', 'directions'] as const;

export type DocumentKey = (typeof DOCUMENT_KEYS)[number];

/**
 * What each key parses to. `parse`/`validate` deal in `unknown` because they take untrusted
 * input, so this mapping is what lets a caller that knows the key — the loader, above all —
 * hand a page its document already typed instead of casting at every call site.
 */
export interface DocumentTypes {
  readonly menu: MenuContent;
  readonly home: HomeContent;
  readonly about: AboutContent;
  readonly directions: DirectionsContent;
}

export type DocumentOf<K extends DocumentKey> = DocumentTypes[K];

export function isDocumentKey(value: unknown): value is DocumentKey {
  return typeof value === 'string' && (DOCUMENT_KEYS as readonly string[]).includes(value);
}

export interface ParseResult {
  readonly document: unknown | null;
  readonly errors: string[];
}

export interface ValidateResult {
  readonly document: unknown | null;
  readonly issues: readonly CopyIssue[];
}

export interface DocumentDefinition {
  readonly key: DocumentKey;
  /** How the document is named to the owner, in the editor and in status messages. */
  readonly label: string;
  /** `null` for the menu, whose shape is bespoke and whose editor is hand-built. */
  readonly spec: DocumentSpec | null;
  /** Structure only — what the static build runs. */
  readonly parse: (value: unknown) => ParseResult;
  /** Structure and copy — what the publish endpoint and the editor run. */
  readonly validate: (value: unknown, rules: ContentRules | null) => ValidateResult;
}

export const DOCUMENTS: Readonly<Record<DocumentKey, DocumentDefinition>> = {
  menu: {
    key: 'menu',
    label: 'Menu',
    spec: null,
    parse: (value) => {
      const { menu, errors } = parseMenuContent(value);
      return { document: menu, errors };
    },
    validate: (value, rules) => {
      const { menu, issues } = validateMenu(value, rules);
      return { document: menu, issues };
    },
  },
  home: {
    key: 'home',
    label: 'Home page',
    spec: HOME_SPEC,
    parse: (value) => parseWithSpec<HomeContent>(value, HOME_SPEC),
    validate: (value, rules) => validateWithSpec<HomeContent>(value, HOME_SPEC, rules, homeExtraChecks),
  },
  about: {
    key: 'about',
    label: 'About page',
    spec: ABOUT_SPEC,
    parse: (value) => parseWithSpec<AboutContent>(value, ABOUT_SPEC),
    validate: (value, rules) => validateWithSpec<AboutContent>(value, ABOUT_SPEC, rules, aboutExtraChecks),
  },
  directions: {
    key: 'directions',
    label: 'Directions page',
    spec: DIRECTIONS_SPEC,
    parse: (value) => parseWithSpec<DirectionsContent>(value, DIRECTIONS_SPEC),
    validate: (value, rules) =>
      validateWithSpec<DirectionsContent>(value, DIRECTIONS_SPEC, rules, directionsExtraChecks),
  },
};

/**
 * Every uploaded image a document references, in the order found, without duplicates.
 *
 * This is a shape match rather than a spec walk on purpose: it has to answer "is this picture
 * still in use?" for *any* stored document, including one saved before a spec changed, so it
 * looks for the photo shape wherever it appears.
 */
export function collectImageIds(document: unknown): readonly string[] {
  const ids: string[] = [];
  for (const use of collectImageUses(document)) {
    if (!ids.includes(use.id)) ids.push(use.id);
  }
  return ids;
}

/** One photo slot holding an uploaded image: where it sits, and what the owner called it. */
export interface ImageUse {
  readonly id: string;
  /** The slot's caption, which is how the owner knows the picture. */
  readonly caption: string;
  /** The validator-style path of the photo's `image` (`bannock.photo.image`), for focusing. */
  readonly path: string;
}

/**
 * Every photo slot that holds an uploaded image, in document order (duplicates kept, since each
 * slot is its own place to fix). Same shape match as `collectImageIds`.
 */
export function collectImageUses(document: unknown): readonly ImageUse[] {
  const uses: ImageUse[] = [];

  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      (value as readonly unknown[]).forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(value)) return;

    const image = value.image;
    if (typeof value.caption === 'string' && isPlainObject(image)) {
      const id = image.id;
      if (
        typeof id === 'string' &&
        IMAGE_ID.test(id) &&
        typeof image.width === 'number' &&
        typeof image.height === 'number'
      ) {
        uses.push({ id, caption: value.caption, path: path === '' ? 'image' : `${path}.image` });
      }
    }

    for (const [key, entry] of Object.entries(value)) {
      walk(entry, path === '' ? key : `${path}.${key}`);
    }
  };

  walk(document, '');
  return uses;
}
