'use client';

/**
 * `/admin/photos/` — every photograph on the site in one place: add one, see where each is
 * used, and delete the ones nothing needs any more.
 *
 * The photo slots on the page editors can do all of this too, one slot at a time. This screen
 * exists for the questions a slot cannot answer: what is in here, what is it costing, and what
 * is safe to throw away. A picture a page still points at is not safe, and neither is one a
 * page's saved versions still hold (restoring one would put it back), so its delete button is
 * off and says why — the server refuses that anyway, and being told before the click is kinder
 * than being told after.
 *
 * There is no draft and nothing to publish: uploads and deletions take effect at once, which
 * is why deleting asks first.
 */

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DocumentKey, ImageRecord, ImagesResult } from '@/components/admin/api';
import { deleteImage, imageThumbnailUrl, listImages, uploadImage } from '@/components/admin/api';
import { ActionButton } from '@/components/admin/buttons';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { resizeImage } from '@/components/admin/image-resize';
import {
  DOCUMENT_LABELS,
  describeUsedBy,
  formatBytes,
  formatUploaded,
} from '@/components/admin/ImageLibraryDialog';
import { StatusBanner } from '@/components/admin/StatusBanner';
import type { StatusMessage } from '@/components/admin/StatusBanner';

const SIGN_IN_EXPIRED = 'Your sign-in expired — reload the page.';
/** The status banner's wrapper — where focus lands after a confirmed delete (see `ConfirmDialog`). */
const LIBRARY_STATUS_ID = 'library-status';

type LibraryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly images: readonly ImageRecord[] }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'failed'; readonly message: string };

type Progress = 'idle' | 'preparing' | 'uploading' | 'deleting';

const PROGRESS_TEXT: Record<Progress, string> = {
  idle: '',
  preparing: 'Getting the photo ready…',
  uploading: 'Uploading…',
  deleting: 'Deleting…',
};

/**
 * "Kept in the saved versions of the home page — …" for a photo only version history still
 * holds, or `null`. The server refuses that delete (a restore would put the photo back on the
 * site), so the card says so up front instead of leaving it to a refused click.
 */
