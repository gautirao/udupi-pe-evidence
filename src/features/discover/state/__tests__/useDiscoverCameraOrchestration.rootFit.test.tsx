/**
 * Issue #2083 RC_A part 3 (AC1) — returning to the synthetic city root now
 * issues a camera fit.
 *
 * Before this issue, `NavigationNodeResponse.forRoot` always sent
 * `bounds: null` for the root node (by design), so
 * `useDiscoverCameraOrchestration`'s fit-once effect (the existing null-guard
 * at its `if (!bounds || bounds.minLat == null ...) return;`) always
 * short-circuited for `navigationNodeKey === 'root'` — the map kept whatever
 * framing it already had. The backend now derives root bounds from the union
 * of its direct children (`NavigationNodeResponse.deriveRootBounds`), so the
 * SAME existing effect (genuinely UNCHANGED by this issue — see
 * `useDiscoverCameraOrchestration.ts`'s fit-once effect) fires correctly the
 * moment a non-null bounds object reaches it. This file proves that
 * end-to-end at the hook level; the sibling (non-`__tests__`, out of this
 * issue's allowed-file scope) `useDiscoverCameraOrchestration.test.tsx`
 * already separately pins the true-null-bounds degenerate case (a city with
 * zero root children) as a no-fit no-op — both are correct, for different
 * inputs.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiscoverCameraOrchestration } from '../useDiscoverCameraOrchestration';
import type {
  UseDiscoverCameraOrchestrationParams,
} from '../useDiscoverCameraOrchestration';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';

function makeParams(
  overrides: Partial<UseDiscoverCameraOrchestrationParams> = {},
): UseDiscoverCameraOrchestrationParams {
  return {
    urlState: {
      journey: 'area-first',
      radiusKm: null,
      groupId: null,
      areaKey: null,
      scope: null,
      selectedLocality: null,
    },
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
    ...overrides,
  };
}

describe('#2083 RC_A part 3 (AC1) — node=root now issues a city-bounds fit', () => {
  const ROOT_BOUNDS = {
    centreLat: 12.97,
    centreLon: 77.59,
    minLat: 12.8,
    minLon: 77.4,
    maxLat: 13.1,
    maxLon: 77.75,
  };

  it('fires a fit-to-city-bounds when the resolved root node now carries server-derived bounds', () => {
    const setPanToArea = vi.fn();
    const params = makeParams({
      setPanToArea,
      navigationNodeKey: 'root',
      navigationNodeBounds: ROOT_BOUNDS,
    });

    renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({
      areaKey: 'root',
      bbox: [
        [ROOT_BOUNDS.minLat, ROOT_BOUNDS.minLon],
        [ROOT_BOUNDS.maxLat, ROOT_BOUNDS.maxLon],
      ],
    });
  });

  it('a Direction -> Area -> Home (root) sequence fires a fresh fit on the return-to-root leg', () => {
    const setPanToArea = vi.fn();
    const directionParams = makeParams({
      setPanToArea,
      navigationNodeKey: 'd:n',
      navigationNodeBounds: { ...ROOT_BOUNDS, centreLat: 13.0 },
    });
    const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
      initialProps: directionParams,
    });
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    rerender({
      ...directionParams,
      navigationNodeKey: 'a:IN|KA|Bangalore|Hebbal',
      navigationNodeBounds: { ...ROOT_BOUNDS, centreLat: 13.05 },
    });
    expect(setPanToArea).toHaveBeenCalledTimes(2);

    // Home breadcrumb — back to the synthetic root, now WITH bounds.
    rerender({ ...directionParams, navigationNodeKey: 'root', navigationNodeBounds: ROOT_BOUNDS });
    expect(setPanToArea).toHaveBeenCalledTimes(3);
    expect(setPanToArea.mock.calls[2][0]).toMatchObject({
      bbox: [
        [ROOT_BOUNDS.minLat, ROOT_BOUNDS.minLon],
        [ROOT_BOUNDS.maxLat, ROOT_BOUNDS.maxLon],
      ],
    });
  });
});

// ─── Issue #1823 — named regression test ──────────────────────────────────
// The #2083 restore-wins-on-POP guard is now enforced ONCE at the
// `guardedSetPanToArea` publish boundary instead of being inlined only in
// this canonical-node effect. The highest-risk line in that consolidation
// is ref-advance ordering: `prevNavigationNodeKeyRef` must advance to the
// POP target EVEN WHEN the guard suppresses the write, or a later genuine
// transition back to the pre-POP node would be misread as "no transition"
// (transitioned = navigationNodeKey !== prevNavigationNodeKeyRef.current
// would incorrectly evaluate false) and never fit — a permanent dead
// camera. This proves the ref DOES advance during a suppressed write.
describe('Issue #1823 — suppressed POP fit does not block the next PUSH fit to the same node', () => {
  const NODE_A_BOUNDS = {
    centreLat: 13.0,
    centreLon: 77.5,
    minLat: 12.9,
    minLon: 77.4,
    maxLat: 13.1,
    maxLon: 77.6,
  };
  const NODE_B_BOUNDS = {
    centreLat: 13.2,
    centreLon: 77.7,
    minLat: 13.1,
    minLon: 77.6,
    maxLat: 13.3,
    maxLon: 77.8,
  };

  it('advances prevNavigationNodeKeyRef through a suppressed POP so a subsequent PUSH back to the pre-POP node still fires', () => {
    const setPanToArea = vi.fn();
    const initialParams = makeParams({
      setPanToArea,
      navigationNodeKey: 'a:NodeA',
      navigationNodeBounds: NODE_A_BOUNDS,
      urlState: {
        journey: 'area-first',
        radiusKm: null,
        groupId: null,
        areaKey: null,
        scope: null,
        selectedLocality: null,
        historyAction: 'PUSH',
        viewport: null,
      },
    });

    const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
      initialProps: initialParams,
    });
    // Initial PUSH to Node A fires.
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    // (a) POP to Node B landing on a URL that already carries a persisted
    // viewport — isRestoreAuthoritative is true, so this write is suppressed.
    rerender({
      ...initialParams,
      navigationNodeKey: 'a:NodeB',
      navigationNodeBounds: NODE_B_BOUNDS,
      urlState: {
        ...initialParams.urlState,
        historyAction: 'POP',
        viewport: { lat: 13.2, lon: 77.7, zoom: 14 },
      },
    });
    expect(setPanToArea).toHaveBeenCalledTimes(1); // still 1 — suppressed, not a no-op-because-same-node.

    // (b) Immediately a PUSH back to Node A (the node visited before the
    // POP), with no persisted viewport — NOT restore-authoritative. This
    // only fires if prevNavigationNodeKeyRef actually advanced to NodeB
    // during the suppressed POP above; if it hadn't, this render would see
    // navigationNodeKey === prevNavigationNodeKeyRef.current (both 'a:NodeA')
    // and treat it as no transition at all.
    rerender({
      ...initialParams,
      navigationNodeKey: 'a:NodeA',
      navigationNodeBounds: NODE_A_BOUNDS,
      urlState: {
        ...initialParams.urlState,
        historyAction: 'PUSH',
        viewport: null,
      },
    });
    expect(setPanToArea).toHaveBeenCalledTimes(2);
  });
});

// ─── Issue #1823 fix cycle 2 — scope correction ───────────────────────────
// Cycle 1 widened the #2083 restore-wins-on-POP guard to the group/scope fit
// effects as well as canonical-node. #1823's own scope is limited to the
// three canonical "listing-capable" states (Area, bounded Browse,
// school-radius) — group-focus/scope-focus fits are #2076 item 5's
// presentation-only Area cluster focus, never chartered to carry this guard.
// The widened guard suppressed group/scope fits on ANY ordinary hard load
// that happened to carry a persisted viewport (useNavigationType() reports
// 'POP' on an initial hard load/refresh/bookmark too, indistinguishable
// in-scope from a genuine Back/Forward). These tests pin the corrected
// behaviour: group/scope fits fire unconditionally on their own
// change-detection, regardless of historyAction/viewport.
describe('Issue #1823 fix cycle 2 — group/scope fits are NOT restore-guarded', () => {
  const AREA_A: AreaPoint = {
    areaKey: 'a1',
    areaLabel: 'Area One',
    geo_center_lat: 13.0,
    geo_center_lon: 77.5,
    bbox: [[12.9, 77.4], [13.1, 77.6]],
  };
  const GROUP_A: AreaGroup = {
    id: 'g1',
    name: 'Group One',
    subtitle: null,
    region_label: null,
    school_count: 0,
    area_keys: ['a1'],
  };

  it('a group fit fires on a hard load with historyAction POP + a persisted viewport (regression guard for Finding 2)', () => {
    const setPanToArea = vi.fn();
    const params = makeParams({
      setPanToArea,
      discoverAreas: [AREA_A],
      focusedGroup: GROUP_A,
      urlState: {
        journey: 'area-first',
        radiusKm: null,
        groupId: 'g1',
        areaKey: null,
        scope: null,
        selectedLocality: null,
        historyAction: 'POP',
        viewport: { lat: 13.0, lon: 77.5, zoom: 12 },
      },
    });

    renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({ reason: 'group' });
  });

  it('a scope (unmapped) fit fires on a hard load with historyAction POP + a persisted viewport', () => {
    const setPanToArea = vi.fn();
    const params = makeParams({
      setPanToArea,
      discoverAreas: [AREA_A],
      areaGroupsData: { groups: [] },
      urlState: {
        journey: 'area-first',
        radiusKm: null,
        groupId: null,
        areaKey: null,
        scope: 'unmapped',
        selectedLocality: null,
        historyAction: 'POP',
        viewport: { lat: 13.0, lon: 77.5, zoom: 12 },
      },
    });

    renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({ reason: 'scope' });
  });
});
