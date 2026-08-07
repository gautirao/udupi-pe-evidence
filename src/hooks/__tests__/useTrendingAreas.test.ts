import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

import { useTrendingAreas } from '../useTrendingAreas';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTrendingAreas — preview cache isolation', () => {
  it('disabled in preview mode and does not expose live cache data', () => {
    const queryClient = new QueryClient();
    
    // 1. Pre-populate the LIVE cache
    const LIVE_RESPONSE = { areas: [{ areaKey: 'x', areaLabel: 'X', districtLabel: null, medianPricePaise: null, listingCount90d: 1 }] };
    const liveKey = ['trending-areas', 'live'];
    queryClient.setQueryData(liveKey, LIVE_RESPONSE);

    // 2. Render in PREVIEW mode
    const previewWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(DiscoverDataSourceProvider, { value: { mode: 'preview', cityId: 1, revisionId: 2 } }, children)
      );

    const { result } = renderHook(() => useTrendingAreas(), {
      wrapper: previewWrapper,
    });

    // 3. Prove it does NOT return the live data and makes no request
    expect(result.current.areas).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
