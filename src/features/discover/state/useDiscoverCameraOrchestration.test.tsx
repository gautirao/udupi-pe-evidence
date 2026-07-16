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
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';

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

function makeRegionScopedGroup(overrides: Partial<RegionScopedAreaGroup> = {}): RegionScopedAreaGroup {
  return {
    groupSlug: 'university-belt',
    name: 'University Belt',
    subtitle: null,
    scopingRegionKey: 'north',
    regionDisplayOrder: 1,
    areaKeys: ['IN|KA|Udupi|Manipal'],
    listingCount: 10,
    focusLat: 13.35,
    focusLon: 74.79,
    minLat: 13.34,
    minLon: 74.78,
    maxLat: 13.36,
    maxLon: 74.8,
    boundsStatus: 'COMPLETE',
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
        // Issue #1910 (PR2 fix-up, Finding 2) — resolveScope classifies
        // urlState.scope='north' as kind:'region' only when 'north' is a
        // member of the regionKeys namespace, which this hook derives from
        // summaryRegions (mirrors useDiscoverMapPresentation's identical
        // fallback namespace).
        summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 10 }],
        // Issue #1910 (PR2 review fix, Finding 3) — the scope-fit effect now
        // only pans once regionScopedGroups is a genuinely defined (success)
        // array; it no longer falls back to the unscoped `group` above when
        // the projection is undefined. Supply the matching projection so
        // this generic region-scope regression test represents the
        // real-world success state.
        regionScopedGroups: [makeRegionScopedGroup({ areaKeys: [area.areaKey] })],
        isLoadingRegionScopedGroups: false,
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

    it('calls setPanToArea once for a direct group scope (urlState.scope = group id), unaffected by the region-scoped migration', () => {
      const setPanToArea = vi.fn();
      const group = makeGroup();
      const area = makeArea();
      const params = makeParams({
        urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'university-belt', selectedLocality: null },
        setPanToArea,
        discoverAreas: [area],
        areaGroupsData: { groups: [group] },
      });
      renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });
      expect(setPanToArea).toHaveBeenCalledTimes(1);
      expect(setPanToArea.mock.calls[0][0]).toMatchObject({ areaKey: GROUP_BOUNDS_SYNTHETIC_KEY });
    });

    it('does not call setPanToArea when no scope, no groupId, and no areaKey are set', () => {
      const setPanToArea = vi.fn();
      const params = makeParams({ setPanToArea });
      renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });
      expect(setPanToArea).not.toHaveBeenCalled();
    });

    describe('Issue #1910 (PR2 fix-up, Finding 2) — region-scoped projection (Resolution B)', () => {
      it('pans to the region-scoped projection\'s bounds (Resolution B) rather than the unscoped group\'s full area_keys (Resolution A) when a region scope is active', () => {
        const setPanToArea = vi.fn();
        // Unscoped group: plurality region is 'south', with an area OUTSIDE
        // the 'north' region scope — Resolution A would incorrectly include it.
        const spanningGroup = makeGroup({
          id: 'spanning-group',
          area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|OutOfScope'],
          region_key: 'south',
        });
        const northArea = makeArea({ areaKey: 'IN|KA|Udupi|Manipal' });
        const outOfScopeArea = makeArea({
          areaKey: 'IN|KA|Udupi|OutOfScope',
          geo_center_lat: 20.0,
          geo_center_lon: 80.0,
          bbox: [[19.9, 79.9], [20.1, 80.1]],
        });
        // Resolution B projection: ONLY the 'north'-scoped subset (Manipal).
        const projection = makeRegionScopedGroup({
          groupSlug: 'spanning-group',
          scopingRegionKey: 'north',
          areaKeys: ['IN|KA|Udupi|Manipal'],
        });
        const params = makeParams({
          urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
          setPanToArea,
          discoverAreas: [northArea, outOfScopeArea],
          areaGroupsData: { groups: [spanningGroup] },
          summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 5 }],
          regionScopedGroups: [projection],
        });
        renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });

        expect(setPanToArea).toHaveBeenCalledTimes(1);
        const bounds = setPanToArea.mock.calls[0][0];
        // Bounds must come from ONLY the Manipal area (Resolution B), never
        // extend to the out-of-scope area that Resolution A would have pulled in.
        expect(bounds.bbox).toEqual([[13.34, 74.78], [13.36, 74.8]]);
      });

      it('commits NO pan (never the legacy Resolution-A fallback) while the projection is undefined — covers BOTH pending and error, since React Query only ever populates `data` on genuine success (Issue #1910 PR2 review fix, Finding 3)', () => {
        const setPanToArea = vi.fn();
        const group = makeGroup({ region_key: 'north' });
        const area = makeArea();
        const params = makeParams({
          urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
          setPanToArea,
          discoverAreas: [area],
          areaGroupsData: { groups: [group] },
          summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 5 }],
          regionScopedGroups: undefined,
        });
        renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });

        // Review fix (#1910 PR2) — regionScopedGroups undefined previously
        // fell back to the legacy region_key filter (Resolution A) and
        // committed a pan built from data the panel/map do NOT trust for
        // this exact reason. The camera now shares the same query-state
        // contract as the panel and map: pending or error → no camera
        // commitment at all, only a genuine success ever pans.
        expect(setPanToArea).not.toHaveBeenCalled();
      });

      it('code-review fix-up: waits for regionScopedGroups to finish loading on a deep link instead of one-shot-firing the Resolution-A fallback and then never re-panning to Resolution B', () => {
        // Reproduces the race the code-reviewer flagged: areasLoading/
        // isLoadingAreaGroups (the discoverAreas/areaGroupsData fetches) can
        // settle to false BEFORE the independent regionScopedGroups query
        // resolves, e.g. on a page load that lands with a region scope
        // already in the URL (deep link). Before the fix, the effect fired
        // once with regionScopedGroups===undefined, panned using the
        // incomplete Resolution-A fallback, and advanced prevScopeRef —
        // so when regionScopedGroups later arrived (urlState.scope
        // unchanged), the effect bailed at the scopeChanged guard and NEVER
        // re-panned to the correct Resolution-B bounds.
        const setPanToArea = vi.fn();
        // Unscoped group: plurality region is 'south', with an area OUTSIDE
        // the 'north' region scope — Resolution A would incorrectly include it.
        const spanningGroup = makeGroup({
          id: 'spanning-group',
          area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|OutOfScope'],
          region_key: 'south',
        });
        const northArea = makeArea({ areaKey: 'IN|KA|Udupi|Manipal' });
        const outOfScopeArea = makeArea({
          areaKey: 'IN|KA|Udupi|OutOfScope',
          geo_center_lat: 20.0,
          geo_center_lon: 80.0,
          bbox: [[19.9, 79.9], [20.1, 80.1]],
        });
        // Resolution B projection: ONLY the 'north'-scoped subset (Manipal).
        const projection = makeRegionScopedGroup({
          groupSlug: 'spanning-group',
          scopingRegionKey: 'north',
          areaKeys: ['IN|KA|Udupi|Manipal'],
        });

        // Deep-link mount: region scope already in the URL, areas/groups have
        // loaded (areasLoading/isLoadingAreaGroups=false), but the
        // regionScopedGroups projection is still in flight.
        const loadingParams = makeParams({
          urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
          setPanToArea,
          discoverAreas: [northArea, outOfScopeArea],
          areaGroupsData: { groups: [spanningGroup] },
          summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 5 }],
          regionScopedGroups: undefined,
          isLoadingRegionScopedGroups: true,
        });
        const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
          initialProps: loadingParams,
        });

        // Must NOT pan yet using the incomplete Resolution-A fallback.
        expect(setPanToArea).not.toHaveBeenCalled();

        // The projection arrives: isLoadingRegionScopedGroups=false,
        // regionScopedGroups populated. urlState.scope is UNCHANGED.
        rerender({
          ...loadingParams,
          regionScopedGroups: [projection],
          isLoadingRegionScopedGroups: false,
        });

        // Must now pan, using Resolution-B bounds (Manipal only).
        expect(setPanToArea).toHaveBeenCalledTimes(1);
        const bounds = setPanToArea.mock.calls[0][0];
        expect(bounds.bbox).toEqual([[13.34, 74.78], [13.36, 74.8]]);
      });

      it('error → retry → success: a genuine fetch FAILURE (not just pending) never commits a pan, and a subsequent successful retry still pans correctly (Issue #1910 PR2 review fix, Finding 3)', () => {
        // Reproduces the second half of the bug the reviewer flagged: the
        // OLD gate (`isLoadingRegionScopedGroups`) only covered the PENDING
        // state. Once a fetch genuinely FAILS, isLoadingRegionScopedGroups
        // settles back to false (React Query does not stay "loading" on
        // error) while regionScopedGroups remains undefined — the old code
        // fell through, panned using the untrusted Resolution-A fallback,
        // and advanced prevScopeRef.current on that wrong pan. Because
        // urlState.scope never changes again for the rest of the page load,
        // the effect would then bail at the `!scopeChanged` guard forever —
        // even after the user retried and the fetch succeeded, the camera
        // never re-panned to the correct Resolution-B bounds.
        const setPanToArea = vi.fn();
        const spanningGroup = makeGroup({
          id: 'spanning-group',
          area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|OutOfScope'],
          region_key: 'south',
        });
        const northArea = makeArea({ areaKey: 'IN|KA|Udupi|Manipal' });
        const outOfScopeArea = makeArea({
          areaKey: 'IN|KA|Udupi|OutOfScope',
          geo_center_lat: 20.0,
          geo_center_lon: 80.0,
          bbox: [[19.9, 79.9], [20.1, 80.1]],
        });
        const projection = makeRegionScopedGroup({
          groupSlug: 'spanning-group',
          scopingRegionKey: 'north',
          areaKeys: ['IN|KA|Udupi|Manipal'],
        });

        const baseScopeParams = makeParams({
          urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
          setPanToArea,
          discoverAreas: [northArea, outOfScopeArea],
          areaGroupsData: { groups: [spanningGroup] },
          summaryRegions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 5 }],
        });

        // 1) Pending: first mount, fetch in flight.
        const { rerender } = renderHook((p) => useDiscoverCameraOrchestration(p), {
          initialProps: { ...baseScopeParams, regionScopedGroups: undefined, isLoadingRegionScopedGroups: true },
        });
        expect(setPanToArea).not.toHaveBeenCalled();

        // 2) Error: the fetch has settled with a genuine failure —
        // isLoadingRegionScopedGroups is now false, but regionScopedGroups
        // is STILL undefined (never populated on error). Must still NOT pan.
        rerender({ ...baseScopeParams, regionScopedGroups: undefined, isLoadingRegionScopedGroups: false });
        expect(setPanToArea).not.toHaveBeenCalled();

        // 3) Retry in flight: user clicks "Try again", refetch() starts.
        rerender({ ...baseScopeParams, regionScopedGroups: undefined, isLoadingRegionScopedGroups: true });
        expect(setPanToArea).not.toHaveBeenCalled();

        // 4) Retry succeeds: regionScopedGroups is now a real (defined)
        // array. urlState.scope is STILL UNCHANGED throughout — this is
        // exactly the scenario the old `scopeChanged` one-shot guard broke.
        rerender({ ...baseScopeParams, regionScopedGroups: [projection], isLoadingRegionScopedGroups: false });

        expect(setPanToArea).toHaveBeenCalledTimes(1);
        const bounds = setPanToArea.mock.calls[0][0];
        // Resolution-B bounds (Manipal only) — never the out-of-scope area
        // the untrusted Resolution-A fallback would have pulled in.
        expect(bounds.bbox).toEqual([[13.34, 74.78], [13.36, 74.8]]);
      });

      it('a caller-supplied scopeNamespaces prop is honored over the internal fallback derivation', () => {
        const setPanToArea = vi.fn();
        const group = makeGroup({ id: 'weirdly-named', name: 'Weirdly Named Group', area_keys: ['IN|KA|Udupi|Manipal'] });
        const area = makeArea();
        const projection = makeRegionScopedGroup({
          groupSlug: 'weirdly-named',
          scopingRegionKey: 'north',
          areaKeys: ['IN|KA|Udupi|Manipal'],
        });
        const params = makeParams({
          urlState: { journey: null, radiusKm: null, groupId: null, areaKey: null, scope: 'north', selectedLocality: null },
          setPanToArea,
          discoverAreas: [area],
          areaGroupsData: { groups: [group] },
          regionScopedGroups: [projection],
          scopeNamespaces: {
            regionKeys: new Set(['north']),
            groupSlugs: new Set(['weirdly-named']),
          },
        });
        renderHook((p) => useDiscoverCameraOrchestration(p), { initialProps: params });
        expect(setPanToArea).toHaveBeenCalledTimes(1);
      });
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
