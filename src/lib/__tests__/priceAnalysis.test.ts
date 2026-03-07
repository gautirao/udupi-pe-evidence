import { describe, it, expect, vi } from 'vitest';
import { computeAreaMedians, getMarketSignal } from '../priceAnalysis';
import { PropertyListing } from '@/hooks/usePropertyListings';

// Mock supabase to prevent initialization from the usePropertyListings import chain
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

// ─── Helpers ──────────────────────────────────────────────────

function makeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    property_type: 'land',
    locality: 'Udupi',
    price: 500_000,
    price_unit: 'INR',
    price_paise: null,
    price_per_cent_paise: 100_000, // ₹1000 / cent
    built_area: null,
    built_area_unit: null,
    bedrooms: null,
    ...overrides,
  } as unknown as PropertyListing;
}

function makeApartment(price: number, built_area: number, locality = 'Udupi', bedrooms: number | null = null) {
  return makeListing({
    property_type: 'apartment',
    price,
    price_per_cent_paise: null,
    built_area,
    built_area_unit: 'sqft',
    locality,
    bedrooms,
  });
}

// ─── computeAreaMedians ───────────────────────────────────────

describe('computeAreaMedians', () => {
  it('returns empty Map for empty input', () => {
    expect(computeAreaMedians([])).toEqual(new Map());
  });

  it('excludes groups with fewer than 5 listings', () => {
    const listings = Array.from({ length: 4 }, (_, i) =>
      makeListing({ id: `l${i}`, price_per_cent_paise: 100_000 }),
    );
    expect(computeAreaMedians(listings).size).toBe(0);
  });

  it('includes groups with exactly 5 listings', () => {
    const listings = Array.from({ length: 5 }, (_, i) =>
      makeListing({ id: `l${i}`, price_per_cent_paise: 100_000 }),
    );
    const result = computeAreaMedians(listings);
    expect(result.has('Udupi:land:null')).toBe(true);
  });

  it('computes correct odd-count median', () => {
    // rates: [1000, 2000, 3000, 4000, 5000] → median = 3000
    const rates = [100_000, 200_000, 300_000, 400_000, 500_000];
    const listings = rates.map((r, i) =>
      makeListing({ id: `l${i}`, price_per_cent_paise: r }),
    );
    const result = computeAreaMedians(listings);
    expect(result.get('Udupi:land:null')).toBe(3000);
  });

  it('computes correct even-count median (average of two middle values)', () => {
    // rates: [1000, 2000, 3000, 4000, 5000, 6000] → median = (3000+4000)/2 = 3500
    const rates = [100_000, 200_000, 300_000, 400_000, 500_000, 600_000];
    const listings = rates.map((r, i) =>
      makeListing({ id: `l${i}`, price_per_cent_paise: r }),
    );
    const result = computeAreaMedians(listings);
    expect(result.get('Udupi:land:null')).toBe(3500);
  });

  it('skips listings without locality', () => {
    const listings = Array.from({ length: 5 }, (_, i) =>
      makeListing({ id: `l${i}`, locality: null }),
    );
    expect(computeAreaMedians(listings).size).toBe(0);
  });

  it('skips listings without a computable rate', () => {
    // land without price_per_cent_paise → no rate
    const listings = Array.from({ length: 5 }, (_, i) =>
      makeListing({ id: `l${i}`, price_per_cent_paise: null }),
    );
    expect(computeAreaMedians(listings).size).toBe(0);
  });

  it('separates groups by bedrooms', () => {
    const withBeds = Array.from({ length: 5 }, (_, i) =>
      makeApartment(3_000_000, 1000, 'Udupi', 2),
    ).map((l, i) => ({ ...l, id: `b${i}` }));
    const withoutBeds = Array.from({ length: 5 }, (_, i) =>
      makeApartment(2_000_000, 1000, 'Udupi', null),
    ).map((l, i) => ({ ...l, id: `n${i}` }));

    const result = computeAreaMedians([...withBeds, ...withoutBeds]);
    expect(result.has('Udupi:apartment:2')).toBe(true);
    expect(result.has('Udupi:apartment:null')).toBe(true);
    expect(result.get('Udupi:apartment:2')).toBe(3000);
    expect(result.get('Udupi:apartment:null')).toBe(2000);
  });

  it('computes rate for apartments as Math.round(price / built_area)', () => {
    // price=3_200_000, built_area=1000 → rate = 3200
    const listings = Array.from({ length: 5 }, (_, i) =>
      makeApartment(3_200_000, 1000),
    ).map((l, i) => ({ ...l, id: `a${i}` }));
    const result = computeAreaMedians(listings);
    expect(result.get('Udupi:apartment:null')).toBe(3200);
  });
});

