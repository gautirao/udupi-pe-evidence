# Issue #1824 — Slice S2c Investigation (area-search state)

Phase 0.7 re-entry after S2b merged (PR #1844 → 06ba90ad). Read-only investigation (explorer-planner) against `origin/main @ 06ba90ad` (includes merged S1 useDiscoverInteractionState + S2a useReducedMotion + S2b useRegionGuideState). Fresh branch: `issue-1824-s2c-area-search` in worktree `.../issue-1824-map-discovery-decomposition`. This is the FINAL S2 sub-slice.

## Current-main facts (re-verified line numbers, post-S1/S2a/S2b)

| Item | Location | Detail |
|---|---|---|
| `areaSearchQuery` | MapDiscovery.tsx:1214 | `useState('')` — raw user input |
| `debouncedAreaSearchQuery` | MapDiscovery.tsx:1215 | `useState('')` — 200ms-debounced value |
| Debounce effect | MapDiscovery.tsx:1216-1219 | `useEffect(() => { const t = setTimeout(() => setDebouncedAreaSearchQuery(areaSearchQuery), 200); return () => clearTimeout(t); }, [areaSearchQuery])` — 200ms, clearTimeout cleanup |
| Write site (single) | MapDiscovery.tsx:4096 | `onAreaSearchQueryChange={setAreaSearchQuery}` → DiscoverRightPanel → ScopedSearch input (user typing) |
| Read site (single) | MapDiscovery.tsx:3054-3061 | `areaSearchMatchKeys` useMemo: filters `discoverAreas` by substring on `debouncedAreaSearchQuery.trim().toLowerCase()` (areaLabel/areaKey includes) → returns `string[]` or undefined |
| Downstream | MapDiscovery.tsx:3455 | `areaSearchMatchKeys` prop → PropertyMap → AreaMarkerLayer `applyForcedAlways` bucketing (marker promotion) |

## Coupling verdict — Low risk, purely LOCAL
Confirmed: the debounced value feeds ONLY the `areaSearchMatchKeys` useMemo (a pure client-side substring filter over already-loaded `discoverAreas`), whose result drives AreaMarkerLayer marker bucketing. **NO** camera-intent, **NO** URL writes, **NO** server query (does NOT feed useDiscoverMapData or any request). This is the local list-filter the S1 review said drives "marker promotion" locally — confirmed. Zero coupling to URL/query/camera/marker-selection state.

## Existing shared hook
None — no debounced-search / useDebounce / area-search hook exists in src/hooks, src/lib, src/features. S2c creates the first. Convention location: `src/features/discover/state/`.

## Hook-shape decision — flat object (NOT ControllerResult, NOT a plain value)
This slice sits between S2a and S2b:
- S2a returned a plain boolean (no setter/command).
- S2b returned ControllerResult<view, commands> because of an ATOMIC multi-field transition (armRegionSelect) that warranted a memoised commands object.
- S2c has TWO values (raw + debounced) AND a setter, but the setter is the natively-stable `useState` setter (`setAreaSearchQuery`) with NO atomic multi-field transition and NO derived command.

Recommended shape — a flat object:
```ts
export function useAreaSearchState(): {
  areaSearchQuery: string;
  debouncedAreaSearchQuery: string;
  setAreaSearchQuery: React.Dispatch<React.SetStateAction<string>>;
};
```
Internals: 2 useState + the 200ms debounce useEffect (verbatim, with clearTimeout cleanup).
- **No commands-object memoization needed** (the S1/S2b concern does NOT apply here): the returned object is destructured field-by-field in MapDiscovery, and `setAreaSearchQuery` is the inherently-stable `useState` setter — no wrapping commands object has a consumer identity dependency. (If PLAN_REVIEW prefers ControllerResult for strict convention consistency, that is acceptable but would be over-shaped for a single stable setter; the flat object is the idiomatic React debounced-search shape.)
- Preserve the 200ms delay + clearTimeout cleanup + `[areaSearchQuery]` dep exactly.

## 7A applicability — REQUIRED (borderline; erring toward required, NOT defaulting SKIP)
Honest assessment per Main Agent guidance: area-search DOES have a user-visible interactive surface — a search input (ScopedSearch) where typing filters which area markers appear on the map (via AreaMarkerLayer promotion). That is interactive (typing → visible marker change), more than S2a's thin boolean passthrough, so I do NOT default to SKIP; I propose **7A = REQUIRED**, consistent with how S2b's interactive surface was handled.

BUT it is genuinely borderline / thinner than S2b, because: the `areaSearchMatchKeys` useMemo AND the prop wiring to PropertyMap STAY in the page byte-identical — only the 2 state vars + the debounce effect move. The behaviour-preserving risk (does the debounced value still get produced after 200ms) is FULLY unit-testable (fake timers). So PLAN_REVIEW/Main Agent MAY reasonably downgrade to SKIP if they judge the hook unit test (debounce timing + cleanup) + the unchanged downstream wiring to be sufficient coverage.

Caveat either way: the Chrome browser-automation permission gate remains unresolved (S1/S2b both BLOCKED on it), so a live 7A will again BLOCK → S1-style user-override. Automated coverage is a NEW hook unit test (fake-timer debounce, cleanup, both values). Unlike S2b there is NO pre-existing area-search integration test (see below), so the coverage rests on the hook unit test + the byte-identical downstream filter/prop wiring.

## Test coverage
explorer-planner found NO existing test file specifically covering areaSearchQuery / debouncedAreaSearchQuery / the area-search input-filter behaviour in the worktree. The broader MapDiscovery/discover batch remains the regression guard for the unchanged downstream wiring. S2c adds a NEW hook unit test (fake timers: type → after 200ms debounced updates; cleanup clears the pending timer on rapid input / unmount; both values exposed). PLAN_REVIEW may want a small characterisation test of the areaSearchMatchKeys filter if it is not already covered, but that useMemo is UNCHANGED (stays in page) so it is out of the strict extraction scope.
