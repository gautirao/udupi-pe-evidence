import { describe, it, expect } from 'vitest';
import {
  filteredMarkerToPropertyListing,
  cityListingToPropertyListing,
  discoverListingToPropertyListing,
  discoverListingToCityListing,
} from '../discoverMappers';
import { DiscoverFilteredMarker } from '@/hooks/useDiscoverFilteredMarkers';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { DiscoverListingItem } from '@/hooks/useDiscoverListings';

describe('filteredMarkerToPropertyListing', () => {
  const now = '2026-05-27T00:00:00.000Z';

  it('maps lat/lon from DiscoverFilteredMarker to PropertyListing latitude/longitude', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'abc123',
      lat: 13.3498,
      lon: 74.7852,
      pricePaise: 5000000,
      locality: 'Katapadi',
    };
    const result = filteredMarkerToPropertyListing(marker, now);
    expect(result.latitude).toBe(13.3498);
    expect(result.longitude).toBe(74.7852);
    expect(result.id).toBe('abc123');
  });

  it('produces defined (non-undefined) coordinates so property pins render on map', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'xyz',
      lat: 12.9716,
      lon: 77.5946,
      pricePaise: null,
      locality: null,
    };
    const result = filteredMarkerToPropertyListing(marker, now);
    expect(result.latitude).not.toBeUndefined();
    expect(result.longitude).not.toBeUndefined();
    expect(result.latitude).toBeTypeOf('number');
    expect(result.longitude).toBeTypeOf('number');
  });

  // Issue #1941 — thread priceBand from the marker into PropertyListing.
  it('copies priceBand from DiscoverFilteredMarker when present', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'band1',
      lat: 13.3498,
      lon: 74.7852,
      pricePaise: null,
      locality: 'Katapadi',
      priceBand: '₹1–2Cr',
    };
    const result = filteredMarkerToPropertyListing(marker, now);
    expect(result.priceBand).toBe('₹1–2Cr');
  });

  it('sets priceBand to null when absent on DiscoverFilteredMarker', () => {
    const marker: DiscoverFilteredMarker = {
      id: 'band2',
      lat: 13.3498,
      lon: 74.7852,
      pricePaise: 5000000,
      locality: 'Katapadi',
    };
    const result = filteredMarkerToPropertyListing(marker, now);
    expect(result.priceBand).toBeNull();
  });
});

// ── cityListingToPropertyListing (a3 mapper dependency — PR #1606) ────────────
// Tests that the a3 mapper change correctly threads primaryImageUrl into images
// so MarkerPopoverCard can display the listing image.

describe('cityListingToPropertyListing — a3 mapper (PR #1606)', () => {
  const now = '2026-06-23T00:00:00.000Z';

  /** Minimal DiscoverCityListingItem with required lat/lon. */
  function makeCityListing(
    overrides: Partial<DiscoverCityListingItem & { lat: number; lon: number }> = {},
  ): DiscoverCityListingItem & { lat: number; lon: number } {
    return {
      id: 'city-listing-1',
      lat: 13.34,
      lon: 74.74,
      pricePaise: undefined,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
      title: 'Test Apartment',
      ...overrides,
    };
  }

  it('maps primaryImageUrl into images[0].url when primaryImageUrl is present', () => {
    const imageUrl = 'https://cdn.example.com/listing.jpg';
    const result = cityListingToPropertyListing(
      makeCityListing({ primaryImageUrl: imageUrl }),
      now,
    );
    expect(result.images).toBeDefined();
    expect(result.images).toHaveLength(1);
    expect(result.images![0].url).toBe(imageUrl);
  });

  it('leaves images undefined when primaryImageUrl is null', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ primaryImageUrl: null }),
      now,
    );
    expect(result.images).toBeUndefined();
  });

  it('leaves images undefined when primaryImageUrl is absent (undefined)', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ primaryImageUrl: undefined }),
      now,
    );
    expect(result.images).toBeUndefined();
  });

  it('computes price = pricePaise / 100 when pricePaise is present', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ pricePaise: 135_000_000 }), // ₹13,500,000 in paise = ₹1.35 Cr in rupees
      now,
    );
    expect(result.price).toBe(1_350_000); // Math.round(135_000_000 / 100)
  });

  it('sets price to null when pricePaise is null/undefined', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ pricePaise: undefined }),
      now,
    );
    expect(result.price).toBeNull();
  });

  it('maps latitude and longitude from lat/lon', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ lat: 13.3409, lon: 74.7421 }),
      now,
    );
    expect(result.latitude).toBe(13.3409);
    expect(result.longitude).toBe(74.7421);
  });

  // Issue #1941 — thread priceBand from DiscoverCityListingItem (anon /cities response).
  it('copies priceBand when present', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ priceBand: '₹1–2Cr' }),
      now,
    );
    expect(result.priceBand).toBe('₹1–2Cr');
  });

  it('sets priceBand to null when absent', () => {
    const result = cityListingToPropertyListing(
      makeCityListing({ priceBand: undefined }),
      now,
    );
    expect(result.priceBand).toBeNull();
  });
});

// ── discoverListingToPropertyListing — trustBadge pass-through (Issue #1954) ──
// The frontend-only fix: DiscoverListingItem already carries the public trustBadge
// word from the backend; the mapper previously dropped it. Confirms it now carries
// through, is null-safe when absent, and that no raw internal A-D letter grade can
// ever leak into the mapped PropertyListing (DiscoverListingItem has no such field).

