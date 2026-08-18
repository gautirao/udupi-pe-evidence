/**
 * Issue #1824 Slice S11c / #2142 Commit 4 — render tests for DiscoverPanelSurface
 * (renamed from DiscoverRightPanelContainer), the
 * DiscoverRightPanel call-site sub-view lifted out of MapDiscovery.tsx).
 * Covers: forwarding of representative props across panel-content variants,
 * the footer pager (page/totalPages/prev-next disabled state), and the S8
 * badge-fork import-guard (this module must never import
 * formatDiscoverBadgeCopy / deriveSchoolRadiusPillNoun /
 * hasActiveAnonPropertyFilter — those stay page-owned).
 *
 * DiscoverRightPanel itself is a large, already-tested leaf (forbidden to
 * edit for this slice) — it is mocked here so the test asserts the
 * CONTAINER's prop-forwarding/closure behaviour in isolation, mirroring the
 * S11a DiscoverMapCanvas pattern of mocking its own heaviest leaf
 * (PropertyMap).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DiscoverRightPanelProps } from '@/components/discover/DiscoverRightPanel';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { DiscoverInteractionCommands } from '@/features/discover/state/useDiscoverInteractionState';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

// Issue #2084 (AC1, 4th area-first state) — the AREA-leaf branch
// (`AreaLeafListingsSurface`, mounted by `DiscoverAreasJourneyPanel`) calls
// `useAuth`/`useDiscoverCityListings` directly. These two are mocked (the
// SAME pattern `discoverAreasJourneyPanelAreaLeaf.test.tsx` already
// establishes) ONLY so that ONE additional shell-level test below can prove
// the JourneySwitcher survives into this 4th state without standing up a
// live Supabase session or backend fetch. Every other test in this file is
// unaffected (they never resolve an AREA leaf, so this branch's hooks never
// mount).
const mockUseAuth = vi.hoisted(() => vi.fn());
mockUseAuth.mockReturnValue({ user: null, isLoading: false });
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());
mockUseDiscoverCityListings.mockReturnValue({
  data: { areas: [] },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});
vi.mock('@/hooks/useDiscoverCityListings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverCityListings')>(
    '@/hooks/useDiscoverCityListings',
  );
  return {
    ...actual,
    useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args),
  };
});

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: (props: DiscoverRightPanelProps) => (
    <div data-testid="discover-right-panel-mock" data-panel-content={props.panelContent}>
      <div data-testid="forwarded-city-label">{props.cityLabel}</div>
      <div data-testid="forwarded-search-query">{props.searchQuery}</div>
      <div data-testid="forwarded-area-result-summary">{props.areaResultSummaryText}</div>
      {props.footerContent}
    </div>
  ),
}));

// Issue #1953 (build step 2) — DiscoverRightPanelContainer now consumes the
// DiscoverProvider facade (useDiscoverNav/useDiscoverActions) directly
// instead of receiving urlState/urlActions as props, so this suite mocks the
// facade module instead of passing those two props. Built inside
// vi.hoisted() so the vi.mock() factory below (hoisted above all
// imports/consts by Vitest) can close over real values instead of hitting
// the TDZ.
const { BASE_URL_STATE, URL_ACTIONS } = vi.hoisted(() => {
  const urlState: DiscoverUrlState = {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    scope: null,
  };

  // Large page-owned interface; every method is a no-op stub — the container only
  // invokes a handful of these from its moved inline closures.
  const urlActions: DiscoverUrlActions = {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    setSearchQuery: vi.fn(),
    clearAllFiltersAndSearch: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    enterSchoolPicking: vi.fn(),
    clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(),
    enterGroupResults: vi.fn(),
    clearGroupResults: vi.fn(),
    selectRegionalGroup: vi.fn(),
    setRegion: vi.fn(),
    setScope: vi.fn(),
    setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    // Issue #1956 PR 2 — canonical Areas hierarchy write actions.
    goToNode: vi.fn(),
    goToAncestorNode: vi.fn(),
    clearNode: vi.fn(),
    enterAreasJourney: vi.fn(),
    enterSchoolsJourney: vi.fn(),
    enterSchoolsJourneyAtArea: vi.fn(),
    buildNodeHref: vi.fn(),
    enterNodeListings: vi.fn(),
    clearNodeListings: vi.fn(),
    // Issue #2203 — journey-preserving node selection.
    goToNodeAndClearSchoolSelection: vi.fn(),
    goToNodeAndClearAgriculturalLocality: vi.fn(),
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    setLocality: vi.fn(),
    clearLocality: vi.fn(),
    clearAgriFilters: vi.fn(),
    setIntent: vi.fn(),
    setSchoolJourney: vi.fn(),
  };

  return { BASE_URL_STATE: urlState, URL_ACTIONS: urlActions };
});

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => BASE_URL_STATE,
  useDiscoverActions: () => URL_ACTIONS,
  // Issue #1953 (build step 4, AC28 gap fix) — the container now also reads
  // the mobile shell slice directly from the facade; default to the desktop
  // shape (isMobileShell: false) so existing assertions in this file are
  // unaffected.
  useDiscoverShell: () => ({
    isMobileShell: false,
    mobileView: 'LIST',
    setMobileView: vi.fn(),
  }),
}));

// Issue #2142 SOLID follow-up (commit 2) — the JourneySwitcher conversion seam
// that USED to make this mock necessary moved into
// controllers/useDiscoverJourneySwitchController.ts (which owns and mocks it in
// its own suite). The mock stays because `DiscoverControlBar` — mounted by the
// canonical journey shell — calls the same `useMutation`-backed resolver, and
// this suite deliberately renders without a QueryClientProvider.
vi.mock('@/features/discover/navigation/useDiscoverAreaNavigationPath', () => ({
  useDiscoverAreaNavigationPathResolver: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Issue #2108 (shell fix) — the canonical Areas journey panel branch (the
// `discover-areas-journey-panel-shell` early return in
// DiscoverRightPanelContainer.tsx, NOT the mocked `DiscoverRightPanel` above)
// now mounts DiscoverControlBar directly (desktop-only, mirroring the legacy
// shell's own new control-bar mount), which calls the real
// `useDiscoverAreas` — mocked here the same way DiscoverControlBar.test.tsx
// mocks it, so this suite doesn't need a live QueryClient/Supabase session.
vi.mock('@/hooks/useDiscoverAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverAreas')>();
  return {
    ...actual,
    useDiscoverAreas: () => ({ data: { city: 'bangalore', areas: [] }, isLoading: false }),
  };
});

import { DiscoverPanelSurface } from '../DiscoverPanelSurface';
import {
  buildPanelSurfaceModel,
  buildPanelSurfaceCommands,
  type BuildPanelSurfaceModelParams,
  type PanelRenamedFields,
} from '../buildPanelSurfaceModel';

/**
 * Issue #2142 (correction pass) — the builder's INPUT is now the controllers'
 * own result objects, not a flat 67-field object. This file keeps a FLAT
 * fixture shape on purpose: its 23 `baseProps({ ... })` call sites read far
 * better with flat overrides, and a test fixture is exactly the right place
 * for that convenience now that production no longer depends on it.
 *
 * `toModelParams` below is the only new code — a mechanical regrouping, with
 * no defaults and no logic of its own, so the assertions still run against the
 * REAL production builders and not a parallel mapping.
 */
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

