/**
 * Issue #1824 Slice S9b1 — AC5 mandatory renderHook coverage for
 * useDiscoverMapPresentation's overviewAreas derivation: one case per
 * branch (6 mutually-exclusive layer branches + the 'all-areas' fallthrough,
 * 7 total per the plan's AC5 (i) enumeration), plus the memo-identity
 * negative case and the recompute positive control.
 *
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s9b-design.md
 * and .claude/handoffs/issue-1824/approved-plan.toml [acceptance_criteria] AC5.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverMapPresentation,
  type UseDiscoverMapPresentationParams,
} from './useDiscoverMapPresentation';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

const AREA_1: AreaPoint = {
  areaKey: 'area-1',
  areaLabel: 'Area One',
  geo_center_lat: 13.35,
  geo_center_lon: 74.75,
  bbox: null,
  listingCount: 4,
};
const AREA_2: AreaPoint = {
  areaKey: 'area-2',
  areaLabel: 'Area Two',
  geo_center_lat: 13.36,
  geo_center_lon: 74.76,
  bbox: null,
  listingCount: 2,
};
const DISCOVER_AREAS: AreaPoint[] = [AREA_1, AREA_2];

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

describe('useDiscoverMapPresentation — overviewAreas branches (AC5.i)', () => {
  it('zoom-gated / agri-drilldown branch returns []', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({ mapLayerKind: 'zoom-gated' }),
    });
    expect(result.current.overviewAreas).toEqual([]);
  });

  it('area-group-bubbles branch (scoped group) returns the scoped group member areas', () => {
    const group: AreaGroup = {
      id: 'group-1',
      name: 'Zone A',
      subtitle: null,
      region_label: 'North',
      school_count: 0,
      area_keys: ['area-1'],
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'area-group-bubbles',
        areaGroupsData: { groups: [group] },
        urlState: { ...BASE_URL_STATE, scope: 'group-1' },
      }),
    });
    expect(result.current.overviewAreas).toEqual([AREA_1]);
  });

  it('macro-region-bubbles branch returns region summary bubbles from summaryRegions', () => {
    const group: AreaGroup = {
      id: 'north',
      name: 'North Zone',
      subtitle: null,
      region_label: null,
      school_count: 0,
      area_keys: ['area-1'],
      focus_lat: 13.5,
      focus_lon: 74.9,
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'macro-region-bubbles',
        areaGroupsData: { groups: [group] },
        summaryRegions: [{ regionKey: 'north', regionLabel: 'North', listingCount: 5 }],
      }),
    });
    expect(result.current.overviewAreas).toHaveLength(1);
    expect(result.current.overviewAreas[0]).toMatchObject({
      areaKey: 'north',
      areaLabel: 'North',
      geo_center_lat: 13.5,
      geo_center_lon: 74.9,
      listingCount: 5,
      isMacroRegion: true,
    });
  });

  it('agri-corridor-bubbles branch returns corridor bubbles from corridorGroups', () => {
    const corridor: CorridorGroupData = {
      directionCode: 'N',
      groupName: 'North Corridor',
      availableMaxDistances: [
        { maxKm: 25, distanceLabel: '10-25 km', includedBandCodes: ['10_25'], listingCount: 3, areaKeys: ['agri-1'] },
      ],
    };
    const agriArea: DiscoverArea = {
      areaKey: 'agri-1',
      name: 'Agri Area',
      geoCenterLat: 13.4,
      geoCenterLon: 74.8,
      listingCount: 3,
      schoolCount: 0,
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'agri-corridor-bubbles',
        corridorGroups: [corridor],
        agriAreasData: [agriArea],
      }),
    });
    expect(result.current.overviewAreas).toHaveLength(1);
    expect(result.current.overviewAreas[0]).toMatchObject({
      areaKey: 'N',
      areaLabel: 'North Corridor',
      listingCount: 3,
      isGroup: true,
    });
  });

  it('areaKey-selected branch returns [] when urlState.areaKey is set', () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'all-areas',
        urlState: { ...BASE_URL_STATE, areaKey: 'area-1' },
      }),
    });
    expect(result.current.overviewAreas).toEqual([]);
  });

  it('focusedGroup-selected branch filters discoverAreas to the group member keys', () => {
    const group: AreaGroup = {
      id: 'group-2',
      name: 'Zone B',
      subtitle: null,
      region_label: null,
      school_count: 0,
      area_keys: ['area-2'],
    };
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({
        mapLayerKind: 'all-areas',
        focusedGroup: group,
      }),
    });
    expect(result.current.overviewAreas).toEqual([AREA_2]);
  });

  it("all-areas fallthrough returns the full discoverAreas set", () => {
    const { result } = renderHook((p: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(p), {
      initialProps: baseProps({ mapLayerKind: 'all-areas' }),
    });
    expect(result.current.overviewAreas).toBe(DISCOVER_AREAS);
  });
});

describe('useDiscoverMapPresentation — overviewAreas memo identity (AC5.ii/iii)', () => {
  it('overviewAreas memo is identity-stable across a re-render with unchanged inputs', () => {
    const initialProps = baseProps({ mapLayerKind: 'zoom-gated' });
    const { result, rerender } = renderHook((props: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(props), {
      initialProps,
    });
    const first = result.current.overviewAreas;
    rerender(initialProps);
    expect(result.current.overviewAreas).toBe(first);
  });

  it('overviewAreas memo recomputes when a real dependency changes', () => {
    const initialProps = baseProps({ mapLayerKind: 'zoom-gated' });
    const { result, rerender } = renderHook((props: UseDiscoverMapPresentationParams) => useDiscoverMapPresentation(props), {
      initialProps,
    });
    const first = result.current.overviewAreas;
    rerender(baseProps({ mapLayerKind: 'all-areas' }));
    expect(result.current.overviewAreas).not.toBe(first);
  });
});
