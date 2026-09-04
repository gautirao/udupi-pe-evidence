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
  'navigate' | 'isAuthenticated' | 'nav' | 'actions' | 'isMobileShell' | 'mobileView' | 'isAreaSetDraftOpen'
>;
type PageStateSlice = Pick<
  ReturnType<typeof useDiscoverPageStateController>,
  | 'city'
  | 'filters'
  | 'handleFiltersChange'
  // Issue #2018 slice 3 — the frozen mock's POLYGON zero-result action
  // "Adjust boundary" (ExpPanel.jsx:294 `act.drawArea`). Already on main
  // from #2419 PR-1; it starts a NEW drawing and commits nothing, so the
  // committed scope keeps producing results until a new polygon is drawn
  // AND accepted. Threaded here so the recovery panel can consume it by
  // name rather than reimplementing a second redraw path.
  | 'handleRedrawPolygon'
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
/**
 * Issue #2142 SOLID follow-up (commit 2) — the JourneySwitcher write path.
 * Issue #2213 — also carries the group-member-area resolver's pending flag
 * (VIEW) alongside `handleSelectJourney` (its sibling COMMAND); the writer
 * itself, `selectGroupMemberArea`, is threaded via `PanelRenamedFields` below
 * exactly like `handleSelectJourney` -> `selectJourney` already is.
 */
type JourneySwitchSlice = Pick<
  ReturnType<typeof useDiscoverJourneySwitchController>,
  'handleSelectJourney' | 'selectGroupMemberArea' | 'isResolvingGroupMemberArea'
>;
type OverviewNavigationSlice = Pick<
  ReturnType<typeof useDiscoverOverviewNavigationController>,
  'activeAreasNavigationJourney'
>;
type AreaGroupsSlice = Pick<
  ReturnType<typeof useDiscoverAreaGroupsController>,
  // Issue #2213 — `focusedGroup` (the #2201 groupId-resolved AreaGroup, or
  // null) is threaded through so the panel surface can render group-scoped
  // content for the journeyless/`area-groups-landing` group-focus state,
  // instead of remaining group-blind. See DiscoverPanelSurface.tsx.
  'areaGroupsData' | 'isLoadingAreaGroups' | 'selectedGroupName' | 'focusedGroup'
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
  // Issue #2353 — threaded so AreaFirstJourneyPanel can pass the map's
  // ALREADY-FETCHED area-listings error state down to AreaLeafListingsSurface,
  // which otherwise has no way to distinguish "the map's fetch errored" from
  // "genuinely zero listings" when consuming the map's data instead of its own.
  | 'isErrorAreaListings'
  // Issue #2353 — the SAME query's refetch, so a consumer of `areaListings`
  // as its primary data source can offer a working Retry-on-error instead of
  // a dead button.
  | 'refetchAreaListings'
  // Issue #2353 (code-review fix) — the SAME query's isFetching, so a
  // consumer of `areaListings` as its primary data source can surface a
  // `keepPreviousData` refresh-in-flight state (stale cards + new fetch
  // pending) instead of presenting it as fully settled.
  | 'isFetchingAreaListings'
  | 'areasLoading'
  | 'agriAreasData'
  | 'isLoadingAgriAreas'
  | 'isFetching'
  | 'isLoading'
  | 'listingDataLoading'
  | 'totalPages'
  | 'totalElements'
  // Issue #2015 — the anon "Search this area" (VIEWPORT scope) reconciled
  // card list, threaded through so the panel surface can render the same
  // listing identities the map's anon-viewport markers already use.
  | 'isAnonViewport'
  | 'anonViewportListings'
  | 'anonViewportListingsLoading'
  // Issue #2015 (caller-wiring follow-up) — the anon-viewport query's error
  // state, threaded through so a consumer of `anonViewportListings` can
  // distinguish "the anon-viewport fetch errored" from "genuinely zero
  // listings" (mirrors #2353's `isErrorAreaListings` precedent above).
  | 'isErrorAnonViewport'
  // Issue #2015 (caller-wiring follow-up) — the SAME query's refetch, so a
  // consumer of `anonViewportListings` can offer a working Retry-on-error
  // instead of a dead button.
  | 'refetchAnonViewport'
  // Issue #2015 — the authenticated "Search this area" (VIEWPORT scope)
  // reconciled card list, mirroring the anon-viewport fields above so the
  // panel surface can swap away from the stale AREA_SET `areaListings` for
  // an authenticated caller too.
  | 'isAuthViewport'
  | 'authViewportListings'
  | 'authViewportListingsLoading'
  | 'isErrorAuthViewport'
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
  /**
   * Issue #2213 — ← journeySwitch.selectGroupMemberArea. Carried through as a
   * renamed/passthrough field (not part of any Pick-able controller slice,
   * same reason `selectJourney` is here) so `AreaGroupFocusPanel` gets it as
   * an injected command, never calling the resolver mutation itself.
   */
  selectGroupMemberArea: (areaKey: string) => void;
  /** Issue #2213 — ← journeySwitch.isResolvingGroupMemberArea. */
  isResolvingGroupMemberArea: boolean;
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
type PanelPageContextView = Pick<PanelFields, 'nav' | 'isMobileShell' | 'mobileView' | 'isAreaSetDraftOpen'>;
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
  | 'isErrorAreaListings'
  | 'isFetchingAreaListings'
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
  | 'focusedGroup'
  | 'isResolvingGroupMemberArea'
  // Issue #2015 — see MapDataSlice's own doc comment.
  | 'isAnonViewport'
  | 'anonViewportListings'
  | 'anonViewportListingsLoading'
  // Issue #2015 (caller-wiring follow-up) — see MapDataSlice's own doc comment.
  | 'isErrorAnonViewport'
  // Issue #2015 — the authenticated-VIEWPORT equivalent of the anon fields
  // above. See MapDataSlice's own doc comment.
  | 'isAuthViewport'
  | 'authViewportListings'
  | 'authViewportListingsLoading'
  | 'isErrorAuthViewport'
