import { describe, it, expect } from 'vitest';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { mapAnonViewportCard, type AnonViewportListingItem } from '../anonViewportListing';

// Full raw card as the backend's bbox-only CityAreaListingsResponse would
// carry it — anon callers never populate pricePaise/monthlyRentRupees (the
// interface allows them structurally for the shared authenticated shape,
// but a real anon response never does), so this stays band-only, matching
// production reality.
const FULL_CARD: DiscoverCityListingItem = {
  id: 'l1',
  priceBand: '₹50L–1Cr',
  monthlyRentBand: null,
  propertyType: 'apartment',
  locality: 'Koramangala',
  primaryImageUrl: 'https://cdn/img.jpg',
  listingPurpose: 'sale',
  bedrooms: 3,
  title: 'Sunny 3BHK',
  bathrooms: 2,
  builtArea: 1500,
  builtAreaUnit: 'sqft',
  landArea: null,
  landAreaUnit: null,
  totalFloors: 4,
  parkingCount: 1,
  furnishingStatus: 'semi',
  createdAt: '2026-05-01T00:00:00Z',
  confirmedAt: '2026-05-02T00:00:00Z',
  trustBadge: 'verified',
  lat: 12.9352,
  lon: 77.6146,
  latitude: 12.9352,
  longitude: 77.6146,
};

describe('mapAnonViewportCard', () => {
  it('normalizes a full raw card into the AnonViewportListingItem shape, tagged with kind and areaKey', () => {
    const item = mapAnonViewportCard(FULL_CARD, 'IN|KA|Bengaluru|Koramangala');

    expect(item.id).toBe('l1');
    expect(item.kind).toBe('ANON_VIEWPORT');
    expect(item.areaKey).toBe('IN|KA|Bengaluru|Koramangala');
    expect(item.priceBand).toBe('₹50L–1Cr');
    expect(item.monthlyRentBand).toBeNull();
    expect(item.propertyType).toBe('apartment');
    expect(item.locality).toBe('Koramangala');
    expect(item.primaryImageUrl).toBe('https://cdn/img.jpg');
    expect(item.listingPurpose).toBe('sale');
    expect(item.bedrooms).toBe(3);
    expect(item.title).toBe('Sunny 3BHK');
    expect(item.bathrooms).toBe(2);
    expect(item.builtArea).toBe(1500);
    expect(item.builtAreaUnit).toBe('sqft');
    expect(item.totalFloors).toBe(4);
    expect(item.parkingCount).toBe(1);
    expect(item.furnishingStatus).toBe('semi');
    expect(item.createdAt).toBe('2026-05-01T00:00:00Z');
    expect(item.confirmedAt).toBe('2026-05-02T00:00:00Z');
    expect(item.trustBadge).toBe('verified');
    expect(item.lat).toBe(12.9352);
    expect(item.lon).toBe(77.6146);
    expect(item.latitude).toBe(12.9352);
    expect(item.longitude).toBe(77.6146);
  });

  it('carries the monthly-rent band through for rent/lease listings', () => {
    const rentCard: DiscoverCityListingItem = {
      ...FULL_CARD,
      priceBand: null,
      monthlyRentBand: '₹20–35K',
      listingPurpose: 'rent',
    };
    const item = mapAnonViewportCard(rentCard, 'IN|KA|Bengaluru|Koramangala');
    expect(item.monthlyRentBand).toBe('₹20–35K');
    expect(item.priceBand).toBeNull();
    expect(item.listingPurpose).toBe('rent');
  });

  it('never carries exact-price fields on the output — the type structurally omits them', () => {
    // Simulate a (contract-violating) raw card that DOES carry exact-price
    // fields, to prove mapAnonViewportCard drops them rather than forwarding
    // them through — the #2015 hard constraint documented on the module.
    const cardWithExactPrice = {
      ...FULL_CARD,
      pricePaise: 5_000_000_00,
      monthlyRentRupees: 25_000,
    } as DiscoverCityListingItem;

    const item = mapAnonViewportCard(cardWithExactPrice, 'IN|KA|Bengaluru|Koramangala');

    // Structural: AnonViewportListingItem has no pricePaise/monthlyRentRupees
    // keys, so this assignment would be a type error if the omission ever
    // regressed — the runtime checks back it up.
    const itemKeys = Object.keys(item);
    expect(itemKeys).not.toContain('pricePaise');
    expect(itemKeys).not.toContain('monthlyRentRupees');
    expect((item as unknown as Record<string, unknown>).pricePaise).toBeUndefined();
    expect((item as unknown as Record<string, unknown>).monthlyRentRupees).toBeUndefined();
  });

  it('accepts a null areaKey (bbox-only mode groups by discovered area, which may be unresolved)', () => {
    const item = mapAnonViewportCard(FULL_CARD, null);
    expect(item.areaKey).toBeNull();
  });

  it('defaults optional/missing fields to null rather than crashing on a sparse card', () => {
    const sparse: DiscoverCityListingItem = { id: 'l2' };
    const item = mapAnonViewportCard(sparse, 'IN|KA|Bengaluru|Koramangala');

    expect(item.id).toBe('l2');
    expect(item.priceBand).toBeNull();
    expect(item.monthlyRentBand).toBeNull();
    expect(item.primaryImageUrl).toBeNull();
    expect(item.bedrooms).toBeNull();
    expect(item.title).toBeNull();
    expect(item.bathrooms).toBeNull();
    expect(item.builtArea).toBeNull();
    expect(item.builtAreaUnit).toBeNull();
    expect(item.landArea).toBeNull();
    expect(item.landAreaUnit).toBeNull();
    expect(item.totalFloors).toBeNull();
    expect(item.parkingCount).toBeNull();
    expect(item.furnishingStatus).toBeNull();
    expect(item.createdAt).toBeNull();
    expect(item.confirmedAt).toBeNull();
    expect(item.trustBadge).toBeNull();
    expect(item.lat).toBeNull();
    expect(item.lon).toBeNull();
    expect(item.latitude).toBeNull();
    expect(item.longitude).toBeNull();
    expect(item.kind).toBe('ANON_VIEWPORT');
  });

  it('preserves an explicit null priceBand/monthlyRentBand rather than coercing to undefined', () => {
    const noPrice: DiscoverCityListingItem = { ...FULL_CARD, priceBand: null, monthlyRentBand: null };
    const item = mapAnonViewportCard(noPrice, 'IN|KA|Bengaluru|Koramangala');
    expect(item.priceBand).toBeNull();
    expect(item.monthlyRentBand).toBeNull();
  });

  it('maps an empty array of raw cards to an empty array of AnonViewportListingItem', () => {
    const items: AnonViewportListingItem[] = ([] as DiscoverCityListingItem[]).map((c) =>
      mapAnonViewportCard(c, 'IN|KA|Bengaluru|Koramangala'),
    );
    expect(items).toEqual([]);
  });
});
