/**
 * The messages between an editor and its preview frame.
 *
 * The preview is a same-origin `<iframe>` rather than an inline render because the site's
 * layout breakpoints follow the viewport: inline, a narrow preview column would still get the
 * wide-screen layout and squeeze it. Inside an iframe the page sees the frame's own width and
 * lays out the way it does on a phone, which is what most visitors see anyway.
 */

import type { DocumentKey } from '@/lib/content-docs';

/** The documents that have a page preview; the menu keeps its inline card preview. */
export type PreviewDocumentKey = Exclude<DocumentKey, 'menu'>;

export const PREVIEW_DOCUMENT_KEYS: readonly PreviewDocumentKey[] = ['home', 'about', 'directions'];

export function isPreviewDocumentKey(value: unknown): value is PreviewDocumentKey {
  return typeof value === 'string' && (PREVIEW_DOCUMENT_KEYS as readonly string[]).includes(value);
}

export function previewPath(doc: PreviewDocumentKey): string {
  return `/admin/preview/${doc}/`;
}

/** Frame → editor: mounted and listening. The editor answers with the current draft. */
export interface PreviewReadyMessage {
  readonly type: 'nwf-preview-ready';
  readonly doc: PreviewDocumentKey;
}

/** Frame → editor: the rendered page's height, so the frame can grow to fit it. */
export interface PreviewHeightMessage {
  readonly type: 'nwf-preview-height';
  readonly doc: PreviewDocumentKey;
  readonly height: number;
}

/** Editor → frame: render this draft. */
export interface PreviewDraftMessage {
  readonly type: 'nwf-preview-draft';
  readonly doc: PreviewDocumentKey;
  readonly document: unknown;
}

export type PreviewMessage = PreviewReadyMessage | PreviewHeightMessage | PreviewDraftMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A message this protocol recognizes, or `null` — anything else on the window is ignored. */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (!isRecord(data) || !isPreviewDocumentKey(data.doc)) return null;
  switch (data.type) {
    case 'nwf-preview-ready':
      return { type: 'nwf-preview-ready', doc: data.doc };
    case 'nwf-preview-height':
      return typeof data.height === 'number' && Number.isFinite(data.height)
        ? { type: 'nwf-preview-height', doc: data.doc, height: data.height }
        : null;
    case 'nwf-preview-draft':
      return { type: 'nwf-preview-draft', doc: data.doc, document: data.document };
    default:
      return null;
  }
}
