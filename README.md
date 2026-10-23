# Native WILDFlour — website

Static marketing site for **Native WILDFlour**, an independent cafe at First Avenue & State Street
in Skagway, Alaska.

---

## Architecture

Next.js 16 (App Router, TypeScript strict), React 19 and Tailwind CSS 4, deployed on
**Netlify's Next runtime**. The owner's content lives in **Netlify Blobs**, not in this repository:
each public page is prerendered at build time from the built-in defaults, cached by Netlify, and
re-rendered from the blob store whenever the owner publishes. A save shows up on the live site
within seconds, and nothing is rebuilt.

Why this shape:

- **Publishing is instant and cheap.** The admin editors write to Blobs and ask the site to
  refresh four pages. No build, no deploy, no minutes of waiting.
- **Pages are still served from a cache.** Between publishes the rendered HTML sits in Netlify's
  cache like a static file. Titles, meta descriptions, canonicals, Open Graph tags and JSON-LD are
  all in the delivered HTML — nothing is assembled in the browser.
- **The repository is code, not content.** It holds one default copy of each page so a fresh site
  has something to show; after that the blob store is the only source of truth.
- **Fast on a phone over cruise-port wifi.** The only script the public pages ship is the
  small-screen navigation disclosure. There is no analytics and no third-party JavaScript.

