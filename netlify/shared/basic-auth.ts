/**
 * HTTP Basic auth helpers shared by the edge guard (`netlify/edge-functions/admin-auth.ts`,
 * Deno runtime) and the menu API (`netlify/functions/admin-menu.mts`, Node runtime).
 *
 * Web APIs only: `atob`, `TextDecoder`, and `Response` exist as globals in both runtimes,
 * while `node:crypto` does not — so the constant-time comparison is hand-rolled below.
 */

/**
 * Compare two strings in time independent of where they first differ: both are padded to a
 * shared length and every character pair is XOR-accumulated, so the loop never exits early.
 * A caller still learns that a guess was wrong — just not which character was.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length, 1);
  const paddedA = a.padEnd(length, '\u0000');
  const paddedB = b.padEnd(length, '\u0000');
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    diff |= paddedA.charCodeAt(index) ^ paddedB.charCodeAt(index);
  }
  return diff === 0;
}

/** Decode a base64 credential payload as UTF-8; null when it is not valid base64. */
function decodeBase64(encoded: string): string | null {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * True iff `header` is a well-formed `Authorization: Basic <base64>` carrying exactly
 * `username:password`. Both halves are compared in constant time, and both comparisons run
 * unconditionally, so a wrong username costs the same as a wrong password.
 */
export function checkBasicAuth(
  header: string | null,
  username: string,
  password: string,
): boolean {
  const encoded = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i)?.[1];
  if (encoded === undefined) return false;
  const decoded = decodeBase64(encoded);
  if (decoded === null) return false;
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;
  const userOk = constantTimeEqual(decoded.slice(0, separator), username);
  const passOk = constantTimeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk;
}

/** The 401 that makes browsers show the sign-in prompt for the admin realm. */
export function unauthorized(): Response {
  return new Response('Sign in to continue.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Native WILDFlour admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
