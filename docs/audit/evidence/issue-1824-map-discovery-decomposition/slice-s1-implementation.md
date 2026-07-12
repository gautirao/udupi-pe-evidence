# Slice S1 implementation note — ephemeral hover/emphasis cluster extraction

## Files created
- `src/features/discover/state/useDiscoverInteractionState.ts` — new leaf controller
  hook. Owns three `useState` calls (`hoveredListingId`, `hoveredAreaKeyForMap`,
  `highlightedAreaKeys`) behind a `{ view, commands }` API. Defines
  `ControllerResult<TView, TCommands>` locally (did not previously exist anywhere
  in the codebase — confirmed via full-repo text search).
- `src/features/discover/state/useDiscoverInteractionState.test.tsx` — 8 tests:
  initial state, each command in isolation, `clearHighlightedAreas`, callback
  referential stability across both a plain re-render and a state-changing
  re-render, and the AC3 no-reset characterisation test.

## Files modified
- `src/pages/MapDiscovery.tsx` — replaced the three inline `useState` declarations
  with one `useDiscoverInteractionState()` call, destructured `view`/`commands`,
  and rewired every read/write site (see below). Line count: 4221 → 4219 (net -2;
  comment consolidation offset by the added import + hook-call lines).

## Journey-reset finding (AC3 / OQ1 / OQ2)
Exhaustive full-file search (`hoveredListingId|hoveredAreaKeyForMap|highlightedAreaKeys|
setHoveredListingId|setHoveredAreaKeyForMap|setHighlightedAreaKeys`) against
`src/pages/MapDiscovery.tsx` before any edit returned exactly 15 matches, all
accounted for by: the 3 declarations, 2 doc-comment mentions, `handleAreaClusterClick`,
and the 6 read/write usage sites listed below. **No effect, handler, or comment
anywhere in the file resets `highlightedAreaKeys` (or the other two) on journey
change, area-back, or Start Over.** `highlightedAreaKeys` is set exclusively by
`handleAreaClusterClick` and otherwise persists until the next cluster click or a
full component remount (URL/journey navigation elsewhere in the app remounts
`MapDiscovery`, which is the *only* existing reset path, and it is implicit —
not an effect keyed on `urlState.journey`).

