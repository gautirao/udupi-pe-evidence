/**
 * Issue #2005 (Slice 2 PR6) — Category C (tests-only) regression coverage for
 * useDiscoverCameraOrchestration.ts. ZERO production edits to this file — the
 * colocated useDiscoverCameraOrchestration.test.tsx already extensively
 * covers the group-fit (:307ish) and scope-fit (:397ish) one-shot ref
 * patterns per-scenario (including the exact "regionScopedGroups arrives
 * after the ref advance" race). This file adds the ONE canonical,
 * cross-cutting assertion the plan calls out explicitly for Category C:
 *
 *   "camera issues exactly one intent per navigation; a stale debounced
 *    viewport does not override it."
 *
 * translated to this hook's actual surface (it has no direct Leaflet access
 * — see file header DEVIATION note; camera intents are the `setPanToArea`
 * calls consumed downstream by PropertyMap's AreaPanner).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverCameraOrchestration,
  type UseDiscoverCameraOrchestrationParams,
} from './useDiscoverCameraOrchestration';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';

function makeArea(overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.35,
    geo_center_lon: 74.79,
    bbox: [[13.34, 74.78], [13.36, 74.8]],
    ...overrides,
  };
}

function makeGroup(overrides: Partial<AreaGroup> = {}): AreaGroup {
  return {
    id: 'university-belt',
    name: 'University Belt',
    subtitle: null,
    region_label: 'North Udupi',
    school_count: 0,
    area_keys: ['IN|KA|Udupi|Manipal'],
    ...overrides,
  };
}

function makeParams(
  overrides: Partial<UseDiscoverCameraOrchestrationParams> = {},
): UseDiscoverCameraOrchestrationParams {
  return {
    urlState: {
      journey: null,
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
    areaGroupsData: { groups: [] },
    isLoadingAreaGroups: false,
    agriMapListingsData: undefined,
    cityCenter: [13.34, 74.74],
    focusedGroup: null,
    summaryRegions: [],
    selectedRegion: null,
    selectedMaxKm: null,
    schoolListings: [],
    ...overrides,
  };
}

describe('useDiscoverCameraOrchestration — Category C invariant: exactly one camera intent per navigation; a stale debounced viewport does not override it', () => {
  it('selecting a group publishes exactly ONE setPanToArea intent; a subsequent unrelated re-render (simulating a debounced viewport/pan update elsewhere on the page) does not add a second', () => {
    const setPanToArea = vi.fn();
    const group = makeGroup();
    const area = makeArea();
    const params = makeParams({
      urlState: { journey: 'area-first', radiusKm: null, groupId: 'university-belt', areaKey: null, scope: null, selectedLocality: null },
      setPanToArea,
      discoverAreas: [area],
      areaGroupsData: { groups: [group] },
      focusedGroup: group,
    });

    const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
      initialProps: params,
    });

    // Exactly one intent for this navigation (the group selection).
    expect(setPanToArea).toHaveBeenCalledTimes(1);
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({ areaKey: GROUP_BOUNDS_SYNTHETIC_KEY });

    // A "stale debounced viewport" landing later is modelled here as an
    // unrelated re-render — the SAME groupId/areaKey (no new navigation) but
    // a fresh discoverAreas array identity (e.g. a background refetch that
    // settles after a debounced viewport report elsewhere finally commits).
    // It must NOT override/duplicate the camera intent already issued.
    rerender({ ...params, discoverAreas: [makeArea({ areaKey: 'IN|KA|Udupi|Manipal' })] });
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    // A genuine SECOND navigation (a different group) DOES issue a new intent.
    const group2 = makeGroup({ id: 'coastal-strip', name: 'Coastal Strip', area_keys: ['IN|KA|Udupi|Malpe'] });
    const area2 = makeArea({ areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' });
    rerender({
      ...params,
      urlState: { ...params.urlState, groupId: 'coastal-strip' },
      discoverAreas: [area, area2],
      areaGroupsData: { groups: [group, group2] },
      focusedGroup: group2,
    });
    expect(setPanToArea).toHaveBeenCalledTimes(2);
  });

  it('a macro-region scope selection publishes exactly ONE intent; a late-arriving (previously in-flight) regionScopedGroups projection for the SAME scope does not double-fire once it has already committed', () => {
    const setPanToArea = vi.fn();
    const group = makeGroup({ region_label: 'North Udupi', region_key: 'north' });
    const area = makeArea();
    const params = makeParams({
      urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
      setPanToArea,
      discoverAreas: [area],
      areaGroupsData: { groups: [group] },
      summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 10 }],
      regionScopedGroups: [
        {
          groupSlug: 'university-belt',
          name: 'University Belt',
          subtitle: null,
          scopingRegionKey: 'north',
          regionDisplayOrder: 1,
          areaKeys: [area.areaKey],
          listingCount: 10,
          focusLat: 13.35,
          focusLon: 74.79,
          minLat: 13.34,
          minLon: 74.78,
          maxLat: 13.36,
          maxLon: 74.8,
          boundsStatus: 'COMPLETE',
        },
      ],
      isLoadingRegionScopedGroups: false,
    });

    const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
      initialProps: params,
    });
    expect(setPanToArea).toHaveBeenCalledTimes(1);

    // A "stale" re-render after the fact (same scope, new array identity —
    // e.g. a debounced downstream update settling late) must not re-fire.
    rerender({ ...params, discoverAreas: [makeArea()] });
    expect(setPanToArea).toHaveBeenCalledTimes(1);
  });

  // Code-review follow-up (test-completeness fix): the test above seeds
  // regionScopedGroups already-resolved from the FIRST render, so it never
  // exercises the actual loading-gate at useDiscoverCameraOrchestration.ts
  // :367-371 — `if (resolved.kind === 'region' && regionScopedGroups ===
  // undefined) return;` — which runs BEFORE prevScopeRef.current is
  // advanced (:370-371), specifically so the ref does NOT advance while the
  // Resolution-B projection is still in flight. This test drives the real
  // pending -> resolved transition so a regression that removed/reordered
  // that gate (causing the ref to advance on the incomplete/undefined
  // projection and then permanently skip the correct fire once data
  // arrives, per the `!scopeChanged` bail at :374) would be caught.
  it('defers the region-scope pan while regionScopedGroups is still loading (ref does not advance), then fires exactly once when the projection resolves for the SAME scope', () => {
    const setPanToArea = vi.fn();
    const group = makeGroup({ region_label: 'North Udupi', region_key: 'north' });
    const area = makeArea();
    const loadingParams = makeParams({
      urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
      setPanToArea,
      discoverAreas: [area],
      areaGroupsData: { groups: [group] },
      summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 10 }],
      regionScopedGroups: undefined,
      isLoadingRegionScopedGroups: true,
    });

    const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
      initialProps: loadingParams,
    });

    // Still loading — resolved.kind === 'region' && regionScopedGroups ===
    // undefined must return BEFORE prevScopeRef advances. No pan yet.
    expect(setPanToArea).not.toHaveBeenCalled();

    // An intermediate re-render while STILL loading (e.g. an unrelated
    // background refetch of discoverAreas) must also not fire, and must not
    // advance the ref either.
    rerender({ ...loadingParams, discoverAreas: [makeArea({ areaKey: 'IN|KA|Udupi|Other' })] });
    expect(setPanToArea).not.toHaveBeenCalled();

    // The projection resolves for the SAME urlState.scope ('north') — the
    // ref was never advanced while loading, so scopeChanged is still true
    // the first time this runs with real data, and the pan fires now.
    const resolvedParams = {
      ...loadingParams,
      regionScopedGroups: [
        {
          groupSlug: 'university-belt',
          name: 'University Belt',
          subtitle: null,
          scopingRegionKey: 'north',
          regionDisplayOrder: 1,
          areaKeys: [area.areaKey],
          listingCount: 10,
          focusLat: 13.35,
          focusLon: 74.79,
          minLat: 13.34,
          minLon: 74.78,
          maxLat: 13.36,
          maxLon: 74.8,
          boundsStatus: 'COMPLETE' as const,
        },
      ],
      isLoadingRegionScopedGroups: false,
    };
    rerender(resolvedParams);

    expect(setPanToArea).toHaveBeenCalledTimes(1);
    // Correct member-area bounds — the union bbox of the resolved
    // projection's member areas (just `area` here), not an empty/default fit.
    expect(setPanToArea.mock.calls[0][0]).toMatchObject({
      geo_center_lat: expect.any(Number),
      geo_center_lon: expect.any(Number),
      bbox: [[area.bbox![0][0], area.bbox![0][1]], [area.bbox![1][0], area.bbox![1][1]]],
    });

    // A further unrelated re-render with the projection already committed
    // must not double-fire.
    rerender({ ...resolvedParams, discoverAreas: [makeArea()] });
    expect(setPanToArea).toHaveBeenCalledTimes(1);
  });
});
