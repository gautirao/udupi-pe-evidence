/**
 * Issue #1175 v2 — deriveDiscoverBadge school-radius count-following unit tests.
 *
 * Pure helper tests — no page mount required.
 *
 * Product decision (v2 corrective cycle): badge must FOLLOW the active context,
 * not be suppressed. schoolListingsCount carries the already-filtered count.
 *
 * AC1: school-radius active + zero matching listings → badge shows 0 (not area/city total)
 * AC2: school-radius active + N matching listings   → badge shows N
 * AC3: school-radius active + still loading         → badge hidden temporarily (loading)
 * AC4: school-radius NOT active + area + filters    → #1152 behaviour unchanged
 * AC5: partial school coords (schoolLon missing)    → badge NOT suppressed (falls through)
 * AC6: regression guard — existing area/filter/city paths unaffected
 */
import { describe, it, expect } from 'vitest';
import {
  deriveDiscoverBadge,
  type DiscoverBadgeInput,
} from '../MapDiscovery';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NO_FILTERS: DiscoverBadgeInput['filters'] = {};

function makeInput(overrides: Partial<DiscoverBadgeInput>): DiscoverBadgeInput {
  return {
    selectedArea: null,
    filters: NO_FILTERS,
    isLoadingAreaListings: false,
    cityTotal: 0,
    ...overrides,
  };
}

// ─── Issue #1175 v2: school-radius active → badge follows count ───────────────

describe('Issue #1175 v2 — school-radius active: badge shows the scoped count', () => {
  // AC1: school + radius set, zero matching listings → badge shows 0 (not area/city total).
  // Rationale: showing 0 is consistent with "No properties found within N km" in the right
  // panel; it does NOT show the unfiltered area total (12) or city total (50).
  it('AC1 — school-radius active + zero radius results → badge visible with count=0', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        cityTotal: 50,
        isLoadingAreaListings: false,
        schoolListingsCount: 0,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(0);
    expect(result.loading).toBe(false);
    // Must NOT show the unfiltered area count or city total
    expect(result.count).not.toBe(12);
    expect(result.count).not.toBe(50);
  });

  // AC2: school + radius set, N matching listings → badge shows N.
  it('AC2 — school-radius active + 3 radius results → badge visible with count=3', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        cityTotal: 50,
        isLoadingAreaListings: false,
        schoolListingsCount: 3,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(3);
    expect(result.loading).toBe(false);
  });

  // school-radius active with NO selected area, N matches → still shows N.
  it('school-radius active + no area selected + 5 matches → badge shows 5', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: null,
        cityTotal: 247,
        schoolListingsCount: 5,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(5);
  });

  // AC3: school-radius active + loading → badge hidden temporarily (loading=true).
  it('AC3 — school-radius active + schoolListingsCount=null (loading) → hidden with loading=true', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        cityTotal: 50,
        isLoadingAreaListings: true,
        schoolListingsCount: null,
      }),
    );
    expect(result.visible).toBe(false);
    expect(result.loading).toBe(true);
  });

  // AC3 (auth path) — Issue #1175 v2 corrective: on the authenticated path, filteredListings
  // comes from the backend proximity query (useDiscoverListings / listingDataLoading), NOT from
  // useDiscoverCityListings. isLoadingAreaListings can already be false while listingDataLoading
  // is still true — the callsite now passes schoolListingsCount=null in that case too.
  // This test confirms that null (the signal from the corrected callsite guard) correctly hides
  // the badge even when isLoadingAreaListings=false.
  it('AC3 (auth path) — isLoadingAreaListings=false but schoolListingsCount=null (listingDataLoading still true) → hidden with loading=true', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 12 },
        cityTotal: 50,
        isLoadingAreaListings: false,  // public city-listings query settled
        schoolListingsCount: null,      // callsite sends null because listingDataLoading=true
      }),
    );
    expect(result.visible).toBe(false);
    expect(result.loading).toBe(true);
  });
});

// ─── AC5: partial school coords must NOT suppress badge ──────────────────────

