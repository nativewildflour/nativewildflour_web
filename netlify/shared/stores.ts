/**
 * The blob stores and the key layout inside them, shared by every reader and writer: the content
 * and photo functions, the public photo endpoint and the pages' loader. One definition, so the
 * photo delete's history guard can never read version history under a different scheme than the
 * history itself is written in.
 *
 * Web APIs only; relative imports only (the function bundler does not know Next's `@/` alias).
 */

import type { DocumentKey } from '../../src/lib/content-docs';

/** The owner's documents: `<doc>.json`, and their snapshots under `<doc>-versions/`. */
export const CONTENT_STORE = 'site-content';
/** The owner's photos, under their ids (and each 800px copy under `w800/<id>`). */
export const IMAGE_STORE = 'site-images';

export const currentKey = (doc: DocumentKey): string => `${doc}.json`;
export const versionPrefix = (doc: DocumentKey): string => `${doc}-versions/`;
export const VERSION_SUFFIX = '.json';

/**
 * What a snapshot key may look like after its `<doc>-versions/` prefix: the exact ISO timestamp
 * a publish writes, optionally followed by the random suffix it has added since (older snapshots
 * have none), and nothing else. A prefix test alone would accept `<doc>-versions/../menu.json`
 * and let a restore reach for a different blob — harmless against Netlify's API, where keys are
 * opaque, but the local dev store resolves a key as a path.
 */
export const VERSION_STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)(?:-[a-z0-9]{6})?$/;

/** `home-versions/2026-09-02T17:00:00.000Z-a1b2c3.json` -> the part between prefix and suffix. */
export function stampOf(doc: DocumentKey, key: string): string {
  const end = key.endsWith(VERSION_SUFFIX) ? key.length - VERSION_SUFFIX.length : key.length;
  return key.slice(versionPrefix(doc).length, end);
}

/** Whether `key` is one of `doc`'s snapshots — the test the version list and a restore apply. */
export function isVersionKey(doc: DocumentKey, key: string): boolean {
  return (
    key.startsWith(versionPrefix(doc)) &&
    key.endsWith(VERSION_SUFFIX) &&
    VERSION_STAMP.test(stampOf(doc, key))
  );
}

/**
 * A key as `list()` reported it, back in the form the rest of the store speaks.
 *
 * The local blob server keeps each blob as a file, so on Windows it percent-encodes whatever a
 * Windows filename cannot hold — the colons in an ISO timestamp — and its listing reports that
 * encoded filename instead of the key that was written. Netlify's own API round-trips keys
 * untouched, where this is a no-op; without it, `netlify dev` on Windows lists versions that
 * restore and prune then cannot address. Safe for this key space: a snapshot key is an ISO
 * timestamp, a lowercase suffix and `.json`, and never holds a literal percent sign of its own.
 */
export function canonicalKey(key: string): string {
  if (!key.includes('%')) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}
