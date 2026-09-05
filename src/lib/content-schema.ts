/**
 * The field-spec DSL: one description of a content document that drives BOTH validation and the
 * generic admin editor UI.
 *
 * The menu is bespoke — sections of items with topping chips — and keeps its hand-written
 * validator in `menu-content.ts`. The page documents (home, about, directions) are all the same
 * handful of shapes: text, a list of paragraphs, a list of short lines, a photo, a group, a
 * repeatable list. Describing them once means the editor's fields, the labels in the issues
 * panel, and the checks that gate publishing can never disagree about what a document contains.
 *
 * Structural issues (wrong types, unknown keys, a bad `version`, a broken image reference, a
 * select value outside its options, a malformed slug) reject the document outright: nothing can
 * render it. Copy issues (banned wording, blanks, counts, duplicate ids) come back alongside a
 * usable document, so the editor can show the draft while refusing to publish it.
 *
 * Runs in the build, the admin client bundle and the Netlify Functions, so: no dependencies, no
 * Node APIs, no JSON imports, relative import specifiers only.
 */

import { IMAGE_ID, MAX_IMAGE_DIMENSION } from './content/images';
import type { ContentRules, CopyIssue, RuleChecks } from './copy-rules';
import { SLUG, buildRuleChecks, describe, isBlank, isPlainObject, scanText } from './copy-rules';

/** A single-line or multi-line string. `optional` allows it to be blank, never absent. */
export interface TextFieldSpec {
  readonly kind: 'text';
  readonly label: string;
  readonly hint?: string;
  readonly multiline?: boolean;
  readonly optional?: boolean;
}

/** Body copy: an array of paragraphs, each rendered as its own `<p>`. */
export interface ParagraphsFieldSpec {
  readonly kind: 'paragraphs';
  readonly label: string;
  readonly hint?: string;
  readonly min?: number;
}

/** An array of short single-line strings — bullet notes, tips, walking steps. */
export interface StringsFieldSpec {
  readonly kind: 'strings';
  readonly label: string;
  readonly hint?: string;
  readonly itemLabel: string;
  readonly min?: number;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A closed set of values — an icon name, say. The stored value is never rendered as copy. */
export interface SelectFieldSpec {
  readonly kind: 'select';
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly SelectOption[];
}

/** A photo slot: a caption (also the alt text) plus an optional uploaded image. */
export interface PhotoFieldSpec {
  readonly kind: 'photo';
  readonly label: string;
  readonly hint?: string;
}

/** A named bundle of fields — one page section. */
export interface GroupFieldSpec {
  readonly kind: 'group';
  readonly label: string;
  readonly hint?: string;
  readonly fields: FieldMap;
}

/** A repeatable record — a dock, a FAQ entry, a feature card. */
export interface ListFieldSpec {
  readonly kind: 'list';
  readonly label: string;
  readonly hint?: string;
  readonly itemLabel: string;
  readonly item: FieldMap;
  readonly min?: number;
  readonly max?: number;
  /** Field holding a kebab-case id: unique within the list, derived from `titleField` on add. */
  readonly slugField?: string;
  /** Field that names an item in the editor and in issue paths. */
  readonly titleField?: string;
}

export type FieldSpec =
  | TextFieldSpec
  | ParagraphsFieldSpec
  | StringsFieldSpec
  | SelectFieldSpec
  | PhotoFieldSpec
  | GroupFieldSpec
  | ListFieldSpec;

export type FieldMap = Readonly<Record<string, FieldSpec>>;

/** A whole document. `version` and `updatedAt` are handled implicitly, not described here. */
export interface DocumentSpec {
  readonly fields: FieldMap;
}

/** Extra document-level checks a field spec cannot express (cross-field rules, page contracts). */
export type ExtraChecks<T> = (document: T) => readonly CopyIssue[];

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

function isPositiveInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;
}

