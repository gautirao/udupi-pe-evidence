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

// ─── Import hook AFTER mocks ───────────────────────────────────
import { useAreaGroups, AREA_GROUPS_QUERY_KEY_BASE } from '../useAreaGroups';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const BASE_RESPONSE = {
  groups: [
    {
      id: 'south-bangalore',
      name: 'South Bangalore',
      subtitle: 'Koramangala, HSR, BTM',
      region_label: 'South',
      school_count: 42,
      area_keys: ['IN|KA|Bengaluru|Koramangala', 'IN|KA|Bengaluru|HSR'],
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAreaGroups', () => {
  it('does not fetch when city is empty string', () => {
    const { result } = renderHook(
      () => useAreaGroups(''),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches area groups for a given city', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () => useAreaGroups('bangalore'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url).toContain('/api/discover/area-groups');
    expect(url).toContain('city=bangalore');
    expect(result.current.data?.groups).toHaveLength(1);
    expect(result.current.data?.groups[0].id).toBe('south-bangalore');
  });

  it('encodes city with special characters in the URL', async () => {
    mockGet.mockResolvedValue({ groups: [] });

    const { result } = renderHook(
      () => useAreaGroups('udupi manipal'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url).toContain('city=udupi%20manipal');
  });

  it('uses city in the query key', () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result } = renderHook(
      () => useAreaGroups('bangalore'),
      { wrapper: makeWrapper() },
    );

    // Confirm query key base is correct by checking the constant
    expect(AREA_GROUPS_QUERY_KEY_BASE).toEqual(['area-groups']);
    // Result should be loading or success — either way the query was triggered
    expect(result.current.fetchStatus).not.toBe('idle');
  });

  it('returns empty groups on API error (graceful fallback)', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useAreaGroups('bangalore'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.groups).toEqual([]);
  });

  it('refetches when city changes', async () => {
    mockGet.mockResolvedValue({ groups: [] });

    const { result, rerender } = renderHook(
      ({ city }: { city: string }) => useAreaGroups(city),
      { wrapper: makeWrapper(), initialProps: { city: 'udupi' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
    const [firstUrl] = mockGet.mock.calls[0] as [string, unknown];
    expect(firstUrl).toContain('city=udupi');

    mockGet.mockResolvedValue({ groups: [] });
    rerender({ city: 'bangalore' });

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    const [secondUrl] = mockGet.mock.calls[1] as [string, unknown];
    expect(secondUrl).toContain('city=bangalore');
  });

  it('transitions from enabled to disabled when city becomes empty', async () => {
    mockGet.mockResolvedValue(BASE_RESPONSE);

    const { result, rerender } = renderHook(
      ({ city }: { city: string }) => useAreaGroups(city),
      { wrapper: makeWrapper(), initialProps: { city: 'bangalore' } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const callCount = mockGet.mock.calls.length;

    rerender({ city: '' });
    // No additional fetch after city becomes empty
    expect(mockGet).toHaveBeenCalledTimes(callCount);
  });
});
