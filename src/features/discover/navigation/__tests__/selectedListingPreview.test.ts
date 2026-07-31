/**
 * Issue #1956 PR-4 (AC4.10) — unit coverage for the anonymous-safe
 * selected-listing preview data contract. The tsc-level guarantee (the anon
 * arm cannot carry `pricePaise`) is asserted by the type definitions
 * themselves (this file would fail to compile if it tried); the runtime
 * DISCARD test below proves the projection actively drops an authenticated
 * field even when the source listing happens to carry it.
 */
import { describe, it, expect } from 'vitest';
import { toSelectedListingPreview } from '../selectedListingPreview';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

function makeListing(overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    propertyType: 'apartment',
    bedrooms: 3,
    primaryImageUrl: 'https://example.test/img.jpg',
    trustBadge: 'verified',
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

  it('null-safe defaults for optional fields absent on the source listing', () => {
    const listing: DiscoverCityListingItem = { id: 'x' };
    const preview = toSelectedListingPreview(listing, { isAuthenticated: false, areaLabel: 'Manipal' });
    expect(preview.primaryImageUrl).toBeNull();
    expect(preview.propertyType).toBeNull();
    expect(preview.bedrooms).toBeNull();
    expect(preview.trustBadge).toBeNull();
    expect(preview.areaLabel).toBe('Manipal');
    expect(preview.id).toBe('x');
  });
});
