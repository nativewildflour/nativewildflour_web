/**
 * Draft autosave in `localStorage`, so a closed tab or dropped connection never loses edits.
 * Storage can be absent, full, or blocked (private windows, cleared site data), so every call
 * is wrapped in try/catch and failure is silent — the draft is a convenience, never the record.
 *
 * One slot per document (`nwf-admin-<doc>-draft`): the four editors are separate pages, and a
 * shared slot would mean opening one page discards the unsaved work on another.
 */

import type { DocumentKey, DocumentParser } from '@/components/admin/api';

function draftKey(doc: DocumentKey): string {
  return `nwf-admin-${doc}-draft`;
}

export interface StoredDraft<T> {
  /** When the draft was written, ISO 8601 — `null` when the stored value predates the field. */
  readonly savedAt: string | null;
  readonly document: T;
}

/**
 * The saved draft, or `null` when there is none or it no longer parses as this document —
 * a stale draft from an older shape is discarded rather than offered.
 */
export function readDraft<T>(doc: DocumentKey, parse: DocumentParser<T>): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(draftKey(doc));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const { document } = parse(record.document);
    if (document === null) return null;
    return { savedAt: typeof record.savedAt === 'string' ? record.savedAt : null, document };
  } catch {
    return null;
  }
}

export function writeDraft<T>(doc: DocumentKey, document: T): void {
  try {
    window.localStorage.setItem(
      draftKey(doc),
      JSON.stringify({ savedAt: new Date().toISOString(), document }),
    );
  } catch {
    // Storage unavailable — the editor keeps working, just without the safety net.
  }
}

export function clearDraft(doc: DocumentKey): void {
  try {
    window.localStorage.removeItem(draftKey(doc));
  } catch {
    // Same as above: nothing useful to do.
  }
}
