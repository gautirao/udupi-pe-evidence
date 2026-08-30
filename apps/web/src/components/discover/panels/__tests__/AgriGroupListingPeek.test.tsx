/**
 * Tests for AgriGroupListingPeek — Issue #1430
 *
 * Covers:
 * AC1: Renders locality, acreage, price immediately from AgriMapListingItem (first paint; no blocking fetch)
 * AC2: Renders media section (img) when images are present
 * AC3: Renders no-media fallback when no images present
 * AC4: Video indicator: NOT rendered (PublicListingDetail has no video/mediaType field; deferred to #1431)
 * AC5: Lazy-loads description from useAgriListingDetail when available
 * AC6: Close button calls onClose (not navigate)
 * AC7: View full details button calls onViewDetails(id)
 * AC8: No auto-navigate on mount
 * AC9: Shows skeleton/loading state while detail is loading (first-paint fields still visible)
 * AC10: Shows first-paint fields + error message when useAgriListingDetail errors
 * AC11: All required data-testid attributes are present
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockUseAgriListingDetail = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => ({ current: { user: { id: 'u1' } } as unknown }));
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAgriListingDetail', () => ({
  useAgriListingDetail: mockUseAgriListingDetail,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Component under test ──────────────────────────────────────────────────────

import { AgriGroupListingPeek } from '../AgriGroupListingPeek';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const baseListing: AgriMapListingItem = {
  id: 'listing-uuid-123',
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.35,
  longitude: 74.79,
  propertyType: 'agricultural_land',
  locality: 'Manipal Village',
  landArea: 3.5,
  landAreaUnit: 'acre',
  computedAreaAcres: 3.5,
  pricePaise: 5000000 * 100, // ₹50 lakh in paise
};

const noop = vi.fn();

function renderPeek(
  overrides: Partial<AgriMapListingItem> = {},
  callbacks: { onClose?: () => void; onViewDetails?: (id: string) => void } = {},
) {
  const onClose = callbacks.onClose ?? noop;
  const onViewDetails = callbacks.onViewDetails ?? noop;
  return render(
    <QueryClientProvider client={makeQC()}>
      <AgriGroupListingPeek
        listingId={baseListing.id}
        firstPaintData={{ ...baseListing, ...overrides }}
        onClose={onClose}
        onViewDetails={onViewDetails}
      />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgriGroupListingPeek — first-paint fields (synchronous)', () => {
  beforeEach(() => {
    // Default: hook is loading (detail not yet available)
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it('AC1: renders locality immediately from AgriMapListingItem (no fetch needed)', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-locality')).toHaveTextContent('Manipal Village');
  });

  it('AC1: renders land area from landArea + landAreaUnit when present', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-acreage')).toHaveTextContent('3.5 acre');
  });

  it('AC1: falls back to computedAreaAcres when landArea/landAreaUnit are absent', () => {
    renderPeek({ landArea: null, landAreaUnit: null, computedAreaAcres: 4.25 });
    expect(screen.getByTestId('agri-listing-peek-acreage')).toHaveTextContent('4.25 acres');
  });

  it('AC1: renders price from pricePaise (converted to rupees)', () => {
    renderPeek();
    // ₹50 lakh displayed — exact string depends on formatPrice
    const priceEl = screen.getByTestId('agri-listing-peek-price');
    expect(priceEl).toBeInTheDocument();
    // formatPrice(5000000) → "₹50 L"
    expect(priceEl).toHaveTextContent('50');
  });

  it('AC1: does not render price element when pricePaise is 0', () => {
    renderPeek({ pricePaise: 0 });
    expect(screen.queryByTestId('agri-listing-peek-price')).not.toBeInTheDocument();
  });

  it('AC1: does not render price element when pricePaise is null', () => {
    renderPeek({ pricePaise: null });
    expect(screen.queryByTestId('agri-listing-peek-price')).not.toBeInTheDocument();
  });
});

describe('AgriGroupListingPeek — loading state', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it('AC9: shows skeleton while detail is loading', () => {
    renderPeek();
    // Container renders (first-paint data is visible)
    expect(screen.getByTestId('agri-listing-peek')).toBeInTheDocument();
    // Locality is still visible (first-paint)
    expect(screen.getByTestId('agri-listing-peek-locality')).toBeInTheDocument();
    // Media/no-media not yet shown (skeleton replaces them)
    expect(screen.queryByTestId('agri-listing-peek-media')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-listing-peek-no-media')).not.toBeInTheDocument();
  });
});

describe('AgriGroupListingPeek — error state', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true });
  });

  it('AC10: shows first-paint fields + error message when detail fetch errors', () => {
    renderPeek();
    // First-paint fields are still visible
    expect(screen.getByTestId('agri-listing-peek-locality')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-acreage')).toBeInTheDocument();
    // Error message shown
    expect(screen.getByText(/could not load full details/i)).toBeInTheDocument();
  });

  it('AC10: Close button is still visible in error state', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-close')).toBeInTheDocument();
  });
});

describe('AgriGroupListingPeek — populated state (media present)', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({
      data: {
        id: baseListing.id,
        title: 'Paddy field plot',
        locality: 'Manipal Village',
        landArea: 3.5,
        landAreaUnit: 'acre',
        price: 5000000,
        images: [
          { url: 'https://example.com/img1.jpg', alt: 'Paddy field' },
          { url: 'https://example.com/img2.jpg' },
        ],
        description: 'A scenic paddy field near Manipal.',
      },
      isLoading: false,
      isError: false,
    });
  });

  it('AC2: renders media section when images are present', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-media')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-listing-peek-no-media')).not.toBeInTheDocument();
  });

  it('AC5: renders description after lazy load', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-description')).toHaveTextContent(
      'A scenic paddy field near Manipal.',
    );
  });

  it('AC4: video indicator is NOT rendered (PublicListingDetail has no video field)', () => {
    renderPeek();
    expect(screen.queryByTestId('agri-listing-peek-video-indicator')).not.toBeInTheDocument();
  });

  it('uses title from detail data when available (overrides locality fallback)', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-title')).toHaveTextContent('Paddy field plot');
  });
});

describe('AgriGroupListingPeek — populated state (no media)', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({
      data: {
        id: baseListing.id,
        title: null,
        locality: 'Manipal Village',
        landArea: 3.5,
        landAreaUnit: 'acre',
        price: 5000000,
        images: [],
        description: null,
      },
      isLoading: false,
      isError: false,
    });
  });

  it('AC3: renders no-media fallback when no images present', () => {
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-no-media')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-listing-peek-media')).not.toBeInTheDocument();
  });

  it('AC5: does not render description element when description is null', () => {
    renderPeek();
    expect(screen.queryByTestId('agri-listing-peek-description')).not.toBeInTheDocument();
  });
});

describe('AgriGroupListingPeek — callbacks', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it('AC6: Close button calls onClose (not navigate)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPeek({}, { onClose });

    await user.click(screen.getByTestId('agri-listing-peek-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AC7: View full details calls onViewDetails(id)', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    renderPeek({}, { onViewDetails });

    await user.click(screen.getByTestId('agri-listing-peek-view-details'));

    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledWith('listing-uuid-123');
  });

  it('AC8: does not call navigate on mount (no auto-navigate)', () => {
    // Mount the component and verify no navigation side-effect fires
    const onViewDetails = vi.fn();
    renderPeek({}, { onViewDetails });
    // No auto-navigate: onViewDetails must not have been called at mount time
    expect(onViewDetails).not.toHaveBeenCalled();
  });
});

describe('AgriGroupListingPeek — anon price gating (Issue #1454)', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  afterEach(() => {
    // Restore authenticated default for the rest of the suite
    mockSession.current = { user: { id: 'u1' } };
  });

  it('shows "Sign in to view price" when anon and pricePaise is null', () => {
    mockSession.current = null;
    renderPeek({ pricePaise: null });
    const signin = screen.getByTestId('agri-listing-peek-price-signin');
    expect(signin).toBeInTheDocument();
    expect(signin).toHaveTextContent(/sign in to view price/i);
    // The normal price element is not rendered
    expect(screen.queryByTestId('agri-listing-peek-price')).not.toBeInTheDocument();
  });

  it('does NOT show the sign-in CTA when authenticated even if pricePaise is null', () => {
    mockSession.current = { user: { id: 'u1' } };
    renderPeek({ pricePaise: null });
    expect(screen.queryByTestId('agri-listing-peek-price-signin')).not.toBeInTheDocument();
  });

  it('does NOT show the sign-in CTA when anon but pricePaise is present (price shown instead)', () => {
    mockSession.current = null;
    renderPeek(); // baseListing has pricePaise set
    expect(screen.queryByTestId('agri-listing-peek-price-signin')).not.toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-price')).toBeInTheDocument();
  });

  it('does NOT show the sign-in CTA for non-agri listings', () => {
    mockSession.current = null;
    renderPeek({ pricePaise: null, propertyType: 'land' });
    expect(screen.queryByTestId('agri-listing-peek-price-signin')).not.toBeInTheDocument();
  });
});

describe('AgriGroupListingPeek — required data-testids (AC11)', () => {
  it('all required testids are present on a fully populated peek', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: {
        id: baseListing.id,
        title: 'Test plot',
        locality: 'Manipal Village',
        landArea: 3.5,
        landAreaUnit: 'acre',
        price: 5000000,
        images: [{ url: 'https://example.com/img1.jpg' }],
        description: 'Description here.',
      },
      isLoading: false,
      isError: false,
    });

    renderPeek();

    expect(screen.getByTestId('agri-listing-peek')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-close')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-title')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-acreage')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-price')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-locality')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-media')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-description')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-view-details')).toBeInTheDocument();
    // video indicator: NOT present (no video field in PublicListingDetail)
    expect(screen.queryByTestId('agri-listing-peek-video-indicator')).not.toBeInTheDocument();
  });

  it('no-media testid present when images array is empty', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: {
        id: baseListing.id,
        title: null,
        locality: 'Manipal Village',
        landArea: null,
        landAreaUnit: null,
        price: 0,
        images: [],
        description: null,
      },
      isLoading: false,
      isError: false,
    });

    renderPeek({ landArea: null, landAreaUnit: null, pricePaise: null });

    expect(screen.getByTestId('agri-listing-peek-no-media')).toBeInTheDocument();
  });
});

// ─── Issue #1456 — Enquiry / login CTA ───────────────────────────────────────

describe('AgriGroupListingPeek — enquiry CTA (Issue #1456)', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockNavigate.mockReset();
  });

  afterEach(() => {
    // Restore authenticated default for the rest of the suite
    mockSession.current = { user: { id: 'u1' } };
  });

  it('anon: renders enquire button with "Sign in to enquire" label', () => {
    mockSession.current = null;
    renderPeek();
    const btn = screen.getByTestId('agri-listing-peek-enquire');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Sign in to enquire');
  });

  it('anon: "Enquire" label is absent', () => {
    mockSession.current = null;
    renderPeek();
    // Button is present but label is "Sign in to enquire", not bare "Enquire"
    expect(screen.queryByRole('button', { name: /^Enquire$/i })).not.toBeInTheDocument();
  });

  it('anon: "View full details" button is still present alongside enquire button', () => {
    mockSession.current = null;
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-view-details')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-enquire')).toBeInTheDocument();
  });

  it('auth: renders enquire button with "Enquire" label', () => {
    mockSession.current = { user: { id: 'u1' } };
    renderPeek();
    const btn = screen.getByTestId('agri-listing-peek-enquire');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Enquire');
  });

  it('auth: "Sign in to enquire" label is absent', () => {
    mockSession.current = { user: { id: 'u1' } };
    renderPeek();
    expect(screen.queryByText(/sign in to enquire/i)).not.toBeInTheDocument();
  });

  it('auth: "View full details" button is still present alongside enquire button', () => {
    mockSession.current = { user: { id: 'u1' } };
    renderPeek();
    expect(screen.getByTestId('agri-listing-peek-view-details')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-enquire')).toBeInTheDocument();
  });

  it('auth: clicking "Enquire" calls onViewDetails with the listingId', async () => {
    const user = userEvent.setup();
    mockSession.current = { user: { id: 'u1' } };
    const onViewDetails = vi.fn();
    renderPeek({}, { onViewDetails });

    await user.click(screen.getByTestId('agri-listing-peek-enquire'));

    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledWith('listing-uuid-123');
  });

  it('anon: clicking "Sign in to enquire" navigates to /auth', async () => {
    const user = userEvent.setup();
    mockSession.current = null;
    renderPeek();

    await user.click(screen.getByTestId('agri-listing-peek-enquire'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('anon regression: price-gate "Sign in to view price" still renders when showSignInForPrice=true', () => {
    mockSession.current = null;
    // pricePaise=null on an agri listing → triggers the #1454 price-gate block
    renderPeek({ pricePaise: null, propertyType: 'agricultural_land' });
    expect(screen.getByTestId('agri-listing-peek-price-signin')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-price-signin')).toHaveTextContent(
      /sign in to view price/i,
    );
  });
});

// ─── Issue #1494 — For Sale / For Rent intent badge ──────────────────────────

describe('AgriGroupListingPeek — intent badge (Issue #1494)', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it('renders "For Sale" badge when listingPurpose=sale', () => {
    renderPeek({ listingPurpose: 'sale' });
    const badge = screen.getByTestId('agri-peek-intent-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('For Sale');
  });

  it('renders "For Rent" badge when listingPurpose=rent', () => {
    renderPeek({ listingPurpose: 'rent' });
    const badge = screen.getByTestId('agri-peek-intent-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('For Rent');
  });

  it('does not render badge when listingPurpose is absent', () => {
    renderPeek(); // baseListing has no listingPurpose
    expect(screen.queryByTestId('agri-peek-intent-badge')).not.toBeInTheDocument();
  });

  it('does not render badge when listingPurpose is null', () => {
    renderPeek({ listingPurpose: null });
    expect(screen.queryByTestId('agri-peek-intent-badge')).not.toBeInTheDocument();
  });
});
