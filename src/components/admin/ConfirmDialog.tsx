'use client';

import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

import { ActionButton } from '@/components/admin/buttons';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  /** Body copy. Keep it to a sentence or two — this is a decision, not a document. */
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** `danger` styles the confirm button fireweed and starts focus on the safe option. */
  readonly tone?: 'primary' | 'danger';
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Escape / overlay click. Defaults to `onCancel`; pass separately when dismiss ≠ cancel. */
  readonly onDismiss?: () => void;
  /**
   * The id of the element focus goes to on close when the control that opened the dialog can't
   * take it back — gone along with what it acted on, or turned off by the very action confirmed
   * (a publish disables its own button while it runs). Best: where the outcome will be reported.
   * Without one, or when it isn't on the page, the page's main heading takes focus.
   */
  readonly fallbackFocusId?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus back on `opener` — or, when it can't take it (disabled, removed, inert: `focus()` then
 * quietly does nothing), somewhere sensible instead of nowhere at all.
 */
function returnFocus(opener: HTMLElement | null, fallbackId: string | undefined): void {
  if (opener !== null) {
    opener.focus();
    if (document.activeElement === opener) return;
  }
  // Whoever closed the dialog may be about to place focus themselves — an editor moving it to
  // the row that slid into a deleted one's place (`focusSoon` runs on the next frame). So this
  // waits a frame too, and rescues only a focus still left on nothing.
  window.requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const target =
      (fallbackId === undefined ? null : document.getElementById(fallbackId)) ??
      document.querySelector<HTMLElement>('main h1') ??
      document.querySelector<HTMLElement>('main');
    if (target === null) return;
    // A heading or a wrapper only takes focus from script once it has a tabindex.
    if (!target.hasAttribute('tabindex') && target.tabIndex < 0) {
      target.setAttribute('tabindex', '-1');
    }
    // No scroll: the page stays where the owner left it; a status that follows brings itself
    // into view.
    target.focus({ preventScroll: true });
  });
}

/**
 * The custom confirmation modal — the editor never calls `window.confirm`/`alert`.
 * Accessibility contract: `role="dialog"` + `aria-modal`, focus moves in on open, Tab is
 * trapped inside, Escape dismisses, and focus returns to the opening control on close — or,
 * when that control can no longer take it, to `fallbackFocusId` or the page's main heading
 * (see `returnFocus`).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
  onDismiss,
  fallbackFocusId,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLSpanElement>(null);
  const cancelRef = useRef<HTMLSpanElement>(null);
  const dismiss = onDismiss ?? onCancel;
  // Latest-dismiss ref, synced in an effect, so the trap effect below need not re-register
  // its listeners every time the parent passes a fresh callback identity.
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);
  // Same for the fallback, read only as the dialog closes.
  const fallbackRef = useRef(fallbackFocusId);
  useEffect(() => {
    fallbackRef.current = fallbackFocusId;
  }, [fallbackFocusId]);

  useEffect(() => {
    if (!open) return;

    // Nothing focused reads as `body` — no opener to go back to (the draft prompt opens on load).
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    // Danger dialogs land focus on the safe option; plain confirms on the primary action.
    const initialHost = tone === 'danger' ? cancelRef.current : confirmRef.current;
    initialHost?.querySelector('button')?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      returnFocus(opener, fallbackRef.current);
    };
  }, [open, tone]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Click on the scrim dismisses — the keyboard equivalent is Escape. */}
      <div aria-hidden="true" onClick={dismiss} className="absolute inset-0 bg-bark/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md rounded-3xl bg-snow p-6 shadow-lift ring-1 ring-bark/10 sm:p-8"
      >
        <h2 id={titleId} className="text-2xl font-black text-bark">
          {title}
        </h2>
        <div id={bodyId} className="mt-3 text-bark/80">
          {children}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <span ref={cancelRef} className="contents">
            <ActionButton variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </ActionButton>
          </span>
          <span ref={confirmRef} className="contents">
            <ActionButton variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirmLabel}
            </ActionButton>
          </span>
        </div>
      </div>
    </div>
  );
}
