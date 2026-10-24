/**
 * #2859 batch B5 (umbrella #2750) — L7 AI13.render: the area-intelligence RESPONSE reaches the rendered guide
 * on the composed /trends page.
 *
 * Trends.issue1528.test.tsx and AreaGuide.test.tsx mock useAreaIntelligence (or feed AreaGuide props), so the
 * hook -> transport -> page hop was unproven below the legacy spec. Here Trends runs with the REAL
 * useAreaIntelligence and the REAL '@/lib/api' client; only global fetch is stubbed, keyed on the EXACT path
 * + params the hook must issue. Anything else gets a 404, so a renamed path / dropped param cannot render
 * the guide.
 *
 * Seams (disclosed): useTrendsOptions / useAreaOverview are mocked (not the hop under test; the guide branch
 * does not read useAreaOverview), recharts and AppLayout are stubbed for jsdom as in Trends.issue1528.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

import Trends from '../Trends';
import type { AreaIntelligenceResponse } from '@/hooks/useAreaIntelligence';

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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('@/hooks/useTrendsOptions');
vi.mock('@/hooks/useAreaOverview');
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useAreaOverview } from '@/hooks/useAreaOverview';

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

const SERVED_KEY = 'IN|KA|Udupi|Kodi Bengre';
const UNSERVED_KEY = 'IN|KA|Udupi|Hoode';

/** A response whose label and confidence cannot be derived from the URL: only the transport can supply them. */
const RESPONSE: AreaIntelligenceResponse = {
  citySlug: 'udupi',
  areaKey: SERVED_KEY,
  areaLabel: 'Kodi Bengre Wire2859',
  available: true,
  confidenceLabel: 'Limited data',
  metrics: {
    medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
    dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
    activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
    mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  priceComparison: { supported: false, wording: null },
  listingsCta: { areaKey: SERVED_KEY, label: 'View listings in Kodi Bengre Wire2859' },
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(useTrendsOptions).mockReturnValue({
    data: { city: 'udupi', defaultAreas: [{ areaKey: SERVED_KEY, areaLabel: 'Kodi Bengre' }] },
    isLoading: false,
  } as ReturnType<typeof useTrendsOptions>);
  vi.mocked(useAreaOverview).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useAreaOverview>);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const served =
      url.pathname === '/api/trends/area-intelligence' &&
      url.searchParams.get('city') === 'udupi' &&
      url.searchParams.get('areaKey') === SERVED_KEY;
    return served
      ? new Response(JSON.stringify(RESPONSE), { status: 200 })
      : new Response(JSON.stringify({ message: 'not stubbed' }), { status: 404 });
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function renderTrends(areaKey: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/trends?city=udupi&areaKey=${encodeURIComponent(areaKey)}&guide=1`]}>
        <Routes>
          <Route path="/trends" element={<Trends />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Trends area guide wired to the real useAreaIntelligence (#2859 B5 L7 AI13.render)', () => {
  it('renders the hero h1 and confidence chip from the transport response; an unserved key renders the calm error copy instead', async () => {
    renderTrends(SERVED_KEY);

    expect(await screen.findByRole('heading', { level: 1, name: 'Kodi Bengre Wire2859' })).toBeInTheDocument();
    // Location chip and confidence chip come from the response (areaLabel / top-level confidenceLabel).
    expect(screen.getByText('Kodi Bengre Wire2859, Udupi district, Karnataka')).toBeInTheDocument();
    expect(screen.getAllByText('Limited data').length).toBeGreaterThan(0);
    expect(screen.queryByText(/couldn.t load area details/i)).not.toBeInTheDocument();

    // Control (same it): a key the transport does not serve never shows the served label.
    cleanup();
    renderTrends(UNSERVED_KEY);
    expect(await screen.findByText(/couldn.t load area details/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Kodi Bengre Wire2859' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([u]) => new URL(String(u)).searchParams.get('areaKey') === UNSERVED_KEY),
      ).toBe(true),
    );
  });
});
