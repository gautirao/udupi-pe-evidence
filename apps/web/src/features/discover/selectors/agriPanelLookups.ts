import type { CorridorGroupData, CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';

/**
 * Issue #2657 commit C1 — pure selector lifted VERBATIM in semantics from
 * DiscoverRightPanel.tsx's `case 'agri-group-selected'` branch: the
 * corridor lookup by `selectedRegion` used both for the distance-chip row
 * (:1690 `availableMaxDistances`) and the breadcrumb/header corridor name
 * (:1716 `corridorName`). Both reads find the SAME corridor once.
 */
export interface AgriCorridorLookupInput {
  corridorGroups: CorridorGroupData[] | undefined;
  selectedRegion: string | null | undefined;
}

export interface AgriCorridorLookupResult {
  availableMaxDistances: CumulativeDistanceTier[] | undefined;
  corridorName: string | null;
}

export function resolveAgriCorridorLookup({
  corridorGroups,
  selectedRegion,
}: AgriCorridorLookupInput): AgriCorridorLookupResult {
  const corridor = corridorGroups?.find((c) => c.directionCode === selectedRegion);
  return {
    availableMaxDistances: corridor?.availableMaxDistances,
    corridorName: corridor?.groupName ?? null,
  };
}
