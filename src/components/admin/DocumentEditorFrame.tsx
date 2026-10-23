'use client';

/**
 * The chrome around any document editor: the sticky action bar (undo/redo, dirty and issue
 * badges, preview toggle, publish), the mode notices, the status banner, the two-column
 * layout, the issues panel, version history, the live region and the dialog host.
 *
 * It renders one `useDocumentEditor` result and nothing else — `children` is the fields
 * column, so a screen only writes its own fields. Every string it prints about the document
 * uses `editor.label`, so the same frame speaks correctly for the menu and for a page.
 */

import type { ReactNode } from 'react';
import { useState, useSyncExternalStore } from 'react';

import { ActionButton } from '@/components/admin/buttons';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { IssuesPanel } from '@/components/admin/IssuesPanel';
import { StatusBanner } from '@/components/admin/StatusBanner';
import type { DocumentEditor } from '@/components/admin/use-document-editor';
import { formatWhen, STATUS_BANNER_ID } from '@/components/admin/use-document-editor';
import { VersionHistory } from '@/components/admin/VersionHistory';

/** Tailwind's `lg` — where the preview column stops hiding behind its toggle. */
const WIDE_SCREEN = '(min-width: 64rem)';

function subscribeToWideScreen(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_SCREEN);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Whether the viewport is wide enough to show the preview column. `false` on the server and
 * through hydration, so the preview always starts unmounted and the markup matches.
 */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeToWideScreen,
    () => window.matchMedia(WIDE_SCREEN).matches,
    () => false,
  );
}

export interface DocumentEditorFrameProps<T> {
  readonly editor: DocumentEditor<T>;
  /** The fields column — everything the screen itself renders. */
  readonly children: ReactNode;
  /** The live preview, shown beside the fields on wide screens. Omit for an editor without one. */
  readonly preview?: ReactNode;
  /** Names the preview in the small-screen toggle: "Show preview", "Show page preview". */
  readonly previewLabel?: string;
  /** Turns a validator path into something the owner can read, for the issues panel. */
  readonly describePath: (path: string) => string;
}

