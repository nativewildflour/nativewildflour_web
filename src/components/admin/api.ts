/**
 * Typed client for the admin API (Netlify Functions registered under `/admin/api/*`, so the
 * browser re-sends the Basic credentials it already holds for the page).
 *
 * Every helper resolves — never throws — to a discriminated result the editor can render:
 * plain `next dev` serves no functions, so a failed or non-JSON response is an expected state
 * (the editor degrades to read-only), not an exception.
 *
 * Content routes are per document — `/admin/api/content/<doc>`, with `/versions` and
 * `/restore` beneath it. The rules endpoint and the photo endpoints are shared by every
 * editor. Every failing status answers in one shape, `{ ok: false, issues: [{ path, message }] }`,
 * so the message the server wrote is always the message the owner reads.
 */

// Type-only: the registry (`DOCUMENTS`) would drag every document's spec and validator into
// any bundle that touches this module, and nothing here needs more than the key's shape.
import type { DocumentKey } from '@/lib/content-docs';
import type { ContentRules, CopyIssue } from '@/lib/copy-rules';

export type { DocumentKey };

const CONTENT_ENDPOINT = '/admin/api/content';
const RULES_ENDPOINT = '/admin/api/rules';
const IMAGES_ENDPOINT = '/admin/api/images';

/**
 * A document's structural parser — the registry's `parse` (or `parseMenuContent`, adapted).
 * Passing it in is what keeps this client generic: it never learns a document's shape.
 */
export type DocumentParser<T> = (value: unknown) => {
  readonly document: T | null;
  readonly errors: readonly string[];
};

export type DocumentSource = 'blob' | 'seed';

export type LoadResult<T> =
  | {
      readonly kind: 'ok';
      readonly source: DocumentSource;
      readonly document: T;
      readonly updatedAt: string | null;
    }
  | { readonly kind: 'unauthorized' }
  /** The API is unreachable or answered with something that is not the document. */
  | { readonly kind: 'unavailable'; readonly detail: string }
  /**
   * The API answered, but with a failure of its own — e.g. a corrupt stored document. Unlike
   * `unavailable` (no functions running), the store is live and a restore can still fix it.
   */
  | { readonly kind: 'server-error'; readonly message: string };

export type SaveResult =
  | { readonly kind: 'ok'; readonly updatedAt: string | null; readonly revalidated: boolean }
  | { readonly kind: 'invalid'; readonly issues: readonly CopyIssue[] }
  | { readonly kind: 'unauthorized' }
  /** `status` is the HTTP status when there was a response, `null` when the fetch threw. */
  | { readonly kind: 'failed'; readonly detail: string; readonly status: number | null };

export interface VersionEntry {
  readonly key: string;
  readonly updatedAt: string;
}

export type VersionsResult =
  | { readonly kind: 'ok'; readonly versions: readonly VersionEntry[] }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'failed'; readonly detail: string };

/** One stored photo, as the library and the photo fields see it. */
export interface ImageRecord {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly uploadedAt: string;
  readonly originalName: string;
  /** Documents whose saved content references this photo — the reason a delete is refused. */
  readonly usedBy: readonly DocumentKey[];
}

export type ImagesResult =
  | { readonly kind: 'ok'; readonly images: readonly ImageRecord[] }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'failed'; readonly message: string };

export type UploadResult =
  | { readonly kind: 'ok'; readonly image: ImageRecord }
  | { readonly kind: 'unauthorized' }
  /** The server looked at the file and said no — too large, not a JPEG, bad dimensions. */
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

export type DeleteImageResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'unauthorized' }
  /** A saved document still points at the photo; the message names where. */
  | { readonly kind: 'in-use'; readonly message: string }
  | { readonly kind: 'missing'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a response body as JSON; `null` when it is missing or not JSON (e.g. an HTML 404). */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** The server's issue list, coerced defensively — a malformed entry becomes a plain message. */
function toIssues(value: unknown): readonly CopyIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CopyIssue[] => {
    if (isRecord(entry) && typeof entry.message === 'string') {
      return [{ path: typeof entry.path === 'string' ? entry.path : '', message: entry.message }];
    }
    return [];
  });
}

/** The sentence the server wrote for a refused request, or `fallback` when it wrote none. */
function messageFrom(body: unknown, fallback: string): string {
  const issues = toIssues(isRecord(body) ? body.issues : null);
  return issues[0]?.message ?? fallback;
}

function documentEndpoint(doc: DocumentKey): string {
  return `${CONTENT_ENDPOINT}/${doc}`;
}

/**
 * The saved document for `doc`, or the committed seed when nothing has been published yet.
 * `parse` is the caller's structural check: a stored document that no longer matches its shape
 * is a `server-error` (the store is live, so version history is the way back), never a crash.
 */
