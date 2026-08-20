# Native WILDFlour — website

Static marketing site for **Native WILDFlour**, an independent cafe at First Avenue & State Street
in Skagway, Alaska.

---

## Architecture

Next.js 16 (App Router, TypeScript strict), React 19 and Tailwind CSS 4, built as a **static
export**. `npm run build` runs `next build` with `output: 'export'`, which type-checks the project
and writes plain HTML, CSS and image files to `out/`. That directory is the entire site.

Why a static export:

- **Nothing to run in production.** Every page is known at build time — there is no user input, no
  database, no personalization. Netlify serves files straight from its CDN, so there is no server
  runtime to configure, patch or pay for, and no cold starts.
- **No adapter.** A static export needs no `@netlify/plugin-nextjs`. Fewer moving parts between the
  build and the published site means fewer ways for a deploy to break.
- **Good for search engines and social previews.** Titles, meta descriptions, canonicals, Open
  Graph tags and JSON-LD are all present in the delivered HTML, with no client-side rendering step.
- **Fast on a phone over cruise-port wifi.** The only script the site ships is the small-screen
  navigation disclosure. There is no analytics and no third-party JavaScript.

Supporting choices that follow from it: `trailingSlash: true` so every route is a real
`index.html` and canonicals stay stable; `images: { unoptimized: true }` because there is no image
optimization server, which is why every `next/image` call passes explicit `width` and `height`;
fonts self-hosted by `next/font` so no request leaves the origin.

```
assets/logo.jpg          source logo — the only raster input to the project
scripts/                 prepare-assets.mjs (image generation), verify-build.mjs (acceptance checks),
                         normalize-export.mjs (postbuild: makes Windows builds identical to Linux builds)
public/images/           generated images, committed
src/app/                 routes: /, /menu/, /about/, /directions/, not-found, sitemap, robots, manifest
src/components/          UI components (server components by default)
src/data/                business, menu, directions, nav — the single source of truth for content
src/lib/                 site URL, metadata builder, JSON-LD builders
netlify.toml             build command, publish directory, security and cache headers
```

---

## Requirements

- Node.js **22** or newer. `.nvmrc` pins 22 and Netlify uses `NODE_VERSION = "22"`.
- npm 10 or newer.

