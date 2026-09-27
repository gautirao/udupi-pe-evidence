import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useListingHydration } from '../useListingHydration';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Minimal ListingResponse fixture — only `id` is read by useListingHydration
// itself; the rest satisfy the required interface shape.
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

function makeHydrators() {
  return {
    base: vi.fn(),
    shared: vi.fn(),
    commercial: vi.fn(),
    rent: vi.fn(),
    agri: vi.fn(),
    residential: vi.fn(),
  };
}

describe('useListingHydration', () => {
  it('calls all 6 hydrator fns exactly once for the first listing', () => {
    const hydrators = makeHydrators();
    const listing = makeListing({ id: 'listing-1' });

    renderHook(({ listing: l }) => useListingHydration(l, hydrators), {
      initialProps: { listing: listing as ListingResponse | null | undefined },
    });

    expect(hydrators.base).toHaveBeenCalledTimes(1);
    expect(hydrators.base).toHaveBeenCalledWith(listing);
    expect(hydrators.shared).toHaveBeenCalledTimes(1);
    expect(hydrators.commercial).toHaveBeenCalledTimes(1);
    expect(hydrators.rent).toHaveBeenCalledTimes(1);
    expect(hydrators.agri).toHaveBeenCalledTimes(1);
    expect(hydrators.residential).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-call any hydrator when the same id arrives as a structurally-new object reference', () => {
    const hydrators = makeHydrators();
    const listing1 = makeListing({ id: 'listing-1', title: 'Server Title' });

    const { rerender } = renderHook(
      ({ listing: l }) => useListingHydration(l, hydrators),
      { initialProps: { listing: listing1 as ListingResponse | null | undefined } },
    );

    expect(hydrators.base).toHaveBeenCalledTimes(1);

    // Same id, SAME server values, but a genuinely fresh object reference —
    // simulates a background refetch echo (#2294).
    const listing2 = makeListing({ id: 'listing-1', title: 'Server Title' });
    expect(listing2).not.toBe(listing1);

    rerender({ listing: listing2 });

    expect(hydrators.base).toHaveBeenCalledTimes(1);
    expect(hydrators.shared).toHaveBeenCalledTimes(1);
    expect(hydrators.commercial).toHaveBeenCalledTimes(1);
    expect(hydrators.rent).toHaveBeenCalledTimes(1);
    expect(hydrators.agri).toHaveBeenCalledTimes(1);
    expect(hydrators.residential).toHaveBeenCalledTimes(1);
  });

  it('re-calls all 6 hydrator fns when a DIFFERENT listing id arrives', () => {
    const hydrators = makeHydrators();
    const listing1 = makeListing({ id: 'listing-1' });

    const { rerender } = renderHook(
      ({ listing: l }) => useListingHydration(l, hydrators),
      { initialProps: { listing: listing1 as ListingResponse | null | undefined } },
    );

    expect(hydrators.base).toHaveBeenCalledTimes(1);

    const listing2 = makeListing({ id: 'listing-2' });
    rerender({ listing: listing2 });

    expect(hydrators.base).toHaveBeenCalledTimes(2);
    expect(hydrators.base).toHaveBeenLastCalledWith(listing2);
    expect(hydrators.shared).toHaveBeenCalledTimes(2);
    expect(hydrators.commercial).toHaveBeenCalledTimes(2);
    expect(hydrators.rent).toHaveBeenCalledTimes(2);
    expect(hydrators.agri).toHaveBeenCalledTimes(2);
    expect(hydrators.residential).toHaveBeenCalledTimes(2);
  });
});
