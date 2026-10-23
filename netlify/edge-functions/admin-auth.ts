/**
 * Edge guard for the admin section: HTTP Basic auth on `/admin` and `/admin/*` (both paths
 * are declared in netlify.toml), checked against the `ADMIN_USERNAME` / `ADMIN_PASSWORD`
 * environment variables. Fails closed — credentials left unset means nobody gets in, not
 * everybody.
 *
 * Runs on Deno, so Web APIs only. Deno resolves import specifiers literally, which is why
 * the shared-helper import below must spell out its `.ts` extension.
 */

// Deno needs the literal `.ts` extension here; tsconfig's `allowImportingTsExtensions` permits it.
import { checkBasicAuth, isSupersededDeploy, unauthorized } from '../shared/basic-auth.ts';
import type { DeployContext } from '../shared/basic-auth.ts';

/** The pieces of Netlify's edge `context` this guard uses — not worth a dependency. */
interface Context extends DeployContext {
  next(): Promise<Response>;
}

/** Netlify's edge runtime global, declared locally for the same no-dependency reason. */
declare const Netlify: {
  env: { get(name: string): string | undefined };
};

export default async function adminAuth(
  request: Request,
  context: Context,
): Promise<Response> {
  // An older production deploy keeps the credentials it was built with: after a password change
  // its permalink would still let the old password in, so the admin exists on the live deploy only.
  if (isSupersededDeploy(context)) {
    return new Response('Not found.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const username = Netlify.env.get('ADMIN_USERNAME') ?? '';
  const password = Netlify.env.get('ADMIN_PASSWORD') ?? '';

  if (username === '' || password === '') {
    return new Response('Admin is not configured.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (!checkBasicAuth(request.headers.get('authorization'), username, password)) {
    return unauthorized();
  }

  // Authenticated: serve the page (or API response), but keep everything under /admin out
  // of shared caches and search indexes even where the netlify.toml header rules are not
  // applied. A response that already marks itself `private` keeps its own policy: the photo
  // endpoint lets the signed-in browser keep each (immutable) picture, which `no-store` would
  // undo, while a `private` copy never reaches the CDN. Everything else — Next's pages send a
  // public-cacheable header of their own — is forced to `no-store`.
  const response = await context.next();
  const headers = new Headers(response.headers);
  const cacheControl = headers.get('Cache-Control') ?? '';
  if (!/(^|,)\s*private\b/i.test(cacheControl)) {
    headers.set('Cache-Control', 'no-store');
  }
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
