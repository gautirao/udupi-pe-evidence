import { describe, it, expect } from 'vitest';
import {
  labelToSlug,
  getGroupMacroRegionLabel,
  matchesMacroRegion,
  resolveScopeKeyFromLabel,
  aggregateMacroRegions,
  FALLBACK_REGION_LABEL,
  type SummaryRegionRef,
} from '../macroRegionResolver';

describe('macroRegionResolver', () => {
  describe('labelToSlug', () => {
    it('converts display labels to kebab-case slugs', () => {
      expect(labelToSlug('North Bangalore')).toBe('north-bangalore');
      expect(labelToSlug('  University Belt  ')).toBe('university-belt');
      expect(labelToSlug('Central Udupi (Town)')).toBe('central-udupi-town');
      expect(labelToSlug('tech---corridor')).toBe('tech-corridor');
    });
  });

  describe('getGroupMacroRegionLabel', () => {
    it('returns trimmed region_label when present', () => {
      expect(getGroupMacroRegionLabel({ region_label: ' North Bangalore ' })).toBe('North Bangalore');
      expect(getGroupMacroRegionLabel({ region_label: 'Coastal Homes' })).toBe('Coastal Homes');
    });

    it('returns fallback label when region_label is null, undefined, or empty', () => {
      expect(getGroupMacroRegionLabel({ region_label: null })).toBe(FALLBACK_REGION_LABEL);
      expect(getGroupMacroRegionLabel({ region_label: undefined })).toBe(FALLBACK_REGION_LABEL);
      expect(getGroupMacroRegionLabel({ region_label: '   ' })).toBe(FALLBACK_REGION_LABEL);
      expect(getGroupMacroRegionLabel({})).toBe(FALLBACK_REGION_LABEL);
    });
  });

  describe('matchesMacroRegion', () => {
    const mockSummaryRegions: SummaryRegionRef[] = [
      { regionKey: 'north', regionLabel: 'North Bangalore' },
      { regionKey: 'south', regionLabel: 'South Bangalore' },
      { regionKey: 'udupi-north', regionLabel: 'North Udupi' },
      { regionKey: 'coastal', regionLabel: 'Coastal Belt' },
    ];

    it('returns false when scope or groupRegionLabel is missing', () => {
      expect(matchesMacroRegion(null, 'north')).toBe(false);
      expect(matchesMacroRegion('North Bangalore', null)).toBe(false);
      expect(matchesMacroRegion('', 'north')).toBe(false);
      expect(matchesMacroRegion('North Bangalore', '')).toBe(false);
    });

    it('matches via exact string equality', () => {
      expect(matchesMacroRegion('North Bangalore', 'north bangalore')).toBe(true);
      expect(matchesMacroRegion('Coastal Belt', 'COASTAL BELT')).toBe(true);
    });

    it('matches via summaryRegions lookup without hardcoding city names', () => {
      expect(matchesMacroRegion('North Bangalore', 'north', mockSummaryRegions)).toBe(true);
      expect(matchesMacroRegion('South Bangalore', 'south', mockSummaryRegions)).toBe(true);
      expect(matchesMacroRegion('North Udupi', 'udupi-north', mockSummaryRegions)).toBe(true);
      expect(matchesMacroRegion('Coastal Belt', 'coastal', mockSummaryRegions)).toBe(true);
      // Non-matching summary region
      expect(matchesMacroRegion('South Bangalore', 'north', mockSummaryRegions)).toBe(false);
    });

    it('matches via direction prefix when summaryRegions is absent or unhelpful', () => {
      expect(matchesMacroRegion('North Bangalore', 'north')).toBe(true);
      expect(matchesMacroRegion('North Udupi', 'north')).toBe(true);
      expect(matchesMacroRegion('South Mangaluru', 'south')).toBe(true);
      expect(matchesMacroRegion('East Coast', 'east')).toBe(true);
      expect(matchesMacroRegion('West Udupi', 'west')).toBe(true);
      expect(matchesMacroRegion('Central Bangalore', 'central')).toBe(true);
    });

    it('matches via direction abbreviations', () => {
      expect(matchesMacroRegion('Northeast Bangalore', 'ne')).toBe(true);
      expect(matchesMacroRegion('Southwest Udupi', 'sw')).toBe(true);
    });

    it('matches via slug fallback', () => {
      expect(matchesMacroRegion('University Belt', 'university-belt')).toBe(true);
      expect(matchesMacroRegion('Tech Corridor', 'tech-corridor')).toBe(true);
    });

    it('returns false for mismatched macro regions', () => {
      expect(matchesMacroRegion('South Bangalore', 'north')).toBe(false);
      expect(matchesMacroRegion('University Belt', 'airport-belt')).toBe(false);
      expect(matchesMacroRegion('North Udupi', 'south')).toBe(false);
    });
  });

  describe('resolveScopeKeyFromLabel', () => {
    const mockSummaryRegions: SummaryRegionRef[] = [
      { regionKey: 'north', regionLabel: 'North Bangalore' },
      { regionKey: 'south', regionLabel: 'South Bangalore' },
      { regionKey: 'udupi-coastal', regionLabel: 'Coastal Udupi' },
    ];

    it('returns null for empty/null regionLabel', () => {
      expect(resolveScopeKeyFromLabel(null)).toBe(null);
      expect(resolveScopeKeyFromLabel(undefined)).toBe(null);
      expect(resolveScopeKeyFromLabel('   ')).toBe(null);
    });

    it('resolves via summaryRegions when matched', () => {
      expect(resolveScopeKeyFromLabel('North Bangalore', mockSummaryRegions)).toBe('north');
      expect(resolveScopeKeyFromLabel('South Bangalore', mockSummaryRegions)).toBe('south');
      expect(resolveScopeKeyFromLabel('Coastal Udupi', mockSummaryRegions)).toBe('udupi-coastal');
    });

    it('resolves via directional words when no summaryRegion matches', () => {
      expect(resolveScopeKeyFromLabel('North Mangaluru')).toBe('north');
      expect(resolveScopeKeyFromLabel('South Coast')).toBe('south');
      expect(resolveScopeKeyFromLabel('East Udupi')).toBe('east');
      expect(resolveScopeKeyFromLabel('West Coast')).toBe('west');
      expect(resolveScopeKeyFromLabel('Central Hub')).toBe('central');
    });

    it('resolves via slug fallback for custom region labels', () => {
      expect(resolveScopeKeyFromLabel('University Belt')).toBe('university-belt');
      expect(resolveScopeKeyFromLabel('Tech Corridor')).toBe('tech-corridor');
    });
  });

  describe('aggregateMacroRegions', () => {
    it('creates an Other Areas bucket when totalActiveListings exceeds mapped sum', () => {
      const summaryRegions = [
        { regionKey: 'airport-belt', regionLabel: 'Airport Belt', listingCount: 100 },
        { regionKey: 'tech-corridor', regionLabel: 'Tech Corridor', listingCount: 150 },
      ];
      const areaGroups = [
        { id: 'airport-belt', name: 'Airport Belt', region_label: 'North Bangalore' },
        { id: 'tech-corridor', name: 'Tech Corridor', region_label: 'East Bangalore' },
      ] as any[];

      const res = aggregateMacroRegions(summaryRegions, areaGroups, 1700);
      expect(res).toHaveLength(3);
      const other = res.find((r) => r.regionKey === 'other');
      expect(other).toBeDefined();
      expect(other?.listingCount).toBe(1450);
      expect(other?.regionLabel).toBe('Other Bangalore');
    });

    it('does not create an Other Areas bucket when totalActiveListings equals mapped sum', () => {
      const summaryRegions = [
        { regionKey: 'south-udupi', regionLabel: 'South Udupi', listingCount: 50 },
      ];
      const areaGroups = [
        { id: 'south-udupi', name: 'South Udupi', region_label: 'South Udupi' },
      ] as any[];

      const res = aggregateMacroRegions(summaryRegions, areaGroups, 50);
      expect(res).toHaveLength(1);
      expect(res.find((r) => r.regionKey === 'other')).toBeUndefined();
    });
  });
});

