/**
 * useDiscoverBoundedBrowseController — Issue #2193 (Stage-B REWORK cycle 2, D4).
 *
 * THE GAP THIS TEST CLOSES: per useDiscoverBoundedBrowseController.ts:81-88,
 * `boundedBrowseScope` (the marker scope for the `node=` + `nodeListings=1`
 * bounded-Browse surface) is built as a LOCAL LITERAL ternary inline in this
 * controller — deliberately NOT routed through `resolveDiscoverMarkerScope`
 * (that selector owns the PLAIN `node=` scope for useDiscoverMapDataController;
 * this is a separate surface with its own gate). Because it bypasses the
 * shared selector, no selector-level test can reach it, and until this file
 * existed it was pinned by NO test at all — the exact latent-sibling gap this
 * project's review process treats as a defect in its own right.
 *
 * STRATEGY: mock the two data hooks the controller calls
 * (`useDiscoverFilteredMarkers`, `useDiscoverCityListings`) and inspect the
 * `scope` argument (the 8th positional arg) actually passed to
 * `useDiscoverFilteredMarkers` on each render — the literal we're pinning.
 * `useDiscoverSearchState` is left real (no external deps, mirrors sibling
 * suite's minimal-mocking approach for logic with no I/O).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockCityListings = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: mockCityListings,
}));

import { useDiscoverBoundedBrowseController } from './useDiscoverBoundedBrowseController';
import type { UseDiscoverBoundedBrowseControllerParams } from './useDiscoverBoundedBrowseController';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

// ─── Fixture identity (shared across #2193 rework-cycle test files) ────────

const LEAF_NODE_KEY = 'a:2193-target';
// TARGET_LISTING_ID is the shared #2193 fixture identity's listing constant;
// not referenced here — this controller/test only ever resolves a node-scope
// literal, never listing rows, so there is nothing for that id to fixture.

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAreasNavigationJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'listings',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  } as UseAreasNavigationJourneyResult;
}

const RESOLVED_NODE: NonNullable<UseAreasNavigationJourneyResult['node']> = {
  nodeKey: LEAF_NODE_KEY,
  nodeType: 'AREA',
  displayLabel: 'Target Leaf',
  depth: 2,
  regionKey: 'N',
  ancestry: [],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: 'IN|KA|Bengaluru|TargetLeaf',
};

const BASE_PARAMS: Omit<UseDiscoverBoundedBrowseControllerParams, 'areasNavigationJourney'> = {
  city: 'bangalore',
  nodeListings: true,
  urlQ: '',
  setUrlSearch: vi.fn(),
  urlDiscoverFilters: {},
  intentListingPurpose: 'sale',
  isAuthenticated: true,
};

/** The `scope` arg is the 8th positional param to useDiscoverFilteredMarkers. */
function lastScopeArg() {
  const call = mockFilteredMarkers.mock.calls.at(-1);
  return call?.[7];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFilteredMarkers.mockReturnValue({ data: undefined });
  mockCityListings.mockReturnValue({ data: undefined });
});

describe('useDiscoverBoundedBrowseController — bounded-Browse marker scope (Issue #2193 D4)', () => {
  it('a resolved bounded-browse node resolves marker scope to { kind: "node", nodeKey: <that node key> }', () => {
    renderHook(() =>
      useDiscoverBoundedBrowseController({
        ...BASE_PARAMS,
        areasNavigationJourney: makeAreasNavigationJourney({ node: RESOLVED_NODE }),
      }),
    );

    expect(lastScopeArg()).toEqual({ kind: 'node', nodeKey: LEAF_NODE_KEY });
  });

  it('an unresolved bounded-browse node resolves marker scope to { kind: "unresolved", reason: "node-resolving" }', () => {
    renderHook(() =>
      useDiscoverBoundedBrowseController({
        ...BASE_PARAMS,
        areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
      }),
    );

    expect(lastScopeArg()).toEqual({ kind: 'unresolved', reason: 'node-resolving' });
  });
});
