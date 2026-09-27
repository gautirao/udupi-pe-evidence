/**
 * Pure selectors for SchoolBrowsePanel's zone/area browsing section — extracted
 * verbatim from SchoolJourneyPanels.tsx (Issue #2661 commit 2, no logic changes).
 * The component still wraps these in `React.useMemo`; only the computation
 * bodies moved here.
 */
import { getGroupMacroRegionLabel, type SummaryRegionRef } from '@/utils/macroRegionResolver';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

/**
 * Issue #1770 — build a human-readable city label for the intro card.
 * Uses the provided cityLabel prop; falls back to capitalising the city slug.
 */
export function displayCity(city: string, cityLabel: string | null): string {
  return cityLabel && cityLabel !== city
    ? cityLabel
    : city.charAt(0).toUpperCase() + city.slice(1);
}

/**
 * Issue #1882 (Track A PR2 Slice S2c) — region-scope filtering compares the
 * group's backend-derived region_key against scope with strict equality
 * (replaces the earlier label/direction heuristic).
 */
export function scopedGroups(areaGroups: AreaGroup[], scope: string | null): AreaGroup[] {
  if (!scope) return areaGroups;
  return areaGroups.filter((g) => g.region_key === scope);
}

export function activeScopeLabel(
  scope: string | null,
  summaryRegions: SummaryRegionRef[],
  scopedGroupsList: AreaGroup[],
): string | null {
  if (!scope) return null;
  const summaryMatch = summaryRegions.find(
    (r) => r.regionKey.toLowerCase() === scope.toLowerCase(),
  );
  if (summaryMatch) return summaryMatch.regionLabel;
  const groupMatch = scopedGroupsList[0]?.region_label;
  if (groupMatch) return groupMatch;
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

export interface MacroRegionSection {
  label: string;
  groups: AreaGroup[];
}

export function macroRegionSections(areaGroups: AreaGroup[], scope: string | null): MacroRegionSection[] {
  if (scope) return [];
  const map = new Map<string, AreaGroup[]>();
  for (const g of areaGroups) {
    const label = getGroupMacroRegionLabel(g);
    const list = map.get(label) ?? [];
    list.push(g);
    map.set(label, list);
  }
  return Array.from(map.entries()).map(([label, groupList]) => ({
    label,
    groups: groupList,
  }));
}

/**
 * Total school count across visible (scoped or unscoped) zones for the intro card
 * stat. Issue #1882 (Slice S2c) — reuses scopedGroupsList rather than re-deriving
 * via the deleted matchesMacroRegion.
 */
export function totalSchoolCount(
  areaGroups: AreaGroup[],
  discoverAreas: DiscoverArea[],
  scope: string | null,
  scopedGroupsList: AreaGroup[],
): number {
  const groups = scope ? scopedGroupsList : areaGroups;
  return groups.reduce((sum, g) => {
    const memberAreas = zoneMemberAreas(g, discoverAreas);
    return sum + memberAreas.reduce((s, a) => s + a.schoolCount, 0);
  }, 0);
}

/** The DiscoverArea rows belonging to a zone/group, by areaKey membership. */
export function zoneMemberAreas(group: AreaGroup, discoverAreas: DiscoverArea[]): DiscoverArea[] {
  return discoverAreas.filter((a) => group.area_keys.includes(a.areaKey));
}
