import { describe, it, expect } from 'vitest';
import { resolveIsSelectedGroupState } from './displayEligibility';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const GROUP: AreaGroup = {
  id: 'g1',
  name: 'Manipal Belt',
  subtitle: null,
  region_label: null,
  school_count: 0,
  area_keys: ['IN|KA|Udupi|Manipal'],
};

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.79,
  bbox: null,
};

describe('resolveIsSelectedGroupState (#2142 Commit 2 — moved from MapDiscovery.tsx unchanged)', () => {
  it('is true for group-overview panel content with a focused group and no selected area', () => {
    expect(resolveIsSelectedGroupState('area-groups-landing', GROUP, null)).toBe(true);
  });

  it('is false once an area is resolved (canonical node drill-down, issue #2083 cycle 4 regression)', () => {
    expect(resolveIsSelectedGroupState('area-groups-landing', GROUP, AREA)).toBe(false);
  });

  it('is false without a focused group', () => {
    expect(resolveIsSelectedGroupState('area-groups-landing', null, null)).toBe(false);
  });

  it('is false for any other panel content', () => {
    expect(resolveIsSelectedGroupState('area-selected', GROUP, null)).toBe(false);
  });
});
