import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { SchoolsNavigationJourneyPanel } from '../SchoolsNavigationJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockActions = {
  enterSchoolsJourney: vi.fn(),
  setSchoolJourney: vi.fn(),
};

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverActions: () => mockActions,
  useDiscoverNav: () => ({}),
  useDiscoverViewport: () => ({ isPanelMobile: false }),
}));

// G2-N4 (#2750 PR-3 B1) — lets one test drive the school-search RESULT list while every
// other test in this file keeps the real hook (delegation when no override is set).
const mockSchoolSearchOverride = vi.hoisted(() => ({ current: null as null | (() => unknown) }));
vi.mock('@/hooks/useSchoolSearch', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSchoolSearch')>('@/hooks/useSchoolSearch');
  return {
    ...actual,
    useSchoolSearch: (...args: Parameters<typeof actual.useSchoolSearch>) =>
      mockSchoolSearchOverride.current
        ? (mockSchoolSearchOverride.current() as ReturnType<typeof actual.useSchoolSearch>)
        : actual.useSchoolSearch(...args),
  };
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const NOOP_BUILD_HREF = () => null;

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    // Include canonical children with areaKey so areaKeyByNodeKey lookup works.
    // Tests that need children override this below.
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
    ...overrides,
  };
}

function makeJourney(overrides: Partial<UseAreasNavigationJourneyResult> = {}): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

