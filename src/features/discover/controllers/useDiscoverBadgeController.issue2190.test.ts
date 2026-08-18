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
});
