/**
 * AgriListingPanel — Issue #1405 (peek demote)
 *
 * AC1: Loading state renders skeleton (no crash).
 * AC2: Error state renders user-friendly message + back button + retry.
 * AC3a: Populated state shows compact peek fields: locality, land area, price (when present).
 * AC3b: All agri fields null → no crash, no blank rows.
 * AC7: Back button click → onBack() called once (populated state).
 * AC7b: Back button click → onBack() called once (error state).
 * AC_CTA: "View full details" CTA is present and calls onNavigate when clicked.
 *
 * NOT TESTED HERE (re-homed):
 * - AgriSpecRows field rows (water source, soil type, road access, cultivation,
 *   ownership, survey) → coverage in /listing/:id component tests (#1406 tests)
 * - boundary-disclaimer coverage re-homed to /listing/:id (#1406 tests)
 * - price-per-acre → not shown in peek; coverage in AgriSpecRows tests
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockUseAgriListingDetail = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAgriListingDetail', () => ({
  useAgriListingDetail: mockUseAgriListingDetail,
}));

// ── Component under test ──────────────────────────────────────────────────────

import { AgriListingPanel } from './AgriListingPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel(
  listingId = 'listing-1',
  onBack = vi.fn(),
  onNavigate = vi.fn(),
) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <AgriListingPanel listingId={listingId} onBack={onBack} onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
}

/** Full agri listing fixture — all nullable fields populated. */
const fullListing = {
  id: 'listing-1',
  status: 'LIVE',
  propertyType: 'agricultural_land',
  title: 'River-facing paddy field',
  locality: 'Shirva',
  price: 5000000,
  description: null,
  landArea: 2.5,
  landAreaUnit: 'acres',
  bedrooms: null,
  builtArea: null,
  builtAreaUnit: null,
  latitude: 13.2,
  longitude: 74.8,
  addressConfirmed: true,
  imageCount: 0,
  firstImageUrl: null,
  rejectionReason: null,
  videoUrl: null,
  reraNumber: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  listingPurpose: null,
  carpetArea: null,
  carpetAreaUnit: null,
  floorNumber: null,
  totalFloors: null,
  furnishingStatus: null,
  washrooms: null,
  parkingCount: null,
  roadFrontageFt: null,
  commercialUsage: null,
  numberOfUnits: null,
  monthlyRent: null,
  securityDepositMonths: null,
  lockInMonths: null,
  sellerType: null,
  earnedBadgeCount: 0,
  areaKey: 'IN|KA|Udupi|Shirva',
  waterSource: 'Well',
  soilType: 'Red laterite',
  roadAccess: 'Tar road',
  cultivationStatus: 'Currently cultivated',
  ownershipType: 'Freehold',
  surveyNumber: 'SY 12/3A',
  boundary: '{"type":"Polygon","coordinates":[[[74.8,13.2],[74.81,13.2],[74.81,13.21],[74.8,13.21],[74.8,13.2]]]}',
  computedAreaAcres: 2.48,
  images: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgriListingPanel', () => {
  beforeEach(() => {
    mockUseAgriListingDetail.mockReset();
  });

  // AC1 — Loading state
  it('AC1: renders skeleton while loading without crashing', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.getByTestId('agri-detail-loading')).toBeInTheDocument();
    // No crash and no data rows
    expect(screen.queryByTestId('agri-detail-panel')).not.toBeInTheDocument();
  });

  // AC2 — Error state
  it('AC2: renders user-friendly error message on fetch failure', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.getByTestId('agri-detail-error')).toBeInTheDocument();
    expect(screen.getByText(/could not load plot details/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // AC3a — Compact peek fields visible when populated
  it('AC3a: populated state shows locality, land area, and price in peek panel', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: fullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.getByTestId('agri-detail-panel')).toBeInTheDocument();
    // Title in header
    expect(screen.getByTestId('agri-detail-title')).toHaveTextContent('River-facing paddy field');
    // Locality row
    expect(screen.getByText('Shirva')).toBeInTheDocument();
    // Land area row
    expect(screen.getByText(/2\.5\s*acres/i)).toBeInTheDocument();
    // Price row (price=5000000 > 0)
    expect(screen.getByText(/₹/)).toBeInTheDocument();
  });

  // AC3b — All agri fields null → no crash, no blank rows
  it('AC3b: renders without crashing when all agri fields are null', () => {
    const nullListing = {
      ...fullListing,
      locality: null,
      landArea: null,
      landAreaUnit: null,
      price: null,
      boundary: null,
    };
    mockUseAgriListingDetail.mockReturnValue({
      data: nullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.getByTestId('agri-detail-panel')).toBeInTheDocument();
    // No label rows with blank values
    expect(screen.queryByText('Locality')).not.toBeInTheDocument();
    expect(screen.queryByText('Land area')).not.toBeInTheDocument();
    expect(screen.queryByText('Price')).not.toBeInTheDocument();
  });

  // AC7 — Back button → onBack() called (populated state)
  it('AC7: calls onBack when the back button is clicked (populated state)', () => {
    const onBack = vi.fn();
    mockUseAgriListingDetail.mockReturnValue({
      data: fullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel('listing-1', onBack);
    fireEvent.click(screen.getByRole('button', { name: /back to area listings/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // AC7b — Back button → onBack() called (error state)
  it('AC7b: calls onBack when the back button is clicked in error state', () => {
    const onBack = vi.fn();
    mockUseAgriListingDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderPanel('listing-1', onBack);
    fireEvent.click(screen.getByRole('button', { name: /back to area listings/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // AC_CTA — "View full details" CTA present and calls onNavigate
  it('AC_CTA: "View full details" CTA button is present and calls onNavigate when clicked', () => {
    const onNavigate = vi.fn();
    mockUseAgriListingDetail.mockReturnValue({
      data: fullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel('listing-1', vi.fn(), onNavigate);
    const cta = screen.getByTestId('agri-view-full-details-cta');
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  // FE-T6 — pricePaise is threaded to the peek price display (#1452)
  // Simulates the agri seed condition: pricePaise=12500000 (₹1.25 L in paise) and
  // deprecated price=0 (absent from agri seed). Proves pricePaise is used.
  it('FE-T6: pricePaise=12500000 with price=0 renders ₹1.25 L price (not blank/zero)', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: {
        ...fullListing,
        pricePaise: 12_500_000, // ₹1.25 L in paise (100 paise = ₹1)
        price: 0,               // deprecated field — 0 in agri seed
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    // Price row must be visible and show ₹1.25 L
    const priceCell = screen.getByTestId('agri-peek-price');
    expect(priceCell).toBeInTheDocument();
    expect(priceCell).toHaveTextContent('₹1.25 L');
    // Must NOT show 0 or blank
    expect(priceCell.textContent).not.toBe('₹0');
    expect(priceCell.textContent).not.toBe('');
  });
});
