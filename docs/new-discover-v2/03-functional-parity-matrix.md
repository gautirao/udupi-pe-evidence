# 03 — Functional Parity Matrix (Production → Frozen Design)

This is the reconciling artifact between the frozen design audit
([01](01-frozen-design-audit.md)) and the production baseline audit ([02](02-production-baseline-audit.md)).
Every manifest state and every cross-cutting capability is classified as one of:

- **ALREADY-BUILT** — production has this today, at or near parity with the frozen design.
- **VISUAL-ONLY-CHANGE** — the underlying capability/data/logic exists; only presentation needs to
  change.
- **NEEDS-REFACTOR** — the capability exists but its current shape would make a naive reskin
  unsafe, or would violate "reuse existing routes/hooks/logic."
- **MISSING-BACKEND** — no backend support exists; frontend cannot honestly render this without
  new backend work first.
- **MISSING-FRONTEND** — backend support exists (or will, once blockers above are resolved) but no
  frontend surface exists yet.
- **DESIGN-NOT-SPECIFIED** — the frozen design explicitly leaves this open; needs a product
  decision, not an implementation guess.

> Note: the manifest contains **20** states (not 22 as originally assumed — see
> [01-frozen-design-audit.md](01-frozen-design-audit.md) Phase 1).

## Part A — All 20 manifest states

| # | State id | Classification | Why | Evidence |
|---|---|---|---|---|
| 1 | `areas-city-default` | ALREADY-BUILT | Compass directional-region landing exists end-to-end (`regionCompassLayout.ts` + `CityRegionProjection`). Gap: production currently reads the legacy `area_groups` model (no Centre bucket); design shows 5 regions including Central. | [02](02-production-baseline-audit.md) §B.6, §C.1 |
| 2 | `areas-region-clusters` | MISSING-BACKEND | **Scope generalized (2026-07-21):** the approved product decision requires a genuinely *recursive*, arbitrary-depth cluster tier (a cluster may contain sub-clusters), not one flat level. No table or generator exists for this at all. #1910 is confirmed a flat, single-level read-time projection — cannot represent recursion and is retained as a narrow compatibility layer, not extended; #1951 remains a design-only charter needing a targeted recursive amendment. See [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full recursive data model, generation algorithm, and API. | [02](02-production-baseline-audit.md) §C.10; [06](06-target-architecture-and-pr-plan.md) Feature 3 |
| 3 | `areas-region-areas` (shallow) | ALREADY-BUILT | Region → canonical-area drill-down exists; this is the no-cluster path production already serves natively. | [02](02-production-baseline-audit.md) §A.6, §B.6 |
| 4 | `areas-area-listings` | VISUAL-ONLY-CHANGE | Grid, filters, listing pins, school-shortcut all exist (`DiscoverRightPanel`, `useDiscoverFilteredMarkers`). Needs a re-skin. | [02](02-production-baseline-audit.md) §A.6, §B.3 |
| 5 | `areas-listings-query-active` | VISUAL-ONLY-CHANGE | Per-area search + filtered pins exist; only the "N of M" + Reset + empty-state presentation needs to match the design. | [02](02-production-baseline-audit.md) §A.8 |
| 6 | `areas-listings-filters-active` | VISUAL-ONLY-CHANGE | Type/beds/verified chips + filtered markers exist; only the compact-chip presentation is the delta. | [02](02-production-baseline-audit.md) §A.7 |
| 7 | `areas-browse-all` | ALREADY-BUILT (near) | Scope-wide listing browsing is supported by the marker/filter hooks; verify the "no area selected" scope mode matches exactly, otherwise a minor refactor. | [02](02-production-baseline-audit.md) §A.4 |
| 8 | `shell-city-switcher-open` | ALREADY-BUILT (single-city) | `CitySelect` exists; live-Bangalore + disabled "Soon" entries are a styling task. A second *live* city is DESIGN-NOT-SPECIFIED. | [02](02-production-baseline-audit.md) §A.9; manifest |
| 9 | `shell-area-autocomplete-open` | MISSING-FRONTEND | The design wants one global, mode-aware autocomplete resolving to a canonical state. Production has only a per-city substring filter + a fixed dropdown. Genuine gap. | [02](02-production-baseline-audit.md) §A.9 |
| 10 | `schools-city-default` | VISUAL-ONLY-CHANGE | Schools journey fully exists (`JourneySwitcher` → `SchoolBrowsePanel`). Compass-in-Schools + plum accent are styling/wiring work. | [02](02-production-baseline-audit.md) §A.10 |
| 11 | `schools-region-areas` | VISUAL-ONLY-CHANGE | Region → school-areas exists (`SchoolGroupAreasPanel`). A reachable Schools cluster level is explicitly DESIGN-NOT-SPECIFIED (unreachable with current mock data). | [02](02-production-baseline-audit.md) §A.10; manifest |
| 12 | `schools-area-schools` | VISUAL-ONLY-CHANGE | `SchoolsInAreaPanel` + school markers + board/level filters + homes-in-area grid all exist. Re-skin only. | [02](02-production-baseline-audit.md) §A.10, §B.9 |
| 13 | `schools-school-search` | VISUAL-ONLY-CHANGE | School search + filter chips + empty state all exist. | [02](02-production-baseline-audit.md) §A.10 |
| 14 | `schools-homes-near` | VISUAL-ONLY-CHANGE | `SchoolSelectedPanel` with 3/5/10 km chips + radius circle + homes-near grid all exist (`radiusKm` URL state). Plum dashed-circle styling is the delta. | [02](02-production-baseline-audit.md) §A.10, §B.9 |
| 15 | `agri-city-default` | VISUAL-ONLY-CHANGE | Agri journey exists; needs 4 outbound direction cards + evergreen accent re-skin. | [02](02-production-baseline-audit.md) §A.11, §B.10 |
| 16 | `agri-area-origin` | NEEDS-REFACTOR | Design treats the selected area as an ORIGIN (bearing/distance recomputed, breadcrumb must not imply containment). Confirmed **already correct** in the frozen export's own hash-based rendering (§01 Phase 2) — production needs to verify/rebuild this exact non-containment semantic, not assume it falls out of existing code. | [01](01-frozen-design-audit.md) Phase 2; [02](02-production-baseline-audit.md) §A.11 |
| 17 | `agri-corridor-towns` | MISSING-BACKEND (partial) | The sector wedge exists (`SectorOverlay` + `buildSectorPolygon`); cumulative concentric arcs are only PARTIAL (single outer arc today). The Town/Destination step has **no backing entity** — only raw parcels + manually-seeded direction-label strings. | [02](02-production-baseline-audit.md) §B.10, §C.4 |
| 18 | `agri-town-parcels` | NEEDS-REFACTOR | `AgriListingPanel`'s parcel peek + agri filters exist, but hang off raw parcel listings, not a real Town entity — the town→parcels hierarchy shown in the design is synthetic until §C.4 is resolved. | [02](02-production-baseline-audit.md) §A.11, §C.4 |
| 19 | `areas-city-default-mobile` | MISSING-FRONTEND | Only a hard `lg=1024px` breakpoint exists; mobile map is a fixed `h-64`. Design wants a `≤820px` proportional `~42%`-height stacking sheet with a grab handle. | [02](02-production-baseline-audit.md) §A.16 |
| 20 | `areas-area-listings-mobile` | MISSING-FRONTEND | Same `≤820px` stacking-sheet gap, plus the single-column (`<560px`) grid collapse — not built today. | [02](02-production-baseline-audit.md) §A.16 |

