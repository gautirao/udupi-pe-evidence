# Issue #1824 — Baseline Metrics (Phase 0 characterisation)

**Worktree branch:** `issue-1824-map-discovery-decomposition`
**Baseline SHA:** `e79526df` (origin/main; #1825 frontend-test-baseline-restoration CLOSED here)
**File:** `src/pages/MapDiscovery.tsx`
**Captured:** 2026-07-12 (Phase 0.7, pre-implementation)

## File metrics (current baseline)

| Metric | Value | Source |
|---|---|---|
| Total lines | 4221 | `wc -l` |
| `import` statement lines | ~71 | L1–71 (explorer-planner) |
| `MapDiscovery()` body | L687 → L4221 (3534 lines) | explorer-planner + architect (direct read) |
| Pre-component pure helpers | L1–687 (already separated) | `deriveDiscoverBadge`, `deriveSchoolFirstLandingSchoolCount`, `deriveShowSchoolMarkers`, `applyAnonPropertyFilters`, `deriveAnonSchoolRadiusMarkers`, `hasActiveAnonPropertyFilter` |
| `useState` calls | ~23 | explorer-planner enumeration |
| `useEffect` calls | ~20 | explorer-planner enumeration |
| `useMemo` calls | ~25 | explorer-planner enumeration |
| `useCallback` calls | ~17 | explorer-planner enumeration |
| `useRef` calls | ~12 | explorer-planner enumeration |
| Domain/query hook calls | ~15 | useAreaGroups, useRegionalAreaGroups, useAgriMapListings, useDiscoverListings, useDiscoverFilteredMarkers, useDiscoverCityListings, useDiscoverPageState, useDiscoverMapData, useDiscoverAreas, useSchoolsByArea, useDiscoverSummary, useDiscoverUrlState, … |
| `eslint-disable react-hooks/exhaustive-deps` | 12 | L727, 922, 1657, 1671, 2004, 2050, 2338, 2395, 2416, 2474, 2513, 2696 |

> Historical figures cited in #1666/#1824 (≈2934 lines, cyclomatic 934, hotspot 4310.5) predate current `main` and are superseded by the counts above. They are recorded for provenance only.

## Static-analysis provenance note

SonarQube/CI is **billing-blocked** in this repo (see memory `ci-actions-billing-blocked`). Per the #1825 validation-policy precedent, all static-analysis evidence in this programme is **local-only** and labelled as such. Programme-level Sonar deltas will be captured via local static analysis where available; the authoritative CI path is documented as unavailable, not silently skipped.

## Frontend test baseline

Per #1824's blocking comment and #1825 closure evidence, the formal green baseline at `e79526df` is:

- **3527 total / 3524 passed / 0 failed / 3 skipped**, two consecutive byte-identical batched full-suite runs.

The full vitest suite **OOMs in a single process** (memory `frontend-vitest-fullsuite-ooms-batch-runner`); the batched-runner approach from #1825 (`docs/audit/evidence/issue-test-main-129-failures/`) is the authoritative way to reproduce it. This baseline is recorded rather than re-run during planning; each decomposition slice must preserve the green suite, verified via focused + relevant-batch runs during Stage-B validation.

## The 12 exhaustive-deps suppressions (essentiality)

| Line | Guards | Verdict |
|---|---|---|
| L727 | URL-init effect | Essential (init-once) |
| L922 | interaction/emphasis effect | Removable-later (once ephemeral cluster extracted) — verify governs hover cluster |
| L1657, L1671 | mapData/query wiring | Essential (ref-stability) |
| L2004 | badge memo (primitive-length deps) | Essential (avoids identity churn) |
| L2050 | badge announce | Essential now |
| L2338, L2395, L2416, L2474, L2513 | journey / camera effects | Essential now; revisit per-slice |
| L2696 | activeContextChips (array-ref deps) | Essential (prevents infinite loop, L2648–2649) |

**Rule for the programme:** when a slice moves suppressed code, it carries the suppression **and its comment verbatim** — never opportunistically "clean up" a suppression inside a behaviour-preserving extraction PR.
