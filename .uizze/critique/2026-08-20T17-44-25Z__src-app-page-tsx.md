---
target: home page
total_score: 27
max_score: 32
na_heuristics: 9,10
p0_count: 0
p1_count: 1
timestamp: 2026-08-20T17-44-25Z
slug: src-app-page-tsx
---
Method: dual-agent (A: isolated design-review agent with rendered inspection · B: isolated detector-evidence agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Current-page nav state now present and verified on /menu/; the hours pill leads with "Open," which a Saturday reader can misparse as live status |
| 2 | Match System / Real World | 4 | Solid — dock names, minutes on foot, counter-service language |
| 3 | User Control and Freedom | 3 | No traps; Escape-close + focus return on the disclosure nav; external links force new tabs |
| 4 | Consistency and Standards | 4 | Solid — one button system, one chip style, one card idiom; facts flow from src/data/ so surfaces cannot disagree |
| 5 | Error Prevention | 3 | tel: link, prebuilt map deep links, walking-time caveat |
| 6 | Recognition Rather Than Recall | 4 | Solid — facts restated at each decision point; home card accents match the menu page's |
| 7 | Flexibility and Efficiency | 3 | Skip link, footer shortcuts, platform map deep links |
| 8 | Aesthetic and Minimalist Design | 3 | Bannock re-sold three consecutive times; "one block west of Broadway" appears 3x on one page |
| 9 | Error Recovery | n/a | Static persuade page with no forms or failable operations |
| 10 | Help and Documentation | n/a | Persuade surface; FAQ correctly lives on /directions/ |
| **Total** | | **27/32** | **Good (84%), up from 25/32** |

## Design Specificity Verdict

**LLM assessment:** Authored, not templated. The hero is literally a Skagway scene, the palette is named after local flora, and the copy is saturated with unfakeable specifics — "5-8 minutes on foot from the Broadway Dock," Kaladi Brothers, Kelly's Grammy, rhubarb jam, a verbatim recommendation. You could not swap in another cafe's name without rewriting nearly every sentence and redrawing the decor. The one faint genericism remains the three icon-badge feature cards in BannockIntro.

**Deterministic scan:** The bundled detector payload is still absent (exact error recorded; both candidate paths confirmed empty), so the deterministic half ran as contrast math + hygiene checks. This round came back spotless: zero contrast failures at applicable thresholds across 25 real pairs (including the new current-page nav link bounded against every surface the sticky header can scroll over); zero raw color literals in the audited surface (the two repo-wide hits are framework metadata that cannot take CSS variables); all decorative SVGs carry both aria-hidden and focusable="false"; aria-current wired in both navs; clean heading outline — one h1, no skips, no headingless sections; every interactive element carries an explicit 44px class. Where the assessments meet: everything mechanical is now green, and the remaining findings are compositional and copy judgments a detector cannot see. One gap between them: A estimates the hero motto (wood, 16px bold) at ~4.2:1 over the strongest part of the sky wash — a composite pair B's static table did not cover; at 16px bold the 4.5:1 threshold applies, so this is a genuine borderline finding (P3 below).

**Visual overlays:** none available (missing detector payload); rendered evidence came from A's six-viewport pass plus a /menu/ nav-state check.

## Overall Impression

27/32 with nothing mechanically wrong is a page ready to pitch. The first viewport is now built for exactly the person it serves — what, where, minutes from the dock, hours, ranked CTAs — and the craft depth (phrase-wrapped motto, sr-only testimonial heading, tabular-nums hours, target-flash timed past the smooth scroll) reads as care. What remains is one strategic composition question: the single strongest conversion line in the site's possession — "the ONLY authentic bannock available in Skagway" — still sits five sections down, below two screens of logistics the reader has already been given once.

## What's Working

1. **First-viewport completeness for the shore-time persona** — what/where/how-far/hours plus a correctly ranked CTA pair, all fed from single-source data so the hero can never contradict the footer or the JSON-LD.
2. **A decor system with meaning, executed with restraint** — the ridge that becomes the footer's skyline, the awning ribbon, the blooming sprig; all CSS/inline-SVG, all hidden from assistive tech, all collapsing correctly under reduced motion.
3. **Craft depth in the details** — scroll-padding under the sticky header, Escape-close with focus return, the motto's phrase-level wrapping, and a fully green mechanical audit underneath it.

## Priority Issues

1. **[P1] The differentiator is buried.** "This is the ONLY authentic bannock available in Skagway" sits in section 5 of 7, ~5 viewports down. The dock decider comparing this against a visible Broadway restaurant may never reach the one claim no competitor can match. Fix: move HomeTestimonial above VisitUs (persuade before logistics), or surface one line of the quote near the hero. -> layout
2. **[P2] The hours pill leads with "Open."** "Open Sun-Fri 9 AM-4 PM · Closed Sat" can be skimmed as live status by a Saturday reader — the highest-stakes misread this audience can make. Fix: reword HOURS_SHORT to "Sun-Fri 9 AM-4 PM · Closed Saturdays." -> clarify
3. **[P2] VisitUs redundancy and imbalance.** "One block west of Broadway" appears 3x on the page, twice inside this section; at md+ the content-hugging Hours card leaves a visible hole beside the taller address card. Fix: let the address card own geography and the cruise panel own reassurance; rebalance the card pair. -> distill / layout
4. **[P3] Motto contrast over the sky wash.** Wood at 16px bold computes ~4.2:1 over the strongest part of the sky/70 gradient — below the applicable 4.5:1. Fix: darken the motto to bark, or keep the sky gradient from peaking under the motto line. -> polish
5. **[P3] Cruise-panel icon alignment.** sm:items-center floats the ship icon mid-height, detached from its heading; sm:items-start anchors it. -> polish

## Persona Red Flags

**Jordan (first-timer):** "What is bannock?" pre-answers her real question. Flags: grab-and-go service is never stated on the home page ("Made to Go" in the motto is the only hint), so she may expect table service; "Directions from the Docks" excludes ferry/car arrivals the page actually covers; "Pages" as the disclosure label is unusual, rescued by the hamburger icon.

**Casey (one thumb, slow connection):** genuinely fast (static export, self-hosted fonts, one small client component); all targets >=44px; tel: is thumb-ready. Flags: the Google/Apple Maps pair forces a platform micro-decision; the logo badge card costs a scroll between hero text and section two on phones; the Facebook CTA yanks to a new tab mid-flow.

**Riley (stress tester):** refresh harmless; anchors land clear of the sticky header; reduced-motion comprehensive. Flag: with JS disabled on small screens the disclosure button is inert and the footer link column is the only navigation — a details-based disclosure would have been JS-free.

**Shore-time decider (dock, 9:40 AM):** the first viewport is built for exactly this person and works. Flags: the only-bannock-in-town claim is 5 screens down (P1); the "Open ..." pill invites the Saturday misread (P2); "budget 20-30 minutes round trip" — this persona's exact arithmetic — lives only on /directions/ and is worth echoing in the cruise panel.

## Minor Observations

- The home Facebook button says "Follow us on Facebook" while its body promises "see what Kelly is making today"; the menu page's "See today's special on Facebook" matches intent better — consider aligning.
- Three consecutive bannock-led sections repeat "fried to order / family recipe / rhubarb jam" — emphasis bought at minimalism's expense.
- Card-grid stretch leaves dead space at the bottom of the House-Baked Goods and Coffee & Tea highlight cards.
- HOURS_SHORT/HOURS_SUMMARY remain hand-written next to OPENING_HOURS; derivation would remove the sync risk verify currently backstops.
- Candidate tokens: rounded-[2rem] x2, tracking-[0.18em] x2, the three press-shadow arbitrary values (B, mechanical).
- When photos arrive, home has exactly one 4:3 PhotoSlot; the hero itself is not designed to receive a bannock photo — the logo owns that spot permanently.

## Questions to Consider

1. If the couple on the dock reads only the first viewport, why must they scroll five sections to find the one fact no Broadway competitor can match?
2. Could BannockIntro and the featured highlight card merge — selling bannock once, well — buying back a full scroll for the testimonial and Kelly?
3. When Kelly's first real bannock photo arrives, should it land in the one 4:3 slot in section two, or should the hero be designed to receive it?
