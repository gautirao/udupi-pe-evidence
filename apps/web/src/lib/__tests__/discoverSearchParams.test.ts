import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks for parity test ──────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

import { buildDiscoverSearchParams } from '../discoverSearchParams';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { PropertyFilters } from '@/hooks/usePropertyListings';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('discoverSearchParams — serializer unit tests', () => {
  it('serialises basic city + pagination params', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: {},
      page: 1,
      size: 25,
    });
    expect(params.get('city')).toBe('udupi');
    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('25');
    expect(params.has('includeAggregates')).toBe(false);
  });

  it('serialises areaKeys filter', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: {},
      sortedAreaKeys: ['IN|KA|Udupi|Karkala', 'IN|KA|Udupi|Manipal'],
    });
    expect(params.getAll('areaKeys')).toEqual([
      'IN|KA|Udupi|Karkala',
      'IN|KA|Udupi|Manipal',
    ]);
  });

  it('serialises propertyTypes', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: { propertyTypes: ['house', 'apartment'] },
    });
    expect(params.getAll('propertyTypes')).toEqual(['house', 'apartment']);
  });

  it('serialises price and bedrooms', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: {
        priceMin: 1000000,
        priceMax: 3000000,
        bedrooms: [2, 3],
      },
    });
    expect(params.get('priceMin')).toBe('1000000');
    expect(params.get('priceMax')).toBe('3000000');
    expect(params.getAll('bedrooms')).toEqual(['2', '3']);
  });

  it('serialises snapped bbox', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: {},
      snapped: [13.34, 74.74, 13.36, 74.76],
    });
    expect(params.get('bbox')).toBe('13.34,74.74,13.36,74.76');
  });

  it('serialises polygon coordinates', () => {
    const polygon: [number, number][] = [
      [13.3, 74.7],
      [13.4, 74.8],
      [13.3, 74.8],
    ];
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: { polygon },
    });
    expect(JSON.parse(params.get('polygon')!)).toEqual(polygon);
  });

  it('serialises listingPurpose / intent', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: {},
      listingPurpose: 'rent',
    });
    expect(params.get('listingPurpose')).toBe('rent');
  });

  it('serialises school proximity fields', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: { schoolLat: 13.0, schoolLon: 74.0, schoolRadiusKm: 3 },
    });
    expect(params.get('schoolLat')).toBe('13');
    expect(params.get('schoolLon')).toBe('74');
    expect(params.get('schoolRadiusKm')).toBe('3');
  });

  // Issue #2767 — Area+School scoping travels as the canonical `schoolAreaKey` (server derives
  // the bounds); never as client coordinates (`areaBbox`) or a synthetic `polygon`.
  it('#2767 serialises schoolAreaKey as the exact literal and emits neither areaBbox nor polygon', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: {
        schoolAreaKey: 'IN|KA|Udupi|Kunjibettu',
        schoolLat: 13.33,
        schoolLon: 74.76,
        schoolRadiusKm: 3,
      },
    });
    expect(params.get('schoolAreaKey')).toBe('IN|KA|Udupi|Kunjibettu');
    expect(params.toString()).toContain('schoolAreaKey=IN%7CKA%7CUdupi%7CKunjibettu');
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
    expect(params.get('schoolRadiusKm')).toBe('3');
  });

  it('#2767 a real drawn polygon still serialises as polygon (unchanged) and emits no schoolAreaKey or areaBbox', () => {
    const polygon: [number, number][] = [
      [13.3, 74.7],
      [13.4, 74.8],
      [13.3, 74.8],
    ];
    const params = buildDiscoverSearchParams({ city: 'udupi', filters: { polygon } });
    expect(params.get('polygon')).toBe(JSON.stringify(polygon));
    expect(params.has('schoolAreaKey')).toBe(false);
    expect(params.has('areaBbox')).toBe(false);
  });

  it('#2767 no schoolAreaKey filter -> no schoolAreaKey and no areaBbox param', () => {
    const params = buildDiscoverSearchParams({
      city: 'udupi',
      filters: { schoolLat: 13, schoolLon: 74, schoolRadiusKm: 3 },
    });
    expect(params.has('schoolAreaKey')).toBe(false);
    expect(params.has('areaBbox')).toBe(false);
  });
});

