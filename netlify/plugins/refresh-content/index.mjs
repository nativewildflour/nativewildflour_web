/**
 * Build plugin: after a deploy goes live, ask it to re-render the public pages from the blob
 * store.
 *
 * The pages read the owner's content at request time and cache the result (ISR). A build cannot
 * warm that cache with the real content — Netlify injects the Blobs context into functions and
 * plugin processes, not into `next build`, so the prerendered pages the deploy ships are drawn
 * from the committed defaults in `src/data/defaults/`. Without this step the first visitor after
 * a deploy sees those defaults until the pages' 60-second `revalidate` window turns over.
 *
 * So: one POST to the freshly deployed site's `/admin/api/revalidate`, which invalidates the
 * four public routes and the sitemap; the next render reads the store. This runs in `onSuccess` — after the
 * deploy is live, which is the earliest moment the new URL can answer.
 *
 * It never fails the build. A refresh that does not happen costs at most 60 seconds of stale
 * content on one page view; a deploy that fails because a refresh call timed out costs the
 * owner her whole publish. The same reasoning governs the publish endpoint's own refresh call
 * (`../../functions/admin-content.mts`), which is likewise best-effort.
 */

/** With the trailing slash `trailingSlash: true` gives every route — the slash-less spelling is a 308. */
const ROUTE = '/admin/api/revalidate/';
/**
 * How long the call may take. The deploy is already live, so waiting longer only spends build
 * minutes; a refresh that times out costs at most one stale page view per page.
 */
const TIMEOUT_MS = 10_000;

export async function onSuccess({ utils }) {
  // In production, URL is the primary domain; DEPLOY_PRIME_URL is the `*.netlify.app` address,
  // which Netlify redirects to the primary domain once one is set — and a cross-origin redirect
  // drops the Authorization header. Branch and preview deploys have no primary domain, so there
  // DEPLOY_PRIME_URL is the deploy that just went live. (The content function needs none of
  // this: it refreshes the origin its own request came in on.) Only an auto-published deploy is
  // live at the primary domain by now — one published later (auto-publishing locked, or a
  // rollback, which runs no build at all) picks the stored content up as its pages' 60-second
  // windows turn over, or straight away with the owner's next publish.
  const origin =
    process.env.CONTEXT === 'production'
      ? process.env.URL || process.env.DEPLOY_PRIME_URL
      : process.env.DEPLOY_PRIME_URL || process.env.URL;
  const username = process.env.ADMIN_USERNAME ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';

  if (!origin) {
    console.log('[refresh-content] no deploy URL in the environment — skipping the refresh.');
    return;
  }
  // The endpoint re-checks Basic auth behind the edge guard, so the plugin needs the same
  // credentials the site is protected with. Unset means admin is not configured at all (the
  // guard fails closed too), and there is nothing useful to call.
  if (username === '' || password === '') {
    console.log(
      '[refresh-content] ADMIN_USERNAME / ADMIN_PASSWORD are not set in the build environment — ' +
        'skipping the refresh; the pages will pick up saved content within a minute.',
    );
    return;
  }

  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  // Everything from here on is inside the try, `new URL` included: nothing this plugin does may
  // turn a good deploy into a failed one.
  try {
    const response = await fetch(new URL(ROUTE, origin), {
      method: 'POST',
      headers: { authorization },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      console.log(`[refresh-content] refreshed the public pages at ${origin}`);
    } else {
      // A status is worth surfacing — 401 means the build's credentials disagree with the
      // site's — but not worth failing a deploy that is otherwise fine.
      utils.status.show({
        title: 'Content refresh skipped',
        summary: `${origin}${ROUTE} answered ${response.status}; the pages will pick up saved content within a minute.`,
      });
      console.log(`[refresh-content] ${ROUTE} answered ${response.status} — not refreshed.`);
    }
  } catch (error) {
    console.log(`[refresh-content] could not reach ${ROUTE} (${error.message}) — not refreshed.`);
  }
}
