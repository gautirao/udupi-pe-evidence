/**
 * Tests for agriFieldLabels.ts (Issue #1459)
 *
 * Verifies:
 * - All 6 label maps are exported and are objects
 * - Canonical key → display string for representative entries in each map
 * - Cross-map consistency: no map is missing required canonical keys
 */

import { describe, it, expect } from 'vitest';
import {
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  LAND_CATEGORY_LABELS,
  CROP_LABELS,
} from '../agriFieldLabels';

// ─── Structural: all maps are defined objects ─────────────────────────────────

describe('agriFieldLabels — structural', () => {
  it('WATER_SOURCE_LABELS is a non-null object', () => {
    expect(WATER_SOURCE_LABELS).toBeDefined();
    expect(typeof WATER_SOURCE_LABELS).toBe('object');
    expect(WATER_SOURCE_LABELS).not.toBeNull();
  });

  it('SOIL_TYPE_LABELS is a non-null object', () => {
    expect(SOIL_TYPE_LABELS).toBeDefined();
    expect(typeof SOIL_TYPE_LABELS).toBe('object');
  });

  it('ROAD_ACCESS_LABELS is a non-null object', () => {
    expect(ROAD_ACCESS_LABELS).toBeDefined();
    expect(typeof ROAD_ACCESS_LABELS).toBe('object');
  });

  it('CULTIVATION_STATUS_LABELS is a non-null object', () => {
    expect(CULTIVATION_STATUS_LABELS).toBeDefined();
    expect(typeof CULTIVATION_STATUS_LABELS).toBe('object');
  });

  it('OWNERSHIP_TYPE_LABELS is a non-null object', () => {
    expect(OWNERSHIP_TYPE_LABELS).toBeDefined();
    expect(typeof OWNERSHIP_TYPE_LABELS).toBe('object');
  });

  it('LAND_CATEGORY_LABELS is a non-null object', () => {
    expect(LAND_CATEGORY_LABELS).toBeDefined();
    expect(typeof LAND_CATEGORY_LABELS).toBe('object');
  });
});

// ─── WATER_SOURCE_LABELS ──────────────────────────────────────────────────────

describe('WATER_SOURCE_LABELS', () => {
  it('BOREWELL → "Borewell"', () => {
    expect(WATER_SOURCE_LABELS['BOREWELL']).toBe('Borewell');
  });

  it('WELL → "Open well" (not "Well")', () => {
    expect(WATER_SOURCE_LABELS['WELL']).toBe('Open well');
  });

  it('RIVER → "River" (added Issue #1459)', () => {
    expect(WATER_SOURCE_LABELS['RIVER']).toBe('River');
  });

  it('RAIN_FED → "Rain-fed" (added Issue #1459)', () => {
    expect(WATER_SOURCE_LABELS['RAIN_FED']).toBe('Rain-fed');
  });

  it('POND → "Pond"', () => {
    expect(WATER_SOURCE_LABELS['POND']).toBe('Pond');
  });

  it('STREAM → "Stream"', () => {
    expect(WATER_SOURCE_LABELS['STREAM']).toBe('Stream');
  });

  it('NOT_AVAILABLE → "Not available"', () => {
    expect(WATER_SOURCE_LABELS['NOT_AVAILABLE']).toBe('Not available');
  });

  it('OTHER → "Other"', () => {
    expect(WATER_SOURCE_LABELS['OTHER']).toBe('Other');
  });

  it('has entries for all required canonical keys', () => {
    const required = ['BOREWELL', 'WELL', 'RIVER', 'RAIN_FED', 'POND', 'STREAM', 'NOT_AVAILABLE', 'OTHER'];
    required.forEach((key) => {
      expect(WATER_SOURCE_LABELS).toHaveProperty(key);
    });
  });
});

// ─── SOIL_TYPE_LABELS ─────────────────────────────────────────────────────────

