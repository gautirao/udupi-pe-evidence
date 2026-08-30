/**
 * useSavedListings — Issue #1566 (persist saved homes)
 *
 * Covers:
 * - useSavedListingIds: auth-scoped key, disabled when anon, hydrates a Set.
 * - useSaveListing: optimistic add + rollback on error; 200 and 201 both success.
 * - useUnsaveListing: optimistic remove (ids + list) + rollback on error; DELETE 204 success.
 * - 401 surfaces an auth-required signal (toast) rather than being silently swallowed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { listingKeys } from '../../lib/listingQueryKeys';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => ({ current: null as unknown }));

const MockApiError = vi.hoisted(() => {
  return class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  };
});

vi.mock('@/lib/api', () => ({
  api: { get: mockGet, post: mockPost, delete: mockDelete },
  ApiError: MockApiError,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Import AFTER mocks
import {
  useSavedListingIds,
  useSavedListings,
  useSaveListing,
  useUnsaveListing,
} from '../useSavedListings';

// ─── Helpers ──────────────────────────────────────────────────
function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const LISTING_ID = 'listing-uuid-1566';

describe('useSavedListingIds', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSession.current = null;
  });

  it('is disabled (no fetch) when anonymous', async () => {
    mockSession.current = null;
    const queryClient = newClient();
    const { result } = renderHook(() => useSavedListingIds(), { wrapper: makeWrapper(queryClient) });

    await new Promise((r) => setTimeout(r, 30));

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
    expect(result.current.idSet.size).toBe(0);
  });

  it('fetches under the auth-scoped key when authenticated and hydrates a Set', async () => {
    mockSession.current = { user: { id: 'u1' } };
    mockGet.mockResolvedValue([LISTING_ID, 'other-id']);
    const queryClient = newClient();

    const { result } = renderHook(() => useSavedListingIds(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith('/api/me/saved-listings/ids');
    expect(result.current.idSet.has(LISTING_ID)).toBe(true);
    expect(result.current.idSet.has('other-id')).toBe(true);
    expect(result.current.idSet.has('missing-id')).toBe(false);

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(listingKeys.savedListingIds(true));
  });

  it('anon and authed keys are distinct (no cache collision)', () => {
    expect(listingKeys.savedListingIds(true)).not.toEqual(listingKeys.savedListingIds(false));
  });
});

describe('useSavedListings (full cards)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSession.current = null;
  });

  it('is disabled when anonymous', async () => {
    mockSession.current = null;
    const queryClient = newClient();
    renderHook(() => useSavedListings(), { wrapper: makeWrapper(queryClient) });

    await new Promise((r) => setTimeout(r, 30));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches the compact card list when authenticated', async () => {
    mockSession.current = { user: { id: 'u1' } };
    mockGet.mockResolvedValue([{ id: 's1', listingId: LISTING_ID, available: true }]);
    const queryClient = newClient();

    const { result } = renderHook(() => useSavedListings(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/api/me/saved-listings');
    expect(result.current.data).toEqual([{ id: 's1', listingId: LISTING_ID, available: true }]);
  });
});

describe('useSaveListing', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockToast.mockReset();
    mockSession.current = { user: { id: 'u1' } };
  });

  it('optimistically adds the id to the saved-ids cache before the request resolves', async () => {
    const queryClient = newClient();
    const idsKey = listingKeys.savedListingIds(true);
    queryClient.setQueryData(idsKey, []);

    let resolvePost: (v: { listingId: string; saved: boolean }) => void = () => {};
    mockPost.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));

    const { result } = renderHook(() => useSaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => {
      expect(queryClient.getQueryData<string[]>(idsKey)).toContain(LISTING_ID);
    });

    resolvePost({ listingId: LISTING_ID, saved: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('treats a 200 (already saved) response as success — no error path', async () => {
    const queryClient = newClient();
    mockPost.mockResolvedValue({ listingId: LISTING_ID, saved: true });

    const { result } = renderHook(() => useSaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('treats a 201 (newly saved) response as success — no error path', async () => {
    const queryClient = newClient();
    mockPost.mockResolvedValue({ listingId: LISTING_ID, saved: true });

    const { result } = renderHook(() => useSaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic id add on error', async () => {
    const queryClient = newClient();
    const idsKey = listingKeys.savedListingIds(true);
    queryClient.setQueryData(idsKey, []);
    mockPost.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useSaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<string[]>(idsKey)).toEqual([]);
  });

  it('surfaces a 401 as an auth-required toast rather than a generic failure toast', async () => {
    const queryClient = newClient();
    const idsKey = listingKeys.savedListingIds(true);
    queryClient.setQueryData(idsKey, []);
    mockPost.mockRejectedValue(new MockApiError('unauthorized', 401));

    const { result } = renderHook(() => useSaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign in required' }),
    );
  });
});

describe('useUnsaveListing', () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockToast.mockReset();
    mockSession.current = { user: { id: 'u1' } };
  });

  it('optimistically removes the id from both the ids cache and the card list', async () => {
    const queryClient = newClient();
    const idsKey = listingKeys.savedListingIds(true);
    const listKey = listingKeys.savedListings(true);
    queryClient.setQueryData(idsKey, [LISTING_ID, 'other-id']);
    queryClient.setQueryData(listKey, [
      { id: 's1', listingId: LISTING_ID, available: true },
      { id: 's2', listingId: 'other-id', available: true },
    ]);

    let resolveDelete: (v: undefined) => void = () => {};
    mockDelete.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));

    const { result } = renderHook(() => useUnsaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => {
      expect(queryClient.getQueryData<string[]>(idsKey)).not.toContain(LISTING_ID);
    });
    expect(queryClient.getQueryData<Array<{ listingId: string }>>(listKey)).toEqual([
      { id: 's2', listingId: 'other-id', available: true },
    ]);

    resolveDelete(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('treats DELETE 204 (empty body) as success — idempotent even if already unsaved', async () => {
    const queryClient = newClient();
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUnsaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('rolls back both caches on error', async () => {
    const queryClient = newClient();
    const idsKey = listingKeys.savedListingIds(true);
    const listKey = listingKeys.savedListings(true);
    queryClient.setQueryData(idsKey, [LISTING_ID]);
    queryClient.setQueryData(listKey, [{ id: 's1', listingId: LISTING_ID, available: true }]);
    mockDelete.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useUnsaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<string[]>(idsKey)).toEqual([LISTING_ID]);
    expect(queryClient.getQueryData(listKey)).toEqual([{ id: 's1', listingId: LISTING_ID, available: true }]);
  });

  it('surfaces a 401 as an auth-required toast', async () => {
    const queryClient = newClient();
    mockDelete.mockRejectedValue(new MockApiError('unauthorized', 401));

    const { result } = renderHook(() => useUnsaveListing(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate(LISTING_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign in required' }),
    );
  });
});
