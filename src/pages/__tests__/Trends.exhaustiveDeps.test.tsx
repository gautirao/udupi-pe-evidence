/**
 * Issue #2005 (Slice 2 PR6) — Category A/B regression coverage for Trends.tsx's
 * three converted exhaustive-deps sites:
 *   - :92  (Category A) mount-only URL normalize (>3 areaKeys trimmed to 3)
 *   - :116 (Category B) [optionsData, city] canonical-URL-write trigger
 *   - :153 (Category B) [isError, selectedKey] invalid-key removal — shouldRenderGuide
 *          is a guard, NOT a third trigger (see code comment at the site)
 *
 * Reuses the render/mock harness established by Trends.issue1528.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe" data-search={location.search} />;
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderTrends(url: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/trends" element={<Trends />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function currentSearch() {
  return screen.getByTestId('location-probe').getAttribute('data-search') ?? '';
}

const AREA_INTELLIGENCE_IDLE = {
  data: undefined,
  isLoading: false,
  isError: false,
} as ReturnType<typeof useAreaIntelligence>;

const AREA_OVERVIEW_IDLE = {
  data: undefined,
  isLoading: false,
  isError: false,
} as ReturnType<typeof useAreaOverview>;

const TRENDS_OPTIONS_WITH_AREAS = {
  data: {
    city: 'udupi',
    defaultAreas: [
      { areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' },
      { areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' },
    ],
  },
  isLoading: false,
} as ReturnType<typeof useTrendsOptions>;

const TRENDS_OPTIONS_NO_DATA = {
  data: undefined,
  isLoading: false,
} as ReturnType<typeof useTrendsOptions>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_WITH_AREAS);
  mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);
  mockUseAreaOverview.mockReturnValue(AREA_OVERVIEW_IDLE);
});

// ─── :92 Category A — mount-only URL normalize (>3 areaKeys → 3) ──────────────

describe('Trends.tsx:92 — mount-only URL normalize (Category A)', () => {
  it('trims >3 areaKeys to the canonical 3 on mount', () => {
    renderTrends('/trends?city=udupi&areaKey=a&areaKey=b&areaKey=c&areaKey=d&areaKey=e');

    const params = new URLSearchParams(currentSearch());
    expect(params.getAll('areaKey')).toEqual(['a', 'b', 'c']);
  });

  it('leaves a URL with ≤3 areaKeys untouched (no spurious write)', () => {
    renderTrends('/trends?city=udupi&areaKey=a&areaKey=b');

    const params = new URLSearchParams(currentSearch());
    expect(params.getAll('areaKey')).toEqual(['a', 'b']);
  });
});

// ─── :116 Category B — [optionsData, city] canonical-URL-write trigger ────────

describe('Trends.tsx:116 — [optionsData, city] trigger (Category B)', () => {
  it('writes the canonical URL once options resolve with defaults, for a bare /trends visit', () => {
    renderTrends('/trends?city=udupi');

    const params = new URLSearchParams(currentSearch());
    // TRENDS_OPTIONS_WITH_AREAS resolves synchronously (mocked, isLoading:false) —
    // the effect fires on mount because optionsData is already present.
    expect(params.getAll('areaKey')).toEqual(['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Manipal']);
  });

  it('does not write a URL when defaults are unavailable (no optionsData)', () => {
    mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_NO_DATA);

    renderTrends('/trends?city=udupi');

    const params = new URLSearchParams(currentSearch());
    expect(params.getAll('areaKey')).toEqual([]);
  });
});

// ─── :153 Category B — [isError, selectedKey] guard vs trigger (shouldRenderGuide) ──

describe('Trends.tsx:153 — [isError, selectedKey] trigger, shouldRenderGuide is a guard (Category B)', () => {
  it('removes an errored non-pipe areaKey from the URL (legacy edge-case path)', () => {
    mockUseAreaOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useAreaOverview>);

    renderTrends('/trends?city=udupi&areaKey=badkey');

    const params = new URLSearchParams(currentSearch());
    expect(params.getAll('areaKey')).toEqual([]);
  });

  it('the guide path (shouldRenderGuide=true) never invokes the legacy error-removal effect, even with isError semantics elsewhere', () => {
    // Full pipe areaKey → shouldRenderGuide=true → the legacy #771 useAreaOverview
    // flow is not the active path; useAreaIntelligence drives the guide instead.
    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useAreaIntelligence>);

    renderTrends('/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CMalpe');

    // The pipe areaKey must NOT be stripped by the legacy removal effect —
    // that effect early-returns on shouldRenderGuide (a guard, not a trigger).
    const params = new URLSearchParams(currentSearch());
    expect(params.getAll('areaKey')).toEqual(['IN|KA|Udupi|Malpe']);
  });
});
