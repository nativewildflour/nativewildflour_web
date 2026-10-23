/**
 * The full admin loop on one machine, without the Netlify CLI: `next dev` plus the two real
 * Netlify Functions, served together behind one port, against a local blob store.
 *
 * Usage:  npm run dev:admin            (then open http://localhost:8788/admin/)
 *
 * `netlify dev` does the same job on a machine that has the CLI installed and the site linked;
 * this exists for the other case, and for reviewing the editors against a store you can wipe.
 * The pieces:
 *
 *   - `BlobsServer` from `@netlify/blobs/server` — the store implementation `netlify dev` uses —
 *     writing under `.netlify/dev-blobs/` (gitignored), so published content and uploaded photos
 *     survive a restart. Delete that folder to start clean. `next dev` is spawned with the same
 *     context, so the public pages read the local store exactly as the deployed site reads the
 *     real one.
 *   - the function handlers, imported unmodified through the same loader hook the smoke harness
 *     uses (extensionless TypeScript imports, attribute-less JSON imports, Next's `@/` alias),
 *     and called with real `Request` objects for anything under `/admin/api/`. Photos are served
 *     from `/images/uploads/` by the same function the deployed site uses.
 *   - a stand-in for the edge guard: `/admin` and everything beneath it demands the same Basic
 *     credentials the functions check, so the browser prompts once and re-sends them to the API
 *     exactly as it does on Netlify.
 *   - a plain proxy to `next dev` (spawned here, on its own port) for every other request,
 *     WebSocket upgrades included so hot reload keeps working.
 *
 * The content function refreshes the origin its own request reached — this server — so a
 * publish makes the same refresh call it makes on Netlify: it POSTs `/admin/api/revalidate`,
 * which is proxied through to Next with the owner's credentials, and the editor reports
 * `revalidated: true`. Under
 * `next dev` every request renders fresh anyway; set `DEV_ADMIN_NEXT=start` after
 * `npm run build` to run the built site instead and watch the ISR cache actually refresh.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { register } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BlobsServer } from '@netlify/blobs/server';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Loader hook — shared with the smoke harness and the gate; see ./ts-resolve-hook.mjs.
// ---------------------------------------------------------------------------

register('./ts-resolve-hook.mjs', import.meta.url);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 8788);
const NEXT_PORT = Number(process.env.NEXT_PORT ?? 3000);
const USERNAME = process.env.ADMIN_USERNAME || 'owner';
const PASSWORD = process.env.ADMIN_PASSWORD || 'local-dev-password';
const BLOBS_DIR = path.join(ROOT, '.netlify', 'dev-blobs');

process.env.ADMIN_USERNAME = USERNAME;
process.env.ADMIN_PASSWORD = PASSWORD;
// The pages' canonical and Open Graph URLs (`src/lib/site.ts` reads `URL`) name this server,
// not a real deploy. The refresh call needs nothing from here: it goes to the request's origin.
delete process.env.DEPLOY_PRIME_URL;
process.env.URL = `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------
// Blob store
// ---------------------------------------------------------------------------

const blobs = new BlobsServer({ directory: BLOBS_DIR, token: 'dev-token' });
const { port: blobsPort } = await blobs.start();
const edgeURL = `http://localhost:${blobsPort}`;
// Both URLs: the handlers open their stores with strong consistency, which the client refuses
// without an uncached edge URL.
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({ edgeURL, uncachedEdgeURL: edgeURL, token: 'dev-token', siteID: 'local' }),
).toString('base64');

const { default: contentHandler } = await import('../netlify/functions/admin-content.mts');
const { default: imagesHandler } = await import('../netlify/functions/admin-images.mts');
const { default: uploadsHandler } = await import('../netlify/functions/uploads.mts');
const { checkBasicAuth, unauthorized } = await import('../netlify/shared/basic-auth.ts');

// ---------------------------------------------------------------------------
// next dev
// ---------------------------------------------------------------------------

/** True when something already answers on the port — a `npm run dev` the developer started. */
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net.connect(port, 'localhost');
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
}

