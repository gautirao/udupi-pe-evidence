import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBaseFields } from '../useBaseFields';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Minimal ListingResponse fixture — only the fields useBaseFields.hydrate()
// reads are meaningful here; the rest satisfy the required interface shape.
function makeListing(overrides: Partial<ListingResponse>): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'apartment',
    title: null,
    locality: null,
    price: null,
    description: null,
    landArea: null,
    landAreaUnit: null,
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
    latitude: null,
    longitude: null,
    addressConfirmed: false,
    imageCount: 0,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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
    areaKey: null,
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    ...overrides,
  };
}

describe('useBaseFields', () => {
  it('initializes all 14 values to their defaults', () => {
    const { result } = renderHook(() => useBaseFields());

    expect(result.current.values).toEqual({
      title: '',
      description: '',
      priceRupees: null,
      propertyType: '',
      locality: '',
      landArea: null,
      landAreaUnit: 'cent',
      bedrooms: '',
      builtArea: null,
      builtAreaUnit: 'sqft',
      reraNumber: '',
      videoUrl: '',
      listingPurpose: 'sale',
      boundaryCoords: [],
    });
  });

  it('setters round-trip into values', () => {
    const { result } = renderHook(() => useBaseFields());

    act(() => {
      result.current.setters.setTitle('My Title');
      result.current.setters.setDescription('A description');
      result.current.setters.setPriceRupees(5000000);
      result.current.setters.setPropertyType('apartment');
      result.current.setters.setLocality('Manipal');
      result.current.setters.setLandArea(10);
      result.current.setters.setLandAreaUnit('acre');
      result.current.setters.setBedrooms('3');
      result.current.setters.setBuiltArea(1200);
      result.current.setters.setBuiltAreaUnit('sqm');
      result.current.setters.setReraNumber('RERA123');
      result.current.setters.setVideoUrl('https://example.com/v.mp4');
      result.current.setters.setListingPurpose('rent');
      result.current.setters.setBoundaryCoords([[13.1, 74.1]]);
    });

    expect(result.current.values).toEqual({
      title: 'My Title',
      description: 'A description',
      priceRupees: 5000000,
      propertyType: 'apartment',
      locality: 'Manipal',
      landArea: 10,
      landAreaUnit: 'acre',
      bedrooms: '3',
      builtArea: 1200,
      builtAreaUnit: 'sqm',
      reraNumber: 'RERA123',
      videoUrl: 'https://example.com/v.mp4',
      listingPurpose: 'rent',
      boundaryCoords: [[13.1, 74.1]],
    });
  });

  it('hydrate() sets all fields from a listing', () => {
    const { result } = renderHook(() => useBaseFields());
    const listing = makeListing({
      title: 'Server Title',
      description: 'Server description',
      price: 4200000,
      propertyType: 'apartment',
      locality: 'Manipal',
      landArea: 5,
      landAreaUnit: 'sqft',
      bedrooms: 2,
      builtArea: 900,
      builtAreaUnit: 'sqft',
      reraNumber: 'RERA999',
      videoUrl: 'https://example.com/v.mp4',
      listingPurpose: 'rent',
    });

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values).toEqual({
      title: 'Server Title',
      description: 'Server description',
      priceRupees: 4200000,
      propertyType: 'apartment',
      locality: 'Manipal',
      landArea: 5,
      landAreaUnit: 'sqft',
      bedrooms: '2',
      builtArea: 900,
      builtAreaUnit: 'sqft',
      reraNumber: 'RERA999',
      videoUrl: 'https://example.com/v.mp4',
      listingPurpose: 'rent',
      boundaryCoords: [],
    });
  });

  it("hydrate() falls back landAreaUnit to 'cent' for non-agri listings with a null unit", () => {
    const { result } = renderHook(() => useBaseFields());
    const listing = makeListing({ propertyType: 'apartment', landAreaUnit: null });

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values.landAreaUnit).toBe('cent');
  });

  it("hydrate() falls back landAreaUnit to 'acre' for agricultural_land listings with a null unit", () => {
    const { result } = renderHook(() => useBaseFields());
    const listing = makeListing({ propertyType: 'agricultural_land', landAreaUnit: null });

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values.landAreaUnit).toBe('acre');
  });

  it('hydrate() coerces bedrooms to a String, and falls back to empty string for null', () => {
    const { result } = renderHook(() => useBaseFields());

    act(() => {
      result.current.hydrate(makeListing({ bedrooms: 4 }));
    });
    expect(result.current.values.bedrooms).toBe('4');

    act(() => {
      result.current.hydrate(makeListing({ id: 'listing-2', bedrooms: null }));
    });
    expect(result.current.values.bedrooms).toBe('');
  });

  it('hydrate() falls back to empty string/null for null scalar fields', () => {
    const { result } = renderHook(() => useBaseFields());
    const listing = makeListing({
      title: null,
      description: null,
      price: null,
      locality: null,
      landArea: null,
      reraNumber: null,
      videoUrl: null,
      listingPurpose: null,
    });

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values.title).toBe('');
    expect(result.current.values.description).toBe('');
    expect(result.current.values.priceRupees).toBeNull();
    expect(result.current.values.locality).toBe('');
    expect(result.current.values.landArea).toBeNull();
    expect(result.current.values.reraNumber).toBe('');
    expect(result.current.values.videoUrl).toBe('');
    expect(result.current.values.listingPurpose).toBe('sale');
  });

  it('hydrate() sets boundaryCoords from listing.boundary when present', () => {
    const { result } = renderHook(() => useBaseFields());
    const listing = {
      ...makeListing({}),
      boundary: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[74.1, 13.1], [74.2, 13.1], [74.2, 13.2], [74.1, 13.1]]],
      }),
    };

    act(() => {
      result.current.hydrate(listing);
    });

    expect(result.current.values.boundaryCoords).toEqual([
      [13.1, 74.1],
      [13.1, 74.2],
      [13.2, 74.2],
    ]);
  });

  it('hydrate() KEEPS the prior boundaryCoords when the next listing has no boundary (preserved quirk)', () => {
    const { result } = renderHook(() => useBaseFields());
    const listingWithBoundary = {
      ...makeListing({ id: 'listing-1' }),
      boundary: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[74.1, 13.1], [74.2, 13.1], [74.2, 13.2], [74.1, 13.1]]],
      }),
    };

    act(() => {
      result.current.hydrate(listingWithBoundary);
    });
    expect(result.current.values.boundaryCoords).toHaveLength(3);

    // Switching to a different listing id with NO boundary must NOT clear
    // the previous boundaryCoords — this is the existing quirk (no `else`
    // branch on `if (listing.boundary)`), preserved verbatim from the
    // pre-extraction EditListingForm.tsx hydration effect.
    const listingWithoutBoundary = makeListing({ id: 'listing-2' });

    act(() => {
      result.current.hydrate(listingWithoutBoundary);
    });

    expect(result.current.values.boundaryCoords).toHaveLength(3);
  });
});
