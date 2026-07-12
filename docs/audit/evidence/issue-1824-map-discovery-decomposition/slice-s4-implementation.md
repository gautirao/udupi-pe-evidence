# Issue #1824 — Slice S4 Implementation Notes (search-keyword state extraction)

Branch `issue-1824-s4-filter-search` @ base `7aed80eb`. Single behaviour-preserving VERBATIM move per `slice-s4-design.md`.

## Files created/modified
- `src/features/discover/state/useDiscoverSearchState.ts` (new) — `searchQuery`/`debouncedSearch` state, the reverse URL-sync effect, the 250ms debounce effect, and `handleSearchChange`, moved verbatim out of `MapDiscovery.tsx`. Takes injected `urlQ` + `setUrlSearch` params; does NOT import `useDiscoverUrlState`.
- `src/features/discover/state/useDiscoverSearchState.test.tsx` (new) — renderHook + `vi.useFakeTimers()` unit suite (7 tests): init from urlQ; dual-write + 250ms debounce on `handleSearchChange`; rapid-input coalescing; reverse-sync on urlQ change; URL-clear reverse-sync; stable `handleSearchChange` identity; debounce timer cleared on unmount.
- `src/pages/MapDiscovery.tsx` — removed the two local `useState`s (L1086-1087), the reverse URL-sync effect (L1291-1298, eslint-disable carried verbatim into the hook), the 250ms debounce effect (L1300-1303), and `handleSearchChange` (L1305-1311). Added the `useDiscoverSearchState` import and a single call site: `const { searchQuery, debouncedSearch, handleSearchChange } = useDiscoverSearchState({ urlQ: urlState.q, setUrlSearch: urlActions.setSearchQuery })`. Added one-line split-brain pointer comments at the badge memo (`searchQuery: debouncedSearch`) and at `ActiveContextChips` (`searchQuery={urlState.q}`).

`setSearchQuery` is exposed in the hook's return type (per design §2/3, in case of a stray external ref) but is NOT destructured at the MapDiscovery call site — `search_text` over `local/issue-1824-map-discovery-decomposition-*` confirmed no reference to the local `setSearchQuery` outside the moved blocks, so destructuring it unused would trip `@typescript-eslint/no-unused-vars`.

## Confirmations
- Hook takes injected `urlQ`/`setUrlSearch`; does NOT import `useDiscoverUrlState` (verified: only import in the hook file is `useCallback`/`useEffect`/`useState` from react + a type-only `React` import).
- Internals verbatim: 250ms literal, `clearTimeout` cleanup, `[urlQ]` dep + eslint-disable on the reverse-sync effect, `[searchQuery]` dep on the debounce effect, lazy `useState(() => urlQ)` init (not eager), dual-write order `setSearchQuery(q)` then `setUrlSearch(q)`, `[setUrlSearch]` dep on `handleSearchChange`.
- Split-brain comment added in 3 places: hook header (full explanation), badge memo call site (one-liner), `ActiveContextChips` call site (one-liner).
- Moved blocks fully removed from `MapDiscovery.tsx`; `search_text` for `setDebouncedSearch`/`setSearchQuery(` post-edit returns zero hits outside `urlActions.setSearchQuery`. Badge memo (`searchQuery: debouncedSearch`, now ~L1961), `ActiveContextChips` (`searchQuery={urlState.q}`, now ~L2614), and `useDiscoverMapData({ ..., debouncedSearch })` (~L1514) all UNCHANGED — no consumer rewired.
- `MapDiscovery.tsx` line count: **4118 → 4110** (net -8; -29 lines of moved state/effects/handler, +21 lines of import/call-site/comments).

## Validation
| Command | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | Exit 2, but 121 errors — identical baseline count confirmed via `git stash` diff-free comparison; ZERO errors cite `MapDiscovery.tsx` or `useDiscoverSearchState.*` |
| `npx vitest run src/features/discover/state/useDiscoverSearchState.test.tsx` | Exit 0 — 7/7 tests passed |
| `npx vitest run src/pages/__tests__/MapDiscovery.issue1152.test.ts src/pages/__tests__/MapDiscovery.anon-school-radius.test.ts src/pages/__tests__/MapDiscovery.startOver-chip.test.tsx` | Exit 0 — 64/64 tests passed (42 + 21 + 1), badge suite UNCHANGED, zero test edits |
| `npx eslint src/pages/MapDiscovery.tsx src/features/discover/state/useDiscoverSearchState.ts src/features/discover/state/useDiscoverSearchState.test.tsx` | 16 warnings, 0 errors — identical to baseline (`git stash` + re-lint confirmed 16 warnings pre-change too, same categories/counts, only line numbers shifted) |
| `npm run build` | Exit 0 |

No existing test file was modified. No new dependency added. No new eslint-disable added beyond the 2 that moved verbatim into the hook.
