import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverJourneyPredicates,
  type UseDiscoverJourneyPredicatesParams,
} from './useDiscoverJourneyPredicates';

function makeParams(
  overrides: Partial<UseDiscoverJourneyPredicatesParams> = {},
): UseDiscoverJourneyPredicatesParams {
  return {
    resolvedPanelContent: 'area-groups-landing',
    focusedGroup: null,
    selectedArea: null,
    selectedSchool: null,
    discoverAreas: [
      { areaKey: 'IN|KA|Udupi|Manipal', listingCount: 3 } as UseDiscoverJourneyPredicatesParams['discoverAreas'][number],
      { areaKey: 'IN|KA|Udupi|Udupi', listingCount: 0 } as UseDiscoverJourneyPredicatesParams['discoverAreas'][number],
    ],
    areasLoading: false,
    cityTotal: 3,
    urlState: {
      city: 'udupi',
      areaKey: null,
      viewport: null,
      filters: {},
      schoolId: null,
      radiusKm: null,
      q: '',
      journey: 'area-first',
      groupId: null,
      selectedRegion: null,
      selectedMaxKm: null,
      selectedGroup: null,
      selectedListing: null,
      selectedLocality: null,
    } as unknown as UseDiscoverJourneyPredicatesParams['urlState'],
    isAgriJourney: false,
    mapZoom: 11,
    ...overrides,
  };
}

