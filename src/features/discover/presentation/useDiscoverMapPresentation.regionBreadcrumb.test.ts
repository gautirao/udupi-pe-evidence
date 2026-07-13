/**
 * Issue #1824 Slice S9b2 — renderHook coverage for the region/breadcrumb
 * cluster (resolvedRegionLabel, isRegionOverview, regionOverviewMarkerKind,
 * regionOverviewShortLabel, areaJourneySegments, schoolJourneySegments) moved
 * verbatim into useDiscoverMapPresentation.
 *
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s9b2-implementation.md.
 * Companion to (does NOT modify) useDiscoverMapPresentation.overviewAreas.test.ts (S9b1).
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverMapPresentation,
  type UseDiscoverMapPresentationParams,
} from './useDiscoverMapPresentation';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

const AREA_1: AreaPoint = {
  areaKey: 'area-1',
  areaLabel: 'Area One',
  geo_center_lat: 13.35,
  geo_center_lon: 74.75,
  bbox: null,
  listingCount: 4,
};

const BASE_URL_STATE: DiscoverUrlState = {
  city: 'udupi',
  areaKey: null,
  viewport: null,
  filters: {},
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: null,
  groupId: null,
  selectedGroup: null,
  intent: 'buy',
  scope: null,
};

const SELECTED_SCHOOL: SchoolResult = {
  id: 'school-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: 'Manipal',
  distanceKm: 1.2,
};

const MARKER_LISTING: PropertyListingWithImages = {
  id: 'listing-1',
  property_type: 'apartment',
  title: 'Test Listing',
  locality: null,
  price: null,
  price_unit: null,
  land_area: null,
  land_area_unit: null,
  built_area: null,
  built_area_unit: null,
  bedrooms: null,
  bathrooms: null,
  contact_info: null,
  contact_phone: null,
  description: null,
  latitude: null,
  longitude: null,
  confidence_score: null,
  language_detected: null,
  price_per_cent_paise: null,
  is_valid: true,
  is_duplicate: false,
  status: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  raw_post_id: null,
  listing_purpose: 'sale',
  carpet_area: null,
  carpet_area_unit: null,
  floor_number: null,
  total_floors: null,
  furnishing_status: null,
  washrooms: null,
  parking_count: null,
  road_frontage_ft: null,
  commercial_usage: null,
  number_of_units: null,
  monthly_rent: null,
  security_deposit_months: null,
  lock_in_months: null,
  seller_type: null,
};

function baseProps(
  overrides: Partial<UseDiscoverMapPresentationParams> = {},
): UseDiscoverMapPresentationParams {
  return {
    mapLayerKind: 'all-areas',
    isLoadingAreaGroups: false,
    isLoadingRegionalAreaGroups: false,
    isLandingState: false,
    isAreaFirstCityLanding: false,
    areaGroupsData: undefined,
    discoverAreas: [AREA_1],
    corridorGroups: [],
    agriAreasData: undefined,
    liveAreas: [AREA_1],
    urlState: BASE_URL_STATE,
    summaryRegions: [],
    cityCenter: [13.34, 74.74],
    focusedGroup: null,
    debouncedAreaSearchQuery: '',
    city: 'udupi',
    selectedArea: null,
    selectedSchool: null,
    selectedMarkerListing: null,
    ...overrides,
  };
}

describe('useDiscoverMapPresentation — resolvedRegionLabel', () => {
  it('scope-hit resolves the regionLabel from summaryRegions (case-insensitive)', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        urlState: { ...BASE_URL_STATE, scope: 'NORTH-UDUPI' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.resolvedRegionLabel).toBe('North Udupi');
  });

  it('scope-miss falls back to prettifyZoneSlug(scope) when no summaryRegions match', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        urlState: { ...BASE_URL_STATE, scope: 'university-belt' },
        summaryRegions: [],
      }),
    });
    expect(result.current.resolvedRegionLabel).toBe('University Belt');
  });

  it('scope-null falls back to focusedGroup.region_label', () => {
    const group: AreaGroup = {
      id: 'group-1',
      name: 'Zone A',
      subtitle: null,
      region_label: 'East Udupi',
      school_count: 0,
      area_keys: ['area-1'],
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        urlState: { ...BASE_URL_STATE, scope: null },
        focusedGroup: group,
      }),
    });
    expect(result.current.resolvedRegionLabel).toBe('East Udupi');
  });

  it('scope-null with no focusedGroup resolves to null', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({ urlState: { ...BASE_URL_STATE, scope: null }, focusedGroup: null }),
    });
    expect(result.current.resolvedRegionLabel).toBeNull();
  });
});

describe('useDiscoverMapPresentation — isRegionOverview', () => {
  it('is true when scope is set, journey is null, and no narrower selection exists', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', journey: null },
      }),
    });
    expect(result.current.isRegionOverview).toBe(true);
  });

  it('is false when a narrower selection (groupId) is present', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', journey: null, groupId: 'group-1' },
      }),
    });
    expect(result.current.isRegionOverview).toBe(false);
  });

  it('is false when a marker listing is selected', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', journey: null },
        selectedMarkerListing: MARKER_LISTING,
      }),
    });
    expect(result.current.isRegionOverview).toBe(false);
  });

  it('is false when scope is null', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({ urlState: { ...BASE_URL_STATE, scope: null } }),
    });
    expect(result.current.isRegionOverview).toBe(false);
  });
});

describe('useDiscoverMapPresentation — regionOverviewMarkerKind', () => {
  const group: AreaGroup = {
    id: 'group-1',
    name: 'Zone A',
    subtitle: null,
    region_label: 'North Udupi',
    school_count: 0,
    area_keys: ['area-1'],
  };

  it("is 'zones' when region-overview + region-zone-areas layer + overviewAreas has an isGroup item", () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'region-zone-areas',
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.regionOverviewMarkerKind).toBe('zones');
  });

  it("is 'areas' when region-overview + region-zone-areas layer + a direct single-group match (member areas, no isGroup flag)", () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'region-zone-areas',
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'group-1' },
      }),
    });
    expect(result.current.regionOverviewMarkerKind).toBe('areas');
  });

  it('is null when not region-overview (a groupId is set)', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'region-zone-areas',
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', groupId: 'group-1' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.regionOverviewMarkerKind).toBeNull();
  });

  it('is null when region-overview but the layer is not region-zone-areas', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'macro-region-bubbles',
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.regionOverviewMarkerKind).toBeNull();
  });

  it('is null when region-overview + region-zone-areas layer but overviewAreas resolves empty', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'region-zone-areas',
        isLoadingAreaGroups: true,
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.regionOverviewMarkerKind).toBeNull();
  });
});

describe('useDiscoverMapPresentation — areaJourneySegments / schoolJourneySegments', () => {
  it('drops a null/empty-label segment (zone-only context: no group, no area)', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        city: 'udupi',
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    const keys = result.current.areaJourneySegments.map((s) => s.key);
    expect(keys).toEqual(['city', 'region']);
  });

  it('area context includes group + area crumbs once a selectedArea/groupId resolve', () => {
    const group: AreaGroup = {
      id: 'group-1',
      name: 'Zone A',
      subtitle: null,
      region_label: 'North Udupi',
      school_count: 0,
      area_keys: ['area-1'],
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        city: 'udupi',
        focusedGroup: group,
        selectedArea: AREA_1,
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', groupId: 'group-1', areaKey: 'area-1' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.areaJourneySegments.map((s) => s.key)).toEqual(['city', 'region', 'group', 'area']);
    expect(result.current.areaJourneySegments.find((s) => s.key === 'area')?.label).toBe('Area One');
  });

  it('school context appends the school crumb only once schoolId is in the URL', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        city: 'udupi',
        selectedSchool: SELECTED_SCHOOL,
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', schoolId: 'school-1' },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    const schoolSegment = result.current.schoolJourneySegments.find((s) => s.key === 'school');
    expect(schoolSegment?.label).toBe('Manipal Public School');
  });

  it('school segment is dropped when schoolId is absent even if selectedSchool is stale/present', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        city: 'udupi',
        selectedSchool: SELECTED_SCHOOL,
        urlState: { ...BASE_URL_STATE, scope: 'north-udupi', schoolId: null },
        summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
      }),
    });
    expect(result.current.schoolJourneySegments.some((s) => s.key === 'school')).toBe(false);
  });
});

describe('useDiscoverMapPresentation — region/breadcrumb non-memoization (AC-NON-MEMO)', () => {
  it('region/breadcrumb segment arrays are rebuilt (non-memoized) on every render', () => {
    const initialProps = baseProps({
      city: 'udupi',
      urlState: { ...BASE_URL_STATE, scope: 'north-udupi' },
      summaryRegions: [{ regionKey: 'north-udupi', regionLabel: 'North Udupi', listingCount: 5 }],
    });
    const { result, rerender } = renderHook((props: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(props), {
      initialProps,
    });
    const a = result.current.areaJourneySegments;
    const b = result.current.schoolJourneySegments;
    rerender(initialProps);
    expect(result.current.areaJourneySegments).not.toBe(a);
    expect(result.current.schoolJourneySegments).not.toBe(b);
  });
});
