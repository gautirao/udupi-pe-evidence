# Issue #1824 — Architecture Review (Phase 0.7)

Author: `mode3-orchestrator` (Stage A), consolidating `explorer-planner` (factual inventory) + `architect` (design review). Read-only; no production code changed.

Baseline: `src/pages/MapDiscovery.tsx` @ `e79526df`, 4221 lines. Companion: `baseline-metrics.md`, `first-slice-decision.md`.

---

## 1. Responsibility inventory (12 responsibilities → line ranges)

| # | Responsibility | Primary line ranges | Current owner | Correctness sensitivity |
|---|---|---|---|---|
| R1 | URL state read/write (canonical) | L691 `useDiscoverUrlState`, urlActions throughout | hook | **Critical** — central URL ownership invariant |
| R2 | Page-local mirror state (area/filters/city/zoom) | L1339–1349 `useDiscoverPageState` | hook | High — local mirrors of URL/query |
| R3 | Marker/listing server queries + camera intent | L1527 `useDiscoverMapData` | hook | **Critical** — camera-owner invariant (#1806/#1801) |
| R4 | Anon property/school filtering (pure) | L1–687 helpers + callers | module (done) | High — coordinate privacy, parity |
| R5 | Filter/search slice (#1666 candidate) | L1081–1082, L1318–1337, L1959–2006, L2637–2698 | inline | **High** — badge truthfulness + split-brain |
| R6 | Badge derivation | L1955–2006 `deriveDiscoverBadge` | helper + inline memo | **Critical** — badge truthfulness |
| R7 | Marker-selection resolution (journey/zoom/auth branch) | L3271–3364 `currentMapMarkerListings` IIFE | inline IIFE | **Critical** — #1806 surface; 3-tier school-radius fallback L3305–3320 |
| R8 | Marker click → panel/URL routing | L1086–1119+ `handleSelectMarkerListing`, `selectedMarkerListing`, `markerPixelPos` | inline | High — panel scope agreement |
| R9 | Camera panners / restore ticks | schoolFocusTick, schoolMarkerFocusTick, areaRestoreTick, cityRestoreTick + effects | inline effects | **Critical** — camera owner, ordering |
| R10 | Journey transition orchestration (area/school/agri) | scattered effects w/ exhaustive-deps suppressions | inline | High — journey behaviour |
| R11 | Ephemeral interaction/emphasis state | hover/highlight/region-guide/reduced-motion/area-search cluster | inline useState | **Low** — local re-render only |
| R12 | Presentation composition (panels, chips, map wiring, JSX) | L2007–L4221 render tree | inline | Medium |

## 2. State-ownership matrix

Classification: {URL | server | ephemeral | derived}. **Bold = local mirror of authoritative state.**

| State / ref / derived | Class | Current owner | Target owner/module | Notes |
|---|---|---|---|---|
| `urlState.*` (journey, region, q, filters, schoolId…) | URL | `useDiscoverUrlState` (L691) | keep | Canonical; sole URL writer |
| **`searchQuery` (L1081)** | **ephemeral mirror of URL `q`** | inline | `filters/useDiscoverSearchState` (S4) | Synced from URL L1318–1324 |
| **`debouncedSearch` (L1082)** | **derived (debounce of mirror)** | inline | S4 | Feeds badge L1987 + queries; **race on unmount** L1326–1329 |
| `filters` (L1340) | **mirror of URL filters** | `useDiscoverPageState` | keep | board/category bypass → lag L2644–2651 |
| `selectedArea`, `panToArea`, `city`, `mapZoom` | mirror/local | `useDiscoverPageState` | keep | Local mirrors + camera-driver |
| `markerListings`, `areaMarkerListings`, `schoolRadiusFallbackMarkers`, `groupResultsMarkers`, `cityTotal` | server | `useDiscoverMapData` | keep | Backend-owned counts invariant |
| `cameraIntent` + publishers | derived→effect | `useDiscoverMapData` | keep | **Camera owner. No fitBounds in page.** |
| `hoveredListingId` | ephemeral | inline | **`state/useDiscoverInteractionState` (SLICE 1)** | Pure emphasis; mouseleave/blur reset |
| `hoveredAreaKeyForMap` | ephemeral | inline | **SLICE 1** | Explicitly mirrors hoveredListingId |
| `highlightedAreaKeys` | ephemeral | inline | **SLICE 1 (journey-reset characterised)** | Resets on journey switch |
| `markerPixelPos` (L1092) | ephemeral **coupled** | inline | later (with R8, S5) | Set in `handleSelectMarkerListing` |
| `selectedMarkerListing` (L1086) | ephemeral **coupled** | inline | later (R7/R8, S5) | Drives agri panel routing |
| `prefersReducedMotion` | ephemeral (media-query) | inline | own tiny hook (S2) | Not cohesive with hover |
| `regionSelectSource/Nonce`, `regionGuideDismissed` | ephemeral (transient guide) | inline | own slice (S2) | Guide concern |
| `areaSearchQuery`, `debouncedAreaSearchQuery` | ephemeral (local search) | inline | own slice (S2) | Local list-filter search |
| `discoverBadge` (L1961) | derived | inline memo | `journeys/*` or derive (S4) | Reads debouncedSearch |
| `activeContextChips` (L2637) | derived (JSX) | inline memo | later | Reads URL `q` (not debounced) |
| `currentMapMarkerListings` (L3271) | derived (IIFE) | inline | `map/resolveMarkerListings` (S3) | #1806 surface |

**Split-brain flag (material):** the search keyword exists as URL `q`, local `searchQuery`, and derived `debouncedSearch`, consumed inconsistently — **badge uses `debouncedSearch`; activeContextChips uses `urlState.q`; queries use `debouncedSearch`**. Unifying these is a behaviour change, which is why the #1666 filter/search slice is NOT a safe behaviour-preserving first slice (see first-slice-decision.md).

## 3. Dependency / effect graph

**Canonical steady-state flow:**
```
URL (useDiscoverUrlState)
  → useDiscoverPageState mirrors (selectedArea/filters/city/zoom)
  → useDiscoverMapData queries (markers/listings/counts)
      → derived (currentMapMarkerListings IIFE, discoverBadge)
      → cameraIntent publishers → camera effects (ticks) → map
      → panel content routing
```

**Search sub-graph (the #1666 tangle):**
```
handleSearchChange (L1331) ─writes→ setSearchQuery (local) ─debounce(250ms)→ debouncedSearch
                           └writes→ urlActions.setSearchQuery → URL q
URL q ─(back/fwd)→ effect L1318 → setSearchQuery            (reverse sync)
debouncedSearch → discoverBadge (L1987)  AND  useDiscoverMapData queries
urlState.q → activeContextChips (L2640)   ← DIFFERENT source than badge
```

**Load-bearing effect ordering:** camera restore ticks (area/city/school/schoolMarker) must fire *after* the corresponding query settles and *after* the mirror is set; reordering risks blank-map flashes (#1118/#1806 rationale embedded in the IIFE). The debounce cleanup (L1328) is the unmount race window.

Suppression essentiality table: see `baseline-metrics.md`. None are gratuitous; each encodes an identity-stability decision. Slices carry suppression + comment verbatim.

## 4. Module boundary proposal + extraction roadmap

Target tree (from #1824): `src/features/discover/{pages,orchestration,state,journeys/{area,school,agri},data,map,filters,components}`.

Dependency-ordered slices — small, reviewable, each behaviour-preserving:

| Slice | #1824 Phase | Responsibility extracted | ~Lines | Target module | Invariants protected | Risk | Ordering rationale |
|---|---|---|---|---|---|---|---|
| **S1** | 1 | **Ephemeral hover/emphasis cluster (R11 subset)** | ~50–70 | `state/useDiscoverInteractionState.ts` | none behavioural (pure emphasis) | **Very Low** | Establishes folder + typed-API seam at near-zero risk |
| S2 | 1 | Remaining ephemeral: reduced-motion; region-guide; area-search (3 separate PRs) | ~90 | `state/useReducedMotion`, `state/useRegionGuideState`, `filters/useAreaSearchState` | local-only | Low | Additive, same pattern as S1 |
| S3 | 2 | Marker-listing resolution IIFE (R7) → pure selector | ~95 | `map/resolveMarkerListings.ts` (pure, unit-testable) | #1806, coord privacy, backend counts | **Med-High** | Highest-value seam; after pattern proven, before search |
| S4 | 3 | Filter/search slice (R5/R6) incl. split-brain decision | ~140 | `filters/useDiscoverSearchState` + `filters/deriveBadgeInputs` | badge truthfulness | **High** | Deferred until S3 characterisation tests exist |
| S5 | 4 | Marker-click/panel routing (R8) | ~120 | `orchestration/useMarkerSelection` | panel/map scope agreement | High | Depends on S3 selector |
| S6 | 5 | Journey transition effects (R10) per journey | ~200 (3 PRs) | `journeys/{area,school,agri}` | journey behaviour, camera ordering | High | Largest; needs all seams first |
| S7 | 6 | Camera panner/tick orchestration (R9) | ~120 | `orchestration/useCameraOrchestration` | camera owner (#1801/#1806) | High | Consolidate after journeys |
| S8 | 7 | Presentation extraction; MapDiscovery → composition root | remainder → <800 | `pages/MapDiscovery.tsx` thin | all | Med | Final assembly |

This is a roadmap, not a single-PR mandate. Only Slice 1 is scoped-and-planned here; each subsequent slice re-enters Phase 0.7 for its own architecture check + PLAN_REVIEW.

## 5. ADR — reducer vs composed hooks vs state machine

**Chosen:** composed custom hooks as the primary mechanism, with a **co-located `useReducer` permitted only inside a single hook** where a cluster has ≥3 interdependent atomic transitions. **Rejected:** new global store (Redux/Zustand) and XState. **No new-dependency ADR required** — React `useState`/`useReducer`/custom hooks are demonstrably sufficient (the page already uses this successfully in `useDiscoverUrlState`/`useDiscoverPageState`/`useDiscoverMapData`).

Justification tied to the constraint: state is already cleanly tiered (URL / server / ephemeral). A global store would duplicate URL-as-source-of-truth and violate the central-URL invariant — a correctness regression, not just added deps. Xstate would create a second authority competing with the URL.

Ephemeral cluster: for Slice 1 (hover pair + highlightedAreaKeys) `useState` suffices — transitions are independent. A co-located `useReducer` is justified only later if the marker-selection slice (S5) folds in `markerPixelPos` + `selectedMarkerListing` with atomic multi-field "select marker" transitions.

> **Tradeoff record.** Chosen: composed hooks + optional co-located reducer. Rejected: global store (duplicates URL authority). Deferred: co-located reducer until S5 shows atomic multi-field transitions. Main risk: hook proliferation → mitigated by the fixed `features/discover/*` tree + `ControllerResult<TView,TCommands>` convention.

## 6. First-slice decision — OVERRIDE #1666

See `first-slice-decision.md` for the full evidence-based decision and exact slice scope. Summary: #1666 (filter/search) is rejected as the FIRST slice because it touches the badge (a Critical correctness surface) and forces a split-brain unification that is inherently a behaviour change. Slice 1 is instead the pure ephemeral hover/emphasis cluster → `useDiscoverInteractionState` (Very Low risk), which establishes the folder + typed-API convention every later slice reuses. #1666 is not cancelled — it is reordered to Slice S4 with a de-risking sub-plan.

## 7. Programme-level completion criteria

- `MapDiscovery.tsx` ≤ **800 lines** (architect target) by S8, with any exception explicitly justified.
- Local static-analysis cognitive/cyclomatic complexity of the page's top-level function reduced to a maintainable band; no new critical/blocker smells.
- Each slice a self-contained revertible PR reporting before/after line count + Sonar/static delta + invariants protected.
- Zero net change in URL round-trip, deep-link restore, journey behaviour, badge truthfulness, camera-owner behaviour, and map/panel scope agreement across the whole programme.

## 8. Invariants (programme-wide, must never break)

URL round-trip · deep-link/back-forward/refresh restore · area/school/agri/journeyless behaviour · badge truthfulness (backend-owned counts) · camera-owner invariant (no direct fitBounds/flyTo in presentation) · map/panel scope agreement · marker eligibility/priority · auth-vs-anon parity + coordinate privacy · no camera jitter/loops · query volume + endpoint contracts unchanged.

## Open questions (architecture-material, non-blocking for Slice 1)

1. Does the eslint-disable at **L922** govern the hover/highlight cluster or an adjacent effect? Determines whether it moves with Slice 1 or stays. Resolve by reading L910–935 at implementation. Safe default: leave in place if it governs an unrelated effect.
2. Is `highlightedAreaKeys`' journey-reset wired via an effect or a direct call in a journey handler? Decides whether the reset trigger stays in the page (calling the new `clearHighlightedAreas` command) or moves in a later journey slice. Slice 1 default: **leave the reset trigger in the page; move only the state.**
