# Issue #1824 — Slice S9b Design (presentation-model derivations → useDiscoverMapPresentation; SPLIT S9b1/S9b2)

Phase 0.7 for S9b. Baseline `origin/main @ 21a7f475` (S1-S9a merged; MapDiscovery.tsx = 2787). Read-only: explorer-planner inventory + architect design (CURRENT post-S9a line numbers verified against the file). No production code changed.

## Headline — SPLIT S9b into S9b1 → S9b2

The Main Agent framed S9b as one slice (the useDiscoverMapPresentation presenter hook). The architect recommends **splitting**, isolating the highest-risk overviewAreas:
- **S9b1 (this packet):** move `overviewAreas` (L1689-1925, 237 LOC, 6 branches, 16-dep array, the #1655/#1745/#1815 marker-bucketing surface — the single most dangerous body in the page) + `areaSearchMatchKeys` (L1948-1955) into the NEW `useDiscoverMapPresentation` hook (FLAT `{ overviewAreas, areaSearchMatchKeys }`). **High risk.** 2787 → ~2550.
- **S9b2 (next slice):** EXPAND the same hook with the badge/copy/counts/region/segment cluster — `discoverBadge` (Critical #1152/#1175), `areaResultSummaryText` (S8 copy-fork single source), `focusedGroup`, the school-first counts, the breadcrumb builders, `resolvedRegionLabel`/`resolvedScopeKeyForHref`, the S8 copy consts. Med-High. ~2550 → ~2375.

**Why split:** overviewAreas is cleanly separable — of its 16 deps, ~11 are unique to it; only 3 shared inputs (focusedGroup, discoverAreas, summaryRegions), all injectable; the cross-cluster coupling is forward-only, single-edge, no cycle (only `regionOverviewMarkerKind` reads overviewAreas, and it lands in S9b2). Splitting isolates the 237-LOC marker-bucketing body from the Critical badge diff → focused review + regression + clean rollback (a marker regression won't force reverting the badge work). One shared hook FILE grown across two PRs.

## Open questions — resolved

- **(a) currentMapMarkerListings IIFE + markerPopoverStepper + handleStepMarkerListing (~L2143-2186):** STAY IN PAGE → S10 (marker-interaction, not a presentation-model derivation; the S5 marker-selection contract).
- **(b) resolvedRegionLabel/resolvedScopeKeyForHref (plain consts feeding breadcrumbs):** MOVE into S9b2 with the breadcrumbs.
- **(c) breadcrumb builders (L2073-2130) + the rules-of-hooks note L2111-2114:** NOT blocked — moving them INTO the top-of-component presenter hook REMOVES them from the conditional post-early-return region. INCLUDE in S9b2, kept as plain non-memoized consts VERBATIM (do NOT upgrade to useMemo — changes segment-array identity every render).
- **(d) schoolFirstAreaSchoolCount (not memoized):** move VERBATIM as a plain const (S9b2), do NOT wrap in useMemo (behaviour change).

## S9b1 FLAT hook contract

`useDiscoverMapPresentation({ ...injected }): { overviewAreas, areaSearchMatchKeys }`. Called at the top of the component (pre the L2132 early return). Injected (pass EXISTING refs UNWRAPPED — memo identity-stability is load-bearing): urlState (full object; the dep array lists sub-fields scope/areaKey/viewport, NOT the whole object); useDiscoverMapData outputs (discoverAreas/liveAreas/areaGroupsData/isLoadingAreaGroups/corridorGroups/agriAreasData/isLoadingRegionalAreaGroups); useDiscoverSummary summaryRegions; focusedGroup (page memo, stays in page for S9b1); mapLayerKind; cityCenter; isLandingState; isAreaFirstCityLanding; debouncedAreaSearchQuery. Helpers imported directly from `src/features/discover/presentation/*` (NOT the shim).

## Behaviour-preservation (verbatim)

- overviewAreas: all 6 branches in order (zoom/agri→[]; area-group-bubbles; macro-region-bubbles; agri-corridor-bubbles; areaKey-selected→[]; focusedGroup-selected; all-areas); the 16-dep array (L1908-1925) VERBATIM; the coordinate-source fallback ladders (focus lat/lon → member centroid → label-substring → viewport/cityCenter offset, L1810-1821/L1859-1864) byte-for-byte.
- areaSearchMatchKeys: the debouncedAreaSearchQuery substring filter verbatim.
- **HIGHEST RISK — memo identity stability:** an injected dep losing referential stability re-runs the 237-LOC body every render. Pass the existing useDiscoverMapData/useDiscoverSummary/focusedGroup references UNWRAPPED (no re-wrap/spread/`?? []`/`.map()` at the call site). Keep the 16-dep array listing sub-fields, NOT the whole urlState (over-invalidation).
- The `regionOverviewMarkerKind` seam (stays in page for S9b1) reads the hook's RETURNED overviewAreas.

## Regression / tests / risk

- Existing mount tests cover overviewAreas via the PropertyMap markers/areas props (the marker-bucketing contract): issue1655, issue1745-batchB-overviewClick, issue1815 + issue1815.r3b, issue1806.groupScope, issue1458.agri-filter, issue1069, groupResults. Green UNCHANGED (lift-and-shift).
- **ONE mandatory new renderHook test** (useDiscoverMapPresentation.overviewAreas.test.ts): one case per overviewAreas BRANCH (6) + a MEMO-IDENTITY-STABILITY case (overviewAreas === prior ref across a no-op rerender — the load-bearing anti-churn guard). The mount tests assert overviewAreas only indirectly via marker counts; this makes the 6-branch + identity contract explicit.
- Risk: **High** (S9b1). NO live 7A (mount + renderHook suffice; overviewAreas output asserted via PropertyMap props). Optional non-gating manual :5174 spot-check of a region-bubbles overview state (label MANUAL_PASS).
- code-reviewer OPUS (the most dangerous body + the memo-identity hazard).

## LOC + roadmap

post-S9b1 ~2550; post-S9b2 ~2375. <800 needs S10 (handlers/interaction: the marker-resolve cluster + handleOverviewAreaClick + the aria-live announce effect, ~-400/-600) + S11 (the ~600-LOC JSX return tree → sub-view components, the big lever, ~-900/-1200). S9b clears the derivation band so S11's JSX reads hook outputs cleanly.

## Open questions (for PLAN_REVIEW)

1. OQ-SPLIT: ratify S9b1/S9b2 (this packet = S9b1 only).
2. OQ-INJECT: full-urlState-inject + sub-field dep array (recommended) vs narrow field list — both behaviour-preserving.
3. OQ-<800: S9b lands ~2375; S10 + S11 (JSX) required.
Extraction-time: confirm regionGuideVisible/RingActive inject from the S2b region-guide hook (S9b2); confirm cityTotal source (memo-that-moves vs hook-output-injected) before S9b2.
