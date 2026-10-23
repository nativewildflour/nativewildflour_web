/**
 * Cross-site request checks for the state-changing admin endpoints, shared by the content and
 * photo functions (Node) and the refresh route handler (Next).
 *
 * The admin section authenticates with HTTP Basic, which a browser re-sends on its own to any
 * request aimed at the protected paths, a request started by another site's form included. Two
 * checks close that door without a token round trip:
 *
 *   - **Origin.** Browsers stamp `Origin` on every cross-site POST/PUT/DELETE. When it is
 *     present it must name this site's own host. A missing `Origin` still passes: the deploy
 *     plugin and the content function's own server-side refresh call send none, and a browser
 *     never omits it on a cross-site write.
 *   - **Content type.** A JSON endpoint only accepts `application/json`, and the upload only
 *     `multipart/form-data`. An HTML form cannot send JSON, and the cross-site multipart form
 *     is already stopped by the Origin check.
 *
 * Web APIs only, no `node:` imports, so every runtime above can load it.
 */

/** The hosts a same-site request may name: the request URL's own, and what the proxy saw. */
function ownHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // An unparsable request URL contributes nothing; the headers below still may.
  }
  for (const name of ['host', 'x-forwarded-host']) {
    const value = request.headers.get(name);
    if (value) {
      for (const part of value.split(',')) {
        const host = part.trim().toLowerCase();
        if (host !== '') hosts.add(host);
      }
    }
  }
  return hosts;
}

/**
 * True when the request either carries no `Origin` or one naming this site. Hosts are compared
 * without the scheme: TLS ends in front of the function, so its request URL may read `http:`
 * while the browser's `Origin` reads `https:` for the very same site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    // `Origin: null` (sandboxed frames, some redirects) and anything unparsable are refused.
    return false;
  }
  return ownHosts(request).has(host);
}

/** The media type of the request body, lower-cased, without parameters. */
function mediaType(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function refusal(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, issues: [{ path: '', message }] }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * `null` when the request may proceed, otherwise the response to send. `expected` is the body
 * media type the endpoint reads, or `null` for an endpoint that reads no body.
 */
export function guardWrite(
  request: Request,
  expected: 'application/json' | 'multipart/form-data' | null,
): Response | null {
  if (!isSameOrigin(request)) {
    return refusal(403, 'That request came from another website, so it was refused.');
  }
  if (expected !== null && mediaType(request) !== expected) {
    return refusal(415, `This endpoint only accepts ${expected}.`);
  }
  return null;
}
