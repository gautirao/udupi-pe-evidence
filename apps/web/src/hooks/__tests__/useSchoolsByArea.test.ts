/**
 * Unit tests for useSchoolsByArea — Issue #1067 R1.
 *
 * Verifies the hook calls api.get with { skipAuth: true } (so the request hits
 * the configured API_BASE_URL, not the page origin) and preserves the repeated
 * `board` / `category` query-param encoding (the regression fix from #1018).
 */
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

// Import AFTER mocks
import { useSchoolsByArea } from '../useSchoolsByArea';

// ─── Helpers ──────────────────────────────────────────────────
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const PADUBIDRI_KEY = 'IN|KA|Udupi|Padubidri';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSchoolsByArea — Issue #1067 R1', () => {
  it('does_not_fetch_when_areaKey_is_null', () => {
    const { result } = renderHook(() => useSchoolsByArea(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('calls_api_get_with_skipAuth_and_no_filters', async () => {
    mockGet.mockResolvedValue([]);

    const { result } = renderHook(
      () => useSchoolsByArea(PADUBIDRI_KEY),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url, options] = mockGet.mock.calls[0] as [string, { skipAuth?: boolean }];
    expect(url.startsWith('/api/public/schools/by-area?')).toBe(true);
    expect(options).toEqual({ skipAuth: true });

    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('areaKey')).toBe(PADUBIDRI_KEY);
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('20');
    expect(params.getAll('board')).toEqual([]);
    expect(params.getAll('category')).toEqual([]);
  });

  it('encodes_board_filters_as_repeated_params', async () => {
    mockGet.mockResolvedValue([]);

    const { result } = renderHook(
      () => useSchoolsByArea(PADUBIDRI_KEY, ['CBSE', 'ICSE']),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('board')).toEqual(['CBSE', 'ICSE']);
  });

  it('encodes_category_filters_as_repeated_params', async () => {
    mockGet.mockResolvedValue([]);

    const { result } = renderHook(
      () => useSchoolsByArea(PADUBIDRI_KEY, [], ['Primary', 'Secondary']),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('category')).toEqual(['Primary', 'Secondary']);
  });

  it('returns_response_shape_with_isLast_when_page_short', async () => {
    const padubidriSchools = [
      { id: 'sc-1', name: 'Kinara Global School' },
      { id: 'sc-2', name: 'Mahalakshmi English Medium School. Uchila' },
      { id: 'sc-3', name: 'School Play Ground' },
    ];
    mockGet.mockResolvedValue(padubidriSchools);

    const { result } = renderHook(
      () => useSchoolsByArea(PADUBIDRI_KEY),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstPage = result.current.data?.pages[0];
    expect(firstPage?.schools).toEqual(padubidriSchools);
    expect(firstPage?.isLast).toBe(true);
    expect(firstPage?.nextPage).toBe(1);
  });
});
