# Frontend Page Architecture

Established by issue #2142 (`MapDiscovery.tsx` thin composition root refactor). This document describes the layered pattern that resulted, using `/discover` as the reference implementation, and sets the default shape for future non-trivial pages in this codebase.

## 1. Problem

`src/pages/MapDiscovery.tsx` had grown to 2916 LOC (verified baseline, Commit 1) by accumulating every concern the `/discover` route needed directly in the page component: ~15 separate pieces of business logic (URL-state derivation, camera orchestration, marker selection, school search, agri filtering, region guidance, mobile shell presentation, badge copy, etc.), and ~200 flat inline props spread across 5 separate JSX render call sites for the map, right panel, and overlay layers. This made the file hard to navigate, hard to test in isolation, and structurally risky to touch — any change anywhere in the file could plausibly interact with camera framing, marker popover state, or URL writes owned elsewhere in the same 2900-line function body.

No architectural pattern existed for decomposing a page this size without turning it into either a god-hook (one `usePageState()` that owns everything, equally opaque) or a god-view-model (one `buildPageProps()` that flattens everything into an even bigger prop bag one level down). Issue #2142 exists to establish and prove out a pattern that avoids both failure modes.

## 2. Goals and non-goals

**Goals:**
- Decompose the page into named, independently testable units, each with a narrow, typed responsibility.
- Preserve 100% of existing behavior — this is a pure refactor. Zero product/URL/API/visual change (see §9, Invariants).
- Establish the pattern as the default for future pages of comparable complexity, not a one-off for `/discover`.

**Non-goals:**
- Hitting an arbitrary LOC target for its own sake. `MapDiscovery.tsx` did not reach the originally-projected `<=220 LOC` — see §8 for why, and why that's an accepted, documented outcome rather than a shortfall to keep chasing.
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

A controller is a hook that composes one or more existing hooks/queries into ONE named, typed result object, representing one coherent capability (`useDiscoverGeographyController`, `useDiscoverMapPresentationController`, etc.). Rules:
- **Verbatim composition.** A controller wraps existing hooks unchanged — `git diff main --stat` on every wrapped hook must be empty. A controller is a *regrouping* of call sites, not a rewrite of the logic those call sites contain.
- **One named capability per controller**, not "whatever happened to be nearby in the old file." `/discover` ended up with 8: Geography, Navigation, Results, Agri, Marker, MobilePresentation, School, MapPresentation — sized by genuine capability boundaries the domain already had, not an arbitrary target count.
- **Call-site ordering is a load-bearing detail**, not incidental. A controller is called at the *latest* position among the hooks it consolidates when those hooks have real data dependencies on earlier controllers' outputs (e.g. `useDiscoverMapPresentationController` needs `scopeNamespaces` from the Geography controller, so it's called after it). Reordering a controller's call site relative to another can silently change render/query behavior — this is why `controllerOrdering.contract.test.ts` exists (§6).
- **No controller reaches for a new state-management library** or a second page-level context. `DiscoverContext` remains the sole cross-cutting facade; a controller composes hooks, it doesn't become one.
- A controller may deliberately *not* wrap something the original decomposition plan assigned to it, when doing so would relocate a wide, cross-cutting dependency (e.g. `resolveMarkerPopover`) with zero real simplification — document the deviation and why, same as any other judgment call in this layer.

### 3.4 Surfaces (`src/features/discover/surfaces/`)

A surface is the unit the page renders: a typed `{view, commands}` contract plus the component that consumes it.