/** Every controller field the panel model consumes, flattened back out. */
type ControllerFlat = UnionToIntersection<
  BuildPanelSurfaceModelParams[keyof BuildPanelSurfaceModelParams]
>;

/**
 * The flat fixture shape: controller field names, except for the six the panel
 * surface renames. Derived from BuildPanelSurfaceModelParams so this fixture
 * still fails to compile if a controller output changes type — the type
 * coverage the deleted production interface used to give is kept HERE, where
 * it belongs, rather than lost.
 */
type PanelFlatFixture = Omit<
  ControllerFlat,
  | 'effectiveSelectedArea'
  | 'activeAreasNavigationJourney'
  | 'regionScopedGroupsData'
  | 'setHoveredNavigationNodeKey'
  | 'setFocusedClusterMemberAreaKeys'
  | 'setSelectedListingPreview'
  // Issue #2142 SOLID follow-up (commit 2) — `handleSelectJourney` is supplied
  // through the fixture's renamed `selectJourney` field (PanelRenamedFields);
  // the two journey predicates are derived in `toModelParams` from the SAME
  // mocked `useDiscoverNav()` state the production controller reads, so the
  // existing `BASE_URL_STATE.journey = ...` call sites keep working unchanged.
  | 'handleSelectJourney'
  | 'isAreaFirstJourneyActive'
  | 'isSchoolsNavNodeLevel'
  // PLAN REVIEW correction 3 — the ambient page-context values the renderers
  // now receive as props. `toModelParams` supplies them from the mocked
  // facade (BASE_URL_STATE / URL_ACTIONS), which IS what production reads, so
  // they are not fixture knobs.
  | 'nav'
  | 'actions'
  | 'isMobileShell'
  | 'mobileView'
> &
  // The six renames, taken from the model's own exported declaration so the
  // fixture cannot drift from the surface contract.
  PanelRenamedFields;

const JOURNEY_VIEW: DiscoverJourneyTransitionsView = {
  startOverTick: 0,
  composedResetMapTick: 0,
  areaRestoreTick: 0,
  cityRestoreTick: 0,
  boundedSearchTriggered: false,
  schoolFirstOnBack: undefined,
};

const JOURNEY_COMMANDS: DiscoverJourneyTransitionsCommands = {
  startOver: vi.fn(),
  selectSchoolById: vi.fn(),
  clearSchool: vi.fn(),
  clearArea: vi.fn(),
  changeRadius: vi.fn(),
  backLevel2: vi.fn(),
  backLevel1: vi.fn(),
  backLevel0: vi.fn(),
  resetBoundedSearch: vi.fn(),
  wrappedSchoolSelect: vi.fn(),
};

const INTERACTION_COMMANDS: DiscoverInteractionCommands = {
  hoverListing: vi.fn(),
  hoverArea: vi.fn(),
  setHighlightedAreas: vi.fn(),
  clearHighlightedAreas: vi.fn(),
};

// UseInfiniteQueryResult is a large vendor (react-query) type — the container only
// reads .isLoading/.isError/.refetch/.isFetching from it. A full literal would need
// dozens of unused react-query internals, so this cast mirrors the same pragmatic,
// documented exception to the "avoid `as`" rule used by DiscoverMapCanvas.test.tsx.
const SCHOOLS_QUERY = {
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: vi.fn(),
} as unknown as UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>;

// Issue #1956 PR 2 — the default "not mounted" shape of the ONE
// useAreasNavigationJourney result this container now requires. `node: null`
// with isLoading/isError both false is exactly what the hook returns when
// `enabled` is false (the gate is closed) — mirrors real behaviour rather
// than an arbitrary stub.
function inertAreasNavigationJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

