/**
 * Draft autosave in `localStorage`, so a closed tab or dropped connection never loses edits.
 * Storage can be absent, full, or blocked (private windows, cleared site data), so every call
 * is wrapped in try/catch and failure is silent — the draft is a convenience, never the record.
 *
 * One slot per document (`nwf-admin-<doc>-draft`): the four editors are separate pages, and a
 * shared slot would mean opening one page discards the unsaved work on another.
 *
 * Two tabs on the same document share that slot, so every draft carries the id of the editor
 * that wrote it. The clean-state cleanup only ever removes a draft this editor wrote itself (or
 * one that is provably the document already loaded) — opening a second, untouched tab never
 * wipes the work autosaved by the first. Writes stay last-edit-wins: whichever tab the owner
 * typed in most recently holds the slot.
 */

import type { DocumentKey, DocumentParser } from '@/components/admin/api';
import { documentsEqual } from '@/components/admin/editor-state';
import type { DocumentSpec, FieldMap } from '@/lib/content-schema';
import { isPlainObject, slugify } from '@/lib/copy-rules';

function draftKey(doc: DocumentKey): string {
  return `nwf-admin-${doc}-draft`;
}

export interface StoredDraft<T> {
  /** When the draft was written, ISO 8601 — `null` when the stored value predates the field. */
  readonly savedAt: string | null;
  readonly document: T;
  /**
   * The `updatedAt` of the published version the edits started from — `null` when they
   * started from the built-in default, `undefined` when unknown (an older draft).
   */
  readonly base: string | null | undefined;
  /** The editor instance that wrote it; `null` for a draft that predates the field. */
  readonly tabId: string | null;
}

interface RawDraft {
  readonly savedAt: string | null;
  readonly document: unknown;
  readonly base: string | null | undefined;
  readonly tabId: string | null;
}

function readRaw(doc: DocumentKey): RawDraft | null {
  const raw = window.localStorage.getItem(draftKey(doc));
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  return {
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : null,
    document: record.document,
    base:
      typeof record.base === 'string' || record.base === null ? record.base : undefined,
    tabId: typeof record.tabId === 'string' ? record.tabId : null,
  };
}

/**
 * The saved draft, or `null` when there is none or it is not this document's shape at all.
 *
 * `parse` should accept anything the editor itself can hold: a draft is autosaved mid-edit,
 * so it may carry a value only the publish check refuses (an anchor id half typed). Such a
 * draft is still the owner's work — it is offered, and validation flags the field once it is
 * resumed. A draft that cannot be read stays in its slot untouched; nothing here deletes it.
 */
export function readDraft<T>(doc: DocumentKey, parse: DocumentParser<T>): StoredDraft<T> | null {
  try {
    const raw = readRaw(doc);
    if (raw === null) return null;
    const { document } = parse(raw.document);
    if (document === null) return null;
    return { savedAt: raw.savedAt, document, base: raw.base, tabId: raw.tabId };
  } catch {
    return null;
  }
}

export interface DraftOwner {
  readonly tabId: string;
  /** See `StoredDraft.base`. */
  readonly base: string | null | undefined;
}

export function writeDraft<T>(doc: DocumentKey, document: T, owner: DraftOwner): void {
  try {
    window.localStorage.setItem(
      draftKey(doc),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        tabId: owner.tabId,
        ...(owner.base === undefined ? {} : { base: owner.base }),
        document,
      }),
    );
  } catch {
    // Storage unavailable — the editor keeps working, just without the safety net.
  }
}

/** Removes the draft unconditionally — for an explicit decision (Discard, a confirmed restore). */
export function clearDraft(doc: DocumentKey): void {
  try {
    window.localStorage.removeItem(draftKey(doc));
  } catch {
    // Same as above: nothing useful to do.
  }
}

/**
 * The clean-state cleanup: removes the draft only when this editor wrote it, or when it holds
 * exactly `baseline` (so nothing is lost). A draft from another tab, an older format, or one
 * that cannot be read at all is left where it is.
 */
export function clearDraftIfOwned<T>(doc: DocumentKey, tabId: string, baseline: T): void {
  try {
    const raw = readRaw(doc);
    if (raw === null) return;
    if (raw.tabId === tabId || documentsEqual(raw.document, baseline as unknown)) {
      window.localStorage.removeItem(draftKey(doc));
    }
  } catch {
    // Unreadable slot: leave it alone.
  }
}

/**
 * A copy of `value` with every list item's slug (a dock's link id) replaced by a well-formed
 * stand-in, through groups and nested lists alike.
 */
function slugsTamed(value: unknown, fields: FieldMap): unknown {
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = { ...value };
  for (const [key, field] of Object.entries(fields)) {
    const child = next[key];
    if (field.kind === 'group') {
      next[key] = slugsTamed(child, field.fields);
    } else if (field.kind === 'list' && Array.isArray(child)) {
      const slugField = field.slugField;
      next[key] = (child as readonly unknown[]).map((item) => {
        const tamed = slugsTamed(item, field.item);
        if (slugField === undefined || !isPlainObject(tamed)) return tamed;
        const slug = tamed[slugField];
        return typeof slug === 'string' ? { ...tamed, [slugField]: slugify(slug) || 'x' } : tamed;
      });
    }
  }
  return next;
}

/**
 * A draft parser for a spec-driven document: `parse`, except that a draft failing only on a
 * malformed slug is accepted as it is. A slug is the one structural rule a field takes
 * keystrokes for — mid-edit it can read "Railroad Dock" or "railroad-" — and a draft autosaved
 * at that moment is still the owner's work. Once resumed, the validator flags the field.
 * Everything else about the shape still has to hold.
 */
export function toleratingSlugs<T>(parse: DocumentParser<T>, spec: DocumentSpec): DocumentParser<T> {
  return (value) => {
    const strict = parse(value);
    if (strict.document !== null) return strict;
    const tamed = parse(slugsTamed(value, spec.fields));
    return tamed.document === null ? strict : { document: value as T, errors: [] };
  };
}