## Everyday commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (`npm ci` for a clean, lockfile-exact install). |
| `npm run dev` | Development server on <http://localhost:3000>. |
| `npm run build` | Type-checks and exports the static site to `out/`, then runs `postbuild` (see below). |
| `npm run preview` | Builds, then serves `out/` on <http://localhost:4173> exactly as a static host would. |
| `npm run preview:static` | Serves an existing `out/` on <http://localhost:4173> without rebuilding. |
| `npm run verify` | Runs `scripts/verify-build.mjs` against `out/`. Run it after every build. |
| `npm run lint` | ESLint (flat config, `eslint-config-next`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run prepare-assets` | Regenerates every image from `assets/logo.jpg`. Only needed if the logo changes. |

**About `postbuild`.** Next.js 16's static export has a Windows-only quirk: the per-route RSC
prefetch files (`__next.<route>.__PAGE__.txt`) are written into a subdirectory instead of as flat
files, so the client router's prefetch requests 404 locally (navigation still works, it just loses
the prefetch). `scripts/normalize-export.mjs` flattens them after every build. On Linux — including
Netlify — it finds nothing to do and exits quietly, so the deployed output is identical either way.

A full local check before shipping:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run verify
```

`npm run verify` checks the exported HTML: that every required file exists, that each page has
exactly one `<h1>`, a title, a meta description, an absolute canonical URL, Open Graph and Twitter
tags; that all JSON-LD parses and the business listing carries the right phone number and opening
hours; that the sitemap lists exactly the four pages; and that no banned wording, malformed phone
number or unresolved template placeholder reached the output. It prints a PASS/FAIL table and
exits non-zero if anything fails.

---

## Deploying to Netlify

Either path works. `netlify.toml` already supplies the build command (`npm run build`), the publish
directory (`out`), Node 22, security headers, and long-lived cache headers for `/_next/static/*`
and `/images/*` — so no settings need to be typed into the Netlify UI.

### Option A — connect the Git repository (recommended)

1. Push this repository to GitHub, GitLab or Bitbucket.
2. In Netlify: **Add new site → Import an existing project**, pick the repository, and authorize it.
3. Netlify reads `netlify.toml` and pre-fills the build command and publish directory. Confirm they
   read `npm run build` and `out`, then deploy.
4. Every push to the production branch redeploys. Pull requests get their own preview URL.

### Option B — deploy from your machine

```bash
npm install -g netlify-cli   # once
netlify login                # once
netlify link                 # once, to attach this folder to the Netlify site

netlify deploy --build       # draft deploy, returns a preview URL
netlify deploy --build --prod   # publish to the live site
```

`--build` makes Netlify run `npm run build` itself, so the deploy always matches the committed
source rather than whatever happens to be sitting in your local `out/`.

Do **not** add `@netlify/plugin-nextjs`. It exists for server-rendered Next.js; this site is a
static export and the plugin would only add a runtime that nothing here needs.

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

---

## Where to change the content

Everything the pages render comes from `src/data/`. Edit those files, not the page components — the
same values feed the visible copy, the structured data and the metadata, so they can never disagree.

| What | File | Export |
|---|---|---|
| **Hours** | `src/data/business.ts` | `OPENING_HOURS` |
| **Phone** | `src/data/business.ts` | `PHONE` |
| Address, geo coordinates, Facebook link, motto, owner details, the customer quote | `src/data/business.ts` | — |
| **Menu** sections, items, descriptions, bannock toppings, menu notes | `src/data/menu.ts` | `MENU_SECTIONS`, `BANNOCK_TOPPINGS` |
| Dock-by-dock walking directions, shuttle info, tips, FAQ, map links | `src/data/directions.ts` | — |
| Navigation links | `src/data/nav.ts` | `NAV_LINKS` |

### Hours

`OPENING_HOURS` is an array shaped for schema.org's `openingHoursSpecification`. Change it once and
the hours table, the header strip, the footer, the FAQ and the JSON-LD all follow:

```ts
export const OPENING_HOURS: readonly OpeningHoursSpec[] = [
  {
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',   // 24-hour HH:MM
    closes: '16:00',
  },
];
```

Days left out of every entry are rendered as **Closed**. `HOURS_ROWS` (the table) is derived
automatically. Two display strings are written out by hand and must be updated to match:
`HOURS_SUMMARY` ("Sunday–Friday, 9:00 AM – 4:00 PM. Closed Saturday.") and `HOURS_SHORT`
("Open Sun–Fri 9–4 · Closed Sat"). `SEASON_NOTE` holds the seasonality wording.

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

Add or edit entries in `MENU_SECTIONS`. Each section needs a stable `id` (it becomes the anchor
used by the jump links on `/menu/`), a `name`, an optional one-line `description`, and `items` of
`{ name, description }`. The menu page and the `Menu` JSON-LD both render from this array.

**Prices are deliberately absent.** Nothing on the site prints a price; the copy says prices are
posted at the counter. If prices are ever published, add them here and add `offers` to the JSON-LD
in `src/lib/schema.ts` at the same time.

---

## Photo slots

The site ships with **no photography**. The only source raster is `assets/logo.jpg`; everything else
is typography, color, CSS and inline SVG. Real photos have to come from the owner — do not take
images from Facebook, Yelp or any other listing.

`src/components/about/PhotoSlot.tsx` marks where a photograph belongs. It renders a dashed frame
with the logo watermark and the caption underneath, so the layout already reserves the space:

```tsx
<PhotoSlot caption="Kelly at the counter" />
```

It is used once today, on `/about/`. To turn a slot into a real photo:

1. Save the image into `public/images/`, already cropped and resized — images are **not** optimized
   at build time, so ship the file at the size it will be displayed.
2. In `PhotoSlot.tsx`, replace the dashed `<div>` with the real image, using the file's true pixel
   dimensions:

   ```tsx
   <Image
     src="/images/kelly-at-the-counter.jpg"
     alt={caption}
     width={1200}
     height={900}
     className="h-auto w-full rounded-2xl object-cover shadow-sm"
   />
   ```

3. Nothing else changes — `caption` is already both the visible caption and the alt text, so every
   usage keeps describing its own picture.

To add more slots, drop `<PhotoSlot caption="…" />` wherever a photo belongs. Good candidates, in
priority order:

- **Home hero** — a wide shot of the counter, or bannock on a plate.
- **Menu page** — one photo per section: bannock, the lunch special, baked goods, coffee.
- **About page** — a portrait of Kelly, and the storefront at First Avenue & State Street.
- **Directions page** — the corner as it looks from the street, so visitors can spot it.

Use `priority` only on a photo above the fold, and always pass a descriptive `alt`.

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
   ordering added. It would be a significant change: the site is currently a set of static files
   with no server, so ordering would mean adding a payment provider or an ordering platform,
   a way to receive and confirm orders during service, and a policy for sold-out specials.
7. **Menu lineup.** Items come from the chalkboard menu and Facebook posts. Please confirm the
   current lineup, especially the rotating savory lunch specials and the baked goods.
8. **Photography.** None on the site yet — see "Photo slots" above. Photos you own would make the
   biggest single difference to how the site looks.
