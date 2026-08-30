import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useListingMarketContext } from '../useListingMarketContext';

// ─── Mock supabase ────────────────────────────────────────────
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const RAW_ROW = {
  month: '2026-01-01',
  listing_count: 8,
  median_price_per_unit: 3200,
  p25_price_per_unit: 2800,
  p75_price_per_unit: 3800,
  price_basis: 'per_sqft',
  total_similar_count: 8,
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useListingMarketContext — disabled when params null', () => {
  it('does not call supabase.rpc when locality is null', async () => {
    mockRpc.mockResolvedValue({ data: [RAW_ROW], error: null });
    const { result } = renderHook(
      () => useListingMarketContext({ locality: null, propertyType: 'apartment' }),
      { wrapper: makeWrapper() },
    );
    // Query disabled — never runs
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not call supabase.rpc when propertyType is null', async () => {
    mockRpc.mockResolvedValue({ data: [RAW_ROW], error: null });
    const { result } = renderHook(
      () => useListingMarketContext({ locality: 'Udupi', propertyType: null }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not call supabase.rpc when enabled=false', async () => {
    mockRpc.mockResolvedValue({ data: [RAW_ROW], error: null });
    const { result } = renderHook(
      () =>
        useListingMarketContext({ locality: 'Udupi', propertyType: 'apartment', enabled: false }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('useListingMarketContext — data mapping', () => {
  it('maps raw RPC response to MarketContextDataPoint shape', async () => {
    mockRpc.mockResolvedValue({ data: [RAW_ROW], error: null });

    const { result } = renderHook(
      () => useListingMarketContext({ locality: 'Udupi', propertyType: 'apartment' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toEqual({
      month: '2026-01-01',
      listingCount: 8,
      medianPricePerUnit: 3200,
      p25PricePerUnit: 2800,
      p75PricePerUnit: 3800,
      priceBasis: 'per_sqft',
      totalSimilarCount: 8,
    });
  });

  it('returns [] when RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(
      () => useListingMarketContext({ locality: 'Udupi', propertyType: 'land' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns [] when RPC returns empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useListingMarketContext({ locality: 'Udupi', propertyType: 'land' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns error state when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('RPC failed') });

    const { result } = renderHook(
      () => useListingMarketContext({ locality: 'Udupi', propertyType: 'land' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe('useListingMarketContext — RPC call arguments', () => {
  it('passes correct params to supabase.rpc including bedrooms and months', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    renderHook(
      () =>
        useListingMarketContext({
          locality: 'Karkala',
          propertyType: 'apartment',
          bedrooms: 2,
          months: 3,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    expect(mockRpc).toHaveBeenCalledWith('get_listing_market_context', {
      p_locality: 'Karkala',
      p_property_type: 'apartment',
      p_bedrooms: 2,
      p_months: 3,
    });
  });

  it('passes null bedrooms when not specified', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    renderHook(
      () => useListingMarketContext({ locality: 'Udupi', propertyType: 'land' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    expect(mockRpc).toHaveBeenCalledWith('get_listing_market_context', {
      p_locality: 'Udupi',
      p_property_type: 'land',
      p_bedrooms: null,
      p_months: 6,
    });
  });
});
