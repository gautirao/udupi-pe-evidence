# Issue #1824 — Slice S4 Design (search-keyword state extraction; the reordered #1666)

Phase 0.7 for S4 (HIGH risk — the badge correctness surface + the search "split-brain"). Baseline `origin/main @ 7aed80eb` (S1/S2a/S2b/S2c/S3 merged). Branch `issue-1824-s4-filter-search`. Read-only: explorer-planner factual inventory + architect design. No production code changed.

## Critical finding — it's a DUAL-DEBOUNCE, not just a split-brain
`urlActions.setSearchQuery` (useDiscoverUrlState L1036) is itself a `useCallback` writer with its OWN internal debounce timer. So the search keyword has TWO independent debounces:
- local 250ms: `searchQuery → debouncedSearch` → **badge + useDiscoverMapData markers**
- URL-side debounce (in useDiscoverUrlState): `→ urlState.q` → **ActiveContextChips + reverse-sync seed**
These are deliberately decoupled. Unifying them (making chips read `debouncedSearch`, or collapsing the two debounces) is a BEHAVIOUR change — out of S4 scope (that is #1824-4b / #1824-4c, each its own approved issue).

## Current-main facts (@7aed80eb, MapDiscovery.tsx)
| Item | Location |
|---|---|
| `searchQuery` useState (lazy init from urlState.q) | L1086 |
| `debouncedSearch` useState (lazy init from urlState.q) | L1087 |
| reverse URL-sync effect (urlState.q → setSearchQuery), dep [urlState.q], eslint-disabled | L1291-1298 |
| local debounce effect (250ms, clearTimeout cleanup, dep [searchQuery]) | L1300-1303 |
| `handleSearchChange` (dual write: setSearchQuery + urlActions.setSearchQuery), dep [urlActions] | L1305-1311 |
| BADGE: discoverBadge useMemo (reads **debouncedSearch** at L1961) | L1935-1980 |
| `deriveDiscoverBadge` (PURE exported helper — the correctness logic) | L198-358 |
| useDiscoverMapData (reads **debouncedSearch**) | L1514 |
| ActiveContextChips useMemo (reads **urlState.q** at L2614; onClearSearch→urlActions.setSearchQuery('')), eslint-disable L2670 | L2611-2672 |
| `handleClearAllFiltersAndSearch` (handleFiltersChange({}) + urlActions.setSearchQuery('')) | L2606-2609 |
| filters (owned by useDiscoverPageState — NOT local) | via useDiscoverPageState |

## Split-brain map (PRESERVE byte-identically — do NOT fix)
| Representation | Source after S4 | Consumer (unchanged) |
|---|---|---|
| searchQuery (raw, immediate) | hook state | input value; seeds debounce + reverse-sync compare |
| debouncedSearch (local 250ms) | hook state | **badge memo L1961** + useDiscoverMapData L1514 |
| urlState.q (URL-side debounced) | stays in page (useDiscoverUrlState) | **ActiveContextChips L2614** + reverse-sync input |

## 1. EXACT S4 SCOPE — search-keyword state ONLY (not "filter/search")
Filters are already `useDiscoverPageState`-owned; there is NO filter state left in MapDiscovery to extract. So S4 = search-keyword state extraction.
- IN: searchQuery + debouncedSearch + reverse URL-sync effect + 250ms debounce effect + handleSearchChange → new hook `useDiscoverSearchState`; call-site rewire; hook unit test; documented split-brain invariant.
- OUT (each a separate future approved issue): 4b chips↔badge unification (BEHAVIOUR change); 4c debounce hardening (BEHAVIOUR change); `handleClearAllFiltersAndSearch` + filter state (owned elsewhere; stays in page unchanged); useDiscoverMapData's debouncedSearch consumption (unchanged).

## 2/3. Hook contract — `src/features/discover/state/useDiscoverSearchState.ts` (flat object)
DECISION: the hook does NOT import useDiscoverUrlState (URL ownership stays single-owner in the page). It takes the URL coupling as TWO injected params: `urlQ: string` (current urlState.q, drives reverse-sync) + `setUrlSearch: (q:string)=>void` (= urlActions.setSearchQuery, already URL-side debounced).
```ts
export function useDiscoverSearchState({ urlQ, setUrlSearch }): {
  searchQuery: string; debouncedSearch: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  handleSearchChange: (q: string) => void;
};
```
Internals (VERBATIM from the page): 2 useState with LAZY init `useState(() => urlQ)` (matches L1086-1087); reverse-sync effect `if (urlQ !== searchQuery) setSearchQuery(urlQ)` dep `[urlQ]` + the eslint-disable (verbatim from L1291-1298); 250ms debounce effect + clearTimeout cleanup dep `[searchQuery]` (verbatim from L1300-1303); handleSearchChange useCallback dual-write `setSearchQuery(q); setUrlSearch(q)` dep `[setUrlSearch]` (verbatim behaviour of L1305-1311).
Rationale for callback-injection over passing whole urlActions: gives the hook exactly ONE URL capability (no over-coupling, no temptation to call other URL setters); stability preserved because urlActions.setSearchQuery is a stable useCallback (L1036).
Call site: `const { searchQuery, debouncedSearch, setSearchQuery, handleSearchChange } = useDiscoverSearchState({ urlQ: urlState.q, setUrlSearch: urlActions.setSearchQuery });`. Everything downstream (chips searchQuery={urlState.q}, badge searchQuery:debouncedSearch, useDiscoverMapData({debouncedSearch})) is UNTOUCHED — the split is preserved because no consumer rewires to a different representation.
Keep `setSearchQuery` in the return (a pure move; verify no stray external ref before removing the local decl; if one exists, keep exposing it).

## 3b. Document the invariant (prevent accidental future "unification")
Header comment in the hook + one-line pointer comments at the badge memo + the chips memo: "KNOWN, INTENTIONAL split-brain preserved from #1666 — debouncedSearch (this hook, 250ms) drives badge+markers; urlState.q (URL-side debounce) drives ActiveContextChips. Do NOT unify here — that is #1824-4b/4c, a behaviour change needing its own issue + badge re-characterisation. Byte-identical badge output is the correctness invariant."

## 4. Clear-all still works (traced)
`handleClearAllFiltersAndSearch` stays in the page unchanged. Trace: click → urlActions.setSearchQuery('') → (URL-side debounce) → urlState.q='' → page re-renders → hook gets urlQ='' → reverse-sync fires (`''!==searchQuery`) → setSearchQuery('') → local debounce → debouncedSearch='' → badge+map recompute unfiltered; ActiveContextChips reads urlState.q (now '') → chip clears. IDENTICAL to today. The dual-debounce latency on clear is a PRE-EXISTING preserved property — do NOT shortcut it (that would be 4c).

## 5. Sub-split decision — ONE PR (decisive)
S4 ships as a single behaviour-preserving PR. Rationale: (a) the badge correctness net already exists — `deriveDiscoverBadge` is a pure exported helper with an existing dedicated unit suite (MapDiscovery.issue1152.test.ts); S4 does NOT touch that helper or the value passed to it (debouncedSearch), so there is no badge-logic change to gate behind a test-first PR; (b) the move is mechanically small (~26 lines, same shape as S2c's useAreaSearchState which shipped as one PR); (c) a test-first split adds no safety when the net already exists and stays green — the only NEW test is the hook's own unit test, which must land with the hook. Contrast: 4b/4c ARE the behaviour changes and are already carved out as separate issues. Guardrail: if the implementer must MODIFY an existing badge/chips assertion to pass, that is a behaviour-change signal → STOP + escalate (blocked BEHAVIOUR_CHANGE_DETECTED), never adjust the test.

## 6. Test strategy
(a) EXISTING badge net — must pass with ZERO diffs: MapDiscovery.issue1152.test.ts (deriveDiscoverBadge across cityTotal/zero/loading/q-active/q-empty/school), MapDiscovery.anon-school-radius.test.ts (anon+school-radius badge). Byte-identical badge output = the invariant. If the {anon,auth,school-radius,q-active,q-empty}×{loading,loaded,zero} matrix has a gap, ADD missing PURE-HELPER cases in-PR (safe, strengthens net); do NOT modify existing cases.
(b) NEW hook unit test useDiscoverSearchState.test.tsx (renderHook + vi.useFakeTimers): init from urlQ; handleSearchChange → searchQuery immediate + setUrlSearch called (dual-write) + debouncedSearch after 250ms; rapid-input coalescing; reverse-sync on new urlQ; URL-clear (urlQ='' → searchQuery='' → debouncedSearch=''); handleSearchChange identity stability.
(c) EXISTING integration/round-trip suites green UNCHANGED: chips + filter-clear integration, useDiscoverUrlState.test.ts (q round-trip), MapDiscovery render smoke.

## 7. 7A — SKIP (honest)
Behaviour-preserving move; badge logic unchanged (pure helper + existing suite); the new hook is unit-tested; env has NO seeded area data (Bangalore+Udupi "No areas found") so a live filtered-marker render is non-informative (assertion-free green screen). Do NOT label any unit run as "browser verification PASS." PLAN_REVIEW decides.

## 8. Risks + completion criteria
Key risk: a badge timing/output change (the correctness surface). Mitigations: debouncedSearch value + deriveDiscoverBadge unchanged; 250ms + cleanup verbatim; [urlQ] preserves reactivity; handleSearchChange [setUrlSearch] stable; chips L2614 must stay reading urlState.q; existing badge suite must pass with ZERO test edits.
Completion: tsc no-new-errors; build 0; lint no-new (2 eslint-disables move verbatim, no new disables); badge suite green with zero diffs; hook unit test green; existing chips/filter-clear/URL-round-trip/render-smoke green UNCHANGED; split-brain preserved+documented (chips L2614 + badge L1961 unchanged); URL round-trip preserved; diff limited to the new hook+test + the MapDiscovery deletions + one destructure + comment lines.
