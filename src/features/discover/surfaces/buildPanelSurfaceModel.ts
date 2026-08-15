import type { ReactNode } from 'react';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import type { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import type { useDiscoverNavigationController } from '@/features/discover/controllers/useDiscoverNavigationController';
import type { useDiscoverJourneySwitchController } from '@/features/discover/controllers/useDiscoverJourneySwitchController';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
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

/**
 * Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — `nav`,
 * `actions`, `isMobileShell` and `mobileView` are now carried through this
 * contract instead of being read out of the Discover context facade by the
 * panel renderers themselves.
 *
 * Those four values were ALWAYS available on `useDiscoverPageContext()` (this
 * page's one ambient-provider adapter); the panel simply reached for them
 * directly, as a documented #1953 deviation. That made the renderers service
 * locators: their type signature understated what they depended on, and the
 * ambient read could not be checked by the compiler. Threading them here makes
 * the dependency explicit and each renderer a pure function of its props.
 *
 * `nav`/`actions` are carried as the WHOLE context objects rather than
 * field-by-field, because the URL-state facade already IS this app's stable
 * navigation port (architect's plan §4, DIP). Each renderer then `Pick`s only
 * the fields it actually reads off them (see AreaFirstJourneyPanel /
 * SchoolFirstJourneyPanel), so ISP is enforced at the renderer boundary
 * instead of by fragmenting the port here.
 */
type PageContextSlice = Pick<
  ReturnType<typeof useDiscoverPageContext>,
  'navigate' | 'isAuthenticated' | 'nav' | 'actions' | 'isMobileShell' | 'mobileView'
>;
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
  // Issue #2142 SOLID follow-up (commit 2) — the two journey predicates the
  // panel surface used to recompute off its own `useDiscoverNav()` read.
  | 'isAreaFirstJourneyActive'
  | 'isSchoolsNavNodeLevel'
>;
/** Issue #2142 SOLID follow-up (commit 2) — the JourneySwitcher write path. */
type JourneySwitchSlice = Pick<
  ReturnType<typeof useDiscoverJourneySwitchController>,
  'handleSelectJourney'
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
  | 'isRegionalAreaGroupsNotGeneratedForRevision'
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
  journeySwitch: JourneySwitchSlice;
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
  /** ← journeySwitch.handleSelectJourney (the legacy -> canonical conversion writer). */
  selectJourney: (journey: DiscoverJourney) => void;
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
 * shows `geography`'s view fields carry 5 real callbacks
 * (handleAreaSelect/handleAreaFirstBack/setAreaSearchQuery/
 * refetchRegionScopedGroups/armRegionSelect) that
 * have nowhere sound to live in the architect's 6 commands groups without
 * either duplicating them under an unrelated group or breaking the 1:1
 * view/commands group symmetry every other surface in this PR uses. Mirroring
 * view groups 1:1 for commands is more consistent, not less, than the
 * asymmetric original spec — same "field-usage over spec-literal" judgment
 * already applied to Commits 2-3's corridorGroups/Agri and this commit's
 * DiscoverMapSurface `overlays` addition.
 *
 * Issue #2142 SOLID follow-up (commit 3) — `regionGuide` is the one view group
 * with no commands counterpart: its three fields
 * (regionGuideRingActive/regionOverviewMarkerKind/regionSelectNonce) are
 * read-only signals, and the region-PICK writer `armRegionSelect` stays in
 * `commands.geography` where its consumers already reach for it.
 */

/**
 * Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — the
 * ambient page context, made explicit. `view.pageContext` carries the READ
 * side (URL state + mobile shell), `commands.pageContext` the WRITE side (the
 * URL-action facade), keeping the 1:1 view/commands group symmetry every other
 * group in this file uses.
 */
type PanelPageContextView = Pick<PanelFields, 'nav' | 'isMobileShell' | 'mobileView'>;
type PanelPageContextCommands = Pick<PanelFields, 'actions'>;

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
  | 'summaryRegions'
  | 'selectedGroupName'
>;
type PanelGeographyCommands = Pick<
  PanelFields,
  | 'handleAreaSelect'
  | 'handleAreaFirstBack'
  | 'setAreaSearchQuery'
  | 'refetchRegionScopedGroups'
  | 'armRegionSelect'
>;

/**
 * Issue #2142 SOLID follow-up (commit 3) — the #1808 region-guidance signals,
 * previously carried by `geography` for no reason other than that the deleted
 * flat interface listed them adjacently. All three are produced by the
 * RegionGuide/MapLayer controllers and consumed only by the guided-entry
 * attention ring, so they get their own group.
 *
 * There is deliberately NO `regionGuide` COMMANDS group: all three fields are
 * read-only signals. The one region-guide writer, `armRegionSelect`, is a
 * geography-scoped region PICK (it arms the next region selection made from the
 * panel or the map) and stays in `commands.geography`, unmoved.
 */
type PanelRegionGuideView = Pick<
  PanelFields,
  'regionGuideRingActive' | 'regionOverviewMarkerKind' | 'regionSelectNonce'
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
  // Issue #2142 SOLID follow-up (commit 3) — the agri CORRIDOR fields, moved
  // here from `geography`. Every one of them is produced by
  // `useDiscoverAgriController` and consumed only by the agri corridor panels
  // (CorridorLandingPanel + the corridor/max-km selectors); grouping them under
  // `geography` described where they used to sit in the deleted flat interface,
  // not what they are.
  | 'corridorGroups'
  | 'isLoadingRegionalAreaGroups'
  | 'isRegionalAreaGroupsError'
  | 'isRegionalAreaGroupsNotGeneratedForRevision'
  | 'selectedRegion'
  | 'selectedMaxKm'
>;
type PanelAgriCommands = Pick<
  PanelFields,
  'refetchAgriGroupListings' | 'refetchRegionalAreaGroups'
>;

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
  | 'isAreaFirstJourneyActive'
  | 'isSchoolsNavNodeLevel'
>;
type PanelNavigationCommands = Pick<
  PanelFields,
  | 'onNavigationNodeHoverChange'
  | 'onClusterFocusChange'
  | 'journeyCommands'
  | 'onSelectedListingPreviewChange'
  | 'selectJourney'
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
  pageContext: PanelPageContextView;
  routing: PanelRoutingView;
  geography: PanelGeographyView;
  regionGuide: PanelRegionGuideView;
  results: PanelResultsView;
  agri: PanelAgriView;
  schools: PanelSchoolsView;
  filters: PanelFiltersView;
  navigation: PanelNavigationView;
  interaction: PanelInteractionView;
}

