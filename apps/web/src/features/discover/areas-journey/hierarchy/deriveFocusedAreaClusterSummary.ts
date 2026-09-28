/**
 * Issue #2660 (Commit 1) — pure move, verbatim, out of
 * `DiscoverAreasJourneyPanel.tsx`. No behaviour change: this is byte-for-byte
 * the same function and type that lived there, just relocated so the
 * decomposition's hierarchy-navigation pure functions have a real home
 * separate from the God component. `DiscoverAreasJourneyPanel.tsx` re-exports
 * both from this new location so its 2 existing production importers
 * (`views/SchoolsNavigationJourneyPanel.tsx`,
 * `views/mobile/MobileClusterSheet.tsx`) need zero changes.
 *
 * One visual AREA cluster's member set, as focused by a map cluster-marker
 * click (Issue #1956 PR 3, Slice 4). `members` and `countLabel` are derived
 * HERE, below, from the SAME `journey.node.children`/`journey.children` the
 * map's `AreaDestinationMarkerLayer` reads and the SAME
 * `presentClusterRepresentatives` function it calls internally — filtered to
 * exactly the `focusedClusterMemberAreaKeys` the map's own visual clustering
 * (pan/zoom-dependent pixel grouping) reported back, so map and panel can
 * never disagree on the visible set or the total (AC4.12).
 */
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { presentClusterRepresentatives } from '@/features/discover/navigation/representativeNames';
import type { ClusterableAreaMember } from '@/features/discover/navigation/areaClustering';
import { isMemberEligible } from '@/features/discover/navigation/journeyVisibility';

export interface FocusedAreaClusterSummary {
  members: ReadonlyArray<{
    nodeKey: string;
    areaKey: string;
    displayLabel: string;
    listingCount: number;
    schoolCount?: number | null;
  }>;
  /** The exact "+N areas with matches" / "N areas with matches" copy the map cluster marker shows. */
  countLabel: string;
}

/**
 * Issue #1956 PR-5 (Slice 3, AC5.6) — extracted, byte-for-byte-identical pure
 * derivation, factored OUT of the `focusedCluster` useMemo below so the new
 * mobile Map-mode cluster sheet (`src/features/discover/views/mobile/
 * MobileClusterSheet.tsx`) can compute the IDENTICAL member subset + count
 * copy from the SAME `journey`/`focusedClusterMemberAreaKeys` MapDiscovery
 * already threads to both this panel and the map layer, without a second,
 * potentially-diverging implementation (AC5.6's "consuming the existing
 * seam" requirement). No behaviour change versus the pre-extraction inline
 * body — see this component's own `focusedCluster` useMemo call site.
 */
export function deriveFocusedAreaClusterSummary(
  journey: Pick<UseAreasNavigationJourneyResult, 'node' | 'children'>,
  focusedClusterMemberAreaKeys: readonly string[] | null | undefined,
  eligibilityJourney: 'areas' | 'schools' = 'areas',
): FocusedAreaClusterSummary | null {
  if (!focusedClusterMemberAreaKeys || focusedClusterMemberAreaKeys.length === 0) return null;
  const rawByNodeKey = new Map((journey.node?.children ?? []).map((c) => [c.nodeKey, c] as const));
  const wanted = new Set(focusedClusterMemberAreaKeys);
  const clusterable: ClusterableAreaMember[] = [];
  for (const child of journey.children) {
    const raw = rawByNodeKey.get(child.nodeKey);
    // Minor fix-up (review) — the backend guarantees a non-null areaKey for
    // AREA children; a child missing one is SKIPPED rather than borrowing
    // its nodeKey as a stand-in areaKey (mirrors the coordinate fail-safe
    // in areaClustering.ts's isUsableCentroid — never fabricate identity).
    if (raw?.areaKey == null || !wanted.has(raw.areaKey)) continue;
    clusterable.push({
      nodeKey: child.nodeKey,
      areaKey: raw.areaKey,
      displayLabel: child.displayLabel,
      lat: raw.centreLat ?? Number.NaN,
      lon: raw.centreLon ?? Number.NaN,
      listingCount: child.listingCount,
      displayOrder: child.displayOrder,
      schoolCount: child.schoolCount,
    });
  }
  if (clusterable.length === 0) return null;
  // REQUIRED CHANGE 1 (AC4.12) — partition through the SAME journey-aware
  // eligibility predicate the map's clusterVisibleAreaMembers
  // (areaClustering.ts) applies BEFORE clustering, so a focused member that
  // has dropped to zero-content (e.g. a filter tightened) is excluded from
  // this panel exactly as it is excluded from the map's cluster. Falls back
  // to the normal level panel (returns null) when nothing eligible
  // survives — this panel only ever mounts for the areas journey (see
  // module doc), so the eligibility dimension is always 'areas'.
  const eligible = clusterable.filter((m) =>
    isMemberEligible(
      {
        areaKey: m.areaKey,
        displayLabel: m.displayLabel,
        eligibleListingCount: m.listingCount,
        eligibleSchoolCount: m.schoolCount ?? 0,
        displayOrder: m.displayOrder,
      },
      eligibilityJourney,
    ),
  );
  if (eligible.length === 0) return null;
  // REQUIRED CHANGE 2 — pass the panel's REAL (post-eligibility) displayed
  // count as the limit so `presentClusterRepresentatives` never advertises
  // a hidden "+N" for rows that are ALL already on screen here. The map
  // marker (AreaMarkerLayer.tsx) keeps calling this with the default
  // MAX_REPRESENTATIVE_NAMES cap — unaffected by this change.
  const { countResult } = presentClusterRepresentatives(eligible, eligibilityJourney, eligible.length);
  return {
    members: eligible.map((m) => ({
      nodeKey: m.nodeKey,
      areaKey: m.areaKey,
      displayLabel: m.displayLabel,
      listingCount: m.listingCount,
      schoolCount: m.schoolCount,
    })),
    countLabel: countResult.label,
  };
}
