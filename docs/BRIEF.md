# Native WILDFlour — Website Build Brief (AUTHORITATIVE)

Owner of this document: **Fable 5 (planner / orchestrator / final reviewer)**.
Implementers: **Opus 5 sub-agents**. Follow this brief literally. If something here conflicts
with your instincts, the brief wins. If the brief is silent, choose the simplest correct option
and note it in your final report.

---

## 1. The business (verified facts — use ONLY these; do not invent)

| Field | Value | Source |
|---|---|---|
| Name (exact casing) | **Native WILDFlour** | Facebook page title, logo |
| What it is | A small independent **cafe / eatery** in Skagway, Alaska serving authentic Alaskan bannock (fresh fried bread), house-baked goods, and Alaska-roasted Kaladi Brothers coffee. | FB + photos |
| Location (street) | **First Avenue & State Street, Skagway, AK 99840** (corner; on 1st Ave, one block west of Broadway) | FB About, Yelp |
| Geo | lat **59.4539**, lng **-135.3209** | Yelp/Roadtrippers, OSM reverse-geocode = 400 block of 1st Ave |
| Phone | **+1 907-612-0002** (also WhatsApp) | FB About (owner-maintained). NOTE: Yelp shows (907) 612-0303 — DO NOT publish that one. |
| Hours | **Sunday–Friday 9:00 AM – 4:00 PM. Saturday: Closed.** Seasonal (summer / cruise season). | FB "WE ARE OPEN" sign |
| Owner | **Kelly** | FB recommendation + owner reply |
| Owner story | Trained at the **Culinary Art Institute in Seattle**. Greatest inspiration: her **Grammy**, who "filled our hearts and tummies with the smell of fresh baking"; her love, generosity and recipes inspire everything Kelly makes. Bannock is made from a **passed-down family recipe**. | FB Intro |
| Motto on signage | **"Made in Skagway • Made with Love • Made to Go"** | FB lunch-special graphic |
| Coffee | Proudly serving Alaska-roasted **Kaladi Brothers Coffee** (drip) | chalkboard + cup photos |
| Facebook | https://www.facebook.com/NativeWILDFlour/ | — |
| Public review (quote verbatim, attribute as "Kayla F., Facebook recommendation") | "This is the ONLY authentic bannock available in Skagway. The owner, Kelly, is an absolute gem… Armed with her passed down family recipe, her bannock melts in your mouth and fills you with joy. Enjoy a variety of toppings including her own hand made rhubarb jam!" | FB |
| Alaska business license | #2232587 (active 2026) — do NOT display on site | state directory |

### Menu (from the chalkboard menu + Facebook posts). **No prices are known → do not print prices.**
Say: "Prices posted at the counter" / "Ask at the window for today's specials."

- **Alaskan Bannock** — fresh fried bread, made to order. Toppings: butter · strawberry jam · powdered sugar · Nutella · honey · **homemade rhubarb jam**.
- **Savory bannock lunch specials** (rotate daily, often sell out) — example: "Native Bannock with sausage, green onions & cheddar".
- **House-baked goods** — homemade cookies (e.g., M&M cookies) and muffins (e.g., poppy seed). Rotates daily.
- **Coffee & tea** — Kaladi Brothers drip coffee (Alaska-roasted); hot tea (your choice).
- **Cold drinks** — "Tiki Breeze" refresher (iced, fruity); bottled water; Coke; Diet Coke; Sprite.

### What bannock is (safe, general wording)
Bannock is a simple, hearty bread — flour, water, a little fat and leavening — pan-fried or baked
until golden. It is a beloved staple across Alaska Native and First Nations communities and
throughout the North; families pass down their own versions. Keep wording respectful and general;
do not attribute it to one specific tribe and do not make historical claims beyond this.

---

## 2. Non-negotiable content rules

1. **NEVER** use the words *food truck, truck, trailer, mobile, cart, van, wheels, pop-up* anywhere
   (copy, metadata, alt text, JSON-LD, comments, README). It is a **cafe / eatery / bakery-cafe**.
   Schema.org type: `["Restaurant","CafeOrCoffeeShop"]`. (The word "mobile" is also banned in copy;
   say "phone" for the device and "on small screens" for responsive notes. The only allowed exception
   is the component/file name `MobileNav` and CSS/code identifiers, which never render as text.)
2. **Never invent** prices, an email address, a street number, season dates, awards, ratings,
   review counts, social links other than Facebook, or menu items not listed above.
