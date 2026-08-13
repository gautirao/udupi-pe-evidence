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
- **One named capability per controller**, not "whatever happened to be nearby in the old file", and not a target count. `/discover` ended up with 21, sized by the real dependency graph: PageContext, Navigation, AreaGroups, Agri, Results, BoundedBrowse, NearSchoolSheet, Marker, BoundedSearchTrigger, PageState, ViewportTracker, Geography, MapData, School, Badge, JourneyChrome, FilterChrome, Interaction, Camera, MapLayer, RegionGuide, OverviewNavigation, MarkerPopover, MobilePresentation, DebugBridge.
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
- **21 controllers + 2 leaf hooks.** The first pass produced 8; the correction pass split the god-adjacent `useDiscoverMapPresentationController` five ways (Interaction / Camera / MapLayer / RegionGuide / OverviewNavigation) and added the controllers that own what was still page-resident: PageContext, AreaGroups, BoundedBrowse, PageState, MapData, Badge, JourneyChrome, FilterChrome, MarkerPopover, DebugBridge, plus the `useNearSchoolSheetState` leaf.
- **3 surfaces** (Commit 4): `DiscoverMapSurface` (renamed from `DiscoverMapMount`), `DiscoverPanelSurface` (renamed from `DiscoverRightPanelContainer`), `DiscoverOverlaySurface` (new — absorbs `DiscoverOverlaySheets`' outer chrome). `DiscoverMapMount.tsx`, `DiscoverRightPanelContainer.tsx`, and `DiscoverOverlaySheets.tsx` were deleted once `check_references` confirmed zero remaining real importers.
- **Page shell**: `DiscoverPageShell` — owns the `PublicDiscoverLayout` wrapper, the mobile-only `DiscoverControlBar` row, and the `z-[60]` mobile-Map full-screen overlay wrapper.
- **Composition root**: `useDiscoverPageComposition` + a 59-line `MapDiscovery.tsx`.

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
| Schools-canonical geography (#2124) | `useDiscoverOverviewNavigationController` (selection routing) + `useDiscoverMapLayerController` (`schoolJourneySegments`) | `useDiscoverOverviewNavigationController.test.ts` |
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
