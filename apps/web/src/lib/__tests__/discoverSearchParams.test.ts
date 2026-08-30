import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});

describe('discoverSearchParams — parity test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('proves listing and marker hooks use aligned serialization for overlapping filters', async () => {
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
      schoolLat: 13.34,
      schoolLon: 74.74,
      schoolRadiusKm: 5,
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
          areaKeys,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(markerResult.current.isSuccess).toBe(true));

    // Retrieve URLs requested from mockGet calls
    expect(mockGet).toHaveBeenCalledTimes(2);

    const [listingCall] = mockGet.mock.calls[0] as [string, unknown];
    const [markerCall] = mockGet.mock.calls[1] as [string, unknown];

    // Extract search query parameters from the api calls
    const listingUrlParams = new URLSearchParams(listingCall.split('?')[1]);
    const markerUrlParams = new URLSearchParams(markerCall.split('?')[1]);

    // Overlapping keys to assert exact matching
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
      'schoolLat',
      'schoolLon',
      'schoolRadiusKm',
      'q',
      'listingPurpose',
    ];

    // Assert parity
    for (const key of overlappingKeys) {
      expect(listingUrlParams.getAll(key)).toEqual(markerUrlParams.getAll(key));
    }
  });
});
