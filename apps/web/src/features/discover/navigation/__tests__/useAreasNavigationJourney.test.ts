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
import { renderHook, render, screen, waitFor } from '@testing-library/react';
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
import { NavigationLevelPanel } from '@/components/discover/navigation/NavigationLevelPanel';
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

  it('AC12 (Issue #2086, inverted from the pre-#2086 5-cap) — ALL 6 server-sent Direction children render, none dropped', async () => {
    const serverNode = makeResolveResponse().node;
    // Build the assertion against the fixture's OWN child count, never a
    // hardcoded literal — a fixture that manually slices its own "server"
    // array would false-pass this exact check (qa-fast R-F2).
    const serverChildren = serverNode.children;
    expect(serverChildren.length).toBe(6);

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
    // Untruncated: rendered count === the server's own child count, not a
    // hardcoded 5/6.
    expect(result.current.children).toHaveLength(serverChildren.length);
    expect(result.current.children.map((c) => c.nodeKey).sort()).toEqual(
      serverChildren.map((c) => c.nodeKey).sort(),
    );
    // The former MAX_DIRECTION_DESTINATIONS/wasTruncated surface no longer
    // exists on the result shape at all.
    expect((result.current as Record<string, unknown>).wasTruncated).toBeUndefined();
    // never fabricates a name — labels are verbatim from the server
    expect(result.current.children[0].displayLabel).toBe('Label for d:n');
  });

  it('AC12 (Issue #2086, inverted from the pre-#2086 6-cap) — ALL 8 server-sent Local Destination (CLUSTER) children render, none dropped', async () => {
    const serverChildren = Array.from({ length: 8 }, (_, i) => makeChild(`c:n:${i}`, 'CLUSTER', i));
    expect(serverChildren.length).toBe(8);

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
            children: serverChildren,
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
    // Untruncated: rendered count === the server's own child count (8), not
    // the old hardcoded cap of 6.
    expect(result.current.children).toHaveLength(serverChildren.length);
    expect(result.current.levelKind).toBe('clusters');
  });

  it('AC12 — the server-guaranteed maximum of 15 children ALL render (regression fixture at the ceiling itself)', async () => {
    const serverChildren = Array.from({ length: 15 }, (_, i) => makeChild(`d:${i}`, 'DIRECTION', i));
    expect(serverChildren.length).toBe(15);

    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) return makeResolveResponse({ node: { ...makeResolveResponse().node, children: serverChildren } });
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
    expect(result.current.children).toHaveLength(serverChildren.length);
    expect(result.current.children.map((c) => c.nodeKey).sort()).toEqual(
      serverChildren.map((c) => c.nodeKey).sort(),
    );
  });

  // #2750 PR-4 V3 (retires e2e issue-2086 AC12 "South-West 4 cards incl. the zero-listing leaf"):
  // the previously-cited rows carried no zero-listing AREA child, so a filter that dropped such
  // children left them green (MUT-451 VACUOUS). Here one AREA leaf has a real count of 0 beside
  // two non-zero siblings, and ALL THREE must be in the child list in server order.
  it('#2086 V3 — a zero-listing AREA leaf child stays in the child list beside non-zero siblings (not dropped)', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'd:sw',
            nodeType: 'DIRECTION',
            displayLabel: 'South-West Bangalore',
            depth: 0,
            ancestry: [],
            nextLevelType: 'AREA',
            children: [
              makeChild('a:alpha', 'AREA', 1),
              makeChild('a:empty', 'AREA', 2),
              makeChild('a:beta', 'AREA', 3),
            ],
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) {
        return {
          ...makeCountsResponse(),
          nodeKey: 'd:sw',
          children: [
            { nodeKey: 'a:alpha', count: 4, schoolCount: 0 },
            { nodeKey: 'a:empty', count: 0, schoolCount: 0 },
            { nodeKey: 'a:beta', count: 2, schoolCount: 0 },
          ],
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: 'd:sw',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    // Wait for the COUNTS to land (alpha === 4) so the zero is a real server value, not "not loaded yet".
    await waitFor(() => expect(result.current.children.find((c) => c.nodeKey === 'a:alpha')?.listingCount).toBe(4));
    expect(result.current.children.map((c) => c.nodeKey)).toEqual(['a:alpha', 'a:empty', 'a:beta']);
    const empty = result.current.children.find((c) => c.nodeKey === 'a:empty');
    expect(empty?.listingCount).toBe(0);
    expect(empty?.isLeafArea).toBe(true);
  });

  it('AC2 — a sparse group whose server response returns AREA children directly (no CLUSTER level) renders straight to Areas', async () => {
    // Smaller-city / sparse-group case: the server's nextLevelType is 'AREA',
    // not 'CLUSTER' — no intermediate Local Destination level is invented,
    // and no client-side grouping happens over the AREA children.
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        return makeResolveResponse({
          node: {
            nodeKey: 'd:small',
            nodeType: 'DIRECTION',
            displayLabel: 'Small Region',
            depth: 0,
            ancestry: [],
            nextLevelType: 'AREA',
            children: [
              makeChild('a:one', 'AREA', 1),
              makeChild('a:two', 'AREA', 2),
            ],
            revisionId: 1,
          },
        });
      }
      if (path.includes('/counts')) return { ...makeCountsResponse(), nodeKey: 'd:small', children: [] };
      throw new Error(`unexpected path: ${path}`);
    });
    const client = makeClient();
    const { result } = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'smalltown',
          requestedNodeKey: 'd:small',
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.children.length).toBeGreaterThan(0));
    expect(result.current.levelKind).toBe('areas');
    expect(result.current.children).toHaveLength(2);
    expect(result.current.children.every((c) => c.nodeType === 'AREA' && c.isLeafArea)).toBe(true);
    // No synthetic intermediate node was minted — every rendered child's
    // nodeType is exactly what the server sent, never a client-invented
    // CLUSTER wrapper.
    expect(result.current.children.map((c) => c.nodeKey)).toEqual(['a:one', 'a:two']);
  });

  it('AC15 — a filter change alters child COUNTS only; labels, ordering, membership and parentage are unchanged (the resolve query key deliberately excludes filters)', async () => {
    const resolveCalls: string[] = [];
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        resolveCalls.push(path);
        return makeResolveResponse();
      }
      if (path.includes('/counts')) {
        // Simulate the ONLY thing a filter is allowed to change: the numbers.
        const filtered = path.includes('bedrooms=4');
        return {
          ...makeCountsResponse(),
          children: [
            { nodeKey: 'd:n', count: filtered ? 2 : 10, schoolCount: 1, matchingAreaCount: filtered ? 1 : 3 },
            { nodeKey: 'd:e', count: filtered ? 5 : 20, schoolCount: 2, matchingAreaCount: filtered ? 2 : 4 },
          ],
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    // Two SEPARATE fresh mounts (not a rerender) so each starts with its own
    // filters from the initial render — this sidesteps
    // useDiscoverNavigationCounts's 300ms filter-only debounce entirely,
    // which is orthogonal to what this test is proving.
    const unfilteredClient = makeClient();
    const unfilteredHook = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
        }),
      { wrapper: wrapper(unfilteredClient) },
    );
    await waitFor(() => expect(unfilteredHook.result.current.children.length).toBeGreaterThan(0));

    const filteredClient = makeClient();
    const filteredHook = renderHook(
      () =>
        useAreasNavigationJourney({
          city: 'bangalore',
          requestedNodeKey: null,
          onSelectNode: vi.fn(),
          filters: { bedrooms: [4] },
        }),
      { wrapper: wrapper(filteredClient) },
    );
    await waitFor(() => expect(filteredHook.result.current.children.length).toBeGreaterThan(0));

    const unfiltered = unfilteredHook.result.current.children;
    const filtered = filteredHook.result.current.children;

    // STRUCTURE unchanged: same keys, same order, same labels, same nodeType.
    expect(filtered.map((c) => c.nodeKey)).toEqual(unfiltered.map((c) => c.nodeKey));
    expect(filtered.map((c) => c.displayLabel)).toEqual(unfiltered.map((c) => c.displayLabel));
    expect(filtered.map((c) => c.displayOrder)).toEqual(unfiltered.map((c) => c.displayOrder));
    expect(filtered.map((c) => c.nodeType)).toEqual(unfiltered.map((c) => c.nodeType));

    // COUNTS differ — this is the only thing a filter may change.
    expect(filtered[0].listingCount).not.toBe(unfiltered[0].listingCount);
    expect(filtered[0].matchingAreaCount).not.toBe(unfiltered[0].matchingAreaCount);

    // The resolve request itself never carries filter params — the resolve
    // query key deliberately excludes filters (AREAS_NAVIGATION_RESOLVE_QUERY_KEY_BASE
    // is [.., city, resolveKey] only), so both mounts' resolve calls are
    // identical regardless of the filters passed to the hook.
    expect(resolveCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of resolveCalls) {
      expect(call).not.toMatch(/bedrooms/);
    }
  });

  it('Issue #2086 (S3 field threading) — descendantAreaCount, representativeAreaKeys, bounds and bearingDegrees are threaded through to the view model, with a present-and-null bearingDegrees at depth 0 preserved as null (never coerced to undefined/absent)', async () => {
    const bounds = { centreLat: 12.9, centreLon: 77.6, minLat: 12.8, minLon: 77.5, maxLat: 13.0, maxLon: 77.7 };
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
            children: [
              {
                nodeKey: 'd:n',
                nodeType: 'DIRECTION',
                displayLabel: 'North Bangalore',
                displayOrder: 1,
                descendantAreaCount: 42,
                representativeAreaKeys: ['a:one', 'a:two'],
                bounds,
                // Depth-0 child (a Direction under ROOT) — the wire contract
                // says bearingDegrees is null here, and it must arrive at the
                // view model as a REAL null, not stripped/undefined.
                bearingDegrees: null,
              },
            ],
            revisionId: 1,
          },
        });
      }
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
    const child = result.current.children[0];
    expect(child.descendantAreaCount).toBe(42);
    expect(child.representativeAreaKeys).toEqual(['a:one', 'a:two']);
    expect(child.bounds).toEqual(bounds);
    // Present-and-null, not absent — `null in child` / `'bearingDegrees' in
    // child` both hold, and the value itself is exactly null (not undefined).
    expect('bearingDegrees' in child).toBe(true);
    expect(child.bearingDegrees).toBeNull();
    expect(child.bearingDegrees).not.toBeUndefined();
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

