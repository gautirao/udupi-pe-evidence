/**
 * #2859 B6 (handoff 285906) — e2e/discover-anon-price-consistency-1941.spec.ts row 6 (csv50, SEC),
 * R_control_existing replacement: the agri detail anon sign-in CTA vs the authed price, both arms in
 * the SAME it (AgriListingDetail.test.tsx L177 / L196 split them over two its). The viewer
 * (user null vs a user) and the server projection that comes with it (price withheld vs present) are
 * the only inputs varied. Child widgets stubbed exactly as AgriListingDetail.test.tsx:22-42.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

vi.mock('@/components/listing/ListingDetailBoundaryMap', () => ({ ListingDetailBoundaryMap: () => <div data-testid="boundary-map" /> }));
vi.mock('@/components/poi/NearbyPois', () => ({ NearbyPois: () => <div data-testid="nearby-pois" /> }));
vi.mock('@/components/listing/SimilarListings', () => ({ SimilarListings: () => <div data-testid="similar-listings" /> }));
vi.mock('@/components/listing/AreaMarketWidget', () => ({ AreaMarketWidget: () => <div data-testid="area-market" /> }));
vi.mock('@/components/listing/ListingGallery', () => ({ ListingGallery: () => <div data-testid="gallery" /> }));
vi.mock('@/hooks/useSchoolSearch', () => ({ useNearbySchools: () => ({ data: null, isLoading: false, isError: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AgriListingDetail } from '../AgriListingDetail';
import type { PublicListingDetail } from '@/pages/ListingDetail';

const ANON = {
  id: 'agri-2859', propertyType: 'agricultural_land', title: 'Agri gate 2859', locality: 'Hebri', listingNumber: 2859,
  images: [], price: null, pricePaise: null, surveyNumber: null, landArea: 2.5, landAreaUnit: 'acres',
  boundary: null, latitude: 13.34, longitude: 74.74, computedAreaAcres: null,
} as unknown as PublicListingDetail;
const AUTHED = { ...ANON, price: 2_500_000, pricePaise: 250_000_000 } as unknown as PublicListingDetail;
const USER = { id: 'u-2859', email: 'synthetic@example.invalid' } as User;

const renderDetail = (listing: PublicListingDetail, user: User | null) =>
  render(
    <MemoryRouter>
      <AgriListingDetail listing={listing} user={user} copied={false} onShare={vi.fn()} onOpenBookingModal={vi.fn()} />
    </MemoryRouter>,
  );

describe('#2859 B6 AgriListingDetail anon CTA vs authed price, same it', () => {
  it('1941-6 (L50): anon sees agri-detail-price-signin and no "₹25 L"; the authed viewer in the same it sees "₹25 L" and no agri-detail-price-signin', () => {
    const anon = renderDetail(ANON, null);
    expect(screen.getByTestId('agri-detail-price-signin')).toHaveTextContent(/sign in to view price/i);
    expect(screen.queryAllByText(/₹25 L/)).toHaveLength(0);
    anon.unmount();

    renderDetail(AUTHED, USER);
    expect(screen.getAllByText(/₹25 L/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('agri-detail-price-signin')).not.toBeInTheDocument();
  });
});