describe('SOIL_TYPE_LABELS', () => {
  it('RED_LATERITE → "Red laterite" (not "Red loam" or "Laterite")', () => {
    expect(SOIL_TYPE_LABELS['RED_LATERITE']).toBe('Red laterite');
  });

  it('BLACK_COTTON → "Black cotton"', () => {
    expect(SOIL_TYPE_LABELS['BLACK_COTTON']).toBe('Black cotton');
  });

  it('ALLUVIAL → "Alluvial"', () => {
    expect(SOIL_TYPE_LABELS['ALLUVIAL']).toBe('Alluvial');
  });

  it('SANDY_LOAM → "Sandy loam"', () => {
    expect(SOIL_TYPE_LABELS['SANDY_LOAM']).toBe('Sandy loam');
  });

  it('CLAY → "Clay"', () => {
    expect(SOIL_TYPE_LABELS['CLAY']).toBe('Clay');
  });

  it('OTHER → "Other"', () => {
    expect(SOIL_TYPE_LABELS['OTHER']).toBe('Other');
  });

  it('has entries for all required canonical keys', () => {
    const required = ['RED_LATERITE', 'BLACK_COTTON', 'ALLUVIAL', 'SANDY_LOAM', 'CLAY', 'OTHER'];
    required.forEach((key) => {
      expect(SOIL_TYPE_LABELS).toHaveProperty(key);
    });
  });
});

// ─── ROAD_ACCESS_LABELS ───────────────────────────────────────────────────────

describe('ROAD_ACCESS_LABELS', () => {
  it('TARRED_ROAD → "Tarred road"', () => {
    expect(ROAD_ACCESS_LABELS['TARRED_ROAD']).toBe('Tarred road');
  });

  it('KACHCHA_ROAD → "Kachcha road"', () => {
    expect(ROAD_ACCESS_LABELS['KACHCHA_ROAD']).toBe('Kachcha road');
  });

  it('HIGHWAY_FRONTAGE → "Highway frontage"', () => {
    expect(ROAD_ACCESS_LABELS['HIGHWAY_FRONTAGE']).toBe('Highway frontage');
  });

  it('NO_ROAD_ACCESS → "No road access"', () => {
    expect(ROAD_ACCESS_LABELS['NO_ROAD_ACCESS']).toBe('No road access');
  });

  it('OTHER → "Other"', () => {
    expect(ROAD_ACCESS_LABELS['OTHER']).toBe('Other');
  });

  it('has entries for all required canonical keys', () => {
    const required = ['TARRED_ROAD', 'KACHCHA_ROAD', 'HIGHWAY_FRONTAGE', 'NO_ROAD_ACCESS', 'OTHER'];
    required.forEach((key) => {
      expect(ROAD_ACCESS_LABELS).toHaveProperty(key);
    });
  });
});

// ─── CULTIVATION_STATUS_LABELS ────────────────────────────────────────────────

describe('CULTIVATION_STATUS_LABELS', () => {
  it('ARECA_PLANTATION → "Areca plantation"', () => {
    expect(CULTIVATION_STATUS_LABELS['ARECA_PLANTATION']).toBe('Areca plantation');
  });

  it('COCONUT_PLANTATION → "Coconut plantation"', () => {
    expect(CULTIVATION_STATUS_LABELS['COCONUT_PLANTATION']).toBe('Coconut plantation');
  });

  it('CULTIVATED → "Cultivated"', () => {
    expect(CULTIVATION_STATUS_LABELS['CULTIVATED']).toBe('Cultivated');
  });

  it('FALLOW → "Fallow"', () => {
    expect(CULTIVATION_STATUS_LABELS['FALLOW']).toBe('Fallow');
  });

  it('PARTIALLY_CULTIVATED → "Partially cultivated"', () => {
    expect(CULTIVATION_STATUS_LABELS['PARTIALLY_CULTIVATED']).toBe('Partially cultivated');
  });

  it('OTHER → "Other"', () => {
    expect(CULTIVATION_STATUS_LABELS['OTHER']).toBe('Other');
  });

  it('has entries for all required canonical keys', () => {
    const required = ['CULTIVATED', 'FALLOW', 'ARECA_PLANTATION', 'COCONUT_PLANTATION', 'PARTIALLY_CULTIVATED', 'OTHER'];
    required.forEach((key) => {
      expect(CULTIVATION_STATUS_LABELS).toHaveProperty(key);
    });
  });
});

// ─── OWNERSHIP_TYPE_LABELS ────────────────────────────────────────────────────

