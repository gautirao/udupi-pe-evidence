/**
 * Issue #2857 (FU-LOWER-A) — L164 replacement (`e2e/discover/school-badge-suppression.spec.ts`).
 *
 * Proves the controller-level wiring in `useDiscoverBadgeController` (lines 109-162):
 *   - SBS-1 (G3-N2): when a school radius is active (`schoolLat`, `schoolLon`, `schoolRadiusKm`)
 *     inside an area with 12 total listings (`effectiveSelectedArea.listingCount = 12`) and the
 *     school-radius query settles to 0 listings (`schoolListings = []`, `schoolRadiusListings = []`),
 *     `discoverBadge` remains visible with `count === 0` (never falling back to the area total `12`).
 *   - SBS-2 + SBS-3 control (G3-N3): when the school-radius query returns 2 listings in the same
 *     12-listing area, `discoverBadge.count === 2` (not `12`), paired in the same `it` with the
 *     no-school area control where `filters` has no school radius and `discoverBadge.count === 12`.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverBadgeController,
  type UseDiscoverBadgeControllerParams,
} from '../useDiscoverBadgeController';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

const MANIPAL_AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  lat: 13.3525,
  lon: 74.7868,
  listingCount: 12,
  medianPricePerSqft: 5200,
};

const SELECTED_SCHOOL: SchoolResult = {
  id: 'school-manipal-1',
  name: 'Manipal Junior College',
  city: 'udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.3525,
  longitude: 74.7868,
  board: 'CBSE',
  category: 'Higher Secondary',
};

function makeListing(id: string): DiscoverCityListingItem {
  return {
    id,
    title: `Home ${id}`,
    propertyType: 'house',
    locality: 'Manipal',
    areaKey: 'IN|KA|Udupi|Manipal',
    price: 7500000,
    pricePaise: 750000000,
    latitude: 13.353,
    longitude: 74.787,
  } as DiscoverCityListingItem;
}

const TWELVE_AREA_LISTINGS: DiscoverCityListingItem[] = Array.from({ length: 12 }, (_, idx) =>
  makeListing(`area-listing-${idx + 1}`),
);

const BASE_NAV: DiscoverUrlState = {
  city: 'udupi',
  intent: 'buy',
  journey: 'school-first',
  areaKey: 'IN|KA|Udupi|Manipal',
  schoolId: SELECTED_SCHOOL.id,
  radiusKm: 3,
  board: null,
  category: null,
  groupId: null,
  scope: null,
  region: null,
  maxKm: null,
  destKey: null,
  listing: null,
  nodeKey: null,
  nodeListings: false,
  areaSetId: null,
} as unknown as DiscoverUrlState;

function makeParams(
  overrides: Partial<UseDiscoverBadgeControllerParams> = {},
): UseDiscoverBadgeControllerParams {
  return {
    nav: BASE_NAV,
    effectiveSelectedArea: MANIPAL_AREA,
    filters: {
      schoolLat: SELECTED_SCHOOL.latitude,
      schoolLon: SELECTED_SCHOOL.longitude,
      schoolRadiusKm: 3,
    },
    isResolvingGroupMemberArea: false,
    areaGroupsData: undefined,
    regionScopedGroupsData: undefined,
    summaryRegions: [],
    discoverAreas: [MANIPAL_AREA],
    areaListings: TWELVE_AREA_LISTINGS,
    isLoadingAreaListings: false,
    isErrorAreaListings: false,
    isFetchingAreaListings: false,
    isPlaceholderAreaListings: false,
    areasLoading: false,
    agriAreasData: undefined,
    isLoadingAgriAreas: false,
    filteredAgriListings: [],
    isLoadingAgriGroupListings: false,
    isAgriGroupListingsError: false,
    groupResultsListings: [],
    isLoadingGroupResults: false,
    isGroupResultsError: false,
    groupResultsTotalElements: 0,
    selectedSchool: SELECTED_SCHOOL,
    schoolListings: [],
    schoolRadiusListings: [],
    isLoadingSchoolRadiusListings: false,
    isErrorSchoolRadiusListings: false,
    isPlaceholderSchoolRadiusListings: false,
    isAuthenticated: false,
    isAnonViewport: false,
    anonViewportListings: [],
    anonViewportListingsLoading: false,
    isErrorAnonViewport: false,
    isPlaceholderAnonViewport: false,
    isAuthViewport: false,
    authViewportListings: [],
    authViewportListingsLoading: false,
    isErrorAuthViewport: false,
    isPlaceholderAuthViewport: false,
    isPolygonScope: false,
    polygonListings: [],
    polygonListingsLoading: false,
    isErrorPolygonListings: false,
    totalElements: 0,
    isLoading: false,
    isErrorListings: false,
    isPlaceholderListings: false,
    ...overrides,
  };
}

describe('useDiscoverBadgeController — #2190 / #2857 L164 school-badge-suppression', () => {
  it('SBS-1 (G3-N2): school radius active with 0 listings keeps badge visible with count 0 (never area total 12)', () => {
    const { result } = renderHook(() =>
      useDiscoverBadgeController(
        makeParams({
          schoolListings: [],
          schoolRadiusListings: [],
        }),
      ),
    );

    expect(result.current.discoverBadge).toMatchObject({
      visible: true,
      count: 0,
      n: 0,
      m: 0,
      state: 'zero-empty',
      loading: false,
    });
    expect(result.current.discoverBadge.count).not.toBe(12);
    expect(result.current.areaResultSummaryText).toBe('No listings here yet');
  });

  it('SBS-2 + SBS-3 control (G3-N3): school radius active with 2 listings shows count 2 (not 12), while no-school control shows area count 12', () => {
    const twoSchoolListings = [makeListing('sch-1'), makeListing('sch-2')];

    // SBS-3 positive control: no school radius active -> badge reflects the 12 area listings.
    const { result: noSchoolControl } = renderHook(() =>
      useDiscoverBadgeController(
        makeParams({
          nav: { ...BASE_NAV, journey: 'area-first', schoolId: null, radiusKm: null } as unknown as DiscoverUrlState,
          filters: {},
          selectedSchool: null,
          schoolListings: [],
          schoolRadiusListings: [],
        }),
      ),
    );
    expect(noSchoolControl.current.discoverBadge).toMatchObject({
      visible: true,
      count: 12,
      n: 12,
      m: 12,
    });

    // SBS-2: school radius active with 2 listings -> badge shows 2, not area total 12.
    const { result: withSchoolRadius } = renderHook(() =>
      useDiscoverBadgeController(
        makeParams({
          schoolListings: twoSchoolListings,
          schoolRadiusListings: twoSchoolListings,
        }),
      ),
    );
    expect(withSchoolRadius.current.discoverBadge).toMatchObject({
      visible: true,
      count: 2,
      n: 2,
      m: 2,
    });
    expect(withSchoolRadius.current.discoverBadge.count).not.toBe(12);
    expect(withSchoolRadius.current.areaResultSummaryText).toBe('2 verified properties in Manipal');
  });
});