## Part B — Cross-cutting capabilities

| Capability | Classification | Why | Evidence |
|---|---|---|---|
| Mode selector (Areas/Schools/Agri) | VISUAL-ONLY-CHANGE | Three journeys already wired via `journey=` URL state + `JourneySwitcher`. | [02](02-production-baseline-audit.md) §A.10-11 |
| Global control bar (as a unit) | NEEDS-REFACTOR | City switch + buy/rent + area-jump must unify into one bar distinct from in-page property-search; today these are separate widgets with no unifying autocomplete. | [02](02-production-baseline-audit.md) §A.9 |
| Global cross-scope autocomplete | MISSING-FRONTEND | No global, mode-aware autocomplete exists — only a per-city substring filter. | [02](02-production-baseline-audit.md) §A.9 |
| Breadcrumb (only existing levels) | NEEDS-REFACTOR | Must render the generated-cluster level (once it exists) and the agri "Origin:" framing without implying containment — depends on the cluster tier (missing) and the agri origin semantics (needs verification). | [02](02-production-baseline-audit.md) §C.10; row 16 above |
| Buy/Rent toggle | ALREADY-BUILT | Already in URL state + filters. | [02](02-production-baseline-audit.md) §A.7 |
| Area drill-down with cluster level | MISSING-BACKEND | Drill-down itself exists; the intermediate cluster tier does not. | [02](02-production-baseline-audit.md) §C.10 |
| Area results + filters + property-search | VISUAL-ONLY-CHANGE | Logic and hooks are already present. | [02](02-production-baseline-audit.md) §A.6-8 |
| Schools journey including radius search | VISUAL-ONLY-CHANGE | Fully exists end-to-end, including 3/5/10 km radius. | [02](02-production-baseline-audit.md) §A.10, §B.9, §C.3 |
| Agri journey including distance bands + sector | NEEDS-REFACTOR + MISSING-BACKEND | Sector wedge exists; cumulative arcs are partial; the Town entity and origin semantics need work. | [02](02-production-baseline-audit.md) §B.10, §C.4 |
| Listing cards | VISUAL-ONLY-CHANGE | Cards render correctly with trust badges (`verified`/`trusted`/`listed` — a prior "D/null" memory item is stale/fixed) and anon price-band coarsening. | [02](02-production-baseline-audit.md) §A.12, §B.8 |
| Favourites / save | ALREADY-BUILT | Heart icon, optimistic mutate, anon → auth-modal all fully wired. | [02](02-production-baseline-audit.md) §A.13 |
| Listing-detail navigation | ALREADY-BUILT (narrow edge risk) | Plain `navigate()` push to `/listing/:id`; Back-survival **confirmed at runtime** against live data — full panel/breadcrumb/filters/viewport rehydrate correctly on Back. One theoretical edge case remains unhit: a debounced-replace viewport write could in principle drop an in-flight pan at the navigation instant. The detail page itself is DESIGN-NOT-SPECIFIED. | [02](02-production-baseline-audit.md) §A.14; manifest |
| Map/panel bidirectional sync | ALREADY-BUILT | Hover/focus/select sync confirmed end-to-end. | [02](02-production-baseline-audit.md) §B.7 |
| Responsive stacking (`≤820px`) | MISSING-FRONTEND | Only a `1024px` hard breakpoint exists today; mobile map is a fixed `h-64`. | [02](02-production-baseline-audit.md) §A.16 |
| Design tokens / mode accents | VISUAL-ONLY-CHANGE | The ReTrends HSL CSS-var system already uses copper/plum/evergreen per mode — already close to the target token language. | [02](02-production-baseline-audit.md) §A.18 |
| Loading/skeleton states | DESIGN-NOT-SPECIFIED | Listed in the manifest's `undesignedStates`. | [01](01-frozen-design-audit.md) Phase 1 |
| Hard-error screens | DESIGN-NOT-SPECIFIED | Listed in the manifest's `undesignedStates`. | [01](01-frozen-design-audit.md) Phase 1 |
| Deep-link-to-unavailable-data fallback | DESIGN-NOT-SPECIFIED | Manifest suggests "fall back to nearest ancestor" as intent, but this is not a confirmed product decision. | [01](01-frozen-design-audit.md) Phase 1 |
| Map-tile failure while panel data is OK | DESIGN-NOT-SPECIFIED | Listed in the manifest's `undesignedStates`. | [01](01-frozen-design-audit.md) Phase 1 |
| Accessibility affordances | MISSING-FRONTEND (tooling) | No a11y test tooling exists in the repo at all; the design specifies the *intent* (role=tablist, aria-selected, focus rings) but nothing enforces it automatically. | [04](04-testing-quality-gates.md) |
| Visual-regression tooling | MISSING-FRONTEND (tooling) | No visual-regression harness exists; the design export's own `data-design-component` hooks (which such a harness would anchor to) don't exist in code either. | [01](01-frozen-design-audit.md) Phase 1; [04](04-testing-quality-gates.md) |
| Hierarchy loading/caching (application-level navigation-graph cache) | MISSING-BACKEND | Approved architecture (2026-07-21): eager startup preload of promoted per-city navigation graphs, readiness gating, promotion-event + poll refresh with atomic pointer swap, revision-keyed Caffeine cache, separated short-TTL dynamic-count cache. Only one revision-unaware Caffeine cache (`CachingDiscoverSummaryService`) and zero promotion-event infrastructure exist today (confirmed by direct code read). Scoped inside Areas PR A. | [06](06-target-architecture-and-pr-plan.md) Feature 3 "Hierarchy loading & caching architecture" |