export function DocumentEditorFrame<T>({
  editor,
  children,
  preview,
  previewLabel = 'preview',
  describePath,
}: DocumentEditorFrameProps<T>) {
  const [showPreview, setShowPreview] = useState(false);
  /**
   * The preview is only mounted while it can be seen: beside the fields on a wide screen, or
   * opened with the toggle on a small one. Hidden with CSS alone, a phone would still load the
   * preview frame and post every edit into it for nothing.
   */
  const previewVisible = useWideScreen() || showPreview;

  // --- Preview toggle (small screens) ---------------------------------------
  // The pane is the last element on the page, so just unhiding it looks like nothing
  // happened — opening also scrolls it into view and moves focus to it.
  function togglePreview() {
    const opening = !showPreview;
    setShowPreview(opening);
    if (!opening) return;
    window.requestAnimationFrame(() => {
      const pane = document.getElementById('preview-pane');
      if (!pane) return;
      pane.scrollIntoView({ block: 'start' });
      pane.focus({ preventScroll: true });
    });
  }

  if (editor.phase === 'loading') {
    return (
      <div role="status" aria-live="polite" className="rounded-3xl bg-snow p-8 text-center shadow-card ring-1 ring-bark/10">
        <p className="font-bold text-bark/70">{`Loading the ${editor.label}…`}</p>
      </div>
    );
  }

  const { draftPrompt, confirm, issues, mode, label } = editor;
  /**
   * The draft started from a version that has since been replaced by another publish. Where it
   * started is kept through a resume (`startedFrom`), so it still reads as behind on a later visit.
   */
  const draftOrigin =
    draftPrompt === null
      ? undefined
      : draftPrompt.startedFrom !== undefined
        ? draftPrompt.startedFrom
        : draftPrompt.base;
  const draftIsBehind =
    draftPrompt !== null &&
    draftOrigin !== undefined &&
    editor.baseVersion !== undefined &&
    draftOrigin !== editor.baseVersion;
  const draftBehindNote = draftIsBehind
    ? ` They were started before the ${label} was last published, so publishing them would replace those newer changes — look them over first.`
    : '';

  return (
    <div>
      {/* Sticky action bar: undo/redo, state, publish — always within reach. */}
      <div className="sticky top-0 z-40 -mx-1 rounded-b-2xl border-b border-bark/10 bg-cream/95 px-1 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={!editor.canUndo}
            onClick={editor.undo}
            title={`Undo (${editor.shortcutModifier}+Z)`}
          >
            Undo
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={!editor.canRedo}
            onClick={editor.redo}
            title={`Redo (${editor.shortcutModifier}+Shift+Z)`}
          >
            Redo
          </ActionButton>
          {editor.dirty ? (
            <span className="rounded-full bg-honey/15 px-3 py-1 text-xs font-bold text-bark">
              Unpublished changes
            </span>
          ) : null}
          {issues.length > 0 ? (
            <a
              href="#issues"
              className="rounded-full bg-fireweed/10 px-3 py-1 text-xs font-bold text-fireweed-deep no-underline hover:bg-fireweed/20"
            >
              {issues.length === 1 ? '1 thing to fix' : `${issues.length} things to fix`}
            </a>
          ) : null}
          <span className="flex-1" />
          {preview ? (
            <ActionButton
              variant="subtle"
              size="sm"
              className="lg:hidden"
              ariaExpanded={showPreview}
              ariaControls="preview-pane"
              onClick={togglePreview}
            >
              {showPreview ? `Hide ${previewLabel}` : `Show ${previewLabel}`}
            </ActionButton>
          ) : null}
          <ActionButton
            size="sm"
            disabled={!editor.canPublish}
            onClick={editor.requestPublish}
            title={editor.publishHint}
          >
            {editor.busy ? 'Working…' : 'Publish'}
          </ActionButton>
        </div>
        <p className="mt-2 text-sm text-bark/70">
          {mode === 'live' ? (
            <>
              Editing the <strong className="font-bold text-bark">{`live ${label}`}</strong>
              {editor.lastSaved ? ` — last published ${formatWhen(editor.lastSaved)}.` : '.'}
            </>
          ) : mode === 'seed' ? (
            <>
              Editing the <strong className="font-bold text-bark">{`current ${label}`}</strong>{' '}
              — nothing has been published yet, so this is what the site shows today.
            </>
          ) : (
            <>
              Editing the <strong className="font-bold text-bark">{`current ${label}`}</strong>{' '}
              as the site shows it today, read-only.
            </>
          )}
        </p>
      </div>

      {mode === 'offline' ? (
        <div className="mt-4 rounded-2xl bg-wheat/25 p-4 ring-1 ring-honey/60">
          <p className="font-semibold text-bark">
            {`The ${label} store can’t be reached, so editing and publishing are turned off and what you see is the built-in copy. Any draft saved on this device is kept for when it loads. To edit for real, open the editor on the live site (or reload if you are on it), or run `}
            <code className="rounded bg-snow px-1.5 py-0.5 font-mono text-sm">netlify dev</code>.
          </p>
        </div>
      ) : null}

      {mode === 'error' ? (
        <div className="mt-4 rounded-2xl bg-fireweed/10 p-4 ring-1 ring-fireweed/40">
          <p className="font-semibold text-fireweed-deep">
            {`The live ${label} couldn’t be loaded: ${editor.loadError ?? 'the server reported an error.'}`}
          </p>
          {/* Only a damaged stored document calls for a restore; after a hiccup reading a healthy
              one, a restore would just roll the live page back. */}
          <p className="mt-1 text-sm text-bark/80">
            {editor.loadDamaged
              ? `Editing is paused for now. Restoring a saved version from Version history below can put a working ${label} back.`
              : `This ${label} couldn’t be loaded just now — reload the page to try again; nothing has been changed.`}
          </p>
        </div>
      ) : null}

      {/* `showStatus` scrolls this into view by id — see `STATUS_BANNER_ID`. It also takes focus
          when a confirmed publish or restore disables the button that asked (the dialog's
          `fallbackFocusId`): the outcome is reported right here. */}
      <div id={STATUS_BANNER_ID} tabIndex={-1} className="scroll-mt-28">
        <StatusBanner className="mt-4" status={editor.status} onDismiss={editor.dismissStatus} />
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-6">
        {/* ------------------------------------------------ editing column */}
        <div className="space-y-6">{children}</div>

        {/* ------------------------------------------------ review column */}
        <div className="mt-8 space-y-5 lg:mt-0">
          <section aria-labelledby="review-heading" id="issues" className="scroll-mt-28">
            <h2 id="review-heading" className="sr-only">
              Review and publish
            </h2>
            <IssuesPanel
              issues={issues}
              serverIssues={editor.serverIssues}
              describePath={describePath}
              onSelect={editor.focusIssue}
            />
            {/* Stays enabled in `error` mode: a restore is how a broken store gets fixed. */}
            <VersionHistory
              className="mt-4"
              doc={editor.doc}
              label={label}
              enabled={mode !== 'offline' && mode !== 'expired'}
              reloadKey={editor.versionsReload}
              busy={editor.busy}
              onRestore={editor.requestRestore}
            />
          </section>

          {/* The pane itself always renders — the toggle's `aria-controls` names it and opening
              focuses it — while what is in it mounts only when it shows (`previewVisible`). */}
          {preview ? (
            <div
              id="preview-pane"
              tabIndex={-1}
              className={`scroll-mt-28 ${showPreview ? 'block' : 'hidden lg:block'}`}
            >
              {previewVisible ? preview : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Reorder and removal outcomes are announced here — an always-mounted, visually
          hidden region; the StatusBanner is too visually loud for a per-move note. */}
      <div aria-live="polite" className="sr-only">
        <p key={editor.liveMessage.nonce}>{editor.liveMessage.text}</p>
      </div>

      {/* One dialog host serves every confirmation. */}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        cancelLabel={confirm?.cancelLabel ?? 'Cancel'}
        tone={confirm?.tone ?? 'primary'}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={editor.closeConfirm}
        fallbackFocusId={STATUS_BANNER_ID}
      >
        {confirm?.body}
      </ConfirmDialog>

      {/* Draft prompt: one localStorage slot per document holds the draft. Resume loads it,
          Discard clears it, and Escape/scrim defers the decision — `draftDeferred` keeps the
          autosave's clean-state cleanup from clearing the slot until a resume, discard,
          publish, restore, or fresh edit settles the draft's fate. */}
      <ConfirmDialog
        open={draftPrompt !== null}
        title="Resume your saved draft?"
        confirmLabel="Resume draft"
        cancelLabel="Discard draft"
        tone="primary"
        onConfirm={editor.resumeDraft}
        onCancel={editor.discardDraft}
        onDismiss={editor.deferDraft}
      >
        {draftPrompt?.savedAt
          ? `Unpublished edits from ${formatWhen(draftPrompt.savedAt)} are saved on this device. Resume them, or discard them and start from the ${label} that just loaded.${draftBehindNote}`
          : `Unpublished edits are saved on this device. Resume them, or discard them and start from the ${label} that just loaded.${draftBehindNote}`}
      </ConfirmDialog>
    </div>
  );
}
