import { useDiscoverJourneyPredicates } from '@/features/discover/presentation/useDiscoverJourneyPredicates';
import { useDiscoverMapPresentation } from '@/features/discover/presentation/useDiscoverMapPresentation';
import type { ScopeNamespaces } from '@/features/discover/selectors/listingScope';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { DiscoverPanelContent } from '@/features/discover/selectors/panelContent';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';

export interface UseDiscoverMapLayerControllerParams {
  // useDiscoverJourneyPredicates inputs.
  resolvedPanelContent: DiscoverPanelContent;
  focusedGroup: AreaGroup | null;
  effectiveSelectedArea: AreaPoint | null;
  selectedSchool: SchoolResult | null;
  discoverAreas: AreaPoint[];
  areasLoading: boolean;
  cityTotal: number;
  urlState: DiscoverUrlState;
  isAgriJourney: boolean;
  mapZoom: number;

  // useDiscoverMapPresentation inputs (beyond what's already covered above).
  isLoadingAreaGroups: boolean;
  isLoadingRegionalAreaGroups: boolean;
  isLandingState: boolean;
  areaGroupsData: { groups: AreaGroup[] } | undefined;
  corridorGroups: import('@/hooks/useRegionalAreaGroups').CorridorGroupData[];
  agriAreasData: import('@/hooks/useDiscoverAreas').DiscoverAreasResponse['areas'] | undefined;
  summaryRegions: DiscoverSummaryRegion[];
  cityCenter: [number, number] | undefined;
  debouncedAreaSearchQuery: string;
  city: string;
  selectedMarkerListing: import('@/hooks/usePropertyListings').PropertyListing & { images?: import('@/hooks/usePropertyListings').PropertyImage[] } | null;

  /**
   * Shared single source-of-truth region/group namespaces, built once by the
   * Geography controller and reused here — NOT recomputed, so classification
   * can never drift between this call site and the camera controller's.
   */
  scopeNamespaces: ScopeNamespaces;
  regionScopedGroupsData: { groups?: RegionScopedAreaGroup[] } | undefined;
  visibleMemberSet: import('@/features/discover/navigation/visibleMemberSet').VisibleMemberSet | undefined;
}

/**
 * Issue #2142 (correction pass) — split out of the former
 * `useDiscoverMapPresentationController`.
 *
 * OWNS which layer the Discover map is currently rendering and what feeds it:
 * `useDiscoverJourneyPredicates` (issue #1824 Slice S11d) +
 * `useDiscoverMapPresentation` (issue #1824 Slice S9b1/S9b2).
 *
 * The two are deliberately kept in ONE controller rather than split further:
 * `mapLayerKind` is an OUTPUT of the predicates hook and a REQUIRED INPUT of
 * the presentation hook, so separating them would produce two controllers with
 * a one-way private dependency and no independent consumer — the exact
 * "artificial coupling / pass-through" shape the ≤200-LOC heuristic is meant
 * to prevent, not create.
 *
 * INVARIANT OWNERSHIP:
 *   - #1762 listing-density clustering — this controller owns the layer-kind
 *     and `liveAreas`/`overviewAreas` inputs the clustering layer consumes.
 *   - Schools-canonical-geography (#2124) — `schoolJourneySegments` (the
 *     school breadcrumb's canonical segment list) is produced here and
 *     nowhere else.
 */
export function useDiscoverMapLayerController({
  resolvedPanelContent,
  focusedGroup,
  effectiveSelectedArea,
  selectedSchool,
  discoverAreas,
  areasLoading,
  cityTotal,
  urlState,
  isAgriJourney,
  mapZoom,
  isLoadingAreaGroups,
  isLoadingRegionalAreaGroups,
  isLandingState,
  areaGroupsData,
  corridorGroups,
  agriAreasData,
  summaryRegions,
  cityCenter,
  debouncedAreaSearchQuery,
  city,
  selectedMarkerListing,
  scopeNamespaces,
  regionScopedGroupsData,
  visibleMemberSet,
}: UseDiscoverMapLayerControllerParams) {
  // Issue #1824 Slice S11d — pre-layer "C1" predicate cluster.
  const {
    mapLayerKind,
    mapLayerCategory,
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
  } = useDiscoverJourneyPredicates({
    resolvedPanelContent,
    focusedGroup,
    selectedArea: effectiveSelectedArea,
    selectedSchool,
    discoverAreas,
    areasLoading,
    cityTotal,
    urlState,
    isAgriJourney,
    mapZoom,
  });

  // Issue #1824 Slice S9b1/S9b2 — overviewAreas + areaSearchMatchKeys + region/breadcrumb cluster.
  const {
    overviewAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
  } = useDiscoverMapPresentation({
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
    city,
    selectedArea: effectiveSelectedArea,
    selectedSchool,
    selectedMarkerListing,
    scopeNamespaces,
    regionScopedGroups: regionScopedGroupsData?.groups,
    visibleMemberSet,
  });

  return {
    mapLayerKind,
    mapLayerCategory,
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
    overviewAreas,
    discoverAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
  };
}
