/**
 * Tests for propertyTypeConfig.ts (Issue #1606 R-A)
 *
 * Coverage:
 * - getPropertyTypeVisual returns the correct colour, label, and glyph for known types
 * - Unknown / empty types fall back to the grey 'Other' config (colour #6B7280)
 * - PROPERTY_TYPE_VISUAL_MAP has all expected canonical keys
 * - GLYPH_SVG_PATHS has paths for building, home, and landplot
 */

import { describe, it, expect } from 'vitest';
import {
  getPropertyTypeVisual,
  PROPERTY_TYPE_VISUAL_MAP,
  GLYPH_SVG_PATHS,
} from '../propertyTypeConfig';

describe('getPropertyTypeVisual', () => {
  it('returns navy #26395B for apartment', () => {
    const v = getPropertyTypeVisual('apartment');
    expect(v.colour).toBe('#26395B');
    expect(v.label).toBe('Apartments');
    expect(v.glyph).toBe('building');
  });

  it('returns copper #B05C3A for villa', () => {
    const v = getPropertyTypeVisual('villa');
    expect(v.colour).toBe('#B05C3A');
    expect(v.label).toBe('Villas');
    expect(v.glyph).toBe('home');
  });

  it('returns copper #B05C3A for house', () => {
    const v = getPropertyTypeVisual('house');
    expect(v.colour).toBe('#B05C3A');
    expect(v.label).toBe('Houses');
    expect(v.glyph).toBe('home');
  });

  it('returns evergreen #1F7A5C for land', () => {
    const v = getPropertyTypeVisual('land');
    expect(v.colour).toBe('#1F7A5C');
    expect(v.label).toBe('Plots / land');
    expect(v.glyph).toBe('landplot');
  });

  it('falls back to grey #6B7280 for an unknown type', () => {
    const v = getPropertyTypeVisual('unknown_exotic_type');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Other');
  });

  it('falls back to grey for an empty string', () => {
    const v = getPropertyTypeVisual('');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Other');
  });

  it('falls back to grey for agricultural_land (not in primary map)', () => {
    // agricultural_land is excluded from area-first journey; its visual should be grey
    const v = getPropertyTypeVisual('agricultural_land');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Other');
  });

  it('returns grey #6B7280 for commercial', () => {
    const v = getPropertyTypeVisual('commercial');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Other');
  });

  it('returns grey #6B7280 for warehouse', () => {
    const v = getPropertyTypeVisual('warehouse');
    expect(v.colour).toBe('#6B7280');
  });

  it('returns a tintBg and tintFg for every known type', () => {
    for (const key of Object.keys(PROPERTY_TYPE_VISUAL_MAP)) {
      const v = getPropertyTypeVisual(key);
      expect(typeof v.tintBg).toBe('string');
      expect(v.tintBg.length).toBeGreaterThan(0);
      expect(typeof v.tintFg).toBe('string');
      expect(v.tintFg.length).toBeGreaterThan(0);
    }
  });
});

describe('PROPERTY_TYPE_VISUAL_MAP', () => {
  it('has apartment, villa, house, land as canonical keys', () => {
    expect(PROPERTY_TYPE_VISUAL_MAP).toHaveProperty('apartment');
    expect(PROPERTY_TYPE_VISUAL_MAP).toHaveProperty('villa');
    expect(PROPERTY_TYPE_VISUAL_MAP).toHaveProperty('house');
    expect(PROPERTY_TYPE_VISUAL_MAP).toHaveProperty('land');
  });

  it('has commercial, commercial_building, warehouse, commercial_land, other as grey fallback keys', () => {
    for (const key of ['commercial', 'commercial_building', 'warehouse', 'commercial_land', 'other']) {
      expect(PROPERTY_TYPE_VISUAL_MAP).toHaveProperty(key);
      expect(PROPERTY_TYPE_VISUAL_MAP[key].colour).toBe('#6B7280');
    }
  });

  it('apartment and villa have different colours (navy vs copper)', () => {
    expect(PROPERTY_TYPE_VISUAL_MAP['apartment'].colour).not.toBe(
      PROPERTY_TYPE_VISUAL_MAP['villa'].colour,
    );
  });

  it('land colour is distinct from both navy and copper', () => {
    expect(PROPERTY_TYPE_VISUAL_MAP['land'].colour).not.toBe(PROPERTY_TYPE_VISUAL_MAP['apartment'].colour);
    expect(PROPERTY_TYPE_VISUAL_MAP['land'].colour).not.toBe(PROPERTY_TYPE_VISUAL_MAP['villa'].colour);
  });
});

describe('GLYPH_SVG_PATHS', () => {
  it('has a non-empty path string for building', () => {
    expect(typeof GLYPH_SVG_PATHS.building).toBe('string');
    expect(GLYPH_SVG_PATHS.building.length).toBeGreaterThan(0);
  });

  it('has a non-empty path string for home', () => {
    expect(typeof GLYPH_SVG_PATHS.home).toBe('string');
    expect(GLYPH_SVG_PATHS.home.length).toBeGreaterThan(0);
  });

  it('has a non-empty path string for landplot', () => {
    expect(typeof GLYPH_SVG_PATHS.landplot).toBe('string');
    expect(GLYPH_SVG_PATHS.landplot.length).toBeGreaterThan(0);
  });

  it('all three glyph paths are distinct', () => {
    const paths = [GLYPH_SVG_PATHS.building, GLYPH_SVG_PATHS.home, GLYPH_SVG_PATHS.landplot];
    const unique = new Set(paths);
    expect(unique.size).toBe(3);
  });
});