describe('SchoolsNavigationJourneyPanel', () => {
  it('loading state', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SchoolsNavigationJourneyPanel
          journey={makeJourney({ isLoading: true })}
          onSelectAreaKey={vi.fn()}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('schools-journey-panel-loading')).toBeInTheDocument();
  });

  it('renders root state and fires actions appropriately', async () => {
    const user = userEvent.setup();
    const onSelectAreaKey = vi.fn();
    
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SchoolsNavigationJourneyPanel
            journey={makeJourney({
              node: makeNode({
                // Supply NavigationChildSummary entries with areaKey so the
                // areaKeyByNodeKey lookup works (the panel reads areaKey verbatim
                // from the server's child summary — never strips the nodeKey prefix).
                children: [
                  {
                    nodeKey: 'd:north',
                    nodeType: 'DIRECTION',
                    displayLabel: 'North Bangalore',
                    displayOrder: 1,
                    areaKey: null, // DIRECTION nodes have no areaKey
                  },
                  {
                    nodeKey: 'a:koramangala',
                    nodeType: 'AREA',
                    displayLabel: 'Koramangala',
                    displayOrder: 2,
                    areaKey: 'koramangala', // <-- server-supplied areaKey
                  },
                ],
              }),
              nodeCount: { listingCount: 100, schoolCount: 50, matchingAreaCount: 5 },
              children: [
                {
                  nodeKey: 'd:north',
                  nodeType: 'DIRECTION',
                  displayLabel: 'North Bangalore',
                  displayOrder: 1,
                  listingCount: 20,
                  schoolCount: 10,
                  isLeafArea: false,
                  matchingAreaCount: 2,
                  descendantAreaCount: 5,
                  representativeAreaKeys: [],
                  bounds: null,
                  bearingDegrees: null,
                },
                {
                  nodeKey: 'a:koramangala',
                  nodeType: 'AREA',
                  displayLabel: 'Koramangala',
                  displayOrder: 2,
                  listingCount: 80,
                  schoolCount: 40,
                  isLeafArea: true,
                  matchingAreaCount: null,
                  descendantAreaCount: null,
                  representativeAreaKeys: [],
                  bounds: null,
                  bearingDegrees: null,
                },
              ],
              levelKind: 'directions',
            })}
            onSelectAreaKey={onSelectAreaKey}
            buildNodeHref={NOOP_BUILD_HREF}
            schoolSearchQuery=""
            onSchoolSearchQueryChange={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('schools-journey-panel')).toBeInTheDocument();

    const directionCard = screen.getByTestId('navigation-child-card-d:north');
    await user.click(directionCard);
    expect(mockActions.enterSchoolsJourney).toHaveBeenCalledWith('d:north');

    const areaCard = screen.getByTestId('navigation-child-card-a:koramangala');
    await user.click(areaCard);
    expect(onSelectAreaKey).toHaveBeenCalledWith('koramangala');
  });

  it('renders school search input and wires change handler', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SchoolsNavigationJourneyPanel
            journey={makeJourney({
              node: makeNode(),
              children: [],
            })}
            onSelectAreaKey={vi.fn()}
            buildNodeHref={NOOP_BUILD_HREF}
            schoolSearchQuery="XYZ"
            onSchoolSearchQueryChange={onSearch}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText('Search school name...');
    expect(input).toHaveValue('XYZ');

    await user.type(input, 'A');
    expect(onSearch).toHaveBeenCalledWith('XYZ' + 'A');
  });

  // G2-N4 (+ G3 N4-ext areaKey) — retires discover-school-first-journey E2E-11 (result click ->
  // schoolId), discover-school-first-marker-parity PAR-1/PAR-3 (pick writes areaKey), popular-schools
  // click (successor), issue-2205 card-click arm. The call is asserted with toStrictEqual: ANY extra
  // key (a stray `groupId` is the #2205 regression) or a missing/changed key fails.
  describe('G2-N4 search-result click -> setSchoolJourney args', () => {
    const SCHOOL = {
      id: 'sch-1',
      name: 'Manipal Public School',
      board: 'CBSE',
      boardType: null,
      latitude: 13.3525,
      longitude: 74.7864,
      address: 'Manipal, Udupi',
      distanceKm: 0,
      areaKey: 'IN|KA|Udupi|Manipal',
    };

    async function clickResultCard() {
      mockActions.setSchoolJourney.mockClear();
      mockSchoolSearchOverride.current = () => ({ data: [SCHOOL], isLoading: false });
      try {
        const user = userEvent.setup();
        render(
          <MemoryRouter>
            <QueryClientProvider client={queryClient}>
              <SchoolsNavigationJourneyPanel
                journey={makeJourney({ node: makeNode(), children: [] })}
                onSelectAreaKey={vi.fn()}
                buildNodeHref={NOOP_BUILD_HREF}
                schoolSearchQuery="Manipal"
                onSchoolSearchQueryChange={vi.fn()}
              />
            </QueryClientProvider>
          </MemoryRouter>,
        );
        await user.click(screen.getByTestId('school-card'));
      } finally {
        mockSchoolSearchOverride.current = null;
      }
    }

    it('G2-N4 clicking the result card calls setSchoolJourney once with EXACTLY {schoolId, radiusKm:3, lat, lon, zoom, areaKey} and no groupId', async () => {
      await clickResultCard();
      expect(mockActions.setSchoolJourney).toHaveBeenCalledTimes(1);
      expect(mockActions.setSchoolJourney.mock.calls[0][0]).toStrictEqual({
        schoolId: 'sch-1',
        radiusKm: 3,
        lat: 13.3525,
        lon: 74.7864,
        zoom: 14,
        areaKey: 'IN|KA|Udupi|Manipal',
      });
    });

    it('G2-N4-ext the school\'s own areaKey is passed straight through (a different school area yields a different areaKey)', async () => {
      mockActions.setSchoolJourney.mockClear();
      mockSchoolSearchOverride.current = () => ({
        data: [{ ...SCHOOL, id: 'sch-2', areaKey: 'IN|KA|Udupi|Malpe' }],
        isLoading: false,
      });
      try {
        const user = userEvent.setup();
        render(
          <MemoryRouter>
            <QueryClientProvider client={queryClient}>
              <SchoolsNavigationJourneyPanel
                journey={makeJourney({ node: makeNode(), children: [] })}
                onSelectAreaKey={vi.fn()}
                buildNodeHref={NOOP_BUILD_HREF}
                schoolSearchQuery="Manipal"
                onSchoolSearchQueryChange={vi.fn()}
              />
            </QueryClientProvider>
          </MemoryRouter>,
        );
        await user.click(screen.getByTestId('school-card'));
      } finally {
        mockSchoolSearchOverride.current = null;
      }
      const arg = mockActions.setSchoolJourney.mock.calls[0][0] as { schoolId: string; areaKey: string };
      expect(arg.schoolId).toBe('sch-2');
      expect(arg.areaKey).toBe('IN|KA|Udupi|Malpe');
    });
  });

  // #2170 — the preview counts endpoint flags Schools as not-yet-simulated for
  // the current revision via `schoolsNotSimulatedForRevision: true`. Every
  // zone/area count is hardcoded to 0 in that case, so the panel must render an
  // explicit "not simulated" state instead of the ambiguous "0 schools" wall.
  describe('#2170 — schoolsNotSimulatedForRevision', () => {
    const ZONE_NODE = makeNode({
      children: [
        { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North', displayOrder: 1, areaKey: null },
      ],
    });
    const ZERO_CHILDREN = [
      {
        nodeKey: 'd:north',
        nodeType: 'DIRECTION' as const,
        displayLabel: 'North',
        displayOrder: 1,
        listingCount: 12,
        schoolCount: 0,
        isLeafArea: false,
        matchingAreaCount: 3,
        descendantAreaCount: 5,
        representativeAreaKeys: [],
        bounds: null,
        bearingDegrees: null,
      },
    ];

    it('renders the explicit unavailable state instead of the bare zero-count zone list', () => {
      render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <SchoolsNavigationJourneyPanel
              journey={makeJourney({
                node: ZONE_NODE,
                nodeCount: { listingCount: 12, schoolCount: 0, matchingAreaCount: 3 },
                children: ZERO_CHILDREN,
                levelKind: 'directions',
                schoolsNotSimulatedForRevision: true,
              })}
              onSelectAreaKey={vi.fn()}
              buildNodeHref={NOOP_BUILD_HREF}
              schoolSearchQuery=""
              onSchoolSearchQueryChange={vi.fn()}
            />
          </QueryClientProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('schools-not-simulated-for-revision-state')).toBeInTheDocument();
      expect(screen.getByText(/schools aren't simulated in this preview yet/i)).toBeInTheDocument();
      // The zero-count zone list must never render alongside/instead of this state.
      expect(screen.queryByTestId('navigation-level-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigation-child-card-d:north')).not.toBeInTheDocument();
    });

    it('production/normal journey (flag false) still renders an honest "0 schools" — completely unchanged', () => {
      render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <SchoolsNavigationJourneyPanel
              journey={makeJourney({
                node: ZONE_NODE,
                nodeCount: { listingCount: 12, schoolCount: 0, matchingAreaCount: 3 },
                children: ZERO_CHILDREN,
                levelKind: 'directions',
                schoolsNotSimulatedForRevision: false,
              })}
              onSelectAreaKey={vi.fn()}
              buildNodeHref={NOOP_BUILD_HREF}
              schoolSearchQuery=""
              onSchoolSearchQueryChange={vi.fn()}
            />
          </QueryClientProvider>
        </MemoryRouter>
      );

      // A genuine zero-schools node renders the normal zone list with an
      // honest "0", not the new unavailable state.
      expect(screen.queryByTestId('schools-not-simulated-for-revision-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
      expect(screen.getByTestId('navigation-child-card-d:north')).toBeInTheDocument();
    });

    it('a journey with the flag absent (production wire shape default) behaves identically to false', () => {
      render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <SchoolsNavigationJourneyPanel
              journey={makeJourney({
                node: ZONE_NODE,
                nodeCount: { listingCount: 12, schoolCount: 5, matchingAreaCount: 3 },
                children: ZERO_CHILDREN,
                levelKind: 'directions',
                // schoolsNotSimulatedForRevision intentionally omitted — makeJourney
                // defaults it to false, mirroring how useAreasNavigationJourney
                // normalises a missing/production response.
              })}
              onSelectAreaKey={vi.fn()}
              buildNodeHref={NOOP_BUILD_HREF}
              schoolSearchQuery=""
              onSchoolSearchQueryChange={vi.fn()}
            />
          </QueryClientProvider>
        </MemoryRouter>
      );

      expect(screen.queryByTestId('schools-not-simulated-for-revision-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
    });
  });
});