The [admin editors](#admin-editors) use a Netlify Edge Function (sign-in), two Netlify Functions
(saving page content, storing photos) and one Next route handler (telling the site to refresh);
a fourth, public function streams uploaded photos.

Supporting choices: `trailingSlash: true` so canonicals stay stable; `images: { unoptimized: true }`
because every picture is already sized for its slot (committed images pre-sized, uploads
downscaled in the browser), which is why every `next/image` call passes explicit `width` and
`height`; fonts self-hosted by `next/font` so no request leaves the origin.

```
assets/logo.jpg          source logo — the only raster input to the project
scripts/                 prepare-assets.mjs (image generation), verify-build.mjs (acceptance checks),
                         smoke-admin.mjs (end-to-end test of the admin API against a local blob store),
                         dev-admin.mjs (the full admin loop on one machine)
public/images/           generated images, committed
src/app/                 routes: /, /menu/, /about/, /directions/, not-found, sitemap, robots, manifest,
                         the admin section /admin/, /admin/{home,menu,about,directions,photos}/, the
                         editors' preview frames /admin/preview/*, and /admin/api/revalidate
src/components/          UI components (server components by default; admin/ is the editors' client tree)
src/data/                business, nav, map — and defaults/, one JSON per owner-editable document
                         (menu, home, about, directions) used only until something is published
src/lib/                 site URL, metadata builder, JSON-LD builders, the copy-rule engine, the
                         field-spec DSL, the content-document registry, and server/content.ts —
                         the loader that reads documents from Blobs at request time
netlify/                 the admin gate — edge function (sign-in), functions (content API, photo API,
                         public photo serving), shared auth util — plus plugins/refresh-content,
                         which asks a fresh deploy to render from the store (see the admin section)
netlify.toml             build command, publish directory, plugins, security and cache headers, admin routing
```

---

## Requirements

- Node.js **22** or newer. `.nvmrc` pins 22 and Netlify uses `NODE_VERSION = "22"`.
- npm 10 or newer.

## Everyday commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (`npm ci` for a clean, lockfile-exact install). |
| `npm run dev` | Development server on <http://localhost:3000>. With no blob store configured it renders the defaults, and the admin editors open read-only. |
| `npm run dev:admin` | The full loop on this machine without the Netlify CLI: `next dev` plus the real functions behind <http://localhost:8788>, on a local blob store under `.netlify/dev-blobs/`. Pages and editors both read that store, so a publish shows up on the local pages too. Sign in with `owner` / `local-dev-password` (override with `ADMIN_USERNAME`/`ADMIN_PASSWORD`). |
| `npm run build` | `next build`: type-checks the project and prerenders every page from the defaults. The build never reads the blob store. |
| `npm run verify` | Runs `scripts/verify-build.mjs`: starts the built site with `next start`, checks every page over HTTP, and scans the bundles. Run it after every build. |
| `npm run preview` | Builds, then serves the site on <http://localhost:4173> with `next start`. |
| `npm run smoke:admin` | Exercises the admin API and the content loader end to end (sign-in, publish, the refresh call, versions, restore, photo upload/serve/delete, empty and broken blobs) against a throwaway local blob store. No Netlify account needed. |
| `npm run lint` | ESLint (flat config, `eslint-config-next`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run prepare-assets` | Regenerates every image from `assets/logo.jpg`. Only needed if the logo changes. |

A full local check before shipping:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run verify
```

`npm run verify` starts the built site and checks every page as a browser would receive it: that
each page has exactly one `<h1>`, a title, a meta description, an absolute canonical URL, Open
Graph and Twitter tags; that all JSON-LD parses and the business listing carries the right phone
number and opening hours; that the sitemap lists exactly the four public pages and the admin pages
stay out of it (noindex, no canonical); that the public pages' robots tags and `robots.txt` match
the [indexing switch](#search-engine-indexing-off-until-launch); that every route the app exports
and every concrete page URL is registered with the checker; that every page response carries the
security headers; that every opening-hours statement on a page (ranges in any spelling, day
ranges, "open daily" claims, the hours table row by row) agrees with the real hours; and that no
banned wording, malformed phone number, unexpanded `{hours}` or `{season}`, or unresolved template placeholder
reached the visible text, the attributes, the structured data, the inline page payload or the
JavaScript bundles. It also scans every source file under `src/` and `netlify/`, and this README,
for banned wording. Because the build has no blob store, what it checks is the default content;
the owner's content is checked by the same rules at publish time. The rules themselves live in
`src/data/content-rules.json`, and the checker runs the very module the editors' validator runs
(`src/lib/copy-rules.ts`), so the two can never disagree. It prints a PASS/FAIL table and exits
non-zero if anything fails.

---

## Deploying to Netlify

Either path works. `netlify.toml` already supplies the build command
(`npm run build && npm run verify`), the publish directory (`.next`), the Next runtime plugin,
Node 22, cache headers for static files, and the routing for the [admin section](#admin-editors)'s
edge function — so no settings need to be typed into the Netlify UI beyond the admin environment
variables.

Security headers come from three places, because Netlify applies `netlify.toml`'s `[[headers]]`
only to files served from its static store: `next.config.ts` (`headers()`) sets them on every
page the Next runtime renders — the public pages, the 404 and the admin screens, plus `no-store`
on `/admin`; `netlify.toml` sets the same values on static files; and the Netlify Functions and
the edge guard set their own headers on what they answer. `npm run verify` checks every page
response for them.

### Option A — connect the Git repository (recommended)

1. Push this repository to GitHub, GitLab or Bitbucket.
2. In Netlify: **Add new site → Import an existing project**, pick the repository, and authorize it.
3. Netlify reads `netlify.toml` and pre-fills the build command and publish directory. Confirm they
   read `npm run build && npm run verify` and `.next`, then deploy.
4. Every push to the production branch redeploys. Pull requests get their own preview URL.

### Option B — deploy from your machine

```bash
npm install -g netlify-cli   # once
netlify login                # once
netlify link                 # once, to attach this folder to the Netlify site

netlify deploy --build       # draft deploy, returns a preview URL
netlify deploy --build --prod   # publish to the live site
```

`--build` makes Netlify run the build itself, so the deploy always matches the committed source
rather than whatever happens to be sitting in your local `.next/`.

The site depends on Netlify's Next runtime (`@netlify/plugin-nextjs`, listed in `netlify.toml`
and installed as a dev dependency). It is what renders pages from the blob store and honors the
refresh calls; deploying the `.next` folder anywhere without it would serve the defaults forever.

### Setting the site URL

Canonical URLs, Open Graph tags, `sitemap.xml`, `robots.txt` and the JSON-LD all read one value,
resolved in `src/lib/site.ts`:

```
NEXT_PUBLIC_SITE_URL  →  URL (Netlify sets this automatically)  →  https://nativewildflour.netlify.app
```

When a custom domain is connected, set `NEXT_PUBLIC_SITE_URL` in
**Netlify → Site configuration → Environment variables → Add a variable**, for example
`https://nativewildflour.com` (no trailing slash — one is stripped anyway), then trigger a redeploy.
No file needs to change. To preview the effect locally:

```bash
NEXT_PUBLIC_SITE_URL=https://nativewildflour.com npm run build
```

### Search engine indexing (off until launch)

Until the owner approves the site, it must not show up in search results as the cafe's own (see
`PRODUCT.md`). One build-time variable, read in `src/lib/site.ts`, controls that:

| `NEXT_PUBLIC_SITE_INDEXABLE` | Public pages | `robots.txt` |
|---|---|---|
| unset, or anything but `true` (the default) | `noindex, nofollow` | allows crawling, no `Sitemap:` line |
| `true` | `index, follow` | allows crawling, advertises `/sitemap.xml` |

Crawling stays allowed in both modes on purpose: a search engine can only obey a page's `noindex`
if it is allowed to fetch the page. Canonical URLs, Open Graph tags and the JSON-LD are identical in
both modes, so switching changes nothing else.

**At launch**, once the final domain is set: add `NEXT_PUBLIC_SITE_INDEXABLE` = `true` under
**Netlify → Site configuration → Environment variables**, scoped to the **Production** deploy
context only, then redeploy. The value is baked in at build time, so a change always needs a
redeploy. `npm run verify` reads the same variable, fails when the build's output disagrees with
it, and says which mode it checked on its last lines. To check the launch build locally:

```bash
NEXT_PUBLIC_SITE_INDEXABLE=true npm run build && NEXT_PUBLIC_SITE_INDEXABLE=true npm run verify
```

Before launch, the safest places to show the site are a draft deploy (`netlify deploy --build`
without `--prod`) or a Deploy Preview: Netlify adds its own `X-Robots-Tag: noindex` header to both.

---

## Where to change the content

Everything the pages render comes from `src/data/`. Edit those files, not the page components — the
same values feed the visible copy, the structured data and the metadata, so they can never disagree.

Two kinds of thing live there. **Verified facts** (hours, phone, address, the Facebook link, the
motto, the season wording) are code: they change rarely, the content rules pin most of them, and
several pages and the JSON-LD all read the same export. **Page copy and photos** are content: four
documents the owner edits in the [admin editors](#admin-editors) and that live in the blob store.
The repository only carries a **default** for each, under `src/data/defaults/`, used until
something is published.

| What | Where | Read by |
|---|---|---|
| **Hours** | `src/data/business.ts` | `OPENING_HOURS` |
| **Phone** | `src/data/business.ts` | `PHONE` |
| Address, geo coordinates, Facebook link, motto, coffee roaster, season wording | `src/data/business.ts` | — |
| Map links and the embedded map (derived from the coordinates) | `src/data/map.ts` | `MAP_LINKS` |
| **Menu** sections, items, descriptions, bannock toppings, menu notes | the [admin editor](#admin-editors); default in `src/data/defaults/menu.json` | `getContent('menu')` |
| **Home page** copy: headline, bannock explainer and photo, feature cards, visit-us notes, the customer quote, the Meet Kelly teaser, the Facebook panel | the admin editor; default in `src/data/defaults/home.json` | `getContent('home')` |
| **About page** copy and Kelly's photo | the admin editor; default in `src/data/defaults/about.json` | `getContent('about')` |
| **Directions page** copy: orientation notes and the storefront photo, dock-by-dock walks, shuttle, arrival notes, tips, FAQ | the admin editor; default in `src/data/defaults/directions.json` | `getContent('directions')` |
| Navigation links | `src/data/nav.ts` | `NAV_LINKS` |

`getContent()` in `src/lib/server/content.ts` is the one way a page reads a document: the blob
when one is saved, the default when the store has nothing usable for that page.

The shape of each page document — every field, its label in the editor, and what the validator
checks — is declared once in `src/lib/content/{home,about,directions}.ts`. Add a field there, give
it a default value in the JSON, and render it in the component; the editor draws the control from
the same declaration. **Make new fields optional, or fill them from the default before parsing:**
a document the owner saved before the field existed will not have it, and a required field that
is missing makes the stored document unreadable — the editor refuses to open it, and because the
deploy's own post-build refresh re-renders every page on demand, the public page becomes an error
page rather than its last good render.

### Hours

`OPENING_HOURS` is an array shaped for schema.org's `openingHoursSpecification`. Change it once and
the hours table, the header strip, the footer, the hours card and the JSON-LD all follow, and so
does every FAQ answer written with the `{hours}` token:

```ts
export const OPENING_HOURS: readonly OpeningHoursSpec[] = [
  {
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',   // 24-hour HH:MM
    closes: '16:00',
  },
];
```

Days left out of every entry are rendered as **Closed**. `HOURS_ROWS` (the table) and the two
display strings — `HOURS_SUMMARY` ("Sunday–Friday, 9:00 AM – 4:00 PM. Closed Saturday.") and
`HOURS_SHORT` ("Open Sun–Fri 9 AM–4 PM · Closed Sat") — are all derived from it. `SEASON_NOTE`
holds the seasonality wording. The about page's season card doesn't repeat it: its text is the
`{season}` token, which the page and the editor preview fill in from `SEASON_NOTE`, so a change to
the note reaches every page with the next deploy. The gate fails if the default card stops using
the token or `/about/` stops printing the note.

The expected hours also live in `src/data/content-rules.json` (`expectedHours.opens`, `closes`
and `days`), which the verify gate and the editors' validator read. Change both together — the
gate compares them and fails the deploy if they disagree.

The owner's own words are the one place hours could go stale, so the editors steer them to a
token: in the directions FAQ answers, `{hours}` is replaced with `HOURS_SUMMARY` wherever the
answer renders (the page, its FAQ structured data and the editor preview). The default "What are
your hours?" answer uses it, and a publish is refused while an answer types the hours out by hand
(restoring an older version that does so still works — the snapshot cannot be edited first), so
with the token in place an hours change needs no content edit at all. Anywhere else, hours the
owner writes are checked against the rules — time ranges in any common spelling ("9 a.m. – 4
p.m.", "9:00 AM until 4 PM"), opening and closing times, day ranges and closed days named as open,
"open daily" — and `{hours}` itself is refused outside the FAQ answers, where nothing would fill
it in. Stored content published before a change is not rewritten: after changing the hours, open
each editor once; anything that now contradicts them is listed there, and the live page keeps
showing the stored words until the owner publishes the fix.

The season note works the same way: `{season}` is filled in only in the about page's "Made in
Skagway" card text and refused anywhere else, and a card that types the note out word for word is
steered to the token (it blocks a publish, not a restore).

### Phone

```ts
export const PHONE: PhoneData = {
  display: '+1 907-612-0002',   // what visitors read
  e164: '+19076120002',         // international format
  href: 'tel:+19076120002',     // the link target
};
```

All three must describe the same number. `npm run verify` fails the build if the rendered number
and the number in the structured data disagree.

### Menu

The menu is content, not code. The owner edits it in the [admin editor](#admin-editors) and it is
read from the blob store at request time; the menu page, the home-page highlights, the about page's
topping chips and the `Menu` JSON-LD all render from that one document. The committed default in
`src/data/defaults/menu.json` only matters until the first publish. Each section needs a stable
`id` (a lowercase slug; it becomes the anchor `#menu--<id>` used by the jump links on `/menu/` —
the `menu--` prefix keeps an owner's slug from ever landing on one of the page's own ids), a
`name`, an optional one-line `description`, and `items` of `{ name, description }`. Dock cards on
`/directions/` follow the same rule: a dock's link id `broadway-dock` is the anchor
`#dock--broadway-dock`.

**Prices are deliberately absent.** Nothing on the site prints a price; the copy says prices are
posted at the counter, and that price line is fixed wording the editor cannot change. If prices
are ever published, add them to the menu data and add `offers` to the JSON-LD in
`src/lib/schema.ts` at the same time.

---

## Admin editors

The site has a small admin section behind a sign-in: `/admin/` (landing) plus one editor per
page — `/admin/home/`, `/admin/menu/`, `/admin/about/`, `/admin/directions/` — and a photo
library at `/admin/photos/`. Together they let the owner change everything the pages say and
show, from a browser, with nothing to install and no Git. Every admin page is noindex and excluded
from the sitemap.

Each editor is the same tool pointed at a different document: live checks as you type, a preview
of the real page beside the fields, undo/redo, a draft kept on the device until it is published,
version history with restore, and a Publish button that only lights up when every check passes.
The menu editor has hand-built controls for sections, items and topping chips, and it also edits
the words around the menu on `/menu/`; its "Good to know" notes use the same list controls as
the page editors. The three page editors draw their fields from the page's field declaration in
`src/lib/content/`.

What each editor covers, and what stays fixed:

| Editor | Editable | Fixed (comes from `src/data/business.ts`) |
|---|---|---|
| Home page | Headline and highlighted word, opening paragraph, the bannock explainer and its photo, the three feature cards, the menu-highlights heading, the visit-us notes, the customer quote, the Meet Kelly teaser, the Facebook panel | Motto, hours pill, address, phone, map links, the menu cards themselves |
| Menu | The line above the Menu heading, intro, the specials box heading and wording, the heading over the sections, sections, items, descriptions, topping chips, which sections the home page highlights, the "Good to know" heading and notes | The "Menu" page heading, the Facebook button, the "prices are posted at the counter" line and the "Prices at the counter" card |
| About page | Every section's heading and paragraphs, Kelly's photo, Grammy's quote, the three "Made in Skagway" cards (a card's text can be `{season}`, filled in with the season note), the come-say-hello notes | Toppings list (from the menu), motto banner, address, phone, Facebook link, hours table, the season note itself |
| Directions page | Headline and intro, orientation notes and the storefront photo, the dock-by-dock walks, the shuttle card, arrival notes, tips, the FAQ | Address block, phone, hours, season note, the map and its links |

### How publishing works

Each document lives in a **Netlify Blob** (store `site-content`, keys `home.json`, `menu.json`,
`about.json`, `directions.json`) — the blob is the only source of truth once something has been
saved. Until then the default under `src/data/defaults/` is what loads everywhere: the pages
render it, and the editor opens on it and says so ("editing the current home page"). "Nothing
saved" covers a missing blob and an empty one alike, page by page: publishing the menu never
changes what the other pages fall back to. A blob that holds content but cannot be read —
malformed JSON, the wrong shape — is treated differently on purpose: the loader throws with the
reason instead of quietly reverting the owner's edits, and the editor points at version history.
A render on the 60-second timer keeps the last good page up; a render forced by a publish or a
deploy is blocking, so there it is an error page until the blob is repaired.

1. The owner edits and clicks **Publish**. The editor validates as they type — blanks, wording the
   content rules ban, wrong brand casing, price-like strings, a wrong phone number, hours that
   contradict the real ones, duplicate anchor ids, a photo without a caption — and will not send
   anything that fails.
2. The Netlify Function (`netlify/functions/admin-content.mts`) validates again, snapshots the
   previous version, writes the blob, and asks the site to refresh by calling
   `/admin/api/revalidate` with the same sign-in.
3. That route handler marks the four public pages for regeneration, along with the sitemap, whose
   "last modified" dates come from each document's publish time. The next visitor to each page
   gets it rendered fresh from the blob store, and Netlify caches that render until the next
   publish. **Changes are live as soon as the next page load** — no build, no deploy. As a safety
   net every page also refreshes itself at most once a minute, so even a lost refresh call
   cannot leave the site stale.

A code deploy prerenders the pages from the defaults, because the build has no blob store. The
`refresh-content` build plugin (`netlify/plugins/refresh-content/`) runs after the deploy goes
live and makes the same refresh call, so the first visitor already sees the owner's content.

### Photos

Photos are uploaded from the photo field inside an editor, or from the library at
`/admin/photos/`. The browser downscales the picture first (longest edge 1600 px, re-encoded as a
JPEG around 85% quality), so uploads are small and pages never ship a phone-sized original. A
photo wider than 800 px also gets an 800 px copy, sent in the same upload and stored beside it
(`w800/<id>`); the public pages offer both in `srcset`, so a phone downloads the smaller one. The
file is stored in a second blob store (`site-images`), and the document keeps only its id and
pixel size — which is what lets the page reserve the right space before the picture
loads. Pick an existing photo from the library to reuse it on another page. A photo cannot be
deleted while any published document still uses it, or while a saved version in any page's
history does (a restore would otherwise put a missing photo back on the site) — the library marks
both cases and keeps Delete off, so remove it from the page and publish first, and wait for those
versions to age out of the history. A delete and a publish that race each other re-check after
their own write and back off (the photo is put back, or the publish is rolled back), so a live
page never points at a missing photo. A deleted photo and its copy are also purged from Netlify's
CDN by their shared cache tag (via `purgeCache` from `@netlify/functions`; skipped locally, where
no purge token is set), so their URLs stop answering at once.

Photos are served under `/images/uploads/` (and the copies under `/images/uploads/w800/`, which
falls back to the full photo for uploads made before the copies existed) by a small public
function that streams them from the blob store with year-long cache headers — every upload has a
new id, so a cached copy can never go stale. The editor preview reads the full-size pictures
through the sign-in-protected `/admin/api/images/` endpoint.

### Version history

Every publish snapshots the document it replaces (the newest 20 snapshots per document are kept).
Each editor's history panel lists them labelled with the time each version was itself published
(read from the snapshot), and can restore any one — a restore runs the same
validate–snapshot–write–refresh pipeline, so it is simply a publish of an older version, live on
the next page load with no build. A snapshot that can no longer be read is refused with "That saved
version is damaged and can't be restored" (HTTP 422); pick another version.

### Setup

Two environment variables, set in **Netlify → Site configuration → Environment variables**.
Never commit the values.

| Variable | Purpose |
|---|---|
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | The sign-in for `/admin/*` and its API (HTTP Basic auth, checked at the edge and again inside each Function and the refresh route). Until both are set, `/admin/*` answers 503 — the gate fails closed rather than open. The same values let the content function and the post-deploy plugin call the refresh route. |

No build hook is needed: publishing never triggers a build.

Two notes on operating it:

- **Scope both variables to the Production context.** When adding each one, choose
  **Different value for each deploy context** and set a value only for **Production**. Deploy
  previews and branch deploys then have no working sign-in, so a preview of an unreviewed branch
  can never become a way to write to the live content. (They share the blob store, so a preview
  still *reads* the owner's published content.)
- **Two saves can collide.** Every publish carries the publish time of the version the editor
  loaded. If the document changed since — another tab, another device, a restore — the save is
  refused (HTTP 409) with a message saying so, rather than silently overwriting the newer version;
  the same answer covers two saves racing on the server. Reload the page to pick up the latest
  version (unpublished edits stay in the browser's draft), then make the change again.

### Local development

- `npm run dev:admin` is the whole thing on one machine without the Netlify CLI: it starts
  `next dev` (or reuses one already on port 3000), runs the functions in-process against a local
  blob store, and serves both behind <http://localhost:8788> with the same sign-in prompt as
  production. The dev server reads the same local store, so what you publish shows up on the
  local pages at once. It all stays in `.netlify/dev-blobs/` — delete that folder to start clean.
- `netlify dev` does the same through the Netlify CLI when it is installed and the site is linked.
- Plain `next dev` has no blob store: the pages render the defaults, and the editors open
  read-only on them and say so in a banner.
- `npm run smoke:admin` runs the functions and the content loader against a throwaway local blob
  store — the fastest way to check a change to either without a deploy.

---

## Photo slots

The site ships with **no photography**. The only source raster is `assets/logo.jpg`; everything else
is typography, color, CSS and inline SVG. Real photos have to come from the owner — do not take
images from Facebook, Yelp or any other listing.

`src/components/PhotoSlot.tsx` marks where a photograph belongs. It renders a dashed frame
with the logo watermark and the caption underneath, so the layout already reserves the space.
There are three slots today, each owned by a page document: "Fresh-fried bannock, ready for a
topping" on the home page, "Kelly at the counter" on `/about/`, and "Our corner at First Avenue &
State Street" on `/directions/`. The owner fills them from the [admin editors](#admin-editors) —
upload, caption, publish — and nothing in the code changes:

```tsx
<PhotoSlot photo={content.photo} imageBase={imageBase} />
```

The caption is both the visible caption and the alt text, so every slot keeps describing its own
picture. A slot whose document has no image keeps the placeholder.

To add a slot to a page, add a `photo` field to that page's declaration in `src/lib/content/`,
seed it in the JSON with `{ "caption": "…", "image": null }`, and render it with `PhotoSlot` —
the editor grows the matching upload control on its own. For a picture that belongs in the code
rather than the content (a committed file under `public/images/`), the older form still works and
needs the file's true pixel size, because images are served unoptimized (`images.unoptimized`):

```tsx
<PhotoSlot caption="…" src="/images/example.jpg" width={1200} height={900} />
```

Good candidates for more slots, in priority order:

- **Home hero** — a wide shot of the counter, or bannock on a plate.
- **Menu page** — one photo per section: bannock, the lunch special, baked goods, coffee (the menu
  document has no photo fields yet; adding them means extending the menu editor's section cards).
- **About page** — the storefront, to go with Kelly's portrait.

Every slot lazy-loads, which is right while no photo sits above the fold. If one ever does (a home
hero shot), give `PhotoSlot` a pass-through for next/image's `preload` prop and set it on that
slot only — `priority` is deprecated as of Next 16.

### Generated images

`npm run prepare-assets` regenerates these from `assets/logo.jpg`. The outputs are committed, so it
only needs to be re-run if the logo changes.

| Output | Size | Used for |
|---|---|---|
| `public/images/logo-256.webp` | 256 × 256 | Header badge |
| `public/images/logo-256.png` | 256 × 256 | PNG fallback for places that cannot use WebP (not referenced by the site) |
| `public/images/logo-512.webp` | 512 × 512 | Page hero, JSON-LD `logo` |
| `public/images/logo-1024.webp` | 1024 × 1024 | Large displays |
| `src/app/icon.png` | 512 × 512 | Browser and app icon, served at `/icon.png` |
| `src/app/apple-icon.png` | 180 × 180 | iOS home-screen icon, served at `/apple-icon.png` |
| `src/app/favicon.ico` | 16 + 32 px | Tab icon (PNG-in-ICO, ~3.5 KB), served at `/favicon.ico` |
| `public/images/og-default.png` | 1200 × 630 | Social share card |

The logo art has a white background, so it is always presented on a white rounded badge with a soft
shadow — that way the white box reads as intentional rather than as a rendering mistake.

## Colors and type

Design tokens are declared once, as Tailwind v4 `@theme` variables in `src/app/globals.css`:
`--color-cream` (page background), `--color-bark` (body text), `--color-wood`, `--color-wheat`,
`--color-honey`, `--color-fireweed`, `--color-blueberry`, `--color-spruce`, `--color-sky`,
`--color-snow`. Body text is bark on cream (about 12:1 contrast). Buttons are blueberry or fireweed
with white text. Never set wheat text on cream — it does not meet WCAG AA.

Fonts are self-hosted by `next/font`: **Fraunces** for headings, **Nunito** for body copy.

---

## Content rules

These are not style preferences; the site was written to them and `npm run verify` enforces the
first two.

- The business is a **cafe / eatery / bakery-cafe**. Do not describe it as anything else. The
  schema.org type is `["Restaurant","CafeOrCoffeeShop"]`.
- The name is always **Native WILDFlour** — capital `W`, `I`, `L`, `D`, and capital `F`.
- Never invent prices, an email address, a street number, season dates, awards, ratings, review
  counts, or social links other than Facebook.
- Bannock is described respectfully and in general terms. The site does not attribute it to one
  specific tribe and makes no historical claims.
- Tone: warm, genuine, small-town Alaska. Short paragraphs, no emoji in body copy, American English.

---

## Owner to confirm

Open questions from building the site. Nothing published depends on a guess — each item below is
either omitted or uses the value the owner maintains directly.

1. **Phone number.** The site publishes `+1 907-612-0002`, taken from the owner-maintained Facebook
   page. A different number appears on a third-party listing; it is deliberately not used anywhere.
   Please confirm which number is current, and whether the published one also reaches WhatsApp.
2. **Season dates.** Hours are described as seasonal, following the summer cruise season, with no
   specific opening or closing dates. Please supply the dates you would like published — or confirm
   you would rather keep the general wording, since dates need updating every year.
3. **Exact street number.** The address is published as the corner, "First Avenue & State Street,
   Skagway, AK 99840", because no verified street number was available. Please supply one if it
   exists, so maps and delivery services can pin it precisely.
4. **Email address.** None is known, so none is published. Please supply one if you would like
   visitors to be able to write to you; otherwise phone and Facebook remain the only contacts.
5. **Prices.** Not published anywhere. The copy says prices are posted at the counter. Please
   confirm whether you want prices on the menu page, keeping in mind they then need updating
   whenever they change.
6. **Online ordering.** The site has no ordering, payment or pickup-scheduling feature — it is
   informational, and it says to order at the window. Please confirm whether you want online
   ordering added. It would be a significant change: the site is informational, with no checkout,
   so ordering would mean adding a payment provider or an ordering platform,
   a way to receive and confirm orders during service, and a policy for sold-out specials.
7. **Menu lineup.** Items come from the chalkboard menu and Facebook posts. Please confirm the
   current lineup, especially the rotating savory lunch specials and the baked goods.
8. **Photography.** None on the site yet — see "Photo slots" above. Photos you own would make the
   biggest single difference to how the site looks, and you can add them yourself from the admin
   editors.
