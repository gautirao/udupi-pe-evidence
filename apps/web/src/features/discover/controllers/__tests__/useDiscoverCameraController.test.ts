/**
 * Issue #1943 Slice B — anchor-derivation and memo-identity-stability tests
 * for `useDiscoverCameraController`'s `navigationChildAnchors` memo (see the
 * hook's own doc for the full wiring rationale).
 *
 * `useDiscoverCameraOrchestration` is mocked so these tests exercise ONLY
 * the anchor-derivation memo added in this slice — the orchestration hook's
 * own effects/guards are Slice-A/pre-existing territory, unrelated to what
 * is under test here, and are covered by their own suites
 * (`cameraOwnership.guard.test.ts`, `PropertyMap.areaPanner.test.tsx`).
 *
 * T-B6 (anchor derivation) — REWRITTEN (Stage-B rework, code review cycle 2,
 * FIX 3): the memo now derives each child's centroid from the RAW wire
 * source (`node.children[i].centreLat/centreLon`, top-level fields on
 * `NavigationChildSummary`) — the SAME source AreaMarkerLayer.tsx's render
 * layer keys off (`rawByNodeKey`) — never from `child.bounds` (an optional
 * passthrough that can be null for a child whose raw centroid is perfectly
 * usable). There is deliberately no min/max-midpoint fallback any more: the
 * render never had one either, so keeping one here would silently reopen
 * the same member-set gap in the opposite direction. See the dedicated
 * "member-set parity" describe block below for the fix's own regression
 * test.
 *
 * T-B5 (risk R_NEW_B1, identity stability): a rerender that does not change
 * the journey's node/children/levelKind/journey values must forward the
 * SAME `navigationChildAnchors` array reference to
 * `useDiscoverCameraOrchestration` on both calls — an unstable identity here
 * is the most likely way this slice reintroduces a camera-thrash regression
 * (unstable dep -> effects downstream re-fire on every render).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type {
  AreasNavigationChild,
  UseAreasNavigationJourneyResult,
} from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationChildSummary, NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { UseDiscoverCameraOrchestrationParams } from '@/features/discover/state/useDiscoverCameraOrchestration';
import type { UseDiscoverCameraControllerParams } from '../useDiscoverCameraController';

const mockOrchestration = vi.hoisted(() =>
  vi.fn((_params: UseDiscoverCameraOrchestrationParams) => ({
    schoolFocusTick: 0,
    schoolMarkerFocusTick: 0,
    schoolFocusLat: undefined,
    schoolFocusLon: undefined,
    agriGroupFocusBounds: null,
    canonicalNodeFitCount: 0,
    isColdNavigate: false,
  })),
);
vi.mock('@/features/discover/state/useDiscoverCameraOrchestration', () => ({
  useDiscoverCameraOrchestration: mockOrchestration,
}));

import { useDiscoverCameraController } from '../useDiscoverCameraController';

function makeChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'd:central',
    nodeType: 'DIRECTION',
    displayLabel: 'Central',
    displayOrder: 0,
    listingCount: 42,
    schoolCount: 3,
    isLeafArea: false,
    matchingAreaCount: 5,
    descendantAreaCount: 5,
    representativeAreaKeys: [],
    bounds: { centreLat: 12.97, centreLon: 77.59, minLat: 12.9, minLon: 77.5, maxLat: 13.0, maxLon: 77.7 },
    bearingDegrees: null,
    ...overrides,
  };
}

/**
 * Builds a RAW `NavigationChildSummary` — the wire-shape sibling of
 * `makeChild`'s enriched `AreasNavigationChild`, carrying the TOP-LEVEL
 * `centreLat`/`centreLon` fields the render layer (AreaMarkerLayer.tsx)
 * reads and the anchor-derivation memo now reads too. Deliberately separate
 * from `makeChild`'s `bounds` field — a real wire child can have a null
 * `bounds` while still carrying a usable raw centroid (this IS the FIX 3
 * bug shape).
 */
function makeRawChild(
  nodeKey: string,
  centreLat: number | null,
  centreLon: number | null,
): NavigationChildSummary {
  return {
    nodeKey,
    nodeType: 'DIRECTION',
    displayLabel: 'Central',
    displayOrder: 0,
    centreLat,
    centreLon,
  };
}

function makeNode(rawChildren: NavigationChildSummary[]): NavigationNodeResponse {
  return {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'City',
    depth: 0,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: rawChildren,
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };
}

function makeJourney(
  children: AreasNavigationChild[],
  levelKind: UseAreasNavigationJourneyResult['levelKind'] = 'directions',
  node: NavigationNodeResponse | null = null,
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node,
    levelKind,
    children,
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
  };
}

