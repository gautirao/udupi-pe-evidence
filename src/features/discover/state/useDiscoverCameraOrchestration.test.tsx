import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverCameraOrchestration,
  type UseDiscoverCameraOrchestrationParams,
} from './useDiscoverCameraOrchestration';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';

function makeSchool(overrides: Partial<SchoolResult> = {}): SchoolResult {
  return {
    id: 'sch-1',
    name: 'Test School',
    board: 'CBSE',
    boardType: null,
    latitude: 13.35,
    longitude: 74.79,
    address: 'Manipal',
    distanceKm: 1,
    ...overrides,
  };
}

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

describe('useDiscoverCameraOrchestration', () => {
  it('(i) initial view: ticks at 0, schoolFocusLat/Lon undefined, agriGroupFocusBounds null', () => {
    const { result } = renderHook(() => useDiscoverCameraOrchestration(makeParams()));

    expect(result.current.schoolFocusTick).toBe(0);
    expect(result.current.schoolMarkerFocusTick).toBe(0);
    expect(result.current.schoolFocusLat).toBeUndefined();
    expect(result.current.schoolFocusLon).toBeUndefined();
    expect(result.current.agriGroupFocusBounds).toBeNull();
  });

  describe('schoolFocusTick guard', () => {
    it('increments once a school is selected in school-first journey with hydrated lat/lon', () => {
      const params = makeParams({ urlState: { journey: 'school-first', radiusKm: null, groupId: null, areaKey: null, scope: null, selectedLocality: null } });
      const { result, rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: params,
      });
      expect(result.current.schoolFocusTick).toBe(0);

      rerender({ ...params, selectedSchool: makeSchool() });
      expect(result.current.schoolFocusTick).toBe(1);
      expect(result.current.schoolFocusLat).toBe(13.35);
      expect(result.current.schoolFocusLon).toBe(74.79);
    });

    it('does NOT increment when journey is not school-first', () => {
      const params = makeParams({ urlState: { journey: 'area-first', radiusKm: null, groupId: null, areaKey: null, scope: null, selectedLocality: null } });
      const { result, rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: params,
      });

      rerender({ ...params, selectedSchool: makeSchool() });
      expect(result.current.schoolFocusTick).toBe(0);
    });

    it('does NOT increment when the school has no hydrated lat/lon (hydration race)', () => {
      const params = makeParams({ urlState: { journey: 'school-first', radiusKm: null, groupId: null, areaKey: null, scope: null, selectedLocality: null } });
      const { result, rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: params,
      });

      rerender({
        ...params,
        selectedSchool: makeSchool({ latitude: undefined as unknown as number, longitude: undefined as unknown as number }),
      });
      expect(result.current.schoolFocusTick).toBe(0);
    });

    it('increments again on a radiusKm change while the same school remains selected', () => {
      const params = makeParams({
        urlState: { journey: 'school-first', radiusKm: 3, groupId: null, areaKey: null, scope: null, selectedLocality: null },
        selectedSchool: makeSchool(),
      });
      const { result, rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: params,
      });
      expect(result.current.schoolFocusTick).toBe(1);

      rerender({ ...params, urlState: { ...params.urlState, radiusKm: 5 } });
      expect(result.current.schoolFocusTick).toBe(2);
    });
  });

  describe('#1547 schoolMarkerFocusTick fit-once', () => {
    it('fires once on first settle, does NOT re-fire on a same-key isLoadingAreaListings re-toggle, fires again on a new key', () => {
      const base = makeParams({
        urlState: { journey: 'school-first', radiusKm: 3, groupId: null, areaKey: null, scope: null, selectedLocality: null },
        selectedSchool: makeSchool(),
        isLoadingAreaListings: true,
        schoolListings: [],
      });
      const { result, rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: base,
      });
      expect(result.current.schoolMarkerFocusTick).toBe(0);

      // Listings settle: isLoadingAreaListings=false, schoolListings non-empty → listingsReadyKey non-null.
      const settled = {
        ...base,
        isLoadingAreaListings: false,
        schoolListings: [{ id: 'l1' }] as UseDiscoverCameraOrchestrationParams['schoolListings'],
      };
      rerender(settled);
      expect(result.current.schoolMarkerFocusTick).toBe(1);

      // Bbox refetch: isLoadingAreaListings toggles true then false again with the SAME
      // schoolId+radiusKm (same key) — must NOT re-increment (the anti-snap-back guard).
      rerender({ ...settled, isLoadingAreaListings: true });
      rerender(settled);
      expect(result.current.schoolMarkerFocusTick).toBe(1);

      // A genuinely NEW key (radiusKm change) DOES re-fit.
      rerender({ ...settled, urlState: { ...settled.urlState, radiusKm: 5 } });
      expect(result.current.schoolMarkerFocusTick).toBe(2);
    });

    it('stays at 0 while isLoadingAreaListings is true (listingsReadyKey null)', () => {
      const params = makeParams({
        urlState: { journey: 'school-first', radiusKm: 3, groupId: null, areaKey: null, scope: null, selectedLocality: null },
        selectedSchool: makeSchool(),
        isLoadingAreaListings: true,
        schoolListings: [{ id: 'l1' }] as UseDiscoverCameraOrchestrationParams['schoolListings'],
      });
      const { result } = renderHook(() => useDiscoverCameraOrchestration(params));
      expect(result.current.schoolMarkerFocusTick).toBe(0);
    });
  });

  describe('group-fit', () => {
    it('calls setPanToArea with synthetic group bounds once data is ready, and does not re-fire on an unrelated re-render', () => {
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

      expect(setPanToArea).toHaveBeenCalledTimes(1);
      expect(setPanToArea.mock.calls[0][0]).toMatchObject({ areaKey: GROUP_BOUNDS_SYNTHETIC_KEY });

      // Re-render with the same groupId/areaKey — the one-shot ref must not re-fire.
      rerender({ ...params });
      expect(setPanToArea).toHaveBeenCalledTimes(1);
    });

    it('does not fire while areasLoading or isLoadingAreaGroups is true (readiness gate)', () => {
      const setPanToArea = vi.fn();
      const group = makeGroup();
      const params = makeParams({
        urlState: { journey: 'area-first', radiusKm: null, groupId: 'university-belt', areaKey: null, scope: null, selectedLocality: null },
        setPanToArea,
        discoverAreas: [makeArea()],
        areaGroupsData: { groups: [group] },
        focusedGroup: group,
        areasLoading: true,
      });
      renderHook(() => useDiscoverCameraOrchestration(params));
      expect(setPanToArea).not.toHaveBeenCalled();
    });

    it('yields when areaKey is set (per-area fit takes precedence)', () => {
      const setPanToArea = vi.fn();
      const group = makeGroup();
      const params = makeParams({
        urlState: { journey: 'area-first', radiusKm: null, groupId: 'university-belt', areaKey: 'IN|KA|Udupi|Manipal', scope: null, selectedLocality: null },
        setPanToArea,
        discoverAreas: [makeArea()],
        areaGroupsData: { groups: [group] },
        focusedGroup: group,
      });
      renderHook(() => useDiscoverCameraOrchestration(params));
      expect(setPanToArea).not.toHaveBeenCalled();
    });
  });

  describe('scope-fit', () => {
    it('calls setPanToArea once for a macro-region scope, does not re-fire on a background refetch, and yields when groupId is set', () => {
      const setPanToArea = vi.fn();
      // Issue #1882 (Track A PR2 Slice S2c) — scope-fit now matches groups by
      // the backend-derived region_key (strict equality), not a
      // region_label/direction heuristic, so the fixture carries region_key.
      const group = makeGroup({ region_label: 'North Udupi', region_key: 'north' });
      const area = makeArea();
      const params = makeParams({
        urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
        setPanToArea,
        discoverAreas: [area],
        areaGroupsData: { groups: [group] },
      });
      const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: params,
      });

      expect(setPanToArea).toHaveBeenCalledTimes(1);

      // Background refetch — NEW discoverAreas array identity, same scope: no re-fire.
      rerender({ ...params, discoverAreas: [makeArea()] });
      expect(setPanToArea).toHaveBeenCalledTimes(1);

      // groupId now set — the scope-fit must yield (no additional scope-bounds call).
      rerender({ ...params, urlState: { ...params.urlState, groupId: 'university-belt' } });
      expect(setPanToArea).toHaveBeenCalledTimes(1);
    });
  });

  describe('agri-fit', () => {
    it('is null when no region/maxKm is selected', () => {
      const { result } = renderHook(() => useDiscoverCameraOrchestration(makeParams()));
      expect(result.current.agriGroupFocusBounds).toBeNull();
    });

    it('frames the sector cone when a region+maxKm is selected with no listings', () => {
      const params = makeParams({ selectedRegion: 'N', selectedMaxKm: 25 });
      const { result } = renderHook(() => useDiscoverCameraOrchestration(params));
      expect(result.current.agriGroupFocusBounds).not.toBeNull();
    });

    it('clears back to null when the region is deselected', () => {
      const params = makeParams({ selectedRegion: 'N', selectedMaxKm: 25 });
      const { result, rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
        initialProps: params,
      });
      expect(result.current.agriGroupFocusBounds).not.toBeNull();

      rerender({ ...params, selectedRegion: null, selectedMaxKm: null });
      expect(result.current.agriGroupFocusBounds).toBeNull();
    });
  });
});