## Part C — Top 10 riskiest gaps (ranked by blast radius × uncertainty)

1. **Dual region model** (`area_groups` vs. `city_regions`) — production renders from the legacy
   flat model (no Centre); the new model is empty until a per-city onboarding job runs. This
   touches the read path for every single Areas-journey state. **Top backend blocker.**
2. **Recursive directional-cluster generation service** — 100% net-new backend (no table, no
   generator, and no existing tree/hierarchy pattern anywhere in this codebase to extend, confirmed
   by direct schema search); states #2 and #4 and the breadcrumb all depend on it; #1951 is only a
   design charter (and describes a flat one-level model, not the now-approved recursive one).
   Uncertain also on the "cluster total = sum of unique descendant areas" invariant (a historical
   double-count bug is concrete evidence of real risk here) — now compounded by recursion, since a
   cluster's count must not double-count areas reachable through more than one sub-cluster path.
   See [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full recursive model, chosen
   over closure-table/materialized-path alternatives, and its invariant set.
3. **Agricultural Town/Destination entity** — the design's town-results step has nothing to query
   against; a new entity design is required, not just a migration. High blast radius on states
   #17/#18.
4. **Agricultural origin-vs-container semantics** — area-as-origin bearing/distance recompute and
   the non-containment breadcrumb framing is a genuine behavioural rework, easy to get subtly
   wrong even though the frozen design's *own* export gets it right.
5. **Global cross-scope autocomplete** — genuinely absent today; couples city-switching, mode-aware
   result resolution, and canonical-state routing all in one new component. Central to the shell's
   information architecture.
6. **`≤820px` responsive stacking sheet** — a fully net-new mobile surface (proportional map band +
   grab-handle sheet + single-column grid collapse); no current owner or partial implementation to
   build from.
7. **Listing-detail Back-survival edge case** — confirmed working at runtime for the normal case;
   the narrow debounced-replace viewport race (an in-flight pan lost on Back) remains theoretical
   and unhit, but should get an explicit regression test during the rewrite since state ownership
   in this area is being touched. **Incidental, out-of-scope flag from the same live check:** the
   telemetry consent banner reappeared after a full navigation round-trip (Decline didn't visibly
   persist) — worth a separate look, unrelated to Discover V2.
8. **Cumulative concentric distance-band arcs** — only a single outer arc renders today; multi-ring
   cumulative-band geometry is easy to get subtly wrong (off-by-one band, wrong fill opacity per
   ring).
9. **`macroRegionResolver.ts` legacy client-side aggregation** — flagged for deletion (violates
   single-source-of-truth); a naive reskin that leaves this file in place would silently
   re-introduce a divergent data path alongside the new backend region model.
10. **No visual-regression or accessibility tooling, and the design's own `data-design-component`
    hooks don't exist to anchor one** — there is currently no automated way to prove visual
    parity was achieved and held; every state must be manually verified, which raises the risk of
    silent drift across a multi-PR rollout.

## Part D — Quick wins (high design-fidelity payoff, low effort)

- **Schools journey re-skin** (states #10–#14) — the full backend, API, and frontend logic
  including radius search already exist; the plum accent is already a design token. This is
  **pure presentation work** — see [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md)
  for why this should be the first PR slice shipped.
- **Area results / filters / property-search re-skin** (states #4–#6) — hooks and filtered
  markers already exist; only chip/header/empty-state styling is needed.
- **Trust badges + anon price-band pins** — already functionally correct; only card styling needs
  to conform (the "D/null" memory item is stale and can be retired).
- **Favourites** — fully wired already; only heart-icon styling needs to change.
- **Map/panel hover-focus-select sync** — already end-to-end; only marker restyling is needed.
- **Mode selector + Buy/Rent toggle** — URL state and journeys already exist; re-skin to the mode
  cards with the check-badge selection pattern confirmed in [01](01-frozen-design-audit.md).
- **City switcher "Soon" states** — `CitySelect` already exists; just add the disabled
  Mumbai/Pune/Hyderabad entries + the live-Bangalore check mark.
- **Design tokens** — the copper/plum/evergreen accent system is already present; this needs
  reconciliation, not invention.

## Two important framing corrections for planning

1. **The manifest is 20 states, not 22.** Use 20 in all sequencing/estimation work.
2. **Areas is not the pure "obvious quick win" it looks like.** Its shallow-region states (#3, #7)
   and its listing/filter states (#4–#6) are genuinely visual-only, but its city-landing state
   (#1) and its dense-region states (#2) cannot honestly reach parity until the dual-region-model
   decision is made and the cluster-generation service is built. **Schools is the safest first
   vertical to ship at full design parity, because its entire backend and frontend stack already
   exists with no open architectural questions.**