describe('discoverListingToPropertyListing — trustBadge pass-through (Issue #1954)', () => {
  const now = '2026-07-23T00:00:00.000Z';

  function makeDiscoverListing(overrides: Partial<DiscoverListingItem> = {}): DiscoverListingItem {
    return {
      id: 'listing-1',
      listingNumber: null,
      propertyType: 'apartment',
      title: 'Test Apartment',
      locality: 'Manipal',
      areaKey: 'IN|KA|Udupi|Manipal',
      pricePaise: 5_000_000_00,
      landArea: null,
      landAreaUnit: null,
      builtArea: null,
      builtAreaUnit: null,
      bedrooms: 2,
      latitude: 13.34,
      longitude: 74.74,
      heroImageUrl: null,
      createdAt: now,
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 0,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      possessionStatus: null,
      sellerType: null,
      listingPurpose: 'sale',
      status: 'LIVE',
      ...overrides,
    };
  }

  it.each(['verified', 'trusted', 'listed'] as const)(
    'carries trustBadge "%s" through unchanged',
    (badge) => {
      const result = discoverListingToPropertyListing(makeDiscoverListing({ trustBadge: badge }), now);
      expect(result.trustBadge).toBe(badge);
    },
  );

  it('sets trustBadge to null when absent (undefined) on the source item', () => {
    const result = discoverListingToPropertyListing(makeDiscoverListing({ trustBadge: undefined }), now);
    expect(result.trustBadge).toBeNull();
  });

  it('sets trustBadge to null when explicitly null on the source item', () => {
    const result = discoverListingToPropertyListing(makeDiscoverListing({ trustBadge: null }), now);
    expect(result.trustBadge).toBeNull();
  });

  it('never emits a raw A-D letter grade — only the three public words or null', () => {
    const allowed = new Set(['verified', 'trusted', 'listed', null]);
    for (const badge of ['verified', 'trusted', 'listed', undefined, null] as const) {
      const result = discoverListingToPropertyListing(makeDiscoverListing({ trustBadge: badge }), now);
      expect(allowed.has(result.trustBadge ?? null)).toBe(true);
      expect(['A', 'B', 'C', 'D']).not.toContain(result.trustBadge);
    }
  });
});

// Issue #2836 (batch B of #2750) — the discoverMappers.ts:188-195 seam. The viewport feed
// (/api/discover/listings -> DiscoverListingItem) is re-shaped into the city-listing card shape by
// `discoverListingToCityListing`; the commercial subtype and the allowlisted fact columns must
// survive that spread by EXACT value. The legacy e2e oracle for this (discover-commercial-card-summary)
// passed on an area-only fact, and the PropertyCard tests start AFTER this mapper, so neither could
// notice the mapper dropping or blanking the facts.
describe('discoverListingToCityListing — commercial passthrough (#2836 A2-3)', () => {
  const now = '2026-07-23T00:00:00.000Z';

  function makeItem(overrides: Partial<DiscoverListingItem> = {}): DiscoverListingItem {
    return {
      id: 'listing-c1',
      listingNumber: null,
      propertyType: 'commercial',
      title: 'Shop on Main Road',
      locality: 'Manipal',
      areaKey: 'IN|KA|Udupi|Manipal',
      pricePaise: null,
      landArea: null,
      landAreaUnit: null,
      builtArea: 450,
      builtAreaUnit: 'sq ft',
      bedrooms: null,
      latitude: 13.34,
      longitude: 74.74,
      heroImageUrl: 'https://img.example/hero.jpg',
      createdAt: now,
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 0,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      possessionStatus: null,
      sellerType: null,
      listingPurpose: 'sale',
      status: 'LIVE',
      ...overrides,
    };
  }

  const FACTS = {
    floorChoice: 'GROUND',
    floorMode: 'SINGLE',
    floorNumber: 0,
    totalFloors: 3,
    hubType: 'HIGH_STREET',
    officeSeats: 12,
    occupancyStatus: 'VACANT',
    warehouseClearHeightFt: 18,
    warehouseLoadingBays: 2,
    roadFrontageFt: 30,
  };

  it('carries commercialSubtype and the EXACT commercialFacts object through the spread', () => {
    const result = discoverListingToCityListing(
      makeItem({ commercialSubtype: 'SHOP', commercialFacts: FACTS }),
    );

    expect(result.commercialSubtype).toBe('SHOP');
    expect(result.commercialFacts).toEqual(FACTS);
    // Every individual fact survives by value, so a partial drop or a per-key blanking is caught too.
    for (const [key, value] of Object.entries(FACTS)) {
      expect((result.commercialFacts as Record<string, unknown>)[key]).toBe(value);
    }
  });

  it('keeps a zero-valued fact as 0 (honest value), not null or absent', () => {
    const result = discoverListingToCityListing(
      makeItem({ commercialSubtype: 'OFFICE', commercialFacts: { floorNumber: 0, officeSeats: 0 } }),
    );

    expect(result.commercialFacts).toEqual({ floorNumber: 0, officeSeats: 0 });
    expect(result.commercialFacts?.officeSeats).toBe(0);
  });

  it('control: an item with null facts maps to null facts (nothing is fabricated)', () => {
    const result = discoverListingToCityListing(
      makeItem({ commercialSubtype: 'SHOP', commercialFacts: null }),
    );

    expect(result.commercialSubtype).toBe('SHOP');
    expect(result.commercialFacts).toBeNull();
  });

  it('residential item without commercial fields: neither field is invented, and the card-shape remap still applies', () => {
    const result = discoverListingToCityListing(makeItem({ propertyType: 'apartment' }));

    expect(result.commercialSubtype).toBeUndefined();
    expect(result.commercialFacts).toBeUndefined();
    expect(result.primaryImageUrl).toBe('https://img.example/hero.jpg');
    expect(result.lat).toBe(13.34);
    expect(result.lon).toBe(74.74);
  });
});
