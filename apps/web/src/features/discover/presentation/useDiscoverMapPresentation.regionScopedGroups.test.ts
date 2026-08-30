/**
 * Issue #1910 (PR2) — useDiscoverMapPresentation region-scoped projection +
 * boundsStatus map-rendering rule tests.
 *
 * Covers:
 *  - boundsStatus === 'UNAVAILABLE' groups are OMITTED from overviewAreas
 *    entirely (never a fabricated/fallback marker position).
 *  - boundsStatus === 'APPROXIMATE' groups render at the projection's own
 *    (real, partial-bounds) focusLat/focusLon midpoint.
 *  - boundsStatus === 'COMPLETE' groups render normally (control case).
 *  - Resolution A→B: a group present in the region-scoped projection appears
 *    on the map even when the unscoped `groups` list's region_key points to
 *    a different region.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverMapPresentation,
  type UseDiscoverMapPresentationParams,
} from './useDiscoverMapPresentation';
import type { ScopeNamespaces } from './resolveScope';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';

const AREA_1: AreaPoint = {
  areaKey: 'area-1',
  areaLabel: 'Area One',
  geo_center_lat: 13.35,
  geo_center_lon: 74.75,
  bbox: null,
  listingCount: 4,
};
const DISCOVER_AREAS: AreaPoint[] = [AREA_1];

// Issue #1910 (PR2 review fix) — real backend region_key ('E'), not a
// lowercase synthetic ('east') that no live city ever actually produces
// (see CityRegionProjection.FULL_CANONICAL_ORDER). resolveScope now also
// recognizes 'east' as a built-in alias for 'E' regardless of
// scopeNamespaces, so a synthetic 'east' fixture would no longer exercise
// this hook's OWN scopeNamespaces-consuming path distinctly from that
// baked-in alias resolution — using the real key keeps this suite testing
// production-realistic input.
const BASE_URL_STATE: DiscoverUrlState = {
  city: 'bangalore',
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
  scope: 'E',
};

const SCOPE_NAMESPACES: ScopeNamespaces = {
  regionKeys: new Set(['E']),
  groupSlugs: new Set(),
};

function makeRegionScopedGroup(overrides: Partial<RegionScopedAreaGroup> = {}): RegionScopedAreaGroup {
  return {
    groupSlug: 'tech-corridor',
    name: 'Tech Corridor',
    subtitle: null,
    scopingRegionKey: 'E',
    regionDisplayOrder: 1,
    areaKeys: ['area-1'],
    listingCount: 42,
    focusLat: 12.97,
    focusLon: 77.75,
    minLat: 12.9,
    minLon: 77.7,
    maxLat: 13.0,
    maxLon: 77.8,
    boundsStatus: 'COMPLETE',
    ...overrides,
  };
}

function baseProps(overrides: Partial<UseDiscoverMapPresentationParams> = {}): UseDiscoverMapPresentationParams {
  return {
    mapLayerKind: 'area-group-bubbles',
    isLoadingAreaGroups: false,
    isLoadingRegionalAreaGroups: false,
    isLandingState: false,
    isAreaFirstCityLanding: false,
    areaGroupsData: { groups: [] },
    discoverAreas: DISCOVER_AREAS,
    corridorGroups: [],
    agriAreasData: undefined,
    liveAreas: DISCOVER_AREAS,
    urlState: BASE_URL_STATE,
    summaryRegions: [{ regionKey: 'E', regionLabel: 'East Bangalore', listingCount: 100 }],
    cityCenter: [13.34, 74.74],
    focusedGroup: null,
    debouncedAreaSearchQuery: '',
    scopeNamespaces: SCOPE_NAMESPACES,
    ...overrides,
  };
}

describe('useDiscoverMapPresentation — boundsStatus map-rendering rule (Issue #1910)', () => {
  it('omits a boundsStatus:UNAVAILABLE group entirely (no fabricated marker position)', () => {
    const unavailable = makeRegionScopedGroup({
      groupSlug: 'no-geometry-group',
      boundsStatus: 'UNAVAILABLE',
      focusLat: null,
      focusLon: null,
      minLat: null,
      minLon: null,
      maxLat: null,
      maxLon: null,
    });
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps({ regionScopedGroups: [unavailable] }) },
    );
    expect(result.current.overviewAreas).toEqual([]);
    expect(result.current.overviewAreas.some((a) => a.areaKey === 'no-geometry-group')).toBe(false);
  });

  it('renders a boundsStatus:APPROXIMATE group at the projection\'s own partial-bounds midpoint', () => {
    const approximate = makeRegionScopedGroup({
      groupSlug: 'partial-geometry-group',
      boundsStatus: 'APPROXIMATE',
      focusLat: 12.5,
      focusLon: 77.1,
      minLat: 12.4,
      minLon: 77.0,
      maxLat: 12.6,
      maxLon: 77.2,
    });
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps({ regionScopedGroups: [approximate] }) },
    );
    expect(result.current.overviewAreas).toHaveLength(1);
    const marker = result.current.overviewAreas[0];
    expect(marker.areaKey).toBe('partial-geometry-group');
    expect(marker.geo_center_lat).toBe(12.5);
    expect(marker.geo_center_lon).toBe(77.1);
    expect(marker.bbox).toEqual([[12.4, 77.0], [12.6, 77.2]]);
  });

  it('renders a boundsStatus:COMPLETE group normally (control case)', () => {
    const complete = makeRegionScopedGroup({ boundsStatus: 'COMPLETE' });
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps({ regionScopedGroups: [complete] }) },
    );
    expect(result.current.overviewAreas).toHaveLength(1);
    expect(result.current.overviewAreas[0].areaKey).toBe('tech-corridor');
    expect(result.current.overviewAreas[0].listingCount).toBe(42);
  });

  it('a zero-listingCount projection group is filtered out (mirrors the legacy (listingCount ?? 0) > 0 guard)', () => {
    const zeroListings = makeRegionScopedGroup({ listingCount: 0 });
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      { initialProps: baseProps({ regionScopedGroups: [zeroListings] }) },
    );
    expect(result.current.overviewAreas).toEqual([]);
  });
});

describe('useDiscoverMapPresentation — Resolution A→B via region-scoped projection (Issue #1910)', () => {
  it('includes a group on the map whose unscoped region_key points to a DIFFERENT region than the active scope', () => {
    // Old unscoped groups list assigns this group to 'W' (plurality region);
    // it must still appear on the map when scope='E' because the region-scoped
    // projection says it has real members in 'E'.
    const spanningGroupUnscoped: AreaGroup = {
      id: 'tech-corridor',
      name: 'Tech Corridor',
      subtitle: null,
      region_label: 'West Bangalore',
      school_count: 0,
      area_keys: ['area-1'],
      region_key: 'W',
    };
    const spanningGroupProjection = makeRegionScopedGroup();

    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      {
        initialProps: baseProps({
          areaGroupsData: { groups: [spanningGroupUnscoped] },
          regionScopedGroups: [spanningGroupProjection],
        }),
      },
    );

    expect(result.current.overviewAreas).toHaveLength(1);
    expect(result.current.overviewAreas[0].areaKey).toBe('tech-corridor');
  });

  it('renders NO markers (never the legacy Resolution-A fallback) while the projection is undefined — covers BOTH pending and error, since React Query only ever populates `data` on genuine success (Issue #1910 PR2 review fix, Finding 3)', () => {
    const group: AreaGroup = {
      id: 'legacy-group',
      name: 'Legacy Group',
      subtitle: null,
      region_label: 'East Bangalore',
      school_count: 0,
      area_keys: ['area-1'],
      region_key: 'E',
      focus_lat: 13.35,
      focus_lon: 74.75,
    };
    const { result } = renderHook(
      (p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p),
      {
        initialProps: baseProps({
          areaGroupsData: { groups: [group] },
          regionScopedGroups: undefined,
        }),
      },
    );
    // Review fix (#1910 PR2) — regionScopedGroups undefined previously fell
    // back to the legacy region_key filter, rendering a marker built from
    // data the panel/camera do NOT trust for this exact reason (Resolution
    // A). The map, panel, and camera now share one query-state contract:
    // pending or error → no markers at all, only a genuine success renders
    // anything.
    expect(result.current.overviewAreas).toEqual([]);
  });
});
