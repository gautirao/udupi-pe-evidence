# Issue #1824 — Slice S3 Design (marker-listing resolution IIFE → pure selector)

Phase 0.7 for S3 (Med-High risk — the highest-value seam, the #1806 correctness surface). Baseline `origin/main @ 53f4c736` (S1/S2a/S2b/S2c merged). Branch `issue-1824-s3-marker-resolution`. Read-only: explorer-planner factual inventory + architect design. No production code changed.

## The IIFE
`currentMapMarkerListings` at `MapDiscovery.tsx` **L3244-3337** (~93 lines): a `const = (() => { … })()` returning a marker array (`MarkerListing[]`). GENUINELY PURE — no setState/useEffect/ref-mutation/hook-call inside; no camera-intent call. Consumers: `PropertyMap.listings` (L3407) + `markerPopoverStepper` (L3348, uses `.id`/`findIndex`).

## Inputs — 14 (architect corrected explorer-planner's 13; +isAuthenticated)
All plain values, computed by hooks/useMemo/state that STAY in the page:
1. `mapLayerCategory` (L2784, layer union — suppresses markers at grouped/landing)
2. `selectedArea`
3. `isGroupResultsState` (L823 = panelContent==='area-group-results')
4. `mapZoom`
5. **`isAuthenticated`** (L3336 — the branch explorer-planner MISSED; `return isAuthenticated ? markerListings : []`; omission = silent scope leak)
6. `journey` (urlState.journey)
7. `schoolId` (urlState.schoolId)
8. `groupResultsMarkers`
9. `markerListings`
10. `areaMarkerListings`
11. `schoolRadiusFallbackMarkers` (computed L3842-3848 OUTSIDE the IIFE — STAYS in page, the purity linchpin)
12. `isLoadingAreaListings`
13. `isErrorAreaListings`
14. `markersLoading`
Plus the threshold `AREA_LAYER_MAX_ZOOM` (=12) — see the boundary note below.

## Pure-selector contract
Module: `src/features/discover/map/resolveMarkerListings.ts` (S1-S2c `src/features/discover/` convention; NOT a generic utils dumping ground — domain-specific #1806 scoping logic).
```ts
export interface ResolveMarkerListingsInput { /* all 14 fields REQUIRED (non-optional) */ }
export function resolveMarkerListings(input: ResolveMarkerListingsInput): MarkerListing[];
```
- **Required (non-optional) fields** → a dropped input is a **tsc error at the call site**, a compile-time guard against the exact silent-leak failure mode.
- Reuse the EXISTING marker element type (import it; do NOT invent a new type — keeps PropertyMap.listings + stepper compiling unchanged).
- Plain exported function, zero React.

### Transposition rules (verbatim — load-bearing)
1. Branch order is load-bearing (7 guards, top-to-bottom early `return`). `mapLayerCategory` suppression first; `isGroupResultsState` group-scope guard (L3267) BEFORE both journey branches (L3262-3264 comment: prevents city-wide leak). Do not reorder.
2. Preserve `<=` (not `<`) and exact operator precedence in the L3261 compound.
3. Transpose the FIX-2 nested ternaries character-for-character (the settled/empty/error short-circuit order encodes the distinction). Do NOT simplify to if/else with different evaluation order.
4. Preserve tier short-circuits (L3278/3286/3290) in strict Tier1→Tier2→Tier3 order incl. the Tier3 compound gate.
5. **Return source array references verbatim** — never `.slice()`/`.map()`/spread. Reference identity feeds React memo/render + `markerPopoverStepper.findIndex`. Tests assert `toBe` (reference equality), not just `toEqual`.

### AREA_LAYER_MAX_ZOOM boundary note (avoid #1823 entanglement)
The IIFE references `AREA_LAYER_MAX_ZOOM` directly (in scope). When moved to the pure function it is no longer in scope. To introduce NO new duplicated literal (#1823 is an OPEN issue about centralizing this exact constant — S3 must NOT do #1823's work):
- If `AREA_LAYER_MAX_ZOOM` already has a shared/exported canonical source that MapDiscovery imports → the selector imports from that SAME source.
- Else (MapDiscovery-local const) → pass it as a 15th REQUIRED input field `areaLayerMaxZoom: number` (page passes AREA_LAYER_MAX_ZOOM). This keeps the selector pure and creates NO new constant literal / no centralization work.
Engineer picks per what exists; either way: NO new duplicated `12` literal.

## What moves vs stays
- MOVES: the IIFE body (L3245-3336), comments included (they are the #1806/#1261/#1597 safety record).
- STAYS (untouched): every input-producing hook/useMemo/state; **schoolRadiusFallbackMarkers computation (L3842-3848)**; `markerPopoverStepper` (L3348); `PropertyMap` (L3407).
- Call site (replaces L3244-3337): `const currentMapMarkerListings = resolveMarkerListings({ …14 fields… });`

## Invariant-preservation test matrix (~16 cases; the safety proof)
Each `return` in the tree gets ≥1 unit assertion; leak-source arrays are passed-in-but-asserted-NOT-returned (unit-level mirror of the CITY_MARKER_ID integration guard). Reference-identity (`toBe`) where a source array is expected; `toEqual([])` for empty.

| Invariant | Source | Test (input → expected) |
|---|---|---|
| Layer suppression | L3255-3260 | each suppress category → `[]` |
| Zoom/landing suppression | L3261 | no area, not group, zoom=12 → `[]` |
| **FIX-1 group-scope** | L3267 | isGroupResultsState + groupResultsMarkers=G + markerListings=CITY → **===G** (never CITY); G=[] → `[]` (no fallthrough) |
| School Tier 1 | L3278 | school-first + markerListings=M(≥1) → **===M** |
| School Tier 2 | L3286 | markerListings=[], schoolRadiusFallbackMarkers=R(≥1) → **===R** |
| School Tier 3 | L3290-3291 | M=[],R=[],markersLoading,selectedArea,areaMarkerListings=AM(≥1) → **===AM**; markersLoading=false → `[]` |
| School exhausted | L3293 | all empty/gate false → `[]` |
| School+area no schoolId | L3298-3306 | loading→`[]`; AM≥1→===AM; empty+error→===markerListings; empty+no-error→`[]` |
| **FIX-2a empty-area no city fallback** | L3329-3333 | selectedArea, settled, AM=[], no error, markerListings=CITY → **`[]`** (the core #1806 bug) |
| **FIX-2b error → fallback** | L3333 | same but isErrorAreaListings=true → **===markerListings** |
| Area loading | L3329-3330 | selectedArea, loading, AM≥1 → `[]` |
| No area authed | L3336 | no area, zoom=13, isAuthenticated, markerListings=M → **===M** |
| No area anon | L3336 | same, isAuthenticated=false → `[]` |

The existing INTEGRATION tests must stay green UNCHANGED: `MapDiscovery.issue1806.groupScope.test.tsx` (T1 L301-324, FIX-2 L414-434), `issue1798.markerPopup`, `groupResults`, `school-deep-link`. **If any needs editing to pass, that is a BLOCKING behaviour-change signal — STOP, do not adjust the test.**

## Decomposition decision — ONE PR, do NOT sub-split
Decisive (architect): single pure-selector extraction; reject the 3a/3b split. Rationale: (1) pure logic transposition → no behavioural blast radius to de-risk; (2) the #1806 property is RELATIONAL (ordering guards must be reviewed together in one diff) — a 3a school-tier cut would fragment the ordering invariant across two PRs, RAISING silent-leak risk; (3) fully unit-testable in one shot; (4) a Med-High correctness gate wants the whole transposed tree side-by-side with the original in one diff (strongest "verbatim move" argument); (5) ~93 lines — one reviewable PR. Defer extracting the school-tier resolver until a real second consumer exists (none today).

## Risk mitigations (explorer-planner's 5 flags)
(a) schoolRadiusFallbackMarkers stays computed in the page (passed in) — selector imports no hook; reviewer greps the module for `use`/raw-source → must be absent. (b) reuse the existing MapLayerCategory type; suppression literals each unit-asserted. (c) selector does NOT interpret isErrorAreaListings — consumes the boolean as-is; both FIX-2a/2b pinned as distinct rows. (d) required fields → dropped input = tsc error; ≥1 assertion per return. (e) return references verbatim; `toBe` assertions catch any accidental copy.

## 7A recommendation — SKIP (proof-substitution), honest
Two independent reasons, either sufficient: (1) pure behaviour-preserving transposition fully covered by the ~16-case unit matrix + the unchanged #1806 integration suite — a live browser adds no assertion these don't make. (2) The dev env has NO city with seeded area data (Bangalore + Udupi both "No areas found") — a live 7A on an empty map cannot render/bucket markers; it would be an assertion-free green screen (disallowed per the "assertion-free E2E passes as proof" standard). Analogous to the accepted "Phase 7A backend = Testcontainers equivalent" precedent: when the live gate is un-runnable AND deterministic tests fully cover the surface, the deterministic evidence is authoritative. Orchestrator proposes SKIP; PLAN_REVIEW decides. If PLAN_REVIEW insists on live, the honest answer is it cannot run until area data is seeded (out of S3 scope).

## Completion criteria
New module exports resolveMarkerListings + input type, imports zero React (grep-verifiable); call site replaced, IIFE removed, all 14 fields passed, consumers unchanged; tsc no new errors vs 53f4c736; new unit matrix green (reference-identity assertions, exit 0); #1806 + related integration tests green UNCHANGED via batched runner (any needed edit = BLOCKING); build exit 0; lint no new; side-by-side IIFE-vs-function verbatim-move annotation for the reviewer.
