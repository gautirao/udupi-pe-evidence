import type { ReactNode } from 'react';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import type { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import type { useDiscoverNavigationController } from '@/features/discover/controllers/useDiscoverNavigationController';
import type { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';
import type { useDiscoverAreaGroupsController } from '@/features/discover/controllers/useDiscoverAreaGroupsController';
import type { useDiscoverGeographyController } from '@/features/discover/controllers/useDiscoverGeographyController';
import type { useDiscoverMapDataController } from '@/features/discover/controllers/useDiscoverMapDataController';
import type { useDiscoverAgriController } from '@/features/discover/controllers/useDiscoverAgriController';
import type { useDiscoverResultsController } from '@/features/discover/controllers/useDiscoverResultsController';
import type { useDiscoverSchoolController } from '@/features/discover/controllers/useDiscoverSchoolController';
import type { useDiscoverBadgeController } from '@/features/discover/controllers/useDiscoverBadgeController';
import type { useDiscoverJourneyChromeController } from '@/features/discover/controllers/useDiscoverJourneyChromeController';
import type { useDiscoverFilterChromeController } from '@/features/discover/controllers/useDiscoverFilterChromeController';
import type { useDiscoverInteractionController } from '@/features/discover/controllers/useDiscoverInteractionController';
import type { useDiscoverRegionGuideController } from '@/features/discover/controllers/useDiscoverRegionGuideController';
import type { useDiscoverMapLayerController } from '@/features/discover/controllers/useDiscoverMapLayerController';
import type { useDiscoverBoundedBrowseController } from '@/features/discover/controllers/useDiscoverBoundedBrowseController';
import type { useBoundedSearchTrigger } from '@/features/discover/controllers/useBoundedSearchTrigger';
import type { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';
import type { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';

/**
 * Issue #2142 (correction pass) — the panel surface's INPUT contract, rebuilt
 * around the owner's corrective point #3: "decouple DiscoverPanelSurface from
 * its flat-prop round-trip".
 *
 * WHAT CHANGED. This module used to declare `DiscoverRightPanelContainerProps`
 * — a hand-written 67-field flat interface — as its own input type, which the
 * composition root then had to satisfy by naming all 67 fields in an object
 * literal, only for the two builders to immediately re-group them. Three
 * hand-maintained copies of the same field list, none of which was the source
 * of truth.
 *
 * That interface is DELETED. Its replacement is derived, not written:
 *
 *   - `BuildPanelSurfaceModelParams` takes the CONTROLLERS' OWN result objects
 *     (narrowed with `Pick`), so the composition root passes references rather
 *     than transcribing fields, and a controller renaming an output is a
 *     compile error here rather than a silent drift.
 *   - `PanelFields` below is the intersection of those same slices plus the
 *     handful of fields this surface genuinely RENAMES or DERIVES. Every
 *     view/commands group is a `Pick` off that, so the group definitions read
 *     exactly as before while their provenance is now the controllers.
 *
 * WHAT DID NOT CHANGE. The `view`/`commands` OUTPUT shape is identical, and
 * `DiscoverPanelSurface.tsx`'s body — its destructuring prelude, journey
 * routing, inline closures and footer pager — is untouched. Leaf components
 * (DiscoverRightPanel et al.) keep their existing flat prop interfaces; the
 * TypeScript check at the `<DiscoverRightPanel .../>` call site is what proves
 * prop parity now, in place of the deleted interface's redundant restatement.
 */

type PageContextSlice = Pick<ReturnType<typeof useDiscoverPageContext>, 'navigate' | 'isAuthenticated'>;
type PageStateSlice = Pick<
  ReturnType<typeof useDiscoverPageStateController>,
  | 'city'
  | 'filters'
  | 'handleFiltersChange'
  | 'handleCityChange'
  | 'handleAreaSelect'
  | 'selectedSchool'
  | 'page'
  | 'setPage'
  | 'resolvedPanelContent'
  | 'effectiveSelectedArea'
>;
type NavigationSlice = Pick<
  ReturnType<typeof useDiscoverNavigationController>,
  | 'hoveredNavigationNodeKey'
  | 'setHoveredNavigationNodeKey'
  | 'focusedClusterMemberAreaKeys'
  | 'setFocusedClusterMemberAreaKeys'
>;
type OverviewNavigationSlice = Pick<
  ReturnType<typeof useDiscoverOverviewNavigationController>,
  'activeAreasNavigationJourney'
>;
type AreaGroupsSlice = Pick<
  ReturnType<typeof useDiscoverAreaGroupsController>,
  'areaGroupsData' | 'isLoadingAreaGroups' | 'selectedGroupName'
>;
type GeographySlice = Pick<
  ReturnType<typeof useDiscoverGeographyController>,
  | 'discoverAreasForPanel'
  | 'areaMarkerCounts'
  | 'scopeNamespaces'
  | 'summaryRegions'
  | 'regionScopedGroupsData'
  | 'isLoadingRegionScopedGroups'
  | 'isRegionScopedGroupsError'
  | 'refetchRegionScopedGroups'
>;
type MapDataSlice = Pick<
  ReturnType<typeof useDiscoverMapDataController>,
  | 'discoverAreas'
  | 'areaListings'
  | 'isLoadingAreaListings'
  | 'areasLoading'
  | 'agriAreasData'
  | 'isLoadingAgriAreas'
  | 'isFetching'
  | 'isLoading'
  | 'listingDataLoading'
  | 'totalPages'
  | 'totalElements'
>;
type AgriSlice = Pick<
  ReturnType<typeof useDiscoverAgriController>,
  | 'corridorGroups'
  | 'isLoadingRegionalAreaGroups'
  | 'isRegionalAreaGroupsError'
  | 'refetchRegionalAreaGroups'
  | 'selectedRegion'
  | 'selectedMaxKm'
  | 'filteredAgriListings'
  | 'agriMapListingsData'
  | 'isLoadingAgriGroupListings'
  | 'isAgriGroupListingsError'
  | 'agriGroupLabel'
  | 'refetchAgriGroupListings'
  | 'selectedGroupListingItem'
>;
type ResultsSlice = Pick<
  ReturnType<typeof useDiscoverResultsController>,
  | 'groupResultsListings'
  | 'isLoadingGroupResults'
  | 'isGroupResultsError'
  | 'groupResultsTotalElements'
  | 'refetchGroupResults'
>;
type SchoolSlice = Pick<
  ReturnType<typeof useDiscoverSchoolController>,
  | 'journeyView'
  | 'journeyCommands'
  | 'handleAreaFirstBack'
  | 'schools'
  | 'schoolsQuery'
  | 'schoolListings'
>;
type BadgeSlice = Pick<ReturnType<typeof useDiscoverBadgeController>, 'areaResultSummaryText' | 'cityTotal'>;
type JourneyChromeSlice = Pick<ReturnType<typeof useDiscoverJourneyChromeController>, 'trendsHref'>;
type FilterChromeSlice = Pick<
  ReturnType<typeof useDiscoverFilterChromeController>,
  'activeContextChips' | 'filtersContent'
>;
type InteractionSlice = Pick<
  ReturnType<typeof useDiscoverInteractionController>,
  'interactionCommands' | 'setAreaSearchQuery' | 'highlightedAreaKeys'
>;
type RegionGuideSlice = Pick<
  ReturnType<typeof useDiscoverRegionGuideController>,
  'armRegionSelect' | 'regionGuideRingActive' | 'regionSelectNonce' | 'prefersReducedMotion'
>;
type MapLayerSlice = Pick<
  ReturnType<typeof useDiscoverMapLayerController>,
  'regionOverviewMarkerKind' | 'cityHasNoListings'
>;
type BoundedBrowseSlice = Pick<
  ReturnType<typeof useDiscoverBoundedBrowseController>,
  'searchQuery' | 'handleSearchChange'
>;
type BoundedSearchSlice = Pick<ReturnType<typeof useBoundedSearchTrigger>, 'handleBoundedSearch'>;
type MarkerSlice = Pick<
  ReturnType<typeof useDiscoverMarkerController>,
  'selectedMarkerListing' | 'clearSelectedMarkerListing'
>;
type MobilePresentationSlice = Pick<
  ReturnType<typeof useDiscoverMobilePresentationController>,
  'setSelectedListingPreview'
>;

export interface BuildPanelSurfaceModelParams {
  pageContext: PageContextSlice;
  pageState: PageStateSlice;
  navigation: NavigationSlice;
  overviewNavigation: OverviewNavigationSlice;
  areaGroups: AreaGroupsSlice;
  geography: GeographySlice;
  mapData: MapDataSlice;
  agri: AgriSlice;
  results: ResultsSlice;
  school: SchoolSlice;
  badge: BadgeSlice;
  journeyChrome: JourneyChromeSlice;
  filterChrome: FilterChromeSlice;
  interaction: InteractionSlice;
  regionGuide: RegionGuideSlice;
  mapLayer: MapLayerSlice;
  boundedBrowse: BoundedBrowseSlice;
  boundedSearch: BoundedSearchSlice;
  marker: MarkerSlice;
  mobilePresentation: MobilePresentationSlice;
}

/**
 * The six fields this surface RENAMES or DERIVES on the way in. Declared
 * explicitly because they are the only places where a panel-facing name is not
 * also a controller output name — everything else is carried through by the
 * slice intersection below.
 */
export interface PanelRenamedFields {
  /** ← pageState.effectiveSelectedArea (the legacy/canonical AREA bridge). */
  selectedArea: AreaPoint | null;
  /** ← overviewNavigation.activeAreasNavigationJourney (carries the #2124 selectNode interception). */
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  /** ← geography.regionScopedGroupsData?.groups. */
  regionScopedGroups: RegionScopedAreaGroup[] | undefined;
  onNavigationNodeHoverChange: (nodeKey: string | null) => void;
  onClusterFocusChange: (memberAreaKeys: readonly string[] | null) => void;
  onSelectedListingPreviewChange: (preview: SelectedListingPreview | null) => void;
  /** Panel-facing alias for the chip row / filters panel ReactNodes. */
  activeContextChips: ReactNode;
  filtersContent: ReactNode;
}

/**
 * Every field the panel surface can expose, derived from the controllers that
 * own them. This is what replaced the hand-written
 * `DiscoverRightPanelContainerProps` — the view/commands groups below `Pick`
 * off it exactly as they used to, so their definitions are unchanged in shape
 * while their SOURCE is now the real producers.
 */
type PanelFields = PageContextSlice &
  PageStateSlice &
  NavigationSlice &
  AreaGroupsSlice &
  GeographySlice &
  MapDataSlice &
  AgriSlice &
  ResultsSlice &
  SchoolSlice &
  BadgeSlice &
  JourneyChromeSlice &
  InteractionSlice &
  RegionGuideSlice &
  MapLayerSlice &
  BoundedBrowseSlice &
  BoundedSearchSlice &
  MarkerSlice &
  PanelRenamedFields;

/**
 * Typed view/commands contract for DiscoverPanelSurface. Every group below is
 * a `Pick` off `PanelFields` (the controller-derived field set above), keyed
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
  PanelFields,
  'city' | 'cityTotal' | 'cityHasNoListings' | 'trendsHref'
>;
type PanelRoutingCommands = Pick<PanelFields, 'handleCityChange' | 'navigate'>;

type PanelGeographyView = Pick<
  PanelFields,
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
  PanelFields,
  | 'handleAreaSelect'
  | 'handleAreaFirstBack'
  | 'setAreaSearchQuery'
  | 'refetchRegionScopedGroups'
  | 'armRegionSelect'
  | 'refetchRegionalAreaGroups'
>;

type PanelResultsView = Pick<
  PanelFields,
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
  PanelFields,
  'refetchGroupResults' | 'setPage' | 'handleBoundedSearch'
>;

type PanelAgriView = Pick<
  PanelFields,
  | 'agriAreasData'
  | 'isLoadingAgriAreas'
  | 'filteredAgriListings'
  | 'agriMapListingsData'
  | 'isLoadingAgriGroupListings'
  | 'isAgriGroupListingsError'
  | 'agriGroupLabel'
>;
type PanelAgriCommands = Pick<PanelFields, 'refetchAgriGroupListings'>;

type PanelSchoolsView = Pick<
  PanelFields,
  'selectedSchool' | 'schools' | 'schoolsQuery' | 'schoolListings'
>;

type PanelFiltersView = Pick<PanelFields, 'filters' | 'filtersContent' | 'searchQuery'>;
type PanelFiltersCommands = Pick<
  PanelFields,
  'handleFiltersChange' | 'handleSearchChange'
>;

type PanelNavigationView = Pick<
  PanelFields,
  | 'areasNavigationJourney'
  | 'hoveredNavigationNodeKey'
  | 'focusedClusterMemberAreaKeys'
  | 'journeyView'
  | 'resolvedPanelContent'
>;
type PanelNavigationCommands = Pick<
  PanelFields,
  'onNavigationNodeHoverChange' | 'onClusterFocusChange' | 'journeyCommands' | 'onSelectedListingPreviewChange'
>;

type PanelInteractionView = Pick<
  PanelFields,
  'selectedMarkerListing' | 'activeContextChips' | 'prefersReducedMotion' | 'isAuthenticated'
>;
type PanelInteractionCommands = Pick<
  PanelFields,
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



export function buildPanelSurfaceModel(params: BuildPanelSurfaceModelParams): DiscoverPanelSurfaceView {
  const {
    pageContext: { isAuthenticated },
    pageState: { city, filters, selectedSchool, page, resolvedPanelContent, effectiveSelectedArea },
    navigation: { hoveredNavigationNodeKey, focusedClusterMemberAreaKeys },
    overviewNavigation: { activeAreasNavigationJourney },
    areaGroups: { areaGroupsData, isLoadingAreaGroups, selectedGroupName },
    geography: {
      discoverAreasForPanel,
      areaMarkerCounts,
      scopeNamespaces,
      summaryRegions,
      regionScopedGroupsData,
      isLoadingRegionScopedGroups,
      isRegionScopedGroupsError,
    },
    mapData: {
      discoverAreas,
      areaListings,
      isLoadingAreaListings,
      areasLoading,
      agriAreasData,
      isLoadingAgriAreas,
      isFetching,
      isLoading,
      listingDataLoading,
      totalPages,
      totalElements,
    },
    agri: {
      corridorGroups,
      isLoadingRegionalAreaGroups,
      isRegionalAreaGroupsError,
      selectedRegion,
      selectedMaxKm,
      filteredAgriListings,
      agriMapListingsData,
      isLoadingAgriGroupListings,
      isAgriGroupListingsError,
      agriGroupLabel,
      selectedGroupListingItem,
    },
    results: {
      groupResultsListings,
      isLoadingGroupResults,
      isGroupResultsError,
      groupResultsTotalElements,
    },
    school: { journeyView, schools, schoolsQuery, schoolListings },
    badge: { areaResultSummaryText, cityTotal },
    journeyChrome: { trendsHref },
    filterChrome: { activeContextChips, filtersContent },
    interaction: { highlightedAreaKeys },
    regionGuide: { regionGuideRingActive, regionSelectNonce, prefersReducedMotion },
    mapLayer: { regionOverviewMarkerKind, cityHasNoListings },
    boundedBrowse: { searchQuery },
    marker: { selectedMarkerListing },
  } = params;

  // The three renames/derivations this surface owns (see PanelRenamedFields).
  const selectedArea = effectiveSelectedArea;
  const areasNavigationJourney = activeAreasNavigationJourney;
  const regionScopedGroups = regionScopedGroupsData?.groups;


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


export function buildPanelSurfaceCommands(
  params: BuildPanelSurfaceModelParams,
): DiscoverPanelSurfaceCommands {
  const {
    pageContext: { navigate },
    pageState: { handleCityChange, handleAreaSelect, handleFiltersChange, setPage },
    navigation: { setHoveredNavigationNodeKey, setFocusedClusterMemberAreaKeys },
    geography: { refetchRegionScopedGroups },
    agri: { refetchRegionalAreaGroups, refetchAgriGroupListings },
    results: { refetchGroupResults },
    school: { handleAreaFirstBack, journeyCommands },
    interaction: { interactionCommands, setAreaSearchQuery },
    regionGuide: { armRegionSelect },
    boundedBrowse: { handleSearchChange },
    boundedSearch: { handleBoundedSearch },
    marker: { clearSelectedMarkerListing },
    mobilePresentation: { setSelectedListingPreview },
  } = params;

  // Panel-facing callback names for the three lifted-state setters.
  const onNavigationNodeHoverChange = setHoveredNavigationNodeKey;
  const onClusterFocusChange = setFocusedClusterMemberAreaKeys;
  const onSelectedListingPreviewChange = setSelectedListingPreview;


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
