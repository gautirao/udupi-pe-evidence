import type { DiscoverRightPanelContainerProps } from '@/features/discover/views/DiscoverRightPanelContainer';

/**
 * Issue #2142 Commit 4 — typed view/commands contract for DiscoverPanelSurface
 * (the renamed DiscoverRightPanelContainer). Every group below is a `Pick`
 * straight off the real (unmodified) DiscoverRightPanelContainerProps, keyed
 * by identical field names, so DiscoverPanelSurface.tsx can reconstruct the
 * exact flat props object DiscoverRightPanel still expects by spreading every
 * group back together.
 *
 * Deviation from the architect's original spec: view groups add `routing`
 * (city/cityTotal/navigate/trendsHref — the architect's own named group) and
 * commands groups add `routing`/`geography` (the architect listed commands as
 * navigation/results/filters/schools/agri/interaction only). Real field usage
 * shows `geography`'s 31 view fields carry 6 real callbacks
 * (handleAreaSelect/handleAreaFirstBack/setAreaSearchQuery/
 * refetchRegionScopedGroups/armRegionSelect/refetchRegionalAreaGroups) that
 * have nowhere sound to live in the architect's 6 commands groups without
 * either duplicating them under an unrelated group or breaking the 1:1
 * view/commands group symmetry every other surface in this PR uses. Mirroring
 * view groups 1:1 for commands is more consistent, not less, than the
 * asymmetric original spec — same "field-usage over spec-literal" judgment
 * already applied to Commits 2-3's corridorGroups/Agri and this commit's
 * DiscoverMapSurface `overlays` addition.
 */

type PanelRoutingView = Pick<
  DiscoverRightPanelContainerProps,
  'city' | 'cityTotal' | 'cityHasNoListings' | 'trendsHref'
>;
type PanelRoutingCommands = Pick<DiscoverRightPanelContainerProps, 'handleCityChange' | 'navigate'>;

type PanelGeographyView = Pick<
  DiscoverRightPanelContainerProps,
  | 'discoverAreas'
  | 'selectedArea'
  | 'areaListings'
  | 'isLoadingAreaListings'
  | 'areaResultSummaryText'
  | 'areasLoading'
  | 'discoverAreasForPanel'
  | 'areaMarkerCounts'
  | 'highlightedAreaKeys'
  | 'scopeNamespaces'
  | 'regionScopedGroups'
  | 'isLoadingRegionScopedGroups'
  | 'isRegionScopedGroupsError'
  | 'areaGroupsData'
  | 'isLoadingAreaGroups'
  | 'regionGuideRingActive'
  | 'regionOverviewMarkerKind'
  | 'regionSelectNonce'
  | 'summaryRegions'
  | 'selectedGroupName'
  | 'corridorGroups'
  | 'isLoadingRegionalAreaGroups'
  | 'isRegionalAreaGroupsError'
  | 'selectedRegion'
  | 'selectedMaxKm'
>;
type PanelGeographyCommands = Pick<
  DiscoverRightPanelContainerProps,
  | 'handleAreaSelect'
  | 'handleAreaFirstBack'
  | 'setAreaSearchQuery'
  | 'refetchRegionScopedGroups'
  | 'armRegionSelect'
  | 'refetchRegionalAreaGroups'
>;

type PanelResultsView = Pick<
  DiscoverRightPanelContainerProps,
  | 'groupResultsListings'
  | 'isLoadingGroupResults'
  | 'isGroupResultsError'
  | 'groupResultsTotalElements'
  | 'page'
  | 'totalPages'
  | 'totalElements'
  | 'selectedGroupListingItem'
  | 'isFetching'
  | 'isLoading'
  | 'listingDataLoading'
>;
type PanelResultsCommands = Pick<
  DiscoverRightPanelContainerProps,
  'refetchGroupResults' | 'setPage' | 'handleBoundedSearch'
>;

type PanelAgriView = Pick<
  DiscoverRightPanelContainerProps,
  | 'agriAreasData'
  | 'isLoadingAgriAreas'
  | 'filteredAgriListings'
  | 'agriMapListingsData'
  | 'isLoadingAgriGroupListings'
  | 'isAgriGroupListingsError'
  | 'agriGroupLabel'