function makeParams(
  overrides: Partial<UseDiscoverCameraControllerParams> = {},
): UseDiscoverCameraControllerParams {
  return {
    showAreasNavigationJourney: false,
    areasNavigationJourney: makeJourney([]),
    mapBbox: null,
    publishRecenterCameraIntent: vi.fn(),
    cameraOrchestrationUrlState: {
      journey: 'area-first',
      radiusKm: null,
      groupId: null,
      areaKey: null,
      scope: null,
      selectedLocality: null,
      viewport: null,
      historyAction: 'PUSH',
    } as unknown as UseDiscoverCameraOrchestrationParams['urlState'],
    selectedSchool: null,
    setPanToArea: vi.fn(),
    isLoadingAreaListings: false,
    discoverAreas: [],
    areasLoading: false,
    areaGroupsData: undefined,
    isLoadingAreaGroups: false,
    agriMapListingsData: undefined,
    cityCenter: undefined,
    focusedGroup: null,
    summaryRegions: [],
    selectedRegion: null,
    selectedMaxKm: null,
    schoolListings: [],
    scopeNamespaces: { regionKeys: new Set(), groupSlugs: new Set(), groupNameSlugs: new Map() },
    regionScopedGroupsData: undefined,
    isLoadingRegionScopedGroups: false,
    viewport: null,
    areaKey: null,
    discoverAreasData: undefined,
    ...overrides,
  };
}

function lastAnchorsArg(): unknown {
  const lastCall = mockOrchestration.mock.calls[mockOrchestration.mock.calls.length - 1];
  return (lastCall[0] as { navigationChildAnchors?: unknown }).navigationChildAnchors;
}

beforeEach(() => {
  mockOrchestration.mockClear();
});

