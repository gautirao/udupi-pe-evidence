import { describe, it, expect } from 'vitest';
import { deriveMapInfoDockContent } from '../mapInfoDockContent';
import type { DiscoverMapSurfaceView } from '../buildMapSurfaceModel';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';

/**
 * Issue #2748 — lane review fix (first pass regression): at a DIRECTION/CLUSTER
 * node (e.g. `node=d:southeast`), `resolvedPanelContent` stays
 * `'area-groups-landing'` and `isAreaFirstCityLanding` stays true (navigating a
 * direction is a pure map-camera affordance in this journey, not a panel-state
 * change) — so a naive `isLandingCountBadgeVisible`-style gate pairs the CITY
 * total with the DIRECTION's own label. This suite pins the fix: a
 * DIRECTION/CLUSTER node's count must come from
 * `activeAreasNavigationJourney.nodeCount.listingCount` (the SAME canonical
 * per-node total the right panel's own heading count uses), never `cityTotal`.
 */

function buildView(overrides: {
  node: NavigationNodeResponse | null;
  nodeCount: { listingCount: number; schoolCount: number; matchingAreaCount: number | null } | null;
  cityTotal: number;
  selectedArea?: unknown;
  resolvedPanelContent?: string;
  focusedGroup?: unknown;
  discoverBadgeState?: DiscoverBadgeResult['state'];
  /** Defaults to true — most fixtures below are testing something else and want the badge gate open. */
  discoverBadgeVisible?: boolean;
  /** Defaults to a non-null number — see `discoverBadgeVisible`. */
  discoverBadgeCount?: number | null;
}): DiscoverMapSurfaceView {
  const {
    node,
    nodeCount,
    cityTotal,
    selectedArea = null,
    resolvedPanelContent = 'area-groups-landing',
    focusedGroup = null,
    discoverBadgeState = 'ok',
    discoverBadgeVisible = true,
    discoverBadgeCount = 1,
  } = overrides;

  return {
    navigation: {
      journey: 'area-first',
      city: 'bangalore',
      resolvedPanelContent,
      // Real production behaviour (the bug this suite pins): navigating a
      // DIRECTION/CLUSTER node is a pure map-camera affordance in this
      // journey — it does NOT flip `isAreaFirstCityLanding` to false, only a
      // real area/group selection does.
      isAreaFirstCityLanding: resolvedPanelContent !== 'area-selected' && !focusedGroup,
      isAreaFirstSelectedAreaState:
        !!selectedArea && (resolvedPanelContent === 'area-selected' || resolvedPanelContent === 'area-groups-landing'),
      isSelectedGroupState: false,
      focusedGroup,
      areasNavigationJourney: {
        isLoading: false,
        isError: false,
        error: null,
        node,
        levelKind: 'areas',
        children: [],
        resolutionNotice: null,
        nodeCount,
        schoolsNotSimulatedForRevision: false,
        selectNode: () => {},
        refetch: () => {},
      },
    },
    areas: { selectedArea },
    status: {
      cityTotal,
      discoverBadge: {
        state: discoverBadgeState,
        visible: discoverBadgeVisible,
        count: discoverBadgeCount,
      } as DiscoverBadgeResult,
      areaResultSummaryText: '5 of 18 match in RR Nagar',
      groupSelectedBadgeCopy: 'Showing 8 verified properties in University Belt',
    },
  } as unknown as DiscoverMapSurfaceView;
}

