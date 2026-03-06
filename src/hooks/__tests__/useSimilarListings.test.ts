import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

// ─── Import hook AFTER mocks ──────────────────────────────────
import { useSimilarListings } from '../useSimilarListings';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Build a chainable supabase builder that resolves `limit` with the given response. */
function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(response);
  return chain;
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSimilarListings — disabled when params missing', () => {
  it('does not fetch when listingId is undefined', () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));
    const { result } = renderHook(
      () => useSimilarListings(undefined, 'Udupi', 'apartment'),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not fetch when locality is null', () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));
    const { result } = renderHook(
      () => useSimilarListings('listing-1', null, 'apartment'),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not fetch when propertyType is null', () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));
    const { result } = renderHook(
      () => useSimilarListings('listing-1', 'Udupi', null),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('useSimilarListings — query parameters', () => {
  it('excludes the current listing via .neq("id", listingId)', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(
      () => useSimilarListings('listing-999', 'Udupi', 'apartment'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(chain.neq).toHaveBeenCalled());
    expect(chain.neq).toHaveBeenCalledWith('id', 'listing-999');
  });

  it('caps results at 3 via .limit(3)', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(
      () => useSimilarListings('listing-1', 'Udupi', 'apartment'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(chain.limit).toHaveBeenCalled());
    expect(chain.limit).toHaveBeenCalledWith(3);
  });

  it('filters by locality and property_type', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    renderHook(
      () => useSimilarListings('listing-1', 'Karkala', 'house'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(chain.eq).toHaveBeenCalled());
    expect(chain.eq).toHaveBeenCalledWith('locality', 'Karkala');
    expect(chain.eq).toHaveBeenCalledWith('property_type', 'house');
    expect(chain.eq).toHaveBeenCalledWith('is_valid', true);
  });
});

describe('useSimilarListings — data mapping', () => {
  it('returns [] when Supabase data is null', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const { result } = renderHook(
      () => useSimilarListings('listing-1', 'Udupi', 'land'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('maps raw_posts.images array onto the returned listing object', async () => {
    const rawRow = {
      id: 'l2',
      locality: 'Udupi',
      property_type: 'apartment',
      raw_posts: { images: [{ url: 'http://img.test/1.jpg' }] },
    };
    mockFrom.mockReturnValue(makeChain({ data: [rawRow], error: null }));

    const { result } = renderHook(
      () => useSimilarListings('listing-1', 'Udupi', 'apartment'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].images).toEqual([{ url: 'http://img.test/1.jpg' }]);
  });

  it('defaults images to [] when raw_posts.images is not an array', async () => {
    const rawRow = {
      id: 'l3',
      locality: 'Udupi',
      property_type: 'apartment',
      raw_posts: { images: null },
    };
    mockFrom.mockReturnValue(makeChain({ data: [rawRow], error: null }));

    const { result } = renderHook(
      () => useSimilarListings('listing-1', 'Udupi', 'apartment'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].images).toEqual([]);
  });

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: new Error('DB error') }));

    const { result } = renderHook(
      () => useSimilarListings('listing-1', 'Udupi', 'apartment'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
