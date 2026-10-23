'use client';

import type { ReactNode } from 'react';

import { IMAGES_ENDPOINT } from '@/components/admin/api';

/** The admin preview reads photos from the auth-gated endpoint, so everything the editor loads
 *  stays inside the signed-in section (and is cached privately in that browser only). */
export const PREVIEW_IMAGE_BASE = IMAGES_ENDPOINT;

export interface PreviewFrameProps {
  /** Names the page being previewed, e.g. "The home page". */
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * The box the page previews sit in, matching the menu editor's `PreviewPane`. What goes
 * inside is `PreviewHost`'s iframe: the real page sections with the draft passed in, laid out
 * at the frame's own width — so what the owner reads here is what publishes, the way it looks
 * on a phone.
 */
export function PreviewFrame({ title, children }: PreviewFrameProps) {
  return (
    <section
      aria-labelledby="preview-heading"
      className="rounded-3xl bg-parchment p-4 ring-1 ring-bark/10 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="preview-heading" className="text-xl font-black text-bark">
          Preview
        </h2>
        <p className="text-xs font-bold tracking-[0.14em] text-wood uppercase">{title}</p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-cream ring-1 ring-bark/10">
        {children}
      </div>
    </section>
  );
}
