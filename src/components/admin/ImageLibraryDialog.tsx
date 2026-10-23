'use client';

/**
 * The photo picker: every picture already uploaded, offered to a photo slot.
 *
 * A photo usually belongs in more than one place — the same corner shot suits the home page
 * and the directions page — and re-uploading it would store the bytes twice and make the
 * "is this still in use?" answer wrong. So a slot can reach for one that already exists.
 *
 * Accessibility contract, matching `ConfirmDialog`: `role="dialog"` with `aria-modal`, focus
 * moves in on open, Tab is trapped inside, Escape closes, and focus returns to the control
 * that opened it.
 */

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';

import type { DocumentKey, ImageRecord } from '@/components/admin/api';
import { imageThumbnailUrl, listImages } from '@/components/admin/api';
import { ActionButton } from '@/components/admin/buttons';
import type { ImageRef } from '@/lib/content/images';

/**
 * How the documents are named in "Used on …". A local table rather than the document
 * registry: importing that would pull every document's field spec and validator into the
 * photo screens, which need none of it. Typed against `DocumentKey`, so a new document fails
 * the build here until it is named.
 */
export const DOCUMENT_LABELS: Record<DocumentKey, string> = {
  menu: 'the menu',
  home: 'the home page',
  about: 'the about page',
  directions: 'the directions page',
};

/** "Used on the home page and the directions page." — or `null` when nothing uses it. */
export function describeUsedBy(usedBy: readonly DocumentKey[]): string | null {
  const names = usedBy.map((key) => DOCUMENT_LABELS[key]);
  if (names.length === 0) return null;
  if (names.length === 1) return `Used on ${names[0]}.`;
  const last = names[names.length - 1];
  return `Used on ${names.slice(0, -1).join(', ')} and ${last}.`;
}

/** File size in the units a person thinks in. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} bytes`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export function formatUploaded(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type LibraryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly images: readonly ImageRecord[] }
  | { readonly kind: 'failed'; readonly message: string };

export interface ImageLibraryDialogProps {
  readonly open: boolean;
  /** The chosen photo, in the shape a document stores. */
  readonly onPick: (image: ImageRef) => void;
  readonly onClose: () => void;
}

/**
 * The panel exists only while the picker is open, which is what gives each opening a fresh
 * list without an effect resetting state on the way in.
 */
export function ImageLibraryDialog({ open, onPick, onClose }: ImageLibraryDialogProps) {
  if (!open) return null;
  return <ImageLibraryPanel onPick={onPick} onClose={onClose} />;
}

function ImageLibraryPanel({
  onPick,
  onClose,
}: {
  readonly onPick: (image: ImageRef) => void;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<LibraryState>({ kind: 'loading' });

  // Latest-close ref, synced in an effect, so the trap below need not re-register its
  // listeners each time the parent passes a fresh callback identity.
  const closeLatest = useRef(onClose);
  useEffect(() => {
    closeLatest.current = onClose;
  }, [onClose]);

  // The list is fetched each time the picker opens: a photo uploaded from another slot (or
  // another tab) should be here without a page reload.
  useEffect(() => {
    let cancelled = false;
    void listImages().then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') {
        setState({ kind: 'ready', images: result.images });
      } else if (result.kind === 'unauthorized') {
        setState({ kind: 'failed', message: 'Your sign-in expired — reload the page.' });
      } else {
        setState({ kind: 'failed', message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus lands on Close: the grid arrives later, and a focus target that appears after the
    // fact would move focus out from under anyone already tabbing.
    closeRef.current?.querySelector('button')?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeLatest.current();
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
  }, []);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Click on the scrim closes — the keyboard equivalent is Escape. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-bark/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl bg-snow p-6 shadow-lift ring-1 ring-bark/10 sm:p-8"
      >
        <h2 id={titleId} className="text-2xl font-black text-bark">
          Choose a photo
        </h2>
        <p className="mt-2 text-bark/80">
          Every picture you have uploaded. Choosing one here doesn’t make a copy — the same photo
          can sit in as many places as you like.
        </p>

        <div className="mt-5 min-h-32 flex-1 overflow-y-auto">
          {state.kind === 'loading' ? (
            <p role="status" className="py-8 text-center font-bold text-bark/70">
              Loading your photos…
            </p>
          ) : state.kind === 'failed' ? (
            <p className="rounded-2xl bg-fireweed/10 p-4 font-semibold text-fireweed-deep ring-1 ring-fireweed/40">
              {state.message}
            </p>
          ) : state.images.length === 0 ? (
            <p className="rounded-2xl bg-wheat/25 p-4 font-semibold text-bark ring-1 ring-honey/60">
              No photos yet. Add one from any picture slot, or from the Photos page, and they all
              collect here.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {state.images.map((image) => {
                const used = describeUsedBy(image.usedBy);
                const added = formatUploaded(image.uploadedAt);
                return (
                  <li key={image.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onPick({ id: image.id, width: image.width, height: image.height })
                      }
                      className="w-full cursor-pointer rounded-2xl border border-bark/15 bg-cream p-2 text-left transition duration-150 hover:border-blueberry hover:bg-blueberry/5"
                    >
                      {/* The picture is decoration here: the button is named by its text. */}
                      <Image
                        src={imageThumbnailUrl(image.id)}
                        alt=""
                        width={image.width}
                        height={image.height}
                        className="h-28 w-full rounded-xl object-cover"
                      />
                      <span className="mt-2 block truncate text-sm font-bold text-bark">
                        {image.originalName === '' ? image.id : image.originalName}
                      </span>
                      <span className="mt-0.5 block text-xs text-bark/70">
                        {`${image.width} × ${image.height}`}
                        {added === '' ? '' : ` · added ${added}`}
                      </span>
                      {used ? <span className="mt-0.5 block text-xs text-bark/70">{used}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <span ref={closeRef} className="contents">
            <ActionButton variant="secondary" onClick={onClose}>
              Close
            </ActionButton>
          </span>
        </div>
      </div>
    </div>
  );
}
