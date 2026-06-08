/**
 * AgriListingPanel — Issue #1374
 *
 * AC1: Loading state renders skeleton (no crash).
 * AC2: Error state renders user-friendly message.
 * AC3a: All fields populated → all rows in DOM.
 * AC3b: All agri fields null → no crash, no blank rows.
 * AC3c: Price + computedAreaAcres present → price-per-acre row visible.
 * AC3d: Price absent → price-per-acre row absent.
 * AC3e: computedAreaAcres absent → price-per-acre + Approx. area rows absent.
 * AC4: boundary non-empty string → disclaimer visible.
 * AC5: boundary null → disclaimer absent.
 * AC6: boundary empty string "" → disclaimer absent.
 * AC7: Back button click → onBack() called once.
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

function renderPanel(listingId = 'listing-1', onBack = vi.fn()) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <AgriListingPanel listingId={listingId} onBack={onBack} />
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

  // AC3a — All fields populated
  it('AC3a: all populated fields appear in the panel', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: fullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.getByTestId('agri-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('Shirva')).toBeInTheDocument();
    expect(screen.getByText('SY 12/3A')).toBeInTheDocument();
    expect(screen.getByText('2.5 acres')).toBeInTheDocument();
    expect(screen.getByText(/≈ 2.48 acres/)).toBeInTheDocument();
    expect(screen.getByText('Well')).toBeInTheDocument();
    expect(screen.getByText('Red laterite')).toBeInTheDocument();
    expect(screen.getByText('Tar road')).toBeInTheDocument();
    expect(screen.getByText('Currently cultivated')).toBeInTheDocument();
    expect(screen.getByText('Freehold')).toBeInTheDocument();
  });

  // AC3b — All agri fields null → no crash, no blank rows
  it('AC3b: renders without crashing when all agri fields are null', () => {
    const nullListing = {
      ...fullListing,
      locality: null,
      surveyNumber: null,
      landArea: null,
      landAreaUnit: null,
      computedAreaAcres: null,
      price: null,
      waterSource: null,
      soilType: null,
      roadAccess: null,
      cultivationStatus: null,
      ownershipType: null,
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
    // No label rows should contain blank values — confirm specific labels absent
    expect(screen.queryByText('Locality')).not.toBeInTheDocument();
    expect(screen.queryByText('Survey number')).not.toBeInTheDocument();
    expect(screen.queryByText('Price per acre')).not.toBeInTheDocument();
  });

  // AC3c — Price + computedAreaAcres both present → price-per-acre visible
  it('AC3c: shows price-per-acre when price and computedAreaAcres are both positive', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: fullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    // price=5000000, computedAreaAcres=2.48 → ~2016129/acre
    expect(screen.getByText('Price per acre')).toBeInTheDocument();
  });

  // AC3d — Price absent → price-per-acre row absent
  it('AC3d: omits price-per-acre row when price is null', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: { ...fullListing, price: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.queryByText('Price per acre')).not.toBeInTheDocument();
    // Price row itself is also absent
    expect(screen.queryByText('Price')).not.toBeInTheDocument();
  });

  // AC3e — computedAreaAcres absent → price-per-acre + Approx. area rows absent
  it('AC3e: omits price-per-acre and Approx. area rows when computedAreaAcres is null', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: { ...fullListing, computedAreaAcres: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.queryByText('Price per acre')).not.toBeInTheDocument();
    expect(screen.queryByText('Approx. area')).not.toBeInTheDocument();
  });

  // AC4 — boundary non-empty string → disclaimer visible
  it('AC4: shows boundary disclaimer when boundary is a non-empty string', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: fullListing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.getByTestId('agri-boundary-disclaimer')).toBeInTheDocument();
    expect(
      screen.getByText(/The boundary drawn on the map is approximate/i),
    ).toBeInTheDocument();
  });

  // AC5 — boundary null → disclaimer absent
  it('AC5: hides boundary disclaimer when boundary is null', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: { ...fullListing, boundary: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.queryByTestId('agri-boundary-disclaimer')).not.toBeInTheDocument();
  });

  // AC6 — boundary empty string "" → disclaimer absent
  it('AC6: hides boundary disclaimer when boundary is an empty string', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: { ...fullListing, boundary: '' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.queryByTestId('agri-boundary-disclaimer')).not.toBeInTheDocument();
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

  // AC3f — price === 0 → price row absent, price-per-acre absent
  it('AC3f: omits price and price-per-acre rows when price is 0', () => {
    mockUseAgriListingDetail.mockReturnValue({
      data: { ...fullListing, price: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();
    expect(screen.queryByText('Price')).not.toBeInTheDocument();
    expect(screen.queryByText('Price per acre')).not.toBeInTheDocument();
  });
});
