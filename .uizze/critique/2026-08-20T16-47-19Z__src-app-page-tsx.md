---
target: home page
total_score: 25
max_score: 32
na_heuristics: 9,10
p0_count: 0
p1_count: 2
timestamp: 2026-08-20T16-47-19Z
slug: src-app-page-tsx
---
Method: dual-agent (A: isolated design-review agent with rendered inspection · B: isolated detector-evidence agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Desktop nav has no current-page state (small-screen nav has one — inconsistent); no "open today" signal though hours are the visitor's #1 status question |
| 2 | Match System / Real World | 4 | Solid — dock language, bannock explained before it's sold, zero jargon |
| 3 | User Control and Freedom | 3 | Nothing traps the user; solid |
| 4 | Consistency and Standards | 3 | Hamburger button labeled "Menu" one tap from the nav item "Menu" (the food menu); desktop vs small-screen current-page treatment diverges |
| 5 | Error Prevention | 3 | "Come early" / "Closed Sat" surfaced honestly; but the seasonal hedge sits directly under the hours table it undermines |
| 6 | Recognition Rather Than Recall | 4 | Facts restated at point of need; toppings shown, not named; menu accents previewed identically to the menu page |
| 7 | Flexibility and Efficiency | 3 | Real accelerators: tel: link, Google/Apple walking-directions deep links (Apple presets walking mode), skip link |
| 8 | Aesthetic and Minimalist Design | 3 | Hours print 3x on one page, the seasonality hedge 2x; dead space in the "Where to find us" and Coffee & Tea cards |
| 9 | Error Recovery | n/a | Static persuade page with no inputs has no error states (404 exists, out of scope) |
| 10 | Help and Documentation | n/a | Persuade landing; FAQ correctly lives on /directions/ |
| **Total** | | **25/32** | **Good (78%)** |

## Design Specificity Verdict

**LLM assessment:** Genuinely authored for this cafe, not a reskinned template. The hero composes an actual Skagway scene (sky wash, low sun, spruce ridge, tilted snow-badge logo, blooming fireweed sprig), the footer is a spruce mountain band, and the home highlight cards reuse the exact per-category accent colors from the menu page. Copy is fact-dense and local (one block west of Broadway, SMART shuttle, Kaladi Brothers, rhubarb jam). The one generic seam: the three icon-badge feature cards in BannockIntro (heart/sunrise/cup) are a stock landing-page trope — competently executed in-palette, but the least "this cafe" moment on the page.

**Deterministic scan:** The bundled detector payload is absent in this install ("Error: bundled detector not found." — real attempt, exit 1), so the deterministic half ran as contrast math + hygiene checks instead. Results: all 23 real color pairs pass WCAG at their applicable thresholds (the two sub-4.5:1 pairs — fireweed-on-cream 4.47, wheat-on-spruce 4.14 — occur only at large-text sizes where 3:1 applies). Hygiene: 2 raw color literals outside globals.css (ButtonLink.tsx:43 hard-shadow rgb, HomeHero.tsx:26 sun-glow rgb — both encode existing palette values); 16 arbitrary-value Tailwind classes, most of them de-facto tokens (tracking-[0.18em] x3, rounded-[2rem] x2); clean heading outline (one h1, no skipped levels); all images have alt text (though header and hero logo share the identical alt string); decorative SVGs aria-hidden; 44px touch targets present on every interactive element. False positives noted: layout.tsx themeColor literal (Next metadata requires a literal string).

**Visual overlays:** No user-visible overlay is available — the detector payload that drives injection is missing from this install. Rendered evidence came from Assessment A's full-page screenshot pass over a fresh build instead.

## Overall Impression

A strong, genuinely authored persuade surface — 25/32 with no P0s is real-world good, and the mechanical hygiene underneath is nearly spotless. The biggest opportunity is not visual: the page soothes the shore-time visitor's core anxiety rhetorically ("steps from the docks," "short, flat and paved") when the deciding facts — walk minutes, an "open today" signal, a photo of the actual bannock — either live one page away or don't exist yet. The pitch-to-Kelly polish is there; the dockside-decider conversion case still leans on prose where it could use numbers and food.

## What's Working

1. **The hero is a composed scene, not a layout** — gradient sky, radial sun, ridge divider, tilted logo badge, staggered entrance with a correct reduced-motion collapse. This is the "impress Kelly" moment and it works.
2. **Cruise-first IA is real, not claimed** — "Directions from the Docks" is a hero CTA in the visitor's own words; the cruise panel names the Broadway Dock and SMART shuttle; the Apple Maps link presets walking mode.
3. **Single-source facts made visible** — phone/hours/address render from business.ts everywhere, and home highlight cards carry the same menuAccent() strokes as the menu page: cross-page wayfinding most sites never bother with. Assessment B's contrast table confirms the whole palette holds up mechanically.

## Priority Issues

1. **[P1] No walk-time number on the home page.** "Steps from the cruise docks" and "short, flat and paved" are marketing phrases; the decider's go/no-go fact — minutes from the dock — exists in src/data/directions.ts but requires a page hop. Fix: surface one concrete figure ("about a 5-8 minute, flat walk from the Broadway Dock") in the hero lede or cruise panel, sourced from the directions data. Suggested command: clarify.
2. **[P1] Zero food imagery, and no reserved slot for it.** The page sells fried bread entirely through typography and SVG; PhotoSlot exists but is used only on /about/. Against a Broadway restaurant window, words lose. Fix: place a PhotoSlot in BannockIntro or the hero so the layout is ready the day Kelly sends one photo. Suggested command: polish (small scoped layout addition in the committed language).
3. **[P2] Small-screen hero order buries the h1.** Below md, the logo card renders above the headline; on a ~700px-tall phone viewport the value prop and both CTAs start a swipe down — on the primary device. Fix: reorder for small screens (order-* utilities) or shrink the logo below sm. Suggested command: adapt.
4. **[P2] Desktop nav has no current-page indicator.** SiteHeader nav links carry no aria-current and no active style, while the small-screen nav has both (blueberry text + fireweed dot). Accessibility and consistency gap; drives the heuristic-1 score of 2. Fix: mirror the small-screen treatment. Suggested command: polish.
5. **[P2] Hours trust erosion.** Hours print 3x on one page and the "hours are seasonal, check Facebook" hedge appears 2x, once directly beneath the hours table it undermines; the hero pill also omits AM/PM. The page quietly tells visitors its own facts can't be trusted. Fix: state hours once prominently (with AM/PM), keep the footer table, and reduce the hedge to a single calm line. Suggested command: distill + clarify.

## Persona Red Flags

**Jordan (confused first-timer):** "Prices are posted at the counter" leaves budget unanchored, and nothing answers "cash or card?" — a stall point for a cautious tourist (payment facts are not in the brief; a real question for the owner, not copy to invent). The seasonal hedge directly under the hours table makes Jordan distrust the seven rows just read. The Google/Apple map button pair forces a device self-identification micro-decision.

**Casey (distracted phone user):** The hamburger button is labeled "Menu" one tap from the nav item "Menu" (the food menu) — Casey wants food, taps "Menu," gets navigation. First phone viewport is dominated by the logo card; headline and CTAs need a swipe. The hero entrance replays on every return to the page. Otherwise excellent: static export, one preloaded image, self-hosted fonts, 44px targets, no state to lose.

**Riley (stress tester):** With JS disabled the hamburger no-ops and the header offers no navigation (footer links are the only fallback) — acceptable for a static site, worth knowing. The fixed full-viewport grain overlay stacked over the backdrop-blur sticky header is an expensive compositing combination; capture-session rendering hiccups are plausibly tool artifacts, but this stack is the first thing to profile on an old phone. Long content, refresh mid-scroll, and reduced motion all behave.

**The shore-time decider (couple on the dock, 9:40 AM, 4 hours in port):** The hero answers what/where/when in one viewport with the hours pill — the strongest single screen for this persona. But the deciding number (walk minutes) is absent, and the differentiator that wins the coin flip — "the ONLY authentic bannock in Skagway" — sits five sections down; nothing above the fold says only here. "Closed Sat" honestly surfaced in the hero pill prevents a wasted walk.

## Minor Observations

- Hamburger label collision (see Casey): rename the disclosure button ("Browse" or an icon with aria-label) so "Menu" belongs to the food menu alone.
- Header and hero logos share the identical alt string; two same-alt images on one page (B, mechanical). Consider differentiating or marking the hero one decorative.
- The small-screen nav svg omits focusable="false" while every sibling icon includes it (B).
- The testimonial section has no heading of any level — invisible to a screen-reader section scan (B's heading outline).
- FacebookCta's h2 is the only section heading outside the Section eyebrow/stroke system; reads slightly off-system.
- The footer motto can wrap mid-phrase ("Made / to Go"); no text-wrap: balance on that p.
- Dead space: "Where to find us" card stretches ~130px past its content to match the Hours table; the Coffee & Tea highlight card is near-empty next to its siblings (items-start / a description line from data would fix both).
- External map/Facebook links show no "opens in new tab" affordance.
- ButtonLink.tsx:43 and HomeHero.tsx:26 hold the only two raw color literals outside globals.css; both restate existing palette values and could use tokens.
- The awning ribbon's fixed 72px stripes clip arbitrarily at the viewport edge — invisible in practice.

## Questions to Consider

1. If the one fact that converts a dock-side decider is "five flat minutes from your ship," why is the only number on this home page the phone number?
2. This page sells fried bread with zero photographs of food. Would one phone photo of a golden bannock from Kelly outperform every hand-crafted SVG — and shouldn't the layout reserve that slot before the pitch, not after?
3. Hours are printed three times and disclaimed twice on one page. Could a single build-time "Open today 9-4" line carry that trust instead of the double hedge?