/** Structural walk of one field's value. Anything wrong here means the document cannot render. */
function structuralField(
  value: unknown,
  path: string,
  field: FieldSpec,
  issues: CopyIssue[],
): void {
  switch (field.kind) {
    case 'text': {
      if (typeof value !== 'string') {
        issues.push({ path, message: `expected a string, got ${describe(value)}` });
      }
      return;
    }
    case 'select': {
      if (typeof value !== 'string') {
        issues.push({ path, message: `expected a string, got ${describe(value)}` });
        return;
      }
      if (!field.options.some((option) => option.value === value)) {
        issues.push({
          path,
          message: `expected one of ${field.options.map((option) => option.value).join(', ')}, got ${describe(value)}`,
        });
      }
      return;
    }
    case 'paragraphs':
    case 'strings': {
      if (!Array.isArray(value)) {
        issues.push({ path, message: `expected an array of strings, got ${describe(value)}` });
        return;
      }
      const entries: readonly unknown[] = value;
      entries.forEach((entry, index) => {
        if (typeof entry !== 'string') {
          issues.push({ path: `${path}[${index}]`, message: `expected a string, got ${describe(entry)}` });
        }
      });
      return;
    }
    case 'photo': {
      if (!isPlainObject(value)) {
        issues.push({ path, message: `expected a photo object, got ${describe(value)}` });
        return;
      }
      rejectUnknownKeys(value, ['caption', 'image'], path, issues);
      if (typeof value.caption !== 'string') {
        issues.push({ path: `${path}.caption`, message: `expected a string, got ${describe(value.caption)}` });
      }
      const image = value.image;
      if (image === null) return;
      if (!isPlainObject(image)) {
        issues.push({ path: `${path}.image`, message: `expected an image or null, got ${describe(image)}` });
        return;
      }
      rejectUnknownKeys(image, ['id', 'width', 'height'], `${path}.image`, issues);
      if (typeof image.id !== 'string' || !IMAGE_ID.test(image.id)) {
        issues.push({
          path: `${path}.image`,
          message: `expected a stored image file name, got ${describe(image.id)}`,
        });
      }
      for (const dimension of ['width', 'height'] as const) {
        if (!isPositiveInteger(image[dimension], MAX_IMAGE_DIMENSION)) {
          issues.push({
            path: `${path}.image`,
            message: `expected a whole ${dimension} in pixels between 1 and ${MAX_IMAGE_DIMENSION}, got ${describe(image[dimension])}`,
          });
        }
      }
      return;
    }
    case 'group': {
      if (!isPlainObject(value)) {
        issues.push({ path, message: `expected an object, got ${describe(value)}` });
        return;
      }
      structuralFields(value, field.fields, path, issues);
      return;
    }
    case 'list': {
      if (!Array.isArray(value)) {
        issues.push({ path, message: `expected an array, got ${describe(value)}` });
        return;
      }
      const items: readonly unknown[] = value;
      const slugField = field.slugField;
      items.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!isPlainObject(item)) {
          issues.push({ path: itemPath, message: `expected an object, got ${describe(item)}` });
          return;
        }
        structuralFields(item, field.item, itemPath, issues);

        // A slug renders as a URL anchor, so a malformed one is a broken page, not bad wording —
        // it is rejected here exactly as `parseMenuContent` rejects a bad section id. A
        // non-string was already reported by the field's own check, so this only adds the
        // format message. Duplicates stay in the copy pass, again matching the menu.
        if (slugField === undefined) return;
        const slug = item[slugField];
        if (typeof slug === 'string' && !SLUG.test(slug)) {
          issues.push({
            path: `${itemPath}.${slugField}`,
            message: `expected a kebab-case slug (lowercase letters, digits, hyphens), got ${describe(slug)}`,
          });
        }
      });
    }
  }
}

/** Every field of one object level: unknown keys rejected, then each described field walked. */
function structuralFields(
  owner: Record<string, unknown>,
  fields: FieldMap,
  path: string,
  issues: CopyIssue[],
): void {
  rejectUnknownKeys(owner, Object.keys(fields), path, issues);
  for (const [key, field] of Object.entries(fields)) {
    structuralField(owner[key], path === '' ? key : `${path}.${key}`, field, issues);
  }
}

function collectStructuralIssues(value: unknown, spec: DocumentSpec): CopyIssue[] {
  const issues: CopyIssue[] = [];
  if (!isPlainObject(value)) {
    issues.push({ path: '', message: `expected the content object, got ${describe(value)}` });
    return issues;
  }

  rejectUnknownKeys(value, ['version', 'updatedAt', ...Object.keys(spec.fields)], '', issues);
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

  for (const [key, field] of Object.entries(spec.fields)) {
    structuralField(value[key], key, field, issues);
  }
  return issues;
}

