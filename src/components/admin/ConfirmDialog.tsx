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
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The custom confirmation modal — the editor never calls `window.confirm`/`alert`.
 * Accessibility contract: `role="dialog"` + `aria-modal`, focus moves in on open, Tab is
 * trapped inside, Escape dismisses, and focus returns to the opening control on close.
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

  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      opener?.focus();
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
