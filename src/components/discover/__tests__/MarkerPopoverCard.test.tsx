/**
 * Tests for MarkerPopoverCard (a3 — PR #1606)
 *
 * Coverage:
 * - Price-gate: THREE cases (unauthenticated / authenticated+no price / authenticated+price)
 * - Never renders "₹null" or "₹NaN"
 * - Renders title, property-type pill, locality
 * - Image: shows <img> when images[0].url present; shows Building2 placeholder (no <img>) when absent
 * - Dismiss: close button calls onDismiss; Escape key calls onDismiss
 * - View details: calls onViewDetails with listing.id
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MarkerPopoverCard } from '../MarkerPopoverCard';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// ── Mocks ────────────────────────────────────────────────────────────────────
// MarkerPopoverCard imports lucide-react icons and @/components/ui/button.
// Neither requires a special mock — lucide renders SVG elements that jsdom handles,
// and the Button component uses standard HTML. No Leaflet or react-leaflet involved.

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal PropertyListingWithImages fixture. */
function makeListing(
  overrides: Partial<PropertyListingWithImages> = {},
): PropertyListingWithImages {
  return {
    id: 'listing-1',
    title: 'Sunny Apartment',
    property_type: 'apartment',
    price: null,
    price_unit: null,
    latitude: 13.34,
    longitude: 74.74,
    locality: 'Manipal',
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    bedrooms: null,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: 'LIVE',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    listing_purpose: 'sale',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: null,
    raw_post_id: null,
    images: undefined,
    ...overrides,
  };
}

/** Minimal mapContainerRef pointing to a 600×400 div */
function makeMapRef(): React.RefObject<HTMLDivElement | null> {
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(div, 'clientHeight', { value: 400, configurable: true });
  return { current: div } as React.RefObject<HTMLDivElement | null>;
}

const DEFAULT_MARKER_POS = { x: 300, y: 200 };

