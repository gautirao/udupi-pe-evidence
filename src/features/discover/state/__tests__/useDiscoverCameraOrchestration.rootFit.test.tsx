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
