import { useMemo } from 'react';
import type { ZoneLabelPoint } from '@/components/map/SchoolZoneLabelLayer';
import type { SchoolFirstZoneCountInput } from '@/features/discover/presentation/schoolFirstCounts';
import {
  deriveSchoolFirstLandingSchoolCount,
  deriveSchoolFirstZoneSchoolCount,
  deriveSchoolFirstAreaSchoolCount,
} from '@/features/discover/presentation/schoolFirstCounts';

export interface UseSchoolFirstCountsParams {
  journey: SchoolFirstZoneCountInput['journey'];
  groupId: SchoolFirstZoneCountInput['groupId'];
  selectedArea: SchoolFirstZoneCountInput['selectedArea'];
  focusedGroup: SchoolFirstZoneCountInput['focusedGroup'];
  areasLoading: SchoolFirstZoneCountInput['areasLoading'];
  discoverAreas: SchoolFirstZoneCountInput['discoverAreas'];
}

export interface UseSchoolFirstCountsResult {
  schoolFirstLandingSchoolCount: number | null;
  schoolFirstZoneSchoolCount: number | null;
  schoolFirstAreaSchoolCount: number | null;
  schoolZoneLabels: ZoneLabelPoint[];
}

/**
 * Issue #1824 Slice S11b (C5) — the school-first status-pill count derivations,
 * lifted verbatim out of MapDiscovery.tsx (original L1126-1165). See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11b-design.md.
 *
 * Behaviour-preserving lift-and-shift — bodies + dep arrays are byte-for-byte
 * from the original page. MUST be called AFTER focusedGroup is resolved (it is
 * an injected dep here). schoolFirstAreaSchoolCount and schoolZoneLabels stay
 * PLAIN (schoolFirstAreaSchoolCount is a plain const — not memoized — per the
 * original; schoolZoneLabels is the dead useMemo(() => [], []) verbatim).
 */
export function useSchoolFirstCounts({
  journey,
  groupId,
  selectedArea,
  focusedGroup,
  areasLoading,
  discoverAreas,
}: UseSchoolFirstCountsParams): UseSchoolFirstCountsResult {
  // Visual-parity polish (cycle 3/4) — school-first "Showing X schools" status-pill
  // counts. Reuses discoverAreas/focusedGroup/selectedArea already computed above
  // (same data the school-first panels/hero already display) — no new fetch.
  // Derivations are pure exported helpers (mirrors deriveDiscoverBadge) so they can
  // be unit-tested without mounting the page — see
  // src/pages/__tests__/MapDiscovery.school-pill.test.tsx.
  // null = not applicable to the current state (falls through to the generic
  // properties-count pill below), the source data hasn't resolved yet, OR
  // areasLoading is still true — gated exactly like schoolListingsCount above so the
  // pill never flashes "Showing 0 schools" mid-load.
  const schoolFirstLandingSchoolCount = useMemo(
    () =>
      deriveSchoolFirstLandingSchoolCount({
        journey,
        groupId,
        selectedArea,
        areasLoading,
        discoverAreas,
      }),
    [journey, groupId, selectedArea, areasLoading, discoverAreas],
  );

  const schoolFirstZoneSchoolCount = useMemo(
    () =>
      deriveSchoolFirstZoneSchoolCount({
        journey,
        groupId,
        selectedArea,
        focusedGroup,
        areasLoading,
        discoverAreas,
      }),
    [journey, groupId, selectedArea, focusedGroup, areasLoading, discoverAreas],
  );

  const schoolFirstAreaSchoolCount = deriveSchoolFirstAreaSchoolCount({
    journey,
    selectedArea,
    areasLoading,
  });

  // School-first overview: dark zone/group label pills positioned truthfully
  // (group focus point, else member-area bounds-centre; groups with neither are
  // dropped). Shown ONLY in the school-first browse/landing state (no group/area/
  // school selected) and only at overview zoom, so they never clutter drill-down
  // states or other journeys. onSelectZone reuses the existing selectGroup action.
  const schoolZoneLabels = useMemo<ZoneLabelPoint[]>(() => {
    // Issue #1655 — unified group listing pins replace legacy schoolZoneLabels pills at Level 0.
    return [];
  }, []);

  return {
    schoolFirstLandingSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstAreaSchoolCount,
    schoolZoneLabels,
  };
}
