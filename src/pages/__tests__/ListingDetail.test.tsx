import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ─── Polyfills ────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mocks ────────────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn(() => ({ id: 'listing-123' })));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: mockUseParams,
  };
});

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/listing/AreaMarketWidget', () => ({
  AreaMarketWidget: () => React.createElement('div', { 'data-testid': 'area-market-widget' }),
}));

vi.mock('@/components/listing/SimilarListings', () => ({
  SimilarListings: () => React.createElement('div', { 'data-testid': 'similar-listings' }),
}));

vi.mock('@/components/listing/ListingTransparencyCard', () => ({
  ListingTransparencyCard: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'listing-transparency-card',
      'data-days': props.daysOnMarket,
      'data-back': String(props.backOnMarket),
      'data-duplicate': String(props.isSuspectedDuplicate),
    }),
}));

vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => React.createElement('div', { 'data-testid': 'nearby-pois' }),
}));

vi.mock('@/components/listing/RequestViewingModal', () => ({
  RequestViewingModal: () => React.createElement('div', { 'data-testid': 'request-viewing-modal' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock api — useListingById and useListingPriceHistory now call api.get;
// cache is pre-populated in tests so queryFn is never reached, but the mock
// prevents accidental real fetch calls if cache misses in future tests.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve(null)),
  },
}));

// ─── Import component AFTER mocks ─────────────────────────────
import ListingDetail from '../ListingDetail';

// ─── Helpers ──────────────────────────────────────────────────

/** Build a minimal listing fixture. Caller overrides specific fields. */
function makeListing(overrides = {}) {
  return {
    id: 'listing-123',
    property_type: 'land',
    title: 'Test Land Plot',
    locality: 'Udupi',
    price: 500000,
    price_unit: 'INR',
    price_per_cent_paise: 150000, // ₹1,500 / cent
    price_paise: null,
    built_area: null,
    built_area_unit: null,
    land_area: 10,
    land_area_unit: 'cent',
    bedrooms: null,
    bathrooms: null,
    description: 'A nice plot',
    contact_phone: null,
    contact_info: null,
    confidence_score: 85,
    latitude: 13.34,
    longitude: 74.74,
    area_key: 'IN|Karnataka|Udupi|Udupi',
    area_label: 'Udupi',
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    images: [],
    ...overrides,
  };
}

function renderWithListing(listing: ReturnType<typeof makeListing> | null, loading = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Pre-populate TanStack Query cache to avoid network call
  if (listing !== null) {
    queryClient.setQueryData(['listing', 'listing-123'], listing);
  }
  // Pre-populate price history cache with empty array (no price changes by default)
  queryClient.setQueryData(['listing-price-history', 'listing-123'], []);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/listing/listing-123']}>
        <ListingDetail />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ id: 'listing-123' });
});

// ── A. Price-per-unit display ──────────────────────────────────

describe('ListingDetail — price-per-unit (PR-11.4)', () => {
  it('shows price-per-cent for land listings with price_per_cent_paise', () => {
    renderWithListing(makeListing({
      property_type: 'land',
      price_per_cent_paise: 150000, // ₹1,500 / cent
    }));
    expect(screen.getByText(/1,500.*cent/)).toBeInTheDocument();
  });

  it('shows price-per-sqft for apartment with built_area (sqft) + price', () => {
    renderWithListing(makeListing({
      property_type: 'apartment',
      price: 3200000,
      built_area: 1000,
      built_area_unit: 'sqft',
      price_per_cent_paise: null,
    }));
    // ₹3,200,000 / 1000 sqft = ₹3,200 / sqft
    expect(screen.getByText(/3,200.*sqft/)).toBeInTheDocument();
  });

  it('shows price-per-sqft for house with built_area (sqft) + price', () => {
    renderWithListing(makeListing({
      property_type: 'house',
      price: 2000000,
      built_area: 800,
      built_area_unit: 'sqft',
      price_per_cent_paise: null,
    }));
    // ₹2,000,000 / 800 sqft = ₹2,500 / sqft
    expect(screen.getByText(/2,500.*sqft/)).toBeInTheDocument();
  });

  it('does NOT show per-unit line for land without price_per_cent_paise', () => {
    renderWithListing(makeListing({
      property_type: 'land',
      price_per_cent_paise: null,
    }));
    expect(screen.queryByText(/\/\s*cent/)).not.toBeInTheDocument();
  });

  it('does NOT show per-sqft for apartment without built_area', () => {
    renderWithListing(makeListing({
      property_type: 'apartment',
      built_area: null,
      price_per_cent_paise: null,
    }));
    expect(screen.queryByText(/\/\s*sqft/)).not.toBeInTheDocument();
  });

  it('does NOT show per-sqft when built_area_unit is not sqft', () => {
    renderWithListing(makeListing({
      property_type: 'apartment',
      price: 2000000,
      built_area: 200,
      built_area_unit: 'sqm', // not sqft
      price_per_cent_paise: null,
    }));
    expect(screen.queryByText(/\/\s*sqft/)).not.toBeInTheDocument();
  });
});

