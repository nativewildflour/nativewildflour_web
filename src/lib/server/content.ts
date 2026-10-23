/**
 * Where the pages get their words: one read per document from the `site-content` blob store,
 * at request time, with the committed default as the fallback.
 *
 * Server-only. It imports `@netlify/blobs`, so nothing under `src/components/` may import it —
 * the directory name and this comment are the guard. There is deliberately no `server-only`
 * import: that package throws outside React's server condition, and the admin smoke harness
 * loads this module in plain Node to test the four branches below.
 *
 * Relative specifiers throughout for the same reason — the harness resolves this file without
 * Next's `@/` alias.
 *
 * The four branches, and why each is what it is:
 *
 *   - **Nothing saved** (missing key, or a blank one) — the owner has not published this
 *     document yet, so the committed default is what the site is supposed to show.
 *   - **No Blobs context** (`MissingBlobsEnvironmentError`) — `next build` prerendering and a
 *     plain `next dev` both run without one. Treated as "nothing saved", which is also what
 *     keeps the four public routes prerenderable: the error is raised locally, before any
 *     request goes out, so the build never sees an uncached fetch.
 *   - **Unreadable content** (bad JSON, wrong shape) — throw. The owner's real content is
 *     there and we cannot read it; quietly reverting to the default would publish words she
 *     did not write. The editor shows error mode with version history.
 *   - **Any other failure** (the store could not be reached) — throw, for the same reason.
 *
 * What a throw costs the public page depends on how the render was triggered. The 60-second
 * timer is stale-while-revalidate: a failed regeneration logs and the last good page stays up.
 * On-demand revalidation (`/admin/api/revalidate` — every publish, restore and post-deploy
 * refresh) drops the cached entry first and renders blocking, so a throw there is an error page
 * until the blob is repaired. That is the trade-off chosen here: the publish endpoint is the
 * only writer and validates every save, so an unreadable blob means a spec changed underneath
 * saved content (see the CLAUDE.md note on adding required fields) — a bug to fix loudly, not
 * to paper over with the defaults.
 */

import { getStore } from '@netlify/blobs';
import { cache } from 'react';

import aboutDefault from '../../data/defaults/about.json';
import directionsDefault from '../../data/defaults/directions.json';
import homeDefault from '../../data/defaults/home.json';
import menuDefault from '../../data/defaults/menu.json';
import { CONTENT_STORE } from '../../../netlify/shared/stores';
import type { DocumentKey, DocumentOf } from '../content-docs';
import { DOCUMENTS } from '../content-docs';

/** How many parse errors a thrown message quotes before it stops being readable. */
const MAX_REPORTED_ERRORS = 5;

/** Where a rendered document came from — the editor is not the only thing that wants to know. */
export type ContentSource = 'blob' | 'default';

export interface LoadedContent<T> {
  readonly document: T;
  readonly source: ContentSource;
}

/**
 * Parse a document through its registry entry, or throw naming the document and what is wrong.
 * The cast is the one place the key/type correspondence in `DocumentTypes` is asserted:
 * `parse` returns `unknown` because its input is untrusted, and it has just been checked.
 */
function parseDocument<K extends DocumentKey>(doc: K, value: unknown, origin: string): DocumentOf<K> {
  const { document, errors } = DOCUMENTS[doc].parse(value);
  if (document === null) {
    const shown = errors.slice(0, MAX_REPORTED_ERRORS).map((error) => `  - ${error}`);
    const rest = errors.length - shown.length;
    throw new Error(
      `The "${doc}" document from ${origin} is not valid:\n${shown.join('\n')}${
        rest > 0 ? `\n  …and ${rest} more` : ''
      }`,
    );
  }
  return document as DocumentOf<K>;
}

/**
 * The committed defaults, parsed once. They ship in this repo, so one that no longer matches
 * its shape is a build bug and should stop the build rather than reach a page.
 */
const DEFAULTS: { readonly [K in DocumentKey]: DocumentOf<K> } = {
  menu: parseDocument('menu', menuDefault, 'src/data/defaults/menu.json'),
  home: parseDocument('home', homeDefault, 'src/data/defaults/home.json'),
  about: parseDocument('about', aboutDefault, 'src/data/defaults/about.json'),
  directions: parseDocument('directions', directionsDefault, 'src/data/defaults/directions.json'),
};

/** `name` rather than `instanceof`: the thrower may be a different copy of the Blobs client. */
function errorName(error: unknown): string | null {
  return error instanceof Error ? error.name : null;
}

/**
 * The stored document as raw text, or null when this environment has nothing to read.
 *
 * Reads ask for strong consistency per operation, the way the v1 build plugin did: a publish
 * followed straight away by a revalidate must not read back the pre-publish document. Where the
 * environment offers no uncached edge URL the client raises `BlobsConsistencyError` locally,
 * before any request goes out — that says nothing about the data, so the read is retried the
 * cached way rather than failed.
 */
export async function readDocumentBlob(doc: DocumentKey): Promise<string | null> {
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(CONTENT_STORE);
  } catch (error) {
    if (errorName(error) === 'MissingBlobsEnvironmentError') return null;
    throw error;
  }

  const key = `${doc}.json`;
  try {
    return await store.get(key, { type: 'text', consistency: 'strong' });
  } catch (error) {
    if (errorName(error) !== 'BlobsConsistencyError') throw error;
    return store.get(key, { type: 'text' });
  }
}

/**
 * One document, ready to render.
 *
 * Wrapped in React's `cache()` so a layout, its page and the JSON-LD that page emits share a
 * single read per request instead of racing three of them.
 */
export const getContent = cache(
  async <K extends DocumentKey>(doc: K): Promise<LoadedContent<DocumentOf<K>>> => {
    const raw = await readDocumentBlob(doc);
    if (raw === null || raw.trim() === '') {
      return { document: DEFAULTS[doc], source: 'default' };
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `The "${doc}" document in the ${CONTENT_STORE} store is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      document: parseDocument(doc, value, `the ${CONTENT_STORE} store`),
      source: 'blob',
    };
  },
);
