/**
 * Issue #2190 — filter-count badge denominator wrong at a canonical AREA
 * leaf ("9 of 0 match your filters in Kothanur").
 *
 * THE DEFECT: `deriveAreaPointFromNode` (nodeAreaPoint.ts) never sets
 * `listingCount` on the AreaPoint it builds for a canonical `node=`-journey
 * AREA leaf (NavigationNodeResponse carries no such field). With a property
 * filter active, `deriveDiscoverBadge`'s area branch read
 * `selectedArea.listingCount` directly as the unfiltered denominator (N);
 * `undefined` there became `null`, which `formatDiscoverBadgeCopy` renders
 * as `0` (`badge.n ?? 0`) — producing the impossible "9 of 0" state even
 * though the AREA genuinely has 9+ unfiltered listings.
 *
 * THE FIX: `useDiscoverBadgeController` now backfills the missing
 * `listingCount` from `discoverAreas` (the same canonical
 * `/api/discover/areas` source already used for `cityTotal` /
 * `groupListingsCount`), keyed by `areaKey`, before handing the area to
 * `deriveDiscoverBadge`.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverBadgeController,
  type UseDiscoverBadgeControllerParams,
} from './useDiscoverBadgeController';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// Mirrors a resolved canonical node-journey AREA leaf: deriveAreaPointFromNode
// never sets listingCount, so it is genuinely undefined here (not 0, not null).
const NODE_JOURNEY_AREA: AreaPoint = {
  areaKey: 'IN|KA|Bengaluru|Kothanur',
  areaLabel: 'Kothanur',
  geo_center_lat: 13.05,
  geo_center_lon: 77.65,
  bbox: null,
  // listingCount intentionally omitted — matches deriveAreaPointFromNode's output.
};

const CANONICAL_DISCOVER_AREAS: AreaPoint[] = [
  {
    areaKey: 'IN|KA|Bengaluru|Kothanur',
    areaLabel: 'Kothanur',
    geo_center_lat: 13.05,
    geo_center_lon: 77.65,
    bbox: null,
    listingCount: 18,
  },
];

function makeFilteredListings(count: number): DiscoverCityListingItem[] {
  return Array.from({ length: count }, (_, i) => ({ id: `listing-${i}` })) as DiscoverCityListingItem[];
}

function baseParams(
  overrides: Partial<UseDiscoverBadgeControllerParams> = {},
): UseDiscoverBadgeControllerParams {
  return {
    effectiveSelectedArea: NODE_JOURNEY_AREA,
    focusedGroup: null,
    groupId: null,
    discoverAreas: CANONICAL_DISCOVER_AREAS,
    city: 'bangalore',
    filters: { propertyTypes: ['apartment'] },
    areaListings: makeFilteredListings(9),
    isLoadingAreaListings: false,
    listingDataLoading: false,
    isAuthenticated: true,
    schoolListings: [],
    schoolRadiusListings: [],
    schoolRadiusListingsLoading: false,
    debouncedSearch: '',
    navQ: '',
    intent: 'buy',
    ...overrides,
  };
}

describe('useDiscoverBadgeController — issue #2190 badge denominator', () => {
  it('backfills the unfiltered N from discoverAreas for a canonical node-journey AREA leaf with a filter active, instead of reporting "9 of 0"', () => {
    const { result } = renderHook(() => useDiscoverBadgeController(baseParams()));

    expect(result.current.discoverBadge.m).toBe(9);
    expect(result.current.discoverBadge.n).toBe(18);
    expect(result.current.areaResultSummaryText).toBe('9 of 18 match your filters in Kothanur');
  });

  it('leaves the legacy areaKey path (listingCount already present) unchanged', () => {
    const legacyArea: AreaPoint = { ...NODE_JOURNEY_AREA, listingCount: 20 };
    const { result } = renderHook(() =>
      useDiscoverBadgeController(baseParams({ effectiveSelectedArea: legacyArea })),
    );

    expect(result.current.discoverBadge.m).toBe(9);
    expect(result.current.discoverBadge.n).toBe(20);
    expect(result.current.areaResultSummaryText).toBe('9 of 20 match your filters in Kothanur');
  });

  it('falls back to no honest N (n stays null, not 0) when the area is missing from discoverAreas entirely', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(baseParams({ discoverAreas: [] })),
    );

    expect(result.current.discoverBadge.m).toBe(9);
    expect(result.current.discoverBadge.n).toBeNull();
  });

  it('all filtered listings match: "9 of 9", no impossible relationship', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({ areaListings: makeFilteredListings(18), discoverAreas: CANONICAL_DISCOVER_AREAS }),
      ),
    );

    expect(result.current.discoverBadge.m).toBe(18);
    expect(result.current.discoverBadge.n).toBe(18);
  });

  it('zero filtered matches but non-zero AREA total: "0 of 18", not "0 of 0"', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(baseParams({ areaListings: [] })),
    );

    expect(result.current.discoverBadge.m).toBe(0);
    expect(result.current.discoverBadge.n).toBe(18);
    expect(result.current.areaResultSummaryText).toBe('0 of 18 match your filters in Kothanur');
  });

  it('clearing filters restores the ordinary unfiltered badge using the backfilled total', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(baseParams({ filters: {} })),
    );

    expect(result.current.discoverBadge.hasActiveFilters).toBe(false);
    expect(result.current.discoverBadge.n).toBe(18);
    expect(result.current.discoverBadge.m).toBe(18);
  });

  // ── #2750 PR-4 — retires e2e issue-2083-nav-counts-purpose-badge (RC_B badge, AC9) ──────────────
  // The fixtures above carry ONE area, so cityTotal == the area's own N and "badge shows the area,
  // not the city" is not discriminated. These two use TWO areas so cityTotal (25) != area N.
  const OTHER_AREA: AreaPoint = {
    areaKey: 'IN|KA|Bengaluru|Hebbal',
    areaLabel: 'Hebbal',
    geo_center_lat: 13.04,
    geo_center_lon: 77.59,
    bbox: null,
    listingCount: 7,
  };

  it('#2083 RC_B: unfiltered node-journey AREA leaf shows the AREA count (18), never the city total (25)', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({
          filters: {},
          discoverAreas: [...CANONICAL_DISCOVER_AREAS, OTHER_AREA],
          areaListings: makeFilteredListings(18),
        }),
      ),
    );

    // Precondition: the city really is bigger than the area (otherwise the assertions below
    // could not tell an area-scoped badge from a city-scoped one).
    expect(result.current.cityTotal).toBe(25);
    expect(result.current.discoverBadge.state).toBe('ok');
    expect(result.current.discoverBadge.n).toBe(18);
    expect(result.current.discoverBadge.m).toBe(18);
    expect(result.current.areaResultSummaryText).toBe('18 verified properties in Kothanur');
  });

  it('#2083 AC9: empty Rent AREA leaf (areaListings [], city has inventory) reads "No listings here yet", never the city total', () => {
    const emptyKothanur: AreaPoint = { ...CANONICAL_DISCOVER_AREAS[0], listingCount: 0 };
    const { result } = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({
          intent: 'rent',
          filters: {},
          discoverAreas: [emptyKothanur, OTHER_AREA],
          areaListings: [],
        }),
      ),
    );

    expect(result.current.cityTotal).toBe(7);
    expect(result.current.discoverBadge.state).toBe('zero-empty');
    expect(result.current.discoverBadge.count).toBe(0);
    expect(result.current.discoverBadge.n).toBe(0);
    expect(result.current.areaResultSummaryText).toBe('No listings here yet');
  });

  // ── #2750 PR-4 B1 T3 — retires e2e badge-context-precedence (BCP-1, BCP-2, BCP-4 wiring) ───────
  // The derivation (`deriveDiscoverBadge`) is pinned elsewhere; what was untested is this hook's
  // WIRING of its three scope inputs: cityTotal (sum of per-area listingCount), groupListingsCount
  // (member-area sum from focusedGroup.area_keys) and the school-radius count (schoolListings.length).
  // The single-area fixtures above cannot tell them apart (cityTotal == the area's own N), so each
  // `it` below uses a fixture where the three candidate numbers all differ.
  const THIRD_AREA: AreaPoint = {
    areaKey: 'IN|KA|Bengaluru|Yelahanka',
    areaLabel: 'Yelahanka',
    geo_center_lat: 13.1,
    geo_center_lon: 77.59,
    bbox: null,
    listingCount: 11,
  };
  const THREE_AREAS: AreaPoint[] = [...CANONICAL_DISCOVER_AREAS, OTHER_AREA, THIRD_AREA]; // 18 + 7 + 11
  const COASTAL_GROUP = {
    id: 'coastal-strip',
    name: 'Coastal Strip',
    subtitle: null,
    region_label: null,
    school_count: 0,
    // Two members of the three areas: 18 + 7 = 25; the third (11) is NOT a member.
    area_keys: ['IN|KA|Bengaluru|Kothanur', 'IN|KA|Bengaluru|Hebbal'],
  };

  it('#2750 B1 T3 BCP-1: city browse badge is the SUM of every area listingCount (18+7+11 = 36), not any single area', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({
          effectiveSelectedArea: null,
          filters: {},
          discoverAreas: THREE_AREAS,
          areaListings: [],
        }),
      ),
    );

    expect(result.current.cityTotal).toBe(36);
    expect(result.current.groupListingsCount).toBeUndefined();
    expect(result.current.discoverBadge.state).toBe('ok');
    expect(result.current.discoverBadge.n).toBe(36);
    expect(result.current.discoverBadge.m).toBe(36);
    expect(result.current.fallbackBadgeCopy).toBe('36 properties in Bangalore');
  });

  it('#2750 B1 T3 BCP-2: group-only badge is the member-area sum (18+7 = 25) — not the city (36) and not a non-member; an area selection beats the group', () => {
    const groupOnly = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({
          effectiveSelectedArea: null,
          groupId: 'coastal-strip',
          focusedGroup: COASTAL_GROUP,
          filters: {},
          discoverAreas: THREE_AREAS,
          areaListings: [],
        }),
      ),
    );
    expect(groupOnly.result.current.cityTotal).toBe(36);
    expect(groupOnly.result.current.groupListingsCount).toBe(25);
    expect(groupOnly.result.current.discoverBadge.n).toBe(25);
    expect(groupOnly.result.current.discoverBadge.m).toBe(25);
    expect(groupOnly.result.current.groupSelectedBadgeCopy).toBe('25 verified properties in Coastal Strip');

    // Group metadata still loading (groupId set, focusedGroup not yet resolved): the badge hides,
    // it does not fall through to the city total.
    const loading = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({
          effectiveSelectedArea: null,
          groupId: 'coastal-strip',
          focusedGroup: null,
          filters: {},
          discoverAreas: THREE_AREAS,
          areaListings: [],
        }),
      ),
    );
    expect(loading.result.current.groupListingsCount).toBeNull();
    expect(loading.result.current.discoverBadge.state).toBe('loading');

    // Area + group (BCP-3 precedence): the area's own count wins over the 25 group aggregate.
    const areaWins = renderHook(() =>
      useDiscoverBadgeController(
        baseParams({
          groupId: 'coastal-strip',
          focusedGroup: COASTAL_GROUP,
          filters: {},
          discoverAreas: THREE_AREAS,
          areaListings: makeFilteredListings(18),
        }),
      ),
    );
    expect(areaWins.result.current.groupListingsCount).toBe(25);
    expect(areaWins.result.current.discoverBadge.n).toBe(18);
    expect(areaWins.result.current.areaResultSummaryText).toBe('18 verified properties in Kothanur');
  });

  it('#2750 B1 T3 BCP-4: school-radius badge is the radius-scoped count (2) — not the area (18), group (25) or city (36); hidden while the radius query loads', () => {
    const radiusFilters = { schoolLat: 13.05, schoolLon: 77.65, schoolRadiusKm: 3 };
    const common = {
      groupId: 'coastal-strip',
      focusedGroup: COASTAL_GROUP,
      discoverAreas: THREE_AREAS,
      areaListings: makeFilteredListings(9),
      filters: radiusFilters,
      isAuthenticated: false,
      schoolListings: makeFilteredListings(2),
      schoolRadiusListings: makeFilteredListings(2) as never,
    };
    const settled = renderHook(() => useDiscoverBadgeController(baseParams(common)));
    expect(settled.result.current.schoolRadiusActive).toBe(true);
    // Precondition: the competing scopes really are different numbers.
    expect(settled.result.current.cityTotal).toBe(36);
    expect(settled.result.current.groupListingsCount).toBe(25);
    expect(settled.result.current.discoverBadge.state).toBe('ok');
    expect(settled.result.current.discoverBadge.n).toBe(2);
    expect(settled.result.current.discoverBadge.m).toBe(2);

    const loading = renderHook(() =>
      useDiscoverBadgeController(baseParams({ ...common, schoolRadiusListingsLoading: true })),
    );
    expect(loading.result.current.discoverBadge.state).toBe('loading');
    expect(loading.result.current.discoverBadge.n).toBeNull();
  });
});
