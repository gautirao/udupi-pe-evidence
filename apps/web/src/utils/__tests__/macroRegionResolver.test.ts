import { describe, it, expect } from 'vitest';
import { labelToSlug, getGroupMacroRegionLabel, FALLBACK_REGION_LABEL } from '../macroRegionResolver';

// Issue #1882 (Track A PR2 Slice S2c) — matchesMacroRegion, resolveScopeKeyFromLabel,
// aggregateMacroRegions, DIRECTION_WORDS, and DIRECTION_ABBR_MAP have been DELETED
// from macroRegionResolver.ts (region-scope callers now compare the backend-derived
// region_key with strict equality instead of a label/direction heuristic). Their
// tests are removed accordingly — do not reintroduce them. Only labelToSlug (still
// used for GROUP-slug matching) and getGroupMacroRegionLabel (display-label fallback)
// remain in this module.

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
});
