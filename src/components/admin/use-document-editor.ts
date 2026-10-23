'use client';

/**
 * `useDocumentEditor` — everything an admin editor does that is not specific to one document.
 *
 * It loads the document from the admin API (or degrades to the committed seed, read-only, when
 * no API answers — plain `next dev`), keeps an undo/redo history with keyboard shortcuts,
 * autosaves a draft to localStorage and offers to resume it, validates on every change with
 * the same validator the server enforces (against rules fetched at runtime from the auth-gated
 * `/admin/api/rules` endpoint — they are never part of this bundle), and runs the publish and
 * restore flows with their confirmations and status messages.
 *
 * ## The surface a screen builds on
 *
 * Pair it with `DocumentEditorFrame`, which consumes the whole returned object and draws the
 * chrome (action bar, notices, status banner, issues panel, version history, preview column,
 * dialogs). A screen then supplies only its fields:
 *
 * ```tsx
 * const editor = useDocumentEditor({ doc: 'home', label: 'home page', seed: SEED, parse, validate });
 * return (
 *   <DocumentEditorFrame editor={editor} describePath={describe} preview={<HomePreview … />}>
 *     …fields, driven by `editor.present` and `editor.applyEdit`…
 *   </DocumentEditorFrame>
 * );
 * ```
 *
 * The fields need seven things and nothing more, so a schema-driven editor can be written
 * against them without touching this hook:
 *
 * - `present` — the document being edited; render every control from it
 * - `applyEdit(next, coalesceKey?)` — replace it. Pass a stable `coalesceKey` (the field's
 *   path) for keystroke-level edits so undo steps back a phrase at a time
 * - `readOnly` — the API is unreachable or refused us; publishing is off, so anything that
 *   needs the server (a photo upload) must be disabled with an explanation
 * - `rules` — the fetched content rules, or `null`; only needed to pre-check text that would
 *   otherwise become permanent (the menu's anchor ids)
 * - `issues` — live validation results for `present`, path-labeled
 * - `announce(text)` — say something in the polite live region (a reorder, a removal)
 * - `focusIssue(path)` — focus the field an issue points at. Fields must carry
 *   `id="field-<path>"`, matching the validator's path labels
 * - `mode` / `busy` — where the document came from, and whether a save is in flight
 *
 * Everything else on the returned object belongs to the frame.
 *
 * ## Copy
 *
 * `label` is a lowercase noun phrase ("menu", "home page") spliced into the editor's sentences,
 * so every screen speaks about the thing it edits. `summarize` writes the first sentence of
 * the publish confirmation, where a count reads better than a name ("4 sections and 12 items
 * go live on the site.").
 *
 * `doc`, `seed` and `parse` are read once, on mount: the hook loads a single document for the
 * life of the screen. `validate` should be a stable reference — it runs on every render.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type {
  DocumentKey,
  DocumentParser,
  LoadResult,
  SaveResult,
  VersionEntry,
} from '@/components/admin/api';
import { loadDocument, loadRules, publishDocument, restoreVersion } from '@/components/admin/api';
import { clearDraft, clearDraftIfOwned, readDraft, writeDraft } from '@/components/admin/draft-storage';
import type { StoredDraft } from '@/components/admin/draft-storage';
import { createEditorHistory, documentsEqual, editorReducer } from '@/components/admin/editor-state';
import type { StatusMessage } from '@/components/admin/StatusBanner';
import type { ContentRules, CopyIssue } from '@/lib/copy-rules';

/**
 * Where the document came from. `live` = the blob, `seed` = no blob yet, `offline` = no API
 * answered (plain `next dev`), `expired` = the API refused our credentials, `error` = the
 * API is up but failed to serve the document (e.g. a corrupt blob) — editing pauses, and
 * version history stays available because a restore is the documented way back.
 */
export type EditorMode = 'live' | 'seed' | 'offline' | 'expired' | 'error';

/**
 * The status banner's wrapper id. `showStatus` scrolls it into view by id rather than through
 * a ref, because the banner belongs to the frame while the message belongs to the hook —
 * the same arrangement `focusIssue` uses for fields.
 */
export const STATUS_BANNER_ID = 'editor-status';