// #2750 PR-4 B1 T1 — N7 (issue-1956-pr2-atomic-transition, "stale delayed response"). The e2e spec
// delayed /navigation/resolve for d:e, pressed Back to the root before it landed, and asserted the late
// response never repaints the URL/panel/breadcrumb/markers. All four read the ONE resolved `node`; this
// pins that node against an out-of-order resolve with DEFERRED promises (resolution order is the test's,
// not the scheduler's). The resolve query is keyed by the requested node (queryKey ...city, resolveKey),
// which is what stops a superseded node's answer from being shown as the current node.
describe('useAreasNavigationJourney — N7: a late resolve for a superseded node never repaints the current node', () => {
  it('while d:e is pending the hook exposes NO node (never the previous root as d:e); after Back to root the root is current and stays current when the late d:e response lands', async () => {
    const pending = new Map<string, (v: NavigationResolveResponseWire) => void>();
    const resolvePaths: string[] = [];
    mockGet.mockImplementation((path: string) => {
      if (path.includes('/navigation/resolve')) {
        const requested = new URL(path, 'http://localhost').searchParams.get('node') ?? '';
        resolvePaths.push(requested);
        if (requested === 'root') return Promise.resolve(makeResolveResponse());
        return new Promise<NavigationResolveResponseWire>((resolve) => {
          pending.set(requested, resolve);
        });
      }
      if (path.includes('/counts')) return Promise.resolve(makeCountsResponse());
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ requestedNodeKey }: { requestedNodeKey: string | null }) =>
        useAreasNavigationJourney({ city: 'bangalore', requestedNodeKey, onSelectNode: vi.fn() }),
      { wrapper: wrapper(client), initialProps: { requestedNodeKey: null as string | null } },
    );

    // Committed root (positive control: the root really resolved, so "root is current" below is not vacuous).
    await waitFor(() => expect(result.current.node?.nodeKey).toBe('root'));

    // The user clicks East Bangalore: d:e is REQUESTED but its answer is held back.
    rerender({ requestedNodeKey: 'd:e' });
    await waitFor(() => expect(resolvePaths).toContain('d:e'));
    expect(pending.has('d:e')).toBe(true);
    // While d:e is unresolved the hook must not present the cached ROOT as the node for d:e.
    expect(result.current.node).toBeNull();

    // Back to the root BEFORE d:e lands.
    rerender({ requestedNodeKey: null });
    await waitFor(() => expect(result.current.node?.nodeKey).toBe('root'));

    // The slow d:e response finally arrives, after the user has left d:e.
    const eastNode = {
      ...makeResolveResponse().node,
      nodeKey: 'd:e',
      nodeType: 'DIRECTION' as const,
      displayLabel: 'East Bangalore',
      depth: 0,
      nextLevelType: 'AREA' as const,
      children: [],
    };
    pending.get('d:e')!(makeResolveResponse({ requested: 'd:e', node: eastNode }));
    // Let the late promise settle through react-query, then assert the current node is STILL the root.
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.node?.nodeKey).toBe('root');
    expect(result.current.node?.displayLabel).toBe('Bangalore');
  });
});

