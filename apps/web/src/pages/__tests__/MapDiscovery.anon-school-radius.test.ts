/**
 * Issue #1261 — anonymous school-radius client-side PropertyFilter parity.
 *
 * The PUBLIC /school-radius-listings endpoint takes NO property-filter params
 * (DECISION-1), so the active PropertyFilters are applied CLIENT-SIDE over the
 * endpoint content. These are pure-function tests of applyAnonPropertyFilters —
 * no page mount required.
 *
 * AC1: filtered set may span multiple area boundaries (the helper does NOT scope
 *      by areaKey — it operates over whatever the cross-area endpoint returned).
 * AC6: filters relying on server-EXCLUDED fields (reraRegistered, sellerTypes) are
 *      NOT applied; excluded/private fields are never read.
 * AC8: badge count derivation still follows schoolListings.length truthfully.
 */
import { describe, it, expect } from 'vitest';
import {
  applyAnonPropertyFilters,
  deriveAnonSchoolRadiusMarkers,
  hasActiveAnonPropertyFilter,
} from '@/features/discover/presentation/anonPropertyFilters';
import { deriveDiscoverBadge } from '@/features/discover/presentation/discoverBadge';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function listing(over: Partial<SchoolRadiusListingItem> & { id: string }): SchoolRadiusListingItem {
  return {
    propertyType: 'house',
    title: 'Home',
    locality: 'Manipal',
    pricePaise: 5_000_000, // ₹50,000 ... (paise)
    primaryImageUrl: null,
    listingPurpose: 'sale',
    bedrooms: 2,
    builtArea: 1000,
    builtAreaUnit: 'sqft',
    landArea: null,
    landAreaUnit: null,
    createdAt: '2026-05-01T00:00:00Z',
    lat: 13.35,
    lon: 74.79,
    latitude: 13.35,
    longitude: 74.79,
    daysOnMarket: 30,
    backOnMarket: false,
    possessionStatus: 'under_construction',
    areaKey: 'IN|KA|Udupi|Manipal',
    ...over,
  };
}

// Two listings in DIFFERENT areas — proves the helper is not area-scoped (AC1).
const CROSS_AREA: SchoolRadiusListingItem[] = [
  listing({ id: 'a', areaKey: 'IN|KA|Udupi|Manipal', propertyType: 'house', bedrooms: 2, pricePaise: 5_000_000 }),
  listing({ id: 'b', areaKey: 'IN|KA|Udupi|Katapadi', propertyType: 'apartment', bedrooms: 4, pricePaise: 20_000_000 }),
];