/** "Add at least 2 steps." / "Remove one — 4 docks is the most this section fits." */
function checkCount(
  count: number,
  path: string,
  field: StringsFieldSpec | ParagraphsFieldSpec | ListFieldSpec,
  issues: CopyIssue[],
): void {
  const noun = field.kind === 'paragraphs' ? 'paragraph' : field.itemLabel.toLowerCase();
  if (field.min !== undefined && count < field.min) {
    issues.push({
      path,
      message:
        field.min === 1
          ? `"${field.label}" is empty — add at least one ${noun}.`
          : `"${field.label}" needs at least ${field.min} ${noun}s — there ${count === 1 ? 'is' : 'are'} ${count}.`,
    });
  }
  const max = field.kind === 'list' ? field.max : undefined;
  if (max !== undefined && count > max) {
    issues.push({
      path,
      message: `"${field.label}" holds at most ${max} ${noun}s — remove ${count - max}.`,
    });
  }
}

/** Copy walk of one field's value. The structural walk has already passed, so types are safe. */
function copyField(
  value: unknown,
  path: string,
  field: FieldSpec,
  issues: CopyIssue[],
  rules: RuleChecks | null,
): void {
  switch (field.kind) {
    case 'text': {
      const text = value as string;
      scanText(text, path, issues, rules);
      if (field.optional !== true && isBlank(text)) {
        issues.push({ path, message: `"${field.label}" is empty — please fill it in.` });
      }
      return;
    }
    case 'select':
      // The stored value is an internal name (an icon key), never rendered as copy.
      return;
    case 'paragraphs':
    case 'strings': {
      const entries = value as readonly string[];
      checkCount(entries.length, path, field, issues);
      const noun = field.kind === 'paragraphs' ? 'paragraph' : field.itemLabel.toLowerCase();
      entries.forEach((entry, index) => {
        const entryPath = `${path}[${index}]`;
        scanText(entry, entryPath, issues, rules);
        if (isBlank(entry)) {
          issues.push({
            path: entryPath,
            message: `This ${noun} is empty — type something or remove it.`,
          });
        }
      });
      return;
    }
    case 'photo': {
      const photo = value as { caption: string };
      scanText(photo.caption, `${path}.caption`, issues, rules);
      if (isBlank(photo.caption)) {
        issues.push({
          path: `${path}.caption`,
          message:
            'Every photo needs a caption — it is shown under the picture and read aloud to anyone using a screen reader.',
        });
      }
      return;
    }
    case 'group': {
      copyFields(value as Record<string, unknown>, field.fields, path, issues, rules);
      return;
    }
    case 'list': {
      const items = value as readonly Record<string, unknown>[];
      checkCount(items.length, path, field, issues);
      const slugField = field.slugField;
      const seenSlugs = new Set<string>();
      items.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        copyFields(item, field.item, itemPath, issues, rules);
        if (slugField === undefined) return;

        // Slugs are React keys as well as anchors, so a duplicate silently swallows an item.
        // The format itself is structural — see the list case in `structuralField`.
        const slug = item[slugField];
        if (typeof slug !== 'string') return;
        if (seenSlugs.has(slug)) {
          issues.push({
            path: `${itemPath}.${slugField}`,
            message: `Two entries share the id "${slug}" — give each one its own.`,
          });
        }
        seenSlugs.add(slug);
      });
    }
  }
}

function copyFields(
  owner: Record<string, unknown>,
  fields: FieldMap,
  path: string,
  issues: CopyIssue[],
  rules: RuleChecks | null,
): void {
  for (const [key, field] of Object.entries(fields)) {
    copyField(owner[key], path === '' ? key : `${path}.${key}`, field, issues, rules);
  }
}

/**
 * Structural validation only — the build-time entry point, mirroring `parseMenuContent`. A
 * document that survives this can render; whether its *copy* is publishable is a separate
 * question the publish endpoint answers.
 */
