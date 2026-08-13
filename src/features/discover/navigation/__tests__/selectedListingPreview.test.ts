/**
 * Issue #1956 PR-4 (AC4.10) — unit coverage for the anonymous-safe
 * selected-listing preview data contract. The tsc-level guarantee (the anon
 * arm cannot carry `pricePaise`) is asserted by the type definitions
 * themselves (this file would fail to compile if it tried); the runtime
 * DISCARD test below proves the projection actively drops an authenticated
 * field even when the source listing happens to carry it.
 */
import { describe, it, expect } from 'vitest';
import { toSelectedListingPreview, toSelectedListingPreviewFromMarkerListing } from '../selectedListingPreview';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

function makeListing(overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    propertyType: 'apartment',
    bedrooms: 3,
    primaryImageUrl: 'https://example.test/img.jpg',
    trustBadge: 'verified',
    title: 'Sunrise Apartments',
    ...overrides,
  };
}

describe('toSelectedListingPreview', () => {
  it('anon caller -> kind "anon", carries priceBand, structurally no pricePaise field', () => {
    const listing = makeListing({ priceBand: '₹50L–1Cr' });
    const preview = toSelectedListingPreview(listing, { isAuthenticated: false, areaLabel: 'Manipal' });

    expect(preview.kind).toBe('anon');
    if (preview.kind === 'anon') {
      expect(preview.priceBand).toBe('₹50L–1Cr');
      // @ts-expect-error — pricePaise is structurally absent on the anon arm.
      expect(preview.pricePaise).toBeUndefined();
    }
  });

  it('authed caller -> kind "authed", carries pricePaise, structurally no priceBand field', () => {
    const listing = makeListing({ pricePaise: 5_000_000_00 });
    const preview = toSelectedListingPreview(listing, { isAuthenticated: true, areaLabel: 'Manipal' });

    expect(preview.kind).toBe('authed');
    if (preview.kind === 'authed') {
      expect(preview.pricePaise).toBe(5_000_000_00);
      // @ts-expect-error — priceBand is structurally absent on the authed arm.
      expect(preview.priceBand).toBeUndefined();
    }
  });

  it('DISCARD test — a listing carrying pricePaise is still projected to the anon shape (pricePaise dropped) when isAuthenticated is false', () => {
    const listing = makeListing({ pricePaise: 5_000_000_00, priceBand: '₹50L–1Cr' });
    const preview = toSelectedListingPreview(listing, { isAuthenticated: false, areaLabel: 'Manipal' });

    expect(preview.kind).toBe('anon');
    expect(Object.prototype.hasOwnProperty.call(preview, 'pricePaise')).toBe(false);
  });

  it('DISCARD test — a listing carrying priceBand is still projected to the authed shape (priceBand dropped) when isAuthenticated is true', () => {
    const listing = makeListing({ pricePaise: 5_000_000_00, priceBand: '₹50L–1Cr' });
    const preview = toSelectedListingPreview(listing, { isAuthenticated: true, areaLabel: 'Manipal' });

    expect(preview.kind).toBe('authed');
    expect(Object.prototype.hasOwnProperty.call(preview, 'priceBand')).toBe(false);
  });

  it('reuses trustBadge verbatim, never redefines it', () => {
    const listing = makeListing({ trustBadge: 'trusted' });
    const preview = toSelectedListingPreview(listing, { isAuthenticated: true, areaLabel: 'Manipal' });
    expect(preview.trustBadge).toBe('trusted');
  });

  it('carries the listing title through verbatim (Issue #2150 — identity parity with MarkerPopoverCard/PropertyCard)', () => {
    const listing = makeListing({ title: 'Sunrise Apartments, 3BHK' });
    const preview = toSelectedListingPreview(listing, { isAuthenticated: false, areaLabel: 'Manipal' });
    expect(preview.title).toBe('Sunrise Apartments, 3BHK');
  });

  it('null-safe defaults for optional fields absent on the source listing', () => {
    const listing: DiscoverCityListingItem = { id: 'x' };
    const preview = toSelectedListingPreview(listing, { isAuthenticated: false, areaLabel: 'Manipal' });
    expect(preview.primaryImageUrl).toBeNull();
    expect(preview.propertyType).toBeNull();
    expect(preview.bedrooms).toBeNull();
    expect(preview.trustBadge).toBeNull();
    expect(preview.title).toBeNull();
    expect(preview.areaLabel).toBe('Manipal');
    expect(preview.id).toBe('x');
  });
});