export interface DiscoverPanelSurfaceCommands {
  pageContext: PanelPageContextCommands;
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
    pageContext: { isAuthenticated, nav, isMobileShell, mobileView },
    pageState: { city, filters, selectedSchool, page, resolvedPanelContent, effectiveSelectedArea },
    navigation: {
      hoveredNavigationNodeKey,
      focusedClusterMemberAreaKeys,
      isAreaFirstJourneyActive,
      isSchoolsNavNodeLevel,
    },
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
      isRegionalAreaGroupsNotGeneratedForRevision,
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
    pageContext: { nav, isMobileShell, mobileView },
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
      summaryRegions,
      selectedGroupName,
    },
    regionGuide: { regionGuideRingActive, regionOverviewMarkerKind, regionSelectNonce },
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
      corridorGroups,
      isLoadingRegionalAreaGroups,
      isRegionalAreaGroupsError,
      isRegionalAreaGroupsNotGeneratedForRevision,
      selectedRegion,
      selectedMaxKm,
    },
    schools: { selectedSchool, schools, schoolsQuery, schoolListings },
    filters: { filters, filtersContent, searchQuery },
    navigation: {
      areasNavigationJourney,
      hoveredNavigationNodeKey,
      focusedClusterMemberAreaKeys,
      journeyView,
      resolvedPanelContent,
      isAreaFirstJourneyActive,
      isSchoolsNavNodeLevel,
    },
    interaction: { selectedMarkerListing, activeContextChips, prefersReducedMotion, isAuthenticated },
  };
}


export function buildPanelSurfaceCommands(
  params: BuildPanelSurfaceModelParams,
): DiscoverPanelSurfaceCommands {
  const {
    pageContext: { navigate, actions },
    pageState: { handleCityChange, handleAreaSelect, handleFiltersChange, setPage },
    navigation: { setHoveredNavigationNodeKey, setFocusedClusterMemberAreaKeys },
    journeySwitch: { handleSelectJourney },
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
  // Panel-facing name for the journey-switch controller's writer.
  const selectJourney = handleSelectJourney;


  return {
    pageContext: { actions },
    routing: { handleCityChange, navigate },
    geography: {
      handleAreaSelect,
      handleAreaFirstBack,
      setAreaSearchQuery,
      refetchRegionScopedGroups,
      armRegionSelect,
    },
    results: { refetchGroupResults, setPage, handleBoundedSearch },
    agri: { refetchAgriGroupListings, refetchRegionalAreaGroups },
    filters: { handleFiltersChange, handleSearchChange },
    navigation: {
      onNavigationNodeHoverChange,
      onClusterFocusChange,
      journeyCommands,
      onSelectedListingPreviewChange,
      selectJourney,
    },
    interaction: { clearSelectedMarkerListing, interactionCommands },
  };
}
