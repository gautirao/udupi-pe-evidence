import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ─── Polyfills ────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mocks ────────────────────────────────────────────
const mockUseListingMarketContext = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useListingMarketContext', () => ({
  useListingMarketContext: mockUseListingMarketContext,
}));

// Prevent recharts from crashing in jsdom (no SVG layout engine)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  LineChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'line-chart' }, children),
  Line: () => null,
  XAxis: () => null,
  Tooltip: () => null,
}));

// ─── Import component AFTER mocks ─────────────────────────────
import { AreaMarketWidget } from '../AreaMarketWidget';

// ─── Helpers ──────────────────────────────────────────────────

function makeDataPoint(overrides: Record<string, unknown> = {}) {
  return {
    month: '2026-01-01',
    listingCount: 10,
    medianPricePerUnit: 3000,
    p25PricePerUnit: 2500,
    p75PricePerUnit: 3500,
    priceBasis: 'per_sqft',
    totalSimilarCount: 10,
    ...overrides,
  };
}

// apartment: listingRate = Math.round(price / built_area) = Math.round(3_000_000 / 1000) = 3000
const APARTMENT_LISTING = {
  id: 'l1',
  property_type: 'apartment',
  locality: 'Udupi',
  price: 3_000_000,
  price_unit: 'INR',
  price_paise: null,
  price_per_cent_paise: null,
  built_area: 1000,
  built_area_unit: 'sqft',
  bedrooms: null,
} as any;

// land: listingRate = price_per_cent_paise / 100 = 200_000 / 100 = 2000
const LAND_LISTING = {
  id: 'l2',
  property_type: 'land',
  locality: 'Udupi',
  price: 500_000,
  price_unit: 'INR',
  price_paise: null,
  price_per_cent_paise: 200_000,
  built_area: null,
  built_area_unit: null,
  bedrooms: null,
} as any;

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AreaMarketWidget — loading state', () => {
  it('does not show "Area Market" heading while loading', () => {
    mockUseListingMarketContext.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.queryByText('Area Market')).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
  });
});

describe('AreaMarketWidget — error state', () => {
  it('shows error message when RPC fails', () => {
    mockUseListingMarketContext.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('RPC failed'),
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getByText(/Could not load market data/)).toBeInTheDocument();
  });
});

describe('AreaMarketWidget — insufficient data state', () => {
  it('shows "Not enough data" when data array is empty', () => {
    mockUseListingMarketContext.mockReturnValue({ data: [], isLoading: false, error: null });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();
  });

  it('shows "Not enough data" when totalSimilarCount < 5', () => {
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint({ totalSimilarCount: 4 })],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();
  });
});

describe('AreaMarketWidget — data state', () => {
  it('renders "Area Market" heading when sufficient data is available', () => {
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint()],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getByText('Area Market')).toBeInTheDocument();
  });

  it('shows "Great deal" badge when listingRate / median ≤ 0.7', () => {
    // listingRate = 3000; median = 5000 → ratio = 0.6 ≤ 0.7
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint({ medianPricePerUnit: 5000, totalSimilarCount: 10 })],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getByText(/Great deal/)).toBeInTheDocument();
  });

  it('shows "Good value" badge when 0.7 < listingRate / median ≤ 0.85', () => {
    // listingRate = 3000; median = 4000 → ratio = 0.75
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint({ medianPricePerUnit: 4000, totalSimilarCount: 10 })],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getByText(/Good value/)).toBeInTheDocument();
  });

  it('shows no badge when listingRate / median > 0.85', () => {
    // listingRate = 3000; median = 3100 → ratio ≈ 0.968
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint({ medianPricePerUnit: 3100, totalSimilarCount: 10 })],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.queryByText(/Great deal|Good value/)).not.toBeInTheDocument();
  });

  it('shows "/ cent" unit label for land listings', () => {
    // Land listing with per_cent basis
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint({ priceBasis: 'per_cent', medianPricePerUnit: 3000, totalSimilarCount: 10 })],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={LAND_LISTING} />);
    expect(screen.getAllByText(/\/ cent/).length).toBeGreaterThan(0);
  });

  it('shows "/ sqft" unit label for apartment listings', () => {
    mockUseListingMarketContext.mockReturnValue({
      data: [makeDataPoint({ priceBasis: 'per_sqft', medianPricePerUnit: 3000, totalSimilarCount: 10 })],
      isLoading: false,
      error: null,
    });
    render(<AreaMarketWidget listing={APARTMENT_LISTING} />);
    expect(screen.getAllByText(/\/ sqft/).length).toBeGreaterThan(0);
  });
});

describe('AreaMarketWidget — no locality', () => {
  it('returns null when listing has no locality', () => {
    mockUseListingMarketContext.mockReturnValue({ data: [], isLoading: false, error: null });
    const { container } = render(
      <AreaMarketWidget listing={{ ...APARTMENT_LISTING, locality: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
