/**
 * The checks every admin API runs before anything else — the content and photo functions and
 * the refresh route. The edge guard (`../edge-functions/admin-auth.ts`) makes the same checks in
 * front of them; each endpoint repeats them because it is reachable on its own.
 *
 * Node runtimes only (it reads `process.env`); the Deno edge guard keeps its own copy of the
 * sequence over `Netlify.env`.
 */

import { checkBasicAuth, isSupersededDeploy, unauthorized } from './basic-auth';
import type { DeployContext } from './basic-auth';
import { failure } from './responses';

/**
 * `null` when the request may proceed. Otherwise the answer: an older production deploy never
 * serves the admin (it still holds the credentials and rules it was built with), unset
 * credentials fail closed (503), and wrong or missing ones get the sign-in challenge (401).
 */
export function guardAdmin(request: Request, context?: DeployContext): Response | null {
  if (isSupersededDeploy(context)) {
    return failure(403, 'The admin only works on the live site — open it from the main address.');
  }
  const username = process.env.ADMIN_USERNAME ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (username === '' || password === '') {
    return failure(503, 'Admin is not configured.');
  }
  if (!checkBasicAuth(request.headers.get('authorization'), username, password)) {
    return unauthorized();
  }
  return null;
}