/** One pending confirmation. The frame hosts a single dialog; this is what fills it. */
export interface ConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone: 'primary' | 'danger';
  readonly onConfirm: () => void;
}

export interface DocumentEditorOptions<T> {
  readonly doc: DocumentKey;
  /** Lowercase noun phrase for the copy: "menu", "home page". */
  readonly label: string;
  /** The committed seed, already parsed — what the editor shows when no API answers. */
  readonly seed: T;
  /** Structural parse, used for the server's document (and for a stored draft, by default). */
  readonly parse: DocumentParser<T>;
  /**
   * The check a stored draft must pass to be offered. It should accept anything the fields can
   * produce mid-edit — a draft is autosaved between keystrokes, so it may hold a value only the
   * publish check refuses, and that is still the owner's work. Defaults to `parse`.
   */
  readonly parseDraft?: DocumentParser<T>;
  /** Copy validation for the working document. Keep the reference stable. */
  readonly validate: (document: T, rules: ContentRules | null) => readonly CopyIssue[];
  /**
   * First sentence of the publish confirmation, e.g. "4 sections and 12 items go live on the
   * site." Defaults to "The <label> goes live on the site."
   */
  readonly summarize?: (document: T) => string;
}

export interface DocumentEditor<T> {
  readonly doc: DocumentKey;
  readonly label: string;
  readonly phase: 'loading' | 'ready';
  readonly mode: EditorMode;
  /** The server's own message when the document could not load (`error` mode). */
  readonly loadError: string | null;
  readonly lastSaved: string | null;
  /**
   * The `updatedAt` of the published version these edits build on — sent with a publish so
   * the server can refuse to overwrite a newer one. `null` = built on the default (nothing
   * published yet); `undefined` = unknown, so no check is asked for.
   */
  readonly baseVersion: string | null | undefined;

  readonly present: T;
  readonly applyEdit: (next: T, coalesceKey?: string) => void;
  readonly readOnly: boolean;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly rules: ContentRules | null;
  readonly issues: readonly CopyIssue[];
  /** Issues the server returned from a rejected publish, shown until the next edit. */
  readonly serverIssues: readonly CopyIssue[];

  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  /** ⌘ on Apple platforms, Ctrl elsewhere — for the Undo/Redo tooltips. */
  readonly shortcutModifier: string;

  readonly canPublish: boolean;
  readonly publishHint: string;
  readonly requestPublish: () => void;
  readonly requestRestore: (version: VersionEntry) => void;
  /** Bumped after each publish/restore so an open version list refetches. */
  readonly versionsReload: number;

  readonly status: StatusMessage | null;
  readonly showStatus: (message: StatusMessage) => void;
  readonly dismissStatus: () => void;
  readonly announce: (text: string) => void;
  readonly liveMessage: { readonly text: string; readonly nonce: number };
  readonly focusIssue: (path: string) => void;

  readonly confirm: ConfirmRequest | null;
  readonly requestConfirm: (request: ConfirmRequest) => void;
  readonly closeConfirm: () => void;

  readonly draftPrompt: StoredDraft<T> | null;
  readonly resumeDraft: () => void;
  readonly discardDraft: () => void;
  readonly deferDraft: () => void;
}

const SIGN_IN_EXPIRED = 'Your sign-in expired — reload the page.';
const PUBLISHED_LIVE =
  'Published. The site is updating now — reload it in a moment to see the change.';
const PUBLISHED_NO_HOOK =
  'Published and saved — the site couldn’t be told to refresh right away, so the change appears within a minute.';
const RESTORED_LIVE =
  'Restored. The site is updating now — reload it in a moment to see the change.';
/** Shown when a publish is refused because the store moved on since this editor loaded. */
const CHANGED_ELSEWHERE =
  'This page was changed somewhere else since you opened it. Reload to see the latest, your draft is kept.';
const RESTORED_NO_HOOK =
  'Restored and saved — the site couldn’t be told to refresh right away, so the change appears within a minute.';

export function formatWhen(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Focus the first focusable candidate — the elements may only exist after React commits, so
 * this retries across a few frames. A disabled button (a reorder control at a list edge)
 * falls through to the next candidate in the same frame.
 */
export function focusSoon(target: string | readonly string[], attempts = 5): void {
  const ids = typeof target === 'string' ? [target] : target;
  window.requestAnimationFrame(() => {
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element && !(element instanceof HTMLButtonElement && element.disabled)) {
        element.focus();
        return;
      }
    }
    if (attempts > 0) focusSoon(ids, attempts - 1);
  });
}