export async function loadDocument<T>(
  doc: DocumentKey,
  parse: DocumentParser<T>,
): Promise<LoadResult<T>> {
  let response: Response;
  try {
    response = await fetch(documentEndpoint(doc), { cache: 'no-store' });
  } catch (error) {
    return { kind: 'unavailable', detail: String(error) };
  }
  if (response.status === 401) return { kind: 'unauthorized' };

  const body = await readJson(response);
  if (!response.ok) {
    // A `{ ok: false, issues }` body is the function itself reporting a failure (e.g. a
    // corrupt blob) — the store is live, so this is a server error, not "no API here".
    if (isRecord(body) && body.ok === false) {
      return { kind: 'server-error', message: messageFrom(body, `HTTP ${response.status}`) };
    }
    return { kind: 'unavailable', detail: `HTTP ${response.status}` };
  }
  if (!isRecord(body)) return { kind: 'unavailable', detail: 'The response was not JSON.' };

  const { document, errors } = parse(body.document);
  if (document === null) {
    return {
      kind: 'server-error',
      message: `The stored content did not validate: ${errors.join('; ')}`,
    };
  }
  return {
    kind: 'ok',
    source: body.source === 'blob' ? 'blob' : 'seed',
    document,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
  };
}

async function saveRequest(
  endpoint: string,
  method: 'PUT' | 'POST',
  payload: unknown,
): Promise<SaveResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return { kind: 'failed', detail: String(error), status: null };
  }
  if (response.status === 401) return { kind: 'unauthorized' };

  const body = await readJson(response);
  // 400 carries validation issues; 409 (the document changed underneath) and 413 (too large)
  // answer in the same `{ ok: false, issues }` shape with path-less messages. All three
  // surface as `invalid` so the message reaches the owner.
  if (response.status === 400 || response.status === 409 || response.status === 413) {
    const issues = toIssues(isRecord(body) ? body.issues : null);
    return {
      kind: 'invalid',
      issues:
        issues.length > 0
          ? issues
          : [{ path: '', message: `The server declined the save (HTTP ${response.status}).` }],
    };
  }
  if (!response.ok || !isRecord(body) || body.ok !== true) {
    return { kind: 'failed', detail: `HTTP ${response.status}`, status: response.status };
  }
  return {
    kind: 'ok',
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
    revalidated: body.revalidated === true,
  };
}

/** `updatedAt` is the server's field to set; stripping it keeps the payload canonical. */
function withoutUpdatedAt(document: object): Record<string, unknown> {
  const { updatedAt, ...rest } = document as Record<string, unknown>;
  void updatedAt;
  return rest;
}

/** PUT the document. The server re-validates, snapshots, writes and asks the site to refresh. */
export function publishDocument<T extends object>(
  doc: DocumentKey,
  document: T,
): Promise<SaveResult> {
  return saveRequest(documentEndpoint(doc), 'PUT', { document: withoutUpdatedAt(document) });
}

/** Restore a snapshot by key — the server runs the same pipeline as a publish. */
export function restoreVersion(doc: DocumentKey, key: string): Promise<SaveResult> {
  return saveRequest(`${documentEndpoint(doc)}/restore`, 'POST', { key });
}

