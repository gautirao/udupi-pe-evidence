/**
 * Issue #1152 — deriveDiscoverBadge unit tests.
 *
 * Pure helper tests — no page mount required. Covers AC1–AC5.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveDiscoverBadge,
  type DiscoverBadgeInput,
} from '../MapDiscovery';

const NO_FILTERS: DiscoverBadgeInput['filters'] = {};

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<DiscoverBadgeInput>): DiscoverBadgeInput {
  return {
    selectedArea: null,
    filters: NO_FILTERS,
    isLoadingAreaListings: false,
    cityTotal: 0,
    ...overrides,
  };
}

// ─── AC3: no area, no filters, city total available ─────────────────────────

describe('AC3 — no area, no filters', () => {
  it('shows cityTotal when areas are loaded', () => {
    const result = deriveDiscoverBadge(makeInput({ cityTotal: 247 }));
    expect(result).toEqual({ visible: true, count: 247, loading: false });
  });

  it('hides when cityTotal is 0 (areas not yet loaded)', () => {
    const result = deriveDiscoverBadge(makeInput({ cityTotal: 0 }));
    expect(result.visible).toBe(false);
  });
});

// ─── AC1: area selected → badge shows area listing count ────────────────────

describe('AC1 — area selected', () => {
  it('shows selectedArea.listingCount (distinct from cityTotal)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 12, loading: false });
    // AC4 sanity: badge count must NOT equal cityTotal (values are intentionally distinct)
    expect(result.count).not.toBe(247);
  });

  it('hides when listingCount is null (AC4 safety)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ selectedArea: { listingCount: null }, cityTotal: 100 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when listingCount is undefined (AC4 safety)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ selectedArea: {}, cityTotal: 100 }),
    );
    expect(result.visible).toBe(false);
  });
});

// ─── AC5: loading state when area is selected ───────────────────────────────

describe('AC5 — loading state', () => {
  it('returns loading=true and visible=false while area listings are fetching', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        isLoadingAreaListings: true,
        cityTotal: 247,
      }),
    );
    // Either visible=false OR loading=true must be set (both are here)
    expect(result.visible).toBe(false);
    expect(result.loading).toBe(true);
  });

  it('shows area count once loading settles', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        isLoadingAreaListings: false,
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 12, loading: false });
  });
});

// ─── AC2: filters active without area → hide ────────────────────────────────

describe('AC2 — filters active, no area selected', () => {
  it('hides when propertyTypes filter is active', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        filters: { propertyTypes: ['apartment'] },
        cityTotal: 247,
      }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when bedrooms filter is active', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { bedrooms: [2] }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when priceMin is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { priceMin: 5_000_000 }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when priceMax is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { priceMax: 10_000_000 }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when sellerTypes filter is active', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { sellerTypes: ['broker'] }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when a boolean flag is active (backOnMarket)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { backOnMarket: true }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when dateFrom is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { dateFrom: new Date('2025-01-01') }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when dateTo is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { dateTo: new Date('2025-06-30') }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when newToMarket is true', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { newToMarket: true }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when reraRegistered is true', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { reraRegistered: true }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('hides when readyToMove is true', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { readyToMove: true }, cityTotal: 247 }),
    );
    expect(result.visible).toBe(false);
  });

  it('shows cityTotal when sellerTypes is an empty array (no active filter)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { sellerTypes: [] }, cityTotal: 247 }),
    );
    expect(result).toEqual({ visible: true, count: 247, loading: false });
  });
});

// ─── AC1+AC2 — area selected with filters active (Cycle 7 Option B) ─────────────
// Badge must show the filtered count from areaListings (filter-aware, matches right panel).
// selectedArea.listingCount is stale/unfiltered — must NOT be shown when a filter is active.

describe('AC1+AC2 — area selected with filters active', () => {
  // (a) Basic: area + bedrooms filter + areaListings present → show filtered count
  it('shows areaListings.length when area selected + bedrooms filter active + areaListings.length=2', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [1] },
        areaListings: [{ id: 'a' }, { id: 'b' }],
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 2, loading: false });
  });

  // (b) Team-lead repro shape: area (listingCount=4) + bedrooms + areaListings.length=2 + cityTotal=247
  it('team-lead repro shape — count=2, not 4 (unfiltered area), not 247 (cityTotal)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [2] },
        areaListings: [{ id: 'x' }, { id: 'y' }],
        cityTotal: 247,
      }),
    );
    expect(result.count).toBe(2);
    expect(result.count).not.toBe(4);
    expect(result.count).not.toBe(247);
    expect(result.visible).toBe(true);
  });

  // (c) propertyTypes filter → filtered count used
  it('shows areaListings.length when area + propertyTypes filter + areaListings.length=3', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { propertyTypes: ['apartment'] },
        areaListings: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 3, loading: false });
  });

  // (d) area + filter + areaListings=undefined → hide (defensive fallback)
  it('hides when area selected + filter active + areaListings is undefined (defensive fallback)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [2] },
        areaListings: undefined,
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: false, count: null, loading: false });
  });

  // (e) area + filter + areaListings=null → hide (defensive fallback)
  it('hides when area selected + filter active + areaListings is null (defensive fallback)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [2] },
        areaListings: null,
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: false, count: null, loading: false });
  });

  // (f) zero is a valid filtered count — visible:true, count:0
  it('shows count=0 when area + filter active + areaListings is empty array', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [3] },
        areaListings: [],
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 0, loading: false });
  });

  // (g) loading wins — isLoadingAreaListings=true → hide with loading:true regardless of filter
  it('loading wins — visible:false, loading:true when area + filter + isLoadingAreaListings=true (AC5)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [2] },
        areaListings: [{ id: 'a' }, { id: 'b' }],
        isLoadingAreaListings: true,
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: false, count: null, loading: true });
  });

  // (h) Area-only regression guard: no filter active → use selectedArea.listingCount, NOT areaListings.length
  it('area-only path unchanged — shows selectedArea.listingCount (not areaListings.length) when no filters', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: {},
        // areaListings has a different length — must NOT be used when no filter active
        areaListings: Array.from({ length: 99 }, (_, i) => ({ id: `l${i}` })),
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 4, loading: false });
    expect(result.count).not.toBe(99);
  });
});