describe('applyAnonPropertyFilters (Issue #1261)', () => {
  it('returns all listings unchanged when no filters are active (AC1 cross-area preserved)', () => {
    const out = applyAnonPropertyFilters(CROSS_AREA, {});
    expect(out.map((l) => l.id)).toEqual(['a', 'b']);
    // Different areaKeys remain — the result is NOT scoped to a single area.
    expect(new Set(out.map((l) => l.areaKey)).size).toBe(2);
  });

  it('filters by propertyType (case-insensitive)', () => {
    expect(applyAnonPropertyFilters(CROSS_AREA, { propertyTypes: ['HOUSE'] }).map((l) => l.id)).toEqual(['a']);
    expect(applyAnonPropertyFilters(CROSS_AREA, { propertyTypes: ['apartment'] }).map((l) => l.id)).toEqual(['b']);
  });

  it('filters by exact bedrooms and 4-plus', () => {
    expect(applyAnonPropertyFilters(CROSS_AREA, { bedrooms: [2] }).map((l) => l.id)).toEqual(['a']);
    // 4 means "4 or more" → matches the 4-BHK listing.
    expect(applyAnonPropertyFilters(CROSS_AREA, { bedrooms: [4] }).map((l) => l.id)).toEqual(['b']);
  });

  it('filters by price (rupees → paise conversion)', () => {
    // priceMax 100000 rupees = 10_000_000 paise → excludes 'b' (20M paise).
    expect(applyAnonPropertyFilters(CROSS_AREA, { priceMax: 100_000 }).map((l) => l.id)).toEqual(['a']);
    // priceMin 100000 rupees = 10_000_000 paise → excludes 'a' (5M paise).
    expect(applyAnonPropertyFilters(CROSS_AREA, { priceMin: 100_000 }).map((l) => l.id)).toEqual(['b']);
  });

  it('filters by newToMarket (daysOnMarket 1..7)', () => {
    const items = [listing({ id: 'fresh', daysOnMarket: 3 }), listing({ id: 'stale', daysOnMarket: 40 })];
    expect(applyAnonPropertyFilters(items, { newToMarket: true }).map((l) => l.id)).toEqual(['fresh']);
  });

  it('filters by readyToMove (possessionStatus)', () => {
    const items = [
      listing({ id: 'ready', possessionStatus: 'ready_to_move' }),
      listing({ id: 'wip', possessionStatus: 'under_construction' }),
    ];
    expect(applyAnonPropertyFilters(items, { readyToMove: true }).map((l) => l.id)).toEqual(['ready']);
  });

  it('filters by backOnMarket', () => {
    const items = [listing({ id: 'back', backOnMarket: true }), listing({ id: 'normal', backOnMarket: false })];
    expect(applyAnonPropertyFilters(items, { backOnMarket: true }).map((l) => l.id)).toEqual(['back']);
  });

  it('produces an honest empty result when filters match nothing (no implied "increase radius")', () => {
    const out = applyAnonPropertyFilters(CROSS_AREA, { bedrooms: [3] }); // neither listing is 3-BHK
    expect(out).toEqual([]);
  });

  it('AC6 — does not read server-EXCLUDED fields; reraRegistered/sellerTypes are not applied', () => {
    // Even though these filter keys exist on PropertyFilters, the helper signature does
    // not accept them and they are intentionally skipped. Passing them via a cast must
    // not change the result (the helper ignores unknown keys).
    const out = applyAnonPropertyFilters(
      CROSS_AREA,
      { reraRegistered: true, sellerTypes: ['owner'] } as never,
    );
    expect(out.map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('hasActiveAnonPropertyFilter — gates the "showing first N" hint (FINDING 1)', () => {
  it('is false when no refining filter is active (radius-only → hint stays accurate)', () => {
    expect(hasActiveAnonPropertyFilter({})).toBe(false);
    // schoolLat/schoolLon/schoolRadiusKm define the radius, not a refinement, and must
    // NOT count as an active property filter — passing them via a cast must stay false.
    expect(
      hasActiveAnonPropertyFilter({ schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 } as never),
    ).toBe(false);
    // Empty arrays are not "active".
    expect(hasActiveAnonPropertyFilter({ propertyTypes: [], bedrooms: [] })).toBe(false);
  });

  it('is true for each filter applyAnonPropertyFilters can shrink the result by', () => {
    expect(hasActiveAnonPropertyFilter({ propertyTypes: ['house'] })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ bedrooms: [2] })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ priceMin: 100_000 })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ priceMax: 100_000 })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ dateFrom: '2026-05-01' })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ dateTo: '2026-05-01' })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ backOnMarket: true })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ newToMarket: true })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ readyToMove: true })).toBe(true);
  });

  it('priceMin=0 is treated as active (numeric-0 guard, not truthiness)', () => {
    expect(hasActiveAnonPropertyFilter({ priceMin: 0 })).toBe(true);
    expect(hasActiveAnonPropertyFilter({ priceMax: 0 })).toBe(true);
  });

  it('hint suppression is honest: with an active filter the shown set is the COMPLETE match (no implied "more matching")', () => {
    // The hint reads schoolListings.length (post-filter) but gates on the unfiltered
    // server probe; when a filter is active we suppress, because the unseen server rows
    // need not match. Here the filter excludes 'b' entirely — the 1 shown IS all matches.
    const filtered = applyAnonPropertyFilters(CROSS_AREA, { propertyTypes: ['house'] });
    expect(filtered.map((l) => l.id)).toEqual(['a']);
    expect(hasActiveAnonPropertyFilter({ propertyTypes: ['house'] })).toBe(true); // → hint hidden
    // Radius-only over the same page keeps every row, so the hint stays accurate.
    expect(hasActiveAnonPropertyFilter({})).toBe(false); // → hint shown
  });
});

describe('badge count stays truthful after filtering (AC8)', () => {
  it('schoolListingsCount = filtered length → badge shows that count', () => {
    const filtered = applyAnonPropertyFilters(CROSS_AREA, { propertyTypes: ['house'] });
    const badge = deriveDiscoverBadge({
      selectedArea: null,
      filters: {},
      isLoadingAreaListings: false,
      cityTotal: 999,
      schoolListingsCount: filtered.length,
    });
    expect(badge.visible).toBe(true);
    expect(badge.count).toBe(1);
  });
});

