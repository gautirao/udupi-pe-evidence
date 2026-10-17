/**
 * Trends page — Issue #1528 default-guide behaviour tests
 *
 * Verifies the render decision (shouldRenderGuide):
 *   - Bare /trends (no params)            → guide skeleton (options loading)
 *   - /trends?city=udupi (no areaKey)     → guide renders (after self-populate writes areaKey)
 *   - noCityAreas city                    → clean city-level no-data guide state (NOT legacy)
 *   - Full pipe areaKey (/insights redirect) → guide renders with real area data
 *   - Non-pipe areaKey (edge case)        → legacy #771 fallback (not guide)
 *
 * All existing AC coverage lives in AreaGuide.test.tsx. This file tests the
 * Trends.tsx orchestration layer only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

import Trends from '../Trends';

// ─── Polyfills ────────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Recharts mock (no SVG engine in jsdom) ───────────────────────────────────
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

// ─── Supabase + API mocks (prevent client init error in jsdom) ────────────────
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

// ─── Hook mocks ──────────────────────────────────────────────────────────────
vi.mock('@/hooks/useTrendsOptions');
vi.mock('@/hooks/useAreaIntelligence');
vi.mock('@/hooks/useAreaOverview');

import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';
import { useAreaOverview } from '@/hooks/useAreaOverview';
import type { AreaIntelligenceResponse } from '@/hooks/useAreaIntelligence';

const mockUseTrendsOptions = vi.mocked(useTrendsOptions);
const mockUseAreaIntelligence = vi.mocked(useAreaIntelligence);
const mockUseAreaOverview = vi.mocked(useAreaOverview);

// ─── AppLayout mock (avoids nav/auth complexity) ──────────────────────────────
vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Render Trends at a given URL path+search string */
function renderTrends(url: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/trends" element={<Trends />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/discover" element={<div>Discover</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Default mock returns (benign: all loading=false, no data) ────────────────

const AREA_INTELLIGENCE_LOADING = {
  data: undefined,
  isLoading: true,
  isError: false,
} as ReturnType<typeof useAreaIntelligence>;

const AREA_INTELLIGENCE_IDLE = {
  data: undefined,
  isLoading: false,
  isError: false,
} as ReturnType<typeof useAreaIntelligence>;

const FULL_AREA_INTELLIGENCE: AreaIntelligenceResponse = {
  citySlug: 'udupi',
  areaKey: 'IN|KA|Udupi|Malpe',
  areaLabel: 'Malpe',
  available: true,
  confidenceLabel: 'Enough data',
  metrics: {
    medianPricePaise: { value: 5500000_00, confidenceLabel: 'Enough data' },
    dominantPropertyType: { value: 'plot', confidenceLabel: 'Enough data' },
    activeListingCount: { value: 31, confidenceLabel: 'Enough data' },
    freshListingCount: { value: 18, confidenceLabel: 'Enough data' },
    avgListingQuality: { value: 74, confidenceLabel: 'Enough data' },
    mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  priceComparison: { supported: false, wording: null },
  listingsCta: { areaKey: 'IN|KA|Udupi|Malpe', label: 'View listings in Malpe' },
};

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

const TRENDS_OPTIONS_LOADING = {
  data: undefined,
  isLoading: true,
} as ReturnType<typeof useTrendsOptions>;

const TRENDS_OPTIONS_NO_AREAS = {
  data: { city: 'nodata', defaultAreas: [] },
  isLoading: false,
} as ReturnType<typeof useTrendsOptions>;

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults: all hooks idle, no data
  mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_WITH_AREAS);
  mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);
  mockUseAreaOverview.mockReturnValue(AREA_OVERVIEW_IDLE);
});

// ─── Bare /trends: guide skeleton shows immediately ──────────────────────────

describe('Bare /trends — guide is the default, NOT the legacy #771 dashboard', () => {
  it('bare /trends (no params): renders guide skeleton while options load — NOT legacy', () => {
    mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_LOADING);
    mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);

    renderTrends('/trends');

    // Guide skeleton must be present (aria-busy="true" from AreaGuideSkeleton)
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    // Legacy dashboard landmarks must NOT appear
    expect(screen.queryByText('Market Trends')).not.toBeInTheDocument();
    expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Listings')).not.toBeInTheDocument();
  });

  it('bare /trends (no params): renders guide skeleton even when options settled — no legacy flash', () => {
    // Options settled with areas but URL not yet updated (effect runs async — in tests
    // useEffect does not run automatically; we simulate the pre-effect state).
    // shouldRenderGuide = true (selectedKey='') → guide path; options present → still resolving URL.
    mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_WITH_AREAS);
    mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);

    renderTrends('/trends');

    // Still in guide path (skeleton fallback since no areaKey in URL, data=undefined)
    // The guide renders its skeleton fallback (data undefined, not loading/error)
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    // Must NOT show legacy view
    expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
  });

  it('/trends?city=udupi (no areaKey): renders guide loading state — NOT legacy "Select an area"', () => {
    mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_LOADING);
    mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);

    renderTrends('/trends?city=udupi');

    // Must show guide skeleton
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    // Old legacy empty-states must NOT appear (these have been removed from the guide path)
    expect(screen.queryByText(/select an area to explore/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no areas available/i)).not.toBeInTheDocument();
  });
});

