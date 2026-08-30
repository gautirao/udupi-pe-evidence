/**
 * Issue #1910 (PR2 fix-up, Finding 1) — regression coverage for the two
 * dropped ad-hoc name/label-matching clauses from the pre-#1910
 * `resolveScope` migration (code-reviewer finding on 112f932d):
 *
 *  1. `g.name.toLowerCase() === activeScope.toLowerCase()` /
 *     `labelToSlug(g.name) === activeScope` (area-group-bubbles /
 *     region-zone-areas layer) — restored via ScopeNamespaces.groupNameSlugs.
 *  2. `g.name.toLowerCase() === region.regionLabel.toLowerCase()`
 *     (macro-region-bubbles layer) — restored as a direct comparison,
 *     covering a group whose `region_key` is still null (per
 *     AreaGroupsService.deriveRegionKey's DEGENERATE case: no member yet
 *     classified into any region) but whose own `name` already matches the
 *     region it conceptually belongs to.
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

const AREA_1: AreaPoint = {
  areaKey: 'area-1',
  areaLabel: 'Area One',
  geo_center_lat: 13.35,
  geo_center_lon: 74.75,
  bbox: null,
  listingCount: 4,
};
const DISCOVER_AREAS: AreaPoint[] = [AREA_1];

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
  scope: null,
};

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
    summaryRegions: [],
    cityCenter: [13.34, 74.74],
    focusedGroup: null,
    debouncedAreaSearchQuery: '',
    ...overrides,
  };
}

describe('useDiscoverMapPresentation — groupNameSlugs alias fallback (Finding 1, site 1)', () => {
  it('resolves a scope value equal to a group\'s labelToSlug(name) — even when it differs from the group\'s own id/slug — to that group\'s member areas', () => {
    // Real-world counterexample: V106__seed_bangalore_macro_region_mapping.sql
    // seeds ('kr-puram-belt', 'K R Puram Belt', ...) — labelToSlug('K R Puram
    // Belt') === 'k-r-puram-belt' !== the actual slug 'kr-puram-belt'.
    const group: AreaGroup = {
      id: 'kr-puram-belt',
      name: 'K R Puram Belt',
      subtitle: null,
      region_label: 'East Bangalore',
      school_count: 0,
      area_keys: ['area-1'],
      region_key: null,
    };
    const scopeNamespaces: ScopeNamespaces = {
      regionKeys: new Set(),
      groupSlugs: new Set(['kr-puram-belt']),
      groupNameSlugs: new Map([
        ['k-r-puram-belt', 'kr-puram-belt'],
        ['k r puram belt', 'kr-puram-belt'],
      ]),
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'k-r-puram-belt' },
        scopeNamespaces,
      }),
    });
    expect(result.current.overviewAreas).toEqual([AREA_1]);
  });

  it('a scope value with NO matching id/alias still resolves to [] (no silent full-list fallback)', () => {
    const group: AreaGroup = {
      id: 'kr-puram-belt',
      name: 'K R Puram Belt',
      subtitle: null,
      region_label: 'East Bangalore',
      school_count: 0,
      area_keys: ['area-1'],
    };
    const scopeNamespaces: ScopeNamespaces = {
      regionKeys: new Set(),
      groupSlugs: new Set(['kr-puram-belt']),
      groupNameSlugs: new Map([['k-r-puram-belt', 'kr-puram-belt']]),
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'totally-unrelated' },
        scopeNamespaces,
      }),
    });
    expect(result.current.overviewAreas).toEqual([]);
  });
});

describe('useDiscoverMapPresentation — group-name/region-label fallback (Finding 1, site 2)', () => {
  it('includes a group with a null region_key (DEGENERATE — no member classified yet) whose name matches the region label', () => {
    const group: AreaGroup = {
      id: 'north-udupi',
      name: 'North Udupi',
      subtitle: null,
      region_label: 'North Udupi',
      school_count: 0,
      area_keys: ['area-1'],
      region_key: null, // AreaGroupsService.deriveRegionKey DEGENERATE case
      focus_lat: 13.43,
      focus_lon: 74.75,
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'macro-region-bubbles',
        areaGroupsData: { groups: [group] },
        summaryRegions: [{ regionKey: 'north-udupi-region', regionLabel: 'North Udupi', listingCount: 4 }],
      }),
    });
    expect(result.current.overviewAreas).toHaveLength(1);
    expect(result.current.overviewAreas[0]).toMatchObject({
      areaKey: 'north-udupi-region',
      areaLabel: 'North Udupi',
      listingCount: 4,
      isMacroRegion: true,
    });
  });

  it('a group whose name does NOT match any region label and has a null region_key contributes nothing to any region bubble', () => {
    const group: AreaGroup = {
      id: 'some-group',
      name: 'Some Group',
      subtitle: null,
      region_label: null,
      school_count: 0,
      area_keys: ['area-1'],
      region_key: null,
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'macro-region-bubbles',
        areaGroupsData: { groups: [group] },
        summaryRegions: [{ regionKey: 'east', regionLabel: 'East Bangalore', listingCount: 0 }],
      }),
    });
    // listingCount 0 on the region itself => filtered out entirely (pre-existing rule).
    expect(result.current.overviewAreas).toEqual([]);
  });
});
