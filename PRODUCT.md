# Product

<!-- uizze:product-schema 1 -->

## Platform

web

## Users

Primary: cruise-ship passengers in Skagway, Alaska on limited shore time (often ~4 hours),
on their phones, deciding where to eat and how to walk there from their dock. Locals,
seasonal workers, and independent travelers exist as audiences, but the site is
deliberately cruise-visitor-first (confirmed 2026-08-20).

## Product Purpose

A static marketing site for **Native WILDFlour**, a small independent cafe at First Avenue
& State Street in Skagway serving authentic Alaskan bannock (fresh fried bread from a
passed-down family recipe), house-baked goods, and Alaska-roasted Kaladi Brothers coffee.

Success means two things (confirmed 2026-08-20):

1. **Walk-in traffic** — a shore-time visitor finds the cafe and walks over.
2. **Search visibility** — ranking for queries like "bannock Skagway" with correct facts
   (the right phone number and hours; a wrong third-party phone listing exists and the
   site must outrank/correct it).

## Positioning

"The ONLY authentic bannock available in Skagway" (verbatim customer recommendation,
Kayla F., Facebook) — bannock fried to order from a family recipe by the owner herself.
A neighboring restaurant could not truthfully copy the passed-down-family-recipe claim.

## Operating Context

- Seasonal, tied to the summer cruise season. Hours: Sunday–Friday 9 AM–4 PM, closed
  Saturday; hours can shift, and Facebook is the live channel for daily specials and
  updates.
- Grab-and-go counter service: order at the window, no reservations, no online ordering,
  prices posted at the counter only.
- Visitors arrive on foot from three cruise docks (Broadway, Ore, Railroad) or via the
  SMART shuttle; directions content is dock-by-dock.
- **Project status: spec build to pitch the owner, Kelly** (confirmed 2026-08-20). Not
  commissioned; nothing is to be published or represented as the cafe's official site
  until she approves. Future work must preserve this boundary.

## Capabilities and Constraints

- Four pages (home, menu, about, directions) plus 404, all rendered from `src/data/`
  single-source data files; `docs/BRIEF.md` is the authoritative spec.
- Verified-facts-only regime (BRIEF §1): never invent prices, an email address, a street
  number, season dates, awards, ratings, review counts, social links beyond Facebook, or
  menu items. Phone is +1 907-612-0002 everywhere; 612-0303 is a wrong listing and must
  never appear.
- Banned vocabulary, enforced by `npm run verify`: the business is a cafe / eatery /
  bakery-cafe and must never be described with the food-truck family of words (BRIEF §2).
- Bannock is described respectfully and in general terms — no attribution to a specific
  tribe, no historical claims.
- No client JS beyond the header navigation (the small-screen disclosure and the
  wide-screen current-page state); no analytics. Pages are served from Netlify's
  cache and re-rendered from Netlify Blobs when the owner publishes, so content lives
  in Netlify, not the repository, and a save is live within seconds with no build.
- Explicitly unknown facts (do not invent): exact season start/end dates, street number,
  email address, owner's surname.

## Brand Commitments

- Name exactly **Native WILDFlour** (never "Wildflour"). Motto: "Made in Skagway • Made
  with Love • Made to Go".
- Voice: warm, genuine, small-town Alaska; confident but not salesy; short paragraphs; no
  emoji in body copy; American English.
- The only raster asset is `assets/logo.jpg` (white background — always presented on a
  white badge). Everything else is typography, CSS, and inline SVG.
- Facebook is the only social channel.

## Evidence on Hand

- One verbatim public recommendation (Kayla F., Facebook), quoted in full on the home
  page — the only testimonial that exists.
- Owner story facts from the Facebook intro: trained at the Culinary Art Institute in
  Seattle; her Grammy is her greatest inspiration; the bannock recipe is passed down in
  the family.
- No owner-supplied photos yet; `PhotoSlot` components mark where real photos belong. No
  photos may be taken from Facebook, Yelp, or any listing.
- No prices, ratings, awards, or press coverage on hand; these absences must not be
  papered over.

## Product Principles

1. **Facts are inventory.** Every fact on the site traces to BRIEF §1; where the brief is
   silent, say nothing rather than invent.
2. **Serve the 4-hour visitor.** Decisions favor someone on a phone, on foot, deciding
   quickly — findability, hours, and directions outrank storytelling depth.
3. **The site convinces twice.** It must sell the cafe to visitors and sell itself to
   Kelly as her official site; craft is part of the pitch.
4. **Live truth lives on Facebook.** The site states stable facts and points to Facebook
   for anything that changes daily (specials, seasonal hours).
5. **Small and honest.** A short menu, no fake urgency, no invented social proof — the
   tone of a one-person cafe.

## Accessibility & Inclusion

WCAG AA contrast, keyboard operability, 44px touch targets, `prefers-reduced-motion`
respected, semantic landmarks, one `<h1>` per page (BRIEF §3, enforced by the build
gate). Primary use scene is outdoors on a phone in daylight (inferred from the audience
answer), so high contrast is a standing requirement.
