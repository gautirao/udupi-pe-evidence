/**
 * Issue #1956 PR 2 (Slice 3) — useAreasNavigationJourney.
 *
 * Covers, by AC:
 *   AC3.4  node/nodeCount are the SAME object the panel and (via
 *          useDiscoverCameraOrchestration) the map consume
 *   AC3.5  Direction children capped at 5, Local Destination children at 6
 *   AC3.6  child labels come straight from displayLabel — never concatenated
 *   AC3.9  selectNode is the injected onSelectNode reference, unchanged
 *   AC3.10 the hook itself never calls a camera function (that is
 *          useDiscoverCameraOrchestration's job — see the staticSweep exemption)
 *   T2 (qa-fast MV-2 resolved-absent) — this hook exposes node.bounds so the
 *      camera hook can key its OWN fit-once guard on the TRANSITION.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

import { useAreasNavigationJourney } from '../useAreasNavigationJourney';
import { ApiError } from '@/lib/api';
import type { NavigationChildSummary, NavigationResolveResponseWire } from '../types';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Fix-verify cycle 3 — the hook now owns the HierarchyBackButton
// history-adjacency log internally (`useHierarchyBackAdjacencyLog`, which
// calls `useLocation`), so every render needs Router context, not just a
// QueryClientProvider.
function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, null, children));
}

function makeChild(nodeKey: string, nodeType: NavigationChildSummary['nodeType'], displayOrder: number): NavigationChildSummary {
  return { nodeKey, nodeType, displayLabel: `Label for ${nodeKey}`, displayOrder };
}

function makeResolveResponse(
  overrides: Partial<NavigationResolveResponseWire> = {},
): NavigationResolveResponseWire {
  return {
    requested: 'root',
    resolution: 'EXACT',
    revisionId: 1,
    node: {
      nodeKey: 'root',
      nodeType: 'ROOT',
      displayLabel: 'Bangalore',
      depth: -1,
      ancestry: [],
      nextLevelType: 'DIRECTION',
      children: [
        makeChild('d:n', 'DIRECTION', 1),
        makeChild('d:e', 'DIRECTION', 2),
        makeChild('d:s', 'DIRECTION', 3),
        makeChild('d:w', 'DIRECTION', 4),
        makeChild('d:central', 'DIRECTION', 5),
        makeChild('d:extra', 'DIRECTION', 6),
      ],
      revisionId: 1,
    },
    ...overrides,
  };
}

function makeCountsResponse() {
  return {
    nodeKey: 'root',
    count: 500,
    schoolCount: 40,
    areaCounts: {},
    areaSchoolCounts: {},
    children: [
      { nodeKey: 'd:n', count: 10, schoolCount: 1, matchingAreaCount: 3 },
      { nodeKey: 'd:e', count: 20, schoolCount: 2, matchingAreaCount: 4 },
    ],
    revisionId: 1,
  };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('useAreasNavigationJourney', () => {
  it('resolves the requested node and exposes it (and nodeCount) by reference', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse();
      if (path.includes('/counts')) return makeCountsResponse();
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.node).not.toBeNull());
    expect(result.current.node?.nodeKey).toBe('root');
    expect(result.current.levelKind).toBe('directions');
    await waitFor(() => expect(result.current.nodeCount?.listingCount).toBe(500));
    // node is ROOT here. `makeCountsResponse()`'s whole-city `areaCounts` map
    // is empty in this fixture, so the ROOT-branch computation (#2084
    // clarification rev 2) has zero member areas to consider and correctly
    // reports 0, not null — see the dedicated ROOT tests below for the
    // populated-map case (matchingAreaCount resolves to a real, non-zero
    // number, and changes when the counts response is filter-narrowed).
    expect(result.current.nodeCount).toEqual({ listingCount: 500, schoolCount: 40, matchingAreaCount: 0 });
  });

  it('frontend_consumption_2026_07_29 (regression) — a CHILD\'s matchingAreaCount is the server-computed AREA count, not its listing total', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'root',
            nodeType: 'ROOT',
            displayLabel: 'Bangalore',
            depth: -1,
            ancestry: [],
            nextLevelType: 'DIRECTION',
            children: [makeChild('d:n', 'DIRECTION', 1)],
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) {
        return {
          nodeKey: 'root',
          count: 1736,
          schoolCount: 0,
          areaCounts: {},
          areaSchoolCounts: {},
          children: [
            // Deliberately a DIRECTION child whose listing total (1,736) and
            // matching-area count (12) DIFFER — an implementation that
            // (re)introduces the old listing-count/entailed-zero-or-null
            // derivation would render 1736 (or null) here instead of 12.
            { nodeKey: 'd:n', count: 1736, schoolCount: 0, matchingAreaCount: 12 },
          ],
          revisionId: 1,
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.children).toHaveLength(1));
    expect(result.current.children[0].listingCount).toBe(1736);
    expect(result.current.children[0].matchingAreaCount).toBe(12);
  });

  it('frontend_consumption_2026_07_29 (regression) — a CHILD\'s matchingAreaCount of exactly 0 is a real value, not treated as absent', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'root',
            nodeType: 'ROOT',
            displayLabel: 'Bangalore',
            depth: -1,
            ancestry: [],
            nextLevelType: 'DIRECTION',
            children: [makeChild('d:n', 'DIRECTION', 1)],
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) {
        return {
          nodeKey: 'root',
          count: 500,
          schoolCount: 0,
          areaCounts: {},
          areaSchoolCounts: {},
          // Positive listing total, but the server reports zero MATCHING
          // areas under current filters — must surface as 0, not null.
          children: [{ nodeKey: 'd:n', count: 500, schoolCount: 0, matchingAreaCount: 0 }],
          revisionId: 1,
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.children).toHaveLength(1));
    expect(result.current.children[0].matchingAreaCount).toBe(0);
  });

  it('count_display_defect_2026_07_29 (regression) — a DIRECTION node\'s own matchingAreaCount is the number of its member areas with a matching listing, NOT its listing total', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'd:n',
            nodeType: 'DIRECTION',
            displayLabel: 'North Bangalore',
            depth: 0,
            ancestry: [],
            nextLevelType: 'AREA',
            children: [],
            revisionId: 1,
            descendantAreaKeys: ['a:one', 'a:two', 'a:three'],
          },
        });
      }
      if (path.includes('/counts')) {
        return {
          nodeKey: 'd:n',
          // The Direction's own rolled-up LISTING total — 1,736, deliberately
          // far larger than its true matching-area count of 2.
          count: 1736,
          schoolCount: 0,
          areaCounts: { 'a:one': 1000, 'a:two': 736, 'a:three': 0 },
          areaSchoolCounts: {},
          children: [],
          revisionId: 1,
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: 'd:n',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.nodeCount?.listingCount).toBe(1736));
    // Only 2 of the 3 member areas ('a:one', 'a:two') have a matching listing.
    expect(result.current.nodeCount?.matchingAreaCount).toBe(2);
  });

  it('AC3.5 — caps Direction children at 5 even though the server sent 6', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse();
      if (path.includes('/counts')) return makeCountsResponse();
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.children.length).toBeGreaterThan(0));
    expect(result.current.children).toHaveLength(5);
    expect(result.current.wasTruncated).toBe(true);
    // never fabricates a name — labels are verbatim from the server
    expect(result.current.children[0].displayLabel).toBe('Label for d:n');
  });

  it('AC3.5 — caps Local Destination (CLUSTER) children at 6', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'd:n',
            nodeType: 'DIRECTION',
            displayLabel: 'North Bangalore',
            depth: 0,
            ancestry: [],
            nextLevelType: 'CLUSTER',
            children: Array.from({ length: 8 }, (_, i) => makeChild(`c:n:${i}`, 'CLUSTER', i)),
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) return { ...makeCountsResponse(), nodeKey: 'd:n', children: [] };
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: 'd:n',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.children.length).toBeGreaterThan(0));
    expect(result.current.children).toHaveLength(6);
    expect(result.current.levelKind).toBe('clusters');
  });

  it('AC3.9 — selectNode is the SAME onSelectNode reference passed in, never wrapped', () => {
    const onSelectNode = vi.fn();
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode,
          enabled: false,
        }),
      { wrapper: wrapper(client) },
    );
    expect(result.current.selectNode).toBe(onSelectNode);
  });

  it('is a pure no-op when disabled — no fetch, node stays null', () => {
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
          enabled: false,
        }),
      { wrapper: wrapper(client) },
    );
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.node).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a non-blocking resolution notice when the server resolved to an ancestor', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          requested: 'a:stale-area',
          resolution: 'ANCESTOR',
          // A non-root ancestor — the synthetic root's own nodeKey ('root')
          // is unconditionally classified as the city-root terminus by
          // nodeCursorOutcomeFromResolution regardless of `resolution`, so a
          // genuine ANCESTOR case must resolve to a real non-root node.
          node: {
            nodeKey: 'd:n',
            nodeType: 'DIRECTION',
            displayLabel: 'North Bangalore',
            depth: 0,
            ancestry: [],
            nextLevelType: 'AREA',
            children: [],
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) return { ...makeCountsResponse(), nodeKey: 'd:n' };
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: 'a:stale-area',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.resolutionNotice).not.toBeNull());
    expect(result.current.resolutionNotice).toEqual({
      blocking: false,
      rung: 'ancestor',
      requestedNodeKey: 'a:stale-area',
      resolvedNodeKey: 'd:n',
    });
  });

  it('retry_refetch_fix (regression) — refetch() re-runs the counts request too, not just resolve', async () => {
    let countsCallCount = 0;
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse();
      if (path.includes('/counts')) {
        countsCallCount += 1;
        if (countsCallCount === 1) {
          throw new ApiError('counts failed', 500, null);
        }
        return makeCountsResponse();
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    // Resolve succeeds; counts errors on its first attempt.
    await waitFor(() => expect(result.current.node).not.toBeNull());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(countsCallCount).toBe(1);

    result.current.refetch();

    // The journey recovers ONLY if a genuine second counts request fires —
    // resolve's queryKey is unchanged by a counts failure, so refetching
    // resolve alone could never clear this state.
    await waitFor(() => expect(countsCallCount).toBe(2));
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.nodeCount?.listingCount).toBe(500);
  });

  it('never constructs a node key — requests the literal ROOT_NODE_KEY when no node is requested', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse();
      if (path.includes('/counts')) return makeCountsResponse();
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const resolveCall = mockGet.mock.calls.find(([path]) => (path as string).includes('/navigation/resolve'));
    expect(resolveCall?.[0]).toContain('node=root');
  });

  // ─── Issue #2084 clarification rev 2 — ROOT-only matchingAreaCount ──────
  // Before this unlock, `nodeMatchingAreaCount` returned null unconditionally
  // for ROOT (see the first test above, pre-fix). The metrics chip that
  // consumes `nodeCount.matchingAreaCount` (JourneySwitcher) only ever mounts
  // full cards at the city ROOT, so the canonical value never reached the one
  // place it is displayed. These tests cover the fix: ROOT now resolves a
  // real count from the SAME `readDestinationCounts` +
  // `listingEligibilityAccessor` predicate DIRECTION/CLUSTER already use,
  // reusing the counts snapshot's whole-city `areaListingCounts` map as the
  // member-area set — no second source of truth, no summed reconstruction of
  // `listingCount`.
  it('ROOT (unfiltered) — matchingAreaCount resolves from the whole-city areaListingCounts map', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse();
      if (path.includes('/counts')) {
        return {
          ...makeCountsResponse(),
          // Whole-city per-area listing map: 3 areas have >=1 matching
          // listing, one has zero and must be EXCLUDED from the count.
          areaCounts: { 'a:one': 4, 'a:two': 2, 'a:three': 1, 'a:zero': 0 },
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.nodeCount).not.toBeNull());
    expect(result.current.node?.nodeType).toBe('ROOT');
    expect(result.current.nodeCount?.matchingAreaCount).toBe(3);
    // The server-computed node total is untouched by this branch — never
    // summed from the per-area map.
    expect(result.current.nodeCount?.listingCount).toBe(500);
  });

  it('ROOT (active filter) — matchingAreaCount CHANGES when the filtered counts response narrows eligible areas', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse();
      if (path.includes('/counts')) {
        return {
          ...makeCountsResponse(),
          // Same city/node, but the server has already applied a filter
          // (e.g. bedrooms=4) to this per-area map — only 1 of the previous
          // 3 eligible areas remains eligible under it.
          areaCounts: { 'a:one': 1, 'a:two': 0, 'a:three': 0, 'a:zero': 0 },
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
          filters: { bedrooms: [4] },
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.nodeCount).not.toBeNull());
    // This is exactly the case that was impossible before this unlock: with
    // no ROOT branch, `matchingAreaCount` was hard-null regardless of
    // filters. It now tracks the filtered snapshot, same as DIRECTION/CLUSTER.
    expect(result.current.nodeCount?.matchingAreaCount).toBe(1);
  });

  it('DIRECTION node matchingAreaCount is unchanged by the ROOT unlock (non-root path proof)', async () => {
    // Byte-identical-behaviour proof for the DIRECTION path: same fixture and
    // assertion as the pre-existing 'count_display_defect_2026_07_29'
    // regression test above, re-asserted after the ROOT branch was added, to
    // confirm the DIRECTION/CLUSTER computation was not perturbed.
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'd:n',
            nodeType: 'DIRECTION',
            displayLabel: 'North Bangalore',
            depth: 0,
            ancestry: [],
            nextLevelType: 'AREA',
            children: [],
            revisionId: 1,
            descendantAreaKeys: ['a:one', 'a:two', 'a:three'],
          },
        });
      }
      if (path.includes('/counts')) {
        return {
          nodeKey: 'd:n',
          count: 1736,
          schoolCount: 0,
          areaCounts: { 'a:one': 1000, 'a:two': 736, 'a:three': 0 },
          areaSchoolCounts: {},
          children: [],
          revisionId: 1,
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: 'd:n',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.nodeCount?.listingCount).toBe(1736));
    expect(result.current.nodeCount?.matchingAreaCount).toBe(2);
  });

  it('AREA-leaf node keeps returning null matchingAreaCount (unchanged)', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'a:one',
            nodeType: 'AREA',
            displayLabel: 'One',
            depth: 2,
            ancestry: [],
            nextLevelType: null,
            children: [],
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) return { ...makeCountsResponse(), nodeKey: 'a:one' };
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: 'a:one',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.nodeCount).not.toBeNull());
    expect(result.current.nodeCount?.matchingAreaCount).toBeNull();
  });
});