**Conclusion: NO reset effect exists today.** Per the task's explicit instruction
("If NO reset currently exists: DO NOT invent one... write the characterisation
test to capture what actually happens today"), no reset logic was added. The new
`useDiscoverInteractionState.test.tsx` includes a characterisation test
(`characterises no-reset behaviour: highlightedAreaKeys persists once set until
explicitly cleared`) asserting the value survives unrelated re-renders and only
changes via an explicit command call — proving the extraction did not introduce
new reset behaviour.

**OQ1 (eslint-disable at ~L922/923 scope):** read in context (`groupResultsAnonRaw`
useMemo, stripping `backOnMarket`/`newToMarket`/`readyToMove` via destructuring
before calling `applyAnonPropertyFilters`). This suppression is unrelated to the
hover/emphasis cluster — it guards an unused-vars lint rule on a destructuring
pattern in the anon-teaser filter-stripping logic. **It does not belong to the
moved code and was left untouched** (not moved, not touched).

## Usage sites rewired (file:line, post-edit)
- `src/pages/MapDiscovery.tsx:1204` — `useDiscoverInteractionState()` call site
  (`interactionView`/`interactionCommands` destructured).
- `src/pages/MapDiscovery.tsx:1264` — `handleAreaClusterClick` now calls
  `interactionCommands.setHighlightedAreas(...)` (dep array updated to
  `[interactionCommands]`).
- `src/pages/MapDiscovery.tsx:3478` — `PropertyMap hoveredAreaKey={hoveredAreaKeyForMap}`
  (unchanged JSX — destructured local var name preserved for a minimal diff).
- `src/pages/MapDiscovery.tsx:3556` — `PropertyMap hoveredListingId={hoveredListingId}`
  (unchanged JSX, same reason).
- `src/pages/MapDiscovery.tsx:4111` — `DiscoverRightPanel
  onHoverResultListing={interactionCommands.hoverListing}`.
- `src/pages/MapDiscovery.tsx:4117` — `DiscoverRightPanel
  onAreaHover={interactionCommands.hoverArea}`.
- `src/pages/MapDiscovery.tsx:4121` — `DiscoverRightPanel
  highlightedAreaKeys={highlightedAreaKeys}` (unchanged JSX, same reason).

Note: the three view fields (`hoveredListingId`, `hoveredAreaKeyForMap`,
`highlightedAreaKeys`) were destructured from `interactionView` using their
original names, so the existing JSX prop-read sites required no text change —
only the two setter-prop sites (`onHoverResultListing`, `onAreaHover`) and the
`handleAreaClusterClick` writer needed rewiring to `interactionCommands.*`.

## Validation
| Command | Result |
|---|---|
| `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` | exit 2, but **identical 226-error set** to the pre-change baseline (verified via `git stash`/`stash pop` diff of the same command); zero errors touch `MapDiscovery.tsx` or `useDiscoverInteractionState.*` |
| `npm run test src/features/discover/state/useDiscoverInteractionState.test.tsx -- --run` | exit 0, 8/8 tests passed |
| `npx eslint src/pages/MapDiscovery.tsx src/features/discover/state/useDiscoverInteractionState.ts src/features/discover/state/useDiscoverInteractionState.test.tsx` | 0 errors, 16 warnings — **identical 16-warning baseline** (verified via stash/pop), no new warnings, exhaustive-deps/unused-directive suppression count unchanged (5 before, 5 after) |
| `npm run build` | exit 0, built in 6.26s |

(Worktree had no `node_modules` at task start; ran `npm ci` first per repo convention
for a fresh worktree — this is a one-time environment setup step, not a scope change.)

## Post-review fix (code-reviewer REQUEST_CHANGES, cycle 2)

**Blocking finding:** `useDiscoverInteractionState`'s returned `commands` object
was a fresh literal on every render. The four functions inside it were each
individually `useCallback`-stable, but the wrapping object was not — so its
*identity* churned every render. `MapDiscovery.tsx`'s `handleAreaClusterClick`
depends on `[interactionCommands]` (the whole object), so that callback became
unstable too, and it flows `PropertyMap` → `AreaMarkerLayer`'s
`onAreaClusterClick`, a dependency of the Leaflet marker-build `useEffect`
(~L677-691) — meaning every unrelated MapDiscovery re-render (any keystroke,
any unrelated state change) tore down and rebuilt every cluster marker on the
map. This was a real perf/behaviour regression versus the pre-extraction
`[]`-stable `useState` setter.

**Fix applied** (`src/features/discover/state/useDiscoverInteractionState.ts`):
wrapped the returned `commands` object in `useMemo`, keyed on the four
already-stable callbacks, so the object itself is now referentially stable
across renders:

```ts
const commands = useMemo(
  () => ({ hoverListing, hoverArea, setHighlightedAreas, clearHighlightedAreas }),
  [hoverListing, hoverArea, setHighlightedAreas, clearHighlightedAreas],
);
```

The `view` object was deliberately left as a plain literal — it has no
consumer keyed on the whole-object identity (all its call sites read individual
fields), so memoising it would be unnecessary churn-avoidance with no real
consumer, per the reviewer's own "keep it minimal" guidance.

**Test added** (`useDiscoverInteractionState.test.tsx`): `keeps the commands
object itself referentially stable across re-renders` — asserts
`result.current.commands` `toBe` the same object across a plain `rerender()`
and across state-changing `act()` calls. Verified this test **fails** against
the pre-fix (unmemoised) source (`AssertionError: expected {...} to be {...}
// Object.is equality`) and **passes** against the fixed source — proving the
test actually exercises the regression.

**Re-validation after fix:**

| Command | Result |
|---|---|
| `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` | exit 2, **121 `error TS` occurrences — identical baseline**, none in `MapDiscovery.tsx` or `useDiscoverInteractionState.*` |
| `npm run test src/features/discover/state/useDiscoverInteractionState.test.tsx -- --run` | exit 0, 9/9 tests passed (new object-identity test included) |
| `npm run build` | exit 0, built in 6.38s |

No other file changed. `MapDiscovery.tsx` line count unchanged at 4219 (the fix
is entirely contained in `useDiscoverInteractionState.ts`/`.test.tsx`).

## Forbidden-surface confirmation
No changes to `useDiscoverUrlState`/`urlActions`, `useDiscoverMapData`/`useDiscover*`/
`useSchool*`/`useAgri*`, camera intent/publishers, the marker-selection IIFE
(L3271-3364 region untouched), `markerPixelPos`, `selectedMarkerListing`,
`prefersReducedMotion`, the region-select trio, area-search state, or any
search/filter/badge state. No backend/Supabase/DB/Flyway/OpenSearch/seed change,
no new dependency, no public URL-contract change, no visual redesign. No
eslint-disable suppression was removed, moved, or added.
