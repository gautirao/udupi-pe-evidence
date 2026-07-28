import { useMemo } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { DiscoverMapLayerKind } from '@/utils/discoverLayerRegistry';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import { type DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import { prettifyZoneSlug, areaKeyToLabel } from '@/components/discover/SchoolRadiusMapOverlay';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { labelToSlug } from '@/utils/macroRegionResolver';
import { resolveScope, type ScopeNamespaces } from '@/features/discover/presentation/resolveScope';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import {
  deriveVisibleMemberSet,
  type VisibleMemberSet,
} from '@/features/discover/navigation/visibleMemberSet';

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
  // Issue #1824 Slice S9b2 — optional (not required) so the frozen S9b1
  // renderHook fixture (useDiscoverMapPresentation.overviewAreas.test.ts,
  // which predates the region/breadcrumb cluster and must not be edited)
  // keeps type-checking without supplying them; the real MapDiscovery.tsx
  // call site always passes concrete values.
  city?: string;
  selectedArea?: AreaPoint | null;
  selectedSchool?: SchoolResult | null;
  selectedMarkerListing?: PropertyListingWithImages | null;
  /**
   * Issue #1910 (PR2) — the single source-of-truth region/group namespaces
   * used to classify `urlState.scope` via `resolveScope`, built once by the
   * caller (MapDiscovery.tsx) from `summaryRegions`/`areaGroupsData` and
   * reused across this hook, `handleOverviewAreaClick`, and
   * `AreaGroupsLandingPanel`. Optional — when omitted, this hook derives an
   * equivalent namespace internally from `summaryRegions`/`areaGroupsData`
   * so the frozen S9b1 fixture (which predates #1910 and does not supply
   * this prop) keeps working unchanged.
   */
  scopeNamespaces?: ScopeNamespaces;
  /**
   * Issue #1910 (PR2) — the region-scoped area-group projection for the
   * CURRENTLY resolved region scope (from `useRegionScopedAreaGroups`).
   * Undefined/not-yet-loaded falls back to the legacy `region_key`-filtered
   * marker set (Resolution A) rather than showing nothing.
   */
  regionScopedGroups?: RegionScopedAreaGroup[];
  /**
   * Issue #1956 PR 1 (FE-3, item 2) — THE shared visible-member set, produced by
   * `useDiscoverMapData` (which is upstream of this hook) and threaded in by
   * MapDiscovery.tsx. Supplied means map and panel read the SAME object, by
   * reference — which is the point: AC1.12 fails the moment each side derives
   * its own.
   *
   * Optional, and OMITTED means "derive an equivalent one locally from
   * `focusedGroup`/`discoverAreas` via the same pure function" — mirroring the
   * `scopeNamespaces` precedent above, so the frozen S9b1 fixture (which cannot
   * be edited) keeps type-checking without supplying it.
   *
   * ADDITIVE AND INERT in PR 1: this hook exposes it and NOTHING renders it.
   */
  visibleMemberSet?: VisibleMemberSet;
}

