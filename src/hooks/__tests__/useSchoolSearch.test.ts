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

// ─── Import hooks AFTER mocks ──────────────────────────────────
import { useSchoolSearch, useNearbySchools, useSchoolById } from '../useSchoolSearch';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const sampleSchool = {
  id: 's1',
  name: 'Delhi Public School',
  board: null,
  boardType: 'CBSE',
  latitude: 13.34,
  longitude: 74.74,
  address: 'Udupi',
  distanceKm: 1.2,
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSchoolSearch', () => {
  it('does not fetch when query is shorter than 2 characters', () => {
    const { result } = renderHook(() => useSchoolSearch('a'), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches when query has 2+ characters', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => useSchoolSearch('Delhi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/search?q=Delhi&limit=10',
      { skipAuth: true },
    );
    expect(result.current.data).toEqual([sampleSchool]);
  });

  it('does not fetch when query is empty', () => {
    const { result } = renderHook(() => useSchoolSearch(''), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  // ─── Issue #1798: region-scoped search (city param) ─────────

  it('omits city param when city is undefined (backward-compat)', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => useSchoolSearch('Delhi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/search?q=Delhi&limit=10',
      { skipAuth: true },
    );
    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('city=');
  });

  it('omits city param when city is blank/whitespace', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => useSchoolSearch('Delhi', '   '), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/search?q=Delhi&limit=10',
      { skipAuth: true },
    );
    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('city=');
  });

  it('includes city param when city="bangalore" is provided', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => useSchoolSearch('heb', 'bangalore'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/search?q=heb&limit=10&city=bangalore',
      { skipAuth: true },
    );
  });

  it('re-fetches when city changes (city is part of queryKey)', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { rerender, result } = renderHook(
      ({ city }: { city?: string }) => useSchoolSearch('heb', city),
      { wrapper: makeWrapper(), initialProps: { city: 'udupi' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/public/schools/search?q=heb&limit=10&city=udupi',
      { skipAuth: true },
    );

    rerender({ city: 'bangalore' });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/public/schools/search?q=heb&limit=10&city=bangalore',
      { skipAuth: true },
    );
  });

  // ─── Issue #1812: group-scoped search (areaKeys param) ─────────

  it('sends areaKeys as a repeated param, not comma-joined', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(
      () => useSchoolSearch('heb', 'bangalore', ['area-a', 'area-b']),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl = mockGet.mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split('?')[1]);
    expect(params.getAll('areaKeys')).toEqual(['area-a', 'area-b']);
    expect(calledUrl).not.toContain('area-a%2Carea-b');
    expect(calledUrl).not.toMatch(/areaKeys=area-a,area-b/);
  });

  it('omits areaKeys param when areaKeys is empty/absent (backward-compat)', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => useSchoolSearch('heb', 'bangalore', []), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/search?q=heb&limit=10&city=bangalore',
      { skipAuth: true },
    );
    const calledUrl = mockGet.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('areaKeys');
  });

  it('produces the same URL/key when areaKeys is omitted entirely (backward-compat)', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => useSchoolSearch('heb', 'bangalore'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/search?q=heb&limit=10&city=bangalore',
      { skipAuth: true },
    );
  });

  it('scoped and unscoped searches for the same query/city produce distinct query keys (no cache collision)', async () => {
    mockGet.mockResolvedValueOnce([sampleSchool]).mockResolvedValueOnce([{ ...sampleSchool, id: 's2', inScope: true }]);

    const { result: unscoped } = renderHook(
      () => useSchoolSearch('hebbal', 'bangalore'),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(unscoped.current.isSuccess).toBe(true));

    const { result: scoped } = renderHook(
      () => useSchoolSearch('hebbal', 'bangalore', ['area-x']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(scoped.current.isSuccess).toBe(true));

    // Distinct wrappers = distinct QueryClients, so this only proves both
    // fetch independently; the real collision-avoidance guarantee is that
    // each call hit the network (no cross-hook cache short-circuit is
    // possible to assert without a shared client) — verify via URL shape.
    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      '/api/public/schools/search?q=hebbal&limit=10&city=bangalore',
      { skipAuth: true },
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/api/public/schools/search?q=hebbal&limit=10&city=bangalore&areaKeys=area-x',
      { skipAuth: true },
    );
  });

  it('shares one QueryClient: scoped and unscoped queries do not collide in cache', async () => {
    mockGet.mockResolvedValueOnce([sampleSchool]).mockResolvedValueOnce([{ ...sampleSchool, id: 's2' }]);
    const wrapper = makeWrapper();

    const { result: unscoped } = renderHook(() => useSchoolSearch('hebbal', 'bangalore'), { wrapper });
    await waitFor(() => expect(unscoped.current.isSuccess).toBe(true));

    const { result: scoped } = renderHook(
      () => useSchoolSearch('hebbal', 'bangalore', ['area-x']),
      { wrapper },
    );
    await waitFor(() => expect(scoped.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(unscoped.current.data).toEqual([sampleSchool]);
    expect(scoped.current.data).toEqual([{ ...sampleSchool, id: 's2' }]);
  });

  it('sorts areaKeys for a stable query key regardless of input order', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const wrapper = makeWrapper();

    const { result: r1 } = renderHook(
      () => useSchoolSearch('heb', 'bangalore', ['area-b', 'area-a']),
      { wrapper },
    );
    await waitFor(() => expect(r1.current.isSuccess).toBe(true));

    const { result: r2 } = renderHook(
      () => useSchoolSearch('heb', 'bangalore', ['area-a', 'area-b']),
      { wrapper },
    );
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    // Same underlying key (order-independent) => second hook resolves from
    // cache without a second network call.
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe('useSchoolById', () => {
  it('does not fetch when id is null', () => {
    const { result } = renderHook(() => useSchoolById(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fetch when id is empty string', () => {
    const { result } = renderHook(() => useSchoolById(''), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches a single school by valid UUID', async () => {
    mockGet.mockResolvedValue(sampleSchool);
    const { result } = renderHook(() => useSchoolById('s1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/s1',
      { skipAuth: true },
    );
    expect(result.current.data).toEqual(sampleSchool);
  });

  it('exposes error on 404 without retrying', async () => {
    const { ApiError } = await import('@/lib/api');
    const err = new ApiError('Not Found', 404, null);
    mockGet.mockRejectedValue(err);

    const { result } = renderHook(() => useSchoolById('missing-id'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // retry: false means the api was called exactly once
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(ApiError);
  });

  it('disables query when id is whitespace-only', () => {
    const { result } = renderHook(() => useSchoolById('   '), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns undefined data while query is disabled (null id)', () => {
    const { result } = renderHook(() => useSchoolById(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useNearbySchools', () => {
  it('does not fetch when listingId is undefined', () => {
    const { result } = renderHook(() => useNearbySchools(undefined, 2), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches nearby schools for a listing', async () => {
    const response = { count: 1, schools: [sampleSchool] };
    mockGet.mockResolvedValue(response);
    const { result } = renderHook(() => useNearbySchools('listing-1', 2), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/listings/listing-1/nearby-schools?radiusKm=2',
      { skipAuth: true },
    );
    expect(result.current.data?.count).toBe(1);
    expect(result.current.data?.schools[0].name).toBe('Delhi Public School');
  });

  it('uses custom radius', async () => {
    mockGet.mockResolvedValue({ count: 0, schools: [] });
    const { result } = renderHook(() => useNearbySchools('listing-2', 5), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/listings/listing-2/nearby-schools?radiusKm=5',
      { skipAuth: true },
    );
  });
});

describe('useSchoolById', () => {
  it('does not fetch when id is null', () => {
    const { result } = renderHook(() => useSchoolById(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fetch when id is empty string', () => {
    const { result } = renderHook(() => useSchoolById(''), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fetch when id is whitespace-only', () => {
    const { result } = renderHook(() => useSchoolById('   '), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches a school by ID', async () => {
    mockGet.mockResolvedValue(sampleSchool);
    const { result } = renderHook(() => useSchoolById('s1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/s1',
      { skipAuth: true },
    );
    expect(result.current.data).toEqual(sampleSchool);
  });

  it('does not retry on 404', async () => {
    const apiError = new (vi.mocked(mockGet).mock.results[0]?.value?.constructor || Error)('Not found', 404, null);
    mockGet.mockRejectedValue(apiError);
    const { result } = renderHook(() => useSchoolById('nonexistent'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Verify that the request was made only once (no retries)
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