/**
 * The banner text for a save that failed without a verdict on the content. No response at
 * all is a connection problem worth retrying; a server that answered and said why gets its
 * own sentence, which is final — retrying the same request would only say it again.
 */
function failureText(result: Extract<SaveResult, { kind: 'failed' }>, what: string): string {
  if (result.status === null) return `${what} — check your connection and try again.`;
  if (result.message !== undefined && result.message !== '') {
    return `${what}: ${result.message}`;
  }
  return `${what} — try again in a moment.`;
}

export function useDocumentEditor<T extends object>(
  options: DocumentEditorOptions<T>,
): DocumentEditor<T> {
  const { doc, label, validate } = options;
  /**
   * The mount-time settings, reachable from effects that must not re-run. `doc`, `seed` and
   * `parse` describe one document for the life of the screen, so an effect reading them here
   * needs no dependency on the caller passing stable references.
   */
  const settings = useRef(options);
  useEffect(() => {
    settings.current = options;
  });

  const [history, dispatch] = useReducer(editorReducer<T>, options.seed, createEditorHistory<T>);
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [mode, setMode] = useState<EditorMode>('offline');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [serverIssues, setServerIssues] = useState<readonly CopyIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<StoredDraft<T> | null>(null);
  /**
   * Set when the resume-draft prompt is dismissed without a decision (Escape / scrim): the
   * stored draft is the only copy of that work, so the autosave effect must not clear it
   * just because the editor is clean. Lifts on resume, discard, publish, restore, or the
   * first edit — at that point the debounced `writeDraft` legitimately claims the slot.
   */
  const [draftDeferred, setDraftDeferred] = useState(false);
  const [versionsReload, setVersionsReload] = useState(0);
  /** See `DocumentEditor.baseVersion`. Never `lastSaved`, which can be a local guess. */
  const [baseVersion, setBaseVersion] = useState<string | null | undefined>(undefined);
  /**
   * Which editor wrote a stored draft. Two tabs on one document share its slot, and the
   * clean-state cleanup only clears a draft carrying this id — see `clearDraftIfOwned`.
   */
  const [tabId] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );
  /** The server's own message when the document could not load (`error` mode). */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Content rules from the auth-gated endpoint; `null` until fetched (or when unreachable). */
  const [rules, setRules] = useState<ContentRules | null>(null);
  /** Reorder/removal outcomes speak here; the nonce remounts the node so repeats re-announce. */
  const [liveMessage, setLiveMessage] = useState({ text: '', nonce: 0 });
  /**
   * ⌘ on Apple platforms, Ctrl elsewhere, for the Undo/Redo tooltips. Lazy init: during the
   * static prerender (no `navigator`) it settles on Ctrl, and nothing in the prerendered
   * loading state renders it, so hydration never sees a mismatch.
   */
  const [shortcutModifier] = useState(() =>
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? '⌘'
      : 'Ctrl',
  );

  const present = history.present;
  // Memoized: the check canonicalizes and serializes both documents, and the hook re-renders
  // for plenty of reasons that touch neither (status, confirms, announcements, busy).
  const dirty = useMemo(
    () => !documentsEqual(present, history.baseline),
    [present, history.baseline],
  );
  const issues = useMemo(() => validate(present, rules), [validate, present, rules]);
  const readOnly = mode === 'offline' || mode === 'expired' || mode === 'error';
  const canPublish = phase === 'ready' && !readOnly && dirty && issues.length === 0 && !busy;

  const announce = useCallback((text: string) => {
    setLiveMessage((previous) => ({ text, nonce: previous.nonce + 1 }));
  }, []);

  /** Status set as the direct result of a user action: also bring the banner into view —
   *  actions fire from the sticky bar, which can sit far below it. The banner's own
   *  `aria-live` keeps covering screen readers. */
  const showStatus = useCallback((message: StatusMessage) => {
    setStatus(message);
    window.requestAnimationFrame(() => {
      document.getElementById(STATUS_BANNER_ID)?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const dismissStatus = useCallback(() => setStatus(null), []);

  // --- Initial load ---------------------------------------------------------
  useEffect(() => {
    const { doc: key, parse, parseDraft } = settings.current;
    let cancelled = false;
    void loadDocument(key, parse).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') {
        dispatch({ type: 'load', document: result.document });
        setMode(result.source === 'blob' ? 'live' : 'seed');
        setLastSaved(result.updatedAt);
        setBaseVersion(result.source === 'blob' ? (result.updatedAt ?? undefined) : null);
        // A draft is only ever compared with — and offered over — the real document. In the
        // read-only modes the editor holds the built-in default, so the draft stays put,
        // unread, for a visit that can load the live copy.
        const draft = readDraft(key, parseDraft ?? parse);
        if (draft && !documentsEqual(draft.document, result.document)) {
          setDraftPrompt(draft);
        }
      } else if (result.kind === 'unauthorized') {
        setMode('expired');
        setStatus({ tone: 'error', text: SIGN_IN_EXPIRED });
      } else if (result.kind === 'server-error') {
        setMode('error');
        setLoadError(result.message);
      } else {
        setMode('offline');
      }
      setPhase('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Content rules --------------------------------------------------------
  // Fetched once from the auth-gated endpoint; on any failure the editor validates with
  // `null` (partial checks) and the server still enforces the full set on publish.
  useEffect(() => {
    let cancelled = false;
    void loadRules().then((fetched) => {
      if (!cancelled && fetched !== null) setRules(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Draft autosave -------------------------------------------------------
  // One localStorage slot per document holds the draft, and only a document that really
  // loaded (`live` or `seed`) ever touches it: in the read-only modes the editor holds the
  // built-in default, and neither writing that nor clearing over it would be the owner's work.
  // Paused while the resume prompt is open, so the undecided draft is never overwritten or
  // cleared out from under it. After a dismissed prompt (`draftDeferred`) the clean-state
  // cleanup is skipped too — the deferred draft is the only copy of that work. The cleanup
  // otherwise removes only a draft this tab wrote (or one equal to the baseline), so a second
  // tab opened clean never wipes the first tab's autosave. Once the owner edits, the debounced
  // `writeDraft` claims the slot — last edit wins, the fate of a single-slot draft.
  const baseline = history.baseline;
  const draftsEnabled = mode === 'live' || mode === 'seed';
  useEffect(() => {
    if (phase !== 'ready' || !draftsEnabled || draftPrompt !== null) return;
    if (!dirty) {
      if (!draftDeferred) clearDraftIfOwned(doc, tabId, baseline);
      return;
    }
    const timer = window.setTimeout(
      () => writeDraft(doc, present, { tabId, base: baseVersion }),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [doc, present, baseline, dirty, phase, draftsEnabled, draftPrompt, draftDeferred, tabId, baseVersion]);

  // --- Unsaved-changes guard ------------------------------------------------
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Legacy engines need a string set to show the prompt.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // --- Undo / redo keyboard shortcuts --------------------------------------
  // The handler registers once (empty deps), so it reads the live "should I ignore this?"
  // answer through a ref kept in sync below — a naive early-return would close over the
  // initial nulls and never block anything.
  const shortcutsBlockedRef = useRef(false);
  useEffect(() => {
    shortcutsBlockedRef.current = confirm !== null || draftPrompt !== null || busy;
  }, [confirm, draftPrompt, busy]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (shortcutsBlockedRef.current) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // A modal that lives outside editor state (the photo library) still blocks: an undo
      // from inside it would change the document behind the scrim without a word.
      if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== null) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: 'undo' });
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // --- Edits ----------------------------------------------------------------
  const applyEdit = useCallback((next: T, coalesceKey?: string) => {
    setServerIssues((previous) => (previous.length === 0 ? previous : []));
    // The first edit ends a deferred draft decision — from here the autosave owns the slot.
    setDraftDeferred((deferred) => (deferred ? false : deferred));
    dispatch(
      coalesceKey === undefined
        ? { type: 'edit', document: next, time: Date.now() }
        : { type: 'edit', document: next, coalesceKey, time: Date.now() },
    );
  }, []);

  // --- Issue focus ----------------------------------------------------------
  // Walks up the path until something is on the page: `docks.items[0].steps[2]` falls back to
  // the step list, then the dock card, then the docks section.
  const focusIssue = useCallback((path: string) => {
    // Path-less issues describe the document as a whole and point at no field.
    if (path === '') return;
    let candidate = path;
    for (;;) {
      const element = document.getElementById(`field-${candidate}`);
      if (element) {
        element.scrollIntoView({ block: 'center' });
        element.focus({ preventScroll: true });
        return;
      }
      const trimmed = candidate.replace(/(\.\w+|\[\d+\])$/, '');
      if (trimmed === candidate) return;
      candidate = trimmed;
    }
  }, []);

  // --- Publish --------------------------------------------------------------
  function requestPublish() {
    const summary =
      settings.current.summarize?.(present) ?? `The ${label} goes live on the site.`;
    setConfirm({
      title: `Publish this ${label}?`,
      body: `${summary} It shows up on the site moments later.`,
      confirmLabel: 'Publish',
      tone: 'primary',
      onConfirm: () => {
        setConfirm(null);
        void doPublish();
      },
    });
  }

  async function doPublish() {
    setBusy(true);
    setStatus(null);
    // The base lets the server refuse to overwrite a version this editor never saw (a
    // publish from another device or tab). Unknown → omitted, so no check is asked for.
    const result =
      baseVersion === undefined
        ? await publishDocument(doc, present)
        : await publishDocument(doc, present, baseVersion);
    setBusy(false);
    if (result.kind === 'conflict') {
      // Someone else published (or restored) since this editor loaded. Nothing is marked
      // published; the draft is written now rather than after the debounce, so a reload a
      // moment later still finds every keystroke.
      if (draftsEnabled) writeDraft(doc, present, { tabId, base: baseVersion });
      showStatus({ tone: 'error', text: CHANGED_ELSEWHERE });
      return;
    }
    if (result.kind === 'ok') {
      // Baseline exactly the snapshot that was sent: keystrokes typed while the PUT was in
      // flight stay dirty, keep their autosaved draft, and keep beforeunload armed.
      dispatch({ type: 'published', document: present });
      setDraftDeferred(false);
      setMode('live');
      setLastSaved(result.updatedAt ?? new Date().toISOString());
      // An unknown new version means the next publish cannot name its base, so it asks for
      // no check (`undefined`) rather than claiming "nothing published yet" (`null`).
      setBaseVersion(result.updatedAt ?? undefined);
      setVersionsReload((value) => value + 1);
      showStatus(
        result.revalidated
          ? { tone: 'success', text: PUBLISHED_LIVE }
          : { tone: 'warning', text: PUBLISHED_NO_HOOK },
      );
    } else if (result.kind === 'unauthorized') {
      showStatus({ tone: 'error', text: SIGN_IN_EXPIRED });
    } else if (result.kind === 'invalid') {
      setServerIssues(result.issues);
      showStatus({
        tone: 'error',
        text: `The server declined this ${label} — the issues it reported are listed below.`,
      });
    } else {
      showStatus({ tone: 'error', text: failureText(result, 'Publishing failed') });
    }
  }

  // --- Restore --------------------------------------------------------------
  function requestRestore(version: VersionEntry) {
    setConfirm({
      title: 'Restore this version?',
      body: `The ${label} saved ${formatWhen(version.updatedAt)} goes live again${
        dirty
          ? ', and your unpublished edits here are discarded'
          : draftDeferred
            ? ', and the unpublished draft saved on this device is discarded'
            : ''
      }. It shows up on the site moments later.`,
      confirmLabel: 'Restore',
      tone: 'danger',
      onConfirm: () => {
        setConfirm(null);
        void doRestore(version);
      },
    });
  }

  async function doRestore(version: VersionEntry) {
    setBusy(true);
    setStatus(null);
    const discardsDeferredDraft = draftDeferred;
    const result = await restoreVersion(doc, version.key);
    if (result.kind === 'ok') {
      // The restore replaces the working document. A deferred draft was named in the
      // confirmation, so it goes now; this tab's own draft is cleared by the autosave's
      // clean-state cleanup once the restored version loads.
      if (discardsDeferredDraft) clearDraft(doc);
      setDraftDeferred(false);
      setVersionsReload((value) => value + 1);
      setServerIssues([]);
      const reload = (): Promise<LoadResult<T>> => loadDocument(doc, settings.current.parse);
      let reloaded = await reload();
      if (reloaded.kind === 'unavailable') {
        // One hiccup earns one retry before the owner is told to reload.
        reloaded = await reload();
      }
      if (reloaded.kind === 'ok') {
        dispatch({ type: 'load', document: reloaded.document });
        setMode(reloaded.source === 'blob' ? 'live' : 'seed');
        setLastSaved(reloaded.updatedAt);
        setBaseVersion(reloaded.source === 'blob' ? (reloaded.updatedAt ?? undefined) : null);
        showStatus(
          result.revalidated
            ? { tone: 'success', text: RESTORED_LIVE }
            : { tone: 'warning', text: RESTORED_NO_HOOK },
        );
      } else if (reloaded.kind === 'unauthorized') {
        // The restore landed but our credentials no longer do — the editor now shows a
        // stale document, so publishing locks until the page reloads.
        setMode('expired');
        showStatus({ tone: 'error', text: SIGN_IN_EXPIRED });
      } else {
        showStatus({
          tone: 'warning',
          text: 'The version was restored on the server, but the editor couldn’t reload it — reload the page before editing further.',
        });
      }
    } else if (result.kind === 'unauthorized') {
      showStatus({ tone: 'error', text: SIGN_IN_EXPIRED });
    } else if (result.kind === 'conflict') {
      // The server's sentence (another save landed mid-restore); a retry is safe.
      showStatus({ tone: 'error', text: result.message });
    } else if (result.kind === 'invalid') {
      // These issues describe the snapshot, not the current document — sending them to the
      // issues panel would focus the wrong fields, so they stay in the banner, in the
      // server's own words.
      showStatus({
        tone: 'error',
        text: `That saved version can’t be restored: ${result.issues
          .map((issue) => issue.message)
          .join(' ')} Pick another version.`,
      });
    } else if (result.status === 422 && result.message) {
      // The snapshot itself is damaged; the server's sentence says so and what to do.
      showStatus({ tone: 'error', text: result.message });
    } else if (result.status === 404) {
      setVersionsReload((value) => value + 1);
      showStatus({
        tone: 'error',
        text: 'That saved version is no longer on the server — the version list has been refreshed, so pick another.',
      });
    } else {
      // A server that answered with its own reason (a snapshot that no longer reads as a
      // document) will say the same on every retry, so that message is final.
      showStatus({
        tone: 'error',
        text:
          result.status !== null && result.message
            ? `That saved version can’t be restored: ${result.message} Pick another version.`
            : failureText(result, 'The restore didn’t go through'),
      });
    }
    setBusy(false);
  }

  const publishHint = readOnly
    ? 'Publishing is available on the live site.'
    : issues.length > 0
      ? 'Fix the listed issues to publish.'
      : dirty
        ? 'Publish these changes to the site.'
        : 'No changes to publish yet.';

  return {
    doc,
    label,
    phase,
    mode,
    loadError,
    lastSaved,
    baseVersion,

    present,
    applyEdit,
    readOnly,
    dirty,
    busy,
    rules,
    issues,
    serverIssues,

    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    shortcutModifier,

    canPublish,
    publishHint,
    requestPublish,
    requestRestore,
    versionsReload,

    status,
    showStatus,
    dismissStatus,
    announce,
    liveMessage,
    focusIssue,

    confirm,
    requestConfirm: setConfirm,
    closeConfirm: () => setConfirm(null),

    draftPrompt,
    resumeDraft: () => {
      // The resumed edits keep this load's base version: the prompt has already said when
      // they started from an older one, so publishing them is the owner's informed choice.
      if (draftPrompt) dispatch({ type: 'resume', document: draftPrompt.document });
      setDraftDeferred(false);
      setDraftPrompt(null);
    },
    discardDraft: () => {
      clearDraft(doc);
      setDraftDeferred(false);
      setDraftPrompt(null);
    },
    deferDraft: () => {
      setDraftDeferred(true);
      setDraftPrompt(null);
    },
  };
}
