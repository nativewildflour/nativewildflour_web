# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Static marketing site for **Native WILDFlour**, an independent cafe in Skagway, Alaska. Next.js 16 (App Router, TypeScript strict), React 19, Tailwind CSS 4, built as a **static export** (`output: 'export'`) — `out/` is the entire site, served as plain files from Netlify's CDN. There is no server runtime; do **not** add `@netlify/plugin-nextjs`.

`docs/BRIEF.md` is the authoritative spec (facts, content rules, acceptance criteria). `README.md` covers deployment and content editing in depth. Node 22+ (`.nvmrc`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on localhost:3000 |
| `npm run build` | Type-checks and exports to `out/`, then runs `postbuild` |
| `npm run verify` | Acceptance checks against `out/` — **run after every build**; this is the test suite |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Build + serve `out/` on localhost:4173 like a static host would |
| `npm run prepare-assets` | Regenerate all images from `assets/logo.jpg` (only if the logo changes; outputs are committed) |

There is no unit-test framework. `scripts/verify-build.mjs` is the acceptance gate: it checks required files, one `<h1>` per page, titles/descriptions/canonicals/OG/Twitter tags, JSON-LD validity (phone + hours must match the rendered copy), the sitemap, and scans for banned wording — exits non-zero on any failure.

`postbuild` (`scripts/normalize-export.mjs`) fixes a Windows-only Next.js quirk where per-route RSC prefetch `.txt` files land in a subdirectory; on Linux/Netlify it's a no-op. Committing the `next dev`-regenerated AGENTS.md block with your work is expected — deleting it just re-creates an uncommitted change.

## Architecture

**All content flows from `src/data/`** — the single source of truth. The same values feed the visible copy, the `metadata` exports, and the JSON-LD, so they can never disagree (and `verify` fails if they do). Edit data files, not page components:

- `src/data/business.ts` — name, address, geo, phone (`display`/`e164`/`href` must describe the same number), `OPENING_HOURS` (schema.org-shaped; `HOURS_ROWS` is derived, but `HOURS_SUMMARY` and `HOURS_SHORT` are hand-written strings that must be updated to match), Facebook link, motto, owner details
- `src/data/menu.ts` — `MENU_SECTIONS` (each section's `id` is the `/menu/` anchor), `BANNOCK_TOPPINGS`
- `src/data/directions.ts` — dock-by-dock directions, shuttle, tips, FAQ
- `src/data/nav.ts` — `NAV_LINKS`

**`src/lib/`** ties it together: `site.ts` resolves `SITE_URL` (`NEXT_PUBLIC_SITE_URL` → Netlify's `URL` → `https://nativewildflour.netlify.app`) and every canonical, OG URL, sitemap entry, and JSON-LD URL derives from it; `seo.ts` has `buildMetadata()` used by every page; `schema.ts` builds the JSON-LD (schema.org type `["Restaurant","CafeOrCoffeeShop"]`).

**Static-export consequences** (each follows from having no server):

- `trailingSlash: true` — every route is a real `index.html`; write internal links with trailing slashes (`/menu/`)
- `images: { unoptimized: true }` — every `next/image` needs explicit `width`/`height`, and files must be shipped pre-sized to their display size
- Fonts are self-hosted via `next/font`: Fraunces (headings), Nunito (body)
- Components in `src/components/` are server components by default; the only client JS on the site is the header navigation — the small-screen disclosure (`MobileNav`) and the wide-screen current-page state (`NavLinks`), both on `usePathname`

**Design tokens** are Tailwind v4 `@theme` variables in `src/app/globals.css` (`--color-cream`, `--color-bark`, `--color-blueberry`, `--color-fireweed`, `--color-wheat`, …). Body text is bark on cream; buttons are blueberry or fireweed with white text. Never set wheat text on cream — it fails WCAG AA.

**Images**: `assets/logo.jpg` is the only raster source in the project. Everything else is typography, CSS, and inline SVG. `PhotoSlot` components mark where owner-supplied photos belong.

## Content rules (verify-enforced; from docs/BRIEF.md)

- The business is a **cafe / eatery / bakery-cafe**. These words are banned everywhere — copy, metadata, alt text, JSON-LD, comments, README: *food truck, truck, trailer, mobile, cart, van, wheels, pop-up*. For "mobile" say "phone" (device) or "on small screens" (responsive). The only exception is code identifiers that never render, e.g. the `MobileNav` component name.
- The name is always **Native WILDFlour** — exact casing, never "Wildflour".
- The phone is **+1 907-612-0002** everywhere. Never publish 612-0303 (a wrong third-party listing).
- **Never invent**: prices (copy says prices are posted at the counter), an email address, a street number, season dates, awards, ratings, review counts, social links other than Facebook, or menu items not in the brief.
- Bannock is described respectfully and in general terms — no attribution to a specific tribe, no historical claims.
- No photos scraped from Facebook, Yelp, or any listing. Real photos come only from the owner.
- Tone: warm, genuine, small-town Alaska. Short paragraphs, no emoji in body copy, American English.
