'use client';

/**
 * The editor's side of the preview: the frame the page loads in, kept fed with the draft.
 *
 * The draft goes across as soon as the frame says it is listening, and again — briefly
 * debounced — after every edit. The frame reports its height back, so it grows with the page
 * and the owner scrolls the editor, never a box inside it. The frame is inert — no pointer, no
 * keyboard focus, out of the accessibility tree: a preview full of live links would carry her
 * off the page mid-edit, and every word in it is already editable in the fields beside it. A
 * visually hidden note says so, since the frame itself is no longer announced.
 */

import { useEffect, useRef, useState } from 'react';

import { PreviewFrame } from '@/components/admin/previews/PreviewFrame';
import type { PreviewDocumentKey } from '@/components/admin/previews/protocol';
import { parsePreviewMessage, previewPath } from '@/components/admin/previews/protocol';

/** Keystrokes arrive faster than the frame needs to repaint. */
const POST_DELAY_MS = 120;

/** Before the frame has reported a height, roughly a phone screen's worth. */
const INITIAL_HEIGHT = 720;

export interface PreviewHostProps {
  readonly doc: PreviewDocumentKey;
  readonly document: unknown;
  /** Names the page, e.g. "The home page". */
  readonly title: string;
}

export function PreviewHost({ doc, document, title }: PreviewHostProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  // The latest draft, readable from the ready handler without re-registering it.
  const latest = useRef(document);
  useEffect(() => {
    latest.current = document;
  }, [document]);

  function send(draft: unknown) {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      { type: 'nwf-preview-draft', doc, document: draft },
      window.location.origin,
    );
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = parsePreviewMessage(event.data);
      if (message === null || message.doc !== doc) return;
      if (message.type === 'nwf-preview-ready') {
        setReady(true);
        send(latest.current);
      } else if (message.type === 'nwf-preview-height') {
        setHeight(Math.max(240, Math.ceil(message.height)));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // `send` reads only refs and props that never change for a mounted host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => send(document), POST_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, ready]);

  return (
    <PreviewFrame title={title}>
      <p className="sr-only">
        {`A visual preview of ${title.toLowerCase()} as it will look on a phone. Everything in it comes from the fields on this screen.`}
      </p>
      <div inert>
        <iframe
          ref={frameRef}
          src={previewPath(doc)}
          title={`Preview of ${title.toLowerCase()}`}
          tabIndex={-1}
          className="pointer-events-none block w-full border-0"
          style={{ height }}
        />
      </div>
    </PreviewFrame>
  );
}
