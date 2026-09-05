'use client';

/**
 * What loads inside the preview iframe: the page's own sections, drawn from whatever draft the
 * editor last posted. Until one arrives it shows the committed default, so the route also
 * stands on its own.
 *
 * Only same-origin messages are honored, and every draft is run through the document's
 * structural parser before it renders — a message is untrusted input like any other.
 */

import { useEffect, useState } from 'react';

import { AboutPreview } from '@/components/admin/previews/AboutPreview';
import { DirectionsPreview } from '@/components/admin/previews/DirectionsPreview';
import { HomePreview } from '@/components/admin/previews/HomePreview';
import type { PreviewDocumentKey, PreviewMessage } from '@/components/admin/previews/protocol';
import { parsePreviewMessage } from '@/components/admin/previews/protocol';
import aboutSeed from '@/data/defaults/about.json';
import directionsSeed from '@/data/defaults/directions.json';
import homeSeed from '@/data/defaults/home.json';
import { DOCUMENTS } from '@/lib/content-docs';
import type { AboutContent } from '@/lib/content/about';
import type { DirectionsContent } from '@/lib/content/directions';
import type { HomeContent } from '@/lib/content/home';

const SEEDS: Record<PreviewDocumentKey, unknown> = {
  home: homeSeed,
  about: aboutSeed,
  directions: directionsSeed,
};

function post(message: PreviewMessage): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

export interface PreviewPageProps {
  readonly doc: PreviewDocumentKey;
}

export function PreviewPage({ doc }: PreviewPageProps) {
  // The default ships in this repo and its editor parses it on load, so it is trusted here.
  const [document, setDocument] = useState<unknown>(SEEDS[doc]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const message = parsePreviewMessage(event.data);
      if (message === null || message.type !== 'nwf-preview-draft' || message.doc !== doc) return;
      const parsed = DOCUMENTS[doc].parse(message.document);
      // A draft mid-edit can be structurally off for a moment; keep the last good one.
      if (parsed.document !== null) setDocument(parsed.document);
    }
    window.addEventListener('message', onMessage);
    post({ type: 'nwf-preview-ready', doc });
    return () => window.removeEventListener('message', onMessage);
  }, [doc]);

  // The editor sizes the frame to the page, so the whole preview reads inline with no inner
  // scrollbar. Reported after every layout change, photos loading included.
  useEffect(() => {
    const body = window.document.body;
    const report = () => post({ type: 'nwf-preview-height', doc, height: body.scrollHeight });
    const observer = new ResizeObserver(report);
    observer.observe(body);
    report();
    return () => observer.disconnect();
  }, [doc]);

  switch (doc) {
    case 'home':
      return <HomePreview content={document as HomeContent} />;
    case 'about':
      return <AboutPreview content={document as AboutContent} />;
    case 'directions':
      return <DirectionsPreview content={document as DirectionsContent} />;
  }
}