let nextDev = null;
if (await portInUse(NEXT_PORT)) {
  // Only a process this script spawns inherits the blob context and the credentials set above;
  // a `next dev` started by hand has neither, so through it the pages render the committed
  // defaults and the refresh route answers 503. Say so, loudly, rather than let the banner
  // below promise a loop that is not there.
  console.warn(
    `[dev-admin] port ${NEXT_PORT} is already serving — using that next dev instead of starting one.\n` +
      `[dev-admin] WARNING: it was not started by this script, so it cannot see the local blob store or the admin\n` +
      `[dev-admin] credentials: the pages will keep showing the defaults after a publish, and every publish will\n` +
      `[dev-admin] report that the site could not be refreshed. Stop it and run \`npm run dev:admin\` on its own\n` +
      `[dev-admin] for the full loop.`,
  );
} else {
  const nextBin = require.resolve('next/dist/bin/next');
  // `DEV_ADMIN_NEXT=start` serves the last `npm run build` instead, ISR cache and all.
  const command = process.env.DEV_ADMIN_NEXT === 'start' ? 'start' : 'dev';
  nextDev = spawn(process.execPath, [nextBin, command, '-p', String(NEXT_PORT)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  nextDev.on('exit', (code) => {
    console.error(`[dev-admin] next dev exited (${code ?? 'signal'}) — stopping.`);
    void blobs.stop();
    process.exit(code ?? 1);
  });
}

function shutdown() {
  nextDev?.kill();
  void blobs.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Front server
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Call a function handler the way Netlify would, and write its `Response` back out. */
async function serveFunction(handler, req, res) {
  const body = await readBody(req);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const url = `http://localhost:${PORT}${req.url}`;
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = body;
  const response = await handler(new Request(url, init));
  const out = Buffer.from(await response.arrayBuffer());
  const responseHeaders = {};
  response.headers.forEach((value, name) => {
    responseHeaders[name] = value;
  });
  res.writeHead(response.status, responseHeaders);
  res.end(out);
}

/** Forward anything else to `next dev` untouched. */
function proxyToNext(req, res) {
  const upstream = http.request(
    { host: 'localhost', port: NEXT_PORT, method: req.method, path: req.url, headers: req.headers },
    (proxied) => {
      res.writeHead(proxied.statusCode ?? 502, proxied.headers);
      proxied.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`next dev is not answering on port ${NEXT_PORT} yet (${error.message}) — retry in a moment.`);
  });
  req.pipe(upstream);
}

/** The edge guard's behavior, in miniature: everything under /admin needs the credentials. */
function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

const front = http.createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', `http://localhost:${PORT}`).pathname;

  if (isAdminPath(pathname) && !checkBasicAuth(req.headers.authorization ?? null, USERNAME, PASSWORD)) {
    const response = unauthorized();
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    res.writeHead(response.status, headers);
    res.end(await response.text());
    return;
  }

  try {
    // Public, like on Netlify: a page rendered from the local store references its photos by
    // URL, and nothing but this function can turn one back into bytes.
    if (pathname.startsWith('/images/uploads/')) {
      await serveFunction(uploadsHandler, req, res);
      return;
    }
    if (pathname === '/admin/api/images' || pathname.startsWith('/admin/api/images/')) {
      await serveFunction(imagesHandler, req, res);
      return;
    }
    // Next owns the refresh route; everything else under /admin/api is the content function.
    if (pathname.replace(/\/+$/, '') === '/admin/api/revalidate') {
      proxyToNext(req, res);
      return;
    }
    if (pathname.startsWith('/admin/api/')) {
      await serveFunction(contentHandler, req, res);
      return;
    }
  } catch (error) {
    console.error('[dev-admin] function error', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The function threw — see the terminal.');
    return;
  }

  if (isAdminPath(pathname)) {
    // Mirror the production headers so nothing under /admin is cached by the browser.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  proxyToNext(req, res);
});

// Hot reload rides a WebSocket; hand the raw socket through to next dev.
front.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(NEXT_PORT, 'localhost', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [name, value] of Object.entries(req.headers)) {
      lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

front.listen(PORT, () => {
  console.log(`
[dev-admin] admin loop ready
  editors:   http://localhost:${PORT}/admin/
  site:      http://localhost:${PORT}/  (rendered from the same local store — reload after a publish)
  sign in:   ${USERNAME} / ${PASSWORD}
  blob store: ${BLOBS_DIR}  (delete it to start clean)
  next dev:  proxied from port ${NEXT_PORT}
`);
});
