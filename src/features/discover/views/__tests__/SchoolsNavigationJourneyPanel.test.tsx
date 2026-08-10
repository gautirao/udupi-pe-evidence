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
});