/**
 * Issue #2149 — school-first counterpart. `selectedMarkerListing` is a
 * `PropertyListingWithImages` (snake_case `property_type`/`price_unit`,
 * RUPEES `price`), a different shape from `DiscoverCityListingItem` above.
 */
function makeMarkerListing(overrides: Partial<PropertyListingWithImages> = {}): PropertyListingWithImages {
  return {
    id: 'm1a2b3c4-0000-0000-0000-000000000001',
    property_type: 'apartment',
    bedrooms: 2,
    images: [{ url: 'https://example.test/marker-img.jpg' }],
    trustBadge: 'verified',
    title: 'Marker Listing Title',
    ...overrides,
  } as PropertyListingWithImages;
}

describe('toSelectedListingPreviewFromMarkerListing', () => {
  it('anon caller -> kind "anon", carries priceBand, structurally no pricePaise field', () => {
    const listing = makeMarkerListing({ priceBand: '₹50L–1Cr' });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: false,
      cityLabel: 'Bangalore',
    });

    expect(preview.kind).toBe('anon');
    if (preview.kind === 'anon') {
      expect(preview.priceBand).toBe('₹50L–1Cr');
      // @ts-expect-error — pricePaise is structurally absent on the anon arm.
      expect(preview.pricePaise).toBeUndefined();
    }
  });

  it('authed caller -> converts RUPEES `price` to PAISE `pricePaise` (x100), never passes price through unconverted', () => {
    const listing = makeMarkerListing({ price: 5_000_000 });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: true,
      cityLabel: 'Bangalore',
    });

    expect(preview.kind).toBe('authed');
    if (preview.kind === 'authed') {
      expect(preview.pricePaise).toBe(5_000_000_00);
      // @ts-expect-error — priceBand is structurally absent on the authed arm.
      expect(preview.priceBand).toBeUndefined();
    }
  });

  it('authed caller with null price -> pricePaise null (not 0, not NaN)', () => {
    const listing = makeMarkerListing({ price: null });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: true,
      cityLabel: 'Bangalore',
    });
    expect(preview.kind).toBe('authed');
    if (preview.kind === 'authed') {
      expect(preview.pricePaise).toBeNull();
    }
  });

  it('maps snake_case property_type and the first image URL', () => {
    const listing = makeMarkerListing({
      property_type: 'house',
      images: [{ url: 'https://example.test/first.jpg' }, { url: 'https://example.test/second.jpg' }],
    });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: false,
      cityLabel: 'Bangalore',
    });
    expect(preview.propertyType).toBe('house');
    expect(preview.primaryImageUrl).toBe('https://example.test/first.jpg');
  });

  it('areaLabel prefers listing.locality over the cityLabel fallback', () => {
    const listing = makeMarkerListing({ locality: 'Koramangala' });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: false,
      cityLabel: 'Bangalore',
    });
    expect(preview.areaLabel).toBe('Koramangala');
  });

  it('areaLabel falls back to cityLabel when locality is absent (cross-area school-first has no single AREA)', () => {
    const listing = makeMarkerListing({ locality: null });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: false,
      cityLabel: 'Bangalore',
    });
    expect(preview.areaLabel).toBe('Bangalore');
  });

  it('reuses trustBadge verbatim, never redefines it', () => {
    const listing = makeMarkerListing({ trustBadge: 'trusted' });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: true,
      cityLabel: 'Bangalore',
    });
    expect(preview.trustBadge).toBe('trusted');
  });

  it('carries the listing title through verbatim (Issue #2150 — identity parity with MarkerPopoverCard)', () => {
    const listing = makeMarkerListing({ title: 'Koramangala Duplex' });
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: false,
      cityLabel: 'Bangalore',
    });
    expect(preview.title).toBe('Koramangala Duplex');
  });

  it('null-safe defaults for optional fields absent on the source listing', () => {
    const listing = { id: 'm2' } as PropertyListingWithImages;
    const preview = toSelectedListingPreviewFromMarkerListing(listing, {
      isAuthenticated: false,
      cityLabel: 'Bangalore',
    });
    expect(preview.primaryImageUrl).toBeNull();
    expect(preview.propertyType).toBeNull();
    expect(preview.bedrooms).toBeNull();
    expect(preview.trustBadge).toBeNull();
    expect(preview.title).toBeNull();
    expect(preview.areaLabel).toBe('Bangalore');
    expect(preview.id).toBe('m2');
  });
});
