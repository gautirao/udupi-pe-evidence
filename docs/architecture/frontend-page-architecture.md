# Frontend Page Architecture

Established by issue #2142 (`MapDiscovery.tsx` thin composition root refactor). This document describes the layered pattern that resulted, using `/discover` as the reference implementation, and sets the default shape for future non-trivial pages in this codebase.

> Revised after the owner's BLOCKING review of PR #2146. The first revision of this document defended a 2256-LOC outcome as an accepted variance; §8 now records why that reasoning was wrong and what the full decomposition actually produced.

## 1. Problem

`src/pages/MapDiscovery.tsx` had grown to 2916 LOC (verified baseline, Commit 1) by accumulating every concern the `/discover` route needed directly in the page component: ~15 separate pieces of business logic (URL-state derivation, camera orchestration, marker selection, school search, agri filtering, region guidance, mobile shell presentation, badge copy, etc.), and ~200 flat inline props spread across 5 separate JSX render call sites for the map, right panel, and overlay layers. This made the file hard to navigate, hard to test in isolation, and structurally risky to touch — any change anywhere in the file could plausibly interact with camera framing, marker popover state, or URL writes owned elsewhere in the same 2900-line function body.

No architectural pattern existed for decomposing a page this size without turning it into either a god-hook (one `usePageState()` that owns everything, equally opaque) or a god-view-model (one `buildPageProps()` that flattens everything into an even bigger prop bag one level down). Issue #2142 exists to establish and prove out a pattern that avoids both failure modes.

## 2. Goals and non-goals

**Goals:**
- Decompose the page into named, independently testable units, each with a narrow, typed responsibility.
- Preserve 100% of existing behavior — this is a pure refactor. Zero product/URL/API/visual change (see §9, Invariants).
- Establish the pattern as the default for future pages of comparable complexity, not a one-off for `/discover`.

