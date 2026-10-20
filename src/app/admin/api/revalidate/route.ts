/**
 * `POST /admin/api/revalidate` — what makes a publish show up straight away.
 *
 * The four public pages are cached renders with a 60-second window (`revalidate = 60`). That
 * window alone would mean the owner watches her own change for up to a minute, so the content
 * API calls this endpoint the moment a save lands: it marks each page (and the sitemap) stale,
 * and the next visitor gets a fresh render read from the store. The deploy plugin calls it once
 * after a deploy goes live, for the same reason.
 *
 * The edge guard already Basic-auths everything under `/admin`, and this handler checks again.
 * That is not belt-and-braces for its own sake: a route handler is a real endpoint inside the
 * Next server, and a routing change that ever let a request reach it un-fronted must not hand
 * a stranger the ability to flush the cache at will. Same fail-closed posture as the guard —
 * unset credentials mean nobody gets in, rather than everybody.
 */

import { revalidatePath } from 'next/cache';

import { checkBasicAuth, unauthorized } from '../../../../../netlify/shared/basic-auth';

/** Auth is read per request, so this handler must never be cached or prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Literal paths, no trailing slashes: `revalidatePath` addresses the route file structure, in
 * which the `(site)` group and the `trailingSlash` setting do not appear. The sitemap rides
 * along because each page's `lastmod` is the newest publish stamp among its documents.
 */
const PATHS = ['/', '/menu', '/about', '/directions', '/sitemap.xml'] as const;

export async function POST(request: Request): Promise<Response> {
  const username = process.env.ADMIN_USERNAME ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (username === '' || password === '') {
    return Response.json({ ok: false, error: 'Admin is not configured.' }, { status: 503 });
  }
  if (!checkBasicAuth(request.headers.get('authorization'), username, password)) {
    return unauthorized();
  }

  for (const path of PATHS) revalidatePath(path);

  return Response.json({ ok: true, paths: PATHS });
}
