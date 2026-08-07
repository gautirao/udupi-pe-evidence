/**
 * Issue #2088 QA-FIX (step 3, approved CTA fix) — regression coverage for
 * the legacy #771 dashboard's "Explore on Map" CTA surviving the
 * default-journey flip.
 *
 * Before this fix, the CTA hand-navigated to `/discover?city=&areaKey=` with
 * no `journey` param. Since a bare `/discover` now defaults to
 * `journey=area-first` (Issue #2088 item 3, area.ts), DiscoverRightPanelContainer's
 * documented A1-MINIMAL behaviour silently ignores a stale `areaKey=` on an
 * area-first URL — it mounts at the city root instead, dropping the area the
 * user was just looking at. This pins that the CTA now resolves the area
 * through the SAME canonical navigation-path seam DiscoverControlBar's area
 * search uses (`useDiscoverAreaNavigationPathResolver`) before navigating,
 * landing on `journey=area-first&node=<resolved>` instead.
 *
 * Harness mirrors Trends.issue1528.test.tsx (mock hooks, no real network),
 * driven through the legacy non-pipe-areaKey edge case — the only render
 * path this specific CTA lives on (see Trends.tsx's module doc: the guide
 * is the default; this legacy view is reachable only via a non-pipe areaKey
 * such as `?areaKey=invalidkey`, per AC in that suite).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

import Trends from '../Trends';

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
    from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })),
  },
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/hooks/useTrendsOptions');
vi.mock('@/hooks/useAreaIntelligence');
vi.mock('@/hooks/useAreaOverview');

import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';
import { useAreaOverview } from '@/hooks/useAreaOverview';

const mockUseTrendsOptions = vi.mocked(useTrendsOptions);
const mockUseAreaIntelligence = vi.mocked(useAreaIntelligence);
const mockUseAreaOverview = vi.mocked(useAreaOverview);

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockResolveMutate = vi.hoisted(() => vi.fn());
vi.mock('@/features/discover/navigation/useDiscoverAreaNavigationPath', () => ({
  useDiscoverAreaNavigationPathResolver: () => ({
    mutate: mockResolveMutate,
  }),
}));

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderTrends(url: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/trends" element={<Trends />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const LEGACY_AREA_OVERVIEW = {
  data: {
    areaKey: 'invalidkey',
    areaLabel: 'Legacy Area',
    districtKey: 'district',
    districtLabel: 'District',
    confidence: 'full' as const,
    listingCount90d: 12,
    snapshot: {
      medianPricePaise: 5_000_000_00,
      priceP10Paise: null,
      priceP90Paise: null,
      propertyTypeDist: null,
      trendDirection: 'stable' as const,
      trendPctChange: 0,
    },
    fallback: null,
    comparison: [],
    schools: [],
    activity: null,
  },
  isLoading: false,
  isError: false,
} as unknown as ReturnType<typeof useAreaOverview>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTrendsOptions.mockReturnValue({
    data: { city: 'bangalore', defaultAreas: [] },
    isLoading: false,
  } as ReturnType<typeof useTrendsOptions>);
  mockUseAreaIntelligence.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useAreaIntelligence>);
  mockUseAreaOverview.mockReturnValue(LEGACY_AREA_OVERVIEW);
});

describe('Trends legacy "Explore on Map" CTA — Issue #2088 QA-FIX area survival', () => {
  it('resolves the area through the navigation-path seam and navigates with journey=area-first&node=, never the legacy areaKey=', async () => {
    const user = userEvent.setup();
    renderTrends('/trends?city=bangalore&areaKey=invalidkey');

    const cta = screen.getByRole('button', { name: /explore on map/i });
    await user.click(cta);

    expect(mockResolveMutate).toHaveBeenCalledTimes(1);
    const [params, callbacks] = mockResolveMutate.mock.calls[0];
    expect(params).toEqual({ city: 'bangalore', areaKey: 'invalidkey' });

    callbacks.onSuccess({ nodeKey: 'a:invalidkey' });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const destination = mockNavigate.mock.calls[0][0] as string;
    const destParams = new URLSearchParams(destination.split('?')[1]);
    expect(destParams.get('journey')).toBe('area-first');
    expect(destParams.get('node')).toBe('a:invalidkey');
    expect(destParams.get('areaKey')).toBeNull();
  });

  it('on resolution failure, degrades to the city view rather than writing a legacy areaKey= the area-first default would silently ignore', async () => {
    const user = userEvent.setup();
    renderTrends('/trends?city=bangalore&areaKey=invalidkey');

    const cta = screen.getByRole('button', { name: /explore on map/i });
    await user.click(cta);

    const [, callbacks] = mockResolveMutate.mock.calls[0];
    callbacks.onError(new Error('404'));

    expect(mockNavigate).toHaveBeenCalledWith('/discover?city=bangalore');
  });
});
