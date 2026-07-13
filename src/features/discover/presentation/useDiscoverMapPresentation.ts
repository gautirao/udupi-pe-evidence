import { useMemo } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverMapLayerKind } from '@/utils/discoverLayerRegistry';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { matchesMacroRegion, labelToSlug } from '@/utils/macroRegionResolver';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';

export interface UseDiscoverMapPresentationParams {
  mapLayerKind: DiscoverMapLayerKind;
  isLoadingAreaGroups: boolean;
  isLoadingRegionalAreaGroups: boolean;
  isLandingState: boolean;
  isAreaFirstCityLanding: boolean;
  areaGroupsData: { groups: AreaGroup[] } | undefined;
  discoverAreas: AreaPoint[];
  corridorGroups: CorridorGroupData[];
  agriAreasData: DiscoverArea[] | undefined;
  liveAreas: AreaPoint[];
  urlState: DiscoverUrlState;
  summaryRegions: DiscoverSummaryRegion[];
  cityCenter: [number, number] | undefined;
  focusedGroup: AreaGroup | null;
  debouncedAreaSearchQuery: string;
}

export interface UseDiscoverMapPresentationResult {
  overviewAreas: AreaPoint[];
  areaSearchMatchKeys: string[] | undefined;
}

/**
 * Issue #1824 Slice S9b1 — the map-layer-driven area/group/region/corridor
 * marker-bucketing derivation (`overviewAreas`) + the panel-search-match
 * derivation (`areaSearchMatchKeys`), lifted verbatim out of MapDiscovery.tsx.
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s9b-design.md.
 *
 * Behaviour-preserving lift-and-shift — bodies + dep arrays are byte-for-byte
 * from the original MapDiscovery.tsx L1689-1925 / L1948-1955. Do NOT change
 * branch order, the dep arrays, or the coordinate-source fallback ladders.
 */
