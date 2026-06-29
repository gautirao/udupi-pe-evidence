/**
 * AgriListingDetail — Issue #1454 (anon/auth agri visibility gating).
 *
 * PR #1475 routed agri `/listing/:id` to AgriListingDetail instead of
 * ListingDetailMainContent → AgriSpecRows. This test locks the anon
 * sign-in affordances that #1454 requires (price + survey number) onto the
 * new component:
 *   - Sidebar price slot shows a "Sign in to view price" CTA when anon + no price.
 *   - Summary fact grid shows a locked price tile when anon + no price.
 *   - Property Overview shows a survey-number sign-in CTA when anon + no survey.
 *   - Authed users see the real price/survey values and no CTAs.
 *
 * Child components are stubbed — these tests cover gating logic only.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

vi.mock('@/components/listing/ListingDetailBoundaryMap', () => ({
  ListingDetailBoundaryMap: () => <div data-testid="boundary-map" />,
}));
vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => <div data-testid="nearby-pois" />,
}));
vi.mock('@/components/listing/SimilarListings', () => ({
  SimilarListings: () => <div data-testid="similar-listings" />,
}));
vi.mock('@/components/listing/AreaMarketWidget', () => ({
  AreaMarketWidget: () => <div data-testid="area-market" />,
}));
vi.mock('@/components/listing/ListingGallery', () => ({
  ListingGallery: () => <div data-testid="gallery" />,
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useNearbySchools: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { AgriListingDetail } from './AgriListingDetail';
import type { PublicListingDetail } from '@/pages/ListingDetail';

// Anonymous fixture — backend withholds price/survey and coarsens coordinates.
const BASE_AGRI_LISTING = {
  id: 'agri-001',
  propertyType: 'agricultural_land',
  title: 'Test Agri Land',
  locality: 'Hebri',
  listingNumber: 1001,
  images: [],
  // anon-withheld fields:
  price: null,
  pricePaise: null,
  surveyNumber: null,
  // non-sensitive:
  landArea: 2.5,
  landAreaUnit: 'acres',
  waterSource: 'Bore well',
  soilType: 'Red laterite',
  roadAccess: 'Metalled road',
  cultivationStatus: 'Partly cultivated',
  ownershipType: 'Freehold',
  boundary: null,
  latitude: 13.34, // coarsened (anon)
  longitude: 74.74,
  computedAreaAcres: null,
} as unknown as PublicListingDetail;

const AUTHED_AGRI_LISTING = {
  ...BASE_AGRI_LISTING,
  price: 2500000,
  pricePaise: 250000000,
  surveyNumber: '124/3A',
  latitude: 13.34091, // exact (authed)
  longitude: 74.74215,
} as unknown as PublicListingDetail;

const mockUser = { id: 'user-123', email: 'test@test.com' } as User;

function renderDetail(listing: PublicListingDetail, user: User | null) {
  return render(
    <MemoryRouter>
      <AgriListingDetail
        listing={listing}
        user={user}
        copied={false}
        onShare={vi.fn()}
        onOpenBookingModal={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/**
 * AgriListingDetail — Sidebar "View Trends" CTA canonicalization (#1670)
 *
 *   A1 — valid areaKey (4+ segments, known district, non-empty last) →
 *        "View Trends" renders as a link with href /trends/{citySlug}/areas/{slug},
 *        no '|' / '%7C' in the URL (RE1, RE2)
 *   A2 — areaKey null → CTA is a disabled button, no link rendered
 *   A3 — areaKey with <4 segments (IN|KA) → CTA hidden (disabled btn only)
 *   A4 — empty last segment (IN|KA|Udupi|) → CTA hidden
 *   A5 — unknown district → CTA hidden (no DEFAULT_CITY mis-route)
 *
 * Known district used for A1: "Udupi" → citySlug "udupi" (per DISTRICT_TO_CITY_SLUG).
 * Unknown district used for A5: "Kodagu" (not in DISTRICT_TO_CITY_SLUG map).
 */