>;
type PanelAgriCommands = Pick<DiscoverRightPanelContainerProps, 'refetchAgriGroupListings'>;

type PanelSchoolsView = Pick<
  DiscoverRightPanelContainerProps,
  'selectedSchool' | 'schools' | 'schoolsQuery' | 'schoolListings'
>;

type PanelFiltersView = Pick<DiscoverRightPanelContainerProps, 'filters' | 'filtersContent' | 'searchQuery'>;
type PanelFiltersCommands = Pick<
  DiscoverRightPanelContainerProps,
  'handleFiltersChange' | 'handleSearchChange'
>;

type PanelNavigationView = Pick<
  DiscoverRightPanelContainerProps,
  | 'areasNavigationJourney'
  | 'hoveredNavigationNodeKey'
  | 'focusedClusterMemberAreaKeys'
  | 'journeyView'
  | 'resolvedPanelContent'
>;
type PanelNavigationCommands = Pick<
  DiscoverRightPanelContainerProps,
  'onNavigationNodeHoverChange' | 'onClusterFocusChange' | 'journeyCommands' | 'onSelectedListingPreviewChange'
>;

type PanelInteractionView = Pick<
  DiscoverRightPanelContainerProps,
  'selectedMarkerListing' | 'activeContextChips' | 'prefersReducedMotion' | 'isAuthenticated'
>;
type PanelInteractionCommands = Pick<
  DiscoverRightPanelContainerProps,
  'clearSelectedMarkerListing' | 'interactionCommands'
>;

export interface DiscoverPanelSurfaceView {
  routing: PanelRoutingView;
  geography: PanelGeographyView;
  results: PanelResultsView;
  agri: PanelAgriView;
  schools: PanelSchoolsView;
  filters: PanelFiltersView;
  navigation: PanelNavigationView;
  interaction: PanelInteractionView;
}

export interface DiscoverPanelSurfaceCommands {
  routing: PanelRoutingCommands;
  geography: PanelGeographyCommands;
  results: PanelResultsCommands;
  agri: PanelAgriCommands;
  filters: PanelFiltersCommands;
  navigation: PanelNavigationCommands;
  interaction: PanelInteractionCommands;
}

export type BuildPanelSurfaceViewParams = DiscoverRightPanelContainerProps;

