/**
 * useAgriListingDetail — Issue #1454 (anon agri visibility gating)
 *
 * The backend withholds price / pricePaise / surveyNumber and coarsens lat/lng
 * for anonymous agri callers. The auth tier (isAuthenticated) must therefore be
 * part of the React-Query cache key, so an authed exact-coord/price response is
 * never served from cache to an anon caller (and vice versa) after a session
 * change.
 *
 * Tests:
 * AC1  Cache key includes isAuthenticated=true when a session is present.
 * AC2  Cache key includes isAuthenticated=false when no session is present.
 * AC3  Anon vs authed produce DISTINCT cache entries (no cross-tier bleed):
 *      the queryFn is invoked once per tier rather than served from a shared
 *      cache entry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

// ─── Import hook AFTER mocks ───────────────────────────────────
import { useAgriListingDetail } from '../useAgriListingDetail';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const LISTING_ID = 'listing-uuid-123';

describe('useAgriListingDetail — auth-tier cache key (Issue #1454)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ id: LISTING_ID });
    mockSession.current = null;
  });

  it('AC1: cache key includes isAuthenticated=true when a session is present', async () => {
    mockSession.current = { user: { id: 'u1' } };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['agri-listing-detail', LISTING_ID, true]);
  });

  it('AC2: cache key includes isAuthenticated=false when no session is present', async () => {
    mockSession.current = null;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['agri-listing-detail', LISTING_ID, false]);
  });

  it('AC3: anon and authed responses occupy DISTINCT cache entries (no cross-tier bleed)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // 1) Anonymous fetch
    mockSession.current = null;
    const anon = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(anon.result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    // 2) Authenticated fetch — different tier ⇒ different cache key ⇒ refetch,
    //    not served from the anon cache entry.
    mockSession.current = { user: { id: 'u1' } };
    const authed = renderHook(() => useAgriListingDetail(LISTING_ID), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(authed.result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(2);

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['agri-listing-detail', LISTING_ID, false]);
    expect(keys).toContainEqual(['agri-listing-detail', LISTING_ID, true]);
  });
});