// ─── No-area city: clean guide no-data state, NOT legacy dashboard ────────────

describe('No-area city — renders clean city-level no-data guide state', () => {
  it('city with no configured areas renders guide no-data state, NOT legacy dashboard', () => {
    mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_NO_AREAS);
    mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);

    renderTrends('/trends?city=nodata');

    // Must show the city-level no-data guide state
    expect(screen.getByText(/area guides not yet available for/i)).toBeInTheDocument();

    // Must NOT show legacy dashboard metrics
    expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Listings')).not.toBeInTheDocument();

    // Must NOT leak Udupi/Malpe (AC11)
    expect(screen.queryByText(/\bUdupi\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bMalpe\b/)).not.toBeInTheDocument();
  });

  it('no-area city shows Explore on Map CTA with correct city slug', () => {
    mockUseTrendsOptions.mockReturnValue(TRENDS_OPTIONS_NO_AREAS);
    mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_IDLE);

    renderTrends('/trends?city=nodata');

    const ctaLink = screen.getByRole('link', { name: /explore .* on map/i });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink.getAttribute('href')).toContain('city=nodata');
    // Must NOT contain a hardcoded Udupi/Malpe reference
    expect(ctaLink.getAttribute('href')).not.toContain('udupi');
    expect(ctaLink.getAttribute('href')).not.toContain('malpe');
  });
});

// ─── Full pipe areaKey (redirect from /insights or /area-overview) ────────────

describe('Full pipe areaKey redirect — guide renders with real area data (AC14 non-regression)', () => {
  it('/trends?city=udupi&areaKey=IN|KA|Udupi|Malpe renders guide, NOT legacy', () => {
    mockUseAreaIntelligence.mockReturnValue({
      data: FULL_AREA_INTELLIGENCE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderTrends('/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CMalpe');

    // Guide heading (area name)
    expect(screen.getByRole('heading', { level: 1, name: /malpe/i })).toBeInTheDocument();

    // Must NOT show legacy dashboard
    expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
    expect(screen.queryByText(/market trends/i)).not.toBeInTheDocument();
  });

  it('guide skeleton shows while area intelligence is loading (redirect URL)', () => {
    mockUseAreaIntelligence.mockReturnValue(AREA_INTELLIGENCE_LOADING);

    renderTrends('/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CMalpe');

    // Guide skeleton
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    // No legacy
    expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
  });
});

// ─── #2750 PR-5 1528-api-error: composed page error pass-through (AC9) ────────

describe('Area-guide route — useAreaIntelligence error is passed to the guide (#2750 PR-5 1528 row 11)', () => {
  it('1528-api-error: guide=1 area route with useAreaIntelligence isError shows the calm error copy and NO numeric metric', () => {
    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useAreaIntelligence>);

    renderTrends('/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CMalpe&guide=1');

    expect(screen.getByText(/couldn.t load area details/i)).toBeInTheDocument();
    // No fake values (legacy asserted no `31` and no `₹55`)
    expect(screen.queryByText('31')).not.toBeInTheDocument();
    expect(screen.queryByText(/₹\s?55/)).not.toBeInTheDocument();
    expect(screen.queryByText('Price Change')).not.toBeInTheDocument();
  });

  it('1528-api-error control: same route with isError false and data renders the guide, not the error copy', () => {
    mockUseAreaIntelligence.mockReturnValue({
      data: FULL_AREA_INTELLIGENCE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderTrends('/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CMalpe&guide=1');

    expect(screen.queryByText(/couldn.t load area details/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /malpe/i })).toBeInTheDocument();
  });
});

// ─── Edge case: non-pipe areaKey falls through to legacy (safety net) ─────────

describe('Non-pipe areaKey edge case — falls through to legacy #771 flow', () => {
  it('?areaKey=invalidkey (no pipes) reaches legacy loading state', () => {
    // selectedKey='invalidkey' → shouldRenderGuide=false → legacy path
    mockUseAreaOverview.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useAreaOverview>);

    renderTrends('/trends?city=udupi&areaKey=invalidkey');

    // Legacy LoadingSkeleton renders (not AreaGuideSkeleton — different structure)
    // The legacy skeleton has grid cols in max-7xl container, not aria-busy
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    // Something is loading — the page renders a skeleton (not crash)
    expect(document.querySelector('.container')).not.toBeNull();
  });
});
