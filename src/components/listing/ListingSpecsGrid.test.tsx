/**
 * ListingSpecsGrid — unit tests for #1617 (R4)
 *
 * Type-adaptive specs: field-presence driven, value-distinct per type.
 *
 *   T1  — Apartment: bedrooms, bathrooms, builtArea, furnishing shown
 *   T2  — House: bedrooms, bathrooms, builtArea, furnishing shown
 *   T3  — Plot/land: landArea shown; bedrooms/bathrooms absent
 *   T4  — Commercial: roadFrontage and commercialUsage shown; bedrooms absent
 *   T5  — No agri-only fields (soilType/cultivationStatus/boundary) rendered
 *         for a non-agri type (these live in AgriSpecRows, not here)
 *   T6  — Returns null when no spec fields present (anonymous teaser / empty)
 *   T7  — Rent terms rendered when listingPurpose=rent + securityDepositMonths present
 *   T8  — Rent terms absent when listingPurpose=sale
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListingSpecsGrid } from './ListingSpecsGrid';
import type { PublicListingDetail } from '@/pages/ListingDetail';

// Minimal listing factory — only supply fields under test.
function makeListing(overrides: Partial<PublicListingDetail>): PublicListingDetail {
  return {
    id: 'l-1',
    propertyType: 'apartment',
    title: 'Test',
    status: 'LIVE',
    images: [],
    listingPurpose: 'sale',
    sellerType: 'broker',
    ...overrides,
  } as unknown as PublicListingDetail;
}

describe('ListingSpecsGrid — type-adaptive specs', () => {
  // T1 — Apartment: bedrooms, bathrooms, builtArea, furnishing
  it('T1 — Apartment: shows bedrooms, bathrooms, builtArea, furnishing', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'apartment',
          bedrooms: 3,
          bathrooms: 2,
          builtArea: 1200,
          builtAreaUnit: 'sqft',
          furnishingStatus: 'semi_furnished',
        })}
      />,
    );
    expect(screen.getByTestId('spec-bedrooms')).toHaveTextContent('3 BHK');
    expect(screen.getByTestId('spec-bathrooms')).toHaveTextContent('2');
    expect(screen.getByTestId('spec-built-area')).toBeInTheDocument();
    expect(screen.getByTestId('spec-furnishing')).toHaveTextContent(/semi furnished/i);
  });

  // T2 — House: same residential fields
  it('T2 — House: shows bedrooms, bathrooms, builtArea, furnishing', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'house',
          bedrooms: 4,
          bathrooms: 3,
          builtArea: 2000,
          builtAreaUnit: 'sqft',
          furnishingStatus: 'furnished',
        })}
      />,
    );
    expect(screen.getByTestId('spec-bedrooms')).toHaveTextContent('4 BHK');
    expect(screen.getByTestId('spec-bathrooms')).toHaveTextContent('3');
    expect(screen.getByTestId('spec-built-area')).toBeInTheDocument();
    expect(screen.getByTestId('spec-furnishing')).toHaveTextContent(/furnished/i);
  });

  // T3 — Plot/land: landArea shown; no bedrooms/bathrooms
  it('T3 — land: shows landArea; no bedrooms or bathrooms', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'land',
          landArea: 10,
          landAreaUnit: 'cents',
        })}
      />,
    );
    expect(screen.getByTestId('spec-land-area')).toBeInTheDocument();
    expect(screen.queryByTestId('spec-bedrooms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spec-bathrooms')).not.toBeInTheDocument();
  });

  // T4 — Commercial: roadFrontage and commercialUsage shown; no bedrooms
  it('T4 — commercial: shows roadFrontage and usage; no bedrooms', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'commercial',
          roadFrontageFt: 30,
          commercialUsage: 'retail',
        })}
      />,
    );
    expect(screen.getByTestId('spec-road-frontage')).toHaveTextContent('30 ft');
    expect(screen.getByTestId('spec-commercial-usage')).toHaveTextContent(/retail/i);
    expect(screen.queryByTestId('spec-bedrooms')).not.toBeInTheDocument();
  });

  // T5 — No agri-only fields (soilType, cultivationStatus) rendered
  //       because ListingSpecsGrid does NOT render them — that's AgriSpecRows.
  //       We verify these fields are NOT in the grid even when they appear on listing.
  it('T5 — no agri-only fields (soilType / cultivationStatus) rendered in specs grid', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'house',
          bedrooms: 2,
          // These agri fields appear on the DTO but must NOT appear in the grid
          soilType: 'Red laterite',
          cultivationStatus: 'Cultivated',
          boundary: '{"type":"Polygon"}',
        } as Partial<PublicListingDetail>)}
      />,
    );
    // The grid section IS rendered (bedrooms present), but agri text is absent
    expect(screen.getByTestId('listing-specs-grid')).toBeInTheDocument();
    expect(screen.queryByText('Red laterite')).not.toBeInTheDocument();
    expect(screen.queryByText('Cultivated')).not.toBeInTheDocument();
  });

  // T6 — Returns null when no spec fields present (anonymous teaser)
  it('T6 — returns null when listing has no spec fields (anonymous teaser)', () => {
    const { container } = render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'apartment',
          // No bedrooms, bathrooms, areas, etc.
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  // T7 — Rent terms rendered when listingPurpose=rent + securityDepositMonths
  it('T7 — rent terms rendered when listingPurpose=rent and securityDepositMonths present', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'apartment',
          listingPurpose: 'rent',
          bedrooms: 2,
          securityDepositMonths: 3,
          lockInMonths: 11,
        })}
      />,
    );
    expect(screen.getByText(/rental terms/i)).toBeInTheDocument();
    expect(screen.getByText(/3 months/i)).toBeInTheDocument();
    expect(screen.getByText(/11 months/i)).toBeInTheDocument();
  });

  // T8 — Rent terms absent when listingPurpose=sale
  it('T8 — no rental terms section when listingPurpose=sale', () => {
    render(
      <ListingSpecsGrid
        listing={makeListing({
          propertyType: 'apartment',
          listingPurpose: 'sale',
          bedrooms: 2,
          securityDepositMonths: 3, // present on DTO but should not render for sale
        })}
      />,
    );
    expect(screen.queryByText(/rental terms/i)).not.toBeInTheDocument();
  });
});
