/**
 * The admin APIs' response shapes, shared by the content and photo functions, the request guard
 * and the refresh route: JSON, and the one failure shape every one of them answers in —
 * `{ ok: false, issues: [{ path, message }] }` — so the sentence the server wrote is always the
 * one the editor shows (`src/components/admin/api.ts` reads `issues`).
 *
 * Web APIs only, so every runtime that serves the admin can load it.
 */

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function failure(status: number, message: string, path = ''): Response {
  return json(status, { ok: false, issues: [{ path, message }] });
}
