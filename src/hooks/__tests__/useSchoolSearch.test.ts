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
