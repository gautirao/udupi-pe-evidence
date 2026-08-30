/**
 * usePreviewCityIdentity — Issue #2166.
 *
 * Resolves the previewed city's slug (via the admin city-launch list) only
 * when mounted under DiscoverDataSourceProvider mode:'preview', and stays a
 * no-op (undefined, no request) in live mode.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePreviewCityIdentity } from './usePreviewCityIdentity';
import { DiscoverDataSourceProvider } from './DiscoverDataSourceContext';
import type { CityLaunchStatusDto } from '@/hooks/useCityLaunch';

const mockCities: CityLaunchStatusDto[] = [
  {
    cityId: 1,
    citySlug: 'bangalore',
    cityName: 'Bangalore',
    status: 'LIVE',
    revisionId: null,
    revisionNumber: null,
    prepStage: 5,
    prepState: null,
    geographyPercent: 100,
    failureReason: null,
    preparedAt: null,
    geographyReady: true,
  },
  {
    cityId: 3,
    citySlug: 'udupi',
    cityName: 'Udupi',
    status: 'PREPARING',
    revisionId: 1,
    revisionNumber: 1,
    prepStage: 3,
    prepState: null,
    geographyPercent: 60,
    failureReason: null,
    preparedAt: null,
    geographyReady: false,
  },
];

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

function makeWrapper(source: { mode: 'live' } | { mode: 'preview'; cityId: number; revisionId: number }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DiscoverDataSourceProvider value={source}>{children}</DiscoverDataSourceProvider>
      </QueryClientProvider>
    );
  };
}

describe('usePreviewCityIdentity', () => {
  it('returns undefined citySlug and isUnresolvedPreview=false in live mode, never calling the city-launch list API', async () => {
    mockApiGet.mockResolvedValue(mockCities);
    const { result } = renderHook(() => usePreviewCityIdentity(), {
      wrapper: makeWrapper({ mode: 'live' }),
    });

    expect(result.current).toEqual({ citySlug: undefined, isUnresolvedPreview: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('reports isUnresolvedPreview=true while the preview city-launch list lookup is still pending', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePreviewCityIdentity(), {
      wrapper: makeWrapper({ mode: 'preview', cityId: 3, revisionId: 1 }),
    });

    expect(result.current).toEqual({ citySlug: undefined, isUnresolvedPreview: true });
  });

  it('resolves the previewed city slug from the city-launch list in preview mode', async () => {
    mockApiGet.mockResolvedValue(mockCities);
    const { result } = renderHook(() => usePreviewCityIdentity(), {
      wrapper: makeWrapper({ mode: 'preview', cityId: 3, revisionId: 1 }),
    });

    await waitFor(() => expect(result.current).toEqual({ citySlug: 'udupi', isUnresolvedPreview: false }));
    expect(mockApiGet).toHaveBeenCalledWith('/api/admin/city-launch/cities');
  });

  it('keeps isUnresolvedPreview=true in preview mode when no matching cityId is found (fail closed)', async () => {
    mockApiGet.mockResolvedValue(mockCities);
    const { result } = renderHook(() => usePreviewCityIdentity(), {
      wrapper: makeWrapper({ mode: 'preview', cityId: 999, revisionId: 1 }),
    });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(result.current).toEqual({ citySlug: undefined, isUnresolvedPreview: true });
  });

  it('keeps isUnresolvedPreview=true in preview mode when the city-launch list request fails (fail closed)', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => usePreviewCityIdentity(), {
      wrapper: makeWrapper({ mode: 'preview', cityId: 3, revisionId: 1 }),
    });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(result.current).toEqual({ citySlug: undefined, isUnresolvedPreview: true });
  });
});