describe('OWNERSHIP_TYPE_LABELS', () => {
  it('FREEHOLD → "Freehold"', () => {
    expect(OWNERSHIP_TYPE_LABELS['FREEHOLD']).toBe('Freehold');
  });

  it('INHERITED → "Inherited"', () => {
    expect(OWNERSHIP_TYPE_LABELS['INHERITED']).toBe('Inherited');
  });

  it('PATTA → "Patta"', () => {
    expect(OWNERSHIP_TYPE_LABELS['PATTA']).toBe('Patta');
  });

  it('SURVEY_SETTLEMENT → "Survey settlement"', () => {
    expect(OWNERSHIP_TYPE_LABELS['SURVEY_SETTLEMENT']).toBe('Survey settlement');
  });

  it('KATHA → "Katha"', () => {
    expect(OWNERSHIP_TYPE_LABELS['KATHA']).toBe('Katha');
  });

  it('REVENUE → "Revenue"', () => {
    expect(OWNERSHIP_TYPE_LABELS['REVENUE']).toBe('Revenue');
  });

  it('OTHER → "Other"', () => {
    expect(OWNERSHIP_TYPE_LABELS['OTHER']).toBe('Other');
  });

  it('has entries for all required canonical keys', () => {
    const required = ['FREEHOLD', 'INHERITED', 'PATTA', 'SURVEY_SETTLEMENT', 'KATHA', 'REVENUE', 'OTHER'];
    required.forEach((key) => {
      expect(OWNERSHIP_TYPE_LABELS).toHaveProperty(key);
    });
  });
});

// ─── LAND_CATEGORY_LABELS ─────────────────────────────────────────────────────
// Keys match the #1458 canonical land_category values stored in the database:
// FARMLAND, PLANTATION, FARM_PLOT, AGRICULTURAL_PLOT, OTHER.

describe('LAND_CATEGORY_LABELS', () => {
  it('FARMLAND → "Farmland"', () => {
    expect(LAND_CATEGORY_LABELS['FARMLAND']).toBe('Farmland');
  });

  it('PLANTATION → "Plantation"', () => {
    expect(LAND_CATEGORY_LABELS['PLANTATION']).toBe('Plantation');
  });

  it('FARM_PLOT → "Farm plot"', () => {
    expect(LAND_CATEGORY_LABELS['FARM_PLOT']).toBe('Farm plot');
  });

  it('AGRICULTURAL_PLOT → "Agricultural plot"', () => {
    expect(LAND_CATEGORY_LABELS['AGRICULTURAL_PLOT']).toBe('Agricultural plot');
  });

  it('OTHER → "Other"', () => {
    expect(LAND_CATEGORY_LABELS['OTHER']).toBe('Other');
  });

  it('has entries for all required canonical keys', () => {
    const required = ['FARMLAND', 'PLANTATION', 'FARM_PLOT', 'AGRICULTURAL_PLOT', 'OTHER'];
    required.forEach((key) => {
      expect(LAND_CATEGORY_LABELS).toHaveProperty(key);
    });
  });
});

// ─── CROP_LABELS (#2044) ──────────────────────────────────────────────────────
// Canonical backend vocabulary — AgriFieldOptions.VALID_CROPS/CROP_LABELS.

describe('CROP_LABELS', () => {
  it('has exactly the 12 canonical backend crop keys', () => {
    const required = [
      'PADDY', 'COCONUT', 'ARECA_SUPARI', 'CASHEW', 'BANANA', 'SUGARCANE',
      'VEGETABLES', 'MANGO', 'RUBBER', 'PEPPER', 'MIXED_PLANTATION', 'FALLOW_OPEN',
    ];
    expect(Object.keys(CROP_LABELS).sort()).toEqual(required.sort());
  });

  it('does NOT have an OTHER member (DP-1: no free-text escape hatch)', () => {
    expect(CROP_LABELS).not.toHaveProperty('OTHER');
  });

  it('ARECA_SUPARI → "Areca / supari" (the old FE-only chip was labelled "Areca nut")', () => {
    expect(CROP_LABELS['ARECA_SUPARI']).toBe('Areca / supari');
  });

  it('matches every backend label exactly', () => {
    expect(CROP_LABELS['PADDY']).toBe('Paddy');
    expect(CROP_LABELS['COCONUT']).toBe('Coconut');
    expect(CROP_LABELS['CASHEW']).toBe('Cashew');
    expect(CROP_LABELS['BANANA']).toBe('Banana');
    expect(CROP_LABELS['SUGARCANE']).toBe('Sugarcane');
    expect(CROP_LABELS['VEGETABLES']).toBe('Vegetables');
    expect(CROP_LABELS['MANGO']).toBe('Mango');
    expect(CROP_LABELS['RUBBER']).toBe('Rubber');
    expect(CROP_LABELS['PEPPER']).toBe('Pepper');
    expect(CROP_LABELS['MIXED_PLANTATION']).toBe('Mixed plantation');
    expect(CROP_LABELS['FALLOW_OPEN']).toBe('Fallow / open');
  });
});
