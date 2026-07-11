/**
 * Issue #1152 — deriveDiscoverBadge unit tests.
 * Issue #1817 — extended for the { n, m, hasActiveFilters, state } shape and the AC6
 * "Filtered results" (no-number) fallback. toEqual() calls below were widened to
 * toMatchObject() so pre-#1817 assertions keep checking exactly the fields they always
 * checked without being broken by the additive n/m/hasActiveFilters/state fields.
 *
 * Pure helper tests — no page mount required. Covers AC1–AC5 (original) + AC4/5/6 (#1817).
 */
import { describe, it, expect } from 'vitest';
import {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
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
    expect(result).toMatchObject({ visible: true, count: 247, loading: false, n: 247, m: 247, state: 'ok' });
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
    expect(result).toMatchObject({ visible: true, count: 12, loading: false, n: 12, m: 12, state: 'ok' });
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
    expect(result.state).toBe('loading');
  });

  it('shows area count once loading settles', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        isLoadingAreaListings: false,
        cityTotal: 247,
      }),
    );
    expect(result).toMatchObject({ visible: true, count: 12, loading: false, n: 12, m: 12, state: 'ok' });
  });
});

// ─── AC2 / AC6 (#1817): filters active without area → no-number "stale" fallback ──
// Issue #1817 changes this branch: previously the badge was fully HIDDEN
// (visible:false). The design's own no-number fallback (§6, AC6) now makes it
// VISIBLE with a null count and state:'stale' ("Filtered results", no figure) —
// honest labelling instead of silent hiding, while still never exposing a number
// we cannot stand behind. This is the SAME anon-safety guarantee (no M/N shown),
// just a different visibility contract. See the anon-exposure describe block below
// for the explicit qa-fast-required regression coverage.

describe('AC2/AC6 — filters active, no area selected → stale (Filtered results, no number)', () => {
  it('stale + no number when propertyTypes filter is active', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        filters: { propertyTypes: ['apartment'] },
        cityTotal: 247,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBeNull();
    expect(result.n).toBeNull();
    expect(result.m).toBeNull();
    expect(result.state).toBe('stale');
  });

  it('stale when bedrooms filter is active', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { bedrooms: [2] }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
    expect(result.count).toBeNull();
  });

  it('stale when priceMin is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { priceMin: 5_000_000 }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when priceMax is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { priceMax: 10_000_000 }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when sellerTypes filter is active', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { sellerTypes: ['broker'] }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when a boolean flag is active (backOnMarket)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { backOnMarket: true }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when dateFrom is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { dateFrom: new Date('2025-01-01') }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when dateTo is set', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { dateTo: new Date('2025-06-30') }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when newToMarket is true', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { newToMarket: true }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when reraRegistered is true', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { reraRegistered: true }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('stale when readyToMove is true', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { readyToMove: true }, cityTotal: 247 }),
    );
    expect(result.state).toBe('stale');
  });

  it('shows cityTotal when sellerTypes is an empty array (no active filter)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { sellerTypes: [] }, cityTotal: 247 }),
    );
    expect(result).toMatchObject({ visible: true, count: 247, loading: false, n: 247, m: 247, state: 'ok' });
  });
});

// ─── Issue #1817 — anon-count-exposure guard (qa-fast REQUIRED regression tests) ──
// Binding requirement from qa-fast-report.md: the "no area + filters → hide the
// number" guard must be preserved for BOTH anon and authed users when adding M-of-N.
// deriveDiscoverBadge is a pure function with no auth awareness — auth separation
// happens at the MapDiscovery caller — so these tests assert the pure contract that
// caller relies on: no area + active filters/search NEVER yields a non-null m/n/count,
// regardless of who is asking.