function baseProps(overrides: Partial<PanelFlatFixture> = {}): PanelFlatFixture {
  // Typed defaults, so every field below is still type-checked against the
  // controllers. Object.assign (not a spread) because TS models a spread of a
  // Partial as re-optionalising those keys.
  const defaults: PanelFlatFixture = {
    resolvedPanelContent: 'guided-entry',
    selectedMarkerListing: null,
    clearSelectedMarkerListing: vi.fn(),
    city: 'bangalore',
    activeContextChips: null,
    discoverAreas: [],
    selectedArea: null,
    areaListings: [],
    isLoadingAreaListings: false,
    isAuthenticated: false,
    handleAreaSelect: vi.fn(),
    areaResultSummaryText: null,
    journeyView: JOURNEY_VIEW,
    handleAreaFirstBack: vi.fn(),
    journeyCommands: JOURNEY_COMMANDS,
    areasLoading: false,
    agriAreasData: undefined,
    isLoadingAgriAreas: false,
    areaGroupsData: undefined,
    isLoadingAreaGroups: false,
    // Issue #2213 — the #2201 groupId-resolved AreaGroup (or null when no
    // group is focused / not yet resolved).
    focusedGroup: null,
    selectGroupMemberArea: vi.fn(),
    isResolvingGroupMemberArea: false,
    regionScopedGroups: undefined,
    isLoadingRegionScopedGroups: false,
    // Issue #1910 (PR2 review fix, Findings 2 & 3)
    isRegionScopedGroupsError: false,
    refetchRegionScopedGroups: vi.fn(),
    scopeNamespaces: { regionKeys: new Set(), groupSlugs: new Set() },
    armRegionSelect: vi.fn(),
    regionGuideRingActive: false,
    regionOverviewMarkerKind: null,
    regionSelectNonce: 0,
    prefersReducedMotion: false,
    summaryRegions: [],
    selectedGroupName: null,
    corridorGroups: [],
    isLoadingRegionalAreaGroups: false,
    isRegionalAreaGroupsError: false,
    isRegionalAreaGroupsNotGeneratedForRevision: false,
    refetchRegionalAreaGroups: vi.fn(),
    selectedRegion: null,
    selectedMaxKm: null,
    filteredAgriListings: null,
    agriMapListingsData: undefined,
    isLoadingAgriGroupListings: false,
    isAgriGroupListingsError: false,
    agriGroupLabel: null,
    refetchAgriGroupListings: vi.fn(),
    discoverAreasForPanel: [],
    filtersContent: null,
    trendsHref: '/trends/bangalore',
    isFetching: false,
    isLoading: false,
    searchQuery: '',
    handleSearchChange: vi.fn(),
    filters: {},
    handleFiltersChange: vi.fn(),
    selectedSchool: null,
    schools: [],
    schoolsQuery: SCHOOLS_QUERY,
    schoolListings: [],
    listingDataLoading: false,
    handleBoundedSearch: vi.fn(),
    interactionCommands: INTERACTION_COMMANDS,
    setAreaSearchQuery: vi.fn(),
    areaMarkerCounts: { shown: 0, total: 0 },
    highlightedAreaKeys: [],
    selectedGroupListingItem: null,
    navigate: vi.fn(),
    cityTotal: 0,
    cityHasNoListings: false,
    handleCityChange: vi.fn(),
    groupResultsListings: [],
    isLoadingGroupResults: false,
    isGroupResultsError: false,
    groupResultsTotalElements: undefined,
    refetchGroupResults: vi.fn(),
    page: 0,
    totalPages: 1,
    totalElements: 0,
    setPage: vi.fn(),
    areasNavigationJourney: inertAreasNavigationJourney(),
    // Issue #2142 (correction pass) — the deleted flat interface declared these
    // two OPTIONAL; the navigation controller always produces them, so the
    // controller-derived fixture type requires them. A genuine tightening.
    hoveredNavigationNodeKey: null,
    focusedClusterMemberAreaKeys: null,
    onNavigationNodeHoverChange: vi.fn(),
    onClusterFocusChange: vi.fn(),
    onSelectedListingPreviewChange: vi.fn(),
    // Issue #2142 SOLID follow-up (commit 2) — the JourneySwitcher writer is
    // now produced by useDiscoverJourneySwitchController and injected as a
    // command. Its own branch behaviour is covered by that controller's
    // colocated suite; this file asserts the WIRING (the switcher dispatches
    // through this exact reference, with the clicked journey).
    selectJourney: vi.fn(),
  };
  return Object.assign({}, defaults, overrides);
}

/**
 * Issue #2142 Commit 4 — thin flat-props harness so this file's 22 existing
 * `<DiscoverPanelSurfaceHarness {...baseProps(overrides)} />` call sites
 * (every one of them is exactly that spread, verified by hand) keep working
 * unchanged: it pipes the SAME flat props through the REAL production
 * `buildPanelSurfaceModel`/`buildPanelSurfaceCommands` builders (no parallel
 * test-only mapping logic) before rendering the renamed `DiscoverPanelSurface`.
 */