export function buildPanelSurfaceView(params: BuildPanelSurfaceViewParams): DiscoverPanelSurfaceView {
  const {
    city,
    cityTotal,
    cityHasNoListings,
    trendsHref,
    discoverAreas,
    selectedArea,
    areaListings,
    isLoadingAreaListings,
    areaResultSummaryText,
    areasLoading,
    discoverAreasForPanel,
    areaMarkerCounts,
    highlightedAreaKeys,
    scopeNamespaces,
    regionScopedGroups,
    isLoadingRegionScopedGroups,
    isRegionScopedGroupsError,
    areaGroupsData,
    isLoadingAreaGroups,
    regionGuideRingActive,
    regionOverviewMarkerKind,
    regionSelectNonce,
    summaryRegions,
    selectedGroupName,
    corridorGroups,
    isLoadingRegionalAreaGroups,
    isRegionalAreaGroupsError,
    selectedRegion,
    selectedMaxKm,
    groupResultsListings,
    isLoadingGroupResults,
    isGroupResultsError,
    groupResultsTotalElements,
    page,
    totalPages,
    totalElements,
    selectedGroupListingItem,
    isFetching,
    isLoading,
    listingDataLoading,
    agriAreasData,
    isLoadingAgriAreas,
    filteredAgriListings,
    agriMapListingsData,
    isLoadingAgriGroupListings,
    isAgriGroupListingsError,
    agriGroupLabel,
    selectedSchool,
    schools,
    schoolsQuery,
    schoolListings,
    filters,
    filtersContent,
    searchQuery,
    areasNavigationJourney,
    hoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    journeyView,
    resolvedPanelContent,
    selectedMarkerListing,
    activeContextChips,
    prefersReducedMotion,
    isAuthenticated,
  } = params;

  return {
    routing: { city, cityTotal, cityHasNoListings, trendsHref },
    geography: {
      discoverAreas,
      selectedArea,
      areaListings,
      isLoadingAreaListings,
      areaResultSummaryText,
      areasLoading,
      discoverAreasForPanel,
      areaMarkerCounts,
      highlightedAreaKeys,
      scopeNamespaces,
      regionScopedGroups,
      isLoadingRegionScopedGroups,
      isRegionScopedGroupsError,
      areaGroupsData,
      isLoadingAreaGroups,
      regionGuideRingActive,
      regionOverviewMarkerKind,
      regionSelectNonce,
      summaryRegions,
      selectedGroupName,
      corridorGroups,
      isLoadingRegionalAreaGroups,
      isRegionalAreaGroupsError,
      selectedRegion,
      selectedMaxKm,
    },
    results: {
      groupResultsListings,
      isLoadingGroupResults,
      isGroupResultsError,
      groupResultsTotalElements,
      page,
      totalPages,
      totalElements,
      selectedGroupListingItem,
      isFetching,
      isLoading,
      listingDataLoading,
    },
    agri: {
      agriAreasData,
      isLoadingAgriAreas,
      filteredAgriListings,
      agriMapListingsData,
      isLoadingAgriGroupListings,
      isAgriGroupListingsError,
      agriGroupLabel,
    },
    schools: { selectedSchool, schools, schoolsQuery, schoolListings },
    filters: { filters, filtersContent, searchQuery },
    navigation: {
      areasNavigationJourney,
      hoveredNavigationNodeKey,
      focusedClusterMemberAreaKeys,
      journeyView,
      resolvedPanelContent,
    },
    interaction: { selectedMarkerListing, activeContextChips, prefersReducedMotion, isAuthenticated },
  };
}

export type BuildPanelSurfaceCommandsParams = Pick<
  DiscoverRightPanelContainerProps,
  | 'handleCityChange'
  | 'navigate'
  | 'handleAreaSelect'
  | 'handleAreaFirstBack'
  | 'setAreaSearchQuery'
  | 'refetchRegionScopedGroups'
  | 'armRegionSelect'
  | 'refetchRegionalAreaGroups'
  | 'refetchGroupResults'
  | 'setPage'
  | 'handleBoundedSearch'
  | 'refetchAgriGroupListings'
  | 'handleFiltersChange'
  | 'handleSearchChange'
  | 'onNavigationNodeHoverChange'
  | 'onClusterFocusChange'
  | 'journeyCommands'
  | 'onSelectedListingPreviewChange'
  | 'clearSelectedMarkerListing'
  | 'interactionCommands'
>;

export function buildPanelSurfaceCommands(
  params: BuildPanelSurfaceCommandsParams,
): DiscoverPanelSurfaceCommands {
  const {
    handleCityChange,
    navigate,
    handleAreaSelect,
    handleAreaFirstBack,
    setAreaSearchQuery,
    refetchRegionScopedGroups,
    armRegionSelect,
    refetchRegionalAreaGroups,
    refetchGroupResults,
    setPage,
    handleBoundedSearch,
    refetchAgriGroupListings,
    handleFiltersChange,
    handleSearchChange,
    onNavigationNodeHoverChange,
    onClusterFocusChange,
    journeyCommands,
    onSelectedListingPreviewChange,
    clearSelectedMarkerListing,
    interactionCommands,
  } = params;

  return {
    routing: { handleCityChange, navigate },
    geography: {
      handleAreaSelect,
      handleAreaFirstBack,
      setAreaSearchQuery,
      refetchRegionScopedGroups,
      armRegionSelect,
      refetchRegionalAreaGroups,
    },
    results: { refetchGroupResults, setPage, handleBoundedSearch },
    agri: { refetchAgriGroupListings },
    filters: { handleFiltersChange, handleSearchChange },
    navigation: {
      onNavigationNodeHoverChange,
      onClusterFocusChange,
      journeyCommands,
      onSelectedListingPreviewChange,
    },
    interaction: { clearSelectedMarkerListing, interactionCommands },
  };
}