describe('useDiscoverJourneyPredicates', () => {
  // ── isAreaFirstCityLanding ─────────────────────────────────────────────
  it('isAreaFirstCityLanding: true at area-groups-landing with no group/area', () => {
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams()));
    expect(result.current.isAreaFirstCityLanding).toBe(true);
  });

  it('isAreaFirstCityLanding: false when focusedGroup is set', () => {
    const focusedGroup = { area_keys: ['IN|KA|Udupi|Manipal'] } as UseDiscoverJourneyPredicatesParams['focusedGroup'];
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams({ focusedGroup })));
    expect(result.current.isAreaFirstCityLanding).toBe(false);
  });

  it('isAreaFirstCityLanding: false when selectedArea is set', () => {
    const selectedArea = { areaKey: 'IN|KA|Udupi|Manipal' } as UseDiscoverJourneyPredicatesParams['selectedArea'];
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams({ selectedArea })));
    expect(result.current.isAreaFirstCityLanding).toBe(false);
  });

  // ── cityHasNoListings ──────────────────────────────────────────────────
  it('cityHasNoListings: true when not loading and cityTotal is 0', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(makeParams({ areasLoading: false, cityTotal: 0 })),
    );
    expect(result.current.cityHasNoListings).toBe(true);
  });

  it('cityHasNoListings: false while areasLoading (even with cityTotal 0)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(makeParams({ areasLoading: true, cityTotal: 0 })),
    );
    expect(result.current.cityHasNoListings).toBe(false);
  });

  // ── isTopGroupedAreaOrSchool ───────────────────────────────────────────
  it('isTopGroupedAreaOrSchool: true for area-first top (no drill-down)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(makeParams({ urlState: { ...makeParams().urlState, journey: 'area-first' } })),
    );
    expect(result.current.isTopGroupedAreaOrSchool).toBe(true);
  });

  it('isTopGroupedAreaOrSchool: true for school-first top (no drill-down)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(
        makeParams({ urlState: { ...makeParams().urlState, journey: 'school-first' } }),
      ),
    );
    expect(result.current.isTopGroupedAreaOrSchool).toBe(true);
  });

  it('isTopGroupedAreaOrSchool: false once groupId is set', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(
        makeParams({ urlState: { ...makeParams().urlState, journey: 'area-first', groupId: 'manipal-group' } }),
      ),
    );
    expect(result.current.isTopGroupedAreaOrSchool).toBe(false);
  });

  it('isTopGroupedAreaOrSchool: false once selectedArea is set', () => {
    const selectedArea = { areaKey: 'IN|KA|Udupi|Manipal' } as UseDiscoverJourneyPredicatesParams['selectedArea'];
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams({ selectedArea })));
    expect(result.current.isTopGroupedAreaOrSchool).toBe(false);
  });

  it('isTopGroupedAreaOrSchool: false once selectedSchool is set', () => {
    const selectedSchool = { id: 's1' } as UseDiscoverJourneyPredicatesParams['selectedSchool'];
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams({ selectedSchool })));
    expect(result.current.isTopGroupedAreaOrSchool).toBe(false);
  });

  // ── isTopGroupedAgri ───────────────────────────────────────────────────
  it('isTopGroupedAgri: true for agri-first top (no region/drill-down)', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(
        makeParams({ isAgriJourney: true, urlState: { ...makeParams().urlState, journey: 'agri-first' } }),
      ),
    );
    expect(result.current.isTopGroupedAgri).toBe(true);
  });

  it('isTopGroupedAgri: false once selectedRegion is set', () => {
    const { result } = renderHook(() =>
      useDiscoverJourneyPredicates(
        makeParams({
          isAgriJourney: true,
          urlState: { ...makeParams().urlState, journey: 'agri-first', selectedRegion: 'NW' },
        }),
      ),
    );
    expect(result.current.isTopGroupedAgri).toBe(false);
  });

  // ── liveAreas ──────────────────────────────────────────────────────────
  it('liveAreas: filters to listingCount > 0 only', () => {
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams()));
    expect(result.current.liveAreas).toEqual([
      { areaKey: 'IN|KA|Udupi|Manipal', listingCount: 3 },
    ]);
  });

  // ── mapLayerCategory / mapLayerKind ────────────────────────────────────
  it('mapLayerCategory: always the overview bucket regardless of zoom', () => {
    const low = renderHook(() => useDiscoverJourneyPredicates(makeParams({ mapZoom: 5 })));
    const high = renderHook(() => useDiscoverJourneyPredicates(makeParams({ mapZoom: 20 })));
    expect(low.result.current.mapLayerCategory).toBe(high.result.current.mapLayerCategory);
  });

  it('mapLayerKind: at zoom === AREA_LAYER_MAX_ZOOM (12) resolves to the overview bucket, not zoom-gated', () => {
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams({ mapZoom: 12 })));
    expect(result.current.mapLayerKind).not.toBe('zoom-gated');
  });

  it('mapLayerKind: one zoom level above AREA_LAYER_MAX_ZOOM (13) resolves to zoom-gated (strict >)', () => {
    const { result } = renderHook(() => useDiscoverJourneyPredicates(makeParams({ mapZoom: 13 })));
    expect(result.current.mapLayerKind).toBe('zoom-gated');
  });

  // ── AC-LIVEAREAS-NONMEMO ───────────────────────────────────────────────
  it('liveAreas: a fresh array reference on every no-op rerender (never memoized)', () => {
    const params = makeParams();
    const { result, rerender } = renderHook(
      (p: UseDiscoverJourneyPredicatesParams) => useDiscoverJourneyPredicates(p),
      { initialProps: params },
    );
    const first = result.current.liveAreas;
    rerender(params);
    expect(result.current.liveAreas).not.toBe(first);
    expect(result.current.liveAreas).toEqual(first);
  });

  it('liveAreas: positive control — recomputes correctly when discoverAreas changes', () => {
    const params = makeParams();
    const { result, rerender } = renderHook(
      (p: UseDiscoverJourneyPredicatesParams) => useDiscoverJourneyPredicates(p),
      { initialProps: params },
    );
    expect(result.current.liveAreas).toHaveLength(1);
    rerender({
      ...params,
      discoverAreas: [
        ...params.discoverAreas,
        { areaKey: 'IN|KA|Udupi|Malpe', listingCount: 2 } as UseDiscoverJourneyPredicatesParams['discoverAreas'][number],
      ],
    });
    expect(result.current.liveAreas).toHaveLength(2);
  });

  // ── AC-BADGE-FORK-GUARD ────────────────────────────────────────────────
  it('import-guard: never imports the S8 badge-fork modules', () => {
    const modulePath = join(
      process.cwd(),
      'src/features/discover/presentation/useDiscoverJourneyPredicates.ts',
    );
    const source = readFileSync(modulePath, 'utf-8');
    expect(source).not.toContain('formatDiscoverBadgeCopy');
    expect(source).not.toContain('deriveSchoolRadiusPillNoun');
    expect(source).not.toContain('hasActiveAnonPropertyFilter');
  });
});
