import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

import { usePopularSchools } from '../usePopularSchools';

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
  board: 'CBSE',
  boardType: 'CBSE',
  latitude: 13.34,
  longitude: 74.74,
  address: 'Udupi',
  distanceKm: 1.2,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePopularSchools', () => {
  it('stays idle when city is null', () => {
    const { result } = renderHook(() => usePopularSchools(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('stays idle when city is empty string', () => {
    const { result } = renderHook(() => usePopularSchools(''), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('stays idle when city is whitespace', () => {
    const { result } = renderHook(() => usePopularSchools('   '), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches when city is provided, default limit=6', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { result } = renderHook(() => usePopularSchools('udupi'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/popular?city=udupi&limit=6',
      { skipAuth: true },
    );
    expect(result.current.data).toEqual([sampleSchool]);
  });

  it('includes areaKey when supplied', async () => {
    mockGet.mockResolvedValue([]);
    const areaKey = 'udupi|manipal';
    const { result } = renderHook(
      () => usePopularSchools('udupi', areaKey, 10),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // URLSearchParams encodes "|" as %7C
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/popular?city=udupi&limit=10&areaKey=udupi%7Cmanipal',
      { skipAuth: true },
    );
  });

  it('omits areaKey when empty/whitespace', async () => {
    mockGet.mockResolvedValue([]);
    const { result } = renderHook(() => usePopularSchools('udupi', '   ', 6), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      '/api/public/schools/popular?city=udupi&limit=6',
      { skipAuth: true },
    );
  });

  it('re-fetches when areaKey changes (queryKey isolation)', async () => {
    mockGet.mockResolvedValue([sampleSchool]);
    const { rerender, result } = renderHook(
      ({ area }: { area?: string }) => usePopularSchools('udupi', area, 6),
      { wrapper: makeWrapper(), initialProps: { area: undefined } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({ area: 'udupi|manipal' });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/public/schools/popular?city=udupi&limit=6&areaKey=udupi%7Cmanipal',
      { skipAuth: true },
    );
  });

  it('surfaces network errors', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePopularSchools('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles empty result array', async () => {
    mockGet.mockResolvedValue([]);
    const { result } = renderHook(() => usePopularSchools('unknown-city'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