- `buildXSurfaceView(params) => XSurfaceView` and `buildXSurfaceCommands(params) => XSurfaceCommands` are pure functions. Each output group (`view.camera`, `view.layers`, `commands.navigation`, etc.) is a `Pick<>` straight off the real, unmodified prop interface of the leaf component the surface wraps — so a field rename or removal in that leaf is a compile error here, not a silent runtime gap.
- `<XSurface view commands />` is the component. It reconstructs the leaf component's original flat prop shape by spreading the grouped `view`/`commands` back together, then renders the leaf unchanged.
- **A surface's builder INPUT shape is a separate concern from its OUTPUT shape**, and the input shape may evolve independently. `/discover`'s Map surface builder initially accepted ~65 individually flat-named fields; Commit 5 tightened that to accept the controllers' own result objects directly (`{ navigationController, agriController, mapPresentationController, ... }`) instead — same output `view`/`commands` groups, same downstream construction logic, only the destructuring prelude changed source. This is the right lever to reach for when a page's own object-literal assembly grows large; see §8 for the measured limits of how much it actually saves.
- Grouping deviations from an original plan/spec are expected and should be judged by real field usage, not forced to match a spec written before the real interfaces were read. `/discover`'s Panel surface commands groups (`routing`, `geography`) were added beyond the architect's original 6-group sketch because 6 of Panel's 25 `geography`-view fields are real callbacks with no other sound home — documented in `buildPanelSurfaceView.ts`'s own doc comment.
- A DOM-position or stacking-context coupling between two visually-adjacent pieces can override an otherwise-clean UI-concern grouping. `/discover`'s mobile cluster sheet, listing-preview sheet, and recenter-button portal all live in `DiscoverMapSurface`'s `overlays` group (not `DiscoverOverlaySurface`, despite being conceptually "overlay chrome") because they must render inside the same `z-[60]` mobile-map wrapper the map canvas itself owns — see `buildMapSurfaceView.ts`'s doc comment for the full DOM-coupling rationale.

### 3.5 Page (composition root)

The page component's job, after this pattern is applied:
1. Call the controllers (in dependency order).
2. Assemble each surface's builder-input params from the controllers' results plus any genuinely page-local state/derived-consts.
3. Call `buildXSurfaceView`/`buildXSurfaceCommands` for each surface.
4. Render the page shell (layout wrapper + the surfaces), typically via a dedicated `DiscoverPageShell`-style component that owns the surrounding layout markup (control-bar row, responsive wrapper divs, mobile full-screen overlay gating) so the page function body itself is not also carrying page-chrome JSX.

The page still owns: page-local `useState`/`useRef`, effects with page-specific timing requirements (e.g. the `window.__debug` Playwright contract, §6), and the object-literal assembly connecting controller outputs to surface builder inputs. This assembly is deliberately *not* pushed into a further "page facade hook" or 9th controller — see §8 for why that was tried and rejected.

## 4. Data flow

```
existing hooks/queries
        │
        ▼
   controllers (compose, do not rewrite)
        │
        ▼
   page-local state/derived consts  ──┐
        │                              │
        ▼                              ▼
   buildXSurfaceView() / buildXSurfaceCommands()
        │
        ▼
   <XSurface view={...} commands={...} />
        │
        ▼
   unmodified leaf component (DiscoverMapCanvas, DiscoverRightPanel, ...)
```

Controllers never call `buildXSurfaceView` directly, and surfaces never call controllers directly — the page is the only layer that sees both, and its job is exactly that wiring, nothing more.

## 5. `/discover`'s concrete decomposition (issue #2142)