describe('AgriListingDetail — Sidebar "View Trends" CTA canonicalization (#1670)', () => {
  it('A1 — valid areaKey (IN|KA|Udupi|Malpe) → link href /trends/udupi/areas/malpe (RE1)', () => {
    const listing = {
      ...BASE_AGRI_LISTING,
      areaKey: 'IN|KA|Udupi|Malpe',
    } as unknown as PublicListingDetail;
    renderDetail(listing, mockUser);
    const link = screen.getByRole('link', { name: /view trends/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/trends/udupi/areas/malpe');
  });

  it('A1 — generated href contains no raw pipe | (RE2)', () => {
    const listing = {
      ...BASE_AGRI_LISTING,
      areaKey: 'IN|KA|Udupi|Malpe',
    } as unknown as PublicListingDetail;
    renderDetail(listing, mockUser);
    const link = screen.getByRole('link', { name: /view trends/i });
    expect(link.getAttribute('href')).not.toContain('|');
    expect(link.getAttribute('href')).not.toMatch(/%7C/i);
  });

  it('A2 — areaKey null → no "View Trends" link rendered, only disabled button', () => {
    const listing = {
      ...BASE_AGRI_LISTING,
      areaKey: null,
    } as unknown as PublicListingDetail;
    renderDetail(listing, mockUser);
    expect(screen.queryByRole('link', { name: /view trends/i })).not.toBeInTheDocument();
    // Disabled button still present (not hidden, just non-navigable)
    const btn = screen.getByRole('button', { name: /view trends/i });
    expect(btn).toBeDisabled();
  });

  it('A3 — areaKey with <4 segments (IN|KA) → no "View Trends" link', () => {
    const listing = {
      ...BASE_AGRI_LISTING,
      areaKey: 'IN|KA',
    } as unknown as PublicListingDetail;
    renderDetail(listing, mockUser);
    expect(screen.queryByRole('link', { name: /view trends/i })).not.toBeInTheDocument();
  });

  it('A4 — areaKey with empty last segment (IN|KA|Udupi|) → no "View Trends" link', () => {
    const listing = {
      ...BASE_AGRI_LISTING,
      areaKey: 'IN|KA|Udupi|',
    } as unknown as PublicListingDetail;
    renderDetail(listing, mockUser);
    expect(screen.queryByRole('link', { name: /view trends/i })).not.toBeInTheDocument();
  });

  it('A5 — unknown district (IN|KA|Kodagu|Madikeri) → no "View Trends" link (no mis-route)', () => {
    const listing = {
      ...BASE_AGRI_LISTING,
      areaKey: 'IN|KA|Kodagu|Madikeri',
    } as unknown as PublicListingDetail;
    renderDetail(listing, mockUser);
    expect(screen.queryByRole('link', { name: /view trends/i })).not.toBeInTheDocument();
  });
});

describe('AgriListingDetail — anon visibility gating (#1454)', () => {
  it('anon: shows price sign-in CTA in sidebar when price is null', () => {
    renderDetail(BASE_AGRI_LISTING, null);
    const cta = screen.getByTestId('agri-detail-price-signin');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent(/sign in to view price/i);
  });

  it('anon: shows locked price fact tile when price is null', () => {
    renderDetail(BASE_AGRI_LISTING, null);
    expect(screen.getByTestId('agri-detail-price-locked-tile')).toBeInTheDocument();
  });

  it('anon: shows survey number sign-in CTA when surveyNumber is null', () => {
    renderDetail(BASE_AGRI_LISTING, null);
    const cta = screen.getByTestId('agri-detail-survey-signin');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent(/sign in to view/i);
  });

  it('authed: shows price value in sidebar, no sign-in CTA', () => {
    renderDetail(AUTHED_AGRI_LISTING, mockUser);
    // 2500000 → ₹25 L (formatPrice drops the decimal for whole lakhs)
    expect(screen.getAllByText(/₹25 L/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('agri-detail-price-signin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-price-locked-tile')).not.toBeInTheDocument();
  });

  it('authed: shows survey number value, no sign-in CTA', () => {
    renderDetail(AUTHED_AGRI_LISTING, mockUser);
    expect(screen.getByText('124/3A')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-survey-signin')).not.toBeInTheDocument();
  });
});
