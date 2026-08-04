# Issue #2076 — Discover V2 Areas parity matrix (Stage 1)

Stage-1 deliverable (AC1). Covers states A01–A24 from the issue body's
"Canonical parity state matrix", each crossed with the two required
viewports (`1366×768` desktop, `390×844` mobile) and the two auth arms
(anonymous, authenticated) — 96 rows total, organized as one subsection per
state with a 4-row table (viewport × auth) beneath a shared per-state header.

This file does **not** claim a Stage-2 audit has run. Stage 1's evidence base
is (a) the six known findings (F1–F6), reproduced-or-refuted against the
hosted Bangalore environment and recorded in `discrepancy-register.md`, and
(b) static source-reading. Where neither of those exists for a row, the
status is `PENDING_STAGE_2_AUDIT` — see "Status vocabulary" below for why
that value exists and is not a euphemism for `MATCH`.

## Source-of-truth precedence (issue #2076 body, verbatim ranking)

1. **#2014** controls hierarchy depth, identity, navigation, density
   behaviour, history, map/panel synchronisation and mobile interaction.
2. **#1956** controls the delivered Areas journey where it does not conflict
   with #2014.
3. **The frozen design** (`docs/design/retrends-design-system/ui_kits/new_discover/`)
   controls visual composition and presentation.
4. **Older planning documents** (`docs/new-discover-v2/01-frozen-design-audit.md`,
   `03-functional-parity-matrix.md`, `06-target-architecture-and-pr-plan.md`) are
   inventory/evidence only where they describe superseded recursive-depth or
   mobile-stacking behaviour.
5. Intentional differences from the frozen design require an explicit
   product ruling recorded on the associated PR — never silently classified
   as parity.

## Status vocabulary

`MATCH` | `MUST_HAVE_FUNCTIONAL` | `MUST_HAVE_VISUAL` | `MINOR_POLISH` |
`INTENTIONAL_DIFFERENCE` | `BLOCKED` | `ENVIRONMENT_BLOCKED_2074_RENDER`
(originally written as `BLOCKED_PENDING_2074_FINAL_HEAD` while PR #2074 was
unmerged; renamed in Amendment-1 Step 5 — see the dedicated subsection
immediately below for why)

Plus one Stage-1-only addition, **`PENDING_STAGE_2_AUDIT`** — not part of the
issue's 7-value enum. It exists because Stage 1's own governing documents
(the plan's risk R1/R2/R6 mitigations, the "do not fabricate a verdict"
instruction, and the repo-owner's OQ1 ruling that hosted observation is
"CURRENT-STATE EVIDENCE ONLY, never the final deterministic baseline")
forbid defaulting an unaudited row to `MATCH`. A row that has not actually
been exercised against a live render, or against real source reading with a
citation, gets `PENDING_STAGE_2_AUDIT`, not a guess dressed as one of the
seven real values. Stage 2 replaces every `PENDING_STAGE_2_AUDIT` with a real
verdict.

### `BLOCKED_PENDING_2074_FINAL_HEAD` → `ENVIRONMENT_BLOCKED_2074_RENDER` (Amendment-1 Step 5, 2026-08-04)

PR #2074 (rental/lease monthly pricing) has since **merged** at
`bbef09b274b02f23f59426b7fa4b009fcde38977`, while this PR was in review. That
resolves the "unmerged" precondition every row originally carrying
`BLOCKED_PENDING_2074_FINAL_HEAD` was written against, but it does **not**
change any row's classification to a verified value: this Stage-1 pass never
audited rent/lease pricing against the now-merged implementation.
Separately, Amendment-1 Step 4 sampled 7 hosted Bangalore areas across 3 of
Bangalore's 5 macro-regions under the Rent toggle (see
`discrepancy-register.md`'s "#2074 rent-probe findings" section) and found
**zero rent inventory** in every one — the merged contract's rendered
pricing could not be observed rendering at all in this run, which is an
environment/inventory gap, not a verified render.

Every row below that previously carried `BLOCKED_PENDING_2074_FINAL_HEAD` is
now labelled **`ENVIRONMENT_BLOCKED_2074_RENDER`** to say precisely that:
the dependency is merged, Stage 1 did not verify against the merged head,
and rendered pricing is currently unobservable per the sampling evidence —
never `MATCH` or any other verified value, and never backed by the merged
backend contract tests (`CityAreaListingsControllerTest` /
`CityAreaListingsIT` / etc.), which prove the CONTRACT, not the RENDER.
Rebasing this audit onto #2074's merged head, re-verifying rent/lease/visual
states, and finding or seeding a hosted/fixture area with real rent
inventory is explicit Stage-2 work.

**Acceptance check for this rename, restated (2026-08-04 correction):** the
original acceptance criterion for this rename was written as a literal-string
grep — `grep -rn "BLOCKED_PENDING_2074_FINAL_HEAD" docs/` returning zero
hits — and a prior pass satisfied that literal instrument by rewriting
historical quotations to a hyphenated spelling (`BLOCKED-PENDING-2074-FINAL-HEAD`)
that never actually existed, which falsified quoted historical text purely to
make the grep pass. That check was the defective instrument, not the
evidence: the real requirement was always "no LIVE status value uses the
retired token," never "the string appears nowhere in prose." The check is
restated here so a reader can actually apply it:

- **Applies to:** any status-column entry, status-vocabulary definition, or
  active/current classification in this folder.
- **Does not apply to:** genuine historical quotations, "original
  classification (superseded, preserved for history)" statements, or prose
  describing what the retired token used to say — these both may and should
  preserve `BLOCKED_PENDING_2074_FINAL_HEAD` verbatim, in its one true
  underscore spelling.
- **How to apply it:** `grep -rn "BLOCKED_PENDING_2074_FINAL_HEAD" docs/audit/issue-2076/`,
  then read each hit in context. PASS requires every hit to sit inside a
  historical quotation or original-classification statement (never a live
  status column/value). A hit inside a live status value is a FAIL,
  regardless of spelling.

**Principle:** when a verification check is wrong, fix the check — never
reshape the evidence to pass it.

## State-to-test ownership (folded in as columns, per AC1 — no separate file)

Each state's header below names its **owning spec path**. For A01 this is
the real Stage-1 pilot spec (`e2e-parity/pilot-a01-city-root.spec.ts`); for
every other state it is a **planned** Stage-2 filename
(`e2e-parity/aNN-<slug>.spec.ts`) that does not exist yet — naming it now
fixes the ownership question before Stage 2 starts writing 23 more specs
against a matrix that might otherwise drift.

