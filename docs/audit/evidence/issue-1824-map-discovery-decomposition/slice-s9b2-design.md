# Slice S9b2 — Design (RE-SCOPED region/breadcrumb cluster)

Base: origin/main @ `25f9ae5e` (MapDiscovery.tsx 2542 lines). Target hook:
`src/features/discover/presentation/useDiscoverMapPresentation.ts` (created S9b1, currently
returns `{ overviewAreas, areaSearchMatchKeys }`).

## Re-scope decision (Main-Agent-ratified 2026-07-13, option A)

The originally-framed S9b2 (badge/copy/`focusedGroup` + counts + region + segments → the hook) is
**INFEASIBLE**. The hook is structurally PINNED at L1694 (needs `mapLayerKind`, L1684), but
`discoverBadge` (L1193) and `focusedGroup` (L1112) have **hard pre-L1694 consumers**: the aria-live
announce effect (L1267) and S7 `useDiscoverCameraOrchestration` (L1302, injects `focusedGroup`). Moving
them into a hook called at L1694 is a temporal-dead-zone. Resolving it would require reordering the S7
camera/aria-live hooks (high blast radius) or folding a debounced a11y timer into the Critical
#1152/#1175 badge hook (concern-mixing) — both rejected for a behaviour-preserving slice.

The copy-fork single-source invariant is **already** enforced in-page: ONE `formatDiscoverBadgeCopy`
call at L1250 feeds both the map badge and `AreaSelectedPanel` (AreaSelectedPanel.tsx L42-54 documents
this). Leaving the badge cluster page-local costs zero correctness.

→ **Re-scope to the region/breadcrumb cluster ONLY** — all post-L1694, all readers of the hook's
existing `overviewAreas` return + a few pre-L1694 injectable values.

## Moved blocks (7)

| Block | Base lines | New inject needed | Returned? |
|---|---|---|---|
| `isRegionOverview` | L1795-1801 | `selectedMarkerListing` | ✅ (L1825/L2181) |
| `resolvedRegionLabel` | L1777-1780 | — | ✅ (L2162/L2165) |
| `resolvedScopeKeyForHref` | L1782-1786 | — | ⬜ internal |
| `regionOverviewMarkerKind` | L1808-1811 | — (reads moved `isRegionOverview` + `mapLayerKind` + `overviewAreas`) | ✅ (L2166/L2184/L2337) |
| `regionOverviewShortLabel` | L1813-1821 | `city` | ✅ (L2183) |
| `areaJourneySegmentsRaw`+`areaJourneySegments` | L1828-1858 | `city`, `selectedArea` | ✅ `areaJourneySegments` (L2127); Raw internal |
| `schoolJourneySegmentsRaw`+`schoolJourneySegments` | L1860-1885 (incl. L1866-1869 note) | `city`, `selectedArea`, `selectedSchool` | ✅ `schoolJourneySegments` (L2128); Raw internal |

**4 new inject params:** `city`, `selectedArea`, `selectedSchool`, `selectedMarkerListing` — all defined
BEFORE L1694 (`selectedMarkerListing` L544-558, `selectedArea` L660, `selectedSchool` L661). No TDZ.

**6 new returns:** `resolvedRegionLabel`, `isRegionOverview`, `regionOverviewMarkerKind`,
`regionOverviewShortLabel`, `areaJourneySegments`, `schoolJourneySegments`.
**Internal (not returned):** `resolvedScopeKeyForHref`, `areaJourneySegmentsRaw`, `schoolJourneySegmentsRaw`.

## Load-bearing decision: `isRegionOverview`

`regionOverviewMarkerKind` (ratified) reads `isRegionOverview` (L1795, post-L1694). Injecting it bare is
a TDZ. It reads only `urlState.*` (injected) + `selectedMarkerListing` (pre-L1694). So it moves in as the
**minimal single-param closure** — one new param (`selectedMarkerListing`), nothing else dragged; its
page consumers (`regionGuideVisible` L1825, `regionGuideRingActive` L1826, props L2181) stay page-local
reading the returned boolean. This is the one addition beyond the ratified 6.

## Hook body order (top-down intra-hook reads)

`[existing 2 useMemo]` → `isRegionOverview` → `resolvedRegionLabel` → `resolvedScopeKeyForHref` →
`regionOverviewMarkerKind` → `regionOverviewShortLabel` → `areaJourneySegmentsRaw` →
`areaJourneySegments` → `schoolJourneySegmentsRaw` → `schoolJourneySegments`. **All plain consts** —
recompute every render, identical to today.

## Key gate: AC-NON-MEMO (inverse of S9b1)

These are deliberately **non-memoized** plain consts (rules-of-hooks note L1866-1869). The renderHook test
asserts segment-array identity **CHANGES** across a no-op rerender
(`expect(areaJourneySegments).not.toBe(a)`) — the **inverse** of S9b1's memo-stability `.toBe`. Memoizing
them would give a stable ref = a behaviour change.

## Interleaved stayers (leave in place)

`selectedGroupName` (L1773-1774), `isMarkerPopoverEligible` (L1764-1767), `regionGuideVisible` (L1825),
`regionGuideRingActive` (L1826). The 7 moved blocks are non-contiguous; the extraction must leave the
stayers behind.

## Projection

MapDiscovery.tsx 2542 → ~2440-2450 (net ~-90 to -110). Not <800 — S10 (handlers) + S11 (JSX) remain.
