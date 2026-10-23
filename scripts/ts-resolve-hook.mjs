/**
 * A `module.register()` resolve hook that lets plain Node import the project's TypeScript the
 * way its two bundlers do. `scripts/smoke-admin.mjs`, `scripts/dev-admin.mjs` and
 * `scripts/verify-build.mjs` all register it (Node itself strips the types:
 * `--experimental-strip-types`).
 *
 * Resolution rules two bundlers apply for free, restated for plain Node: extensionless
 * specifiers get a TypeScript extension, `.json` specifiers get the import attribute Node
 * requires, and `@/` resolves to `src/` — Netlify's function bundler supplies the first two for
 * `netlify/**`, and Next supplies all three for `src/lib/server/content.ts`, which the page
 * loader scenarios import directly. Nothing here names a module format: letting Node work it out
 * costs one `MODULE_TYPELESS_PACKAGE_JSON` warning per TypeScript file and keeps the hook off
 * internal format strings, which is the right trade for scripts that have to run on the Node 22
 * the deploy pins as well as on whatever a developer has installed.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
const EXTENSIONS = ['.ts', '.mts', '.tsx', '/index.ts', '/index.mts', '/index.tsx'];

/** The URL a specifier really points at, once a missing extension is filled in. */
function withExtension(url) {
  if (existsSync(fileURLToPath(url))) return url;
  for (const extension of EXTENSIONS) {
    const candidate = new URL(url.href + extension);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.json')) {
    return { ...(await nextResolve(specifier, context)), importAttributes: { type: 'json' } };
  }
  if (specifier.startsWith('@/')) {
    const resolved = withExtension(new URL(specifier.slice(2), SRC));
    if (resolved) return nextResolve(resolved.href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const direct = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(direct))) {
      const resolved = withExtension(direct);
      if (resolved) return nextResolve(resolved.href, context);
    }
  }
  return nextResolve(specifier, context);
}