>;
type PanelGeographyCommands = Pick<
  PanelFields,
  | 'handleAreaSelect'
  | 'handleAreaFirstBack'
  | 'setAreaSearchQuery'
  | 'refetchRegionScopedGroups'
  | 'armRegionSelect'
  | 'selectGroupMemberArea'
  // Issue #2353 — see MapDataSlice's own doc comment.
  | 'refetchAreaListings'
  // Issue #2015 (caller-wiring follow-up) — see MapDataSlice's own doc comment.
  | 'refetchAnonViewport'
  // Issue #2018 slice 3 — "Adjust boundary" on the POLYGON zero-result state.
  // Grouped with geography because it changes the searched GEOMETRY, not a
  // filter; it starts a new drawing and commits nothing on its own.
  | 'handleRedrawPolygon'
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
    pageContext: { isAuthenticated, nav, isMobileShell, mobileView, isAreaSetDraftOpen },
    pageState: { city, filters, selectedSchool, page, resolvedPanelContent, effectiveSelectedArea },
    navigation: {
      hoveredNavigationNodeKey,
      focusedClusterMemberAreaKeys,
      isAreaFirstJourneyActive,
      isSchoolsNavNodeLevel,
    },
    overviewNavigation: { activeAreasNavigationJourney },
    journeySwitch: { isResolvingGroupMemberArea },
    areaGroups: { areaGroupsData, isLoadingAreaGroups, selectedGroupName, focusedGroup },
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
      isErrorAreaListings,
      isFetchingAreaListings,
      areasLoading,
      agriAreasData,
      isLoadingAgriAreas,
      isFetching,
      isLoading,
      listingDataLoading,
      totalPages,
      totalElements,
      isAnonViewport,
      anonViewportListings,
      anonViewportListingsLoading,
      isErrorAnonViewport,
      isAuthViewport,
      authViewportListings,
      authViewportListingsLoading,
      isErrorAuthViewport,
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
    pageContext: { nav, isMobileShell, mobileView, isAreaSetDraftOpen },
    routing: { city, cityTotal, cityHasNoListings, trendsHref },
    geography: {
      discoverAreas,
      selectedArea,
      areaListings,
      isLoadingAreaListings,
      isErrorAreaListings,
      isFetchingAreaListings,
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
      focusedGroup,
      isResolvingGroupMemberArea,
      isAnonViewport,
      anonViewportListings,
      anonViewportListingsLoading,
      isErrorAnonViewport,
      isAuthViewport,
      authViewportListings,
      authViewportListingsLoading,
      isErrorAuthViewport,
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
    pageState: { handleCityChange, handleAreaSelect, handleFiltersChange, setPage, handleRedrawPolygon },
    navigation: { setHoveredNavigationNodeKey, setFocusedClusterMemberAreaKeys },
    journeySwitch: { handleSelectJourney, selectGroupMemberArea },
    geography: { refetchRegionScopedGroups },
    mapData: { refetchAreaListings, refetchAnonViewport },
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
      selectGroupMemberArea,
      refetchAreaListings,
      refetchAnonViewport,
      handleRedrawPolygon,
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