describe('Issue #1817 — anon-count-exposure guard', () => {
  it('anon-equivalent: filters active + no area + no school-radius → no M shown, badge not numerically visible', () => {
    const result = deriveDiscoverBadge(
      makeInput({ filters: { propertyTypes: ['apartment'] }, cityTotal: 1240 }),
    );
    expect(result.m).toBeNull();
    expect(result.n).toBeNull();
    expect(result.count).toBeNull();
    expect(result.state).toBe('stale');
  });

  it('anon school-radius + filters → M = anon-filtered subset, N = anon-filtered total (both public-endpoint derived)', () => {
    // schoolRadiusUnfilteredCount is ONLY passed by the anon caller path (the public
    // /school-radius-listings endpoint's full radius set, before applyAnonPropertyFilters).
    const result = deriveDiscoverBadge(
      makeInput({
        filters: { propertyTypes: ['house'] },
        schoolListingsCount: 3, // post-filter (M)
        schoolRadiusUnfilteredCount: 9, // pre-filter public total (N)
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.m).toBe(3);
    expect(result.n).toBe(9);
    expect(result.count).toBe(3);
    expect(result.state).toBe('ok');
  });

  it('authed-equivalent school-radius + filters (no unfiltered total available) → stale, no number (AC6 gap fallback)', () => {
    // The authenticated proximity endpoint pre-filters server-side; the caller must
    // leave schoolRadiusUnfilteredCount undefined — never fabricate N.
    const result = deriveDiscoverBadge(
      makeInput({
        filters: { propertyTypes: ['house'] },
        schoolListingsCount: 3,
        // schoolRadiusUnfilteredCount intentionally omitted
      }),
    );
    expect(result.m).toBeNull();
    expect(result.n).toBeNull();
    expect(result.count).toBeNull();
    expect(result.state).toBe('stale');
  });

  it('school-radius, no filters/search → schoolListingsCount is honestly both M and N (no gap when unfiltered)', () => {
    const result = deriveDiscoverBadge(
      makeInput({ schoolListingsCount: 5 }),
    );
    expect(result.n).toBe(5);
    expect(result.m).toBe(5);
    expect(result.count).toBe(5);
    expect(result.state).toBe('ok');
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
    expect(result).toMatchObject({ visible: true, count: 2, loading: false, n: 4, m: 2, state: 'ok' });
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
    // Issue #1817 — N is the area's unfiltered total (4), independent of M.
    expect(result.n).toBe(4);
    expect(result.m).toBe(2);
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
    expect(result).toMatchObject({ visible: true, count: 3, loading: false, n: 4, m: 3, state: 'ok' });
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
    expect(result).toMatchObject({ visible: false, count: null, loading: false });
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
    expect(result).toMatchObject({ visible: false, count: null, loading: false });
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
    expect(result).toMatchObject({ visible: true, count: 0, loading: false, n: 4, m: 0, state: 'zero-filters' });
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
    expect(result).toMatchObject({ visible: false, count: null, loading: true });
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
    expect(result).toMatchObject({ visible: true, count: 4, loading: false, n: 4, m: 4, state: 'ok' });
    expect(result.count).not.toBe(99);
  });
});

// ─── Issue #1817 — formatDiscoverBadgeCopy (shared copy contract, design §6) ─────

describe('Issue #1817 — formatDiscoverBadgeCopy', () => {
  it('plain scope, no filters: "{N} {noun} in {scope}"', () => {
    const badge = deriveDiscoverBadge(makeInput({ cityTotal: 1240 }));
    expect(formatDiscoverBadgeCopy(badge, { scopeLabel: 'Bangalore', noun: 'properties' })).toBe(
      '1,240 properties in Bangalore',
    );
  });

  it('filtered zero: "0 of {N} match your filters"', () => {
    const badge = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 18 },
        filters: { bedrooms: [3] },
        areaListings: [],
      }),
    );
    expect(formatDiscoverBadgeCopy(badge, { scopeLabel: 'Whitefield', noun: 'homes' })).toBe(
      '0 of 18 match your filters in Whitefield',
    );
  });

  it('stale state renders the no-number "Filtered results" label', () => {
    const badge = deriveDiscoverBadge(
      makeInput({ filters: { propertyTypes: ['apartment'] }, cityTotal: 247 }),
    );
    expect(formatDiscoverBadgeCopy(badge, { scopeLabel: 'Bangalore', noun: 'properties' })).toBe(
      'Filtered results',
    );
  });

  it('search-zero: "No results for "{q}" in {scope}"', () => {
    const badge = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 18 },
        areaListings: [],
        searchQuery: 'corner plot',
      }),
    );
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'Whitefield', noun: 'homes', searchQuery: 'corner plot' }),
    ).toBe('No results for "corner plot" in Whitefield');
  });

  it('genuinely-empty scope, no filters: "No listings here yet"', () => {
    const badge = deriveDiscoverBadge(makeInput({ selectedArea: { listingCount: 0 } }));
    expect(formatDiscoverBadgeCopy(badge, { scopeLabel: 'New Area', noun: 'homes' })).toBe(
      'No listings here yet',
    );
  });

  it('search ONLY (no property filters) uses `"{q}"`, not "your filters and ..." — hasActiveFilters alone must not be conflated with hasPropertyFilters', () => {
    const badge = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 18 },
        areaListings: [{ id: 'a' }, { id: 'b' }],
        searchQuery: 'corner plot',
      }),
    );
    expect(badge.hasPropertyFilters).toBe(false);
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'Whitefield', noun: 'homes', searchQuery: 'corner plot' }),
    ).toBe('2 of 18 match "corner plot" in Whitefield');
  });

  it('filters AND search both active: "your filters and "{q}""', () => {
    const badge = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 18 },
        filters: { bedrooms: [2] },
        areaListings: [{ id: 'a' }],
        searchQuery: 'corner plot',
      }),
    );
    expect(badge.hasPropertyFilters).toBe(true);
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'Whitefield', noun: 'homes', searchQuery: 'corner plot' }),
    ).toBe('1 of 18 match your filters and "corner plot" in Whitefield');
  });
});