// ── B. Back button ─────────────────────────────────────────────

describe('ListingDetail — back button (PR-11.4)', () => {
  it('renders "Back to Map" label', () => {
    renderWithListing(makeListing());
    expect(screen.getAllByText('Back to Map').length).toBeGreaterThan(0);
  });

  it('navigates to "/" when back button is clicked', async () => {
    const { getByText } = renderWithListing(makeListing());
    // Click the Back to Map button in the header
    getByText('Back to Map').click();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

// ── C. Low confidence tooltip ──────────────────────────────────

describe('ListingDetail — low confidence badge (PR-11.4)', () => {
  it('shows "Low confidence" badge when confidence_score < 70', () => {
    renderWithListing(makeListing({ confidence_score: 55 }));
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
  });

  it('does NOT show "Low confidence" badge when confidence_score >= 70', () => {
    renderWithListing(makeListing({ confidence_score: 85 }));
    expect(screen.queryByText('Low confidence')).not.toBeInTheDocument();
  });

  it('does NOT show "Low confidence" badge when confidence_score is null', () => {
    renderWithListing(makeListing({ confidence_score: null }));
    expect(screen.queryByText('Low confidence')).not.toBeInTheDocument();
  });
});

// ── D. Not found / error state ─────────────────────────────────

describe('ListingDetail — not found state (PR-11.4)', () => {
  it('shows "Listing Not Found" when no data returned', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['listing', 'listing-123'], null);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingDetail />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Listing Not Found')).toBeInTheDocument();
  });

  it('shows "Back to Map" in not-found state', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['listing', 'listing-123'], null);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingDetail />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getAllByText('Back to Map').length).toBeGreaterThan(0);
  });
});

// ── E. Human-friendly listing ID (RE-83) ────────────────────────

describe('ListingDetail — display ID (RE-83)', () => {
  it('shows formatted PROP-XXXXX when listing_number is present', () => {
    renderWithListing(makeListing({ listing_number: 42 }));
    expect(screen.getByText('PROP-00042')).toBeInTheDocument();
  });

  it('does NOT show display ID when listing_number is absent', () => {
    renderWithListing(makeListing());
    expect(screen.queryByText(/PROP-/)).not.toBeInTheDocument();
  });
});

// ── F. ListingTransparencyCard integration (RE-94) ──────────────

describe('ListingDetail — ListingTransparencyCard (RE-94)', () => {
  it('renders the transparency card for a listing with daysOnMarket', () => {
    renderWithListing(makeListing({ daysOnMarket: 5 }));
    const card = screen.getByTestId('listing-transparency-card');
    expect(card).toBeInTheDocument();
    expect(card.getAttribute('data-days')).toBe('5');
  });

  it('renders transparency card even when all new fields are absent (card renders null internally)', () => {
    // The card is always rendered by ListingDetail; it returns null internally when nothing to show
    renderWithListing(makeListing());
    expect(screen.getByTestId('listing-transparency-card')).toBeInTheDocument();
  });

  it('passes backOnMarket flag to the transparency card', () => {
    renderWithListing(makeListing({ backOnMarket: true }));
    const card = screen.getByTestId('listing-transparency-card');
    expect(card.getAttribute('data-back')).toBe('true');
  });

  it('passes isSuspectedDuplicate flag to the transparency card', () => {
    renderWithListing(makeListing({ isSuspectedDuplicate: true }));
    const card = screen.getByTestId('listing-transparency-card');
    expect(card.getAttribute('data-duplicate')).toBe('true');
  });
});
