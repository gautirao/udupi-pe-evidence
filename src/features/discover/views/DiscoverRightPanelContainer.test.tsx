/**
 * Issue #1824 Slice S11c — render tests for DiscoverRightPanelContainer (the
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

// Issue #1956 PR 6 rework ([rulings.oq_a_v2]) — the container now calls
// `useDiscoverAreaNavigationPathResolver` (a `useMutation`) unconditionally
// for the JourneySwitcher conversion seam. This suite mocks it the same way
// it mocks every other data-layer dependency (the facade above,
// `DiscoverRightPanel` itself) rather than standing up a real QueryClient —
// the conversion seam's own behaviour has dedicated coverage in
// `useDiscoverAreaNavigationPath.ts`'s consumer (real-browser E2E,
// `issue-1956-pr6-journey-switch-conversion.spec.ts`); this file only needs
// the hook to not throw for "no QueryClientProvider in this tree".
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

import {
  DiscoverRightPanelContainer,
  type DiscoverRightPanelContainerProps,
} from './DiscoverRightPanelContainer';

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

function baseProps(
  overrides: Partial<DiscoverRightPanelContainerProps> = {},
): DiscoverRightPanelContainerProps {
  return {
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
    ...overrides,
  };
}

describe('DiscoverRightPanelContainer', () => {
  it('renders the DiscoverRightPanel root with the guided-entry panelContent variant', () => {
    render(<DiscoverRightPanelContainer {...baseProps({ resolvedPanelContent: 'guided-entry' })} />);
    const mock = screen.getByTestId('discover-right-panel-mock');
    expect(mock).toBeInTheDocument();
    expect(mock).toHaveAttribute('data-panel-content', 'guided-entry');
  });

  it('renders the DiscoverRightPanel root with the area-selected panelContent variant and forwards derived props', () => {
    render(
      <DiscoverRightPanelContainer
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
      <DiscoverRightPanelContainer
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
      <DiscoverRightPanelContainer
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
      <DiscoverRightPanelContainer
        {...baseProps({ isAuthenticated: true, selectedArea: null, page: 0, totalPages: 1 })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Prev/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
  });

  it('omits the footer pager for anonymous users even with multiple pages', () => {
    render(
      <DiscoverRightPanelContainer
        {...baseProps({ isAuthenticated: false, selectedArea: null, page: 0, totalPages: 3 })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Prev/ })).not.toBeInTheDocument();
  });

  it('does not import the S8 badge-copy helper modules (fork guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const sourcePath = path.join(path.dirname(thisFile), 'DiscoverRightPanelContainer.tsx');
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
describe('DiscoverRightPanelContainer — canonical Areas journey panel (default for journey=area-first)', () => {
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
      <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
        <DiscoverRightPanelContainer
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
          <DiscoverRightPanelContainer
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

  it('AC2/AC3 — selecting a different journey tab dispatches through the SAME handleSelectJourney writer (urlActions.setJourney), no second navigation path', async () => {
    const user = userEvent.setup();
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverRightPanelContainer
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({ node: ROOT_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    const schoolTab = screen.getByTestId('journey-card-school-first');
    await user.click(schoolTab);
    // No legacy groupId/areaKey context is present, so `handleSelectJourney`
    // takes its plain-PUSH arm — the SAME writer every other journey switch
    // in this app uses, never a second/parallel navigation mechanism.
    expect(URL_ACTIONS.setJourney).toHaveBeenCalledWith('school-first');
    expect(URL_ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
  });

  it('#2124 PR review fix — switching Areas -> Schools at an AREA leaf uses the resolved node\'s SERVER-supplied areaKey, never a value parsed from node=', async () => {
    // The URL `node=` param and the resolved canonical node's `nodeKey` are
    // deliberately made to encode a DIFFERENT area than the resolved node's
    // own `areaKey` field. If `handleSelectJourney` ever regresses to
    // stripping the `a:` prefix off `urlState.node` (or off
    // `areasNavigationJourney.node.nodeKey`) instead of reading the
    // server-owned `areaKey` field, this assertion catches it — the mutation
    // would fire with the wrong (URL-derived) area identity.
    const user = userEvent.setup();
    BASE_URL_STATE.journey = 'area-first';
    BASE_URL_STATE.node = 'a:IN|KA|Bangalore|WrongUrlDerivedArea';
    render(
      <MemoryRouter>
        <DiscoverRightPanelContainer
          {...baseProps({
            resolvedPanelContent: 'area-selected',
            areasNavigationJourney: inertAreasNavigationJourney({
              node: {
                nodeKey: 'a:IN|KA|Bangalore|AlsoWrongNodeKeyDerivedArea',
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
      </MemoryRouter>,
    );
    const schoolTab = screen.getByTestId('journey-card-school-first');
    await user.click(schoolTab);
    expect(URL_ACTIONS.enterSchoolsJourneyAtArea).toHaveBeenCalledWith('IN|KA|Bangalore|Manipal');
    expect(URL_ACTIONS.enterSchoolsJourneyAtArea).not.toHaveBeenCalledWith(
      'IN|KA|Bangalore|WrongUrlDerivedArea',
    );
    expect(URL_ACTIONS.enterSchoolsJourneyAtArea).not.toHaveBeenCalledWith(
      'IN|KA|Bangalore|AlsoWrongNodeKeyDerivedArea',
    );
  });

  it('AC2/AC3 — keyboard selection (focus + Enter) dispatches the SAME writer as a click', async () => {
    const user = userEvent.setup();
    BASE_URL_STATE.journey = 'area-first';
    render(
      <MemoryRouter>
        <DiscoverRightPanelContainer
          {...baseProps({
            resolvedPanelContent: 'area-groups-landing',
            areasNavigationJourney: inertAreasNavigationJourney({ node: ROOT_NODE }),
          })}
        />
      </MemoryRouter>,
    );
    const agriTab = screen.getByTestId('journey-card-agri-first');
    agriTab.focus();
    await user.keyboard('{Enter}');
    expect(URL_ACTIONS.setJourney).toHaveBeenCalledWith('agri-first');
  });
});