export function useDiscoverMapPresentation({
  mapLayerKind,
  isLoadingAreaGroups,
  isLoadingRegionalAreaGroups,
  isLandingState,
  isAreaFirstCityLanding,
  areaGroupsData,
  discoverAreas,
  corridorGroups,
  agriAreasData,
  liveAreas,
  urlState,
  summaryRegions,
  cityCenter,
  focusedGroup,
  debouncedAreaSearchQuery,
}: UseDiscoverMapPresentationParams): UseDiscoverMapPresentationResult {
  const overviewAreas = useMemo((): AreaPoint[] => {
    if (mapLayerKind === 'zoom-gated' || mapLayerKind === 'agri-drilldown') return [];

    if (mapLayerKind === 'area-group-bubbles' || mapLayerKind === 'region-zone-areas') {
      if (isLoadingAreaGroups) return [];
      const groups = areaGroupsData?.groups ?? [];
      const activeScope = urlState.scope ?? null;

      let targetGroups = groups;
      if (activeScope) {
        targetGroups = groups.filter(
          (g) =>
            g.id === activeScope ||
            g.name.toLowerCase() === activeScope.toLowerCase() ||
            labelToSlug(g.name) === activeScope ||
            matchesMacroRegion(g.region_label, activeScope, summaryRegions)
        );
        if (targetGroups.length === 0) return [];

        // If the matched scope is itself a single area group (e.g. Udupi 3-level where scope="south-udupi" is group.id),
        // there are no sub-zones inside it, so return its member areas directly.
        const isDirectGroupMatch =
          targetGroups.length === 1 &&
          (targetGroups[0].id === activeScope || labelToSlug(targetGroups[0].name) === activeScope);
        if (isDirectGroupMatch) {
          const groupAreaKeys = targetGroups[0].area_keys ?? [];
          return discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
        }
      } else if (groups.length === 0) {
        return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
      }

      return targetGroups
        .map((group): AreaPoint | null => {
          const groupAreaKeys = group.area_keys ?? [];
          const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
          const totalListings = memberAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0);

          let lat = group.focus_lat != null ? group.focus_lat : null;
          let lon = group.focus_lon != null ? group.focus_lon : null;
          if (lat == null || lon == null) {
            const coords = memberAreas.filter((a) => a.geo_center_lat != null && a.geo_center_lon != null);
            if (coords.length > 0) {
              lat = coords.reduce((sum, a) => sum + a.geo_center_lat, 0) / coords.length;
              lon = coords.reduce((sum, a) => sum + a.geo_center_lon, 0) / coords.length;
            }
          }
          if (lat == null || lon == null) return null;

          const unionBbox = computeGroupBounds(memberAreas)?.bbox ?? null;

          return {
            areaKey: group.id,
            areaLabel: group.name,
            geo_center_lat: lat,
            geo_center_lon: lon,
            bbox: unionBbox,
            listingCount: totalListings,
            schoolCount: undefined,
            isGroup: true,
          };
        })
        .filter((a): a is AreaPoint => a !== null && (a.listingCount ?? 0) > 0);
    }

    // Issue #1745 Batch B map-hierarchy fix — journeyless city landing,
    // scope=null: macro-region summary bubbles from useDiscoverSummary().regions.
    if (mapLayerKind === 'macro-region-bubbles') {
      if (isLoadingAreaGroups) return [];
      const groups = areaGroupsData?.groups ?? [];
      if (groups.length === 0 || summaryRegions.length === 0) {
        return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
      }
      return summaryRegions
        .map((region): AreaPoint | null => {
          if (region.listingCount == null || region.listingCount === 0) return null;

          const matchingGroups = groups.filter(
            (g) =>
              g.id === region.regionKey ||
              g.name.toLowerCase() === region.regionLabel.toLowerCase() ||
              matchesMacroRegion(g.region_label, region.regionKey, summaryRegions) ||
              matchesMacroRegion(g.region_label, region.regionLabel, summaryRegions)
          );

          const groupAreaKeys = matchingGroups.flatMap((g) => g.area_keys ?? []);
          const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
          const focusGroups = matchingGroups.filter((g) => g.focus_lat != null && g.focus_lon != null);

          let lat: number | null = null;
          let lon: number | null = null;

          if (focusGroups.length > 0) {
            lat = focusGroups.reduce((sum, g) => sum + (g.focus_lat as number), 0) / focusGroups.length;
            lon = focusGroups.reduce((sum, g) => sum + (g.focus_lon as number), 0) / focusGroups.length;
          } else {
            const coords = memberAreas.filter((a) => a.geo_center_lat != null && a.geo_center_lon != null);
            if (coords.length > 0) {
              lat = coords.reduce((sum, a) => sum + a.geo_center_lat, 0) / coords.length;
              lon = coords.reduce((sum, a) => sum + a.geo_center_lon, 0) / coords.length;
            }
          }

          if (lat == null || lon == null) {
            const rKey = region.regionKey.toLowerCase();
            const rLabel = region.regionLabel.toLowerCase();
            const fallbackCoords = (discoverAreas.length > 0 ? discoverAreas : liveAreas).filter(
              (a) =>
                (a.areaLabel ?? '').toLowerCase().includes(rKey) ||
                (a.areaLabel ?? '').toLowerCase().includes(rLabel) ||
                rLabel.includes((a.areaLabel ?? '').toLowerCase())
            );
            if (fallbackCoords.length > 0) {
              const valid = fallbackCoords.filter((a) => a.geo_center_lat != null && a.geo_center_lon != null);
              if (valid.length > 0) {
                lat = valid.reduce((sum, a) => sum + a.geo_center_lat, 0) / valid.length;
                lon = valid.reduce((sum, a) => sum + a.geo_center_lon, 0) / valid.length;
              }
            }
          }

          if (lat == null || lon == null) {
            const baseLat = urlState.viewport?.lat ?? cityCenter[0] ?? 13.34;
            const baseLon = urlState.viewport?.lon ?? cityCenter[1] ?? 74.74;
            const offset = 0.04;
            const key = region.regionKey.toLowerCase();
            lat =
              baseLat +
              (key.includes('north') || key === 'n' ? offset : key.includes('south') || key === 's' ? -offset : 0);
            lon =
              baseLon +
              (key.includes('east') || key === 'e' ? offset : key.includes('west') || key === 'w' ? -offset : 0);
          }

          const unionBbox = computeGroupBounds(memberAreas)?.bbox ?? null;

          return {
            areaKey: region.regionKey,
            areaLabel: region.regionLabel,
            geo_center_lat: lat,
            geo_center_lon: lon,
            bbox: unionBbox,
            listingCount: region.listingCount,
            schoolCount: undefined,
            isMacroRegion: true,
            isSelected: urlState.scope === region.regionKey || labelToSlug(region.regionLabel) === urlState.scope,
          };
        })
        .filter((a): a is AreaPoint => a !== null);
    }

    if (mapLayerKind === 'agri-corridor-bubbles') {
      if (isLoadingRegionalAreaGroups) return [];
      if (corridorGroups.length === 0) return [];
      const sourceAreas = agriAreasData ?? [];
      return corridorGroups
        .map((corridor): AreaPoint => {
          const uniqueAreaKeys = Array.from(new Set(corridor.availableMaxDistances.flatMap((t) => t.areaKeys)));
          const memberAreas = sourceAreas.filter((a) => uniqueAreaKeys.includes(a.areaKey));
          let totalListings = memberAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0);
          if (totalListings === 0) {
            totalListings = corridor.availableMaxDistances.reduce((max, t) => Math.max(max, t.listingCount ?? 0), 0);
          }

          const memberAreasWithCoords = memberAreas.filter((a) => a.geoCenterLat != null && a.geoCenterLon != null);
          let lat: number | null = null;
          let lon: number | null = null;
          if (memberAreasWithCoords.length > 0) {
            lat = memberAreasWithCoords.reduce((sum, a) => sum + a.geoCenterLat, 0) / memberAreasWithCoords.length;
            lon = memberAreasWithCoords.reduce((sum, a) => sum + a.geoCenterLon, 0) / memberAreasWithCoords.length;
          } else {
            const baseLat = urlState.viewport?.lat ?? 13.34;
            const baseLon = urlState.viewport?.lon ?? 74.74;
            const offset = 0.04;
            lat = baseLat + (corridor.directionCode.includes('N') ? offset : corridor.directionCode.includes('S') ? -offset : 0);
            lon = baseLon + (corridor.directionCode.includes('E') ? offset : corridor.directionCode.includes('W') ? -offset : 0);
          }

          const mappedMembers: AreaPoint[] = memberAreas.map((a) => ({
            areaKey: a.areaKey,
            areaLabel: a.name,
            geo_center_lat: a.geoCenterLat,
            geo_center_lon: a.geoCenterLon,
            bbox:
              a.minLat != null && a.minLon != null && a.maxLat != null && a.maxLon != null
                ? ([[a.minLat, a.minLon], [a.maxLat, a.maxLon]] as [[number, number], [number, number]])
                : null,
            listingCount: a.listingCount,
          }));
          const unionBbox = computeGroupBounds(mappedMembers)?.bbox ?? null;

          return {
            areaKey: corridor.directionCode,
            areaLabel: corridor.groupName,
            geo_center_lat: lat,
            geo_center_lon: lon,
            bbox: unionBbox,
            listingCount: totalListings,
            isGroup: true,
          };
        })
        .filter((a) => (a.listingCount ?? 0) > 0);
    }

    // Issue #1798 PR-B1 — strictly align overview area markers with the active group or area context.
    // If an area is explicitly selected (`urlState.areaKey`), we do not show parent overview areas;
    // only the area's listings stand out on the map.
    if (urlState.areaKey) {
      return [];
    }
    // If a group is selected (`focusedGroup`), we strictly limit overview areas to member areas (`focusedGroup.area_keys`).
    if (focusedGroup) {
      const memberKeySet = new Set(focusedGroup.area_keys);
      return discoverAreas.filter((a) => memberKeySet.has(a.areaKey));
    }

    // 'all-areas' — every remaining residential drill-down state (school selected, combined) —
    // unchanged: full discoverAreas, dimmed via the separate `focusedGroupAreas` prop passed to PropertyMap.
    return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
  }, [
    mapLayerKind,
    isLoadingAreaGroups,
    isLoadingRegionalAreaGroups,
    isLandingState,
    isAreaFirstCityLanding,
    areaGroupsData,
    discoverAreas,
    corridorGroups,
    agriAreasData,
    liveAreas,
    urlState.viewport,
    urlState.scope,
    summaryRegions,
    cityCenter,
    urlState.areaKey,
    focusedGroup,
  ]);

  // Issue #1815 (R3b/R6) — a panel search match must promote that area to a
  // full labelled map pin (AreaMarkerLayer's documented searchMatchKeys
  // contract: "Areas matching the active panel search — always forced to
  // full labelled pins"). debouncedAreaSearchQuery (declared above) already
  // exists purely to drive this — wired up from the panel via
  // onAreaSearchQueryChange={setAreaSearchQuery} below — but the final step
  // (turning the live query into actual matched area KEYS) was never
  // implemented; this constant was hardcoded to `undefined`, so
  // applyForcedAlways in areaMarkerBucketing.ts never had anything to
  // force-promote. Mirrors ScopedSearch's own matching predicate (name or
  // areaKey, case-insensitive substring — see
  // src/components/discover/ScopedSearch.tsx's matchingAreas), adapted to
  // the shape actually in scope here: `discoverAreas` at this point in the
  // component is AreaPoint[] (has `areaLabel`, NOT `name` — see the comment
  // on discoverAreasForPanel a few hundred lines up), not the DiscoverArea[]
  // ScopedSearch's own predicate is written against. Matches are NOT capped
  // to 8 (that cap is a dropdown-suggestion-list concern, unrelated to
  // marker promotion). This only affects AreaMarkerLayer's bucketing
  // (representative selection) — never a camera move or URL/route change;
  // searchMatchKeys is read solely inside computeAreaMarkers's
  // applyForcedAlways, which has no camera-intent side effect.
  const areaSearchMatchKeys = useMemo(() => {
    const q = debouncedAreaSearchQuery.trim().toLowerCase();
    if (!q) return undefined;
    const matches = discoverAreas
      .filter((a) => a.areaLabel.toLowerCase().includes(q) || a.areaKey.toLowerCase().includes(q))
      .map((a) => a.areaKey);
    return matches.length > 0 ? matches : undefined;
  }, [debouncedAreaSearchQuery, discoverAreas]);

  return { overviewAreas, areaSearchMatchKeys };
}
