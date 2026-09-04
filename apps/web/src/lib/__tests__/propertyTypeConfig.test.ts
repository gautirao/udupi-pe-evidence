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
  getPropertyTypeLabel,
  getPropertyTypePluralLabel,
  PROPERTY_TYPE_VISUAL_MAP,
  GLYPH_SVG_PATHS,
} from '../propertyTypeConfig';
import { PROPERTY_TYPES, COMMERCIAL_TYPES } from '../listing-constants';

describe('getPropertyTypeVisual', () => {
  it('returns navy #26395B for apartment', () => {
    const v = getPropertyTypeVisual('apartment');
    expect(v.colour).toBe('#26395B');
    expect(v.label).toBe('Apartment');
    expect(v.pluralLabel).toBe('Apartments');
    expect(v.glyph).toBe('building');
  });

  it('returns copper #B05C3A for villa', () => {
    const v = getPropertyTypeVisual('villa');
    expect(v.colour).toBe('#B05C3A');
    expect(v.label).toBe('Villa');
    expect(v.pluralLabel).toBe('Villas');
    expect(v.glyph).toBe('home');
  });

  it('returns copper #B05C3A for house', () => {
    const v = getPropertyTypeVisual('house');
    expect(v.colour).toBe('#B05C3A');
    expect(v.label).toBe('House');
    expect(v.pluralLabel).toBe('Houses');
    expect(v.glyph).toBe('home');
  });

  it('returns evergreen #1F7A5C for land', () => {
    const v = getPropertyTypeVisual('land');
    expect(v.colour).toBe('#1F7A5C');
    expect(v.label).toBe('Land');
    // The legend's long-standing copy — preserved verbatim by Issue #2430.
    expect(v.pluralLabel).toBe('Plots / land');
    expect(v.glyph).toBe('landplot');
  });

  it('falls back to the neutral grey visual for an unknown type', () => {
    const v = getPropertyTypeVisual('unknown_exotic_type');
    expect(v.colour).toBe('#6B7280');
    // Issue #2430 — the neutral last resort reads 'Property', not 'Other';
    // 'Other' is a category name, not an identity a buyer can read off a pill.
    expect(v.label).toBe('Property');
  });

  it('falls back to the neutral grey visual for an empty string', () => {
    const v = getPropertyTypeVisual('');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Property');
  });

  it('gives agricultural_land its own honest label on the grey visual', () => {
    // Issue #2430 — agricultural_land is excluded from the area-first journey
    // and keeps the grey visual it already resolved to, but it is a real
    // PROPERTY_TYPES value and must no longer render as 'Other'.
    const v = getPropertyTypeVisual('agricultural_land');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Agricultural Land');
  });

  it('returns grey #6B7280 for commercial, labelled Commercial', () => {
    const v = getPropertyTypeVisual('commercial');
    expect(v.colour).toBe('#6B7280');
    expect(v.label).toBe('Commercial');
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

  // Issue #2430 NO-RESKIN INVARIANT — this PR changed label strings only. The
  // two keys it ADDED must carry exactly the grey visual they already resolved
  // to through the fallback, so no marker or legend disc can have shifted.
  // If a later PR deliberately recolours residential_plot or agricultural_land,
  // it should delete this test rather than weaken it.
  it('gives newly added keys the identical visual they resolved to via the fallback', () => {
    const fallback = PROPERTY_TYPE_VISUAL_MAP['other'];
    for (const key of ['residential_plot', 'agricultural_land']) {
      const v = PROPERTY_TYPE_VISUAL_MAP[key];
      expect(v.colour).toBe(fallback.colour);
      expect(v.glyph).toBe(fallback.glyph);
      expect(v.tintBg).toBe(fallback.tintBg);
      expect(v.tintFg).toBe(fallback.tintFg);
    }
  });

  it('keeps commercial_land on the landplot glyph and the rest of the family on building', () => {
    expect(PROPERTY_TYPE_VISUAL_MAP['commercial_land'].glyph).toBe('landplot');
    for (const key of ['commercial', 'commercial_building', 'warehouse']) {
      expect(PROPERTY_TYPE_VISUAL_MAP[key].glyph).toBe('building');
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

// ── Issue #2430 — the shared buyer-facing label authority ────────────────────

describe('getPropertyTypeLabel', () => {
  it('gives every PROPERTY_TYPES value a human label — no raw enum, no Other', () => {
    for (const { value } of PROPERTY_TYPES) {
      const label = getPropertyTypeLabel(value);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('_');
      expect(label).not.toBe(value);
      expect(label).not.toBe('Other');
    }
  });

  it('gives every PROPERTY_TYPES value a plural label with no raw enum', () => {
    for (const { value } of PROPERTY_TYPES) {
      const plural = getPropertyTypePluralLabel(value);
      expect(plural.length).toBeGreaterThan(0);
      expect(plural).not.toContain('_');
      expect(plural).not.toBe('Other');
    }
  });

  it('never labels a Commercial type Other', () => {
    for (const value of COMMERCIAL_TYPES) {
      expect(getPropertyTypeLabel(value)).not.toBe('Other');
      expect(getPropertyTypePluralLabel(value)).not.toBe('Other');
    }
  });

  it('labels the whole Commercial family exactly as issue #2430 pins it', () => {
    expect(getPropertyTypeLabel('commercial')).toBe('Commercial');
    expect(getPropertyTypeLabel('commercial_building')).toBe('Commercial Building');
    expect(getPropertyTypeLabel('warehouse')).toBe('Warehouse / Godown');
    expect(getPropertyTypeLabel('commercial_land')).toBe('Commercial Land');
  });

  it('refines a generic commercial listing when a SHOP/OFFICE subtype is recorded', () => {
    expect(getPropertyTypeLabel('commercial', 'SHOP')).toBe('Commercial Shop');
    expect(getPropertyTypeLabel('commercial', 'OFFICE')).toBe('Commercial Office');
  });

  it('accepts a lower-case subtype (input is canonicalised, not rejected)', () => {
    expect(getPropertyTypeLabel('commercial', 'shop')).toBe('Commercial Shop');
    expect(getPropertyTypeLabel('COMMERCIAL', ' office ')).toBe('Commercial Office');
  });

  it('falls back to the honest Commercial label rather than guessing Shop/Office', () => {
    // Legacy rows were migrated with a NULL subtype precisely because shop vs
    // office is not recoverable from legacy data. Never invent one.
    for (const subtype of [null, undefined, '', '   ', 'UNRECOGNISED']) {
      expect(getPropertyTypeLabel('commercial', subtype)).toBe('Commercial');
    }
  });

  it('ignores a subtype supplied for a non-commercial property type', () => {
    expect(getPropertyTypeLabel('apartment', 'SHOP')).toBe('Apartment');
    expect(getPropertyTypeLabel('land', 'OFFICE')).toBe('Land');
  });

  it('keeps an explicit derived subtype consistent with its property_type label', () => {
    // BUILDING/WAREHOUSE/LAND are server-derived, but if one ever arrives
    // explicitly it must not contradict the property_type arm.
    expect(getPropertyTypeLabel('commercial', 'BUILDING')).toBe(
      getPropertyTypeLabel('commercial_building'),
    );
    expect(getPropertyTypeLabel('commercial', 'WAREHOUSE')).toBe(getPropertyTypeLabel('warehouse'));
    expect(getPropertyTypeLabel('commercial', 'LAND')).toBe(getPropertyTypeLabel('commercial_land'));
  });

  it('resolves the plot filter alias to the land label without a visual of its own', () => {
    expect(getPropertyTypeLabel('plot')).toBe(getPropertyTypeLabel('land'));
    expect(getPropertyTypePluralLabel('plot')).toBe(getPropertyTypePluralLabel('land'));
    // The alias must NOT have leaked into the visual map — it never identifies
    // a real listing row, so it must not gain a marker colour.
    expect(PROPERTY_TYPE_VISUAL_MAP).not.toHaveProperty('plot');
  });

  it('returns the neutral Property label for null, empty and unknown types', () => {
    for (const type of [null, undefined, '', '  ', 'unknown_exotic_type']) {
      expect(getPropertyTypeLabel(type)).toBe('Property');
    }
  });

  it('is case-insensitive on the property type', () => {
    expect(getPropertyTypeLabel('COMMERCIAL_BUILDING')).toBe('Commercial Building');
    expect(getPropertyTypeLabel(' Warehouse ')).toBe('Warehouse / Godown');
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