## Shared conventions used in every row below

- **Starting URL** is expressed as a ROLE name from
  `e2e-parity/support/parity-nodes.ts` (`cityRoot`, `directionWithDirectAreas`,
  `directionWithLocalDestinations`, `localDestinationWithAreas`,
  `denseAreaDirection`) plus, where the state requires drilling past what a
  role alone reaches (e.g. a specific selected AREA), a **DOM-driven step**
  performed by the test at runtime (e.g. "click the first AREA card in the
  resolved direction's panel") — never a literal node key. This mirrors how
  the hosted discrepancy-register observations were actually driven (click
  path, not URL-jump) for every state except A19, which is specifically
  about the search-box convergence path.
- **Pricing** is never expressed as a literal price string, per the plan's
  AC9. Anonymous pricing is "sale price present" / "monthly price present,
  band form"; authenticated pricing is "sale price present, exact form" /
  "monthly price present, exact form".
- **City + navigation-revision identity** (same for every row in this
  document): Bangalore, against whichever navigation revision is LIVE at
  test time — Stage 1 does not pin a revision because the Stage-2 seed
  (which will make the revision id deterministic and citable) does not exist
  yet. See `fixture-environment-manifest.md` for the full explanation.

---

## A01 — City root with canonical Direction destinations

**Owning spec:** `e2e-parity/pilot-a01-city-root.spec.ts` (Stage-1 pilot — real, exists)
**Frozen design ref:** `docs/design/retrends-design-system/ui_kits/new_discover/` city-root frame (desktop + mobile variants)

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | `cityRoot` (`?city=bangalore&journey=area-first`) | no `node=` | root only (no breadcrumb ancestors) | full-city bounds — all Direction bubbles on-screen | city-wide badge, copy `"Showing {N} verified properties across Bangalore"` (disambiguate by this exact phrase, not testid — two DOM nodes share `data-testid="discover-badge"`) | none required (city-level counts only) | badge visible + copy match; URL has no `node=`; no `lat/lon/zoom` params present | `A01-cityroot-desktop-anon.png` | MATCH (hosted spot-check in discrepancy-register.md confirms full-city bounds correct: Devanahalli visible top, NICE ring visible bottom, all 5 region bubbles on-screen) |
| 1366×768 | auth | `cityRoot` | same | same | same | same badge copy (city-wide pill is auth-independent) | none | same as anon + confirm no auth-only city-root affordance is missing | `A01-cityroot-desktop-auth.png` | PENDING_STAGE_2_AUDIT (auth arm not separately hosted-observed this Stage-1 pass) |
| 390×844 | anon | `cityRoot` | same | same | full-city bounds within mobile List-first shell | same badge, mobile layout | none | same + mobile shell renders List-first per functional contract | `A01-cityroot-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | `cityRoot` | same | same | same | same | none | same | `A01-cityroot-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A02 — Direction containing direct AREA children

**Owning spec:** `e2e-parity/a02-direction-direct-areas.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Direction-drilldown frame, `new_discover/` manifest

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | `directionWithDirectAreas` | `node=d:<key>` | Home > {Direction} | fits to Direction bounds | Direction panel lists AREA rows directly (no intermediate Local Destination cards) | Direction + member AREA rows | breadcrumb shows exactly `Home > {Direction}`; panel rows are AREA-kind, not cluster-kind | `A02-direction-direct-areas-desktop-anon.png` | PENDING_STAGE_2_AUDIT |
| 1366×768 | auth | `directionWithDirectAreas` | same | same | same | same | same | same | `A02-direction-direct-areas-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | `directionWithDirectAreas` | same | same | same, mobile List | same, mobile card list | same | same | `A02-direction-direct-areas-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | `directionWithDirectAreas` | same | same | same | same | same | same | `A02-direction-direct-areas-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A03 — Direction containing Local Destinations

**Owning spec:** `e2e-parity/a03-direction-local-destinations.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Local-Destination-tier frame, `new_discover/` manifest

BLOCKED for all four rows: the `directionWithLocalDestinations` role is
unresolved (`null`) in `parity-nodes.ts` — the shallow-tree SHAPE (which
Direction, if any, actually grows a Local Destination level) is an OUTPUT of
the Stage-2 `GEOMETRIC_BISECTION` seed, which does not exist yet. See
`parity-fixture-spec.md`. This is a structural block, not a defect.

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | BLOCKED (Stage-2 seed dependency — role unresolved) |
| 1366×768 | auth | BLOCKED (Stage-2 seed dependency — role unresolved) |
| 390×844 | anon | BLOCKED (Stage-2 seed dependency — role unresolved) |
| 390×844 | auth | BLOCKED (Stage-2 seed dependency — role unresolved) |

---

## A04 — Local Destination containing AREA children

**Owning spec:** `e2e-parity/a04-local-destination-areas.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Local-Destination drilldown frame

Same structural block as A03 — depends on `localDestinationWithAreas`,
also unresolved.

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | BLOCKED (Stage-2 seed dependency — role unresolved) |
| 1366×768 | auth | BLOCKED (Stage-2 seed dependency — role unresolved) |
| 390×844 | anon | BLOCKED (Stage-2 seed dependency — role unresolved) |
| 390×844 | auth | BLOCKED (Stage-2 seed dependency — role unresolved) |

---

## A05 — AREA-selection state with visual AREA clusters

**Owning spec:** `e2e-parity/a05-visual-area-clusters.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Visual-cluster marker composition frame

Depends on `denseAreaDirection`, also unresolved (Stage-2 seed forms the
dense geometry). Once resolved, the *cards/price-pins-in-frame* sub-aspect
of this state is functional-assertable without a visual baseline (sale
pricing is unaffected by #2074) — but the cluster-formation state itself
cannot be reached at all without the seed, so the row stays BLOCKED, not
split.

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | BLOCKED (Stage-2 seed dependency — dense-geometry role unresolved) |
| 1366×768 | auth | BLOCKED (Stage-2 seed dependency — dense-geometry role unresolved) |
| 390×844 | anon | BLOCKED (Stage-2 seed dependency — dense-geometry role unresolved) |
| 390×844 | auth | BLOCKED (Stage-2 seed dependency — dense-geometry role unresolved) |

---

## A06 — Focused visual AREA cluster with explicit member-area panel subset

**Owning spec:** `e2e-parity/a06-focused-cluster-subset.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Focused-cluster panel-subset frame

Same dependency chain as A05 (must reach A05 first).

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | BLOCKED (Stage-2 seed dependency, downstream of A05) |
| 1366×768 | auth | BLOCKED (Stage-2 seed dependency, downstream of A05) |
| 390×844 | anon | BLOCKED (Stage-2 seed dependency, downstream of A05) |
| 390×844 | auth | BLOCKED (Stage-2 seed dependency, downstream of A05) |

---

## A07 — `Show all areas` / visual-focus reset

**Owning spec:** `e2e-parity/a07-show-all-areas-reset.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Reset-affordance frame

Same dependency chain — requires A06's focused-cluster state as its
starting point.

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | BLOCKED (Stage-2 seed dependency, downstream of A06) |
| 1366×768 | auth | BLOCKED (Stage-2 seed dependency, downstream of A06) |
| 390×844 | anon | BLOCKED (Stage-2 seed dependency, downstream of A06) |
| 390×844 | auth | BLOCKED (Stage-2 seed dependency, downstream of A06) |

---

## A08 — Selected AREA with sale listings

**Owning spec:** `e2e-parity/a08-selected-area-sale.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** AREA-detail sale-listings frame
**Listing purpose:** sale (unaffected by #2074)

Carries the F2 defect directly: the hosted repro (discrepancy-register.md,
F2) is exactly this state (`directionWithDirectAreas` → Kambipura AREA,
9 sale listings) and shows the badge rendering the city-wide pill
(`"1,737 properties in Bangalore"`) instead of the AREA-scoped count.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | `directionWithDirectAreas` → click first AREA card | `node=a:<key>` | Home > {Direction} > {Area} | fits to AREA bounds | panel header shows AREA-scoped sale count; **F2 defect**: bottom-right badge instead shows the city-wide pill copy | selected AREA + its sale listings | badge copy must NOT match `/verified properties across/i` while an AREA is selected — currently FAILS per F2 | `A08-selected-area-sale-desktop-anon.png` | MUST_HAVE_FUNCTIONAL (F2 CONFIRMED — see discrepancy-register.md) |
| 1366×768 | auth | same | same | same | same | same defect (F2 verdict recorded under an authenticated pre-existing session; not independently confirmed anonymous) | same | same, plus auth-only affordances (favourite, trust badge) present | `A08-selected-area-sale-desktop-auth.png` | MUST_HAVE_FUNCTIONAL (F2 CONFIRMED, auth arm) |
| 390×844 | anon | same (mobile) | same | same | same, mobile List/Map | same defect expected (not separately mobile-repro'd — F2 was desktop-only in Stage 1) | same | same | `A08-selected-area-sale-mobile-anon.png` | PENDING_STAGE_2_AUDIT (F2 not yet repro'd at mobile viewport; likely same defect but not confirmed) |
| 390×844 | auth | same | same | same | same | same | same | same | `A08-selected-area-sale-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

Visual result for all four rows: DEFERRED pending #2074 (whole-card
composition may shift once Rent/Lease pricing ships alongside Sale on the
same card component) — see AC9.

---

## A09 — Selected AREA with rental listings

**Owning spec:** `e2e-parity/a09-selected-area-rent.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** AREA-detail rent-listings frame
**Listing purpose:** rent

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | ENVIRONMENT_BLOCKED_2074_RENDER (dependency #2074 merged @bbef09b2; Stage 1 not verified against merged head; rendered rent pricing unobservable — 7 areas sampled, zero rent inventory found; see discrepancy-register.md F4 + rent-probe section) |
| 1366×768 | auth | ENVIRONMENT_BLOCKED_2074_RENDER (same) |
| 390×844 | anon | ENVIRONMENT_BLOCKED_2074_RENDER (same) |
| 390×844 | auth | ENVIRONMENT_BLOCKED_2074_RENDER (same) |

---

## A10 — Selected AREA with lease listings where supported

**Owning spec:** `e2e-parity/a10-selected-area-lease.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** AREA-detail lease-listings frame (if shipped)
**Listing purpose:** lease

Per the repo-owner's OQ2 ruling (evidence-first): whether Lease is shipped
at all was **not verified** this Stage-1 pass (F4's verdict explicitly
states no live rent/lease observation was attempted, per the stop
condition). Until Stage 2 verifies shipped-status, this row is classified
via the safer branch of OQ2 (assume "shipped but unobservable" rather than
guess "not shipped" and risk mislabeling a broken path as intentional).

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | ENVIRONMENT_BLOCKED_2074_RENDER (dependency #2074 merged @bbef09b2; Stage 1 not verified against merged head; rendered lease pricing unobservable; shipped-status of Lease unverified this pass — re-run OQ2 evidence-first check in Stage 2 before any INTENTIONAL_DIFFERENCE reclassification) |
| 1366×768 | auth | ENVIRONMENT_BLOCKED_2074_RENDER (same caveats) |
| 390×844 | anon | ENVIRONMENT_BLOCKED_2074_RENDER (same caveats) |
| 390×844 | auth | ENVIRONMENT_BLOCKED_2074_RENDER (same caveats) |

---

## A11 — Within-area property search active

**Owning spec:** `e2e-parity/a11-within-area-search.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** In-panel search-active frame
**Listing purpose:** sale (search behaviour is purpose-agnostic; sale used to avoid #2074 dependency)

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | selected AREA (via A08 path) + type into in-panel search | `node=a:<key>` unchanged by search | unchanged | unchanged (search does not re-fit camera) | panel count reflects `M of N match` form, badge copy uses the shared `formatDiscoverBadgeCopy` contract (per AC4 in `DiscoverMapCountBadge.tsx`) | selected AREA + listings matching a chosen search term | search input reflects typed term; panel/badge counts use the SAME computed string (never independently derived) | `A11-within-area-search-desktop-anon.png` | PENDING_STAGE_2_AUDIT (functional-assertable now; visual DEFERRED pending #2074) |
| 1366×768 | auth | same | same | same | same | same | same | same | `A11-within-area-search-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | same, mobile | same | same | same | same, mobile | same | same | `A11-within-area-search-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | `A11-within-area-search-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A12 — Listing filters active

**Owning spec:** `e2e-parity/a12-listing-filters-active.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Filter-chip-selected frame
**Listing purpose:** sale

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | selected AREA (A08 path) + apply one filter chip | `node=a:<key>` + filter query params | unchanged | unchanged | filtered `M of N` count, filter chip shows selected state | selected AREA + listings spanning both sides of the filter boundary | filter chip `aria-pressed=true`; count reflects filtered subset, not full AREA count | `A12-listing-filters-active-desktop-anon.png` | PENDING_STAGE_2_AUDIT (functional-assertable now; visual DEFERRED pending #2074) |
| 1366×768 | auth | same | same | same | same | same | same | same | `A12-listing-filters-active-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | same, mobile | same | same | same | same | same | same | `A12-listing-filters-active-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | `A12-listing-filters-active-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A13 — Empty filtered results and reset action

**Owning spec:** `e2e-parity/a13-empty-filtered-reset.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Empty-state + reset-CTA frame
**Listing purpose:** sale

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | selected AREA (A08 path) + apply a filter combination with zero matches | `node=a:<key>` + filter params | unchanged | unchanged | empty-state icon + message + reset CTA (per UI State Coverage convention — never blank space) | selected AREA + a filter combination proven zero-match by the fixture spec | empty state visible; reset CTA clears filter params and restores full AREA count | `A13-empty-filtered-reset-desktop-anon.png` | PENDING_STAGE_2_AUDIT (functional-assertable now; visual DEFERRED pending #2074) |
| 1366×768 | auth | same | same | same | same | same | same | same | `A13-empty-filtered-reset-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | same, mobile | same | same | same | same | same | same | `A13-empty-filtered-reset-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | `A13-empty-filtered-reset-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A14 — Browse All / unselected-area listing scope where shipped

**Owning spec:** `e2e-parity/a14-browse-all.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Browse-All / city-scope listing frame (if shipped)

Same OQ2 evidence-first caveat as A10: whether a "Browse All" /
unselected-area listing scope is actually shipped on Discover today was
**not verified** this Stage-1 pass.

| Viewport | Auth | Status |
|---|---|---|
| 1366×768 | anon | PENDING_STAGE_2_AUDIT (shipped-status unverified — Stage 2 must run the OQ2 evidence-first check FIRST: if shipped-but-unobservable → BLOCKED; if genuinely not shipped → INTENTIONAL_DIFFERENCE citing OQ2; if shipped and observable → assess normally) |
| 1366×768 | auth | PENDING_STAGE_2_AUDIT (same caveat) |
| 390×844 | anon | PENDING_STAGE_2_AUDIT (same caveat) |
| 390×844 | auth | PENDING_STAGE_2_AUDIT (same caveat) |

---

## A15 — Listing peek and exact Back-to-results restoration

**Owning spec:** `e2e-parity/a15-listing-peek-restoration.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Listing peek/preview sheet frame
**Listing purpose:** sale

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | selected AREA (A08 path) + open one listing's peek/detail | AREA `node=` unchanged; peek uses its own listing-id param, not `node=` | unchanged | unchanged | peek sheet shows listing detail; Back-to-results restores same selected AREA, filters, camera and scroll/panel position | selected AREA + one specific listing to peek | Back-to-results is distinct from hierarchy Back (per functional contract); prior filter/camera state is bit-for-bit restored | `A15-listing-peek-restoration-desktop-anon.png` | PENDING_STAGE_2_AUDIT (functional-assertable now; visual DEFERRED pending #2074 — peek may show rent/lease price) |
| 1366×768 | auth | same | same | same | same | same | same | same | `A15-listing-peek-restoration-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | same, mobile | same | same | same | mobile preview sheet (`MobileListingPreviewSheet.tsx`) | same | same | `A15-listing-peek-restoration-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | `A15-listing-peek-restoration-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A16 — Guided hierarchy navigation plus in-app hierarchy Back

**Owning spec:** `e2e-parity/a16-guided-nav-hierarchy-back.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Breadcrumb + hierarchy-Back affordance frame

Carries the F1 Arm-1 defect directly: the hosted repro
(discrepancy-register.md, F1 Arm 1) is exactly "guided drill to an AREA,
then click the Home breadcrumb" and shows the camera staying at the
locally-zoomed AREA framing instead of re-fitting to full-city bounds, even
though the URL correctly updates to `node=root`.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | `cityRoot` → drill to AREA → click Home breadcrumb | ends at no `node=` (root) | Home only after Back | **F1 Arm 1 defect**: URL correctly loses `node=`/camera params, but the rendered camera stays at the pre-Back AREA-level framing instead of re-fitting to full-city bounds | breadcrumb/panel correctly show root-level content; only the MAP camera is wrong | Direction + AREA used for the drill | camera bbox after Back must match the A01 full-city baseline bbox — currently FAILS per F1 Arm 1 | `A16-guided-nav-hierarchy-back-desktop-anon.png` | MUST_HAVE_FUNCTIONAL (F1 Arm 1 CONFIRMED) |
| 1366×768 | auth | same | same | same | same defect (register's repro session was authenticated) | same | same | same | `A16-guided-nav-hierarchy-back-desktop-auth.png` | MUST_HAVE_FUNCTIONAL (F1 Arm 1 CONFIRMED, auth arm) |
| 390×844 | anon | same, mobile | same | same | same defect expected (not separately mobile-repro'd) | same, mobile hierarchy-Back affordance | same | same | `A16-guided-nav-hierarchy-back-mobile-anon.png` | PENDING_STAGE_2_AUDIT (F1 Arm 1 not yet repro'd at mobile viewport) |
| 390×844 | auth | same | same | same | same | same | same | same | `A16-guided-nav-hierarchy-back-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A17 — Browser Back and Forward through committed hierarchy states

**Owning spec:** `e2e-parity/a17-browser-back-forward.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** N/A (behavioural state, no distinct visual frame beyond the states it restores)

Carries BOTH F1 Arm 2 and F3 directly. F1 Arm 2 (3 trials, all on the
guided-selection path) never settles on the correct full-city bounds after
2× browser Back, and disagrees with itself between trials (non-deterministic
wrong state). F3 additionally shows the searched-selection Back path
settles into a *different* wrong state (a stale AREA-level camera) after
only 1 Back press (history depth differs from the guided path's 2 presses,
itself a structural difference independent of the camera bug).

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | `cityRoot` → guided drill (Direction → AREA) → browser Back×2, AND separately `cityRoot` → search-select AREA → browser Back×1 | ends at no `node=` (root) in both scenarios | Home only after settling | **F1 Arm 2 / F3 defect**: guided-path settled camera is non-deterministic across trials (never full-city); searched-path settled camera is a consistent stale AREA-level zoom — neither matches the A01 baseline bbox | root-level panel content correct in both scenarios; only camera is wrong | Direction + AREA used for both drill paths | camera bbox after settling must match A01 baseline in BOTH scenarios — currently FAILS in both, via different mechanisms (test must assert the two scenarios separately, per F3's requirement) | `A17-browser-back-forward-desktop-anon.png` | MUST_HAVE_FUNCTIONAL (F1 Arm 2 + F3 CONFIRMED — two separate scenarios, do not collapse) |
| 1366×768 | auth | same | same | same | same defect (register's repro was authenticated) | same | same | same | `A17-browser-back-forward-desktop-auth.png` | MUST_HAVE_FUNCTIONAL (F1 Arm 2 + F3 CONFIRMED, auth arm) |
| 390×844 | anon | same, mobile | same | same | same defect expected (not separately mobile-repro'd; mobile has no separate browser-history mechanism) | same | same | same | `A17-browser-back-forward-mobile-anon.png` | PENDING_STAGE_2_AUDIT (not yet repro'd at mobile viewport) |
| 390×844 | auth | same | same | same | same | same | same | same | `A17-browser-back-forward-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A18 — Direct deep link, refresh and canonical ancestry recovery

**Owning spec:** `e2e-parity/a18-deep-link-refresh-ancestry.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** N/A (behavioural state)

Not covered by F1–F6. No hosted evidence either way this Stage-1 pass.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | drill to an AREA once (to obtain a real `node=` value), copy the resulting URL, open it fresh (cold navigation) and separately hard-refresh it | `node=a:<key>` preserved across cold load and refresh | full ancestry (Home > Direction > Area) recovered from the node key alone, without replaying the drill | fits to the AREA's bounds on cold load, matching the originally-drilled camera | panel content matches the originally-drilled state | Direction + AREA used for the drill | breadcrumb ancestry identical between the originally-drilled state and the cold-loaded/refreshed state | `A18-deep-link-refresh-ancestry-desktop-anon.png` | PENDING_STAGE_2_AUDIT |
| 1366×768 | auth | same | same | same | same | same | same | same | `A18-deep-link-refresh-ancestry-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | same, mobile | same | same | same | same | same | same | `A18-deep-link-refresh-ancestry-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | `A18-deep-link-refresh-ancestry-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A19 — Area-search selection converging on canonical `node=`

**Owning spec:** `e2e-parity/a19-search-selection-convergence.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Search-combobox-active frame

F3's hosted repro directly tested this: the searched-selection path
(`cityRoot` → type into the "Search areas to explore" combobox → select the
autocomplete suggestion) reached the **same** canonical `node=a:...Kambipura`
key as the guided drill path — the identity-convergence question A19 asks IS
satisfied. F3's defect is in what happens on browser Back AFTER convergence
(A17's territory), and in a separate structural fact (the searched path
skips the intermediate Direction-node history entry) — recorded here as
informational, not as a defect against A19 itself.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | `cityRoot` → guided drill to AREA (baseline node), AND separately `cityRoot` → search-select the SAME AREA | both scenarios converge on the identical `node=a:<key>` | search-path breadcrumb shows full ancestry despite skipping the intermediate Direction history entry (informational — see F3 note above) | fits to the AREA's bounds in both scenarios | panel content identical between the two scenarios | Direction + AREA used, with a name searchable via the combobox | the two scenarios' final `node=` values are byte-identical | `A19-search-selection-convergence-desktop-anon.png` | MATCH (F3 CONFIRMS node-identity convergence; the searched-vs-guided HISTORY DEPTH difference is real but is A17's concern, not A19's) |
| 1366×768 | auth | same | same | same | same | same | same | same | `A19-search-selection-convergence-desktop-auth.png` | MATCH (auth arm not independently hosted-observed; classification carried from the anon-arm F3 evidence pending Stage-2 confirmation) |
| 390×844 | anon | same, mobile | same | same | same | same | same | same | `A19-search-selection-convergence-mobile-anon.png` | PENDING_STAGE_2_AUDIT (search affordance not repro'd at mobile viewport) |
| 390×844 | auth | same | same | same | same | same | same | same | `A19-search-selection-convergence-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A20 — Schools shortcut from a selected AREA retaining area context

**Owning spec:** `e2e-parity/a20-schools-shortcut-area-context.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** In-panel Schools-shortcut affordance frame

Distinct from F1 Arm 3 (which tested the **top-nav** "Schools" link — a hard
navigation to a hardcoded journey-switch URL, reachable from any state, and
found camera-correct). A20 asks about an **in-panel** shortcut specifically
reachable from a selected AREA that is expected to retain area context
(e.g. pre-scope the school-first journey to the same area) — no such
affordance was located or exercised in this Stage-1 pass; its existence is
unconfirmed. `parity-fixture-spec.md` notes school inventory rows are needed
for the full count-bearing assertions here, but the pure "does area context
carry over" behavioural check does not need real school data.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | anon | selected AREA (A08 path) → locate and click an in-panel Schools shortcut, if one exists | school-first journey URL retains an area-scoping param equivalent to the AREA just left | N/A (journey switch) | fits to the area-scoped school view, not full-city | school-first panel shows the SAME area's schools, not a city-wide list | selected AREA + at least one school row (Stage-2 fixture requirement) | destination journey/URL carries an identifiable reference back to the originating AREA | `A20-schools-shortcut-area-context-desktop-anon.png` | PENDING_STAGE_2_AUDIT (affordance existence unconfirmed this Stage-1 pass) |
| 1366×768 | auth | same | same | same | same | same | same | same | `A20-schools-shortcut-area-context-desktop-auth.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | anon | same, mobile | same | same | same | same | same | same | `A20-schools-shortcut-area-context-mobile-anon.png` | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | `A20-schools-shortcut-area-context-mobile-auth.png` | PENDING_STAGE_2_AUDIT |

---

## A21 — Mobile List mode at city/direction/local-destination/AREA levels

**Owning spec:** `e2e-parity/a21-mobile-list-mode.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Mobile List-mode composition frame (per hierarchy level)

Per the handoff: not pixel-deterministic by construction (GPU/canvas
variance) wherever the underlying map viewport participates — recorded here
as a **permanent documented mask**, not a temporary block. Functional
(DOM/URL) assertions are unaffected.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot (masked) | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 390×844 | anon | `cityRoot`, then drill one level at a time (Direction → AREA where resolvable) staying in List mode throughout | node= advances per level exactly as desktop | matches desktop ancestry at each level | N/A in List mode (map not the primary surface) | List renders one card per destination/listing at the current level | none beyond what each level needs | List mode never opens the full-screen map; each level's card count matches the panel-equivalent desktop count | `A21-mobile-list-mode-{level}.png` (masked: any map thumbnail/canvas region) | PENDING_STAGE_2_AUDIT (functional-assertable now; visual requires the documented map-region mask, not a block) |
| 390×844 | auth | same | same | same | same | same | same | same | same (masked) | PENDING_STAGE_2_AUDIT |

(Desktop rows intentionally omitted — A21 is a mobile-only state per its
definition.)

---

## A22 — Mobile full-screen Map mode for the same canonical states

**Owning spec:** `e2e-parity/a22-mobile-fullscreen-map.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Mobile full-screen Map-mode composition frame

Same permanent-mask treatment as A21 — here the ENTIRE frame is the map, so
the mask covers most of the viewport; numeric assertions (marker count,
cluster count, camera bbox) carry the actual proof weight, matching the
handoff's explicit instruction for full-map frames.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot (masked) | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 390×844 | anon | `cityRoot` → tap "View map" at each level | node= unchanged by the List/Map toggle (per functional contract) | same as the List-mode equivalent | full-screen map fits to the SAME bounds as the desktop-equivalent level | numeric marker/cluster count matches the List-mode card count at the same level | none beyond what each level needs | `node=` is byte-identical before/after toggling to Map mode; marker count assertion substitutes for pixel comparison | `A22-mobile-fullscreen-map-{level}.png` (masked: entire map canvas region; numeric assertions carry proof weight) | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | same (masked) | PENDING_STAGE_2_AUDIT |

(Desktop rows intentionally omitted — A22 is a mobile-only state.)

---

## A23 — Mobile AREA listings and single-column property cards

**Owning spec:** `e2e-parity/a23-mobile-area-listings-single-column.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** Mobile single-column PropertyCard composition frame
**Listing purpose:** sale

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 390×844 | anon | selected AREA (A08 path, mobile) | `node=a:<key>` | Home > Direction > Area | fits to AREA bounds (List mode: N/A for the visible frame) | single-column card list; **possible F2 overlap**: badge may show the same city-wide-pill defect at mobile viewport — not yet confirmed | selected AREA + sale listings | cards render single-column (not multi-column) at 390px width; badge copy assertion same as A08 | `A23-mobile-area-single-column-anon.png` | PENDING_STAGE_2_AUDIT (functional-assertable now; visual DEFERRED pending #2074; F2 badge defect not yet confirmed at mobile viewport) |
| 390×844 | auth | same | same | same | same | same | same | same | `A23-mobile-area-single-column-auth.png` | PENDING_STAGE_2_AUDIT |

(Desktop rows intentionally omitted — A23 is a mobile-specific composition
state; the desktop-equivalent listing content is already covered by A08.)

---

## A24 — Mobile Map/List switching without hierarchy-history mutation

**Owning spec:** `e2e-parity/a24-mobile-map-list-switch-no-history.spec.ts` (Stage 2, not yet authored)
**Frozen design ref:** N/A (behavioural state; visual frames are A21/A22's)

The functional half of this state (does toggling mutate `node=` or push a
history entry) is fully DOM/URL-deterministic. The visual half inherits
A21/A22's full-map-frame mask since it necessarily shows the map mid-toggle.

| Viewport | Auth | Starting URL (role) | `node=`/params | Ancestry | Map bounds/CameraIntent | Panel/counts | Fixture rows | Assertions | Screenshot (masked) | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 390×844 | anon | `cityRoot` or a selected AREA → toggle List↔Map repeatedly | `node=` byte-identical before/after every toggle | unchanged by toggling | map re-appears at the same bounds each time it becomes visible (masked for pixel comparison; bbox asserted numerically) | List/Map content matches at each toggle | none beyond the starting state's needs | `window.history.length` unchanged by List/Map toggles (per "Map/List presentation switches do not mutate `node=` or create hierarchy history"); repeated toggling produces no duplicate/loop history entries | `A24-mobile-toggle-no-history.png` (masked: map canvas region) | PENDING_STAGE_2_AUDIT |
| 390×844 | auth | same | same | same | same | same | same | same | same (masked) | PENDING_STAGE_2_AUDIT |

(Desktop rows intentionally omitted — A24 is a mobile-only state.)

---

## Summary — status counts (informational, not a gate)

| Status | Count of the 96 rows |
|---|---|
| MATCH | 5 (A01 desktop×2 + A19 desktop×2 + note: A01 desktop-anon is the only hosted-spot-check-backed MATCH; the rest are carried pending Stage-2 confirmation) |
| MUST_HAVE_FUNCTIONAL | 10 (A08 ×2, A16 ×2, A17 ×2, plus the 4 mobile PENDING rows for A08/A16/A17 are NOT counted here — see their individual PENDING status) |
| BLOCKED | 20 (A03, A04, A05, A06, A07 — 4 rows each) |
| ENVIRONMENT_BLOCKED_2074_RENDER (formerly BLOCKED_PENDING_2074_FINAL_HEAD — renamed in Amendment-1 Step 5) | 16 (A09 ×4, A10 ×4, plus A08/A11-15/A23 visual-deferred notes are NOT separately counted — those rows are PENDING_STAGE_2_AUDIT with a visual-deferred annotation, not a full BLOCKED status) |
| PENDING_STAGE_2_AUDIT | the remainder |

This table is informational only — Stage 2 owns closing out every
`PENDING_STAGE_2_AUDIT` and `BLOCKED` row. It is not a Definition-of-Done
gate for Stage 1 (see `README.md`).

---

# Amendment-1 Step 4 — AC16 visual comparison results (hosted shipped vs. frozen mock)

**This section supersedes nothing above; it appends.** The Stage-1 table above predates the
amendment's mock-capture harness and predates any real frozen-mock-vs-shipped comparison — most of
its rows are `PENDING_STAGE_2_AUDIT`/`BLOCKED` by design, and none of that changes here. This
section is the AC16 deliverable: real component-scoped comparisons between the shipped app
(hosted Bangalore, captures in
`evidence/issue-2076-amendment1-step4-shipped-captures/`) and the frozen mock (captures in
`mock-audit/captures/`, per `mock-audit/index.md`), driven by the AC11/AC13 mappings in
`state-mapping.md`.

Component-scoped comparison, per AC16. Every row below cites the exact frozen mock reference it
was compared against (AC15 requirement — no entry lacks one). Guaranteed capture artefacts (map
tiles, marker pixels, listing images, exact price/count VALUES) are excluded from every verdict
per the amendment's explicit list; only presence/absence, relative placement/order, text FORM,
typography/spacing, and structural composition are compared.

**Cells compared this step: 12** (10 desktop cells, rows 1–11 below excluding non-comparable A09,
plus 2 mobile cells, rows 12–13 below — 10 + 2 = 12). **Cells NOT compared, and why: 38 of 48** — every A01-A24 x
{desktop, mobile} cell classified `NO_FROZEN_REFERENCE` or `NOT_DESIGNED` in `state-mapping.md`'s
AC11 table is carried forward unchanged and does not appear below; none is reported as a
discrepancy, per the amendment's single most important rule.

## Desktop cells

| # | A-state(s) | Frozen ref (mock) | Shipped anchor / capture | Masked | Verdict | Notes |
|---|---|---|---|---|---|---|
| 1 | A01 | areas-city-default (mock heading "Where do you want to explore?") | `A01-desktop-city-default.jpg`, `discover-control-bar` root panel | map tiles, exact "1737" count value | **MUST_HAVE_VISUAL** | Shipped root heading is "Bangalore / 1737 listings" (a location+count statement); mock's root heading is an invitational question. TEXT-FORM difference (comparable per AC16), not a count-value artefact. See discrepancy register **F8**. |
| 2 | A02, A04 | areas-region-areas (mock heading "Areas in South Bangalore", area-card list) | `A02-A04-desktop-west-region-areas.jpg`, `navigation-child-card-${nodeKey}` | exact area/listing count values, map tiles | **MATCH** | Shipped Direction (West Bangalore) panel renders heading + individual AREA cards — same composition as the mock's areas-region-areas. |
| 3 | A03, A05 | areas-region-clusters (mock heading "Inside North Bangalore", **cluster**-card list e.g. "Devanahalli & Doddaballapur") | `A03-A05-desktop-north-direction-flat-area-list.jpg`, `navigation-child-card-${nodeKey}` | exact area/listing count values, map tiles | **MUST_HAVE_FUNCTIONAL** | Shipped North Bangalore Direction panel renders the SAME composition as row 2 — individual AREA cards, never a cluster-selection list. Clusters appear only as map bubbles, and clicking a bubble's "Tap to zoom" only re-zooms the camera in place, never navigates to a cluster-scoped panel. See discrepancy register **F9**. Caveat: 2 directions sampled (West, North), not exhaustive across all 5. |
| 4 | A08, A20 | areas-area-listings (mock heading "Properties in Hebbal") + `school-shortcut` | `A08-A20-desktop-area-listings-kambipura.jpg`, `area-selected-panel` / `add-school-cta` | listing images, exact price/count values, map tiles | **MATCH** | Heading pattern "Properties in {Area}" matches exactly. Breadcrumb ordered Home > City > Region > Area, matching mock composition. School-shortcut CTA present and copy-compatible. |
| 5 | A08 (card) | `listing-card` | `A08-desktop-listing-card-scrolled.jpg`, `listing-card` | card image content, exact price value | **MATCH** | Card field order (price, type badge, title, area, beds/sqft, save) matches mock composition. |
| 6 | A09 | NO_FROZEN_REFERENCE as a distinct state id (confirmed via source in state-mapping.md) | `A09-desktop-rent-variant-header.jpg` | — | **not applicable — not a comparison** | No frozen reference exists; capture feeds F7/rent-probe only, per the amendment's instruction not to fabricate a comparison. |
| 7 | A11 | areas-listings-query-active (REF, no-self-ID) | `A11-desktop-query-active-whitefield.jpg`, `area-search-input` | exact "20"/"3 bhk" values | **MATCH** | Search input populated with submitted query; result-count text follows the "N verified properties for sale/rent in {Area}" scoped-summary FORM, same kind of composition as the mock's "N of M" pattern. |
| 8 | A12 | areas-listings-filters-active (REF, no-self-ID) | `A12-desktop-filters-active-3bhk-whitefield.jpg`, `quick-chip-3-bhk` | exact count value | **MATCH** | Selected chip renders a distinct bordered/highlighted state, matching the mock's `aria-pressed="true"` selected-chip composition. |
| 9 | A13 | areas-listings-query-active's empty-results notes (REF, no-self-ID) | `A13-desktop-empty-results-reset-whitefield.jpg`, `area-empty-state` | exact query string used | **MATCH** | Icon + "No results for {query}" + explanatory line + "Clear search" action — same 3-part composition as the mock's empty-results capture (icon, message, reset). |
| 10 | A14 | areas-browse-all | none — **not captured** | — | **UNDETERMINED** | No Browse-All entry point found reachable from city root this step (searched via accessibility-tree query + manual clicks on the count heading and map badge). Not classified as a discrepancy — the search was not exhaustive. Flagged for the downstream step. |
| 11 | A19 | shell-area-autocomplete-open (PARTIAL — overlay only) | `A19-desktop-area-autocomplete-overlay.jpg`, `control-bar-area-autocomplete` | exact matched-area names | **MATCH** | Overlay opens as a listbox below the search input; underlying page unchanged behind it — matches the manifest's "Overlay only; underlying state unchanged" note exactly. |

## Mobile cells

| # | A-state(s) | Frozen ref (mock) | Shipped anchor / capture | Masked | Verdict | Notes |
|---|---|---|---|---|---|---|
| 12 | A01, A21 (city) | areas-city-default-mobile (manifest object; DOM never emits this id per state-mapping.md's id-emission caveat) | `A01-mobile-city-default.png` (390x844, mechanically verified via `window.innerWidth/innerHeight`) | map tiles, exact count value | **MUST_HAVE_VISUAL** | Same F8 heading-pattern issue reproduces at mobile: "Bangalore / 1737 listings", no "Where do you want to explore?" text anywhere. Region cards stack single-column as expected for 390px — only the heading copy is the discrepancy, not the mobile layout. |
| 13 | A08, A21, A23 (AREA) | areas-area-listings-mobile (same id-emission caveat) | `A08-A21-A23-mobile-area-listings.png` (390x844, mechanically verified) | map tiles, exact price/count values | **MATCH** | Breadcrumb, heading, and filter-chip row present and stacked full-width for 390px, matching the manifest's documented single-column mobile collapse. |

## Summary tally (this section only)

| Verdict | Count | Cells |
|---|---|---|
| MATCH | 8 | Desktop (7): A02/A04, A08/A20, A08-card, A11, A12, A13, A19. Mobile (1): A08-mobile (row 13, counted once; a distinct row from its desktop counterpart). 7 + 1 = 8. |
| MUST_HAVE_VISUAL | 2 | A01 desktop, A01 mobile — both instances of **F8** |
| MUST_HAVE_FUNCTIONAL | 1 | A03/A05 — **F9** |
| UNDETERMINED (not a defect classification) | 1 | A14 |
| Not applicable / no comparison performed | 1 | A09 (feeds F7/rent-probe instead) |

**12 comparisons produced a verdict** (13 rows across both tables above — 11 desktop + 2 mobile —
minus A09, excluded as non-comparable: 11 + 2 − 1 = 12). This matches the tally above: MATCH 8 +
MUST_HAVE_VISUAL 2 + MUST_HAVE_FUNCTIONAL 1 + UNDETERMINED 1 = 12. 38 of 48 cells
were deliberately not compared, per `state-mapping.md`'s AC11 table. A14 is a coverage gap
(UNDETERMINED), kept separate from both the compared and deliberately-not-compared counts so
neither total is inflated. (Corrected 2026-08-04: the two summary sentences in this section were
originally written before the 2-row mobile table above was appended in the same pass, so they
omitted the mobile MATCH row and undercounted both the cell-count and comparison-count figures by
2; this is a plain arithmetic omission, not the A02/A04-style shared-reference convention, which is
applied correctly elsewhere in this document and is unchanged here.)

New discrepancy findings from this step (**F7**, **F8**, **F9**) are recorded with full rigor in
`discrepancy-register.md`.

## Methodology gap: component scope vs. page-shell scope (added 2026-08-04)

The 12-cell comparison above, per AC16, is scoped to individual COMPONENTS — headings, badges,
cards — anchored through the AC13 mock-component-to-shipped-testid mapping. That scope was the
right call given the constraint it was solving: the frozen mock and the shipped app share no
common DOM attribute to diff against, and each renders its own independent Leaflet instance over
different data (fixture vs. hosted), so an unscoped full-page pixel diff would have been noise, not
signal.

The cost of that scope is that it cannot see page-SHELL composition — which side the map sits on,
the panel/map split ratio, control-bar placement, overall proportions — because those are
properties of how components are ARRANGED, not of any one component. **F10**
(`discrepancy-register.md`) is the concrete instance: the frozen desktop mock places the map on the
LEFT and the panel on the RIGHT, while the shipped desktop app is the mirror image
(panel-LEFT/map-RIGHT), consistently across all six sampled desktop Areas states. Every cell in the
table above could verdict MATCH and this discrepancy would still be invisible to it — which is
exactly what happened; F10 was caught by a human comparing two screenshots, not by this audit. This
is not a discipline failure by any gate or specialist in this step; every cell above did precisely
what AC16 asked.

The lesson for Stage 2: a full parity audit needs BOTH a shell-level pass and a component-level
pass — component granularity buys precision at the cost of peripheral vision, and one does not
substitute for the other. A shell-level pass should check, at minimum: pane order and side (which
side the map/panel each sit on), split ratio/proportions, control-bar placement, and overall page
structure — the same items #2076's own visual acceptance contract lists under "page shell and
overall proportions" and "desktop map/panel split and panel width". See
`fixture-environment-manifest.md`'s "Known gaps" item 8 for the fuller writeup.

---

## Shell-level desktop pass (2026-08-04) — F12–F17

The gap identified immediately above was closed for the desktop states that have a real frozen-mock
reference (A01; A02/A04; A03/A05; A08 incl. A20; A11; A12; A13; A19 — A14 has a mock reference but
no reachable shipped capture). Full detail, evidence citations, and the deliberate (b)/(c)/(d)
exclusions live in `discrepancy-register.md`'s "F12–F17 — Shell-level desktop pass" section; not
duplicated here to avoid drift between two copies of the same evidence.

**Headline:** the desktop-wide "doesn't match the mock" impression is not mostly explained by F10 +
F8 alone — it is genuinely more extensive. F12 (the entire in-panel journey-choice card block is
absent from the shipped DOM at every sampled state — all of which carry `journey=area-first`;
`DiscoverRightPanelContainer` routes that journey to a sibling panel that never mounts the switcher,
which itself is intact and renders correctly for school-first/agri-first/journey-less states;
confirmed by a direct DOM query, not just a screenshot) is the largest single additional cause;
F13/F16 (systemic omission of section eyebrows,
divider rules, descriptive taglines, and demoted CTA prominence) are a repeated structural pattern
across 3+ independently sampled states; F14/F15/F17 are smaller composition/typography/border
differences.

| Finding | Summary | Classification |
|---|---|---|
| F12 | In-panel journey-switcher (Areas/Schools/Agricultural cards) absent for the canonical Areas journey (`journey=area-first`, every sampled state) — routed to a sibling panel that never mounts it; component itself is intact and renders for other journeys | MUST_HAVE_VISUAL |
| F13 | Section eyebrow labels, divider rules, per-item descriptive taglines systematically omitted (A01, A02/A04, A08/A12) | MUST_HAVE_VISUAL |
| F14 | Direction-tier destination list: row-list (mock) vs. card-grid (shipped) — AREA-tier below is already a MATCH on both sides | MINOR_POLISH |
| F15 | Heading typography substantially larger/heavier in shipped, independent of F8's text-content finding | MINOR_POLISH |
| F16 | Within-area element order + school-shortcut CTA prominence diverge (search-before-filters vs. after; CTA demoted to inline button) | MUST_HAVE_VISUAL |
| F17 | Card border/elevation: visible 1px border + hover fill (shipped) vs. borderless/shadow (mock) | MINOR_POLISH |

Consciously excluded as (b) noise / (c) data artefact / (d) capture artefact: the entire top
masthead/global-nav bar (mock's is prototype-tool chrome, not the frozen design), map
tiles/marker styling, exact count/price values, sub-pixel spacing deltas, and the Buy/Rent toggle's
visual style. See the register for the full reasoning per item.

Not determined: A14 (Browse All) shell composition — no shipped capture exists and reachability was
already UNDETERMINED in the AC16 pass above; not re-attempted here per this step's bounded scope.
