import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredAgriListings, type UseFilteredAgriListingsParams } from './useFilteredAgriListings';
import type { AgriMapListingItem, AgriMapListingsResponse } from '@/hooks/useAgriMapListings';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

function makeListing(overrides: Partial<AgriMapListingItem> = {}): AgriMapListingItem {
  return {
    id: 'agri-1',
    areaKey: 'IN|KA|Udupi|Manipal',
    latitude: 13.35,
    longitude: 74.79,
    propertyType: 'agricultural_land',
    computedAreaAcres: 2,
    pricePaise: 10000000,
    landCategory: 'FARMLAND',
    farmhouseAvailable: false,
    fencingDone: true,
    waterSource: 'BOREWELL',
    ...overrides,
  };
}

const EMPTY_FILTERS = {} as DiscoverUrlState['filters'];

function makeParams(overrides: Partial<UseFilteredAgriListingsParams> = {}): UseFilteredAgriListingsParams {
  return {
    agriMapListingsData: { city: 'udupi', listings: [makeListing()], truncated: false, limit: 250 },
    filters: EMPTY_FILTERS,
    isAuthenticated: false,
    ...overrides,
  };
}

describe('useFilteredAgriListings', () => {
  it('returns null when agriMapListingsData.listings is absent', () => {
    const { result } = renderHook(() =>
      useFilteredAgriListings(makeParams({ agriMapListingsData: undefined })),
    );
    expect(result.current).toBeNull();
  });

  it('returns all listings when no filters are active', () => {
    const { result } = renderHook(() => useFilteredAgriListings(makeParams()));
    expect(result.current).toHaveLength(1);
  });

  it('excludes listings with null computedAreaAcres when an acreage filter is active', () => {
    const data: AgriMapListingsResponse = {
      city: 'udupi',
      listings: [makeListing({ id: 'a1', computedAreaAcres: null }), makeListing({ id: 'a2', computedAreaAcres: 3 })],
      truncated: false,
      limit: 250,
    };
    const { result } = renderHook(() =>
      useFilteredAgriListings(
        makeParams({ agriMapListingsData: data, filters: { ...EMPTY_FILTERS, agriAcresMin: 1 } }),
      ),
    );
    expect(result.current?.map((l) => l.id)).toEqual(['a2']);
  });

  it('applies the price filter only when isAuthenticated=true', () => {
    const data: AgriMapListingsResponse = {
      city: 'udupi',
      listings: [makeListing({ id: 'cheap', pricePaise: 1000 }), makeListing({ id: 'expensive', pricePaise: 100000000 })],
      truncated: false,
      limit: 250,
    };
    const filters = { ...EMPTY_FILTERS, agriPriceMin: 10 }; // 10 rupees = 1000 paise

    const anon = renderHook(() =>
      useFilteredAgriListings(makeParams({ agriMapListingsData: data, filters, isAuthenticated: false })),
    );
    // Anon: price filter not applied — both listings pass through.
    expect(anon.result.current?.map((l) => l.id)).toEqual(['cheap', 'expensive']);

    const authed = renderHook(() =>
      useFilteredAgriListings(makeParams({ agriMapListingsData: data, filters, isAuthenticated: true })),
    );
    // Authed: agriPriceMin=10 rupees -> 1000 paise; 'cheap' (1000 paise) passes (>=), 'expensive' passes too.
    expect(authed.result.current?.map((l) => l.id)).toEqual(['cheap', 'expensive']);
  });

  it('applies the categorical land-category filter (exact match)', () => {
    const data: AgriMapListingsResponse = {
      city: 'udupi',
      listings: [makeListing({ id: 'farm', landCategory: 'FARMLAND' }), makeListing({ id: 'plot', landCategory: 'FARM_PLOT' })],
      truncated: false,
      limit: 250,
    };
    const { result } = renderHook(() =>
      useFilteredAgriListings(
        makeParams({ agriMapListingsData: data, filters: { ...EMPTY_FILTERS, agriLandCategory: 'FARMLAND' } }),
      ),
    );
    expect(result.current?.map((l) => l.id)).toEqual(['farm']);
  });

  it('applies the boolean tri-state farmhouseAvailable filter (null listing field excluded on exact inequality only)', () => {
    const data: AgriMapListingsResponse = {
      city: 'udupi',
      listings: [
        makeListing({ id: 'yes', farmhouseAvailable: true }),
        makeListing({ id: 'no', farmhouseAvailable: false }),
        makeListing({ id: 'unknown', farmhouseAvailable: null }),
      ],
      truncated: false,
      limit: 250,
    };
    const { result } = renderHook(() =>
      useFilteredAgriListings(
        makeParams({ agriMapListingsData: data, filters: { ...EMPTY_FILTERS, agriFarmhouseAvailable: true } }),
      ),
    );
    expect(result.current?.map((l) => l.id)).toEqual(['yes']);
  });

  // ── Memo-identity (AC-MEMO-IDENTITY) ──────────────────────────────────────
  it('identity-stable across a no-op rerender (same props)', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseFilteredAgriListingsParams) => useFilteredAgriListings(p), {
      initialProps: params,
    });
    const first = result.current;
    rerender(params);
    expect(result.current).toBe(first);
  });

  it('recomputes (positive control) when a real dep (filters.agriAcresMin) changes', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseFilteredAgriListingsParams) => useFilteredAgriListings(p), {
      initialProps: params,
    });
    const first = result.current;
    rerender({ ...params, filters: { ...params.filters, agriAcresMin: 5 } });
    expect(result.current).not.toBe(first);
  });
});
