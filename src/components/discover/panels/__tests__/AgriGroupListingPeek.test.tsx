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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockUseAgriListingDetail = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAgriListingDetail', () => ({
  useAgriListingDetail: mockUseAgriListingDetail,
}));

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