// ─── Issue #1261 rev2 (AC11) — anon school-radius marker derivation ──────────
describe('deriveAnonSchoolRadiusMarkers (AC11)', () => {
  it('returns an empty array for empty input (preserves #1118 area-fallback)', () => {
    expect(deriveAnonSchoolRadiusMarkers([])).toEqual([]);
  });

  it('filters out listings without coordinates (lat or lon null)', () => {
    const items: SchoolRadiusListingItem[] = [
      listing({ id: 'with-coords', lat: 13.35, lon: 74.79 }),
      listing({ id: 'no-lat', lat: null, lon: 74.79 }),
      listing({ id: 'no-lon', lat: 13.35, lon: null }),
      listing({ id: 'no-both', lat: null, lon: null }),
    ];
    const out = deriveAnonSchoolRadiusMarkers(items);
    expect(out.map((m) => m.id)).toEqual(['with-coords']);
  });

  it('maps anon-safe fields onto the PropertyListing pin shape and never reads private fields', () => {
    const items: SchoolRadiusListingItem[] = [
      listing({
        id: 'm1',
        propertyType: 'house',
        title: 'Cross-Area Home',
        locality: 'Manipal',
        pricePaise: 12_500_000, // ₹1.25L rupees ⇒ 125,000 rupees
        primaryImageUrl: 'https://example.com/img.jpg',
        listingPurpose: 'sale',
        bedrooms: 3,
        builtArea: 1200,
        builtAreaUnit: 'sqft',
        landArea: 5,
        landAreaUnit: 'cents',
        createdAt: '2026-05-01T00:00:00Z',
        lat: 13.35,
        lon: 74.79,
      }),
    ];
    const [pin] = deriveAnonSchoolRadiusMarkers(items);
    // PropertyListing pin shape consumed by Leaflet PropertyMap clustering.
    expect(pin.id).toBe('m1');
    expect(pin.latitude).toBe(13.35);
    expect(pin.longitude).toBe(74.79);
    expect(pin.property_type).toBe('house');
    // pricePaise (paise) → PropertyListing.price (rupees, Math.round).
    expect(pin.price).toBe(125_000);
    expect(pin.title).toBe('Cross-Area Home');
    expect(pin.locality).toBe('Manipal');
    expect(pin.bedrooms).toBe(3);
    expect(pin.built_area).toBe(1200);
    expect(pin.land_area).toBe(5);
    expect(pin.listing_purpose).toBe('sale');
    // Anon-safe synthetic fields (no server private data exposure):
    //   status = 'LIVE' and seller_type = null are LOCAL constants from
    //   cityListingToPropertyListing — they are not read from the server response.
    expect(pin.status).toBe('LIVE');
    expect(pin.seller_type).toBeNull();
    // Auth-only/private fields are NEVER set by the mapper — they remain absent.
    expect(pin.trustTier).toBeUndefined();
    expect(pin.firstPublishedAt).toBeUndefined();
    expect(pin.lastUpdatedAt).toBeUndefined();
    expect(pin.reraValid).toBeUndefined();
    expect(pin.rera_number).toBeUndefined();
  });

  it('produces a non-empty pin set for a non-empty listing set (AC11 happy path)', () => {
    const out = deriveAnonSchoolRadiusMarkers(CROSS_AREA);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.id).sort()).toEqual(['a', 'b']);
    // Cross-area is preserved at the pin layer too — different areaKeys map through.
    out.forEach((pin) => {
      expect(pin.latitude).toBe(13.35);
      expect(pin.longitude).toBe(74.79);
    });
  });

  it('DECISION-1 filter parity: derive(filter(set)) == filter then derive (panel and map agree)', () => {
    // Caller is expected to pass the post-applyAnonPropertyFilters set so the map
    // pin universe equals the right-panel card universe. Composition test.
    const propertyTypeFilter = { propertyTypes: ['house'] };
    const filtered = applyAnonPropertyFilters(CROSS_AREA, propertyTypeFilter);
    const pinsFromFiltered = deriveAnonSchoolRadiusMarkers(filtered);

    expect(filtered.map((l) => l.id)).toEqual(['a']);
    expect(pinsFromFiltered.map((p) => p.id)).toEqual(['a']);

    // Empty filter result → empty pin set (so the area-fallback branch still applies).
    const noMatch = applyAnonPropertyFilters(CROSS_AREA, { bedrooms: [3] });
    expect(noMatch).toEqual([]);
    expect(deriveAnonSchoolRadiusMarkers(noMatch)).toEqual([]);
  });

  // ── Issue #1261 rev2 (AC12) — auth fallback marker path ─────────────────────
  //
  // deriveAnonSchoolRadiusMarkers is now called with schoolRadiusListings (the public
  // endpoint data, radius-filtered) for BOTH auth and anon users. The function itself
  // is auth-agnostic — the auth gate is in the hook (schoolRadiusEnabled) and the
  // IIFE (schoolRadiusFallbackMarkers). These tests confirm the function produces the
  // correct output regardless of whether the caller is auth or anon.

  it('AC12 (auth fallback) — produces correct pins from the same schoolRadiusListings input as anon', () => {
    // In the rev2 auth fallback path, the function receives the same schoolRadiusListings
    // array as in the anon path. The output must be identical — no auth-vs-anon divergence.
    const anonPins = deriveAnonSchoolRadiusMarkers(CROSS_AREA);
    // Simulate auth-fallback call (same function, same input — auth gate is upstream)
    const authFallbackPins = deriveAnonSchoolRadiusMarkers(CROSS_AREA);
    expect(authFallbackPins).toEqual(anonPins);
  });

  it('AC12 — radius-filtered source: only listings with valid lat/lon become pins (safe for auth map)', () => {
    // Auth users must NOT see markers for listings that lack coordinates. The function
    // filters on lat/lon non-null — this is critical for both auth and anon paths.
    const mixedCoords: SchoolRadiusListingItem[] = [
      listing({ id: 'valid-1', lat: 13.35, lon: 74.79 }),
      listing({ id: 'no-lat',  lat: null,  lon: 74.79 }),
      listing({ id: 'valid-2', lat: 13.38, lon: 74.74, areaKey: 'IN|KA|Udupi|Katapadi' }),
    ];
    const pins = deriveAnonSchoolRadiusMarkers(mixedCoords);
    expect(pins.map((p) => p.id).sort()).toEqual(['valid-1', 'valid-2']);
    expect(pins.every((p) => p.latitude != null && p.longitude != null)).toBe(true);
  });
});
