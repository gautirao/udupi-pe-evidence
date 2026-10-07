/**
 * Issue #2795 — NodeListingsSurface ("Browse all", non-leaf) hands its ACTIVE source's own
 * "settled" signal (and the navigation-node scope marker) to the request card via context.
 *
 * AreaSelectedPanel is stubbed with a probe that reads the two contexts, so this spec pins exactly
 * what the surface vouches for; ListingsBody's gating on that value is covered by
 * ListingsBody.requestCard.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeListingsSurface } from '../NodeListingsSurface';
import {
  useRequestCardSettled,
  useRequestCardNodeScope,
} from '@/features/discover/areas-journey/results/requestCardSettledContext';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

let mockIsAuthenticated = true;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockIsAuthenticated ? { id: 'u1' } : null, isLoading: false }),
}));

const mockUseDiscoverListings = vi.fn();
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: (...args: unknown[]) => mockUseDiscoverListings(...args),
}));
const mockUseDiscoverCityListings = vi.fn();
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args),
}));

vi.mock('@/features/discover/state/useDiscoverSearchState', () => ({
  useDiscoverSearchState: () => ({ searchQuery: '', debouncedSearch: '', handleSearchChange: vi.fn() }),
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    q: '',
    intent: 'sale' as const,
    selectedListing: null,
    filters: { propertyTypes: [], bedrooms: [], priceMin: undefined, priceMax: undefined },
  }),
  useDiscoverActions: () => ({
    setSelectedListing: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSearchQuery: vi.fn(),
    enterSchoolPicking: vi.fn(),
  }),
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
}));

// Probe in place of the heavy panel: reports what the contexts carry at the panel's position.
vi.mock('@/components/discover/panels/AreaSelectedPanel', () => ({
  AreaSelectedPanel: () => {
    const settled = useRequestCardSettled();
    const nodeScope = useRequestCardNodeScope();
    return (
      <div data-testid="probe" data-settled={String(settled)} data-node-scope={String(nodeScope)} />
    );
  },
}));

function makeNode(): NavigationNodeResponse {
  return {
    nodeKey: 'd:north',
    nodeType: 'DIRECTION' as NavigationNodeResponse['nodeType'],
    displayLabel: 'North Udupi',
    depth: 1,
    regionKey: 'r:north',
    ancestry: [],
    nextLevelType: 'AREA' as NavigationNodeResponse['nextLevelType'],
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: ['a:one', 'a:two'],
    areaKey: null,
  };
}

interface QueryState {
  isLoading?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  isPlaceholderData?: boolean;
  isFetching?: boolean;
  data?: unknown;
}
const query = (s: QueryState) => ({
  isLoading: false,
  isError: false,
  isSuccess: false,
  isPlaceholderData: false,
  data: undefined,
  refetch: vi.fn(),
  ...s,
});
const authSuccess = (extra: QueryState = {}) =>
  query({ isSuccess: true, data: { content: [], totalPages: 0, totalElements: 0 }, ...extra });
const anonSuccess = (extra: QueryState = {}) => query({ isSuccess: true, data: { areas: [] }, ...extra });

function renderSurface() {
  return render(
    <MemoryRouter>
      <NodeListingsSurface
        node={makeNode()}
        buildNodeHref={() => null}
        historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
        selectNode={vi.fn()}
        onClearNodeListings={vi.fn()}
      />
    </MemoryRouter>,
  );
}
const settledValue = () => screen.getByTestId('probe').getAttribute('data-settled');

beforeEach(() => {
  mockIsAuthenticated = true;
  mockUseDiscoverListings.mockReset();
  mockUseDiscoverCityListings.mockReset();
  mockUseDiscoverListings.mockReturnValue(authSuccess());
  mockUseDiscoverCityListings.mockReturnValue(anonSuccess());
});

describe('NodeListingsSurface — request-card settled signal (#2795)', () => {
  describe('authenticated: the discover-listings query is the source', () => {
    it('settled on a loaded successful result', () => {
      renderSurface();
      expect(settledValue()).toBe('true');
    });

    it('settled stays true across a same-key background refetch (not keyed on isFetching)', () => {
      mockUseDiscoverListings.mockReturnValue(authSuccess({ isFetching: true }));
      renderSurface();
      expect(settledValue()).toBe('true');
    });

    it('not settled during the initial load', () => {
      mockUseDiscoverListings.mockReturnValue(query({ isLoading: true }));
      renderSurface();
      expect(settledValue()).toBe('false');
    });

    it('not settled for a disabled / never-run query (no data, not loading, not success)', () => {
      mockUseDiscoverListings.mockReturnValue(query({}));
      renderSurface();
      expect(settledValue()).toBe('false');
    });

    it('not settled while serving a placeholder', () => {
      mockUseDiscoverListings.mockReturnValue(authSuccess({ isPlaceholderData: true }));
      renderSurface();
      expect(settledValue()).toBe('false');
    });

    it('error: the surface renders its own error state and no panel (so no card host)', () => {
      mockUseDiscoverListings.mockReturnValue(query({ isError: true }));
      renderSurface();
      expect(screen.getByTestId('areas-journey-panel-node-listings-error')).toBeInTheDocument();
      expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    });

    it('error with stale data is not settled either (the error state wins)', () => {
      mockUseDiscoverListings.mockReturnValue(authSuccess({ isError: true, isSuccess: false }));
      renderSurface();
      expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    });

    it('the ANON query state is irrelevant when authenticated', () => {
      mockUseDiscoverListings.mockReturnValue(query({ isLoading: true }));
      mockUseDiscoverCityListings.mockReturnValue(anonSuccess());
      renderSurface();
      expect(settledValue()).toBe('false');
    });
  });

  describe('anonymous: the public city-listings query is the source', () => {
    beforeEach(() => {
      mockIsAuthenticated = false;
    });

    it('settled on a loaded successful result', () => {
      renderSurface();
      expect(settledValue()).toBe('true');
    });

    it('not settled during the initial load', () => {
      mockUseDiscoverCityListings.mockReturnValue(query({ isLoading: true }));
      renderSurface();
      expect(settledValue()).toBe('false');
    });

    it('not settled while the keepPreviousData placeholder (previous key) is on screen', () => {
      mockUseDiscoverCityListings.mockReturnValue(anonSuccess({ isPlaceholderData: true }));
      renderSurface();
      expect(settledValue()).toBe('false');
    });

    it('not settled for a disabled / never-run query (e.g. a node with no area keys)', () => {
      mockUseDiscoverCityListings.mockReturnValue(query({}));
      renderSurface();
      expect(settledValue()).toBe('false');
    });

    it('a same-key background refetch stays settled', () => {
      mockUseDiscoverCityListings.mockReturnValue(anonSuccess({ isFetching: true }));
      renderSurface();
      expect(settledValue()).toBe('true');
    });

    it('error: error state, no panel', () => {
      mockUseDiscoverCityListings.mockReturnValue(query({ isError: true }));
      renderSurface();
      expect(screen.getByTestId('areas-journey-panel-node-listings-error')).toBeInTheDocument();
      expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    });

    it('the AUTH query state is irrelevant when anonymous', () => {
      mockUseDiscoverListings.mockReturnValue(authSuccess());
      mockUseDiscoverCityListings.mockReturnValue(query({ isLoading: true }));
      renderSurface();
      expect(settledValue()).toBe('false');
    });
  });

  it('marks the scope as a navigation node so the card never submits a node key as an area key', () => {
    renderSurface();
    expect(screen.getByTestId('probe').getAttribute('data-node-scope')).toBe('true');
  });
});