function describeInHistory(inHistory: readonly DocumentKey[]): string | null {
  const names = inHistory.map((key) => DOCUMENT_LABELS[key]);
  if (names.length === 0) return null;
  const where =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Kept in the saved versions of ${where} — it can be deleted once those versions age out.`;
}

/** The library's answer, as a panel state. */
function toState(result: ImagesResult): LibraryState {
  if (result.kind === 'ok') return { kind: 'ready', images: result.images };
  if (result.kind === 'unauthorized') return { kind: 'unauthorized' };
  return { kind: 'failed', message: result.message };
}

export function PhotoLibrary() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<LibraryState>({ kind: 'loading' });
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [progress, setProgress] = useState<Progress>('idle');
  const [pendingDelete, setPendingDelete] = useState<ImageRecord | null>(null);
  /** The nonce remounts the node, so the same sentence twice running is announced twice. */
  const [liveMessage, setLiveMessage] = useState({ text: '', nonce: 0 });
  const busy = progress !== 'idle';

  const announce = useCallback((text: string) => {
    setLiveMessage((previous) => ({ text, nonce: previous.nonce + 1 }));
  }, []);

  // The first fetch. State only moves once the answer is in — the component starts on the
  // loading panel — and the cancel flag keeps a Strict Mode double-mount from answering twice.
  useEffect(() => {
    let cancelled = false;
    void listImages({ history: true }).then((result) => {
      if (!cancelled) setState(toState(result));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Fetch again in place — after a refused delete, when the list is known to be stale. */
  function reload() {
    void listImages({ history: true }).then((result) => setState(toState(result)));
  }

  /** "Try again" — unlike the first load, this one has a panel to replace, so it says so. */
  function retry() {
    setState({ kind: 'loading' });
    reload();
  }

  async function handleFile(file: File) {
    setStatus(null);
    setProgress('preparing');
    const prepared = await resizeImage(file);
    if ('error' in prepared) {
      setProgress('idle');
      setStatus({ tone: 'error', text: prepared.error });
      announce(prepared.error);
      return;
    }

    setProgress('uploading');
    const result = await uploadImage(prepared.blob, {
      width: prepared.width,
      height: prepared.height,
      name: file.name,
      small: prepared.small,
    });
    setProgress('idle');

    if (result.kind === 'ok') {
      const added = result.image;
      setState((previous) =>
        previous.kind === 'ready'
          ? { kind: 'ready', images: [added, ...previous.images] }
          : previous,
      );
      const text = `Photo added — ${added.width} by ${added.height} pixels. Use it from any picture slot on a page.`;
      setStatus({ tone: 'success', text });
      announce(text);
      return;
    }
    const message = result.kind === 'unauthorized' ? SIGN_IN_EXPIRED : result.message;
    setStatus({ tone: 'error', text: message });
    announce(message);
  }

  async function doDelete(image: ImageRecord) {
    setStatus(null);
    setProgress('deleting');
    const result = await deleteImage(image.id);
    setProgress('idle');

    if (result.kind === 'ok' || result.kind === 'missing') {
      setState((previous) =>
        previous.kind === 'ready'
          ? { kind: 'ready', images: previous.images.filter((entry) => entry.id !== image.id) }
          : previous,
      );
      const text =
        result.kind === 'ok'
          ? 'Photo deleted.'
          : 'That photo was already gone from the server — the list is up to date now.';
      setStatus({ tone: result.kind === 'ok' ? 'success' : 'warning', text });
      announce(text);
      return;
    }
    if (result.kind === 'in-use') {
      // The page it is used on changed since this list loaded, so refresh what is shown.
      reload();
    }
    const message = result.kind === 'unauthorized' ? SIGN_IN_EXPIRED : result.message;
    setStatus({ tone: 'error', text: message });
    announce(message);
  }

  const canAdd = state.kind === 'ready';

  return (
    <div>
      <section className="rounded-3xl bg-snow p-5 shadow-card ring-1 ring-bark/10 sm:p-6">
        <h2 className="text-xl font-black text-bark">Add a photo</h2>
        <p className="mt-2 max-w-2xl text-bark/80">
          Pick a picture from this computer or phone. It is shrunk to the size the site needs
          before it uploads, so a photo straight off a camera is fine. Once it is here, you can
          drop it into any picture slot on the home, about or directions page.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionButton disabled={!canAdd || busy} onClick={() => fileRef.current?.click()}>
            Choose a photo
          </ActionButton>
          {busy ? (
            <p role="status" className="text-sm font-bold text-bark/75">
              {PROGRESS_TEXT[progress]}
            </p>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          disabled={!canAdd || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clearing the value lets the same file be picked again after a failure.
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </section>

      {/* Takes focus when a confirmed delete leaves the dialog nothing to return it to: the
          outcome is reported right here. */}
      <div id={LIBRARY_STATUS_ID} tabIndex={-1} className="mt-4">
        <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      </div>

      <section aria-labelledby="library-heading" className="mt-6">
        <h2 id="library-heading" className="text-xl font-black text-bark">
          Your photos
        </h2>

        {state.kind === 'loading' ? (
          <p role="status" className="mt-4 rounded-3xl bg-snow p-8 text-center font-bold text-bark/70 shadow-card ring-1 ring-bark/10">
            Loading your photos…
          </p>
        ) : state.kind === 'unauthorized' ? (
          <p className="mt-4 rounded-2xl bg-fireweed/10 p-4 font-semibold text-fireweed-deep ring-1 ring-fireweed/40">
            {SIGN_IN_EXPIRED}
          </p>
        ) : state.kind === 'failed' ? (
          <div className="mt-4 rounded-2xl bg-wheat/25 p-4 ring-1 ring-honey/60">
            <p className="font-semibold text-bark">{state.message}</p>
            <p className="mt-1 text-sm text-bark/80">
              If you are running the site on your own computer, the photo store is not available
              there — open this page on the live site, or run{' '}
              <code className="rounded bg-snow px-1.5 py-0.5 font-mono text-sm">netlify dev</code>.
            </p>
            <ActionButton variant="secondary" size="sm" className="mt-3" onClick={retry}>
              Try again
            </ActionButton>
          </div>
        ) : state.images.length === 0 ? (
          <p className="mt-4 rounded-3xl border-2 border-dashed border-bark/20 p-8 text-center font-semibold text-bark/70">
            No photos yet. Add the first one above — the site shows a soft placeholder wherever a
            picture is missing, so nothing looks broken while you gather them.
          </p>
        ) : (
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {state.images.map((image) => {
              const used = describeUsedBy(image.usedBy);
              const kept = describeInHistory(image.inHistory);
              const inUse = image.usedBy.length > 0;
              const locked = inUse || kept !== null;
              const added = formatUploaded(image.uploadedAt);
              return (
                <li
                  key={image.id}
                  className="rounded-3xl bg-snow p-4 shadow-card ring-1 ring-bark/10"
                >
                  <Image
                    src={imageThumbnailUrl(image.id)}
                    alt=""
                    width={image.width}
                    height={image.height}
                    className="h-40 w-full rounded-2xl object-cover ring-1 ring-bark/10"
                  />
                  <h3 className="mt-3 truncate font-bold text-bark">
                    {image.originalName === '' ? image.id : image.originalName}
                  </h3>
                  <p className="mt-1 text-sm text-bark/70">
                    {`${image.width} × ${image.height}`}
                    {formatBytes(image.bytes) === '' ? '' : ` · ${formatBytes(image.bytes)}`}
                    {added === '' ? '' : ` · added ${added}`}
                  </p>
                  <p className="mt-1 text-sm text-bark/70">
                    {used ?? (kept === null ? 'Not used on the site yet.' : 'Not on the site right now.')}
                  </p>
                  <ActionButton
                    variant="subtle"
                    size="sm"
                    className="mt-3"
                    disabled={busy || locked}
                    title={
                      inUse
                        ? 'Take this photo off the pages that use it first.'
                        : kept !== null
                          ? 'Saved versions of a page still hold this photo.'
                          : 'Delete this photo for good.'
                    }
                    onClick={() => setPendingDelete(image)}
                  >
                    Delete
                  </ActionButton>
                  {inUse ? (
                    <p className="mt-1 text-sm text-bark/70">
                      To delete it, first remove it from the page that uses it.
                    </p>
                  ) : kept !== null ? (
                    <p className="mt-1 text-sm text-bark/70">{kept}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Outcomes speak here — an always-mounted, visually hidden region, the same
          arrangement the document editors use. */}
      <div aria-live="polite" className="sr-only">
        <p key={liveMessage.nonce}>{liveMessage.text}</p>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this photo?"
        confirmLabel="Delete photo"
        tone="danger"
        onConfirm={() => {
          const image = pendingDelete;
          setPendingDelete(null);
          if (image) void doDelete(image);
        }}
        onCancel={() => setPendingDelete(null)}
        fallbackFocusId={LIBRARY_STATUS_ID}
      >
        {pendingDelete
          ? `“${pendingDelete.originalName === '' ? pendingDelete.id : pendingDelete.originalName}” is removed from the photo store for good. Nothing on the site uses it, and this cannot be undone.`
          : ''}
      </ConfirmDialog>
    </div>
  );
}
