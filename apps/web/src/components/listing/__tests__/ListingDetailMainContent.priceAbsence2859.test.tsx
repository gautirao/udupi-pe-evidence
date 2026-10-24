/**
 * #2859 B6 (handoff 285906) — e2e/discover-anon-price-consistency-1941.spec.ts row 7 (csv50),
 * R_control_existing replacement: honest absence (null price + null band -> no rupee, no band) with
 * its positive controls in the SAME it. The existing ListingDetailMainContent.test.tsx L117 has no
 * same-it control. The component has no viewer prop, so the pair is a data-shape pair (PR-5 note).
 * Child widgets stubbed exactly as ListingDetailMainContent.test.tsx:16-27.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ListingDetailMainContent } from '../ListingDetailMainContent';
import type { PublicListingDetail } from '@/pages/ListingDetail';

vi.mock('@/components/listing/SimilarListings', () => ({ SimilarListings: () => null }));
vi.mock('@/components/poi/NearbyPois', () => ({ NearbyPois: () => null }));
vi.mock('@/components/poi/PoiMiniMap', () => ({ PoiMiniMap: () => null }));
vi.mock('@/components/listing/NearbySchoolsCard', () => ({ NearbySchoolsCard: () => null }));

const base: PublicListingDetail = {
  id: 'l2859', propertyType: 'house', images: [], title: 'Absence house 2859', locality: 'Manipal',
  listingPurpose: 'sale', createdAt: '2026-08-01T00:00:00Z',
};

const renderMain = (listing: PublicListingDetail) =>
  render(
    <ListingDetailMainContent listing={listing} label="Independent house" badgeClass="bg-secondary" priceHistory={[]} trustBadges={undefined} />,
  );

describe('#2859 B6 ListingDetailMainContent honest price absence with same-it controls', () => {
  it('1941-7 (L50): null price + null band renders no rupee figure and no band; controls in the same it: a band-only listing renders the band, an exact-price listing renders "₹1.35 Cr"', () => {
    const absent = renderMain({ ...base, price: null, pricePaise: null, priceBand: null });
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
    expect(screen.queryByText('₹1–2Cr')).not.toBeInTheDocument();
    absent.unmount();

    const band = renderMain({ ...base, price: null, pricePaise: null, priceBand: '₹1–2Cr' });
    expect(screen.getByText('₹1–2Cr')).toBeInTheDocument();
    band.unmount();

    renderMain({ ...base, price: 13_500_000, pricePaise: 1_350_000_000, priceBand: null });
    expect(screen.getByText('₹1.35 Cr')).toBeInTheDocument();
  });
});
