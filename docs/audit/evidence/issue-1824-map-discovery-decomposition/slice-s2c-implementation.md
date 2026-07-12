# Slice S2c implementation note — area-search state extraction

- Issue: #1824 (MapDiscovery.tsx decomposition)
- Branch: `issue-1824-s2c-area-search`
- Base commit: `06ba90ad` (post-S2b)

## What moved

Extracted the local area-search state out of `src/pages/MapDiscovery.tsx`
into `src/features/discover/state/useAreaSearchState.ts`:

- `areaSearchQuery` (`useState('')`)
- `debouncedAreaSearchQuery` (`useState('')`)
- the 200ms debounce effect, moved verbatim: `setTimeout(() =>
  setDebouncedAreaSearchQuery(areaSearchQuery), 200)`, `clearTimeout(t)`
  cleanup, `[areaSearchQuery]` dependency array — byte-identical to the
  pre-extraction source.

## Hook shape

Flat plain object, per the task spec — NOT the `ControllerResult` shape used
by S1/S2b (this cluster has no derived "view" vs. "commands" split; it is a
single query string plus its debounced echo, and `setAreaSearchQuery` is
the native `useState` setter, already referentially stable):

```ts
export function useAreaSearchState(): {
  areaSearchQuery: string;
  debouncedAreaSearchQuery: string;
  setAreaSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}
```

No `useMemo` wraps the returned object or the setter — over-engineering
avoided per the task instructions.

## What stayed in the page (by design)

The `areaSearchMatchKeys` `useMemo` (substring filter over the external
`discoverAreas` prop/state) remains in `MapDiscovery.tsx` — it reads
`discoverAreas`, which is not part of this state cluster, and was
explicitly out of scope for the move.

## Rewire sites (MapDiscovery.tsx)

- L1210-1213 (pre-edit) → replaced with a 3-line comment + hook call:
  `const { areaSearchQuery, debouncedAreaSearchQuery, setAreaSearchQuery } = useAreaSearchState();`
  Kept the destructured variable names identical to the pre-extraction
  `useState` bindings, so every downstream expression is textually
  unchanged.
- Read site: the `areaSearchMatchKeys` `useMemo` (now ~L3049-3056) still
  reads `debouncedAreaSearchQuery` unchanged.
- Write site: `onAreaSearchQueryChange={setAreaSearchQuery}` (now ~L4091)
  unchanged — resolves to the hook's setter.
- Import added: `import { useAreaSearchState } from
  '@/features/discover/state/useAreaSearchState';` alongside the existing
  `useRegionGuideState`/`useReducedMotion`/`useDiscoverInteractionState`
  imports.

Confirmed via full-file text search (post-edit, re-indexed): no remaining
reference to `setDebouncedAreaSearchQuery` anywhere in `MapDiscovery.tsx`.

## Boundaries respected

- `src/components/discover/ScopedSearch.tsx` — untouched.
- `DiscoverRightPanel` — untouched.
- `src/components/map/AreaMarkerLayer.tsx` — untouched; no test added to
  `AreaMarkerLayer.test.tsx`.
- `PropertyMap` — untouched.
- No URL/query/camera/marker-selection code touched.
- `areaSearchMatchKeys` `useMemo` not moved (stayed in the page, reads
  external `discoverAreas`).
- No new dependency added; no eslint-disable suppression added or removed.

## Line count

`src/pages/MapDiscovery.tsx`: 4199 lines before → 4194 lines after (net
−5 lines). `git diff --stat`: `1 file changed, 4 insertions(+), 9
deletions(-)`.

## Validation

1. `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` → exit 2,
   121 pre-existing errors (same baseline count as documented for S2b/06ba90ad).
   Reviewed the full error list — none cite `MapDiscovery.tsx` or
   `useAreaSearchState.*`.
2. `node node_modules/.bin/vitest run
   src/features/discover/state/useAreaSearchState.test.tsx` → 6 tests
   passed, exit 0 (fake timers; covers initial state, immediate
   `areaSearchQuery` update vs. 200ms-delayed `debouncedAreaSearchQuery`,
   rapid-input coalescing, timer reset on re-input before 200ms, debouncing
   an empty-string clear, and no throw/update-after-unmount).
3. `node node_modules/.bin/eslint src/pages/MapDiscovery.tsx
   src/features/discover/state/useAreaSearchState.ts
   src/features/discover/state/useAreaSearchState.test.tsx` → `0 errors, 16
   warnings`, exit 0 — identical warning count/content to the S2b baseline
   (all pre-existing `react-refresh/only-export-components` +
   unused-eslint-disable warnings in `MapDiscovery.tsx`; no new warnings).
4. `npm run build` → `vite build` succeeded, exit 0.

Did not run the full single-process vitest suite (documented OOM risk).
