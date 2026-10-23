/**
 * `POST /admin/api/revalidate` — what makes a publish show up straight away.
 *
 * The four public pages are cached renders with a 60-second window (`revalidate = 60`). That
 * window alone would mean the owner watches her own change for up to a minute, so the content
 * API calls this endpoint the moment a save lands: it marks the pages that show the saved
 * document (and the sitemap) stale, and the next visitor gets a fresh render read from the
 * store. The deploy plugin calls it once after a deploy goes live, for every page, for the same
 * reason.
 *
 * The edge guard already Basic-auths everything under `/admin`, and this handler checks again.
 * That is not belt-and-braces for its own sake: a route handler is a real endpoint inside the
 * Next server, and a routing change that ever let a request reach it un-fronted must not hand
 * a stranger the ability to flush the cache at will. Same fail-closed posture as the guard —
 * unset credentials mean nobody gets in, rather than everybody.
 */

import { revalidatePath } from 'next/cache';

import { PAGE_DOCUMENTS, pagesShowing } from '@/data/pages';
import type { PublicPath } from '@/data/pages';
import { isDocumentKey } from '@/lib/content-docs';

import { guardAdmin } from '../../../../../netlify/shared/admin-gate';
import { guardWrite } from '../../../../../netlify/shared/request-guard';

/** Auth is read per request, so this handler must never be cached or prerendered. */
export const dynamic = 'force-dynamic';

/**
 * A public page as `revalidatePath` addresses it: the route file structure, in which the `(site)`
 * group and the `trailingSlash` setting do not appear — so the trailing slash comes off (except on
 * `/`).
 */
const routeOf = (path: PublicPath): string => (path === '/' ? path : path.replace(/\/+$/, ''));

/**
 * `?doc=<doc>` (the content function, after a publish or restore): the pages that render that
 * document (`PAGE_DOCUMENTS`). No document (the deploy plugin, after a deploy): every public page.
 * The sitemap rides along either way, because each page's `lastmod` is the newest publish stamp
 * among its documents.
 */
function pathsFor(doc: string | null): string[] {
  const pages =
    doc !== null && isDocumentKey(doc)
      ? pagesShowing(doc)
      : (Object.keys(PAGE_DOCUMENTS) as PublicPath[]);
  return [...pages.map(routeOf), '/sitemap.xml'];
}

export async function POST(request: Request): Promise<Response> {
  const unauthorizedAnswer = guardAdmin(request);
  if (unauthorizedAnswer !== null) return unauthorizedAnswer;
  // Same-origin only. Its legitimate callers — the content function and the deploy plugin —
  // send no Origin and no body, so only the origin is checked.
  const refused = guardWrite(request, null);
  if (refused !== null) return refused;

  const paths = pathsFor(new URL(request.url).searchParams.get('doc'));
  for (const path of paths) revalidatePath(path);

  return Response.json({ ok: true, paths });
}
