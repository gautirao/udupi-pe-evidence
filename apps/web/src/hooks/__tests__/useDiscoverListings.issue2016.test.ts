import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
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

import { useDiscoverListings } from '../useDiscoverListings';
import type { ResultScope } from '@/features/discover/state/resultScope';

function makeWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

const BASE_PAGE = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, aggregates: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverListings — Issue #2016 result-scope threading', () => {
  it('sends_scopeFingerprint_when_a_resultScope_is_committed', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);
    const resultScope: ResultScope = { kind: 'AREA_SET', areaKeys: ['hebbal'] };

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'bangalore',
          page: 0,
          filters: {},
          enabled: true,
          resultScope,
        }),
      { wrapper: makeWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('scopeFingerprint')).toBeTruthy();
  });

  it('committed_VIEWPORT_round-trips_to_the_viewportScope_request_param_with_areaKeys_absent', async () => {
    mockGet.mockResolvedValue(BASE_PAGE);
    const resultScope: ResultScope = { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 } };

    const { result } = renderHook(
      () =>
        useDiscoverListings({
          city: 'bangalore',
          page: 0,
          filters: {},
          enabled: true,
          resultScope,
        }),
      { wrapper: makeWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('viewportScope')).toBe('12.9,77.5,13,77.6');
    expect(params.has('areaKeys')).toBe(false);
  });

  it('a_response_for_a_since-superseded_scope_lands_in_its_own_cache_entry_and_never_overwrites_the_current_one', async () => {
    const { Wrapper, queryClient } = makeWrapper();

    // First scope's request resolves SLOWLY (after the second commit).
    let resolveFirst!: (value: typeof BASE_PAGE) => void;
    const firstResponse = new Promise<typeof BASE_PAGE>((resolve) => { resolveFirst = resolve; });
    mockGet.mockReturnValueOnce(firstResponse);
    mockGet.mockResolvedValueOnce({ ...BASE_PAGE, totalElements: 61 });

    const scopeA: ResultScope = { kind: 'AREA_SET', areaKeys: ['hebbal'] };
    const scopeB: ResultScope = { kind: 'POLYGON', coordinates: [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]] };

    const { result, rerender } = renderHook(
      ({ resultScope }: { resultScope: ResultScope }) =>
        useDiscoverListings({ city: 'bangalore', page: 0, filters: {}, enabled: true, resultScope }),
      { wrapper: Wrapper, initialProps: { resultScope: scopeA } },
    );

    // Commit the second (superseding) scope BEFORE the first request resolves.
    rerender({ resultScope: scopeB });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalElements).toBe(61);

    // The slow first response now arrives — it must not clobber the second
    // scope's already-rendered data.
    resolveFirst(BASE_PAGE);
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.data?.totalElements).toBe(61);
    // Distinct fingerprints -> distinct cache entries, proven structurally.
    const cacheKeys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(cacheKeys.length).toBeGreaterThanOrEqual(2);
  });
});
