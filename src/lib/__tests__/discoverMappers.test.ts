import { describe, it, expect } from 'vitest';
import { filteredMarkerToPropertyListing, cityListingToPropertyListing } from '../discoverMappers';
import { DiscoverFilteredMarker } from '@/hooks/useDiscoverFilteredMarkers';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

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
});
