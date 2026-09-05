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
import { checkBasicAuth, unauthorized } from '../shared/basic-auth.ts';

/** The one piece of Netlify's edge `context` this guard uses — not worth a dependency. */
interface Context {
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
  // of caches and search indexes even where the netlify.toml header rules are not applied.
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
