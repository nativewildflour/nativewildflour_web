/**
 * Pure state for every admin editor: an undo/redo history reducer over one document, plus the
 * deep-equality check the dirty flag rests on. No React, no browser APIs, and nothing here
 * knows what a document contains — the reducer only ever swaps whole values, so it stays pure
 * (safe under Strict Mode's double invocation) and trivially unit-testable.
 *
 * The document operations themselves are per document: the menu's live in `menu-ops.ts`, and a
 * schema-driven editor edits through the field spec instead.
 */

/** Undo history is bounded so an afternoon of edits cannot grow memory without limit. */
const HISTORY_LIMIT = 100;

/**
 * Consecutive edits to the same field within this window collapse into one history entry,
 * so undo steps back a phrase at a time instead of a keystroke at a time.
 */
const COALESCE_MS = 1200;

export interface EditorHistory<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** The last loaded or published document — the dirty check compares `present` against it. */
  readonly baseline: T;
  readonly lastEditKey: string | null;
  readonly lastEditTime: number;
}

export type EditorAction<T> =
  /** A document edit. `coalesceKey` groups rapid edits to one field into one undo step. */
  | {
      readonly type: 'edit';
      readonly document: T;
      readonly coalesceKey?: string;
      readonly time: number;
    }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  /** A fresh document from the server (initial load or restore): history and baseline reset. */
  | { readonly type: 'load'; readonly document: T }
  /** A resumed local draft: it becomes `present`, with the loaded document one undo step behind. */
  | { readonly type: 'resume'; readonly document: T }
  /**
   * A successful publish: the document that was actually sent becomes the new baseline, so
   * keystrokes typed while the save was in flight stay dirty instead of being silently
   * marked published.
   */
  | { readonly type: 'published'; readonly document: T };

export function createEditorHistory<T>(document: T): EditorHistory<T> {
  return {
    past: [],
    present: document,
    future: [],
    baseline: document,
    lastEditKey: null,
    lastEditTime: 0,
  };
}

export function editorReducer<T>(state: EditorHistory<T>, action: EditorAction<T>): EditorHistory<T> {
  switch (action.type) {
    case 'edit': {
      if (action.document === state.present) return state;
      const coalesce =
        action.coalesceKey !== undefined &&
        action.coalesceKey === state.lastEditKey &&
        action.time - state.lastEditTime < COALESCE_MS;
      const past = coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT);
      return {
        ...state,
        past,
        present: action.document,
        future: [],
        lastEditKey: action.coalesceKey ?? null,
        lastEditTime: action.time,
      };
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastEditKey: null,
        lastEditTime: 0,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (next === undefined) return state;
      return {
        ...state,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
        lastEditKey: null,
        lastEditTime: 0,
      };
    }
    case 'load':
      return createEditorHistory(action.document);
    case 'resume':
      return {
        ...state,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.document,
        future: [],
        lastEditKey: null,
        lastEditTime: 0,
      };
    case 'published':
      return { ...state, baseline: action.document };
  }
}

/** Recursively rebuilds a JSON value with object keys sorted, so serialization order never matters. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * `value` without its top-level `updatedAt`. The server stamps that key on every publish, so it
 * says when a document was saved, not what it says. Only the top level: no field inside a
 * document goes by that name, and one that did would be content.
 */
function withoutStamp(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  if (!Object.hasOwn(value, 'updatedAt')) return value;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete copy.updatedAt;
  return copy;
}

/**
 * Deep equality via key-sorted canonical JSON. Raw `JSON.stringify` is key-order-sensitive —
 * the menu seed stores `highlight` before `items` while the section builder emits it last, so
 * a hand-typed revert would otherwise read as permanently dirty. The publish stamp is left out
 * (see `withoutStamp`): a draft identical in content to the loaded document, but carrying the
 * stamp of an older version, is the same document.
 */
export function documentsEqual<T>(a: T, b: T): boolean {
  return (
    a === b ||
    JSON.stringify(canonicalize(withoutStamp(a))) === JSON.stringify(canonicalize(withoutStamp(b)))
  );
}