describe('deriveMapInfoDockContent — count source (#2748 lane review fix)', () => {
  it('DIRECTION node: uses the node\'s own nodeCount.listingCount, never cityTotal', () => {
    const node = { nodeKey: 'd:southeast', nodeType: 'DIRECTION', displayLabel: 'South-East Bangalore' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({ node, nodeCount: { listingCount: 6, schoolCount: 0, matchingAreaCount: 3 }, cityTotal: 19 }),
    );
    expect(result?.where).toBe('South-East Bangalore');
    // The regression this pins: city total (19) must NOT appear paired with the
    // direction's own label — only the node's own count (6) may.
    expect(result?.countText).toBe('Showing 6 verified properties across South-East Bangalore');
    expect(result?.countText).not.toContain('19');
  });

  it('CLUSTER node: same rule as DIRECTION', () => {
    const node = { nodeKey: 'c:foo', nodeType: 'CLUSTER', displayLabel: 'Foo Cluster' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({ node, nodeCount: { listingCount: 42, schoolCount: 0, matchingAreaCount: 5 }, cityTotal: 19 }),
    );
    expect(result?.countText).toBe('Showing 42 verified properties across Foo Cluster');
  });

  it('DIRECTION node with nodeCount still loading (null): no count row yet, not a city fallback', () => {
    const node = { nodeKey: 'd:southeast', nodeType: 'DIRECTION', displayLabel: 'South-East Bangalore' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(buildView({ node, nodeCount: null, cityTotal: 19 }));
    expect(result?.countText).toBeNull();
  });

  it('ROOT node (city landing): uses cityTotal, unaffected by the fix', () => {
    const node = { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({ node, nodeCount: null, cityTotal: 19, resolvedPanelContent: 'area-groups-landing' }),
    );
    expect(result?.countText).toBe('Showing 19 verified properties across Bangalore');
  });

  it('no node yet (null): same as ROOT, uses cityTotal', () => {
    const result = deriveMapInfoDockContent(buildView({ node: null, nodeCount: null, cityTotal: 19 }));
    expect(result?.where).toBe('Bangalore');
    expect(result?.countText).toBe('Showing 19 verified properties across Bangalore');
  });

  it('AREA selected (listing-capable): verbatim areaResultSummaryText, not nodeCount/cityTotal', () => {
    const node = { nodeKey: 'a:RR Nagar', nodeType: 'AREA', displayLabel: 'RR Nagar' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({
        node,
        nodeCount: { listingCount: 4, schoolCount: 0, matchingAreaCount: null },
        cityTotal: 19,
        resolvedPanelContent: 'area-selected',
        selectedArea: { areaKey: 'RR Nagar' },
      }),
    );
    expect(result?.listingCapable).toBe(true);
    expect(result?.countText).toBe('5 of 18 match in RR Nagar');
  });
});

/**
 * Lane review (pass 3, BLOCKING #1) — `mapInfoDockContent.ts` was showing the
 * `discoverBadge`-derived stale/area/group copy REGARDLESS of the badge's own
 * `visible`/`count` honesty signal, so a cold city load whose `discoverBadge`
 * transiently reports `state: 'stale'` showed "Filtered results", and an
 * area/group still loading its real count showed a premature
 * "0 verified properties in …" from the pre-computed copy. Each case below is
 * verified to FAIL against the pre-fix code (see the PR's fix-round comment
 * for the red-run report) and pass after applying the same visibility rule
 * `isDrillDownCountBadgeVisible` uses: `visible && (count != null || state ===
 * 'stale')`.
 */
describe('deriveMapInfoDockContent — discoverBadge visibility gate (#2748 lane review, pass 3)', () => {
  it('area selected, count still loading (badge not visible): no count row, not the precomputed copy', () => {
    const node = { nodeKey: 'a:RR Nagar', nodeType: 'AREA', displayLabel: 'RR Nagar' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({
        node,
        nodeCount: null,
        cityTotal: 19,
        resolvedPanelContent: 'area-selected',
        selectedArea: { areaKey: 'RR Nagar' },
        discoverBadgeState: 'loading',
        discoverBadgeVisible: false,
        discoverBadgeCount: null,
      }),
    );
    expect(result?.countText).toBeNull();
  });

  it('stale state but badge not visible: no "Filtered results" (cold-load false positive)', () => {
    const node = { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({
        node,
        nodeCount: null,
        cityTotal: 0,
        discoverBadgeState: 'stale',
        discoverBadgeVisible: false,
        discoverBadgeCount: null,
      }),
    );
    expect(result?.countText).toBeNull();
  });

  it('cityTotal === 0 at ROOT: no count row (unaffected by the badge gate — its own long-standing guard)', () => {
    const node = { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(buildView({ node, nodeCount: null, cityTotal: 0 }));
    expect(result?.countText).toBeNull();
  });

  it('group selected, count still loading (badge not visible): no premature "0 verified" copy', () => {
    const result = deriveMapInfoDockContent(
      buildView({
        node: null,
        nodeCount: null,
        cityTotal: 19,
        resolvedPanelContent: 'area-groups-landing',
        focusedGroup: { groupId: 'g1' },
        discoverBadgeVisible: false,
        discoverBadgeCount: null,
      }),
    );
    expect(result?.countText).toBeNull();
  });

  it('stale WITH the badge genuinely visible: "Filtered results" still shows (the gate does not over-suppress)', () => {
    const node = { nodeKey: 'a:RR Nagar', nodeType: 'AREA', displayLabel: 'RR Nagar' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({
        node,
        nodeCount: null,
        cityTotal: 19,
        resolvedPanelContent: 'area-selected',
        selectedArea: { areaKey: 'RR Nagar' },
        discoverBadgeState: 'stale',
        discoverBadgeVisible: true,
        discoverBadgeCount: null,
      }),
    );
    expect(result?.countText).toBe('Filtered results');
  });
});

/**
 * Lane review (pass 3, ADVISORY-DEFER #5) — `area-school-combined` (areaKey AND
 * schoolId both set, reached from the area-selected panel's own "Schools in
 * <area>" widget, which keeps the area selected) and `area-group-results`
 * (groupId + the real `groupResults=1` "view all results in this zone" URL
 * flag, no areaKey/schoolId) are BOTH reachable in the Areas journey and are
 * distinct `resolvedPanelContent` values from `area-selected`/
 * `area-groups-landing`. Both are handled explicitly rather than deferred,
 * since they are real, reachable states.
 */
describe('deriveMapInfoDockContent — area-school-combined / area-group-results (#2748 lane review, pass 3)', () => {
  it('area-school-combined: still treated as listing-capable (area stays selected), verbatim areaResultSummaryText', () => {
    const node = { nodeKey: 'a:RR Nagar', nodeType: 'AREA', displayLabel: 'RR Nagar' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({
        node,
        nodeCount: { listingCount: 4, schoolCount: 1, matchingAreaCount: null },
        cityTotal: 19,
        resolvedPanelContent: 'area-school-combined',
        selectedArea: { areaKey: 'RR Nagar' },
      }),
    );
    expect(result?.listingCapable).toBe(true);
    expect(result?.countText).toBe('5 of 18 match in RR Nagar');
  });

  it('area-group-results: same group-selected verbatim copy as area-groups-landing (same focusedGroup, a drill-in on it)', () => {
    const result = deriveMapInfoDockContent(
      buildView({
        node: null,
        nodeCount: null,
        cityTotal: 19,
        resolvedPanelContent: 'area-group-results',
        focusedGroup: { groupId: 'g1' },
      }),
    );
    expect(result?.countText).toBe('Showing 8 verified properties in University Belt');
  });
});

describe('deriveMapInfoDockContent — hideDuplicateCountBadge option (#2698, ADVISORY-FIX #3)', () => {
  it('suppresses only the count row, leaving where/listingCapable intact', () => {
    const node = { nodeKey: 'a:RR Nagar', nodeType: 'AREA', displayLabel: 'RR Nagar' } as NavigationNodeResponse;
    const result = deriveMapInfoDockContent(
      buildView({
        node,
        nodeCount: null,
        cityTotal: 19,
        resolvedPanelContent: 'area-selected',
        selectedArea: { areaKey: 'RR Nagar' },
      }),
      { hideDuplicateCountBadge: true },
    );
    expect(result?.countText).toBeNull();
    expect(result?.listingCapable).toBe(true);
    expect(result?.where).toBe('RR Nagar');
  });
});
