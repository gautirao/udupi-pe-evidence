import { describe, it, expect } from 'vitest';
import {
  displayCity,
  scopedGroups,
  activeScopeLabel,
  macroRegionSections,
  totalSchoolCount,
  zoneMemberAreas,
} from './schoolBrowseZones';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';

function makeGroup(overrides: Partial<AreaGroup> = {}): AreaGroup {
  return {
    id: 'g1',
    name: 'University Belt',
    subtitle: null,
    region_label: null,
    school_count: 0,
    area_keys: ['IN|KA|Udupi|Manipal'],
    ...overrides,
  };
}

function makeArea(overrides: Partial<DiscoverArea> = {}): DiscoverArea {
  return {
    areaKey: 'IN|KA|Udupi|Manipal',
    name: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 4,
    schoolCount: 12,
    ...overrides,
  };
}

describe('displayCity', () => {
  it('capitalises the city slug when no distinct cityLabel is given', () => {
    expect(displayCity('udupi', null)).toBe('Udupi');
  });

  it('uses cityLabel when distinct from the raw city slug', () => {
    expect(displayCity('udupi', 'Udupi District')).toBe('Udupi District');
  });

  it('falls back to capitalised city when cityLabel equals the raw slug', () => {
    expect(displayCity('udupi', 'udupi')).toBe('Udupi');
  });
});

describe('scopedGroups', () => {
  const groups = [makeGroup({ id: 'g1', region_key: 'north' }), makeGroup({ id: 'g2', region_key: 'south' })];

  it('returns all groups when scope is null', () => {
    expect(scopedGroups(groups, null)).toBe(groups);
  });

  it('filters by strict region_key equality', () => {
    expect(scopedGroups(groups, 'south').map((g) => g.id)).toEqual(['g2']);
  });
});

describe('activeScopeLabel', () => {
  const summaryRegions: SummaryRegionRef[] = [{ regionKey: 'north', regionLabel: 'Northern Udupi' }];

  it('returns null when scope is null', () => {
    expect(activeScopeLabel(null, [], [])).toBeNull();
  });

  it('prefers a matching summaryRegions label (case-insensitive)', () => {
    expect(activeScopeLabel('NORTH', summaryRegions, [])).toBe('Northern Udupi');
  });

  it('falls back to the first scoped group\'s region_label', () => {
    expect(activeScopeLabel('east', [], [makeGroup({ region_label: 'Eastern Belt' })])).toBe('Eastern Belt');
  });

  it('falls back to a capitalised scope slug when nothing else matches', () => {
    expect(activeScopeLabel('west', [], [])).toBe('West');
  });
});

describe('macroRegionSections', () => {
  it('returns [] when a scope is active', () => {
    expect(macroRegionSections([makeGroup()], 'north')).toEqual([]);
  });

  it('groups by macro-region label when unscoped', () => {
    const groups = [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })];
    const sections = macroRegionSections(groups, null);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.reduce((n, s) => n + s.groups.length, 0)).toBe(2);
  });
});

describe('zoneMemberAreas', () => {
  it('returns the DiscoverArea rows whose areaKey is in the group', () => {
    const group = makeGroup({ area_keys: ['IN|KA|Udupi|Manipal'] });
    const areas = [makeArea(), makeArea({ areaKey: 'IN|KA|Udupi|Other', name: 'Other' })];
    expect(zoneMemberAreas(group, areas).map((a) => a.areaKey)).toEqual(['IN|KA|Udupi|Manipal']);
  });
});

describe('totalSchoolCount', () => {
  const areas = [makeArea({ schoolCount: 12 }), makeArea({ areaKey: 'k2', schoolCount: 5 })];

  it('sums schoolCount across member areas of scoped groups when scope is set', () => {
    const groups = [makeGroup({ area_keys: ['IN|KA|Udupi|Manipal', 'k2'] })];
    expect(totalSchoolCount(groups, areas, 'north', groups)).toBe(17);
  });

  it('sums across all groups when unscoped', () => {
    const groups = [makeGroup({ area_keys: ['IN|KA|Udupi|Manipal'] })];
    expect(totalSchoolCount(groups, areas, null, [])).toBe(12);
  });
});
