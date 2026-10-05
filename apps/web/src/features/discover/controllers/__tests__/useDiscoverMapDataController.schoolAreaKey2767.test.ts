/**
 * Issue #2767 — the combined Area + School state must scope the listings/markers
 * request with the canonical Area key (`schoolAreaKey`) and NOTHING else: no client
 * coordinates (`areaBbox`) and no synthesised `polygon`. The server derives the Area's
 * bounds from the key (trust boundary: the client is not the authority for the rectangle).
 *
 * Only `useDiscoverMapData`, `useDiscoverSource` and `useDiscoverShell` are mocked; the
 * `effectiveFilters` injection under test is the REAL production code, and the wire
 * serialisation is the REAL `buildDiscoverSearchParams`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

const mocks = vi.hoisted(() => ({
  useDiscoverMapData: vi.fn(),
  shell: {
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
  },
}));

vi.mock('@/hooks/useDiscoverMapData', () => ({
  useDiscoverMapData: mocks.useDiscoverMapData,
}));
vi.mock('@/features/discover/state/DiscoverDataSourceContext', () => ({
  useDiscoverSource: () => ({ mode: 'live' }),
}));
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverShell: () => mocks.shell,
}));

import { useDiscoverMapDataController } from '../useDiscoverMapDataController';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';

const KUNJIBETTU_KEY = 'IN|KA|Udupi|Kunjibettu';
// URLSearchParams encodes `|` as %7C.
const KUNJIBETTU_WIRE = 'schoolAreaKey=IN%7CKA%7CUdupi%7CKunjibettu';

const KUNJIBETTU = {
  areaKey: KUNJIBETTU_KEY,
  // [[south, west], [north, east]]
  bbox: [
    [13.3, 74.74],
    [13.36, 74.8],
  ],
} as unknown as AreaPoint;

const KUNJIBETTU_NO_BBOX = {
  areaKey: KUNJIBETTU_KEY,
  bbox: null,
} as unknown as AreaPoint;

const DRAWN_POLYGON: [number, number][] = [
  [13.31, 74.75],
  [13.31, 74.78],
  [13.34, 74.78],
  [13.31, 74.75],
];

const SCHOOL_FILTERS: PropertyFilters = {
  schoolLat: 13.33,
  schoolLon: 74.76,
  schoolRadiusKm: 3,
};

function render(opts: {
  schoolId: string | null;
  area: AreaPoint | null;
  filters: PropertyFilters;
}) {
  const nav = {
    journey: 'school-first',
    schoolId: opts.schoolId,
    groupId: null,
    areaKey: opts.area ? opts.area.areaKey : null,
    nodeListings: false,
    resultScope: { active: null },
  } as unknown as DiscoverNavContextValue;

  return renderHook(() =>
    useDiscoverMapDataController({
      nav,
      city: 'udupi',
      effectiveSelectedArea: opts.area,
      legacySelectedArea: opts.area,
      filters: opts.filters,
      selectedSchool: null,
      debouncedSearch: '',
      isAuthenticated: true,
      fitTick: 0,
      groupAreaKeysForMapData: undefined,
      areasNavigationJourney: { node: null } as unknown as UseAreasNavigationJourneyResult,
      boundedSearchTriggered: true,
      mapZoom: 14,
      mapReady: true,
      page: 1,
      mapBbox: null,
      intentListingPurpose: 'buy',
      authLoading: false,
      setShowLoader: vi.fn(),
    }),
  ).result.current;
}

describe('useDiscoverMapDataController — Area+School scoping sends schoolAreaKey, never coordinates (#2767)', () => {
  beforeEach(() => {
    mocks.useDiscoverMapData.mockReset();
    mocks.useDiscoverMapData.mockReturnValue({
      discoverAreasData: undefined,
      publishRecenterCameraIntent: vi.fn(),
      areasLoading: false,
      listingDataLoading: false,
      markersLoading: false,
    });
  });

  it('School + Area: injects the canonical schoolAreaKey and NO polygon, on the object handed to the query hook', () => {
    const result = render({ schoolId: 'school-1', area: KUNJIBETTU, filters: SCHOOL_FILTERS });

    expect(result.effectiveFilters.schoolAreaKey).toBe(KUNJIBETTU_KEY);
    expect(result.effectiveFilters.polygon).toBeUndefined();
    expect('areaBbox' in result.effectiveFilters).toBe(false);

    const passed = mocks.useDiscoverMapData.mock.calls[0][0].filters as PropertyFilters;
    expect(passed.schoolAreaKey).toBe(KUNJIBETTU_KEY);
    expect(passed.polygon).toBeUndefined();
  });

  it('School + Area: the wire request carries the full-literal schoolAreaKey, school params, and neither areaBbox nor polygon', () => {
    const result = render({ schoolId: 'school-1', area: KUNJIBETTU, filters: SCHOOL_FILTERS });
    const params = buildDiscoverSearchParams({ city: 'udupi', filters: result.effectiveFilters });

    expect(params.get('schoolAreaKey')).toBe('IN|KA|Udupi|Kunjibettu');
    expect(params.toString()).toContain(KUNJIBETTU_WIRE);
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
    expect(params.get('schoolLat')).toBe('13.33');
    expect(params.get('schoolLon')).toBe('74.76');
    expect(params.get('schoolRadiusKm')).toBe('3');
  });

  it('School + Area + a real user-drawn polygon: the drawn polygon is sent as polygon, NOT converted, no schoolAreaKey added', () => {
    const result = render({
      schoolId: 'school-1',
      area: KUNJIBETTU,
      filters: { ...SCHOOL_FILTERS, polygon: DRAWN_POLYGON },
    });

    expect(result.effectiveFilters.polygon).toEqual(DRAWN_POLYGON);
    expect(result.effectiveFilters.schoolAreaKey).toBeUndefined();

    const params = buildDiscoverSearchParams({ city: 'udupi', filters: result.effectiveFilters });
    expect(params.get('polygon')).toBe(JSON.stringify(DRAWN_POLYGON));
    expect(params.has('schoolAreaKey')).toBe(false);
    expect(params.has('areaBbox')).toBe(false);
  });

  it('School + Area: a stale schoolAreaKey already on filters never overrides the currently selected Area', () => {
    const result = render({
      schoolId: 'school-1',
      area: KUNJIBETTU,
      filters: { ...SCHOOL_FILTERS, schoolAreaKey: 'IN|KA|Udupi|StaleArea' },
    });

    expect(result.effectiveFilters.schoolAreaKey).toBe(KUNJIBETTU_KEY);
  });

  it('Area selected, client bbox absent: still emits schoolAreaKey (server owns bounds), no areaBbox, no polygon', () => {
    const result = render({ schoolId: 'school-1', area: KUNJIBETTU_NO_BBOX, filters: SCHOOL_FILTERS });

    expect(result.effectiveFilters.schoolAreaKey).toBe('IN|KA|Udupi|Kunjibettu');
    expect(result.effectiveFilters.polygon).toBeUndefined();
    expect('areaBbox' in result.effectiveFilters).toBe(false);

    const params = buildDiscoverSearchParams({ city: 'udupi', filters: result.effectiveFilters });
    expect(params.get('schoolAreaKey')).toBe('IN|KA|Udupi|Kunjibettu');
    expect(params.toString()).toContain(KUNJIBETTU_WIRE);
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
  });

  it('School only (no area): no schoolAreaKey, no areaBbox and no polygon', () => {
    const result = render({ schoolId: 'school-1', area: null, filters: SCHOOL_FILTERS });

    expect(result.effectiveFilters).toBe(SCHOOL_FILTERS);
    expect(result.effectiveFilters.schoolAreaKey).toBeUndefined();
    expect(result.effectiveFilters.polygon).toBeUndefined();

    const params = buildDiscoverSearchParams({ city: 'udupi', filters: result.effectiveFilters });
    expect(params.has('schoolAreaKey')).toBe(false);
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
  });

  it('Area only (no school): filters pass through unchanged (same reference), no schoolAreaKey, no areaBbox, no polygon', () => {
    const filters: PropertyFilters = { priceMin: 1000000 };
    const result = render({ schoolId: null, area: KUNJIBETTU, filters });

    expect(result.effectiveFilters).toBe(filters);
    expect(result.effectiveFilters.schoolAreaKey).toBeUndefined();
    expect(result.effectiveFilters.polygon).toBeUndefined();

    const params = buildDiscoverSearchParams({ city: 'udupi', filters: result.effectiveFilters });
    expect(params.has('schoolAreaKey')).toBe(false);
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
  });
});