function toModelParams(g: PanelFlatFixture): BuildPanelSurfaceModelParams {
  return {
    pageContext: {
      navigate: g.navigate,
      isAuthenticated: g.isAuthenticated,
      // Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — the
      // renderers no longer call useDiscoverNav()/useDiscoverActions()/
      // useDiscoverShell(); these arrive through the contract instead. Sourced
      // from the SAME mocked facade values this suite already installs, so
      // every existing assertion keeps exercising the identical objects.
      nav: BASE_URL_STATE,
      actions: URL_ACTIONS,
      isMobileShell: false,
      mobileView: 'LIST',
    },
    pageState: {
      city: g.city,
      filters: g.filters,
      handleFiltersChange: g.handleFiltersChange,
      handleCityChange: g.handleCityChange,
      handleAreaSelect: g.handleAreaSelect,
      selectedSchool: g.selectedSchool,
      page: g.page,
      setPage: g.setPage,
      resolvedPanelContent: g.resolvedPanelContent,
      effectiveSelectedArea: g.selectedArea,
    },
    navigation: {
      hoveredNavigationNodeKey: g.hoveredNavigationNodeKey,
      setHoveredNavigationNodeKey: g.onNavigationNodeHoverChange,
      focusedClusterMemberAreaKeys: g.focusedClusterMemberAreaKeys,
      setFocusedClusterMemberAreaKeys: g.onClusterFocusChange,
      // The SAME derivations useDiscoverNavigationController performs, off the
      // SAME mocked useDiscoverNav() value — so `BASE_URL_STATE.journey = ...`
      // still selects the branch under test, exactly as it did when the
      // surface derived these itself.
      isAreaFirstJourneyActive: BASE_URL_STATE.journey === 'area-first',
      isSchoolsNavNodeLevel:
        BASE_URL_STATE.journey === 'school-first' &&
        !BASE_URL_STATE.areaKey &&
        !BASE_URL_STATE.schoolId,
    },
    journeySwitch: {
      handleSelectJourney: g.selectJourney,
      selectGroupMemberArea: g.selectGroupMemberArea,
      isResolvingGroupMemberArea: g.isResolvingGroupMemberArea,
    },
    overviewNavigation: { activeAreasNavigationJourney: g.areasNavigationJourney },
    areaGroups: {
      areaGroupsData: g.areaGroupsData,
      isLoadingAreaGroups: g.isLoadingAreaGroups,
      selectedGroupName: g.selectedGroupName,
      focusedGroup: g.focusedGroup,
    },
    geography: {
      discoverAreasForPanel: g.discoverAreasForPanel,
      areaMarkerCounts: g.areaMarkerCounts,
      scopeNamespaces: g.scopeNamespaces,
      summaryRegions: g.summaryRegions,
      regionScopedGroupsData: g.regionScopedGroups
        ? ({ groups: g.regionScopedGroups } as ControllerFlat['regionScopedGroupsData'])
        : undefined,
      isLoadingRegionScopedGroups: g.isLoadingRegionScopedGroups,
      isRegionScopedGroupsError: g.isRegionScopedGroupsError,
      refetchRegionScopedGroups: g.refetchRegionScopedGroups,
    },
    mapData: {
      discoverAreas: g.discoverAreas,
      areaListings: g.areaListings,
      isLoadingAreaListings: g.isLoadingAreaListings,
      areasLoading: g.areasLoading,
      agriAreasData: g.agriAreasData,
      isLoadingAgriAreas: g.isLoadingAgriAreas,
      isFetching: g.isFetching,
      isLoading: g.isLoading,
      listingDataLoading: g.listingDataLoading,
      totalPages: g.totalPages,
      totalElements: g.totalElements,
    },
    agri: {
      corridorGroups: g.corridorGroups,
      isLoadingRegionalAreaGroups: g.isLoadingRegionalAreaGroups,
      isRegionalAreaGroupsError: g.isRegionalAreaGroupsError,
      isRegionalAreaGroupsNotGeneratedForRevision: g.isRegionalAreaGroupsNotGeneratedForRevision,
      refetchRegionalAreaGroups: g.refetchRegionalAreaGroups,
      selectedRegion: g.selectedRegion,
      selectedMaxKm: g.selectedMaxKm,
      filteredAgriListings: g.filteredAgriListings,
      agriMapListingsData: g.agriMapListingsData,
      isLoadingAgriGroupListings: g.isLoadingAgriGroupListings,
      isAgriGroupListingsError: g.isAgriGroupListingsError,
      agriGroupLabel: g.agriGroupLabel,
      refetchAgriGroupListings: g.refetchAgriGroupListings,
      selectedGroupListingItem: g.selectedGroupListingItem,
    },
    results: {
      groupResultsListings: g.groupResultsListings,
      isLoadingGroupResults: g.isLoadingGroupResults,
      isGroupResultsError: g.isGroupResultsError,
      groupResultsTotalElements: g.groupResultsTotalElements,
      refetchGroupResults: g.refetchGroupResults,
    },
    school: {
      journeyView: g.journeyView,
      journeyCommands: g.journeyCommands,
      handleAreaFirstBack: g.handleAreaFirstBack,
      schools: g.schools,
      schoolsQuery: g.schoolsQuery,
      schoolListings: g.schoolListings,
    },
    badge: { areaResultSummaryText: g.areaResultSummaryText, cityTotal: g.cityTotal },
    journeyChrome: { trendsHref: g.trendsHref },
    filterChrome: { activeContextChips: g.activeContextChips, filtersContent: g.filtersContent },
    interaction: {
      interactionCommands: g.interactionCommands,
      setAreaSearchQuery: g.setAreaSearchQuery,
      highlightedAreaKeys: g.highlightedAreaKeys,
    },
    regionGuide: {
      armRegionSelect: g.armRegionSelect,
      regionGuideRingActive: g.regionGuideRingActive,
      regionSelectNonce: g.regionSelectNonce,
      prefersReducedMotion: g.prefersReducedMotion,
    },
    mapLayer: {
      regionOverviewMarkerKind: g.regionOverviewMarkerKind,
      cityHasNoListings: g.cityHasNoListings,
    },
    boundedBrowse: { searchQuery: g.searchQuery, handleSearchChange: g.handleSearchChange },
    boundedSearch: { handleBoundedSearch: g.handleBoundedSearch },
    marker: {
      selectedMarkerListing: g.selectedMarkerListing,
      clearSelectedMarkerListing: g.clearSelectedMarkerListing,
    },
    mobilePresentation: { setSelectedListingPreview: g.onSelectedListingPreviewChange },
  };
}

/**
 * Thin harness so this file's 23 existing
 * `<DiscoverPanelSurfaceHarness {...baseProps(overrides)} />` call sites keep
 * working unchanged: it regroups the flat fixture and pipes it through the
 * REAL production builders (no parallel test-only view/commands mapping)
 * before rendering DiscoverPanelSurface.
 */
function DiscoverPanelSurfaceHarness(props: PanelFlatFixture) {
  const params = toModelParams(props);
  return (
    <DiscoverPanelSurface
      view={buildPanelSurfaceModel(params)}
      commands={buildPanelSurfaceCommands(params)}
    />
  );
}

