/**
 * Normalize the static export so a build made on Windows is byte-for-byte what a
 * Linux build (e.g. Netlify) produces.
 *
 * Why: Next.js 16's static export writes one RSC "segment" prefetch file per route
 * segment, named `__next.<segment>.<…>.txt`. On Windows, `path.relative()` returns
 * backslashes, so the filename converter only flattens the first separator and
 * `path.join()` turns the remainder into a real subdirectory:
 *
 *   Linux:   out/menu/__next.menu.__PAGE__.txt      <- what the client requests
 *   Windows: out/menu/__next.menu/__PAGE__.txt      <- 404 for the prefetcher
 *
 * The client router falls back gracefully (navigation still works, it just loses
 * the prefetch), but the local `npm run verify` / `npm run preview` experience should
 * match production. On Linux this script finds nothing to do and exits quietly.
 *
 * Runs automatically via the `postbuild` npm script.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');

/** Recursively list files under `dir`, as paths relative to `dir` using `/`. */
async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), rel)));
    else files.push(rel);
  }
  return files;
}

/** Find directories (not files) whose basename starts with `__next.` — the Windows symptom. */
async function findMisplacedSegmentDirs(dir, found = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('__next.')) {
      found.push(full);
      continue; // do not descend; we flatten the whole thing
    }
    if (entry.name === '_next') continue; // hashed static assets, never affected
    await findMisplacedSegmentDirs(full, found);
  }
  return found;
}

async function main() {
  try {
    await fs.access(OUT);
  } catch {
    console.log('[normalize-export] no out/ directory — nothing to do');
    return;
  }

  const dirs = await findMisplacedSegmentDirs(OUT);
  if (dirs.length === 0) {
    console.log('[normalize-export] export already normalized');
    return;
  }

  let moved = 0;
  for (const dir of dirs) {
    const parent = path.dirname(dir);
    const base = path.basename(dir); // e.g. "__next.menu"
    for (const rel of await listFiles(dir)) {
      // "__PAGE__.txt" or "@slot/…/x.txt" -> "__next.menu.__PAGE__.txt" / "__next.menu.@slot.….x.txt"
      const flat = `${base}.${rel.replace(/\//g, '.')}`;
      await fs.rename(path.join(dir, rel), path.join(parent, flat));
      moved += 1;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
  console.log(`[normalize-export] flattened ${moved} segment file(s) from ${dirs.length} director${dirs.length === 1 ? 'y' : 'ies'}`);
}

main().catch((error) => {
  console.error('[normalize-export] failed:', error);
  process.exitCode = 1;
});