describe('Issue #1175 — three-field schoolRadiusActive condition (schoolLon required)', () => {
  it('AC5 — partial-state: schoolLat set but schoolLon null → schoolListingsCount=undefined → badge shows cityTotal', () => {
    // When schoolListingsCount is undefined (not passed), deriveDiscoverBadge falls
    // through to the existing city-total path. This is the caller's responsibility:
    // schoolListingsCount is only set when all three coords are present.
    const result = deriveDiscoverBadge(
      makeInput({
        filters: { schoolLat: 13.3, schoolRadiusKm: 2 }, // schoolLon absent/null
        cityTotal: 50,
        // schoolListingsCount intentionally not set (undefined)
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(50);
  });
});

// ─── AC4/AC6: school-radius NOT active → existing #1152 behaviour unchanged ──

describe('AC4/AC6 — school-radius NOT active preserves #1152 behaviour', () => {
  // Regression guard: area selected + property filter → filtered count (Option B, #1152)
  it('area + bedrooms filter + areaListings.length=2 → shows filtered count when schoolListingsCount=undefined', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        filters: { bedrooms: [2] },
        areaListings: [{ id: 'x' }, { id: 'y' }],
        cityTotal: 247,
        // schoolListingsCount not set
      }),
    );
    expect(result).toEqual({ visible: true, count: 2, loading: false });
    expect(result.count).not.toBe(4);
    expect(result.count).not.toBe(247);
  });

  // Regression guard: area selected, no filters, no school → area count
  it('area + no filters + schoolListingsCount undefined → shows selectedArea.listingCount', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 8 },
        cityTotal: 100,
      }),
    );
    expect(result).toEqual({ visible: true, count: 8, loading: false });
  });

  // Regression guard: no area, no filters, no school → city total shown
  it('no area + no filters + schoolListingsCount undefined → shows cityTotal', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        cityTotal: 247,
      }),
    );
    expect(result).toEqual({ visible: true, count: 247, loading: false });
  });
});

// ─── Issue #1175 v3: group context ────────────────────────────────────────────

describe('Issue #1175 v3 — group context: badge shows group aggregate', () => {
  // AC2-G: groupId active + group metadata loaded → badge shows member-area aggregate
  it('AC2-G — groupListingsCount=8 → badge shows 8 (group aggregate)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: null,
        cityTotal: 12,
        groupListingsCount: 8,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(8);
    expect(result.loading).toBe(false);
    expect(result.count).not.toBe(12);
  });

  // AC2-G0: groupListingsCount=0 → badge shows 0 (not city total)
  it('AC2-G0 — groupListingsCount=0 → badge shows 0 (not city total)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: null,
        cityTotal: 12,
        groupListingsCount: 0,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(0);
    expect(result.loading).toBe(false);
  });

  // AC3-G: groupListingsCount=null (loading) → badge hidden
  it('AC3-G — groupListingsCount=null (loading) → badge hidden with loading=true', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: null,
        cityTotal: 12,
        groupListingsCount: null,
      }),
    );
    expect(result.visible).toBe(false);
    expect(result.loading).toBe(true);
  });

  // PREC-AG: area wins over group — selectedArea takes precedence when both are set
  it('PREC-AG — selectedArea set + groupListingsCount=5 → badge shows area count (area wins)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: { listingCount: 4 },
        cityTotal: 12,
        groupListingsCount: 5,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(4);
    expect(result.count).not.toBe(5);
  });

  // PREC-SG: school wins over group — schoolListingsCount takes precedence when both are set
  it('PREC-SG — schoolListingsCount=3 + groupListingsCount=8 → badge shows 3 (school wins)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: null,
        cityTotal: 12,
        schoolListingsCount: 3,
        groupListingsCount: 8,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(3);
    expect(result.count).not.toBe(8);
  });

  // PREC-GC: group wins over city — groupListingsCount takes precedence over cityTotal
  it('PREC-GC — groupListingsCount=8 + cityTotal=12 → badge shows 8 (group wins over city)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        selectedArea: null,
        cityTotal: 12,
        groupListingsCount: 8,
      }),
    );
    expect(result.visible).toBe(true);
    expect(result.count).toBe(8);
    expect(result.count).not.toBe(12);
  });

  it('AC5-G — group-context + active property filters + no area → badge hidden (filters gate fires before group branch)', () => {
    const result = deriveDiscoverBadge(
      makeInput({
        groupListingsCount: 8,
        filters: { bedrooms: [2] },
        selectedArea: null,
        cityTotal: 12,
      }),
    );
    expect(result.visible).toBe(false);
    expect(result.count).toBeNull();
  });
});