export interface UseDiscoverMapPresentationResult {
  overviewAreas: AreaPoint[];
  areaSearchMatchKeys: string[] | undefined;
  resolvedRegionLabel: string | null;
  isRegionOverview: boolean;
  regionOverviewMarkerKind: RegionOverviewMarkerKind;
  regionOverviewShortLabel: string | null;
  areaJourneySegments: DiscoverMapCrumb[];
  schoolJourneySegments: DiscoverMapCrumb[];
  /**
   * Issue #1956 PR 1 (FE-3, item 2) — the SAME set `useDiscoverMapData` produced
   * when the caller threads it in (re-exposed by reference, not re-derived), or
   * an equivalent locally-derived one when it does not. Consumed by nothing in
   * PR 1. See `@/features/discover/navigation/visibleMemberSet`.
   */
  visibleMemberSet: VisibleMemberSet;
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
  city = '',
  selectedArea = null,
  selectedSchool = null,
  selectedMarkerListing = null,
  scopeNamespaces,
  regionScopedGroups,
  visibleMemberSet,
}: UseDiscoverMapPresentationParams): UseDiscoverMapPresentationResult {
  // Issue #1910 (PR2) — fall back to a locally-derived namespace when the
  // caller doesn't supply one (see the scopeNamespaces JSDoc above).
  const resolvedScopeNamespaces: ScopeNamespaces = useMemo(() => {
    if (scopeNamespaces) return scopeNamespaces;
    const groups = areaGroupsData?.groups ?? [];
    // Issue #1910 (PR2 fix-up, Finding 1) — restores the pre-#1910 ad-hoc
    // name/label fallback (see ScopeNamespaces.groupNameSlugs JSDoc) for the
    // internal namespace this hook derives when no shared `scopeNamespaces`
    // prop is supplied (only the frozen S9b1 fixture hits this path in
    // practice — MapDiscovery.tsx always passes scopeNamespaces).
    const groupNameSlugs = new Map<string, string>();
    for (const g of groups) {
      groupNameSlugs.set(labelToSlug(g.name), g.id);
      groupNameSlugs.set(g.name.toLowerCase(), g.id);
    }
    return {
      regionKeys: new Set(summaryRegions.map((r) => r.regionKey)),
      groupSlugs: new Set(groups.map((g) => g.id)),
      groupNameSlugs,
    };
  }, [scopeNamespaces, summaryRegions, areaGroupsData]);

  // Issue #1956 PR 1 (FE-3, item 2) — THE shared visible-member set. When the
  // caller threads one in (MapDiscovery.tsx does, from useDiscoverMapData) it is
  // re-exposed BY REFERENCE and nothing is recomputed: that reference identity is
  // the whole mechanism by which map and panel cannot disagree (AC1.12). The
  // fallback runs the SAME pure function over this hook's own equivalent inputs,
  // so there is one derivation rule in the codebase, not two.
  //
  // ADDITIVE AND INERT: no branch below reads this, and no returned value other
  // than the new `visibleMemberSet` field is affected by it.
  const resolvedVisibleMemberSet: VisibleMemberSet = useMemo(
    () =>
      visibleMemberSet ??
      deriveVisibleMemberSet({
        candidateAreaKeys: discoverAreas.map((a) => a.areaKey),
        scopedAreaKeys: focusedGroup ? focusedGroup.area_keys ?? [] : undefined,
      }),
    [visibleMemberSet, discoverAreas, focusedGroup],
  );

  const overviewAreas = useMemo((): AreaPoint[] => {
    if (mapLayerKind === 'zoom-gated' || mapLayerKind === 'agri-drilldown') return [];

    if (mapLayerKind === 'area-group-bubbles' || mapLayerKind === 'region-zone-areas') {
      if (isLoadingAreaGroups) return [];
      const groups = areaGroupsData?.groups ?? [];
      const activeScope = urlState.scope ?? null;

      // Issue #1910 (PR2) — group→AreaPoint mapper, reused by the no-scope
      // and region-fallback (projection-not-yet-loaded) branches below.
      // Byte-for-byte the original per-group bubble derivation.
      const buildGroupAreaPoint = (group: AreaGroup): AreaPoint | null => {
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
      };

      if (activeScope) {
        // Issue #1910 (PR2) — resolveScope-based classification REPLACES the
        // old ad-hoc id/name/slug/region_key OR-match (see resolveScope.ts).
        const resolved = resolveScope(activeScope, resolvedScopeNamespaces);

        if (resolved.kind === 'region') {
          // "Group posing as region" (pre-#1910 pattern, e.g. Udupi's
          // simplified city hierarchy where a single group IS the
          // region-summary entry — resolvedScopeNamespaces.regionKeys then
          // legitimately contains that group's own id). This is checked
          // BEFORE the projection query-state gate below and does NOT wait
          // on regionScopedGroups at all: the real region-scoped-groups
          // endpoint only ever has data for genuine city_regions.region_key
          // values (N/E/S/W/CENTRAL/...), never for an arbitrary group id
          // used as a pseudo-region key, so waiting on that fetch here would
          // never resolve to anything useful. The V119 disjointness trigger
          // guarantees a REAL region_key can never equal an active group's
          // slug, so this only ever fires for this specific legacy pattern.
          const directGroupMatch = groups.find((g) => g.id === activeScope);
          if (directGroupMatch) {
            const groupAreaKeys = directGroupMatch.area_keys ?? [];
            return discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
          }

          // Review fix (#1910 PR2) — one shared query-state gate with the
          // panel (AreaGroupsLandingPanel) and camera
          // (useDiscoverCameraOrchestration): `regionScopedGroups` is
          // `undefined` in BOTH the pending and error states of the
          // projection fetch (React Query only ever populates `data` on a
          // genuine success), and only ever a real (possibly empty) array on
          // success. Previously an undefined projection — whether still
          // loading OR having genuinely failed — fell back to the legacy
          // Resolution-A `region_key` filter, rendering markers built from
          // group data known to be wrong for a spanning group (the whole
          // reason Resolution B exists). Now: no markers at all until the
          // projection actually succeeds — pending/error render nothing
          // rather than briefly-wrong markers, matching the panel's
          // loading-skeleton / error-retry states with no fallback markers
          // underneath them.
          if (!regionScopedGroups) {
            return [];
          }

          // Prefer the region-scoped projection (Resolution A→B, #1910): a
          // group whose plurality region_key is some OTHER region can still
          // have real members in this region, and must still appear here.
          return regionScopedGroups
            .map((g): AreaPoint | null => {
              // boundsStatus === 'UNAVAILABLE' means zero usable geometry
              // for this subset — omit from the map entirely rather than
              // ever fabricating a marker position (#1910).
              if (g.boundsStatus === 'UNAVAILABLE') return null;
              if (g.focusLat == null || g.focusLon == null) return null;
              // 'APPROXIMATE' bounds are real data from a valid-bbox
              // subset — safe to render directly, same as 'COMPLETE'.
              const bbox: [[number, number], [number, number]] | null =
                g.minLat != null && g.minLon != null && g.maxLat != null && g.maxLon != null
                  ? [[g.minLat, g.minLon], [g.maxLat, g.maxLon]]
                  : null;
              return {
                areaKey: g.groupSlug,
                areaLabel: g.name,
                geo_center_lat: g.focusLat,
                geo_center_lon: g.focusLon,
                bbox,
                listingCount: g.listingCount,
                schoolCount: undefined,
                isGroup: true,
              };
            })
            .filter((a): a is AreaPoint => a !== null && (a.listingCount ?? 0) > 0);
        }

        if (resolved.kind === 'group') {
          // The matched scope is itself a single area group (e.g. Udupi
          // 3-level where scope="south-udupi" is group.id) — there are no
          // sub-zones inside it, so return its member areas directly.
          const targetGroup = groups.find((g) => g.id === resolved.groupSlug);
          if (!targetGroup) return [];
          const groupAreaKeys = targetGroup.area_keys ?? [];
          return discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
        }

        // resolved.kind === 'none' (or 'area', not applicable at this
        // layer) — the scope matched no known region/group; preserves the
        // original empty-target-groups behaviour (no silent fallback to
        // the full group list).
        return [];
      }

      if (groups.length === 0) {
        return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
      }

      return groups
        .map(buildGroupAreaPoint)
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

          // Issue #1910 (PR2) — resolveScope-based classification REPLACES
          // the old ad-hoc id/region_key OR-match. A group whose OWN id
          // resolves (via the shared namespaces) to this very region key
          // covers the "group posing as a region" edge case (e.g. a 3-level
          // city hierarchy); g.region_key === region.regionKey covers the
          // normal derived-at-read region-scope signal.
          //
          // Issue #1910 (PR2 fix-up, Finding 1) — the third original clause,
          // `g.name.toLowerCase() === region.regionLabel.toLowerCase()`, is
          // restored below AS-IS rather than routed through resolveScope: it
          // is not a raw-`urlState.scope`-string classification (resolveScope's
          // contract) at all — it's an independent group⇄region equivalence
          // check comparing two DATA FIELDS (a group's own display name vs. a
          // region's display label), relevant when a group's region_key is
          // still null (e.g. AreaGroupsService.deriveRegionKey's DEGENERATE
          // case — no member yet classified into any region) but the group's
          // name already textually matches the region it conceptually belongs
          // to (e.g. a simplified city hierarchy pre-region-onboarding).
          const matchingGroups = groups.filter((g) => {
            const resolvedGroupId = resolveScope(g.id, resolvedScopeNamespaces);
            const isGroupItselfThisRegion =
              resolvedGroupId.kind === 'region' && resolvedGroupId.regionKey === region.regionKey;
            const isNameLabelMatch = g.name.toLowerCase() === region.regionLabel.toLowerCase();
            return isGroupItselfThisRegion || isNameLabelMatch || g.region_key === region.regionKey;
          });

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
            isSelected: region.regionKey === urlState.scope,
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
    resolvedScopeNamespaces,
    regionScopedGroups,
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

  // Issue #1808 — region-overview predicate (AC2-AC12): scope set, journey
  // null, no narrower selection. Deliberately independent of resolvedPanelContent
  // (derivePanelContent does not read `scope` — see discoverPanelState.ts —
  // so this state still resolves to panelContent 'guided-entry', rendering
  // GuidedEntryPanel; the guidance ring/helper are wired into GuidedEntryPanel's
  // existing JourneySwitcher section, NOT AreaGroupsLandingPanel, which is only
  // reachable once journey is set and is never mounted at this state).
  const isRegionOverview =
    urlState.scope != null &&
    urlState.journey == null &&
    !urlState.groupId &&
    !urlState.areaKey &&
    !urlState.schoolId &&
    selectedMarkerListing == null;

  // Issue #1798 PR-B1 — unified region/scope resolution for map breadcrumb hierarchy.
  const resolvedRegionLabel =
    (urlState.scope
      ? summaryRegions.find((r) => r.regionKey.toLowerCase() === urlState.scope?.toLowerCase())?.regionLabel ?? prettifyZoneSlug(urlState.scope)
      : focusedGroup?.region_label) ?? null;

  const resolvedScopeKeyForHref =
    urlState.scope ??
    (focusedGroup?.region_label
      ? summaryRegions.find((r) => r.regionLabel.toLowerCase() === focusedGroup.region_label!.toLowerCase())?.regionKey ?? focusedGroup.region_label.toLowerCase().replace(/\s+/g, '-')
      : null);

  // Issue #1808 q1 — marker-accurate variant derived from the ACTUAL resolved
  // overview markers (never a curated/withheld preview). `overviewAreas` items
  // carry `isGroup: true` only for the zone/group-bubble branch of the
  // region-zone-areas layer (see the useMemo above); the direct-group-match
  // branch returns member AREA points with no `isGroup` flag.
  const regionOverviewMarkerKind: RegionOverviewMarkerKind =
    isRegionOverview && mapLayerKind === 'region-zone-areas' && overviewAreas.length > 0
      ? (overviewAreas.some((a) => a.isGroup) ? 'zones' : 'areas')
      : null;

  // Issue #1808 — short region label for the map legend line 1 (e.g. "East"
  // from "East Bangalore"). Presentational formatting only, no new data source.
  const regionOverviewShortLabel = resolvedRegionLabel
    ? (() => {
        const cityLabel = CITY_CONFIG[city]?.label ?? city;
        const stripped = resolvedRegionLabel.replace(new RegExp(`\\s*${cityLabel}$`, 'i'), '').trim();
        return stripped.length > 0 ? stripped : resolvedRegionLabel;
      })()
    : null;

  const areaJourneySegmentsRaw: { key: string; label: string | null | undefined; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string; href?: string }[] = [
    {
      key: 'city',
      label: CITY_CONFIG[city]?.label ?? city,
      href: (resolvedRegionLabel || focusedGroup || selectedArea || urlState.groupId || urlState.areaKey) ? `/discover?city=${encodeURIComponent(city)}&journey=${encodeURIComponent(urlState.journey || 'area-first')}` : undefined,
    },
    {
      key: 'region',
      label: resolvedRegionLabel,
      href: (focusedGroup || selectedArea || urlState.groupId || urlState.areaKey) && resolvedScopeKeyForHref ? `/discover?city=${encodeURIComponent(city)}&journey=${encodeURIComponent(urlState.journey || 'area-first')}&scope=${encodeURIComponent(resolvedScopeKeyForHref)}` : undefined,
      maxWidthClass: 'max-w-[140px]',
      emphasis: (focusedGroup || selectedArea || urlState.groupId || urlState.areaKey) ? ('muted' as const) : ('strong' as const),
    },
    {
      key: 'group',
      label: focusedGroup?.name ?? (urlState.groupId ? prettifyZoneSlug(urlState.groupId) : null),
      href: (selectedArea || urlState.areaKey) && (focusedGroup?.id || urlState.groupId) ? `/discover?city=${encodeURIComponent(city)}&journey=${encodeURIComponent(urlState.journey || 'area-first')}&groupId=${encodeURIComponent(focusedGroup?.id ?? urlState.groupId!)}` : undefined,
      maxWidthClass: 'max-w-[160px]',
      emphasis: (selectedArea || urlState.areaKey) ? ('muted' as const) : ('strong' as const),
    },
    {
      key: 'area',
      label: selectedArea?.areaLabel ?? areaKeyToLabel(urlState.areaKey),
      maxWidthClass: 'max-w-[160px]',
      emphasis: 'strong' as const,
    },
  ];
  const areaJourneySegments: DiscoverMapCrumb[] = areaJourneySegmentsRaw
    .filter((s): s is { key: string; label: string; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string; href?: string } =>
      typeof s.label === 'string' && s.label.trim().length > 0)
    .map((s) => ({ key: s.key, label: s.label, emphasis: s.emphasis, maxWidthClass: s.maxWidthClass, href: s.href }));

  // Issue #1745 P4 — resolved City › Zone › Area › School segments for the school-journey
  // map breadcrumb (DiscoverMapBreadcrumb). Built here (not inside the shared component,
  // which never filters/fabricates) so any segment whose label hasn't resolved yet is
  // dropped — a zone-only context reads "Udupi › University Belt", an area context reads
  // "Udupi › University Belt › Manipal". The school segment only appears once a schoolId is
  // actually in the URL (guards against a stale selectedSchool lagging a back navigation).
  // Not memoized: this component already has pre-existing conditionally-invoked hooks
  // further down (rules-of-hooks violations predating #1745 P4 — out of scope here), so a
  // useMemo placed after them would itself become conditional. The computation below is a
  // handful of string comparisons — cheap enough to run on every render without memoizing.
  const schoolJourneySegmentsRaw: { key: string; label: string | null | undefined; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string }[] = [
    { key: 'city', label: CITY_CONFIG[city]?.label ?? city },
    { key: 'region', label: resolvedRegionLabel, maxWidthClass: 'max-w-[140px]' },
    { key: 'zone', label: focusedGroup?.name ?? prettifyZoneSlug(urlState.groupId) },
    { key: 'area', label: selectedArea?.areaLabel ?? areaKeyToLabel(urlState.areaKey) },
    {
      key: 'school',
      label: urlState.schoolId ? (selectedSchool?.name ?? null) : null,
      emphasis: 'school',
      maxWidthClass: 'max-w-[180px]',
    },
  ];
  const schoolJourneySegments: DiscoverMapCrumb[] = schoolJourneySegmentsRaw
    .filter((s): s is { key: string; label: string; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string } =>
      typeof s.label === 'string' && s.label.trim().length > 0)
    .map((s) => ({ key: s.key, label: s.label, emphasis: s.emphasis, maxWidthClass: s.maxWidthClass }));

  return {
    overviewAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
    visibleMemberSet: resolvedVisibleMemberSet,
  };
}