// ─── getMarketSignal ──────────────────────────────────────────

describe('getMarketSignal', () => {
  it('returns null when listing has no locality', () => {
    const listing = makeListing({ locality: null });
    expect(getMarketSignal(listing, new Map())).toBeNull();
  });

  it('returns null when listing has no computable rate', () => {
    const listing = makeListing({ price_per_cent_paise: null });
    const medians = new Map([['Udupi:land:null', 3000]]);
    expect(getMarketSignal(listing, medians)).toBeNull();
  });

  it('returns null when no area median exists (< 5 comps)', () => {
    const listing = makeListing({ price_per_cent_paise: 200_000 }); // rate=2000
    expect(getMarketSignal(listing, new Map())).toBeNull();
  });

  it('returns great_deal when ratio ≤ 0.7', () => {
    // rate=2000, median=3000 → ratio ≈ 0.667
    const listing = makeListing({ price_per_cent_paise: 200_000 });
    const medians = new Map([['Udupi:land:null', 3000]]);
    const result = getMarketSignal(listing, medians);
    expect(result?.signal).toBe('great_deal');
    expect(result?.percent).toBe(33); // Math.round((1 - 0.667) * 100)
    expect(result?.basis).toBe('per_cent');
  });

  it('returns good_value when 0.7 < ratio ≤ 0.85', () => {
    // rate=3000, median=4000 → ratio = 0.75
    const listing = makeListing({ price_per_cent_paise: 300_000 }); // rate=3000
    const medians = new Map([['Udupi:land:null', 4000]]);
    const result = getMarketSignal(listing, medians);
    expect(result?.signal).toBe('good_value');
    expect(result?.basis).toBe('per_cent');
  });

  it('returns null when ratio > 0.85 (no signal)', () => {
    // rate=3000, median=3100 → ratio ≈ 0.968
    const listing = makeListing({ price_per_cent_paise: 300_000 });
    const medians = new Map([['Udupi:land:null', 3100]]);
    expect(getMarketSignal(listing, medians)).toBeNull();
  });

  it('returns per_sqft basis for apartment listings', () => {
    // rate = 3000, median = 4500 → ratio ≈ 0.667 → great_deal
    const listing = makeApartment(3_000_000, 1000);
    const medians = new Map([['Udupi:apartment:null', 4500]]);
    const result = getMarketSignal(listing, medians);
    expect(result?.signal).toBe('great_deal');
    expect(result?.basis).toBe('per_sqft');
  });

  it('keys lookup by bedrooms correctly', () => {
    const listing2bhk = makeApartment(3_000_000, 1000, 'Udupi', 2);
    // Only a median for 2BHK is present — should match
    const medians = new Map([['Udupi:apartment:2', 4500]]);
    expect(getMarketSignal(listing2bhk, medians)).not.toBeNull();

    // Without bedrooms key — should return null (different key)
    const listingNoBhk = makeApartment(3_000_000, 1000, 'Udupi', null);
    expect(getMarketSignal(listingNoBhk, medians)).toBeNull();
  });
});