3. Do **not** use any photos scraped from Facebook/Yelp. The only raster asset is `assets/logo.jpg`.
   Everything else is typography, color, CSS, and inline SVG. Leave clearly-documented slots
   (see README section) where the owner can drop real photos later.
4. Name casing is always **Native WILDFlour** (capital W-I-L-D, capital F). Never "Wildflour".
5. Tone: warm, genuine, small-town Alaska; confident but not salesy. Short paragraphs. No emoji in
   body copy. American English.

---

## 3. Tech stack & architecture (exact)

- **Next.js 16.3.x** (App Router, TypeScript strict), **React 19.2.x**, **Tailwind CSS 4.3.x** via
  `@tailwindcss/postcss`. Pin `typescript` to **~5.9.x** (NOT 7.x). Node 22 on Netlify.
- `next.config.ts`: `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`,
  `reactStrictMode: true`, `poweredByHeader: false`.
  Rationale: all pages are static; a static export is the most robust Netlify deployment (no runtime
  adapter), ideal for SEO, and publishes from `out/`.
- **Netlify**: `netlify.toml` with `[build] command = "npm run build"`, `publish = "out"`,
  `[build.environment] NODE_VERSION = "22"`; `[[headers]]` for security (X-Content-Type-Options,
  Referrer-Policy, X-Frame-Options SAMEORIGIN, Permissions-Policy) and caching
  (`/_next/static/*` → `public, max-age=31536000, immutable`; `/images/*` long cache). Add `.nvmrc` = `22`.
  Do NOT add `@netlify/plugin-nextjs` (not needed for static export).
- Site URL: `src/lib/site.ts` exports `SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL ?? 'https://nativewildflour.netlify.app').replace(/\/$/, '')`.
  All canonicals, OG urls, sitemap, robots, JSON-LD use it. `metadataBase = new URL(SITE_URL)`.
- Fonts: `next/font/google` — display: **Fraunces** (weights 600/700/900),
  body: **Nunito** (400/600/700). `display: 'swap'`, CSS variables `--font-display`, `--font-body`.
- Styling: Tailwind v4 `@theme` tokens in `src/app/globals.css`:
  - `--color-cream: #FFF8EC` (page bg), `--color-bark: #3B2A1A` (text), `--color-wood: #8B5A2B`,
    `--color-wheat: #E9B949`, `--color-honey: #C98A1B`, `--color-fireweed: #C7407B`,
    `--color-blueberry: #3A5FA8`, `--color-spruce: #2F5D46`, `--color-sky: #BFE0F5`, `--color-snow: #FFFFFF`.
  - Body text on cream must meet WCAG AA (bark on cream is ~12:1 — good). Buttons: blueberry bg +
    white text, or fireweed bg + white text (both ≥4.5:1). Never wheat text on cream.
- The logo JPG has a **white** background. Always present it on a white surface (white rounded
  "badge"/card with soft shadow) so the white box reads as intentional.
- Image assets: the scaffold agent generates from `assets/logo.jpg` via `sharp` (one-time script
  `scripts/prepare-assets.mjs`, run manually, outputs committed):
  `public/images/logo-256.png`, `public/images/logo-512.webp`, `public/images/logo-1024.webp`,
  `src/app/icon.png` (512²), `src/app/apple-icon.png` (180²), and
  `public/images/og-default.png` (1200×630: cream background, logo centered on a white rounded
  badge, text "Native WILDFlour — Authentic Alaskan Bannock · Skagway, Alaska" rendered by a sharp
  SVG overlay). Skip `favicon.ico` unless you can generate a valid ICO; `icon.png` is sufficient.
  `sharp` is a devDependency only.
- Components (server components by default; client only where interaction is needed):
  `src/components/SiteHeader.tsx` (logo badge + nav: Home, Menu, About, Directions; the small-screen
  disclosure menu is a small client component `MobileNav.tsx` using a `<button aria-expanded>` + `<ul>`;
  no third-party UI libs), `SiteFooter.tsx` (address, phone tel: link, hours, Facebook link, ©year,
  "Made in Skagway • Made with Love • Made to Go"), `JsonLd.tsx` (renders `<script type="application/ld+json">`),
  `Section.tsx`, `ButtonLink.tsx`, `HoursTable.tsx`, `MapEmbed.tsx`, `Breadcrumbs.tsx`,
  `Faq.tsx` (native `<details>`), `MenuSection.tsx`.