describe('DiscoverPanelSurface', () => {
  it('renders the DiscoverRightPanel root with the guided-entry panelContent variant', () => {
    render(<DiscoverPanelSurfaceHarness {...baseProps({ resolvedPanelContent: 'guided-entry' })} />);
    const mock = screen.getByTestId('discover-right-panel-mock');
    expect(mock).toBeInTheDocument();
    expect(mock).toHaveAttribute('data-panel-content', 'guided-entry');
  });

  it('renders the DiscoverRightPanel root with the area-selected panelContent variant and forwards derived props', () => {
    render(
      <DiscoverPanelSurfaceHarness
        {...baseProps({
          resolvedPanelContent: 'area-selected',
          city: 'udupi',
          searchQuery: 'coastal belt',
          areaResultSummaryText: '5 of 20 match in Udupi',
        })}
      />,
    );
    const mock = screen.getByTestId('discover-right-panel-mock');
    expect(mock).toHaveAttribute('data-panel-content', 'area-selected');
    // cityLabel is the moved inline expression CITY_CONFIG[city]?.label ?? city —
    // 'udupi' resolves via CITY_CONFIG to its human-readable label 'Udupi'.
    expect(screen.getByTestId('forwarded-city-label')).toHaveTextContent('Udupi');
    expect(screen.getByTestId('forwarded-search-query')).toHaveTextContent('coastal belt');
    expect(screen.getByTestId('forwarded-area-result-summary')).toHaveTextContent(
      '5 of 20 match in Udupi',
    );
  });

  it('renders the footer pager with page/totalPages/totalElements and correct prev/next disabled state', () => {
    render(
      <DiscoverPanelSurfaceHarness
        {...baseProps({
          isAuthenticated: true,
          selectedArea: null,
          page: 1,
          totalPages: 3,
          totalElements: 57,
        })}
      />,
    );
    expect(screen.getByText('2 / 3 · 57 listings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prev/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).not.toBeDisabled();
  });

  it('disables Prev on the first page and Next on the last page', () => {
    render(
      <DiscoverPanelSurfaceHarness
        {...baseProps({
          isAuthenticated: true,
          selectedArea: null,
          page: 0,
          totalPages: 2,
          totalElements: 10,
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).not.toBeDisabled();
  });

  it('omits the footer pager when there is only one page (footerContent is null)', () => {
    render(
      <DiscoverPanelSurfaceHarness
        {...baseProps({ isAuthenticated: true, selectedArea: null, page: 0, totalPages: 1 })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Prev/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
  });

  it('omits the footer pager for anonymous users even with multiple pages', () => {
    render(
      <DiscoverPanelSurfaceHarness
        {...baseProps({ isAuthenticated: false, selectedArea: null, page: 0, totalPages: 3 })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Prev/ })).not.toBeInTheDocument();
  });

  it('does not import the S8 badge-copy helper modules (fork guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const sourcePath = path.join(path.dirname(thisFile), '..', 'DiscoverPanelSurface.tsx');
    const source = readFileSync(sourcePath, 'utf-8');
    // Static-import check scoped to actual import statements (not doc-comment prose,
    // which legitimately names these helpers when explaining the guard). The three
    // functions live in these modules — importing any of them is the real regression.
    const importLines = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line))
      .join('\n');
    expect(importLines).not.toMatch(/features\/discover\/presentation\/discoverBadge/);
    expect(importLines).not.toMatch(/features\/discover\/presentation\/schoolFirstCounts/);
    expect(importLines).not.toMatch(/features\/discover\/presentation\/anonPropertyFilters/);
    // Belt-and-suspenders: the helper identifiers themselves must never appear as a
    // named import binding (only inside comments, which this file legitimately has).
    expect(importLines).not.toMatch(/formatDiscoverBadgeCopy|deriveSchoolRadiusPillNoun|hasActiveAnonPropertyFilter/);
  });
});

/**
 * Issue #1956 PR 6 (final cutover, RULED A1 MINIMAL) — the panel-routing seam.
 *
 * `resolvedPanelContent` is computed upstream (derivePanelContent /
 * computeDiscoverLayer) and NEVER inspects `node=` — extending that
 * discriminated union is out of this PR's allowed scope. These tests pin the
 * seam that mounts the canonical Areas journey WITHOUT touching it: a
 * SEPARATE, earlier branch pre-empts the legacy `DiscoverRightPanel` mount
 * entirely when `journey==='area-first'` — canonical is now the default, the
 * preview-capability + areasPreview dual gate no longer exists.
 */
describe('DiscoverPanelSurface — canonical Areas journey panel (default for journey=area-first)', () => {
  beforeEach(() => {
    BASE_URL_STATE.journey = null;
  });

  afterEach(() => {
    BASE_URL_STATE.journey = null;
    BASE_URL_STATE.groupId = null;
    BASE_URL_STATE.areaKey = null;
    BASE_URL_STATE.node = null;
  });

  it('mounts DiscoverAreasJourneyPanel instead of the legacy DiscoverRightPanel when journey=area-first', () => {
    BASE_URL_STATE.journey = 'area-first';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'root',
                nodeType: 'ROOT',
                displayLabel: 'Bangalore',
                depth: -1,
                regionKey: null,
                ancestry: [],
                nextLevelType: 'DIRECTION',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
            }),
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('discover-right-panel-mock')).not.toBeInTheDocument();
    // The panel itself renders an empty-children state here (no destinations
    // supplied) — asserting its presence, not its internals, is this
    // container-level test's job.
    expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
  });

  // Issue #2084 clarification rev 2 — the switcher's counts must come ONLY
  // from `areasNavigationJourney.nodeCount`; the legacy `cityTotal`/
  // `discoverAreas` fallback is gone entirely (loading AND steady state).
  // These two tests set a large, easily-recognisable legacy `cityTotal` /
  // `discoverAreas` on `baseProps` and prove neither value is ever reachable
  // through the switcher's rendered chips.
  it('nodeCount === null (still resolving) — switcher shows the loading affordance, NEVER the legacy cityTotal/discoverAreas value', () => {
    BASE_URL_STATE.journey = 'area-first';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            // Deliberately large, distinctive legacy values that would be
            // instantly recognisable if they leaked through.
            cityTotal: 999,
            discoverAreas: [
              { areaKey: 'a:one', areaLabel: 'One', geo_center_lat: 0, geo_center_lon: 0, bbox: null, listingCount: 5, schoolCount: 0 },
              { areaKey: 'a:two', areaLabel: 'Two', geo_center_lat: 0, geo_center_lon: 0, bbox: null, listingCount: 5, schoolCount: 0 },
            ],
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'root',
                nodeType: 'ROOT',
                displayLabel: 'Bangalore',
                depth: -1,
                regionKey: null,
                ancestry: [],
                nextLevelType: 'DIRECTION',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
              nodeCount: null,
            }),
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText('999 properties')).not.toBeInTheDocument();
    expect(screen.queryByText('2 areas')).not.toBeInTheDocument();
    expect(screen.queryByText('0 properties')).not.toBeInTheDocument();
    expect(screen.queryByText('0 areas')).not.toBeInTheDocument();
    expect(screen.getByText('Loading properties…')).toBeInTheDocument();
    expect(screen.getByText('Loading areas…')).toBeInTheDocument();
  });

  it('nodeCount resolved — switcher shows the canonical nodeCount values, NEVER the legacy cityTotal/discoverAreas value', () => {
    BASE_URL_STATE.journey = 'area-first';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            // Distinctive legacy values, deliberately DIFFERENT from the
            // canonical nodeCount values below, so a leak is unmistakable.
            cityTotal: 999,
            discoverAreas: [
              { areaKey: 'a:one', areaLabel: 'One', geo_center_lat: 0, geo_center_lon: 0, bbox: null, listingCount: 5, schoolCount: 0 },
              { areaKey: 'a:two', areaLabel: 'Two', geo_center_lat: 0, geo_center_lon: 0, bbox: null, listingCount: 5, schoolCount: 0 },
            ],
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'root',
                nodeType: 'ROOT',
                displayLabel: 'Bangalore',
                depth: -1,
                regionKey: null,
                ancestry: [],
                nextLevelType: 'DIRECTION',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
              nodeCount: { listingCount: 42, schoolCount: 0, matchingAreaCount: 7 },
            }),
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('42 properties')).toBeInTheDocument();
    expect(screen.getByText('7 areas')).toBeInTheDocument();
    expect(screen.queryByText('999 properties')).not.toBeInTheDocument();
    expect(screen.queryByText('2 areas')).not.toBeInTheDocument();
  });

  // Issue #1956 PR-6 code review Finding 2 — a hand-typed/bookmarked stale
  // URL (never an in-app JourneySwitcher click, which converts groupId/areaKey
  // to `node=` BEFORE writing journey=area-first via the container's own
  // conversion seam) can present journey=area-first alongside a leftover
  // legacy groupId/areaKey, e.g.
  // `?city=bangalore&journey=area-first&groupId=airport-belt&areaKey=IN%7CKA%7CBengaluru%7CYelahanka`.
  // showAreasNavigationJourney only checks nav.journey — it must mount
  // canonical at the city root and ignore the stale params, never fall back
  // to (or blend in) the legacy groupId/areaKey-driven surface.
  it('mounts canonical and ignores a stale bookmarked groupId/areaKey when journey=area-first', () => {
    BASE_URL_STATE.journey = 'area-first';
    BASE_URL_STATE.groupId = 'airport-belt';
    BASE_URL_STATE.areaKey = 'IN|KA|Bengaluru|Yelahanka';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            // What derivePanelContent actually computes for this exact stale
            // URL state (areaKey present + journey=area-first resolves to
            // 'area-selected' before groupId is ever consulted) — passed
            // through as the container would really receive it, to prove the
            // canonical-vs-legacy branch decision does not depend on this
            // value at all.
            resolvedPanelContent: 'area-selected',
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'root',
                nodeType: 'ROOT',
                displayLabel: 'Bangalore',
                depth: -1,
                regionKey: null,
                ancestry: [],
                nextLevelType: 'DIRECTION',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
            }),
          })}
        />
      </MemoryRouter>,
    );

    // Canonical mounts at the city root (ROOT node, no destinations).
    expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
    // The legacy surface — which is what would read/branch on groupId/areaKey
    // — never mounts alongside or instead of canonical.
    expect(screen.queryByTestId('discover-right-panel-mock')).not.toBeInTheDocument();
  });

  it('AC3.9 (pass 4) — forwards hoveredNavigationNodeKey/onNavigationNodeHoverChange down to the real NavigationChildCard, by stable node_key', async () => {
    const user = userEvent.setup();
    BASE_URL_STATE.journey = 'area-first';
    const onNavigationNodeHoverChange = vi.fn();

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            onNavigationNodeHoverChange,
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'root',
                nodeType: 'ROOT',
                displayLabel: 'Bangalore',
                depth: -1,
                regionKey: null,
                ancestry: [],
                nextLevelType: 'DIRECTION',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
              children: [
                {
                  nodeKey: 'd:n',
                  nodeType: 'DIRECTION',
                  displayLabel: 'North Bangalore',
                  displayOrder: 1,
                  listingCount: 5,
                  schoolCount: null,
                  isLeafArea: false,
                  matchingAreaCount: null, descendantAreaCount: null, representativeAreaKeys: [], bounds: null, bearingDegrees: null,
                },
              ],
            }),
          })}
        />
      </MemoryRouter>,
    );

    const card = screen.getByTestId('navigation-child-card-d:n');
    await user.hover(card);
    // The SAME callback MapDiscovery threads through — proves the panel side
    // reports the hovered node_key up to the one shared owner, never a
    // locally-invented handler.
    expect(onNavigationNodeHoverChange).toHaveBeenCalledWith('d:n');
  });

  it('keeps rendering the legacy panel when journey is NOT area-first', () => {
    BASE_URL_STATE.journey = 'agri-first';

    render(
      <DiscoverPanelSurfaceHarness
        {...baseProps({ resolvedPanelContent: 'agri-browse' })}
      />,
    );

    expect(screen.getByTestId('discover-right-panel-mock')).toBeInTheDocument();
  });

  // Issue #1956 PR 2 (Slice 5) — the container must thread its OWN
  // `urlActions.buildNodeHref` (never a re-derived href builder) down to the
  // panel's hierarchy Back control.
  it('threads urlActions.buildNodeHref to the panel so HierarchyBackButton can resolve a real href', () => {
    BASE_URL_STATE.journey = 'area-first';
    URL_ACTIONS.buildNodeHref = vi.fn((k: string) => `?node=${k}`);

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'd:n',
                nodeType: 'DIRECTION',
                displayLabel: 'North Bangalore',
                depth: 0,
                regionKey: 'north',
                ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
                nextLevelType: 'AREA',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
            }),
          })}
        />
      </MemoryRouter>,
    );

    const back = screen.getByTestId('areas-hierarchy-back');
    expect(back).toHaveAttribute('href', '/?node=root');
    expect(URL_ACTIONS.buildNodeHref).toHaveBeenCalledWith('root');
  });

  // ── Issue #2084 — panel shell + persistent JourneySwitcher restore ──────
  const ROOT_NODE = {
    nodeKey: 'root',
    nodeType: 'ROOT' as const,
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION' as const,
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };

  const DIRECTION_NODE = {
    nodeKey: 'd:n',
    nodeType: 'DIRECTION' as const,
    displayLabel: 'North Bangalore',
    depth: 0,
    regionKey: 'north',
    ancestry: [{ nodeKey: 'root', nodeType: 'ROOT' as const, displayLabel: 'Bangalore', displayOrder: 0 }],
    nextLevelType: 'AREA' as const,
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };

  it('AC4/AC5 — the shell root carries lg:order-2 and lg:w-1/2, and carries NO bare order-* token', () => {
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({ node: ROOT_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    const shell = screen.getByTestId('discover-areas-journey-panel-shell');
    const classes = shell.className.split(/\s+/);
    expect(classes).toContain('lg:order-2');
    expect(classes).toContain('lg:w-1/2');
    // R1 (handoff stop_condition, HIGHEST SEVERITY) — an unprefixed `order-*`
    // would apply at mobile widths and invert this journey's current (and
    // must-remain) list-before-map mobile ordering into map-before-list.
    // This is a load-bearing NEGATIVE assertion: it must fail if a future
    // edit copies the legacy `order-2 lg:order-2` className verbatim.
    expect(classes.some((c) => /^order-\d/.test(c))).toBe(false);
    // Code-review fix cycle 1 (blocking finding) — a bare `h-full` gives the
    // shell a mobile flex-basis equal to the full mobile shell height,
    // compressing the `h-64` map under flex-shrink by ~30-40%. Only
    // `lg:h-full` is allowed. `classes.includes('h-full')` (exact-token
    // match, not a substring/regex test) is what makes this assertion
    // capable of failing: it does not match `lg:h-full`, so it genuinely
    // fails if a future edit reintroduces the bare token (verified by a
    // temporary local repro before this fix: asserting `false` against a
    // shell carrying literal `h-full` fails as expected, and reverts to
    // passing once the class reads `lg:h-full`).
    expect(classes.includes('h-full')).toBe(false);
    expect(classes).toContain('lg:h-full');
  });

  it('AC1 — the JourneySwitcher section is present at the area-first city-root state', () => {
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({ node: ROOT_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    // CQ2 — FULL cards at the city root.
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
  });

  it('AC1 — the JourneySwitcher section is present at a Direction (non-root) state', () => {
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({ node: DIRECTION_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
  });

  it('AC1 — the JourneySwitcher section is present at a cluster-focus (Local-Destination) state', () => {
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            focusedClusterMemberAreaKeys: ['alpha'],
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                ...DIRECTION_NODE,
                children: [
                  { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, areaKey: 'alpha', centreLat: 12.9, centreLon: 77.6 },
                ],
              },
              children: [
                { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, listingCount: 5, schoolCount: null, isLeafArea: true, matchingAreaCount: null, descendantAreaCount: 1, representativeAreaKeys: ['alpha'], bounds: null, bearingDegrees: null },
              ],
            }),
          })}
        />
      </MemoryRouter>,
    );
    // Proves the cluster-focus branch actually mounted (distinct testid from
    // navigation-level-panel), not the fallback level panel.
    expect(screen.getByTestId('areas-cluster-focus-panel')).toBeInTheDocument();
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
  });

  // Issue #2084 (approved clarification-contract ruling) — the test directly
  // above is named "cluster-focus (Local-Destination)" but actually exercises
  // the UNRELATED "focused visual-AREA cluster" map-bubble-click branch
  // (`areas-cluster-focus-panel`), never a plain CLUSTER ("Local Destination")
  // nodeType rendered as a normal, selectable child the way a DIRECTION child
  // is at :743. This test closes that gap: it proves the shell + switcher are
  // state-invariant (AC1) at a genuine Local-Destination level — a DIRECTION
  // node whose children are CLUSTER nodes, no map-click focus active — and
  // re-asserts the AC4/AC5 shell class contract (:690) holds there too, since
  // `DiscoverAreasJourneyPanel`'s own component suite cannot observe the
  // shell/switcher (they are owned by this container, not that component).
  it('AC1/AC4/AC5 — the shell + switcher mount, with the full class contract, at a genuine Local-Destination (CLUSTER-as-child) state, never the map-click cluster-focus branch', () => {
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({
              node: { ...DIRECTION_NODE, nextLevelType: 'CLUSTER' as const },
              levelKind: 'clusters',
              children: [
                {
                  nodeKey: 'c:n:local-destination',
                  nodeType: 'CLUSTER',
                  displayLabel: 'North Local Destination',
                  displayOrder: 1,
                  listingCount: 8,
                  schoolCount: 1,
                  isLeafArea: false,
                  matchingAreaCount: 2,
                  descendantAreaCount: 2,
                  representativeAreaKeys: ['alpha', 'beta'],
                  bounds: null,
                  bearingDegrees: null,
                },
              ],
            }),
          })}
        />
      </MemoryRouter>,
    );
    // Same structural surface a DIRECTION child renders through — never the
    // map-click focus panel (no focusedClusterMemberAreaKeys supplied here).
    expect(screen.queryByTestId('areas-cluster-focus-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-child-card-c:n:local-destination')).toBeInTheDocument();
    // AC1 — the persistent switcher mounts at this state too.
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    // AC4/AC5 — the shell class contract (:690) holds state-invariantly.
    const shell = screen.getByTestId('discover-areas-journey-panel-shell');
    const classes = shell.className.split(/\s+/);
    expect(classes).toContain('lg:order-2');
    expect(classes).toContain('lg:h-full');
    expect(classes).toContain('min-h-0');
    expect(classes.some((c) => /^order-\d/.test(c))).toBe(false);
    expect(classes.includes('h-full')).toBe(false);
  });

  it('AC1 — the JourneySwitcher section is present at the AREA-leaf listings state (4th of 4)', () => {
    BASE_URL_STATE.journey = 'area-first';
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DiscoverPanelSurfaceHarness
            {...baseProps({
              resolvedPanelContent: 'area-selected',
              areasNavigationJourney: inertAreasNavigationJourney({
                node: {
                  nodeKey: 'a:IN|KA|Bangalore|Manipal',
                  nodeType: 'AREA',
                  displayLabel: 'Manipal',
                  depth: 2,
                  regionKey: 'east',
                  ancestry: [],
                  nextLevelType: 'LISTINGS',
                  children: [],
                  revisionId: 1,
                  bounds: {
                    centreLat: 13.35,
                    centreLon: 74.79,
                    minLat: 13.3,
                    minLon: 74.75,
                    maxLat: 13.4,
                    maxLon: 74.83,
                  },
                  descendantAreaKeys: null,
                  areaKey: 'IN|KA|Bangalore|Manipal',
                },
              }),
            })}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Proves the AREA-leaf surface actually mounted (its own distinct
    // testid), not a fallback level panel.
    expect(screen.getByTestId('areas-journey-panel-listings')).toBeInTheDocument();
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
  });

  // Issue #2142 SOLID follow-up (commit 2) — `handleSelectJourney` moved into
  // controllers/useDiscoverJourneySwitchController.ts. Its BRANCH behaviour
  // (the plain setJourney PUSH, the #2124 server-areaKey school shortcut, the
  // legacy-context conversion + its 404 toast, the groupId-only mount) is
  // covered, assertion-for-assertion, by that controller's colocated suite.
  // What remains this surface's job — and is what these two tests now assert —
  // is that the switcher is wired to that ONE injected writer, for both input
  // modalities, with the clicked journey and no second navigation path.
  it('AC2/AC3 — selecting a different journey tab dispatches through the SAME injected selectJourney command, no second navigation path', async () => {
    const user = userEvent.setup();
    BASE_URL_STATE.journey = 'area-first';
    const selectJourney = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            selectJourney,
            areasNavigationJourney: inertAreasNavigationJourney({ node: ROOT_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    const schoolTab = screen.getByTestId('journey-card-school-first');
    await user.click(schoolTab);
    expect(selectJourney).toHaveBeenCalledWith('school-first');
    // The surface itself never writes the URL — every journey switch funnels
    // through the injected command, never a parallel mechanism. (Asserted with
    // `toHaveBeenCalledWith` rather than `toHaveBeenCalled` because these
    // facade spies are module-level and this suite does not reset them.)
    expect(URL_ACTIONS.setJourney).not.toHaveBeenCalledWith('school-first');
    expect(URL_ACTIONS.enterAreasJourney).not.toHaveBeenCalledWith(expect.anything());
    expect(URL_ACTIONS.enterSchoolsJourneyAtArea).not.toHaveBeenCalledWith(expect.anything());
  });

  it('AC2/AC3 — keyboard selection (focus + Enter) dispatches the SAME command as a click', async () => {
    const user = userEvent.setup();
    BASE_URL_STATE.journey = 'area-first';
    const selectJourney = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            selectJourney,
            areasNavigationJourney: inertAreasNavigationJourney({ node: ROOT_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    const agriTab = screen.getByTestId('journey-card-agri-first');
    agriTab.focus();
    await user.keyboard('{Enter}');
    expect(selectJourney).toHaveBeenCalledWith('agri-first');
  });
});

/**
 * Issue #2213 — restores map/panel scope coherence for the journeyless/
 * #2088-virtual-default `?groupId=<group>` state. Before this fix,
 * `isAreaFirstJourneyActive` (true here too — see the module doc on
 * `DiscoverPanelSurface.tsx`) always won first and mounted the group-BLIND
 * canonical hierarchy panel, even though `resolvedPanelContent ===
 * 'area-groups-landing'` and a real `focusedGroup` had resolved. These tests
 * pin the corrected precedence directly against the real production
 * `resolveIsSelectedGroupState` predicate the branch now runs.
 */
describe('DiscoverPanelSurface — group-focus panel (Issue #2213)', () => {
  const FOCUSED_GROUP = {
    id: 'south-premium',
    name: 'South Premium',
    subtitle: null,
    region_label: null,
    school_count: 0,
    area_keys: ['IN|KA|Bangalore|Koramangala', 'IN|KA|Bangalore|HSR'],
  };

  beforeEach(() => {
    BASE_URL_STATE.journey = null;
    BASE_URL_STATE.groupId = 'south-premium';
  });

  afterEach(() => {
    BASE_URL_STATE.journey = null;
    BASE_URL_STATE.groupId = null;
    BASE_URL_STATE.areaKey = null;
    BASE_URL_STATE.node = null;
  });

  it('mounts AreaGroupFocusPanel — not the group-blind canonical hierarchy panel — for the journeyless groupId cold-load state', () => {
    // #2088 virtual default: nav.journey resolves to 'area-first' in memory
    // even with no literal journey= param, so isAreaFirstJourneyActive is
    // ALSO true here — the group-focus branch must still win.
    BASE_URL_STATE.journey = 'area-first';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            selectedArea: null,
            focusedGroup: FOCUSED_GROUP,
            discoverAreasForPanel: [
              {
                areaKey: 'IN|KA|Bangalore|Koramangala',
                name: 'Koramangala',
                geoCenterLat: 12.93,
                geoCenterLon: 77.61,
                listingCount: 12,
                schoolCount: 2,
              },
            ],
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('area-group-focus-panel')).toBeInTheDocument();
    expect(screen.getByTestId('area-group-focus-heading')).toHaveTextContent('South Premium');
    expect(screen.queryByTestId('navigation-level-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-right-panel-mock')).not.toBeInTheDocument();
    // Known-area member gets its real display name/count; the unmatched
    // member area (no discoverAreasForPanel entry) falls back to its raw key.
    expect(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala')).toHaveTextContent(
      'Koramangala',
    );
    expect(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|HSR')).toHaveTextContent(
      'IN|KA|Bangalore|HSR',
    );
  });

  it('falls through to the canonical hierarchy panel once an area is selected within the group (selectedArea present)', () => {
    BASE_URL_STATE.journey = 'area-first';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-selected',
            focusedGroup: FOCUSED_GROUP,
            selectedArea: { areaKey: 'IN|KA|Bangalore|Koramangala' } as never,
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'a:IN|KA|Bangalore|Koramangala',
                nodeType: 'AREA',
                displayLabel: 'Koramangala',
                depth: 2,
                regionKey: 'east',
                ancestry: [],
                nextLevelType: 'LISTINGS',
                children: [],
                revisionId: 1,
                bounds: {
                  centreLat: 12.93,
                  centreLon: 77.61,
                  minLat: 12.9,
                  minLon: 77.6,
                  maxLat: 12.96,
                  maxLon: 77.63,
                },
                descendantAreaKeys: null,
                areaKey: 'IN|KA|Bangalore|Koramangala',
              },
            }),
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('area-group-focus-panel')).not.toBeInTheDocument();
  });

  it('never mounts when no group resolves (bare groupId that matches nothing) — falls through to the group-blind hierarchy panel unchanged', () => {
    BASE_URL_STATE.journey = 'area-first';

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            focusedGroup: null,
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'root',
                nodeType: 'ROOT',
                displayLabel: 'Bangalore',
                depth: -1,
                regionKey: null,
                ancestry: [],
                nextLevelType: 'DIRECTION',
                children: [],
                revisionId: 1,
                bounds: null,
                descendantAreaKeys: null,
                areaKey: null,
              },
            }),
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('area-group-focus-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
  });

  it('"All areas" dispatches the atomic groupId-clearing city-root entry (enterAreasJourney(null)) — never a second navigation mechanism', async () => {
    BASE_URL_STATE.journey = 'area-first';
    const user = userEvent.setup();
    URL_ACTIONS.enterAreasJourney = vi.fn();

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            focusedGroup: FOCUSED_GROUP,
          })}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('area-group-focus-back'));
    expect(URL_ACTIONS.enterAreasJourney).toHaveBeenCalledWith(null);
  });

  it('selecting a member area dispatches through commands.geography.selectGroupMemberArea with the clicked areaKey', async () => {
    BASE_URL_STATE.journey = 'area-first';
    const user = userEvent.setup();
    const selectGroupMemberArea = vi.fn();

    render(
      <MemoryRouter>
        <DiscoverPanelSurfaceHarness
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            focusedGroup: FOCUSED_GROUP,
            selectGroupMemberArea,
          })}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|HSR'));
    expect(selectGroupMemberArea).toHaveBeenCalledWith('IN|KA|Bangalore|HSR');
  });
});