export function parseWithSpec<T>(
  value: unknown,
  spec: DocumentSpec,
): { document: T | null; errors: string[] } {
  const issues = collectStructuralIssues(value, spec);
  if (issues.length > 0) {
    return {
      document: null,
      errors: issues.map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`)),
    };
  }
  return { document: value as T, errors: [] };
}

/**
 * Structure then copy, in one call — publishable iff `document !== null` and `issues` is empty.
 * `extra` carries the checks the spec cannot express: cross-field rules, and the minimum counts
 * that exist because a page or its structured data would break without them.
 */
export function validateWithSpec<T>(
  value: unknown,
  spec: DocumentSpec,
  rules: ContentRules | null,
  extra?: ExtraChecks<T>,
): { document: T | null; issues: readonly CopyIssue[] } {
  const structural = collectStructuralIssues(value, spec);
  if (structural.length > 0) {
    return { document: null, issues: structural };
  }
  const document = value as T;
  const issues: CopyIssue[] = [];
  copyFields(value as Record<string, unknown>, spec.fields, '', issues, rules === null ? null : buildRuleChecks(rules));
  if (extra) issues.push(...extra(document));
  return { document, issues };
}

/** One path segment: an object key, or an index into a list. */
type PathSegment = { readonly key: string } | { readonly index: number };

/** `docks.items[0].steps[2]` -> key/index segments. Returns null on anything malformed. */
function parsePath(path: string): PathSegment[] | null {
  const segments: PathSegment[] = [];
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  let consumed = 0;
  let match = pattern.exec(path);
  while (match !== null) {
    // Only a `.` may separate segments; anything else means the path is not ours.
    const gap = path.slice(consumed, match.index);
    if (gap !== '' && gap !== '.') return null;
    consumed = match.index + match[0].length;
    const key = match[1];
    const index = match[2];
    if (key !== undefined) segments.push({ key });
    else if (index !== undefined) segments.push({ index: Number(index) });
    match = pattern.exec(path);
  }
  return consumed === path.length && segments.length > 0 ? segments : null;
}

function itemTitle(item: unknown, field: ListFieldSpec, index: number): string {
  const fallback = `${field.itemLabel} ${index + 1}`;
  if (field.titleField === undefined || !isPlainObject(item)) return fallback;
  const title = item[field.titleField];
  return typeof title === 'string' && !isBlank(title) ? title : fallback;
}

/**
 * An owner-facing trail for an issue path: "From your cruise ship · Broadway Dock · Step 3".
 * Container labels give way to the thing they contain — a list segment reads as the item's own
 * name, not "Docks" — because that is how the owner sees the editor. Falls back to the raw path
 * for anything the spec does not describe, so an issue is never silently unaddressed.
 */
export function describeSpecPath(spec: DocumentSpec, document: unknown, path: string): string {
  // The empty path addresses the document as a whole, the way the menu panel says "Menu".
  if (path === '') return 'This page';

  const segments = parsePath(path);
  if (segments === null) return path;

  const trail: string[] = [];
  let fields: FieldMap | null = spec.fields;
  let field: FieldSpec | null = null;
  let value: unknown = document;

  for (let position = 0; position < segments.length; position += 1) {
    const segment = segments[position];
    if (segment === undefined) return path;

    if ('key' in segment) {
      // A key after a photo addresses its caption or its picture, not a described field.
      if (field !== null && field.kind === 'photo') {
        if (segment.key !== 'caption' && segment.key !== 'image') return path;
        trail.push(segment.key === 'caption' ? 'Caption' : 'Picture');
        return trail.join(' · ');
      }
      if (fields === null) return path;
      // Annotated because the narrowing of `fields` below depends on it, which would otherwise
      // make its inferred type circular.
      const next: FieldSpec | undefined = fields[segment.key];
      if (next === undefined) return path;
      field = next;
      value = isPlainObject(value) ? value[segment.key] : undefined;
      fields = next.kind === 'group' ? next.fields : null;
      // A container followed by an index reads as its item; only a leaf shows its own label.
      const followedByIndex =
        (next.kind === 'list' || next.kind === 'strings' || next.kind === 'paragraphs') &&
        position + 1 < segments.length;
      if (!followedByIndex) trail.push(next.label);
      continue;
    }

    if (field === null) return path;
    const index = segment.index;
    if (field.kind === 'list') {
      const item = Array.isArray(value) ? (value as readonly unknown[])[index] : undefined;
      trail.push(itemTitle(item, field, index));
      fields = field.item;
      field = null;
      value = item;
      continue;
    }
    if (field.kind === 'strings') {
      trail.push(`${field.itemLabel} ${index + 1}`);
      return trail.join(' · ');
    }
    if (field.kind === 'paragraphs') {
      trail.push(`Paragraph ${index + 1}`);
      return trail.join(' · ');
    }
    return path;
  }

  return trail.length > 0 ? trail.join(' · ') : path;
}

/** A blank value of the right shape — what the editor inserts when the owner adds an entry. */
export function emptyValue(field: FieldSpec): unknown {
  switch (field.kind) {
    case 'text':
      return '';
    case 'select':
      return field.options[0]?.value ?? '';
    case 'paragraphs':
    case 'strings':
      return [''];
    case 'photo':
      return { caption: '', image: null };
    case 'group':
      return emptyFields(field.fields);
    case 'list':
      return [];
  }
}

/** A blank object for one level of fields — the shape behind `emptyValue` for groups and items. */
export function emptyFields(fields: FieldMap): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    value[key] = emptyValue(field);
  }
  return value;
}