// ─── Issue #1817 (code-review follow-up) — AC5 gap: the area-selected and ────────
// area-group-selected map badge branches (MapDiscovery.tsx, isAreaFirstSelectedAreaState
// and the 'area-groups-landing' + focusedGroup branch) previously rendered
// `Showing {count} verified properties in {scope}` UNCONDITIONALLY, never switching to
// the `M of N match ... in {scope}` form when filters/search were active (design §6:
// "Area selected + filters" → `5 of 18 match in Whitefield`; "Area group selected +
// filters" → `12 of 96 match in {Group}`). Both branches — and the AreaSelectedPanel
// result-summary stat — now route through formatDiscoverBadgeCopy with the EXACT
// `noun: 'verified properties'` parameter used at those call sites. These tests pin
// that exact contract so the regression cannot silently return.
describe('Issue #1817 (code-review follow-up) — area-selected / area-group-selected M-of-N copy', () => {
  it('area-selected, no filters: plain "{N} verified properties in {area}" form', () => {
    const badge = deriveDiscoverBadge(makeInput({ selectedArea: { listingCount: 18 } }));
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'Whitefield', noun: 'verified properties' }),
    ).toBe('18 verified properties in Whitefield');
  });

  it('area-selected + filters active: switches to "{M} of {N} match your filters in {area}" (design §6)', () => {
    const badge = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 18 },
        filters: { bedrooms: [3] },
        areaListings: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      }),
    );
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'Whitefield', noun: 'verified properties' }),
    ).toBe('5 of 18 match your filters in Whitefield');
  });

  it('area-group-selected, no filters: plain "{N} verified properties in {Group}" form', () => {
    const badge = deriveDiscoverBadge(makeInput({ groupListingsCount: 96 }));
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'University Belt', noun: 'verified properties' }),
    ).toBe('96 verified properties in University Belt');
  });

  it('area-group-selected + filters active: falls back to the honest "Filtered results" state, never a fabricated M-of-N (no group-scoped filtered query exists)', () => {
    // groupListingsCount is the UNFILTERED group aggregate; deriveDiscoverBadge has no
    // group-scoped filtered (M) source, so filters active at group scope correctly
    // routes to 'stale' (AC6) rather than inventing a number — formatDiscoverBadgeCopy
    // must render the no-number label here, not a misleading count.
    const badge = deriveDiscoverBadge(
      makeInput({ groupListingsCount: 96, filters: { bedrooms: [2] } }),
    );
    expect(badge.state).toBe('stale');
    expect(
      formatDiscoverBadgeCopy(badge, { scopeLabel: 'University Belt', noun: 'verified properties' }),
    ).toBe('Filtered results');
  });
});