- Data lives in `src/data/`: `business.ts` (name, address, geo, phone, hours as
  `openingHoursSpecification`-ready array, facebook url, motto), `menu.ts`, `directions.ts` (docks,
  FAQ). Pages render from data. Single source of truth.
- SEO plumbing: `src/lib/seo.ts` (`buildMetadata({title, description, path})` → canonical =
  `${SITE_URL}${path}`; title template `%s | Native WILDFlour` with home title override; OG type
  website, images og-default, twitter summary_large_image; `robots: index, follow`),
  `src/lib/schema.ts` (builders: `restaurantSchema()`, `menuSchema()`, `breadcrumbSchema(items)`,
  `faqSchema(items)`, `webSiteSchema()`), `src/app/sitemap.ts`, `src/app/robots.ts`,
  `src/app/manifest.ts`. Root layout injects `restaurantSchema()` + `webSiteSchema()` once.
  Each subpage adds `breadcrumbSchema`; menu adds `menuSchema`; directions adds `faqSchema`.
- Accessibility: skip link, `<header>/<nav aria-label>/<main id="main">/<footer>`, one `<h1>` per
  page, logical h2/h3, focus-visible rings, 44px touch targets, `prefers-reduced-motion` respected,
  `lang="en"`, all images have alt, decorative SVG `aria-hidden`.
- Performance: no client JS beyond the small-screen nav; no analytics; `next/font` self-hosts fonts;
  images sized with width/height; `loading="lazy"` for the map iframe; Lighthouse targets ≥95 all
  categories on phone-sized viewports.
- Pages & routes (trailing slash everywhere): `/`, `/menu/`, `/about/`, `/directions/`, `not-found.tsx`.
- ESLint: flat config `eslint.config.mjs` using `eslint-config-next` (Next 16 removed `next lint`;
  script `"lint": "eslint ."`). `npm run build` must pass with `typescript` type-check.
- README.md: how to run, build, deploy to Netlify (connect repo, or `netlify deploy --build`), how
  to set `NEXT_PUBLIC_SITE_URL`, where to change hours/menu/phone (the data files), how to add
  photos (image slots), and the "discrepancy / owner-to-confirm" list.

---

## 4. Page-by-page spec

### `/` Home — title: `Native WILDFlour | Authentic Alaskan Bannock & Coffee in Skagway, Alaska`
meta description (≤155 chars, one sentence, include "Skagway" and "bannock" and "Kaladi Brothers").
1. **Hero**: logo badge (priority image), `<h1>` "Authentic Alaskan Bannock in Skagway, Alaska",
   lede (1–2 sentences: fresh-fried bannock from a family recipe, Kaladi Brothers coffee, steps from
   the cruise docks at First Avenue & State Street), CTAs: "See the Menu" (primary → /menu/),
   "Directions from the Docks" (secondary → /directions/). Small "Open Sun–Fri 9–4 · Closed Sat" pill.
2. **What is bannock?** short explainer (h2) + 3 feature cards: Family Recipe · Made Fresh Daily ·
   Alaska-Roasted Coffee.
3. **Menu highlights** (h2): bannock + toppings list, lunch specials, baked goods, coffee; link to /menu/.
4. **Visit us** (h2): address, hours table, phone, "Open in Google Maps"/"Open in Apple Maps" links,
   one-paragraph cruise-passenger teaser linking /directions/.
5. **Quote** block: the Kayla F. recommendation.
6. **About teaser** (h2 "Meet Kelly") 2–3 sentences → /about/.
7. **Facebook CTA**: "Daily specials are posted on Facebook" → external link (rel noopener).

### `/menu/` — title `Menu` → `Menu | Native WILDFlour`
H1 "Menu". Intro line (made fresh daily; specials rotate and sell out; prices at the counter).
Sections as in §1. Each item: name + 1-line description. Toppings as a chip list. A "Today's special"
note box: "Check our Facebook page for today's lunch special." JSON-LD `Menu` + `MenuSection` +
`MenuItem` (no `offers` since no prices). Breadcrumbs.

### `/about/` — title `About Kelly & Our Story`
H1 "Our Story". Sections: Kelly's journey (Seattle → Skagway), Grammy's kitchen, the family bannock
recipe, What bannock is (general), Made in Skagway (small, independent, seasonal; Kaladi Brothers),
"Come say hello" CTA with hours/location. Breadcrumbs. Optional `Person` schema for Kelly is NOT
needed (no surname known) — skip.

