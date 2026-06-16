/**
 * useAgriListingDetail — Issue #1462 (cache key alignment)
 *
 * The hook must use listingKeys.public(id, isAuthenticated) so that the peek
 * cache entry is reused by useListingById on /listing/:id, eliminating a
 * round-trip on peek → detail navigation.
 *
 * Tests:
 * 7   id truthy + isAuthenticated=true  → queryKey = listingKeys.public(id, true)
 * 8   id truthy + isAuthenticated=false → queryKey = listingKeys.public(id, false)
 * 9   id null → query is disabled (enabled=false; queryFn never called)
 * 10  Disclosure regression — anon and authed keys are DISTINCT (no cache collision)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { listingKeys } from '../../lib/listingQueryKeys';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

// Import AFTER mocks
import { useAgriListingDetail } from '../useAgriListingDetail';

// ─── Helpers ──────────────────────────────────────────────────
function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const LISTING_ID = 'listing-uuid-1462';

describe('useAgriListingDetail — listingKeys.public cache key (Issue #1462)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ id: LISTING_ID, title: 'Test Agri Plot' });
    mockSession.current = null;
  });

  it('7: id truthy + isAuthenticated=true → queryKey = listingKeys.public(id, true)', async () => {
    mockSession.current = { user: { id: 'u1' } };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(listingKeys.public(LISTING_ID, true));
  });

  it('8: id truthy + isAuthenticated=false → queryKey = listingKeys.public(id, false)', async () => {
    mockSession.current = null;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(listingKeys.public(LISTING_ID, false));
  });

  it('9: id null → query is disabled, queryFn never called', async () => {
    mockSession.current = null;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAgriListingDetail(null), {
      wrapper: makeWrapper(queryClient),
    });

    // Give the query time to settle; it should stay in 'pending' with no fetch
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('10: Disclosure regression — anon key ≠ authed key; no cache collision', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Anon fetch
    mockSession.current = null;
    const anon = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(anon.result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Authed fetch — different key, must re-fetch
    mockSession.current = { user: { id: 'u1' } };
    const authed = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(authed.result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(2);

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(listingKeys.public(LISTING_ID, false));
    expect(keys).toContainEqual(listingKeys.public(LISTING_ID, true));
  });
});
