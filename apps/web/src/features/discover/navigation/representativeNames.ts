/**
 * representativeNames.ts — Issue #1956 PR 3 (Slice 4).
 *
 * Presents ONE visual AREA cluster's representative names + "+N" count copy,
 * for a cluster whose members have ALREADY passed journey-aware visibility
 * (see `areaClustering.ts`'s `clusterVisibleAreaMembers` — visibility runs
 * BEFORE clustering, never after). Every member reaching this module is
 * therefore already a match; nothing is filtered again here.
 *
 * This module DELIBERATELY REUSES rather than reimplements:
 *   • `rankClusterRepresentatives` / `compareRepresentatives` from
 *     `nearbyAreaArithmetic.ts` for the deterministic ranking (PR-1, already
 *     property-tested).
 *   • `computeNearbyAreaCount` from the same module for the locked "+N areas
 *     with matches" / "N areas with matches" / never-"+0" arithmetic.
 *
 * At most `MAX_REPRESENTATIVE_NAMES` (2) names are ever displayed.
 *
 * Pure. No React, no I/O.
 */
import {
  computeNearbyAreaCount,
  rankClusterRepresentatives,
  type NearbyAreaCountResult,
  type RankableClusterMember,
} from './nearbyAreaArithmetic';
import type { DiscoverJourney } from './journeyVisibility';
import type { ClusterableAreaMember, ClusterableDestination } from './areaClustering';

/** Locked cap — a visual cluster shows at most two representative names. */
export const MAX_REPRESENTATIVE_NAMES = 2;

export interface ClusterRepresentativePresentation {
  /** At most `MAX_REPRESENTATIVE_NAMES` canonical area names, deterministically ranked. */
  representativeNames: string[];
  /** The shared count-copy result — `label` is the exact string to render. */
  countResult: NearbyAreaCountResult;
}

function toRankable(member: ClusterableAreaMember): RankableClusterMember {
  return {
    areaKey: member.areaKey,
    displayLabel: member.displayLabel,
    eligibleListingCount: member.listingCount,
    eligibleSchoolCount: member.schoolCount ?? 0,
    displayOrder: member.displayOrder,
    // Every member reaching this module already passed journey-aware
    // visibility (see module doc) — never re-filtered here.
    visible: true,
  };
}

/**
 * Presents a visual AREA cluster's representative names + count copy.
 *
 * `members` MUST already be the cluster's full VISIBLE member set (the
 * output of `areaClustering.clusterVisibleAreaMembers`, one cell's
 * `members`) — this function does not itself apply journey eligibility.
 */
export function presentClusterRepresentatives(
  members: readonly ClusterableAreaMember[],
  journey: DiscoverJourney,
  limit: number = MAX_REPRESENTATIVE_NAMES,
): ClusterRepresentativePresentation {
  const rankable = members.map(toRankable);
  const representatives = rankClusterRepresentatives(rankable, limit, journey);
  const representativeNames = representatives.map((representative) => representative.displayLabel);
  const countResult = computeNearbyAreaCount({
    visibleMemberCount: members.length,
    displayedRepresentativeCount: representativeNames.length,
  });
  return { representativeNames, countResult };
}

/**
 * Issue #1943 (Slice B+C merge) — the hierarchy-destination sibling of
 * `presentClusterRepresentatives`, ADDED beside it rather than widening the
 * AREA-only function above (never touch that one's contract).
 *
 * `rankClusterRepresentatives`/`compareRepresentatives` (nearbyAreaArithmetic.ts)
 * read `areaKey` PURELY as an opaque tiebreak identity — an equality check
 * and a final lexicographic sort, never parsed, split, or looked up (see
 * team-lead-plan.toml's Q4 resolution, which settled exactly this question).
 * A hierarchy destination therefore safely supplies its `nodeKey` as that
 * opaque identity via THIS entry point — never by writing a `nodeKey` value
 * into an `areaKey` field on the shared `ClusterableAreaMember` type, which
 * would collide the two key spaces areaClustering.ts's module doc
 * (AreaMarkerLayer.tsx) explicitly prohibits mixing.
 */
export function presentDestinationClusterRepresentatives(
  members: readonly ClusterableDestination[],
  journey: DiscoverJourney,
  limit: number = MAX_REPRESENTATIVE_NAMES,
): ClusterRepresentativePresentation {
  const rankable = members.map(
    (member): RankableClusterMember => ({
      // `identityKey` is optional at the type level (AREA-path convenience —
      // see ClusterableDestination's doc in areaClustering.ts); a hierarchy
      // destination reaching THIS function always supplies its own (no
      // areaKey-based default exists for it). The `?? ''` is a total-function
      // safety net for the opaque tiebreak identity below, never an expected
      // runtime value.
      areaKey: member.identityKey ?? '',
      displayLabel: member.displayLabel,
      eligibleListingCount: member.listingCount,
      eligibleSchoolCount: member.schoolCount ?? 0,
      displayOrder: member.displayOrder,
      // Every member reaching this module already passed whatever
      // visibility rule its caller applies (structural levels are never
      // eligibility-hidden — see journeyVisibility.ts's module doc) —
      // never re-filtered here, mirroring `toRankable` above.
      visible: true,
    }),
  );
  const representatives = rankClusterRepresentatives(rankable, limit, journey);
  const representativeNames = representatives.map((representative) => representative.displayLabel);
  const countResult = computeNearbyAreaCount({
    visibleMemberCount: members.length,
    displayedRepresentativeCount: representativeNames.length,
  });
  return { representativeNames, countResult };
}