### `/directions/` — title `Directions & Cruise Ship Passenger Guide`
H1 "Find Us: Directions for Cruise Passengers & Visitors".
1. Address block + map (`MapEmbed`: OpenStreetMap iframe
   `https://www.openstreetmap.org/export/embed.html?bbox=-135.3265,59.4505,-135.3150,59.4570&layer=mapnik&marker=59.4539,-135.3209`,
   `title="Map showing Native WILDFlour at First Avenue and State Street, Skagway"`, `loading="lazy"`,
   plus buttons: Google Maps directions `https://www.google.com/maps/dir/?api=1&destination=59.4539,-135.3209`,
   Apple Maps `https://maps.apple.com/?daddr=59.4539,-135.3209&dirflg=w`, OSM link).
2. "Where we are in town": 1st Ave & State St — the southern end of downtown, **one block west of
   Broadway**, near Centennial Park (the big rotary snowplow at 1st & Broadway). State Street is the
   Klondike Highway as it enters town.
3. **From your cruise ship** (h2) — three cards, with the caveat line "Walking times are approximate;
   follow port signage and your ship's all-aboard time":
   - **Broadway Dock** — closest. Walk off the pier toward town along Congress Way to the foot of
     Broadway at 1st Avenue (Centennial Park). Turn left (west) on 1st Ave; we're one block ahead at
     State Street. ~5–8 minutes, flat and paved.
   - **Ore Dock** — walk the waterfront path east toward the Small Boat Harbor and Congress Way,
     then north to 1st Avenue; turn left to State Street. ~8–12 minutes, flat and paved.
   - **Railroad Dock** — farthest. Depending on your berth you may walk the paved harbor path, ride
     the port's free shuttle through the rock-fall zone, or tender to shore; then follow the harbor
     path west to Congress Way and north to 1st Avenue, left to State Street. ~15–20 minutes on foot,
     or hop on the SMART shuttle bus downtown.
   - **SMART shuttle** (Skagway's town bus): loops between the docks and downtown roughly every
     15 minutes in season; small per-ride fare, day passes available; ask the driver for the stop
     nearest 1st Avenue & State Street.
4. "Arriving by car, RV, ferry or train" (h2): Klondike Hwy becomes State Street — follow it south
   to 1st Avenue; Alaska Marine Highway ferry terminal is at the south end of town near the docks;
   WP&YR depot is at 2nd Ave & Spring St (2 short blocks east).
5. Tips (h2): budget 20–30 minutes round trip from the closest docks; specials sell out—come early;
   it's a grab-and-go spot (made to go); mornings for coffee & bannock, lunch special around midday.
6. FAQ (h2, `<details>`): "How far is Native WILDFlour from the cruise ship docks?", "Is the walk
   flat / wheelchair friendly?", "What are your hours?", "Do you take reservations?" (No — walk up,
   order at the window), "Where can I see today's special?" (Facebook). `FAQPage` schema. Breadcrumbs.

### `not-found.tsx`: friendly 404 with links to the four pages.

---

## 5. Acceptance criteria (Fable will verify every one)

- [ ] `npm ci && npm run build` succeeds on Node 22 and emits `out/index.html`, `out/menu/index.html`,
      `out/about/index.html`, `out/directions/index.html`, `out/404.html`, `out/sitemap.xml`,
      `out/robots.txt`, `out/manifest.webmanifest`, icons, `images/og-default.png`.
- [ ] `npm run lint` passes (0 errors). `tsc --noEmit` passes.
- [ ] Every page: exactly one `<h1>`, `<title>`, meta description, canonical (absolute, trailing slash),
      OG + Twitter tags, valid JSON-LD (parses; `@type` correct; no forbidden words).
- [ ] `grep -ri` for the forbidden words in `src/`, `out/`, `README.md` → zero matches (case-insensitive),
      excluding the `MobileNav` identifier in code/chunk filenames.
- [ ] Phone appears as `+1 907-612-0002` / `tel:+19076120002` only. "612-0303" appears nowhere.
- [ ] Hours everywhere: Sun–Fri 9 AM–4 PM, Sat closed. JSON-LD `openingHoursSpecification` matches.
- [ ] Sitemap lists exactly the 4 canonical URLs. robots allows all + sitemap URL.
- [ ] Small-screen nav works without JS errors; keyboard operable; focus visible.
- [ ] No console errors/warnings from Next during build (hydration, metadata, image warnings).
- [ ] `scripts/verify-build.mjs` (static checks above) exits 0.
