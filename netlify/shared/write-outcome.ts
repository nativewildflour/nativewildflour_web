/**
 * Whether a blob write really landed — one rule for every writer: the content function's
 * documents and snapshots, and the photo function's uploads, small copies and put-backs.
 *
 * Neither flag `@netlify/blobs` returns proves it. The client reports `{ modified: true, etag: '' }`
 * for ANY answer to a conditional write other than 412 — a 403 or a 503 included — and it retries
 * a write whose answer was lost (a 5xx, a dropped connection) with the same condition, so a write
 * that already landed comes back from the retry as a 412, `{ modified: false }`. A write that comes
 * back with its etag landed; anything else is read back, and only other content counts against it.
 *
 * Web APIs only; relative imports only (the function bundler does not know Next's `@/` alias).
 */

/** What a write reports. */
export interface WriteResult {
  readonly modified: boolean;
  readonly etag?: string;
}

/** What a read-back found under the key just written. */
export interface ReadBack<Data = undefined> {
  /** The blob holds exactly what the write sent. */
  readonly matches: boolean;
  /** The blob's etag, when the store sent one. */
  readonly etag?: string;
  /** What the blob holds now, for a caller that needs to know (`null`: nothing). */
  readonly data?: Data;
}

/**
 * Where a write stands. `landed`: the blob holds it. `conflict`: the store refused the write's
 * condition and the blob holds something else. `failed`: the store answered otherwise and the
 * blob holds something else. `unknown`: the read-back itself failed, so it may have landed.
 */
export interface Landing<Data = undefined> {
  readonly outcome: 'landed' | 'conflict' | 'failed' | 'unknown';
  /** The etag of the landed write, when one is known. */
  readonly etag?: string;
  /** What a read-back found under the key, when one ran and reported it. */
  readonly stored?: Data;
}

export async function writeOutcome<Data = undefined>(
  result: WriteResult,
  readBack: () => Promise<ReadBack<Data>>,
): Promise<Landing<Data>> {
  if (result.modified && typeof result.etag === 'string' && result.etag !== '') {
    return { outcome: 'landed', etag: result.etag };
  }
  let check: ReadBack<Data>;
  try {
    check = await readBack();
  } catch {
    return { outcome: 'unknown' };
  }
  if (check.matches) return { outcome: 'landed', etag: check.etag, stored: check.data };
  return { outcome: result.modified ? 'failed' : 'conflict', stored: check.data };
}
