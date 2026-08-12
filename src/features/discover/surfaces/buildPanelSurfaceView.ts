import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { AgriMapListingItem, AgriMapListingsResponse } from '@/hooks/useAgriMapListings';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { DiscoverListingItem } from '@/hooks/useDiscoverListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { DiscoverInteractionCommands } from '@/features/discover/state/useDiscoverInteractionState';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { ScopeNamespaces } from '@/features/discover/presentation/resolveScope';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

/**
 * Issue #2142 Commit 4 — the flat prop shape DiscoverRightPanelContainer.tsx
 * used to declare as `DiscoverRightPanelContainerProps` (see git history for
 * that file, deleted as part of this commit's true-rename). Moved here
 * verbatim rather than re-exported from DiscoverPanelSurface.tsx, since that
 * component's own public prop type is now the grouped `{view, commands}`
 * shape — this flat interface only still exists as the shared input type
 * both builders below accept.
 */
export interface DiscoverRightPanelContainerProps {
  resolvedPanelContent: DiscoverPanelContent;
  selectedMarkerListing: PropertyListingWithImages | null;
  clearSelectedMarkerListing: () => void;
  city: string;
  activeContextChips: ReactNode;
  discoverAreas: AreaPoint[];
  selectedArea: AreaPoint | null;
  areaListings: DiscoverCityListingItem[];
  isLoadingAreaListings: boolean;
  isAuthenticated: boolean;
  handleAreaSelect: (area: AreaPoint) => void;
  areaResultSummaryText: string | null;
  journeyView: DiscoverJourneyTransitionsView;
  handleAreaFirstBack: () => void;
  journeyCommands: DiscoverJourneyTransitionsCommands;
  areasLoading: boolean;
  agriAreasData: DiscoverArea[] | undefined;
  isLoadingAgriAreas: boolean;
  /** AreaGroupsResponse's shape ({ groups: AreaGroup[] }) — that response type itself is not exported by useAreaGroups.ts. */
  areaGroupsData: { groups: AreaGroup[] } | undefined;
  isLoadingAreaGroups: boolean;
  /** Issue #1910 (PR2) — region-scoped area-group projection for the currently active region scope. */
  regionScopedGroups: RegionScopedAreaGroup[] | undefined;
  isLoadingRegionScopedGroups: boolean;
  /**
   * Issue #1910 (PR2 review fix, Finding 3) — true when the region-scoped
   * projection fetch failed. Forwarded to AreaGroupsLandingPanel so a real
   * backend failure renders an honest error+retry state instead of being
   * indistinguishable from "this region legitimately has zero groups".
   */
  isRegionScopedGroupsError: boolean;
  refetchRegionScopedGroups: () => void;
  /**
   * Issue #1910 (PR2 review fix, Finding 2) — the single source-of-truth,
   * alias-aware scope namespaces built once in MapDiscovery (includes
   * groupNameSlugs), forwarded so AreaGroupsLandingPanel's own resolveScope
   * call classifies the active scope identically to every other call site
   * instead of rebuilding a reduced local namespace.
   */
  scopeNamespaces: ScopeNamespaces;
  armRegionSelect: (source: 'map' | 'panel') => void;
  regionGuideRingActive: boolean;
  regionOverviewMarkerKind: RegionOverviewMarkerKind;
  regionSelectNonce: number;
  prefersReducedMotion: boolean;
  summaryRegions: SummaryRegionRef[];
  selectedGroupName: string | null;
  corridorGroups: CorridorGroupData[];
  isLoadingRegionalAreaGroups: boolean;
  isRegionalAreaGroupsError: boolean;
  refetchRegionalAreaGroups: () => void;
  selectedRegion: string | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  filteredAgriListings: AgriMapListingItem[] | null;
  agriMapListingsData: AgriMapListingsResponse | undefined;
  isLoadingAgriGroupListings: boolean;
  isAgriGroupListingsError: boolean;
  agriGroupLabel: string | null;
  refetchAgriGroupListings: () => void;
  discoverAreasForPanel: DiscoverArea[];
  filtersContent: ReactNode;
  trendsHref: string;
  isFetching: boolean;
  isLoading: boolean;
  searchQuery: string;
  handleSearchChange: (q: string) => void;
  filters: PropertyFilters;
  handleFiltersChange: (next: PropertyFilters) => void;
  selectedSchool: SchoolResult | null;
  schools: SchoolResult[];
  schoolsQuery: UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>;
  schoolListings: DiscoverCityListingItem[];
  listingDataLoading: boolean;
  handleBoundedSearch: () => void;
  interactionCommands: DiscoverInteractionCommands;
  setAreaSearchQuery: Dispatch<SetStateAction<string>>;
  areaMarkerCounts: { shown: number; total: number };
  highlightedAreaKeys: string[];
  selectedGroupListingItem: AgriMapListingItem | null;
  navigate: (path: string) => void;
  cityTotal: number;
  cityHasNoListings: boolean;
  handleCityChange: (newCity: string) => void;
  groupResultsListings: DiscoverListingItem[];
  isLoadingGroupResults: boolean;
  isGroupResultsError: boolean;
  groupResultsTotalElements: number | undefined;
  refetchGroupResults: () => void;
  page: number;
  totalPages: number;
  totalElements: number;
  setPage: Dispatch<SetStateAction<number>>;
  /**
   * Issue #1956 PR 2 — the ONE `useAreasNavigationJourney` result MapDiscovery
   * resolved, threaded down unchanged so this container never re-derives its
   * own node/counts (AC3.4/AC3.9/T3 — map and panel share this by reference).
   */
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  hoveredNavigationNodeKey?: string | null;
  onNavigationNodeHoverChange?: (nodeKey: string | null) => void;
  /**
   * Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
   * visual-AREA-cluster identity MapDiscovery owns alongside
   * `hoveredNavigationNodeKey`, threaded through unchanged so this
   * container's `DiscoverAreasJourneyPanel` and the map's
   * `AreaDestinationMarkerLayer` can never disagree on the focused member
   * set. Never written to the URL — no history entry, no camera fit.
   */
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  /**
   * Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — forwarded unchanged to
   * `DiscoverAreasJourneyPanel`. MapDiscovery stores the reported preview
   * in state and renders the mobile Map-mode preview sheet from it; this
   * container has no opinion on Map/List mode or mobile/desktop.
   */
  onSelectedListingPreviewChange?: (preview: SelectedListingPreview | null) => void;
}

/**
 * Issue #2142 Commit 4 — typed view/commands contract for DiscoverPanelSurface
 * (the renamed DiscoverRightPanelContainer). Every group below is a `Pick`
 * straight off the (now-moved-here) DiscoverRightPanelContainerProps, keyed
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