function renderCard(props: Partial<React.ComponentProps<typeof MarkerPopoverCard>> = {}) {
  const defaults: React.ComponentProps<typeof MarkerPopoverCard> = {
    listing: makeListing(),
    isAuthenticated: false,
    markerPixelPos: DEFAULT_MARKER_POS,
    mapContainerRef: makeMapRef(),
    onDismiss: vi.fn(),
    onViewDetails: vi.fn(),
    onShowInList: vi.fn(),
  };
  return render(<MarkerPopoverCard {...defaults} {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MarkerPopoverCard — price gate (THREE cases)', () => {
  it('case (a): isAuthenticated=false → renders "Sign in to view price"', () => {
    renderCard({ isAuthenticated: false, listing: makeListing({ price: 13_500_000 }) });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('Sign in to view price');
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });

  it('case (b): isAuthenticated=true & price=null → renders "Price not available" (NOT sign-in text)', () => {
    renderCard({ isAuthenticated: true, listing: makeListing({ price: null }) });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('Price not available');
    expect(priceEl).not.toHaveTextContent('Sign in to view price');
  });

  it('case (b) variant: isAuthenticated=true & price=0 → renders "Price not available"', () => {
    renderCard({ isAuthenticated: true, listing: makeListing({ price: 0 }) });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('Price not available');
  });

  it('case (c): isAuthenticated=true & price=13500000 → renders "₹1.35 Cr"', () => {
    renderCard({ isAuthenticated: true, listing: makeListing({ price: 13_500_000 }) });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('₹1.35 Cr');
    expect(priceEl).not.toHaveTextContent('Price not available');
    expect(priceEl).not.toHaveTextContent('Sign in to view price');
  });

  it('case (c) variant: isAuthenticated=true & price=1000000 → renders "₹10 L"', () => {
    renderCard({ isAuthenticated: true, listing: makeListing({ price: 1_000_000 }) });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('₹10 L');
  });

  it('never renders "₹null" or "₹NaN" regardless of auth state', () => {
    const { unmount } = renderCard({ isAuthenticated: true, listing: makeListing({ price: null }) });
    expect(screen.queryByText(/₹null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/₹NaN/)).not.toBeInTheDocument();
    unmount();

    renderCard({ isAuthenticated: false, listing: makeListing({ price: null }) });
    expect(screen.queryByText(/₹null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/₹NaN/)).not.toBeInTheDocument();
  });
});

describe('MarkerPopoverCard — anon priceBand fallback (Issue #1941)', () => {
  it('anon + priceBand present → renders the band string instead of "Sign in to view price"', () => {
    renderCard({
      isAuthenticated: false,
      listing: makeListing({ price: null, priceBand: '₹1–2Cr' }),
    });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('₹1–2Cr');
    expect(priceEl).not.toHaveTextContent('Sign in to view price');
  });

  it('anon + no priceBand → keeps the existing "Sign in to view price" copy', () => {
    renderCard({
      isAuthenticated: false,
      listing: makeListing({ price: null, priceBand: null }),
    });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('Sign in to view price');
  });

  it('authed + exact price present → renders the exact price, ignores priceBand', () => {
    renderCard({
      isAuthenticated: true,
      listing: makeListing({ price: 13_500_000, priceBand: '₹1–2Cr' }),
    });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('₹1.35 Cr');
    expect(priceEl).not.toHaveTextContent('₹1–2Cr');
  });
});

describe('MarkerPopoverCard — rent/lease arms (Issue #2051, AC6b/AC7)', () => {
  it('anon + monthlyRentBand present → renders the band string with "/mo", NOT the misleading "Sign in to view price" (AC7)', () => {
    renderCard({
      isAuthenticated: false,
      listing: makeListing({ listing_purpose: 'rent', price: null, priceBand: null, monthlyRentBand: '₹20–35K' }),
    });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('₹20–35K/mo');
    expect(priceEl).not.toHaveTextContent('Sign in to view price');
  });

  it('anon + lease listing with monthlyRentBand present → identical rendering to rent', () => {
    renderCard({
      isAuthenticated: false,
      listing: makeListing({ listing_purpose: 'lease', price: null, priceBand: null, monthlyRentBand: '₹20–35K' }),
    });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('₹20–35K/mo');
  });

  it('anon + no priceBand and no monthlyRentBand → keeps the existing "Sign in to view price" copy', () => {
    renderCard({
      isAuthenticated: false,
      listing: makeListing({ listing_purpose: 'rent', price: null, priceBand: null, monthlyRentBand: null }),
    });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('Sign in to view price');
  });

  it('authed + monthly_rent present → renders the exact rent with "/mo" (AC6b, AC8 no unit error: 25000 → ₹25K, not ₹250/₹25,00,000)', () => {
    renderCard({
      isAuthenticated: true,
      listing: makeListing({ listing_purpose: 'rent', price: null, monthly_rent: 25000 }),
    });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('₹25K/mo');
    expect(priceEl).not.toHaveTextContent('Price not available');
  });

  it('authed + lease listing with monthly_rent present → identical rendering to rent', () => {
    renderCard({
      isAuthenticated: true,
      listing: makeListing({ listing_purpose: 'lease', price: null, monthly_rent: 25000 }),
    });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('₹25K/mo');
  });

  it('authed + sale price present takes precedence over any (structurally absent) rent fields — sale rendering unchanged', () => {
    renderCard({
      isAuthenticated: true,
      listing: makeListing({ listing_purpose: 'sale', price: 13_500_000, monthly_rent: null }),
    });
    const priceEl = screen.getByTestId('popover-price');
    expect(priceEl).toHaveTextContent('₹1.35 Cr');
    expect(priceEl).not.toHaveTextContent('/mo');
  });

  it('authed + rent listing with no monthly_rent (AC4) → "Price not available", never a fabricated amount', () => {
    renderCard({
      isAuthenticated: true,
      listing: makeListing({ listing_purpose: 'rent', price: null, monthly_rent: null }),
    });
    expect(screen.getByTestId('popover-price')).toHaveTextContent('Price not available');
  });
});

describe('MarkerPopoverCard — content rendering', () => {
  it('renders the listing title', () => {
    renderCard({ listing: makeListing({ title: 'Ocean View Villa' }) });
    expect(screen.getByText('Ocean View Villa')).toBeInTheDocument();
  });

  it('renders the property-type pill label (apartment → "Apartment")', () => {
    renderCard({ listing: makeListing({ property_type: 'apartment' }) });
    expect(screen.getByText('Apartment')).toBeInTheDocument();
  });

  it('renders the property-type pill label for land type', () => {
    renderCard({ listing: makeListing({ property_type: 'land' }) });
    expect(screen.getByText('Land')).toBeInTheDocument();
  });

  it('renders the locality', () => {
    renderCard({ listing: makeListing({ locality: 'Udupi' }) });
    expect(screen.getByText('Udupi')).toBeInTheDocument();
  });

  it('does not crash when locality is null', () => {
    renderCard({ listing: makeListing({ locality: null }) });
    // Should render without locality — card still present
    expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
  });
});

describe('MarkerPopoverCard — image / placeholder', () => {
  it('renders an <img> element when images[0].url is present', () => {
    const imageUrl = 'https://example.com/photo.jpg';
    renderCard({
      listing: makeListing({
        images: [{ url: imageUrl }],
      }),
    });
    const img = screen.getByRole('img', { hidden: false });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', imageUrl);
  });

  it('renders no <img> element when images is undefined (shows placeholder icon)', () => {
    renderCard({ listing: makeListing({ images: undefined }) });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The Building2 lucide icon is rendered as an SVG (aria-hidden); the card itself is present
    expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
  });

  it('renders no <img> element when images is an empty array', () => {
    renderCard({ listing: makeListing({ images: [] }) });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('MarkerPopoverCard — dismiss behaviour', () => {
  it('clicking the close button calls onDismiss', () => {
    const onDismiss = vi.fn();
    renderCard({ onDismiss });
    fireEvent.click(screen.getByTestId('marker-popover-close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape calls onDismiss', () => {
    const onDismiss = vi.fn();
    renderCard({ onDismiss });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pressing a non-Escape key does NOT call onDismiss', () => {
    const onDismiss = vi.fn();
    renderCard({ onDismiss });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('MarkerPopoverCard — view details', () => {
  it('clicking View details calls onViewDetails with the listing id', () => {
    const onViewDetails = vi.fn();
    renderCard({
      listing: makeListing({ id: 'abc-123' }),
      onViewDetails,
    });
    fireEvent.click(screen.getByTestId('popover-view-details'));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledWith('abc-123');
  });
});

describe('MarkerPopoverCard — stepper (Issue #1810 AC8, MODEL A)', () => {
  it('shows "n/N" and enables both arrows for a middle sibling', () => {
    renderCard({
      stepper: { index: 2, total: 5, onPrev: vi.fn(), onNext: vi.fn() },
    });
    expect(screen.getByTestId('marker-popover-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('popover-stepper-label')).toHaveTextContent('3/5');
    expect(screen.getByTestId('popover-stepper-prev')).not.toBeDisabled();
    expect(screen.getByTestId('popover-stepper-next')).not.toBeDisabled();
  });

  it('disables the prev arrow at index 0 and the next arrow at the last index', () => {
    const { unmount } = renderCard({
      stepper: { index: 0, total: 3, onPrev: vi.fn(), onNext: vi.fn() },
    });
    expect(screen.getByTestId('popover-stepper-prev')).toBeDisabled();
    expect(screen.getByTestId('popover-stepper-next')).not.toBeDisabled();
    unmount();

    renderCard({
      stepper: { index: 2, total: 3, onPrev: vi.fn(), onNext: vi.fn() },
    });
    expect(screen.getByTestId('popover-stepper-next')).toBeDisabled();
  });

  it('clicking next/prev calls the corresponding callback', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    renderCard({ stepper: { index: 1, total: 3, onPrev, onNext } });
    fireEvent.click(screen.getByTestId('popover-stepper-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('popover-stepper-prev'));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('hides the stepper entirely for a standalone listing (stepper=null)', () => {
    renderCard({ stepper: null });
    expect(screen.queryByTestId('marker-popover-stepper')).not.toBeInTheDocument();
  });

  it('hides the stepper when total<=1 even if a stepper object is passed defensively', () => {
    renderCard({ stepper: { index: 0, total: 1, onPrev: vi.fn(), onNext: vi.fn() } });
    expect(screen.queryByTestId('marker-popover-stepper')).not.toBeInTheDocument();
  });
});

describe('MarkerPopoverCard — Show in list (Issue #1810 AC9)', () => {
  it('clicking "Show in list" calls onShowInList with the listing id (not onViewDetails, no navigation)', () => {
    const onShowInList = vi.fn();
    const onViewDetails = vi.fn();
    renderCard({
      listing: makeListing({ id: 'listing-xyz' }),
      onShowInList,
      onViewDetails,
    });
    fireEvent.click(screen.getByTestId('popover-show-in-list'));
    expect(onShowInList).toHaveBeenCalledTimes(1);
    expect(onShowInList).toHaveBeenCalledWith('listing-xyz');
    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it('"View details" still navigates independently of Show in list', () => {
    const onShowInList = vi.fn();
    const onViewDetails = vi.fn();
    renderCard({
      listing: makeListing({ id: 'listing-xyz' }),
      onShowInList,
      onViewDetails,
    });
    fireEvent.click(screen.getByTestId('popover-view-details'));
    expect(onViewDetails).toHaveBeenCalledWith('listing-xyz');
    expect(onShowInList).not.toHaveBeenCalled();
  });
});

describe('MarkerPopoverCard — no tier/trust badge (Issue #1810 AC10)', () => {
  it('never renders a tier/trust badge testid or copy, regardless of props', () => {
    renderCard({
      stepper: { index: 0, total: 2, onPrev: vi.fn(), onNext: vi.fn() },
    });
    expect(screen.queryByTestId(/trust/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/tier/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trusted/i)).not.toBeInTheDocument();
  });

  // Issue #1954 (AC8b) — as of this issue, PropertyListing (via discoverMappers)
  // can now carry a non-null public trustBadge word on the underlying listing
  // object. MarkerPopoverCard must still render NO badge at all (this component
  // has no badge UI) — the field being populated upstream must not silently grow
  // a badge here. Guards against a future regression that reads listing.trustBadge
  // in this file without a corresponding, deliberate design decision.
  it('renders no badge even when the listing carries a populated trustBadge word', () => {
    renderCard({
      listing: makeListing({ trustBadge: 'verified' }),
    });
    expect(screen.queryByTestId(/trust/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/tier/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/badge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('renders no raw A-D grade letter anywhere in the card DOM', () => {
    const { container } = renderCard({
      listing: makeListing({ trustBadge: 'listed' }),
    });
    // Sanity: the card itself rendered (not an empty tree false-positive).
    expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    const text = container.textContent ?? '';
    for (const grade of ['A', 'B', 'C', 'D']) {
      // Standalone-letter check (avoid false positives from words containing these letters).
      expect(new RegExp(`(^|\\s)${grade}(\\s|$)`).test(text)).toBe(false);
    }
  });
});
