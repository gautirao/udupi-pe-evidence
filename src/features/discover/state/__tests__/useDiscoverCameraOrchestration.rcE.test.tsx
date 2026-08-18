/**
 * Issue #2105 (follow-up from PR #2097 / issue #2083) — fast, deterministic
 * `renderHook` unit regression for the RC_E guard.
 *
 * RC_E (found during #2083's execution, fixed in PR #2097): two uncoordinated
 * camera writers could fire on the same browser POP transition — a genuine
 * Back/Forward restoring a persisted viewport, followed ~2s later by a
 * redundant bbox-driven refit that silently overwrote the correctly-restored
 * camera. The fix guards the canonical-node fit on
 * `isRestoreAuthoritative({ historyAction: 'POP', viewport, isColdNavigate })`
 * (`src/shared/map/zoomPolicy.ts`), consumed here via `guardedSetPanToArea`.
 *
 * This file proves the guard's branching contract in isolation — it does NOT
 * replace `e2e/discover/issue-2083-home-breadcrumb-back-camera-race.spec.ts`,
 * which is still required: only a real browser can prove the actual race
 * (two writers, one ~2s after the other, against Leaflet's real imperative
 * map instance) is gone. A renderHook unit test proves the decision function
 * is wired correctly; it cannot prove the asynchronous double-write symptom
 * itself is absent in a live map.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiscoverCameraOrchestration } from '../useDiscoverCameraOrchestration';
import type { UseDiscoverCameraOrchestrationParams } from '../useDiscoverCameraOrchestration';

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

describe('Issue #2105 (RC_E / PR #2097) — POP camera-restoration guard', () => {
  it('POP with a restored viewport suppresses the redundant bbox refit (RC_E)', () => {
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
    // Initial PUSH fires the authoritative fit.
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    // A genuine POP restore landing on a URL that already carries a
    // persisted viewport — isRestoreAuthoritative is true, so the redundant
    // bbox-driven refit RC_E fixed must NOT fire.
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
    expect(setPanToArea).toHaveBeenCalledTimes(1);
  });

  it('PUSH/REPLACE navigation retains the intended authoritative fit', () => {
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
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    // A forward PUSH to a new node — never a restoration, must always fit.
    rerender({
      ...initialParams,
      navigationNodeKey: 'a:NodeB',
      navigationNodeBounds: NODE_B_BOUNDS,
      urlState: { ...initialParams.urlState, historyAction: 'PUSH', viewport: null },
    });
    expect(setPanToArea).toHaveBeenCalledTimes(2);

    // A REPLACE (e.g. a debounced pan write) to a new node — also never a
    // restoration, must always fit.
    rerender({
      ...initialParams,
      navigationNodeKey: 'a:NodeA',
      navigationNodeBounds: NODE_A_BOUNDS,
      urlState: { ...initialParams.urlState, historyAction: 'REPLACE', viewport: null },
    });
    expect(setPanToArea).toHaveBeenCalledTimes(3);
  });

  it('POP without a restorable viewport follows the documented fallback path (fit still fires)', () => {
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
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    // A POP transition with no persisted viewport to restore — nothing for
    // the guard to protect, so the legitimate bbox fit must NOT be
    // accidentally disabled.
    rerender({
      ...initialParams,
      navigationNodeKey: 'a:NodeB',
      navigationNodeBounds: NODE_B_BOUNDS,
      urlState: { ...initialParams.urlState, historyAction: 'POP', viewport: null },
    });
    expect(setPanToArea).toHaveBeenCalledTimes(2);
  });
});
