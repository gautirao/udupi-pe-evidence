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
    buildNodeHref: vi.fn(),
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
                  matchingAreaCount: null,
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
    BASE_URL_STATE.journey = 'school-first';

    render(
      <DiscoverRightPanelContainer
        {...baseProps({ resolvedPanelContent: 'school-browse' })}
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
});