- **9 selectors/adapters** (Commit 2): `effectiveArea`, `listingScope`, `mapLayerCategory`, `panelContent`, `badgeCopy`, `displayEligibility`, `anonMarkerAdapter`, `cityListingsQueryParams`, `navigationCountsFilters`.
- **8 controllers + 2 leaf hooks** (Commit 3): `useDiscoverGeographyController`, `useDiscoverNavigationController`, `useDiscoverResultsController`, `useDiscoverAgriController`, `useDiscoverMarkerController`, `useDiscoverMobilePresentationController`, `useDiscoverSchoolController`, `useDiscoverMapPresentationController`; plus `useDiscoverViewportTracker` and `useBoundedSearchTrigger`.
- **3 surfaces** (Commit 4): `DiscoverMapSurface` (renamed from `DiscoverMapMount`), `DiscoverPanelSurface` (renamed from `DiscoverRightPanelContainer`), `DiscoverOverlaySurface` (new — absorbs `DiscoverOverlaySheets`' outer chrome). `DiscoverMapMount.tsx`, `DiscoverRightPanelContainer.tsx`, and `DiscoverOverlaySheets.tsx` were deleted once `check_references` confirmed zero remaining real importers.
- **Page shell** (Commit 5): `DiscoverPageShell` — owns the `PublicDiscoverLayout` wrapper, the mobile-only `DiscoverControlBar` row, and the `z-[60]` mobile-Map full-screen overlay wrapper.

## 6. Invariants preserved

Eight named invariants were explicitly tracked through every commit of this refactor (full detail: `.claude/handoffs/issue-2142/approved-plan.toml`'s `[invariant_proof]` table):

| Invariant | Owning module after refactor |
|---|---|
| #1823 camera/framing authority | `useDiscoverMapPresentationController` |
| #1762 clustering/marker behaviour | `useDiscoverResultsController` + `useDiscoverMapPresentationController` |
| #2129 mobile preview geometry/occlusion | `useDiscoverMobilePresentationController` |
| #2130 selected-school-radius marker hit-testing | `useDiscoverMarkerController` |
| #2139 coincident marker separation | `useDiscoverMarkerController` |
| #2143 canonical Area camera-fit race fix | `useDiscoverMapPresentationController` |
| Schools on canonical geography | `useDiscoverNavigationController` / `useDiscoverGeographyController` |
| Map/List presentation-only, not a second navigation model | `useDiscoverMobilePresentationController` |

The `window.__debug` object's shape (a Playwright E2E contract — `propertyMapListings` and `mapState` keys) is also load-bearing and is asserted byte-for-byte in `MapDiscovery.architecture.baseline.test.ts`.

## 7. Testing discipline

- **Colocated unit tests** for every selector, adapter, and controller (`renderHook` for controllers).
- **`controllerOrdering.contract.test.ts`** — a living contract file, extended per commit, proving producer-before-consumer call-site ordering both statically (line-number regex against the page's source) and behaviorally (shared-reference proofs, e.g. that the exact same `scopeNamespaces` object reaches two different controllers rather than two independently-reconstructed copies).
- **`MapDiscovery.architecture.baseline.test.ts`** — a living LOC/import/hook-count snapshot, with a frozen Commit-1 forward ceiling every later commit is checked against, and a per-commit "current" assertion updated as the page changes.
- **R7 differential testing** — before converging two seemingly-duplicate adapter implementations into one, prove they are byte-identical across representative inputs first. Commit 2's `anonMarkerAdapter` extraction found the two candidate implementations were *not* identical (a missing lat/lon fallback in one) — kept as two separately-named adapters and filed as issue #2145, rather than silently converging behavior that actually differed.
- **Full-suite regression parity** — every commit in this refactor was verified against an exact-title diff of the failing-test set on `main` (not just a pass/fail count), to guarantee zero new failures and zero accidentally-masked ones. `tsc --noEmit` error count is checked the same way.
- **Surface budget test** — `surfaceViewModel.budget.test.ts` enforces that a surface component's own prop list stays at exactly `{view, commands}` (plus any explicitly-justified DOM-ref exception), so a future edit can't silently reintroduce a flat prop bag at the surface boundary.

## 8. On the LOC target

The originally-projected acceptance criterion for this refactor was `MapDiscovery.tsx <= 220 LOC`. The actual result is **2256 LOC** — a 22.6% reduction from the Commit-1 baseline of 2916, not a ~92% reduction to 220.

This gap was not silently absorbed — it was investigated and the investigation is part of the record. After Commits 1-5a (selectors/adapters/controllers/surfaces/page-shell) landed, the remaining bulk of the page was the object-literal assembly connecting controller outputs to the 3 surfaces' builder inputs (~330 lines). Commit 5b tested, empirically, whether tightening the builders' input shape (accepting controllers' own result objects instead of ~65 individually flat-named fields) would meaningfully shrink that assembly. Measured result: **-22 lines** (2278 → 2256), not the hundreds of lines that would be needed to approach 220.

The reason: the page's remaining ~1900 lines still consume the majority of those fields *by their flat names*, throughout genuinely page-local logic that has no controller source at all (badge copy, filter state, marker-popover eligibility gating, region-guide visibility, and similar page-owned derived consts and handlers). Grouping builder *inputs* by controller doesn't eliminate that consumption — a controller's result object still has to be destructured back into flat names somewhere for the rest of the page to use, so the win is real but bounded to the object-literal-construction lines specifically, not the page as a whole.

Reaching `<=220 LOC` would require a materially larger change than this refactor's scope — most plausibly, consolidating the object-literal assembly itself into a new 9th "composition" hook that owns the controller-to-surface wiring internally. That was considered and explicitly **not** pursued in #2142: it doesn't eliminate the underlying coupling (the same ~150 field references still exist, just behind one more function boundary), and introducing a new file family/abstraction beyond what was already approved is a real scope expansion warranting its own review, not something to fold into a "tighten the existing boundary" experiment.

**Decision:** 2256 LOC is accepted as the practical floor for this refactor and documented here as an intentional, evidence-based variance — the same category of outcome as issue #1824's MapDiscovery decomposition landing at ~1751 LOC against an originally-projected `<800` target (also user-endorsed as "render-identity over line target"). The acceptance criterion that matters is not the raw number but what it stands for: no god-hook, no god-view-model, every remaining line traceable to either genuine page-local state or the (now minimal, typed) wiring between controllers and surfaces.

## 9. What NOT to do

- Do not add a shared `utils.ts` in any of the four layer directories — one file per selector/adapter/controller/surface, colocated with its own test.
- Do not converge two adapters/controllers that look similar without an R7 differential test proving they're behaviorally identical first.
- Do not reorder a controller's call site without checking `controllerOrdering.contract.test.ts` — ordering can be load-bearing even when it looks incidental.
- Do not reach for a new state-management library or a second page-level context to "simplify" a controller — compose existing hooks and the existing context facade.
- Do not treat a builder's grouping spec (whether from an architect's plan or this document) as gospel over real field usage — deviate and document when the real interface argues for a different shape, the same way every layer in `/discover`'s decomposition did at least once.
- Do not chase a LOC target past the point where the remaining lines are genuine page-local logic rather than structural bulk — see §8.

## 10. Applying this pattern to a new page

1. Identify the page's distinct capabilities (data-fetching + derived state clusters) — these become controller boundaries. Don't force a fixed count; let real capability boundaries decide it.
2. Identify pure derivation/translation logic already inline in the page — extract to selectors/adapters first (lowest risk, easiest to verify via colocated tests).
3. Build controllers by composing existing hooks verbatim, in dependency order, with `git diff main --stat` empty on every wrapped hook.
4. Identify the page's render surfaces (typically: primary content area, secondary panel, overlay/modal layer) and their real leaf-component prop interfaces. Build `buildXSurfaceView`/`buildXSurfaceCommands` as `Pick<>`s off those real interfaces.
5. Extract the page's layout shell (wrapper, responsive gating, chrome) into a dedicated shell component once the surfaces exist to pass into it.
6. Add a living architecture-baseline test (LOC/import/hook-count snapshot with forward ceilings) and a controller-ordering contract test from the start, not as an afterthought — they're cheap to add early and expensive to retrofit after multiple commits have already landed.
7. Report LOC honestly. A page that's "thinner and more testable" is the actual goal; a specific line count is a proxy for that goal, not the goal itself.
