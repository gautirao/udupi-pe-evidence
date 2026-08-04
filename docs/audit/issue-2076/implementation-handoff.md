# Issue #2076 — Implementation Handoff

Synthesis of the audit phase (Stage 1 + Amendment-1 + Amendment-2, findings F1–F17). This document
does not investigate anything new. It triages what `discrepancy-register.md`, `parity-matrix.md`,
`state-mapping.md`, `fixture-environment-manifest.md` and
`.claude/handoffs/issue-2076/workdone-candidate.toml` already established, groups findings by root
cause, and proposes an implementation plan. The audit phase is closed; this is the bridge to
execution.

---

## Executive summary

The shipped Discover "Areas" journey (`journey=area-first`) diverges from the frozen mock and from
the #2014/#1956 contract on two independent axes, and the divergence is larger than a first glance
at F1/F2/F3 (the issue's original three known findings) suggests.

**Functionally**, four real, reproduced defects survive: the map camera never re-fits to city
bounds after leaving a drilled-in state (Home breadcrumb, browser Back — 2 distinct sub-paths, 3/3
non-deterministic trials on one of them); the map's listing-count badge renders a city-wide total
regardless of which area is selected or which intent (Buy/Rent) is active; a Direction-level panel
never surfaces the mock's intermediate "Local Destination" cluster tier, always flattening straight
to a bare area list; and clicking a map cluster-bubble silently drops the panel's heading/count
context and recomputes the match count from viewport bounds instead of node identity. None of these
block a user from eventually reaching correct content, but all four produce visibly wrong state
along the way, and the count-badge defect in particular could be read as showing the wrong number of
available properties.

**Visually**, the canonical Areas journey's right-hand panel is a materially thinner, differently
structured, and mirrored-layout version of the mock. The largest single cause, traced to source, is
that the #1956 canonical-default cutover (`def43294`) forked `journey=area-first` onto a sibling
panel component that never mounts the in-panel journey-choice switcher (Areas/Schools/Agricultural
cards) — a component that is fully built and renders correctly for every other journey. Layered on
top of that: the map/panel shell is mirrored left-right relative to the mock; the city-root heading
reads as a location+count statement instead of the mock's invitational question; section eyebrow
labels, divider rules and per-area taglines are systematically omitted; and the within-area panel's
element order and school-shortcut CTA prominence diverge from the mock. Three smaller items (top-tier
list-vs-grid, heading type scale, card border/elevation) are real but minor.

**Neither exaggerated nor minimized**: this is not a cosmetic-only gap. F9 (missing hierarchy tier)
and the count-badge family are functional defects with a plausible single fix each. F12 (missing
journey switcher) is visually the single largest gap and has a traced, narrow root cause — restoring
it is a scoped fix, not a rebuild. The remaining structural/cosmetic items (F13, F16, F14, F15, F17)
are real but are exactly the kind of drift that should fall out of rebuilding one panel to parity,
not each earn independent work.

**What remains genuinely unknown**, and is called out rather than guessed at: whether rent/lease
pricing renders correctly at all (zero rent inventory found in 7 sampled areas — an environment gap,
not a verified defect); whether the missing Local-Destination tier (F9) is universal across all 5
Directions or specific to the 2 sampled; and whether F11's viewport-derived count bug shares F2/F7's
root cause or is a separate defect that merely looks similar.

---

## Major root causes

### 1. Traced to source: the #1956 canonical-default cutover forked the Areas journey away from the shared panel (F12)

`DiscoverRightPanelContainer.tsx:370-412` branches on `showAreasNavigationJourney = urlState.journey
=== 'area-first'` and, when true, returns `<DiscoverAreasJourneyPanel>` — a sibling component that
never imports or renders `<JourneySwitcher>` at all. Only the `else` branch renders
`<DiscoverRightPanel>`, the sole mount point for `<JourneySwitcher>` (`DiscoverRightPanel.tsx:1724`,
mounted unconditionally). Confirmed both by source read and by a live `document.querySelector`
against the hosted DOM returning `null`. `JourneySwitcher` itself is fully built, unit-tested, and
renders correctly for school-first, agri-first, and journey-less deep-link states — it went missing
specifically because the #1956 cutover (`def43294`, "cut Areas journey over to canonical default")
routed the now-default journey to a component that was never given the switcher, not because the
in-panel switcher was half-built or abandoned.

**Open product question, not resolved by this audit**: are the top-nav Discover/Schools/Agricultural
links an accepted `INTENTIONAL_DIFFERENCE` substitute for the mock's in-panel switcher, or does the
in-panel switcher need restoring for the Areas journey too? This is a ruling the implementation plan
below depends on (see PR2).

### 2. Inferred, not traced to a single line: a count/badge computation that doesn't follow node identity (F2, F7 — CONFIRMED shared root; F11's related defect — HYPOTHESIS ONLY)

F2 and F7 are independently reproduced instances of the same defect: the map-panel's listing-count
badge renders its city-wide branch regardless of which area is selected (F2) or which intent
(Buy/Rent) is active (F7) — the workdone record traces this to the badge's selected-area branch
being "gated on legacy `useAreaGroups` props rather than node identity" (per #2014 §12, which lists
that path as one that must no longer determine Areas identity). This is a confirmed shared root
between F2 and F7.

**F11's defect is a different symptom that resembles this family but its root cause was never
traced**: clicking a map cluster-bubble drops the panel's heading/listing-count subtitle and
recomputes the "N areas with matches" count from the current viewport bounds instead of the node's
own fixed count. This LOOKS like the same class of bug (a count that isn't sourced from node
identity), but the register is explicit that only the symptom was recorded, not the cause — no code
read established whether it shares F2/F7's `useAreaGroups`-gating mechanism or is a separate bug in
the cluster-click handler. **Grouping F2/F7/F11 as "one root cause, one fix" is a hypothesis, not an
established fact.** Tracing F11's actual cause is a prerequisite for treating it as folded into the
same fix as F2/F7 — if it turns out to be unrelated, fixing F2/F7 will leave F11 as untouched latent
debt.

### 3. Not traced to a single mechanism: shipped Areas panel is structurally thinner than the mock across multiple axes (F8, F10, F13, F14, F15, F16, F17)

No single line of code was identified as the cause of the heading-text divergence (F8), the
mirrored shell layout (F10), the missing eyebrows/dividers/taglines (F13), the list-vs-grid tier
difference (F14), the heading type-scale difference (F15), the element-order/CTA-prominence
divergence (F16), or the card border/elevation difference (F17). All seven were confirmed by visual
and DOM comparison, not by source tracing. They co-occur in the same journey (`area-first`) and the
same panel surface family as F12, which makes it plausible they are symptoms of
`DiscoverAreasJourneyPanel` being a leaner, not-yet-brought-to-parity implementation relative to
`DiscoverRightPanel` and the mock — but this is an inference for planning purposes, not a traced
fact, and is presented as such below.

### 4. Not traced to a single mechanism: camera does not re-fit to city bounds when the node context is lost (F1 Arm 1, F1 Arm 2, F3 Scenario A, F3 Scenario B)

All four reproduce the same class of failure — URL/`node=` param correctly clears or updates, but
the rendered Leaflet camera does not re-fit to the expected bounds. No single function was identified
as the cause; the failure modes differ across trials (a stale area-level zoom in some cases, a
different zoomed-out/off-center camera in others), which suggests either a race condition or more
than one code path failing the same contract, not necessarily one line. F1 Arm 3 (journey switching
via a hardcoded top-nav href) is REFUTED — it never exercises this code path at all (no stale
lat/lon/zoom is carried forward), so its correctness says nothing about arms 1–2.

### 5. Not traced to a single mechanism: the shipped hierarchy never surfaces an intermediate "Local Destination" cluster tier (F9)

The panel goes straight from Direction to individual AREA cards in both of the 2 sampled Directions
(West, North), even where the map itself shows a cluster bubble ("Yelahanka +55 areas within").
Clicking the bubble only re-zooms the camera; it never changes `node=` or the panel content. This
reads as an architectural gap (the panel-side hierarchy structurally never surfaces this tier) rather
than a rendering bug in one component, but only 2 of 5 Directions were sampled — the caveat is load
bearing, not decorative.

---

## All confirmed findings (F1 onward)

| # | Finding | Classification | Notes |
|---|---|---|---|
| F1 Arm 1 | Camera doesn't re-fit on Home breadcrumb | CONFIRMED product defect | Camera/history root cause 4 |
| F1 Arm 2 | Camera doesn't re-fit on browser Back to root (3/3 trials, non-deterministic wrong state) | CONFIRMED product defect | Camera/history root cause 4 |
| F1 Arm 3 | Journey switch (top-nav hardcoded href) camera correct | REFUTED | Weak refutation — different code path than Arms 1–2, not evidence they're fine |
| F2 | City-wide count badge during area-detail state | CONFIRMED product defect | Root cause 2 |
| F3 Scenario A | Guided-selection Back settles wrong (non-deterministic) | CONFIRMED product defect | Same mechanism as F1 Arm 2 |
| F3 Scenario B | Searched-selection Back settles wrong (consistent stale-zoom) | CONFIRMED product defect | Different history depth AND different settled-state shape than Scenario A — genuinely divergent mechanism |
| F4 | Rent/lease monthly pricing unobservable | ENVIRONMENT LIMITATION | #2074 merged; 7 areas across 3/5 regions sampled, zero rent inventory found; render never verified either way |
| F5(a) | "capture-* specs are assertion-free" | REFUTED | 136 `expect()` calls across the 4 files |
| F5(b) | No visual-regression harness exists | ENVIRONMENT LIMITATION (test-infra gap, not a product defect) | 0 `toHaveScreenshot`, 0 committed baselines — Stage-2/QA-harness concern, out of scope for a product PR |
| F6 | Local fixture is Udupi-only, not Bangalore-only as the issue stated | ENVIRONMENT LIMITATION (test-infra gap, polarity corrected) | Blocks Bangalore-authored specs from running locally until a Bangalore fixture seed exists |
| F7 | Region/area count badges unfiltered by Buy/Rent intent | CONFIRMED product defect | Root cause 2, same family as F2 |
| F8 | City-root heading text diverges from mock ("Bangalore / 1737 listings" vs. "Where do you want to explore?") | CONFIRMED product defect | Both viewports; root cause 3 |
| F9 | Direction-level panel never renders Local-Destination cluster list | CONFIRMED product defect | Root cause 5; only 2/5 Directions sampled (West, North) — caveat travels with the finding |
| F10 | Shell mirrored: mock map-LEFT/panel-RIGHT vs. shipped panel-LEFT/map-RIGHT | CONFIRMED product defect | Desktop-only (mobile is stacked in both, not applicable); 6/6 sampled desktop states show the inversion, no exception |
| F11 (region-card claim) | "Panel doesn't update after region-card click" | REFUTED | Panel updates correctly in 2/2 independent reproductions |
| F11 (map-cluster-click defect) | Cluster-bubble click drops panel heading/count context, count recomputes from viewport bounds | CONFIRMED product defect | Root cause 2 — HYPOTHESIZED shared root with F2/F7, UNTRACED; reproduced 2/2 (East, South) |
| F12 | In-panel journey-switcher absent for `journey=area-first` at every sampled state | CONFIRMED product defect | Root cause 1 — the largest single traced item |
| F13 | Section eyebrows/dividers/taglines systematically omitted | CONFIRMED product defect | Root cause 3; pattern across 3 states (A01, A02/A04, A08/A12) — distinct from F8 (text) and F16 (order/prominence) |
| F14 | Direction-tier: row-list (mock) vs. card-grid (shipped) | CONFIRMED product defect — MINOR_POLISH | Root cause 3; area-tier already matches on both sides |
| F15 | Shipped heading typography larger/heavier than mock's | CONFIRMED product defect — MINOR_POLISH | Root cause 3; visual-inspection judgement, not measured |
| F16 | Within-area element order + school-CTA prominence diverge | CONFIRMED product defect | Root cause 3; pattern across 2 states (Kambipura, Whitefield-filters) — distinct axis from F13 (presence/absence) |
| F17 | Card border/elevation: visible 1px border + hover fill (shipped) vs. borderless/shadow (mock) | CONFIRMED product defect — MINOR_POLISH | Root cause 3 |

Totals: **16 CONFIRMED product defects** (F1 Arm1/Arm2, F2, F3A/F3B, F7, F8, F9, F10, F11-cluster,
F12, F13, F14, F15, F16, F17) · **3 ENVIRONMENT LIMITATIONS** (F4, F5b, F6) · **3 REFUTED** (F1
Arm3, F5a, F11-region-card) · **0 INTENTIONALLY DEFERRED** (no finding was ruled deferred during the
audit; F12's top-nav-substitute question is OPEN, not deferred — see root cause 1). No merges beyond
what the register had already established: F13/F16 were previously checked for exactly this and
confirmed as genuinely distinct axes (presence/absence vs. ordering/prominence) — not re-merged here.

---

## Which findings disappear from a single fix

This is grouped by the root causes above, ordered by the user's mandated priority (functional over
cosmetic).

**Fix the camera re-fit contract** (root cause 4) → **F1 Arm 1, F1 Arm 2, F3 Scenario A, F3 Scenario
B** all resolve. F1 Arm 3 needs no fix (already REFUTED/correct on its own path).

**Fix the count-badge's identity source** (root cause 2, confirmed half) → **F2, F7** resolve
together — same traced root. **F11's cluster-click defect** is plausibly resolved by the same fix,
but this is explicitly a hypothesis: if F11 traces to a different mechanism (e.g. the cluster-click
handler itself, not the badge's data source), it will need its own follow-up after the F2/F7 fix
ships and F11 is re-verified against it.

**Restore the journey-switcher for `journey=area-first`** (root cause 1) → **F12** resolves directly.
Depends on the open product ruling (root cause 1) — if the top-nav substitute is ruled acceptable,
this becomes a documentation-only resolution instead of a code change.

**Build out `DiscoverAreasJourneyPanel` toward parity with the mock/`DiscoverRightPanel`** (root
cause 3, inferred) → **F8, F10, F13, F16** are all addressable within one focused rebuild of that
panel's shell and content structure. **F14, F15, F17** may or may not fall out of the same rebuild
incidentally — they are not guaranteed resolutions, only plausible byproducts, and are called out as
a stated leftover below if they don't.

**Build the Local-Destination cluster tier** (root cause 5) → **F9** resolves, but this is
architecturally the heaviest single item (a new panel-level UI state, not a bug fix) and depends on
confirming the remaining 3 Directions before committing to a specific implementation shape.

---

## Remaining environment limitations

- **F4** — rent/lease pricing render is unverified. #2074 merged, but 7 sampled areas across 3/5
  macro-regions show zero rent inventory. Needs either a hosted area with real rent inventory or a
  Stage-2 fixture seed before this can move to a real verdict either way.
- **F5(b)** — no visual-regression harness exists in the repo (0 `toHaveScreenshot`, 0 committed
  baselines). This is a QA-infrastructure gap, not something either implementation PR below should
  attempt to close; it is Stage-2/harness work already tracked separately in the parity-matrix and
  fixture-environment-manifest deliverables.
- **F6** — the local fixture seeds Udupi only, not Bangalore. Any Bangalore-authored spec (including
  future regression tests for the fixes below) cannot run against `local-fixture-backend.sh`
  as-is; it needs either a Bangalore-shaped fixture seed or to run against the hosted/differently-
  seeded environment. This affects how the PRs below get tested (see acceptance criteria).
- **F9's sampling gap** — only West and North Directions were checked; South, Central and East were
  not. The fix's shape should be verified against at least one more Direction before being called
  complete.
- **F11's untraced root cause** — flagged again here because it is the single most likely place a
  reader could quietly upgrade a hypothesis to a fact; see root cause 2.
- **A14 (Browse All)** — reachability was never confirmed either way; not attempted in either PR
  below.
- **Mobile viewport** — F10, F12–F17 were explicitly scoped to desktop only, per the user's own
  report that excluded mobile. Neither PR below claims mobile parity for these items.

---

## Recommended implementation order

1. **PR1 (functional) before PR2 (structural).** Per the user's mandated priority — hierarchy
   navigation, map↔panel sync, cluster behaviour, count correctness before visual/cosmetic work —
   and because PR1's fixes (camera re-fit, count-badge identity source, cluster tier) are the ones
   most likely to be silently masked or complicated by a simultaneous panel rebuild. Landing PR1
   first also gives PR2 a panel whose underlying data (counts, node identity) is already trustworthy,
   so PR2's structural rebuild doesn't have to route around known-bad counts.
2. **F11 re-verification happens between the two PRs**, not inside either: after PR1's count-badge
   fix ships, re-run F11's repro. If it resolves, the hypothesis is confirmed after the fact and no
   further work is needed. If it doesn't, it becomes a scoped follow-up (not a blocker for PR2,
   since PR2 doesn't touch the cluster-click handler).
3. **The F12 product ruling should be resolved before PR2 starts**, since it determines whether
   PR2's largest line item is a real restoration (build the switcher into
   `DiscoverAreasJourneyPanel`) or a smaller confirmation-and-documentation task (top-nav substitute
   ruled acceptable). Both are pluggable into the same PR without changing its shape or ordering.
4. **F9 (cluster tier) is the highest-complexity single item in PR1** and carries a sampling caveat;
   if the timeline needs to slip an item out of PR1 to protect the "prefer 2 PRs" constraint, F9 is
   the one to reduce in scope first (e.g. land the camera and count-badge fixes, and file F9 as an
   immediate fast-follow) — but it is not proposed as a separate PR here per the instruction that
   cosmetic-only concerns are the ones that should not get their own PR; F9 is functional and stays
   in PR1 unless a scoping decision says otherwise.

---

## Implementation plan: 2 PRs

### PR1 — Navigation, map/panel sync, and count correctness (functional)

- **Purpose**: restore the camera-reset contract, the count-badge's node-identity source, and the
  missing Local-Destination hierarchy tier — the four functional defects a user would notice as
  "the map/numbers are wrong," ranked first per the mandated priority.
- **User impact**: after using the Home breadcrumb or browser Back, the map correctly shows
  full-city bounds instead of a stale or wrong-zoomed view; the listing-count badge shown while
  viewing an area or a rent-filtered list matches what's actually being shown, not the city-wide
  total; a Direction with a geographic cluster (e.g. Yelahanka) becomes navigable as its own tier
  instead of flattening straight to a flat area list.
- **Root causes addressed**: root cause 4 (camera re-fit), root cause 2 confirmed half (count-badge
  identity source), root cause 5 (missing cluster tier).
- **Findings covered**: F1 Arm 1, F1 Arm 2, F3 Scenario A, F3 Scenario B, F2, F7, F9. F11's
  cluster-click defect is a candidate for incidental resolution by the F2/F7 fix but is NOT counted
  as covered until re-verified post-fix (see recommended order, item 2).
- **Estimated complexity**: MEDIUM-HIGH. The camera and badge fixes are each likely single-mechanism
  bug fixes once traced; F9 is the outlier — it requires either exposing an existing cluster-tier
  data shape in the panel (if the backend/hierarchy already models it and only the panel omits it)
  or a genuinely new panel-level UI state, which is more work than the other three items combined.
- **Position in order**: first.
- **Risks**: (a) F1's non-deterministic settled states across trials suggest more than one failure
  mode may be hiding behind "camera doesn't re-fit" — a fix that only addresses one mode could leave
  the other unfixed and look done when it isn't; regression-test all of F1 Arm 1/Arm 2 and both F3
  scenarios, not just one. (b) F9's fix shape is unconfirmed for 3 of 5 Directions; a fix built only
  against West/North's specific data shape could fail to generalize. (c) The count-badge fix touches
  a legacy `useAreaGroups`-based code path per the register's own citation — confirm nothing else
  still depends on that path before removing it wholesale.
- **Acceptance criteria**: camera bbox after Home-breadcrumb, guided-Back, and searched-Back all
  match the city-root baseline bbox, tested across repeated trials (not once, given F1 Arm 2's
  non-determinism); the map badge and panel-header count agree with each other and with the actual
  scope (area, intent) at every state exercised by A08/A11/A12/A16/A17 in the parity matrix; at
  least one additional Direction beyond West/North (ideally all 5) is confirmed to either already
  have a working cluster tier or to correctly render one after the fix. Given F6, functional/DOM
  assertions for this PR should run against the hosted Bangalore environment or a Bangalore-shaped
  Stage-2 fixture, not the existing Udupi-only local fixture.

### PR2 — Areas journey panel structural and shell parity (visual/structural)

- **Purpose**: bring the `journey=area-first` right-hand panel back into structural alignment with
  the frozen mock — restore the journey switcher, correct the mirrored shell layout, and rebuild the
  panel's content structure (eyebrows, dividers, taglines, element order, CTA prominence) that the
  audit found systematically stripped out.
- **User impact**: the Areas journey panel again offers the in-panel Areas/Schools/Agricultural
  switcher (pending the product ruling below); the map and panel sit on the sides the mock intends
  (map-left, panel-right); the city-root heading reads as an invitation rather than a stat line;
  section structure (eyebrows, dividers, per-area taglines) returns; the school-shortcut CTA regains
  its mock prominence and the search-before-filters ordering is restored.
- **Root causes addressed**: root cause 1 (traced — `DiscoverRightPanelContainer.tsx:370-412`
  routing fork), root cause 3 (inferred — `DiscoverAreasJourneyPanel` structural thinness).
- **Findings covered**: F12, F8, F10, F13, F16. F14, F15, F17 (all MINOR_POLISH) are NOT separately
  scoped work — they may resolve incidentally as a byproduct of rebuilding the panel's shell and
  card composition, but this is not guaranteed. **If F14/F15/F17 do not resolve as a byproduct, they
  are the stated leftover of this plan** — deliberately not given a third PR, per the instruction
  that cosmetic drift should fall out of a larger structural fix or be left explicitly unaddressed
  rather than padded into its own PR.
- **Estimated complexity**: MEDIUM-HIGH. F12 alone is a scoped, traced fix (wire `JourneySwitcher`
  into `DiscoverAreasJourneyPanel`, or route `area-first` through `DiscoverRightPanel` with
  area-first support added). F10 is a layout/CSS swap. F8 is a copy/text change. F13/F16 are the
  larger effort within this PR — they require rebuilding section structure and reordering existing
  elements across multiple panel states (A01, A02/A04, A08/A12), not just one screen.
- **Position in order**: second, after PR1, and gated on the F12 product ruling.
- **Risks**: (a) the F12 open product question — if the ruling comes back "top-nav is an accepted
  substitute," this PR's largest line item shrinks substantially and the plan should be revisited
  before work starts, not discovered mid-PR; (b) rebuilding `DiscoverAreasJourneyPanel`'s structure
  risks introducing new snapshot/DOM-testid drift for the still-unwritten Stage-2 `e2e-parity/*`
  specs that will anchor against this panel's structure — coordinate with whoever authors those
  specs so the anchors are chosen against the POST-fix DOM, not the pre-fix one; (c) F9's Direction
  cluster tier (PR1) and this PR both touch the same panel family — sequencing PR1 first (per the
  recommended order) avoids merge conflicts and avoids building F13/F16's structure against
  soon-to-change F9 content.
- **Acceptance criteria**: `document.querySelector('[data-testid="journey-switcher-section"]')`
  returns a non-null element at `journey=area-first` states (mirroring F12's own live-DOM proof
  method, not a screenshot-only check) — unless the product ruling says otherwise, in which case the
  acceptance criterion changes to "top-nav links documented as the ruled intentional substitute";
  the six previously-sampled desktop Areas states (city root, 2 Direction-level, 1 area-detail, plus
  the 2 fresh region states) all show map-LEFT/panel-RIGHT; A01's heading text matches the mock's
  invitational form; A01/A02-A04/A08-A12's eyebrow/divider/tagline structure is present; A08/A12's
  school-CTA and search-input ordering matches the mock's. Desktop-only scope, per F10/F12–F17's own
  scoping — no mobile claim is made or required by this PR.
- **Closeout step for F14/F15/F17 (non-blocking — added 2026-08-04 per code review).** These three
  MINOR_POLISH findings are an *expected byproduct* of PR2's panel rebuild, not scoped work, and they
  are deliberately NOT blocking acceptance criteria — letting a cosmetic detail hold up a structural
  PR would invert the user's stated functional-before-cosmetic priority. But "expected byproduct" is
  not a guarantee, and without a forcing function these three would have no owner once PR2 merges.
  So: **post-merge, re-check F14, F15 and F17 against the shipped panel. If any remain unresolved,
  file each as a named follow-up issue referencing this handoff — do not let them lapse silently.**
  This closes the gap between the plan's prose, which already anticipated they might not resolve, and
  its acceptance criteria, which an implementer actually checks against and which previously did not
  mention them at all.

**Why not a third PR**: the cosmetic items (F14, F15, F17) are the only findings that could plausibly
justify a third PR, and the instructions are explicit that cosmetic drift should not get its own PR
— it should fall out of the larger structural fix (PR2) or be left as a stated leftover. There is no
third distinct root cause or user-facing workflow left uncovered by PR1+PR2; everything else is
either an environment limitation (F4, F5b, F6 — out of scope for any product PR) or already refuted
(F1 Arm 3, F5a, F11-region-card).

---

## Judgement calls the orchestrator should check

1. Folding F9 (Local-Destination cluster tier) into PR1 rather than giving it separate handling —
   it is the single heaviest item in that PR and is functionally distinct in kind (new UI state, not
   a bug fix) from the camera/badge fixes it's grouped with. If the orchestrator wants a stricter
   "identical kind of fix" grouping, F9 could instead be pulled into its own fast-follow after PR1,
   at the cost of exceeding the "prefer 2" guidance in spirit if it's tracked as a third PR.
2. Treating F11's cluster-click defect as PROVISIONALLY covered by PR1's count-badge fix rather than
   giving it independent PR scope. This follows the explicit instruction to keep the F2/F7/F11
   hypothesis hedged, but it does mean PR1's acceptance criteria should include an explicit F11
   re-verification step rather than silently assuming success.
3. Grouping F8/F10/F13/F16 under an INFERRED (not traced) root cause of "`DiscoverAreasJourneyPanel`
   is structurally thinner than the mock." This is a reasonable planning inference for bundling one
   PR's scope, but it is not the same evidentiary strength as F12's traced root cause — if the
   orchestrator wants only traced-root-cause groupings, F8/F10/F13/F16 should be described as "four
   independent findings that happen to be fixable in one PR because they share a component," not as
   sharing a mechanism.
4. Leaving F14/F15/F17 unscoped rather than assigning them explicit acceptance criteria in PR2 — this
   follows the "cosmetic must not get its own PR" instruction literally, but means PR2 could ship
   without resolving them and still meet its stated acceptance criteria.