**Non-goals:**
- Hitting an arbitrary LOC target for its own sake. What matters is that every remaining line in the page is route/context bootstrap, composition, or rendering — see §8. (An earlier revision of this document argued that 2256 LOC was an accepted variance; that framing was WITHDRAWN under owner review and the argument it made is corrected in §8.)
- Introducing a new state-management library or a second React context for `/discover` (`DiscoverContext` remains the sole facade).
- Fixing any real product bug discovered along the way — those are filed as separate issues (e.g. #2145, the anon-marker adapter differential-test finding from Commit 2).

## 3. The four layers

The pattern has four layers, each in its own directory under `src/features/discover/`, plus the page itself as a fifth, thin composition layer:

| Layer | Directory | Responsibility | Shape |
|---|---|---|---|
| Selectors | `selectors/` | Pure derivation from existing data — no hooks, no side effects | `(input) => output` |
| Adapters | `adapters/` | Pure translation between two data shapes (e.g. building a query-param object, mapping an anon response to marker shape) | `(input) => output` |
| Controllers | `controllers/` | Stateful capability units — compose existing hooks/queries into one named result object | `useXController(params) => result` |
| Surfaces | `surfaces/` | Typed view/commands contracts + the components that consume them | `buildXSurfaceView(params) => view`, `<XSurface view commands />` |
| Page | `src/pages/*.tsx` | Composition root: calls controllers, builds surface props, renders the page shell | thin |

### 3.1 Selectors (`src/features/discover/selectors/`)

Pure functions with no hook calls and no side effects — same input always produces the same output. Colocated `.test.ts` per module, no shared "utils.ts" dumping ground. Example: `effectiveArea.ts`, `mapLayerCategory.ts`, `displayEligibility.ts`. A selector may be a genuine extraction (logic moved verbatim out of the page) or a thin re-export of an already-shared module elsewhere in the codebase — re-exports exist so callers have one canonical import path without physically relocating a module still used by other, unrelated call sites (documented per-file where this applies).

### 3.2 Adapters (`src/features/discover/adapters/`)

Pure functions that translate between two data shapes — typically an API response shape and a UI-consumable shape (`cityListingsQueryParams.ts`, `anonMarkerAdapter.ts`, `navigationCountsFilters.ts`). Same purity/testing bar as selectors. Adapters that look identical at a glance are not automatically merged — see §7 (R7) for the differential-testing discipline that governs when two adapters may be converged into one versus kept deliberately separate.

### 3.3 Controllers (`src/features/discover/controllers/`)

A controller is a hook that composes one or more existing hooks/queries into ONE named, typed result object, representing one coherent capability (`useDiscoverGeographyController`, `useDiscoverCameraController`, etc.). Rules:
- **Verbatim composition.** A controller wraps existing hooks unchanged — `git diff main --stat` on every wrapped hook must be empty. A controller is a *regrouping* of call sites, not a rewrite of the logic those call sites contain.
- **One named capability per controller**, not "whatever happened to be nearby in the old file", and not a target count. `/discover` ended up with 25 (23 controllers + 2 leaf hooks — `useBoundedSearchTrigger`, `useNearSchoolSheetState`), sized by the real dependency graph: PageContext, Navigation, AreaGroups, Agri, Results, BoundedBrowse, NearSchoolSheet, Marker, BoundedSearchTrigger, PageState, ViewportTracker, Geography, MapData, School, Badge, JourneyChrome, FilterChrome, Interaction, Camera, MapLayer, RegionGuide, OverviewNavigation, MarkerPopover, MobilePresentation, DebugBridge.
- **A controller that owns more than one capability is a smell even when it is short.** `/discover`'s first pass produced a 340-LOC `useDiscoverMapPresentationController` with a 57-field param list and a 39-field return, merging five unrelated concerns (hover/emphasis, camera policy, layer selection, region guidance, destination-click routing) behind one name. It was split five ways in the correction pass. Judge a controller by cohesion, ownership and dependency direction — not by line count.
- **Negative invariants are worth encoding.** `useDiscoverInteractionController` must NEVER reference a camera producer, and `useDiscoverCameraOrchestration` must have exactly ONE production importer. Both are enforced by a static guard (`controllers/__tests__/cameraOwnership.guard.test.ts`) rather than by review attention.
- **Call-site ordering is a load-bearing detail**, not incidental. A controller is called at the *latest* position among the hooks it consolidates when those hooks have real data dependencies on earlier controllers' outputs (e.g. `useDiscoverCameraController` needs `scopeNamespaces` from the Geography controller, so it is called after it; `useDiscoverRegionGuideController` needs `isRegionOverview` from the MapLayer controller, so it moved after that). Reordering a controller's call site relative to another can silently change render/query behavior — this is why `controllerOrdering.contract.test.ts` exists (§6).
- **No controller reaches for a new state-management library** or a second page-level context. `DiscoverContext` remains the sole cross-cutting facade; a controller composes hooks, it doesn't become one.
- A controller may deliberately *not* wrap something the original decomposition plan assigned to it, when doing so would relocate a wide, cross-cutting dependency (e.g. `resolveMarkerPopover`) with zero real simplification — document the deviation and why, same as any other judgment call in this layer.

### 3.4 Surfaces (`src/features/discover/surfaces/`)

A surface is the unit the page renders: a typed `{view, commands}` contract plus the component that consumes it.

- `buildXSurfaceModel(params) => XSurfaceView` and `buildXSurfaceCommands(params) => XSurfaceCommands` are pure functions. Each output group (`view.camera`, `view.layers`, `commands.navigation`, etc.) is a `Pick<>` off a controller-derived field set — so a field rename or removal upstream is a compile error here, not a silent runtime gap. Prop parity with the leaf component is proven by TypeScript at the `<LeafComponent {...} />` call site inside the surface, which is the real check; restating the leaf's field list in a second hand-written interface adds nothing.
- `<XSurface view commands />` is the component. It reconstructs the leaf component's original flat prop shape by spreading the grouped `view`/`commands` back together, then renders the leaf unchanged.
- **A surface's builder INPUT is the CONTROLLERS' OWN RESULT OBJECTS, never a hand-written flat interface.** `/discover` originally declared a 67-field `DiscoverRightPanelContainerProps` as the panel builder's input type, which meant the same field list existed three times — in that interface, in the composition root's object literal, and in the builders' re-grouping — with none of the three being the source of truth. That interface is deleted. Each builder now takes `Pick<ReturnType<typeof useXController>, ...>` slices, so a controller renaming an output is a compile error at the surface boundary, and the composition root passes ~20 references instead of transcribing ~67 fields.
- **Renames and derivations belong in the builder, not in the caller.** Anything shaped like `selectedArea: effectiveSelectedArea`, `regionScopedGroups: data?.groups`, `isBoundedBrowseState: a || b`, or a JSX conditional is presentation shaping — it goes in the builder. Keeping it out of the composition root is what lets that root stay free of conditionals (§3.5).
- Grouping deviations from an original plan/spec are expected and should be judged by real field usage, not forced to match a spec written before the real interfaces were read. `/discover`'s Panel surface commands groups (`routing`, `geography`) were added beyond the architect's original 6-group sketch because 6 of Panel's 25 `geography`-view fields are real callbacks with no other sound home — documented in `buildPanelSurfaceModel.ts`'s own doc comment.
- A DOM-position or stacking-context coupling between two visually-adjacent pieces can override an otherwise-clean UI-concern grouping. `/discover`'s mobile cluster sheet, listing-preview sheet, and recenter-button portal all live in `DiscoverMapSurface`'s `overlays` group (not `DiscoverOverlaySurface`, despite being conceptually "overlay chrome") because they must render inside the same `z-[60]` mobile-map wrapper the map canvas itself owns — see `buildMapSurfaceModel.tsx`'s doc comment for the full DOM-coupling rationale.

### 3.5 Page (composition root)

The composition layer is split in two, and the split is the point:

**`useDiscoverPageComposition()`** (`features/discover/composition/`) — a zero-argument hook that does exactly three things:
1. calls the controllers in dependency order,
2. applies the one route-level gate (unsupported city), returning a discriminated union,
3. joins controller outputs into the three surface contracts.

**The page component** — calls that hook, handles the `unsupported-city` branch, and renders `DiscoverPageShell` with the three surfaces. `MapDiscovery.tsx` is 59 lines.

The page owns NO state, NO effect, NO ref, NO query, NO derivation and no conditional beyond the route gate. Every one of those has a named controller owner.

**The composition hook must not become the new god component.** That is the obvious failure mode of this shape and it is guarded mechanically, not by convention — `composition/__tests__/compositionHookScope.guard.test.ts` asserts the hook has zero React hook primitives of its own, zero VALUE imports from `@/hooks/*`, exactly one `if` (the city gate), zero ternaries, a `.ts` extension (so TypeScript forbids JSX), and that every hook it calls is imported from `controllers/`. If a conditional or derivation wants to live there, it belongs in a controller (if it is a decision) or a surface builder (if it is presentation shaping).

## 4. Data flow

```
existing hooks/queries
        │
        ▼
   controllers (compose, do not rewrite)        ← every decision lives here
        │
        ▼
   useDiscoverPageComposition()                 ← wiring only; no logic
        │
        ▼
   buildXSurfaceModel() / buildXSurfaceCommands()  ← presentation shaping
        │
        ▼
   <XSurface view={...} commands={...} />
        │
        ▼
   unmodified leaf component (DiscoverMapCanvas, DiscoverRightPanel, ...)
```

Controllers never call a surface builder, and surfaces never call controllers — the composition hook is the only thing that sees both, and wiring is its entire job. The page sees only the composition hook's output.

## 5. `/discover`'s concrete decomposition (issue #2142)

- **9 selectors/adapters** (Commit 2): `effectiveArea`, `listingScope`, `mapLayerCategory`, `panelContent`, `badgeCopy`, `displayEligibility`, `anonMarkerAdapter`, `cityListingsQueryParams`, `navigationCountsFilters`.
- **25 controllers + leaf hooks (23 controllers + `useBoundedSearchTrigger` + `useNearSchoolSheetState`).** The first pass produced 8; the correction pass split the god-adjacent `useDiscoverMapPresentationController` five ways (Interaction / Camera / MapLayer / RegionGuide / OverviewNavigation) and added the controllers that own what was still page-resident: PageContext, AreaGroups, BoundedBrowse, PageState, MapData, Badge, JourneyChrome, FilterChrome, MarkerPopover, DebugBridge, plus the `useNearSchoolSheetState` leaf.
- **3 surfaces** (Commit 4): `DiscoverMapSurface` (renamed from `DiscoverMapMount`), `DiscoverPanelSurface` (renamed from `DiscoverRightPanelContainer`), `DiscoverOverlaySurface` (new — absorbs `DiscoverOverlaySheets`' outer chrome). `DiscoverMapMount.tsx`, `DiscoverRightPanelContainer.tsx`, and `DiscoverOverlaySheets.tsx` were deleted once `check_references` confirmed zero remaining real importers.
- **Page shell**: `DiscoverPageShell` — owns the `PublicDiscoverLayout` wrapper, the mobile-only `DiscoverControlBar` row, and the `z-[60]` mobile-Map full-screen overlay wrapper.
- **Composition root**: `useDiscoverPageComposition` + a 59-line `MapDiscovery.tsx`.

### 5.1 Move-provenance detail (historical)

`useDiscoverPageComposition.ts` originally carried ~487 lines of inline "Issue #2142 — X moved into controllers/Y.ts" comments documenting exactly where each piece of logic came from during the decomposition (roughly 48% of the file's line count). That provenance history was relocated here in a follow-up documentation pass (issue #2142 follow-up step 1) so the live composition hook stays readable; nothing in this subsection describes current behavior that isn't already captured by §3–§6 — it exists purely as a historical index of what moved where.

**Field-by-field moves (correction pass), grouped by destination controller:**

| Destination | What moved in |
|---|---|
| `controllers/useDiscoverPageContext.ts` | Every ambient provider read (router / auth / toast / query client / the four `DiscoverProvider` facades), the map container ref, and the four page-global pure-URL derivations (`panelContent`, `intentListingPurpose`, `isAgriJourney`, `urlDiscoverFilters`) |
| `controllers/useDiscoverNavigationController.ts` | `showAreasNavigationJourney`/`isSchoolsNavNodeLevel`, `hoveredNavigationNodeKey`, `focusedClusterMemberAreaKeys`, `navigationCountsFilters`, `areasNavigationJourney`, `nodeAreaPoint`/`isNodeAreaLeafActive` (issue #1956 PR-4) |
| `controllers/useDiscoverAreaGroupsController.ts` | `useAreaGroups` + `focusedGroup` + `focusedGroupAreas` + `groupAreaKeysForMapData` + `selectedGroupName` — four derivations scattered across ~1,600 lines of the pre-refactor file, all calling the same `resolveDiscoverGroupForAreaKey` over the same inputs |
| `controllers/useDiscoverAgriController.ts` | `corridorGroups` + `selectedCorridorData`/`selectedTierData`/`selectedGroupAreaKeys` + `useAgriMapListings` + `agriGroupLabel` + `selectedGroupListingItem`/`filteredAgriListings` |
| `controllers/useDiscoverResultsController.ts` | `isGroupResultsState`/`resolvedGroupForResults`/`resolvedGroupAreaKeys`, the auth/anon group-results query triad, `useDiscoverGroupResults` |
| `controllers/useDiscoverBoundedBrowseController.ts` | The issue #2089 bounded-Browse (`node` + `nodeListings=1`) node-scoped marker block, together with the keyword-search state that scopes it |
| `controllers/useNearSchoolSheetState.ts` | The NearSchoolSheet's open state |
| `controllers/useDiscoverMarkerController.ts` | The early marker-selection cluster (`selectedMarkerListing`, `markerPixelPos`, `handleSelectMarkerListing`/`handleMarkerClickWithPosition`/`handlePopoverDismiss`, etc. — issue #1824 Slice S5); a thin wrapper over `useMarkerSelection` |
| `controllers/useDiscoverPageStateController.ts` | `useDiscoverPageState`, the legacy/canonical AREA bridge (`effectiveSelectedArea`), the city-validity gate, and `resolvedPanelContent` (issue #1374's agri-detail override) |
| `controllers/useBoundedSearchTrigger.ts` | The issue #1115 school-first bounded-search CTA gate (`boundedSearchTriggered`) |
| `controllers/useDiscoverViewportTracker.ts` | `mapBbox`/`bboxTimerRef`/`handleBoundsChange`/their cleanup effects/the city-change bbox-reset effect |
| `controllers/useDiscoverGeographyController.ts` | Region summary/`summaryRegions`, `scopeNamespaces`/`resolvedUrlScope` (via the `listingScope` selector), `useRegionScopedAreaGroups`, `useDiscoverAreas` (`discoverAreasForPanel`), and `areaMarkerCounts`/`handleAreaMarkersComputed` |
| `controllers/useDiscoverMapDataController.ts` | `effectiveFilters` (the AC4 area+school bbox-polygon injection), the issue #1655 `isTopGroupedLevel` guard, the `useDiscoverMapData` call itself, the `isLoading` aggregate, and the 200 ms delayed-spinner effect |
| `controllers/useDiscoverSchoolController.ts` | `urlBoardFilters` (#1131), `hasResolvedCanonicalArea`/`canonicalSchoolsAreaKey`/`schoolsAreaKey` (#2124, #1798), `categoryFilters`, `useSchoolsByArea`/`allSchools`/`schools`, `useDiscoverJourneyTransitions` (issue #1824 Slice S6), `useSchoolListings` (Slice S11b C3), `useSchoolFirstCounts` (Slice S11b C5), `handleBoardFilterChange`, `handleAreaFirstBack` (#1157), the schoolById restore/error effects, the `cityRef`/`urlCityRef` refs (FLAG-1), the deferred areaKey hydration effect, `composedResetMapTick` + `handleStartOver`, the Start-Over a11y focus effect (#1817 AC8), `handleRadiusChange`, the school-first Back ladder (`handleSchoolFirstBackLevel2/1/0` + `schoolFirstOnBack`), `onClearSchool`/`onClearArea`, and the `handleSchoolSelect` wrapper |
| `controllers/useDiscoverBadgeController.ts` | `cityTotal` and `groupListingsCount`, alongside every other value derived from the one `deriveDiscoverBadge()` call (#1817 no-fork contract) |
| `controllers/useDiscoverJourneyChromeController.ts` | The seven pure journey-chrome predicates: `trendsHref`, `schoolRadiusOverlay`, `showSchoolBreadcrumb`, `isLandingState`, `showSchoolMarkers`, `isSelectedGroupState`, `isAreaFirstSelectedAreaState` |
| `controllers/useDiscoverFilterChromeController.tsx` | The two rendered filter surfaces, issue #1854's atomic Clear-all (`handleClearAllFiltersAndSearch`), `activeContextChips`, `filtersContent` |
| `controllers/useDiscoverMarkerPopoverController.ts` | The marker-popover capability: eligibility gate, the node-leaf-aware layer recompute, `resolveMarkerPopover` and its #2139 ordered set, the #1939 URL↔popover reconciliation effect, the #1810 stepper, plus `effectiveMapLayerCategory`/`isMarkerPopoverEligible` |
| `controllers/useDiscoverMobilePresentationController.ts` | `selectedListingPreview` (the #2129 preview-occlusion owner), the mobile Map-mode overlay shell, the #2129 occlusion pair |
| `controllers/useDiscoverCameraController.ts` | `memoizedInitialCenter`/`areaRestoreArea`/`schoolMarkerPositions` (referential-identity stabilisers for the three imperative panner effects), `schoolFocusTick`/`schoolMarkerFocusTick` (issue #1824 Slice S7), the group-fit effect (`prevGroupIdRef`/`prevAreaKeyRef`), the scope-fit effect (`prevScopeRef`), the agri-fit effect (`agriGroupFocusBounds`), Back restoration ticks `areaRestoreTick`/`cityRestoreTick` (issue #1160 GAP 2) |
| `controllers/useDiscoverRegionGuideController.ts` | `regionGuideVisible`/`regionGuideRingActive` (issue #1808 deep-link-vs-pick rule) |
| `controllers/useDiscoverOverviewNavigationController.ts` | `handleCanonicalNodeSelect` (issue #2124 AREA-leaf seam) and `activeAreasNavigationJourney` |
| `controllers/useDiscoverDebugBridge.ts` | The two `window.__debug` write effects, called at the very end of the controller chain, preserving their relative order and spread-merge semantics (the Playwright contract) |

**The `useDiscoverMapPresentationController` split.** The first correction-pass attempt consolidated hover/emphasis, camera policy, layer selection, region guidance, and destination-click routing into one 340-LOC controller with a 57-field param list and a 39-field return. That was itself a smell (§3.3) and was split five ways: Interaction / Camera / MapLayer / RegionGuide / OverviewNavigation — see §5's controller count and §3.3's "controller that owns more than one capability" rule.

**Issue #1956 PR 6 decision history.** The area-first journey's single `useAreasNavigationJourney` call site went through several rulings before landing on its final shape: RULED A1 MINIMAL, then restored by the `[rulings.oq_a_v2]` rework after a since-superseded "Option A" guard was tried and dropped. The final behavior (documented at the call site in `useDiscoverPageComposition.ts`) is unconditional calling with an internal `enabled` gate, feeding the SAME resolved node/children/selectNode to both `DiscoverRightPanelContainer` and the camera controller.

**Issue #2088 (commit 5) retired effect.** A `setFocusedClusterMemberAreaKeys(null)` reset effect keyed on `areasNavigationJourney.node?.nodeKey` was removed once `state/url/navigation.ts`'s `applyNodeDelta` was confirmed to delete `clusterFocus` on every node write (BR5) — a strictly wider guarantee than the component-local effect gave. See `clusterFocus.ts`'s module doc for the full BR1–BR8 accounting.

**Group-focused map behaviour (A3 #993).** When a group is selected (`groupId` set), two things happen: (1) non-member area markers fade (`focusedGroupAreas` → `AreaMarkerLayer` via `PropertyMap`), and (2) the map fit-bounds to cover all member areas — only when `groupId` changes and no `areaKey` is set (per-area fit-bounds takes precedence when `areaKey` is set). Fit-bounds is triggered via `setPanToArea` with a synthetic `AreaPoint` whose bbox is the union of all member areas' bboxes, reusing `PropertyMap`'s existing `AreaPanner` effect (the F7 debounce) with no new fit-bounds machinery. This behavior now lives across `useDiscoverAreaGroupsController.ts` (`focusedGroupAreas`) and `useDiscoverCameraController.ts` (the group-fit/scope-fit/agri-fit effects).

## 6. Invariants preserved

Eight named invariants were explicitly tracked through every commit of this refactor (full detail: `.claude/handoffs/issue-2142/approved-plan.toml`'s `[invariant_proof]` table):

Each has exactly ONE owner. Where the first pass left an invariant split across two modules, the correction pass consolidated it.

| Invariant | Single owner | Mechanical guard |
|---|---|---|
| #1823 camera-fit policy | `useDiscoverCameraController` | `cameraOwnership.guard.test.ts` — `useDiscoverCameraOrchestration` has exactly one production importer |
| #1762 listing-density clustering | `useDiscoverMapLayerController` (layer kind + `liveAreas`/`overviewAreas`) | `useDiscoverMapLayerController.test.ts` |
| #2129 mobile preview occlusion geometry | `useDiscoverMobilePresentationController` (now also owns `selectedListingPreview`) | `useDiscoverMobilePresentationController.test.ts` |
| #2130 school-radius hit-testing | `useDiscoverMarkerController` | existing marker-selection suite |
| #2139 coincident-marker separation | `useDiscoverMarkerPopoverController` (sole producer of the ordered `currentMapMarkerListings`) | `resolveMarkerPopover.test.ts` |
| #2143 canonical-node camera fix (cold-navigate vs POP-restore) | `useDiscoverCameraController` (`canonicalNodeFitCount`/`isColdNavigate` re-exported unrenamed) | `useDiscoverCameraController.test.ts` + `useDiscoverCameraOrchestration.rootFit.test.tsx` |
| Schools-canonical geography (#2124) — selection routing | `useDiscoverOverviewNavigationController` | `useDiscoverOverviewNavigationController.test.ts` |
| Schools-canonical geography (#2124) — journey segmentation | `useDiscoverMapLayerController` (`schoolJourneySegments`) | `useDiscoverMapLayerController.test.ts` |
| Map/List presentation-only (never touches URL/history) | `useDiscoverMobilePresentationController` | its own static guard: params expose no `DiscoverUrlActions` |
| #1808 region-guide deep-link-vs-pick | `useDiscoverRegionGuideController` | `useDiscoverRegionGuideController.test.ts` |
| #1817 badge copy cannot fork between map and panel | `useDiscoverBadgeController` | one `deriveDiscoverBadge` call, one file |
| #2083 legacy-vs-canonical AREA bridge | `useDiscoverPageStateController` | it structurally refuses to re-export the confusable raw `selectedArea` name |

The `window.__debug` object (a Playwright E2E contract — `propertyMapListings` and `mapState` keys, in that write order, with spread-merge semantics) is owned by `useDiscoverDebugBridge`. `MapDiscovery.architecture.baseline.test.ts` asserts the shape against that file AND that the page itself writes `__debug` zero times.

## 7. Testing discipline

- **Colocated unit tests** for every selector, adapter, and controller (`renderHook` for controllers).
- **`controllerOrdering.contract.test.ts`** — a living contract file proving producer-before-consumer call-site ordering both statically (line-number regex against `useDiscoverPageComposition.ts`, which is where composition lives) and behaviorally (shared-reference proofs, e.g. that the exact same `scopeNamespaces` object reaches the camera and map-layer controllers rather than two independently-reconstructed copies).
- **`compositionHookScope.guard.test.ts`** — the guard that keeps "thin page" honest. A small page proves nothing if the bulk simply moved one level down; this asserts the composition hook holds no logic (§3.5).
- **`MapDiscovery.architecture.baseline.test.ts`** — a living LOC/import/hook-count snapshot, with a frozen Commit-1 forward ceiling every later commit is checked against, and a per-commit "current" assertion updated as the page changes.
- **R7 differential testing** — before converging two seemingly-duplicate adapter implementations into one, prove they are byte-identical across representative inputs first. Commit 2's `anonMarkerAdapter` extraction found the two candidate implementations were *not* identical (a missing lat/lon fallback in one) — kept as two separately-named adapters and filed as issue #2145, rather than silently converging behavior that actually differed.
- **Full-suite regression parity** — every commit in this refactor was verified against an exact-title diff of the failing-test set on `main` (not just a pass/fail count), to guarantee zero new failures and zero accidentally-masked ones. `tsc --noEmit` error count is checked the same way.
- **Surface budget test** — `surfaceViewModel.budget.test.ts` enforces that a surface component's own prop list stays at exactly `{view, commands}` (plus any explicitly-justified DOM-ref exception), so a future edit can't silently reintroduce a flat prop bag at the surface boundary.

## 8. On the LOC target

**This section previously argued that 2256 LOC was an accepted, evidence-based variance. That argument was WRONG and is withdrawn.** It is kept here, corrected rather than deleted, because the reasoning error is the useful part.

The first pass took `MapDiscovery.tsx` from 2916 to 2256 LOC and documented the shortfall as a practical floor, on the reasoning that "the page's remaining ~1900 lines still consume the majority of those fields by their flat names, throughout genuinely page-local logic that has no controller source at all (badge copy, filter state, marker-popover eligibility gating, region-guide visibility...)".

The error is in the phrase *"has no controller source at all"*. Badge copy, filter chrome, marker-popover eligibility and region-guide visibility are not page-local by nature — they were page-local by omission. Each is a coherent capability that had simply never been given an owner. Once they were (`useDiscoverBadgeController`, `useDiscoverFilterChromeController`, `useDiscoverMarkerPopoverController`, `useDiscoverRegionGuideController`), the consumption those lines represented moved with them.

The second error was treating "consolidate the wiring into a composition hook" as an unacceptable scope expansion that "doesn't eliminate the underlying coupling, just moves it behind one more function boundary". That objection is only true if the new boundary is unguarded. With `compositionHookScope.guard.test.ts` in place, the boundary is not a hiding place: the hook provably cannot hold a decision.

**Actual result: 59 LOC**, comfortably inside the `<=220` criterion, reached by:

| Step | LOC |
|---|---|
| Commit-1 baseline | 2916 |
| First pass (selectors/adapters/8 controllers/surfaces/shell) | 2256 |
| Correction C1 — split the god-adjacent controller five ways | 2276 (grew: one call site became five) |
| Correction C2 — page-context / area-groups / bounded-browse / page-state / map-data | 1944 |
| Correction C3 — badge / journey-chrome / filter-chrome / marker-popover / debug-bridge | 1263 |
| Correction C4 — `useDiscoverPageComposition` + thin root | **59** |

Note that C1 made the page BIGGER. A refactor that is monotonically shrinking a number is optimising the number; a refactor that temporarily grows it to fix an ownership boundary is optimising the structure. Report both honestly.

The number that actually matters is not 59. It is that the page holds zero `useState`, zero `useEffect`, zero `useRef`, one conditional, and no data access — all asserted, not asserted-by-comment. A 250-line page satisfying those would have been equally acceptable; a 2256-line one was not.
## 9. What NOT to do

- Do not add a shared `utils.ts` in any of the four layer directories — one file per selector/adapter/controller/surface, colocated with its own test.
- Do not converge two adapters/controllers that look similar without an R7 differential test proving they're behaviorally identical first.
- Do not reorder a controller's call site without checking `controllerOrdering.contract.test.ts` — ordering can be load-bearing even when it looks incidental.
- Do not reach for a new state-management library or a second page-level context to "simplify" a controller — compose existing hooks and the existing context facade.
- Do not treat a builder's grouping spec (whether from an architect's plan or this document) as gospel over real field usage — deviate and document when the real interface argues for a different shape, the same way every layer in `/discover`'s decomposition did at least once.
- Do not chase a LOC target for its own sake — but do NOT use "the rest is genuine page-local logic" as a reason to stop, without first checking whether each of those pieces is really page-local or merely un-owned. That distinction is exactly what §8 got wrong the first time.
- Do not let a composition/wiring layer absorb a decision. If you are writing a conditional or a derivation in it, that logic has an owner elsewhere — find it.
- Do not declare a hand-written flat prop interface as a surface builder's INPUT type. Derive the input from the controllers that produce it (§3.4).

## 10. Applying this pattern to a new page

1. Identify the page's distinct capabilities (data-fetching + derived state clusters) — these become controller boundaries. Don't force a fixed count; let real capability boundaries decide it.
2. Identify pure derivation/translation logic already inline in the page — extract to selectors/adapters first (lowest risk, easiest to verify via colocated tests).
3. Build controllers by composing existing hooks verbatim, in dependency order, with `git diff main --stat` empty on every wrapped hook.
4. Identify the page's render surfaces (typically: primary content area, secondary panel, overlay/modal layer) and their real leaf-component prop interfaces. Build `buildXSurfaceView`/`buildXSurfaceCommands` as `Pick<>`s off those real interfaces.
5. Extract the page's layout shell (wrapper, responsive gating, chrome) into a dedicated shell component once the surfaces exist to pass into it.
6. Add a living architecture-baseline test (LOC/import/hook-count snapshot with forward ceilings) and a controller-ordering contract test from the start, not as an afterthought — they're cheap to add early and expensive to retrofit after multiple commits have already landed.
7. Add the composition hook LAST, once the controllers exist — and add its scope guard in the same commit, never later. The guard is what makes the page's size an honest signal instead of a place to hide bulk.
8. Report LOC honestly, including the commits where it goes UP. A page that is thinner and more testable is the goal; a line count is a proxy. But when a proxy is missed by an order of magnitude, treat that as evidence the decomposition is incomplete — not as a variance to document.

## 11. Repo-wide guardrails (issue #2664)

Issue #2142 (above) proved out this pattern on `/discover`. Between #1838, #2657–#2663 and #2142 itself, six areas of the codebase were decomposed along it: `/discover` (map page), Edit Listing (broker wizard), ProcessPosts (admin), TrustReviewQueue (admin), plus the two smaller admin pages covered by #2657/#2660. Each decomposition is only as durable as the tests that make backsliding fail loudly rather than pass silently. This section names the seven properties worth guarding regardless of which page they land on, and maps every guard file in the repo today to the property and area it protects.

This section is doc-only — it introduces no new pattern. §§1–10 remain the canonical description of the pattern itself; this section generalizes what to *guard* once a page has been decomposed that way, and records where that guarding already lives so a future PR extends the map instead of re-deriving it.

### 11.1 The seven properties to guard

1. **Thin page / composition root.** The page component (or, for admin pages that never split into `{controllers, surfaces}`, the top-level page file) does layout, route/context bootstrap and composition only. A LOC ceiling alone proves nothing if the bulk merely moved one level down — pair it with the next property.
2. **Composition-only layers.** A composition hook wires named controllers/hooks together and joins their outputs into a view/commands pair. It owns no `useState`/`useEffect`/`useRef`/`useMemo`/`useCallback`, VALUE-imports no `@/hooks/*` data hook, and calls no React Query/Supabase API directly — every one of those belongs to a controller.
3. **Contract shape, including nested-group budgets.** A `{view, commands}` prop contract is the DERIVED output of a builder taking controller result types as input (`Pick<ReturnType<typeof useXController>, ...>`), never a hand-written flat interface restating the same fields a second time. Where a contract has nested groups (`view.camera`, `commands.navigation`, …), each group carries its own member ceiling so one group can't silently regrow into a new flat prop bag.
4. **State ownership.** Every piece of `useState`/`useRef`/`useEffect` in a decomposed area has exactly one named owner (a controller, or a step-local hook) — never both the page and a hook it composes, and never duplicated across two hooks.
5. **Semantic commands.** Callbacks exposed to a leaf/table/dialog component are named for the domain action they perform (`review.approve`, `queue.retry`) and carry a combined `action` status object (e.g. `{busy, approving}`), never a raw mutation object (`workflow.mutation`) or an ad hoc boolean per in-flight state.
6. **Discriminated unions over boolean soup.** A route/page-level gate (e.g. `{status: 'unsupported-city', city}`) is a discriminated union with a single owning `if`, not a scattered set of independent booleans (`isLoading && !isError && …`) recomputed at each render site.
7. **Feature dependency boundaries and import direction.** A layer never imports upward (a controller importing a surface or a page) or sideways into an unrelated feature's internals, and ambient framework services (router, query client, toast) have exactly one named owner rather than being reached for independently by every hook that happens to need them.

None of these are new inventions — 1, 2, 3 and 7 are restatements of §§3.3–3.5 and §9 above generalized past `/discover`; 4, 5 and 6 are the properties that made #1838's and #2663's decompositions (EditListingForm's `{view, commands}` step contracts, TrustReviewQueue's `action`/`command` shape) sound without repeating this document's `/discover`-specific prose for each area.

### 11.2 Guard map

Every guard below is a source-text scanner (regex/AST-lite over file contents, via `fs.readFileSync` — no render, no DOM), following this document's own testing discipline (§7): fast, dependency-free, and read the same files the compiler and the reviewer would. `apps/web/src/test-utils/architectureGuards.ts` (issue #2664) is the shared `stripComments`/`countHookCalls`/`scanForbiddenImports`/`countTopLevelInterfaceMembers` helper module now used by `compositionHookScope.guard.test.ts` and both of the new guards below, deduplicating logic that used to be copied inline per guard file.

| Guard file | Protected area | Mechanism |
|---|---|---|
| `features/discover/composition/__tests__/compositionHookScope.guard.test.ts` | Discover — composition hook (property 2) | Regex scan: 0 hook primitives, 0 `@/hooks/*` VALUE imports, 0 React Query/Supabase imports, exactly 1 `if` (the city gate), 0 ternaries, `.ts` extension forbids JSX, every called hook imported from `controllers/`. |
| `features/discover/composition/__tests__/authThreading.guard.test.ts` | Discover — composition hook (property 7, ambient-service ownership) | Asserts auth/session state is threaded as a controller output, not re-read ambiently inside the composition hook. |
| `features/discover/controllers/__tests__/cameraOwnership.guard.test.ts` | Discover — controllers (property 4, single-owner state) | Asserts `useDiscoverInteractionController` never references a camera producer and `useDiscoverCameraOrchestration` has exactly one production importer. |
| `features/discover/controllers/__tests__/controllerLayering.guard.test.ts` | Discover — controllers (property 7, import direction) | Walks `controllers/**`, parses imports, asserts (a) no controller VALUE-imports a surface or a page, (b) only `useDiscoverPageContext.ts` VALUE-imports router/query-client/toast. |
| `features/discover/surfaces/__tests__/surfaceLayering.guard.test.ts` | Discover — surfaces (property 7, import direction) | Walks `surfaces/**`, asserts surfaces never VALUE-import a `@/hooks/*` data hook, the router, the query client, a controller, or the context facade (one pinned, named exception). |
| `features/discover/surfaces/panel/__tests__/panelAmbientContext.guard.test.ts` | Discover — panel surfaces (property 7, facade-only access) | Narrower ancestor of `surfaceLayering.guard.test.ts`; adds an identifier-level CALL scan (catches a re-export or relative-path import a module-specifier check alone would miss) plus a `DiscoverJourneyPanelShell` prop-shape check. |
| `features/discover/selectors/__tests__/selectorPurity.guard.test.ts` | Discover — selectors (property 2/7, purity) | Asserts every file under `selectors/` is hook-free and React-import-free — pure `(input) => output` only. |
| `features/discover/buyer-filters/__tests__/importDirection.guard.test.ts` | Discover — buyer-filters feature (property 7) | Feature-boundary import-direction scan local to `buyer-filters/`, same shape as `controllerLayering`/`surfaceLayering`. |
| `features/discover/right-panel/__tests__/legacyFlatPropsConfinement.guard.test.ts` | Discover — right panel legacy bridge (property 3) | Confines the legacy flat-prop shape to the one bridge component it was kept for, so it cannot spread to a new consumer. |
| `features/discover/right-panel/__tests__/rightPanelContractBudget.guard.test.ts` | Discover — right panel contract (property 3, nested-group budgets) | Auto-discovers the panel's `{view, commands}` interfaces and asserts a per-group member ceiling. |
| `features/discover/areas-journey/__tests__/areasJourneyContractBudget.guard.test.ts` | Discover — areas-journey contract (property 3, nested-group budgets) | Same mechanism as `rightPanelContractBudget.guard.test.ts`, scoped to the areas-journey panel's contract groups. |
| `pages/broker/editListing/__tests__/EditListingForm.architecture.baseline.test.ts` | Edit Listing wizard (#1838) — properties 1, 2, 3, 4 | LOC/hook-count ceilings per file across the page + 3 state/hydration hooks + 6 split command-hook files; `{view, commands}` 2-member ceiling per step contract; conservation totals; asserts the deleted god-hook (`useEditListingCommands.ts`) stays deleted and no split file imports a sibling split file. |
| `features/admin/process-posts/composition/__tests__/processPostsCompositionScope.guard.test.ts` **(new, #2664)** | ProcessPosts (#2662) — composition hook (property 2) | Same mechanism as `compositionHookScope.guard.test.ts`, generalized via the shared helper module: 0 hook primitives, 0 `@/hooks/*`/React Query/Supabase imports, 0 `.mutate(`, calls only the 6 named ProcessPosts controllers, derives `{view, commands}` only via the 2 named surface builders. |
| `pages/admin/__tests__/TrustReviewQueue.architecture.guard.test.ts` **(new, #2664)** | TrustReviewQueue (#2663) — page + presentational components (properties 4, 7) | `TrustReviewQueue.tsx` calls no `useMutation(`/`.mutate(` directly (that stays in `useTrustReviewMutations.ts`); none of the 4 dialog/table components imports `useTrustBadgeQuery`/`useTrustIdentityQuery`/`useTrustReviewMutations` directly (via `scanForbiddenImports`) — they must keep receiving `{view, commands}` props. |
| `eslint.config.js:12-92` | Repo-wide feature boundaries (property 7) | Dynamically discovers each `src/features/<feature>/` directory and generates an import-direction ESLint rule per feature, enforced on every lint run rather than per-area test files. |

### 11.3 Already-satisfied DoD items (cited, not duplicated)

The following #2664 DoD items are fully covered by guards already listed in §11.2 above; no new guard was added for them:

- **DiscoverMapCanvas / Areas–Selected-Areas–Schools surface boundaries** — `surfaceLayering.guard.test.ts` + `panelAmbientContext.guard.test.ts`.
- **Contract shape, including oversized nested groups** — `rightPanelContractBudget.guard.test.ts` and `areasJourneyContractBudget.guard.test.ts` (per-group member ceilings, auto-discovered interfaces).
- **Import direction, repo-wide** — `eslint.config.js`'s dynamically-generated per-feature boundary rules, plus `controllerLayering.guard.test.ts`/`surfaceLayering.guard.test.ts`/`buyer-filters/importDirection.guard.test.ts` for Discover specifically.

### 11.4 Shared helper module

`apps/web/src/test-utils/architectureGuards.ts` exports `stripComments`, `countHookCalls`, `scanForbiddenImports` and `countTopLevelInterfaceMembers`. It exists because the same four scanning primitives were independently re-implemented in `compositionHookScope.guard.test.ts`, `EditListingForm.architecture.baseline.test.ts`, `controllerLayering.guard.test.ts` and `surfaceLayering.guard.test.ts` before #2664. New guards should import from here rather than redefine these functions; `EditListingForm.architecture.baseline.test.ts` and the controller/surface layering guards were left on their own inline copies in #2664 (out of scope — a behavior-preserving refactor of files this issue didn't otherwise need to touch), so a future PR consolidating those onto the shared module should diff its own before/after test output the same way #2664 did for `compositionHookScope.guard.test.ts` (§11.5).

### 11.5 Negative-control discipline

Every guard in §11.2 is only as trustworthy as its last proven failure. When adding or meaningfully changing a guard, introduce the exact violation it exists to catch, run the guard, confirm it fails with a readable message naming the violated property, then revert and confirm it passes again — the same discipline this document's own `/discover` guards were built under (§7). Do not commit the violation; keep the before/after test output as PR evidence instead.