describe('useDiscoverCameraController — T-B6 navigationChildAnchors derivation', () => {
  it('uses the RAW child centreLat/centreLon (node.children), not `bounds`', () => {
    const child = makeChild({ nodeKey: 'd:central', bounds: null });
    const node = makeNode([makeRawChild('d:central', 12.97, 77.59)]);
    renderHook(() =>
      useDiscoverCameraController(makeParams({ areasNavigationJourney: makeJourney([child], 'directions', node) })),
    );

    const anchors = lastAnchorsArg() as Array<{ lat: number; lon: number }> | null;
    expect(anchors).not.toBeNull();
    expect(anchors).toHaveLength(1);
    expect(anchors?.[0].lat).toBe(12.97);
    expect(anchors?.[0].lon).toBe(77.59);
  });

  it('no longer falls back to a bounds min/max midpoint — a child with null raw centroid is excluded even when bounds carries a full min/max box (FIX 3: removing the stale fallback closes the gap in the OTHER direction, matching the render, which never had one)', () => {
    const child = makeChild({
      nodeKey: 'd:central',
      bounds: { centreLat: null, centreLon: null, minLat: 12.0, minLon: 77.0, maxLat: 13.0, maxLon: 78.0 },
    });
    const node = makeNode([makeRawChild('d:central', null, null)]);
    renderHook(() =>
      useDiscoverCameraController(makeParams({ areasNavigationJourney: makeJourney([child], 'directions', node) })),
    );

    expect(lastAnchorsArg()).toBeNull();
  });

  it('filters out a child with no matching raw entry in node.children', () => {
    const withRaw = makeChild({ nodeKey: 'd:a', bounds: null });
    const withoutRaw = makeChild({ nodeKey: 'd:b', bounds: null });
    const node = makeNode([makeRawChild('d:a', 12.9, 77.6)]); // 'd:b' absent from the raw set
    renderHook(() =>
      useDiscoverCameraController(
        makeParams({ areasNavigationJourney: makeJourney([withRaw, withoutRaw], 'directions', node) }),
      ),
    );

    const anchors = lastAnchorsArg() as Array<{ lat: number; lon: number }> | null;
    expect(anchors).toHaveLength(1);
    expect(anchors?.[0].lat).toBe(12.9);
  });

  it('forwards null when every child is filtered out (no usable raw centroid anywhere)', () => {
    const a = makeChild({ nodeKey: 'd:a', bounds: null });
    const b = makeChild({ nodeKey: 'd:b', bounds: null });
    const node = makeNode([makeRawChild('d:a', null, null), makeRawChild('d:b', null, null)]);
    renderHook(() =>
      useDiscoverCameraController(makeParams({ areasNavigationJourney: makeJourney([a, b], 'directions', node) })),
    );

    expect(lastAnchorsArg()).toBeNull();
  });

  it('forwards null for a journey with no children at all', () => {
    renderHook(() => useDiscoverCameraController(makeParams({ areasNavigationJourney: makeJourney([]) })));
    expect(lastAnchorsArg()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Issue #1943 (Stage-B rework, code review cycle 2, FIX 3) — pins the
// prediction's member set (this hook's `navigationChildAnchors`) equal to
// the render layer's own member set (AreaMarkerLayer.tsx's
// `destinationMembers`, built from the SAME `node.children` raw source via
// `rawByNodeKey` + `isUsableCentroid`) for a child whose `bounds` is null
// but whose raw centroid is usable — exactly the shape that silently made
// `destinationCount` too small before this fix.
// ─────────────────────────────────────────────────────────────────────────
describe('useDiscoverCameraController — member-set parity with the render layer (FIX 3)', () => {
  it('a child with null bounds but a usable raw centroid is INCLUDED — matching AreaMarkerLayer.tsx, which reads the same raw node.children source', () => {
    const clean = makeChild({ nodeKey: 'd:clean', bounds: { centreLat: 12.9, centreLon: 77.5, minLat: null, minLon: null, maxLat: null, maxLon: null } });
    const nullBoundsUsableRaw = makeChild({ nodeKey: 'd:null-bounds', bounds: null });
    const children = [clean, nullBoundsUsableRaw];
    const rawChildren = [
      makeRawChild('d:clean', 12.9, 77.5),
      makeRawChild('d:null-bounds', 13.1, 77.8),
    ];
    const node = makeNode(rawChildren);

    renderHook(() =>
      useDiscoverCameraController(makeParams({ areasNavigationJourney: makeJourney(children, 'directions', node) })),
    );

    const anchors = lastAnchorsArg() as Array<{ lat: number; lon: number }> | null;

    // Simulate the render layer's OWN filter over the identical raw source
    // (AreaMarkerLayer.tsx's `rawByNodeKey` + `isUsableCentroid` gate) to
    // prove the two member sets have the same SIZE, not just that the
    // prediction happens to produce some non-null answer.
    const renderVisibleCount = children.filter((c) => {
      const raw = rawChildren.find((r) => r.nodeKey === c.nodeKey);
      return raw != null && raw.centreLat != null && raw.centreLon != null;
    }).length;

    expect(anchors).not.toBeNull();
    expect(anchors).toHaveLength(renderVisibleCount);
    expect(anchors).toHaveLength(2);
    expect(anchors?.map((a) => a.lat).sort()).toEqual([12.9, 13.1]);
  });
});

describe('useDiscoverCameraController — T-B5 navigationChildAnchors identity stability (risk R_NEW_B1)', () => {
  it('a rerender with the SAME node/children reference/levelKind/journey forwards the SAME anchors array reference', () => {
    const children = [makeChild()];
    const node = makeNode([makeRawChild('d:central', 12.97, 77.59)]);
    const journey = makeJourney(children, 'directions', node);
    const params = makeParams({ areasNavigationJourney: journey });

    const { rerender } = renderHook((p: UseDiscoverCameraControllerParams) => useDiscoverCameraController(p), {
      initialProps: params,
    });
    const first = lastAnchorsArg();
    expect(first).not.toBeNull();

    // Rerender with a freshly-constructed params object, but the SAME
    // `journey` (and therefore the SAME `children`/`node` references) as
    // before — models an ordinary parent re-render that does not actually
    // change the resolved node.
    rerender(makeParams({ areasNavigationJourney: journey }));
    const second = lastAnchorsArg();

    expect(second).toBe(first); // Object.is identity, not just deep-equal.
  });

  it('a genuinely NEW children/node reference (real transition) produces a NEW anchors array reference', () => {
    const childrenA = [makeChild({ nodeKey: 'd:a' })];
    const nodeA = makeNode([makeRawChild('d:a', 12.9, 77.5)]);
    const journeyA = makeJourney(childrenA, 'directions', nodeA);

    const { rerender } = renderHook((p: UseDiscoverCameraControllerParams) => useDiscoverCameraController(p), {
      initialProps: makeParams({ areasNavigationJourney: journeyA }),
    });
    const first = lastAnchorsArg();

    const childrenB = [makeChild({ nodeKey: 'd:b' })];
    const nodeB = makeNode([makeRawChild('d:b', 13.1, 77.8)]);
    const journeyB = makeJourney(childrenB, 'directions', nodeB);
    rerender(makeParams({ areasNavigationJourney: journeyB }));
    const second = lastAnchorsArg();

    expect(second).not.toBe(first);
  });
});
