/**
 * #2859 B6 (handoff 285906) — e2e/discover-anon-price-consistency-1941.spec.ts row 5 (csv50, SEC),
 * R_control_existing replacement: the agri popover's anon negatives ("Sign in" copy, no band testid,
 * no rupee figure) with their positive controls in the SAME it. The existing
 * MarkerPopoverCard.test.tsx its (L103 / L157) carry no same-it control, so they are not cited for
 * the negative half. Real MarkerPopoverCard; fixtures are synthetic literals.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MarkerPopoverCard } from '../MarkerPopoverCard';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

function listing(overrides: Partial<PropertyListingWithImages>): PropertyListingWithImages {
  return {
    id: 'agri-2859', title: 'Paddy land 2859', property_type: 'agricultural_land', price: null, price_unit: null,
    latitude: 13.43, longitude: 74.75, locality: 'Brahmavar', land_area: 2.5, land_area_unit: 'acre',
    built_area: null, built_area_unit: null, bedrooms: null, bathrooms: null, contact_info: null, contact_phone: null,
    description: null, confidence_score: null, language_detected: null, price_per_cent_paise: null, is_valid: true,
    is_duplicate: false, status: 'LIVE', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    listing_purpose: 'sale', carpet_area: null, carpet_area_unit: null, floor_number: null, total_floors: null,
    furnishing_status: null, washrooms: null, parking_count: null, road_frontage_ft: null, commercial_usage: null,
    number_of_units: null, monthly_rent: null, security_deposit_months: null, lock_in_months: null, seller_type: null,
    raw_post_id: null, images: undefined,
    ...overrides,
  };
}

function mapRef(): React.RefObject<HTMLDivElement | null> {
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(div, 'clientHeight', { value: 400, configurable: true });
  return { current: div } as React.RefObject<HTMLDivElement | null>;
}

function renderCard(l: PropertyListingWithImages, isAuthenticated: boolean) {
  return render(
    <MarkerPopoverCard
      listing={l}
      isAuthenticated={isAuthenticated}
      markerPixelPos={{ x: 300, y: 200 }}
      mapContainerRef={mapRef()}
      onDismiss={vi.fn()}
      onViewDetails={vi.fn()}
      onShowInList={vi.fn()}
    />,
  );
}

const EXACT_RUPEE = /₹\d+(\.\d+)?\s?(Cr|L)\b/;

describe('#2859 B6 MarkerPopoverCard agri price gate with same-it controls', () => {
  it('1941-5 (L50): an anon agri popover shows "Sign in to view price", no popover-price-band and no rupee figure even when the listing object carries a price; controls in the same it: the authed viewer of the SAME listing sees "₹25 L", and an anon listing that does carry a band shows popover-price-band', () => {
    const agri = listing({ price: 2_500_000, priceBand: null });

    const anon = renderCard(agri, false);
    expect(screen.getByTestId('popover-price')).toHaveTextContent('Sign in to view price');
    expect(screen.queryByTestId('popover-price-band')).not.toBeInTheDocument();
    expect(screen.queryByText(EXACT_RUPEE)).not.toBeInTheDocument();
    expect(screen.getByTestId('popover-price').textContent).not.toContain('₹');
    anon.unmount();

    // Control 1 — only isAuthenticated varies.
    const authed = renderCard(agri, true);
    expect(screen.getByTestId('popover-price')).toHaveTextContent('₹25 L');
    expect(screen.getByTestId('popover-price')).not.toHaveTextContent('Sign in to view price');
    authed.unmount();

    // Control 2 — the band testid IS rendered when an anon listing carries a band (data input varies).
    renderCard(listing({ id: 'res-2859', property_type: 'house', price: null, priceBand: '₹1–2Cr' }), false);
    expect(screen.getByTestId('popover-price-band')).toHaveTextContent('₹1–2Cr');
  });
});
