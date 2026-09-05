'use client';

/**
 * One picture slot: the caption, the photograph that fills it, and the three things the owner
 * can do about it.
 *
 * The caption is not decoration — it prints under the picture and it is the alt text, so it is
 * required whether or not a photo has been chosen yet. Until one is, the page reserves the
 * space with a placeholder, and this field says so rather than looking broken.
 *
 * Uploads are shrunk in the page before they are sent (`resizeImage`), which is what makes a
 * photo straight off a phone a non-event. The preview reads from the auth-gated image
 * endpoint, so everything the editor loads stays inside the signed-in section and uncached.
 */

import Image from 'next/image';
import { useRef, useState } from 'react';

import { imagePreviewUrl, uploadImage } from '@/components/admin/api';
import { ActionButton } from '@/components/admin/buttons';
import { TextField } from '@/components/admin/fields';
import { resizeImage } from '@/components/admin/image-resize';
import { ImageLibraryDialog } from '@/components/admin/ImageLibraryDialog';
import type { PhotoContent } from '@/lib/content/images';

const SIGN_IN_EXPIRED = 'Your sign-in expired — reload the page.';

/** What the buttons are doing, so the owner is never left wondering whether it took. */
type Progress = 'idle' | 'preparing' | 'uploading';

const PROGRESS_TEXT: Record<Progress, string> = {
  idle: '',
  preparing: 'Getting the photo ready…',
  uploading: 'Uploading…',
};

export interface PhotoFieldProps {
  /** Validator path of the photo itself, e.g. `bannock.photo`. */
  readonly path: string;
  readonly label: string;
  readonly hint?: string;
  readonly value: PhotoContent;
  readonly onChange: (next: PhotoContent, coalesceKey?: string) => void;
  /** No API to upload to: the controls are already disabled, this explains why. */
  readonly readOnly: boolean;
  readonly announce: (text: string) => void;
}

export function PhotoField({
  path,
  label,
  hint,
  value,
  onChange,
  readOnly,
  announce,
}: PhotoFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress>('idle');
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const busy = progress !== 'idle';
  const image = value.image;

  function fail(message: string) {
    setError(message);
    announce(message);
  }

  async function handleFile(file: File) {
    setError(null);
    setProgress('preparing');
    const prepared = await resizeImage(file);
    if ('error' in prepared) {
      setProgress('idle');
      fail(prepared.error);
      return;
    }

    setProgress('uploading');
    const result = await uploadImage(prepared.blob, {
      width: prepared.width,
      height: prepared.height,
      name: file.name,
    });
    setProgress('idle');

    if (result.kind === 'ok') {
      onChange({
        ...value,
        image: { id: result.image.id, width: result.image.width, height: result.image.height },
      });
      announce(`Photo added — ${result.image.width} by ${result.image.height} pixels.`);
      return;
    }
    fail(result.kind === 'unauthorized' ? SIGN_IN_EXPIRED : result.message);
  }

  return (
    <div
      id={`field-${path}`}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${path}-label`}
      className="rounded-2xl bg-wheat/15 p-4 ring-1 ring-wheat"
    >
      {/* A label rather than a heading: a photo slot sits at whatever depth its section does,
          and a fixed heading level here would skip one somewhere. */}
      <p id={`${path}-label`} className="text-sm font-bold tracking-wide text-bark/70 uppercase">
        {label}
      </p>
      {hint ? <p className="mt-1 text-sm text-bark/70">{hint}</p> : null}

      <TextField
        id={`field-${path}.caption`}
        label="Caption"
        value={value.caption}
        onChange={(caption) => onChange({ ...value, caption }, `${path}.caption`)}
        placeholder="Describe the picture in a few words"
        className="mt-3"
      />
      <p className="mt-1 text-sm text-bark/70">
        Printed under the picture, and read aloud to anyone using a screen reader.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        {image ? (
          <figure className="w-40 shrink-0">
            <Image
              src={imagePreviewUrl(image.id)}
              alt={value.caption}
              width={image.width}
              height={image.height}
              className="h-28 w-40 rounded-xl object-cover ring-1 ring-bark/15"
            />
            <figcaption className="mt-1 text-xs text-bark/70">
              {`${image.width} × ${image.height} pixels`}
            </figcaption>
          </figure>
        ) : (
          <p className="max-w-sm flex-1 text-sm text-bark/70">
            No picture here yet — the page keeps the space with a soft placeholder and prints the
            caption underneath.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {image ? 'Replace photo' : 'Upload a photo'}
          </ActionButton>
          <ActionButton
            variant="subtle"
            size="sm"
            disabled={busy}
            onClick={() => {
              setError(null);
              setLibraryOpen(true);
            }}
          >
            Choose from library
          </ActionButton>
          {image ? (
            <ActionButton
              variant="subtle"
              size="sm"
              disabled={busy}
              onClick={() => {
                onChange({ ...value, image: null });
                setError(null);
                announce('Photo removed — Undo can bring it back.');
              }}
            >
              Remove photo
            </ActionButton>
          ) : null}
        </div>
      </div>

      {busy ? (
        <p role="status" className="mt-3 text-sm font-bold text-bark/75">
          {PROGRESS_TEXT[progress]}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-fireweed-deep">{error}</p> : null}
      {readOnly ? (
        <p className="mt-3 text-sm text-bark/70">
          Adding and removing photos is available on the live site.
        </p>
      ) : null}

      {/* Hidden on purpose: the styled button opens it, so the control matches every other
          button on the page instead of the browser's own file widget. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clearing the value lets the same file be picked again after a failure.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      <ImageLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={(picked) => {
          setLibraryOpen(false);
          onChange({ ...value, image: picked });
          announce(`Photo chosen — ${picked.width} by ${picked.height} pixels.`);
        }}
      />
    </div>
  );
}
