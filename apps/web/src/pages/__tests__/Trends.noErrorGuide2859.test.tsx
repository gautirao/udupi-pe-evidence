/**
 * #2859 batch B5 (umbrella #2750) — L202 M4.neg: no "Area not found" on /trends?city&areaKey (pipe areaKey),
 * with a positive control in the same it.
 *
 * When a full pipe areaKey is in the URL, Trends.tsx (shouldRenderGuide = isAreaGuideMode || selectedKey === '')
 * renders AreaGuide and never falls through to the legacy #771 error screen ("Area not found" at Trends.tsx:300),
 * even if useAreaOverview reports isError=true.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

import Trends from '../Trends';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useAreaOverview } from '@/hooks/useAreaOverview';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'chart-container' }, children),
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
}));

vi.mock('@/hooks/useTrendsOptions');
vi.mock('@/hooks/useAreaOverview');
vi.mock('@/hooks/useAreaIntelligence');

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

const PIPE_KEY = 'IN|KA|Udupi|Malpe';

beforeEach(() => {
  vi.mocked(useTrendsOptions).mockReturnValue({
    data: { city: 'udupi', defaultAreas: [{ areaKey: PIPE_KEY, areaLabel: 'Malpe' }] },
    isLoading: false,
  } as ReturnType<typeof useTrendsOptions>);
  vi.mocked(useAreaOverview).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  } as ReturnType<typeof useAreaOverview>);
  vi.mocked(useAreaIntelligence).mockReturnValue({
    data: {
      citySlug: 'udupi',
      areaKey: PIPE_KEY,
      areaLabel: 'Malpe Guide2859',
      available: true,
      confidenceLabel: 'Enough data',
      metrics: {
        medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
        dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
        activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
        freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
        avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
        mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
      },
      priceComparison: { supported: false, wording: null },
      listingsCta: { areaKey: PIPE_KEY, label: 'View homes in Malpe Guide2859' },
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useAreaIntelligence>);
});

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/trends" element={<Trends />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Trends pipe areaKey never renders legacy "Area not found" (#2859 B5 L202 M4.neg)', () => {
  it('renders the guide h1 and never "Area not found" for a pipe areaKey even when useAreaOverview errors', async () => {
    renderAt(`/trends?city=udupi&areaKey=${encodeURIComponent(PIPE_KEY)}`);

    expect.soft(screen.queryByRole('heading', { level: 1, name: 'Malpe Guide2859' })).toBeInTheDocument();
    expect(screen.queryByText('Area not found')).not.toBeInTheDocument();
  });
});