describe('discoverSearchParams — #2767 schoolAreaKey reaches both discover endpoints', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({});
  });
  // Leave no recorded calls behind: the parity block below indexes mockGet.mock.calls[0]/[1].
  afterEach(() => {
    mockGet.mockReset();
  });

  const filters: PropertyFilters = {
    schoolAreaKey: 'IN|KA|Udupi|Kunjibettu',
    schoolLat: 13.33,
    schoolLon: 74.76,
    schoolRadiusKm: 3,
  };

  it('/api/discover/listings request carries schoolAreaKey and neither areaBbox nor polygon', async () => {
    const { result } = renderHook(
      () => useDiscoverListings({ city: 'udupi', page: 0, filters, enabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string];
    expect(url.startsWith('/api/discover/listings')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('schoolAreaKey')).toBe('IN|KA|Udupi|Kunjibettu');
    expect(url).toContain('schoolAreaKey=IN%7CKA%7CUdupi%7CKunjibettu');
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
    expect(params.get('schoolRadiusKm')).toBe('3');
  });

  it('/api/discover/markers request carries schoolAreaKey and neither areaBbox nor polygon', async () => {
    const { result } = renderHook(
      () => useDiscoverFilteredMarkers('udupi', filters, true, null, '', undefined, undefined, { kind: 'city' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = mockGet.mock.calls[0] as [string];
    expect(url.startsWith('/api/discover/markers')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('schoolAreaKey')).toBe('IN|KA|Udupi|Kunjibettu');
    expect(url).toContain('schoolAreaKey=IN%7CKA%7CUdupi%7CKunjibettu');
    expect(params.has('areaBbox')).toBe(false);
    expect(params.has('polygon')).toBe(false);
  });
});

describe('discoverSearchParams — parity test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('proves listing and marker hooks use aligned serialization for overlapping filters', () => {
    let listingUrlParams: URLSearchParams;
    let markerUrlParams: URLSearchParams;

    const overlappingKeys = [
      'city',
      'bbox',
      'areaKeys',
      'propertyTypes',
      'localities',
      'priceMin',
      'priceMax',
      'dateFrom',
      'dateTo',
      'bedrooms',
      'sellerTypes',
      'backOnMarket',
      'newToMarket',
      'reraRegistered',
      'readyToMove',
      'polygon',
      'schoolAreaKey',
      'schoolLat',
      'schoolLon',
      'schoolRadiusKm',
      'q',
      'listingPurpose',
      'commercialSubtypes',
    ];

    beforeAll(async () => {
      mockGet.mockResolvedValue({});

      const commonFilters: PropertyFilters = {
        propertyTypes: ['house', 'villa'] as any,
        localities: ['Manipal'],
        priceMin: 500000,
        priceMax: 1500000,
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-06-01T00:00:00Z'),
        bedrooms: [2, 4],
        sellerTypes: ['OWNER'] as any,
        backOnMarket: true,
        newToMarket: true,
        reraRegistered: true,
        readyToMove: true,
        polygon: [[13.3, 74.7], [13.4, 74.8]] as [number, number][],
        schoolAreaKey: 'IN|KA|Udupi|Manipal',
        schoolLat: 13.34,
        schoolLon: 74.74,
        schoolRadiusKm: 5,
        commercialSubtypes: ['SHOP', 'OFFICE'] as ['SHOP', 'OFFICE'],
      };

      const bbox: [number, number, number, number] = [13.341, 74.741, 13.359, 74.759];
      const q = '   luxury villa   ';
      const listingPurpose = 'sale';
      const areaKeys = ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'];

      // 1. Render useDiscoverListings
      const { result: listingResult } = renderHook(
        () =>
          useDiscoverListings({
            city: 'udupi',
            page: 0,
            filters: commonFilters,
            enabled: true,
            bbox,
            q,
            listingPurpose,
            areaKeys,
          }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(listingResult.current.isSuccess).toBe(true));

      // 2. Render useDiscoverFilteredMarkers
      const { result: markerResult } = renderHook(
        () =>
          useDiscoverFilteredMarkers(
            'udupi',
            commonFilters,
            true,
            bbox,
            q,
            listingPurpose,
            undefined, // excludePropertyType
            { kind: 'areas', areaKeys }, // scope
          ),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(markerResult.current.isSuccess).toBe(true));

      // Extract search query parameters from the api calls
      const [listingCall] = mockGet.mock.calls[0] as [string, unknown];
      const [markerCall] = mockGet.mock.calls[1] as [string, unknown];

      listingUrlParams = new URLSearchParams(listingCall.split('?')[1]);
      markerUrlParams = new URLSearchParams(markerCall.split('?')[1]);
    });

    it('guard against vacuous parity assertion', () => {
      // Guard against a vacuous parity assertion: if the builder silently dropped
      // commercialSubtypes, both sides would be empty and the loop below would still pass.
      expect(listingUrlParams.getAll('commercialSubtypes')).toEqual(['SHOP', 'OFFICE']);
      // Same guard for schoolAreaKey: an unset fixture would make its parity row pass on [] === [].
      expect(listingUrlParams.getAll('schoolAreaKey')).toEqual(['IN|KA|Udupi|Manipal']);
      // `areaBbox` is no longer a wire param at all (#2767 trust boundary): assert NEITHER
      // endpoint emits it, rather than keeping a vacuous [] === [] parity row for it.
      expect(listingUrlParams.has('areaBbox')).toBe(false);
      expect(markerUrlParams.has('areaBbox')).toBe(false);
    });

    it.each(overlappingKeys)('proves serialization parity for key: %s', (key) => {
      expect(listingUrlParams.getAll(key)).toEqual(markerUrlParams.getAll(key));
    });
  });
});