// #2750 PR-4 B1 T1 — V2 (issue-1956-pr6-composed-seam; replaces the VACUOUS MUT-440 row). The e2e spec
// asserted no `navigation-resolution-notice` at a fresh area-first root. The earlier cited tests were the
// INVERSE (notice present when the journey carries one) and stayed green with the notice forced on at the
// root. This drives the REAL hook against a fresh root resolve (resolution EXACT), renders the REAL
// NavigationLevelPanel from that hook's own result, and asserts root content visible + notice ABSENT —
// next to a stale-node control (ANCESTOR resolution) in which the same chain DOES show the notice, so the
// absence is a measured absence on a path that can produce the notice.
describe('useAreasNavigationJourney → NavigationLevelPanel — V2: a fresh area-first root shows NO resolution notice', () => {
  function renderPanelFor(requestedNodeKey: string | null) {
    const client = makeClient();
    const { result } = renderHook(
      () => useAreasNavigationJourney({ city: 'bangalore', requestedNodeKey, onSelectNode: vi.fn() }),
      { wrapper: wrapper(client) },
    );
    return result;
  }

  it('fresh root (EXACT): hook resolutionNotice is null and the panel shows the root with no navigation-resolution-notice; a stale requested node (ANCESTOR) on the same chain shows the notice', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/navigation/resolve')) {
        const requested = new URL(path, 'http://localhost').searchParams.get('node') ?? 'root';
        if (requested === 'root') return makeResolveResponse();
        // The requested node no longer exists: the server resolves to its nearest parent.
        return makeResolveResponse({
          requested,
          resolution: 'ANCESTOR',
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
      if (path.includes('/counts')) return makeCountsResponse();
      throw new Error(`unexpected path: ${path}`);
    });

    // CONTROL (stale node): the notice IS produced and IS rendered by the same chain.
    const staleResult = renderPanelFor('a:stale');
    await waitFor(() => expect(staleResult.current.node?.nodeKey).toBe('d:n'));
    expect(staleResult.current.resolutionNotice).not.toBeNull();
    const stale = render(React.createElement(NavigationLevelPanel, { journey: staleResult.current }));
    expect(screen.getByTestId('navigation-resolution-notice')).toBeInTheDocument();
    stale.unmount();

    // FRESH ROOT (EXACT): content present, notice absent.
    const rootResult = renderPanelFor(null);
    await waitFor(() => expect(rootResult.current.node?.nodeKey).toBe('root'));
    expect(rootResult.current.resolutionNotice).toBeNull();
    render(React.createElement(NavigationLevelPanel, { journey: rootResult.current }));
    expect(screen.getByTestId('navigation-level-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('navigation-resolution-notice')).not.toBeInTheDocument();
  });
});
