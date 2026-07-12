# Issue #1824 — First-Slice Decision (Phase 0.7)

**Decision: OVERRIDE #1666 as the first slice.**
**Slice 1 = extract the pure ephemeral hover/emphasis cluster into `src/features/discover/state/useDiscoverInteractionState.ts`.**

Authority: architecture review (`architecture-review.md`), evidence-based (not by assumption), as #1824 explicitly permits ("Use #1666 as the first extraction *unless current investigation proves a different slice is safer*").

---

## Why #1666 (filter/search) is rejected as the FIRST slice

1. It touches **`deriveDiscoverBadge`** (L1955–2006) — one of the two most correctness-sensitive surfaces, with six intertwined loading-guards across auth/anon/school-radius. Badge truthfulness is an explicit #1824 invariant (backend-owned, truthful counts).
2. **Split-brain confirmed by direct read:** the badge consumes local `debouncedSearch` (L1987) while `activeContextChips` consumes URL-authoritative `urlState.q` (L2640), and `handleSearchChange` writes both local + URL (L1333–1334). Extracting "the search slice" forces a *decision* about unifying these three representations — inherently a behaviour change, disqualifying it from a behaviour-preserving PR.
3. `debouncedSearch` feeds `useDiscoverMapData` queries with an **unmount race window** (L1326–1329).
4. `activeContextChips` embeds every filter-clear handler (L2663–2693) → moving search drags filters along.

A first slice whose correctness surface is the badge is the worst place to prove an as-yet-unproven extraction pattern. **#1666 is not cancelled — it is reordered to Slice S4** with a de-risking sub-plan (below).

## The override slice — exact scope

**New module:** `src/features/discover/state/useDiscoverInteractionState.ts`

**Typed API (`ControllerResult` shape):**
```ts
interface DiscoverInteractionView {
  hoveredListingId: string | null;
  hoveredAreaKeyForMap: string | null;
  highlightedAreaKeys: string[];
}
interface DiscoverInteractionCommands {
  hoverListing(id: string | null): void;    // wraps setHoveredListingId
  hoverArea(key: string | null): void;       // wraps setHoveredAreaKeyForMap
  setHighlightedAreas(keys: string[]): void;
  clearHighlightedAreas(): void;             // called on journey switch
}
type DiscoverInteractionState =
  ControllerResult<DiscoverInteractionView, DiscoverInteractionCommands>;
export function useDiscoverInteractionState(): DiscoverInteractionState;
```
Internals: three `useState`, no reducer (per ADR). Command callbacks memoised (`useCallback`) for referential stability.

**Moved OUT of MapDiscovery.tsx:** `hoveredListingId` (+setter), `hoveredAreaKeyForMap` (+setter), `highlightedAreaKeys` (+setter) declarations. The eslint-disable at **L922**: move it verbatim ONLY if it governs this cluster's effect; if it governs an unrelated effect, leave in place (verify L910–935 at implementation).

**Stays behind (explicitly excluded, with reason):**
- `markerPixelPos`, `selectedMarkerListing` — coupled to `handleSelectMarkerListing`/panel routing → S5.
- `prefersReducedMotion` — media-query concern → S2.
- region-select trio, `areaSearchQuery`/`debouncedAreaSearchQuery` — separate concerns → S2.
- All search/filter/badge state → S4.

**Files touched:** new `src/features/discover/state/useDiscoverInteractionState.ts`; new `src/features/discover/state/useDiscoverInteractionState.test.tsx`; `src/pages/MapDiscovery.tsx` (replace 3 declarations with one hook call + destructure; update the ~4–5 usage sites for `hoveredListingId`, `onHoverResultListing`, hovered-area props, highlight consumers). No other files.

**Dependencies in:** none (leaf hook). **Dependencies out:** MapDiscovery consumes view/commands.

## Behaviour-preserving risks + test characterisation

| Risk | Characterisation |
|---|---|
| Journey-switch reset of `highlightedAreaKeys` (the one non-trivial semantic) | Unit test: highlight clears when journey changes. Slice-1 default keeps the reset *trigger* in the page, calling the new `clearHighlightedAreas` command — the effect does NOT move in Slice 1. |
| Hover prop identity | `hoverListing`/`hoverArea` must be stable (`useCallback`) so memoised children (marker layers, chips siblings) don't re-render more than before. Unit test: referential stability across re-renders. |
| Usage-site wiring drift | Existing MapDiscovery interaction tests must stay green; run focused MapDiscovery/discover tests post-change. |

## Why it is the smallest SAFE first slice

Zero URL/server/camera coupling; three vars documented as pure ephemeral emphasis; establishes the `features/discover/state/` folder + `ControllerResult` convention every later slice reuses → maximum pattern-confidence for PLAN_REVIEW at minimum regression surface.

## Contingency — if PLAN_REVIEW insists on #1666

De-risk by: (1) first landing a pure characterisation-test PR pinning badge output across {anon, auth, school-radius, q-active, q-empty} × loading states; then split #1666 into **4a** `useDiscoverSearchState` (state only, no badge change), **4b** unify chips↔badge to a single source behind a proven test, **4c** debounce-cleanup hardening. Do **not** attempt #1666 as one PR.

## Slice-1 completion criteria (COMPACT validation)

| Check | Command / method | Pass condition |
|---|---|---|
| Typecheck | `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` | exit 0 |
| Focused tests | `npm run test src/features/discover/state/useDiscoverInteractionState.test.tsx --run` + existing MapDiscovery/discover interaction tests | exit 0; assertions ran (`expect(` present) |
| Build | `npm run build` | exit 0 |
| Lint | `eslint` on touched files | no new warnings; net exhaustive-deps suppression count unchanged |
| Line count | before/after `MapDiscovery.tsx` | net ≈ −55 lines, no new lines elsewhere in the page |
| Static analysis | Sonar local-only (CI billing-blocked) | file function-count −3 state hooks; complexity flat-or-down |
| Perf | React Profiler before/after on hover | no increase in commit count on mouseover/mouseleave; hover latency unchanged |

## Invariants Slice 1 must not break

URL round-trip (no URL code touched) · deep-link restore (no camera/tick code moved) · area/school/agri journey behaviour (highlight journey-reset preserved, characterised) · badge truthfulness (badge excluded) · camera-owner invariant #1806/#1801 (no fitBounds/flyTo, no publisher moves) · map/panel scope agreement (marker IIFE L3271–3364 + panel routing untouched) · coordinate privacy / auth-vs-anon parity (no marker/query code in scope) · prop-identity stability (hover commands memoised).
