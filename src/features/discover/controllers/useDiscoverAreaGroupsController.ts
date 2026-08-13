import { useMemo } from 'react';
import { useAreaGroups, type AreaGroup } from '@/hooks/useAreaGroups';
import { resolveDiscoverGroupForAreaKey } from '@/features/discover/selectors/mapLayerCategory';
import { prettifyZoneSlug } from '@/components/discover/SchoolRadiusMapOverlay';

export interface UseDiscoverAreaGroupsControllerParams {
  /** The DEFAULTED city (`nav.city || DEFAULT_CITY`) — see the fetch comment below. */
  navCity: string;
  groupId: string | null;
  areaKey: string | null;
  journey: string | null;
  schoolId: string | null;
}

/**
 * Issue #2142 (correction pass) — the Discover page's AREA-GROUP RESOLUTION,
 * lifted off MapDiscovery.tsx where its four derivations were scattered across
 * ~1,600 lines (useAreaGroups at the top, groupAreaKeysForMapData mid-file,
 * focusedGroup after the badge block, focusedGroupAreas after that, and
 * selectedGroupName 600 lines later still).
 *
 * SOLE OWNER of "given the URL's groupId/areaKey, which AreaGroup is in
 * focus and what does that imply". Every one of the four derivations calls
 * the SAME resolver (`resolveDiscoverGroupForAreaKey`) over the SAME inputs;
 * co-locating them is what makes the historical "deliberately duplicates that
 * derivation ... rather than reordering ~1600 lines of existing hooks"
 * comment (MapDiscovery.tsx, issue #1806 FIX-1) obsolete rather than
 * permanent.
 */
export function useDiscoverAreaGroupsController({
  navCity,
  groupId,
  areaKey,
  journey,
  schoolId,
}: UseDiscoverAreaGroupsControllerParams) {
  // Fetch area groups for the current city.
  // The hook's enabled guard (city.length > 0) prevents fetching on empty city.
  // Issue #1745 Batch B map-hierarchy fix — pass the DEFAULTED city (matching
  // useDiscoverPageState's `nav.city || DEFAULT_CITY`), not the raw
  // nav.city. At plain /discover (no ?city= param) nav.city is '',
  // which previously left this hook disabled (no groups) while the panel showed
  // the defaulted city's region cards — a landing-vs-panel mismatch that made
  // macro-region-bubbles fall back to the full liveAreas pill set. Falling back
  // to DEFAULT_CITY here does NOT reintroduce the stale-data window this comment
  // used to warn about — that contrast was raw nav.city vs a conditional ''
  // placeholder, not vs `|| DEFAULT_CITY`, which resolves to the same city the
  // panel already renders.
  const {
    data: areaGroupsData,
    isLoading: isLoadingAreaGroups,
  } = useAreaGroups(navCity);

  // Issue #1175 v3 / Issue #1798 PR-B1 — focusedGroup is resolved from both groupId (by ID
  // or exact slug match) and automatically derived from nav.areaKey if needed.
  // Guarantees right panel, map layer, map markers, and map breadcrumb derive from unified context.
  const focusedGroup = useMemo(() => {
    return resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, groupId, areaKey);
  }, [areaGroupsData?.groups, groupId, areaKey]);

  const focusedGroupAreas = useMemo(
    () => focusedGroup?.area_keys,
    // Re-derive only when the selected group or the groups dataset changes.
    // Prevents AreaMarkerLayer from tearing down all markers on every background refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, areaGroupsData],
  );

  // Issue #1806 (FIX-1) — group-scope the map's marker fetch. The right panel
  // (AreaGroupSelectedPanel, reached whenever nav.groupId resolves to a
  // real group) already shows only the group's member areas; before this fix
  // the map's marker fetch ignored groupId entirely and showed city-wide
  // markers instead (the reported map/panel scope mismatch).
  //
  // Journey/state → groupAreaKeys mapping (DIRECTIVE 5):
  //   groupId == null                                    → undefined (unscoped; unchanged)
  //   groupId set AND journey==='school-first' AND schoolId set → undefined
  //     (guard: the school-radius surface is radius-scoped by design (#1261),
  //     never group-scoped — group-clipping markerListings here would
  //     silently shrink it, R5).
  //   groupId set (guard above not tripped) AND group not yet resolved
  //     (areaGroupsData still loading / groupId matches no group)  → []
  //     (empty-areaKeys guard DISABLES the fetch — an empty map, never an
  //     unscoped city-wide flash during the cold-load race, R4).
  //   groupId set AND group resolved                     → group.area_keys
  //     (the scoped fetch this fix exists for).
  const groupAreaKeysForMapData = useMemo((): string[] | undefined => {
    if (!groupId) return undefined;
    if (journey === 'school-first' && schoolId) return undefined;
    const group = resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, groupId, areaKey);
    return group?.area_keys ?? [];
  }, [groupId, journey, schoolId, areaKey, areaGroupsData?.groups]);

  // Issue #1606 — resolved group display name for the area-first breadcrumb. Prefers the
  // backend group name, falls back to a prettified slug so a deep-linked groupId that has
  // not yet hydrated still reads as a human label (e.g. "University Belt"). Null when no
  // group context exists — the breadcrumb then omits the group crumb.
  const selectedGroupName: string | null =
    focusedGroup?.name ?? (groupId ? prettifyZoneSlug(groupId) : null);

  return {
    areaGroupsData,
    isLoadingAreaGroups,
    focusedGroup,
    focusedGroupAreas,
    groupAreaKeysForMapData,
    selectedGroupName,
  };
}

export type UseDiscoverAreaGroupsControllerResult = ReturnType<typeof useDiscoverAreaGroupsController>;
export type { AreaGroup };