export async function loadVersions(doc: DocumentKey): Promise<VersionsResult> {
  let response: Response;
  try {
    response = await fetch(`${documentEndpoint(doc)}/versions`, { cache: 'no-store' });
  } catch (error) {
    return { kind: 'failed', detail: String(error) };
  }
  if (response.status === 401) return { kind: 'unauthorized' };
  if (!response.ok) return { kind: 'failed', detail: `HTTP ${response.status}` };

  const body = await readJson(response);
  const raw = isRecord(body) && Array.isArray(body.versions) ? body.versions : null;
  if (raw === null) return { kind: 'failed', detail: 'The response was not JSON.' };

  const versions = raw.flatMap((entry): VersionEntry[] => {
    if (isRecord(entry) && typeof entry.key === 'string' && typeof entry.updatedAt === 'string') {
      return [{ key: entry.key, updatedAt: entry.updatedAt }];
    }
    return [];
  });
  return { kind: 'ok', versions };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * The content rules from the auth-gated `/admin/api/rules` endpoint, or `null` when anything
 * about the fetch fails. The rules never ship in this client bundle — they arrive at runtime,
 * behind the same Basic auth as the page. With `null` the validator skips the rules-driven
 * checks and the server still enforces everything on save.
 */
export async function loadRules(): Promise<ContentRules | null> {
  try {
    const response = await fetch(RULES_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = await readJson(response);
    if (!isRecord(body)) return null;
    const { forbiddenWords, expectedHours, placeholders } = body;
    if (
      !isStringArray(forbiddenWords) ||
      !isStringArray(placeholders) ||
      !isRecord(expectedHours) ||
      typeof expectedHours.opens !== 'string' ||
      typeof expectedHours.closes !== 'string'
    ) {
      return null;
    }
    return {
      forbiddenWords,
      expectedHours: { opens: expectedHours.opens, closes: expectedHours.closes },
      placeholders,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** One listing entry, coerced defensively — the server is the authority on every field. */
function toImageRecord(value: unknown): ImageRecord | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  // `usedBy` is display data (“used on the home page”), and validating it against the key list
  // would mean importing the registry itself — the server writes these, so they are trusted.
  const usedBy = (Array.isArray(value.usedBy) ? value.usedBy : []).filter(
    (entry): entry is string => typeof entry === 'string',
  ) as readonly DocumentKey[];
  return {
    id: value.id,
    width: numberFrom(value.width),
    height: numberFrom(value.height),
    bytes: numberFrom(value.bytes),
    uploadedAt: stringFrom(value.uploadedAt),
    originalName: stringFrom(value.originalName),
    usedBy,
  };
}

/** Where a stored photo is served for the editor's previews — auth-gated, never public. */
export function imagePreviewUrl(id: string): string {
  return `${IMAGES_ENDPOINT}/${encodeURIComponent(id)}`;
}

/** Every stored photo, newest first, with the documents currently using it. */
export async function listImages(): Promise<ImagesResult> {
  let response: Response;
  try {
    response = await fetch(IMAGES_ENDPOINT, { cache: 'no-store' });
  } catch {
    return { kind: 'failed', message: 'The photo library could not be reached — try again in a moment.' };
  }
  if (response.status === 401) return { kind: 'unauthorized' };

  const body = await readJson(response);
  if (!response.ok) {
    return {
      kind: 'failed',
      message: messageFrom(body, 'The photo library could not be loaded — try again in a moment.'),
    };
  }
  const raw = isRecord(body) && Array.isArray(body.images) ? body.images : null;
  if (raw === null) {
    return { kind: 'failed', message: 'The photo library could not be loaded — try again in a moment.' };
  }
  return { kind: 'ok', images: raw.flatMap((entry) => toImageRecord(entry) ?? []) };
}

/**
 * Upload one already-downscaled JPEG. The `Content-Type` header is deliberately unset: the
 * browser has to write the multipart boundary itself, and setting it by hand breaks the parse
 * on the other end. `width`/`height` travel alongside because the server never decodes the
 * image — they are what the pages render the photo at.
 */
export async function uploadImage(
  file: Blob,
  meta: { readonly width: number; readonly height: number; readonly name: string },
): Promise<UploadResult> {
  const form = new FormData();
  if (meta.name === '') form.append('file', file);
  else form.append('file', file, meta.name);
  form.append('width', String(meta.width));
  form.append('height', String(meta.height));
  form.append('name', meta.name);

  let response: Response;
  try {
    response = await fetch(IMAGES_ENDPOINT, { method: 'POST', cache: 'no-store', body: form });
  } catch {
    return { kind: 'failed', message: 'The upload didn’t go through — check your connection and try again.' };
  }
  if (response.status === 401) return { kind: 'unauthorized' };

  const body = await readJson(response);
  if (!response.ok) {
    // 400/409/413/415 all mean "the server looked at this file and refused it", and each
    // carries the sentence that tells the owner what to do about it.
    if (response.status >= 400 && response.status < 500) {
      return { kind: 'rejected', message: messageFrom(body, 'That photo could not be uploaded.') };
    }
    return {
      kind: 'failed',
      message: messageFrom(body, 'The upload didn’t go through — try again in a moment.'),
    };
  }
  const image = isRecord(body) ? toImageRecord(body.image) : null;
  if (image === null) {
    return { kind: 'failed', message: 'The upload didn’t go through — try again in a moment.' };
  }
  return { kind: 'ok', image };
}

/** Delete a stored photo. The server refuses while any saved document still references it. */
export async function deleteImage(id: string): Promise<DeleteImageResult> {
  let response: Response;
  try {
    response = await fetch(imagePreviewUrl(id), { method: 'DELETE', cache: 'no-store' });
  } catch {
    return { kind: 'failed', message: 'The photo couldn’t be deleted — check your connection and try again.' };
  }
  if (response.status === 401) return { kind: 'unauthorized' };

  const body = await readJson(response);
  if (response.status === 409) {
    return { kind: 'in-use', message: messageFrom(body, 'That photo is still in use on the site.') };
  }
  if (response.status === 404) {
    return { kind: 'missing', message: messageFrom(body, 'That photo is no longer on the server.') };
  }
  if (!response.ok || !isRecord(body) || body.ok !== true) {
    return {
      kind: 'failed',
      message: messageFrom(body, 'The photo couldn’t be deleted — try again in a moment.'),
    };
  }
  return { kind: 'ok' };
}
