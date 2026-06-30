/**
 * listingFieldConfig.test.ts — M38-12A field-visibility config unit tests
 *
 * Tests the pure config API only (getListingFieldConfig, isListingFieldVisible).
 * No JSX rendering. No external services.
 *
 * Coverage:
 *   AC1/AC3  — getListingFieldConfig returns exact visibleFields set for all 8 types
 *   AC3      — irrelevant field hiding (specific negatives)
 *   AC3      — agri field exclusivity: all 9 agri fields present only for agricultural_land
 *   AC3      — commercial field separation: per-type rules for commercial-only fields
 *   AC5      — purpose gating: price/rent fields driven by listingPurpose, not propertyType
 *   AC4b     — preserve invariant: NewListing.tsx agri selects use display strings, not enum keys
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  getListingFieldConfig,
  isListingFieldVisible,
  type ListingFieldKey,
  type PropertyType,
} from './listingFieldConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a mutable copy of the type's visibleFields for assertion convenience. */
function visibleSet(type: PropertyType): Set<ListingFieldKey> {
  return new Set(getListingFieldConfig(type).visibleFields);
}

/**
 * Asserts that the visible set for `type` is EXACTLY `expected` —
 * no missing fields and no extra fields.
 */
function assertExactFields(type: PropertyType, expected: ListingFieldKey[]): void {
  const actual = visibleSet(type);
  const expectedSet = new Set<ListingFieldKey>(expected);

  const missing = expected.filter((k) => !actual.has(k));
  const extra = [...actual].filter((k) => !expectedSet.has(k));

  expect(missing, `${type}: missing fields`).toEqual([]);
  expect(extra, `${type}: unexpected extra fields`).toEqual([]);
  expect(actual.size, `${type}: total field count`).toBe(expected.length);
}

const ALL_TYPES: PropertyType[] = [
  'land',
  'agricultural_land',
  'apartment',
  'house',
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
];

// ---------------------------------------------------------------------------
// AC1/AC3 — config selection per type: exact visibleFields sets
// ---------------------------------------------------------------------------

describe('getListingFieldConfig — exact visibleFields per property type', () => {
  it('land: only landArea', () => {
    assertExactFields('land', ['landArea']);
  });

  it('agricultural_land: landArea + all 9 agri-specific fields (10 total)', () => {
    assertExactFields('agricultural_land', [
      'landArea',
      'waterSource',
      'soilType',
      'roadAccess',
      'cultivationStatus',
      'ownershipType',
      'surveyNumber',
      'landCategory',
      'farmhouseAvailable',
      'fencingDone',
    ]);
  });

  it('apartment: builtArea + bedrooms', () => {
    assertExactFields('apartment', ['builtArea', 'bedrooms']);
  });

  it('house: builtArea + bedrooms', () => {
    assertExactFields('house', ['builtArea', 'bedrooms']);
  });

  it('commercial: carpetArea + floorNumber + furnishing/washrooms/parking + frontage/usage (7 total)', () => {
    assertExactFields('commercial', [
      'carpetArea',
      'floorNumber',
      'furnishingStatus',
      'washrooms',
      'parkingCount',
      'roadFrontageFt',
      'commercialUsage',
    ]);
  });

  it('commercial_building: landArea + builtArea + totalFloors + numberOfUnits + furnishing/washrooms/parking + frontage/usage (9 total)', () => {
    assertExactFields('commercial_building', [
      'landArea',
      'builtArea',
      'totalFloors',
      'numberOfUnits',
      'furnishingStatus',
      'washrooms',
      'parkingCount',
      'roadFrontageFt',
      'commercialUsage',
    ]);
  });

  it('warehouse: landArea + builtArea + numberOfUnits + furnishing/washrooms/parking + frontage/usage (8 total)', () => {
    assertExactFields('warehouse', [
      'landArea',
      'builtArea',
      'numberOfUnits',
      'furnishingStatus',
      'washrooms',
      'parkingCount',
      'roadFrontageFt',
      'commercialUsage',
    ]);
  });

  it('commercial_land: landArea + roadFrontageFt + commercialUsage (3 total)', () => {
    assertExactFields('commercial_land', ['landArea', 'roadFrontageFt', 'commercialUsage']);
  });
});

// ---------------------------------------------------------------------------
// AC3 — irrelevant field hiding (specific negatives)
// ---------------------------------------------------------------------------

describe('isListingFieldVisible — irrelevant field hiding', () => {
  it('bedrooms is NOT visible for land', () => {
    expect(isListingFieldVisible('bedrooms', 'land', 'sale')).toBe(false);
  });

  it('bedrooms is NOT visible for commercial', () => {
    expect(isListingFieldVisible('bedrooms', 'commercial', 'sale')).toBe(false);
  });

  it('carpetArea is NOT visible for non-commercial types', () => {
    const nonCommercial: PropertyType[] = ['land', 'agricultural_land', 'apartment', 'house'];
    for (const type of nonCommercial) {
      expect(
        isListingFieldVisible('carpetArea', type, 'sale'),
        `carpetArea should not be visible for ${type}`,
      ).toBe(false);
    }
  });

  it('landArea is NOT visible for apartment or house', () => {
    expect(isListingFieldVisible('landArea', 'apartment', 'sale')).toBe(false);
    expect(isListingFieldVisible('landArea', 'house', 'sale')).toBe(false);
  });

  it('builtArea is NOT visible for land or commercial_land', () => {
    expect(isListingFieldVisible('builtArea', 'land', 'sale')).toBe(false);
    expect(isListingFieldVisible('builtArea', 'commercial_land', 'sale')).toBe(false);
  });

  it('agri fields are NOT visible for non-agricultural_land types', () => {
    const agriFields: ListingFieldKey[] = [
      'waterSource',
      'soilType',
      'roadAccess',
      'cultivationStatus',
      'ownershipType',
      'surveyNumber',
      'landCategory',
      'farmhouseAvailable',
      'fencingDone',
    ];
    const nonAgri = ALL_TYPES.filter((t) => t !== 'agricultural_land');
    for (const type of nonAgri) {
      for (const field of agriFields) {
        expect(
          isListingFieldVisible(field, type, 'sale'),
          `${field} should NOT be visible for ${type}`,
        ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AC3 — agri field exclusivity: all 9 agri fields visible ONLY for agricultural_land
// ---------------------------------------------------------------------------

const AGRI_FIELDS: ListingFieldKey[] = [
  'waterSource',
  'soilType',
  'roadAccess',
  'cultivationStatus',
  'ownershipType',
  'surveyNumber',
  'landCategory',
  'farmhouseAvailable',
  'fencingDone',
];

describe('isListingFieldVisible — agri field exclusivity to agricultural_land', () => {
  it('all 9 agri fields ARE visible for agricultural_land/sale', () => {
    for (const field of AGRI_FIELDS) {
      expect(
        isListingFieldVisible(field, 'agricultural_land', 'sale'),
        `${field} should be visible for agricultural_land`,
      ).toBe(true);
    }
  });

  it('all 9 agri fields ARE visible for agricultural_land/rent', () => {
    for (const field of AGRI_FIELDS) {
      expect(
        isListingFieldVisible(field, 'agricultural_land', 'rent'),
        `${field} should be visible for agricultural_land (rent)`,
      ).toBe(true);
    }
  });

  // Exact-match guards against substring/prefix leakage:
  // 'land' must NOT pick up 'agricultural_land' fields.
  it('land type does NOT pick up agricultural_land agri fields (prefix-leak guard)', () => {
    for (const field of AGRI_FIELDS) {
      expect(
        isListingFieldVisible(field, 'land', 'sale'),
        `${field} prefix-leak: 'land' must not inherit from 'agricultural_land'`,
      ).toBe(false);
    }
  });

  it('commercial_land does NOT pick up agricultural_land agri fields', () => {
    for (const field of AGRI_FIELDS) {
      expect(
        isListingFieldVisible(field, 'commercial_land', 'sale'),
        `${field} should NOT be visible for commercial_land`,
      ).toBe(false);
    }
  });

  it('each of the remaining 6 types also excludes all agri fields', () => {
    const nonAgri = ALL_TYPES.filter((t) => t !== 'agricultural_land');
    for (const type of nonAgri) {
      for (const field of AGRI_FIELDS) {
        expect(
          isListingFieldVisible(field, type, 'sale'),
          `${field} should NOT be visible for ${type}`,
        ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AC3 — commercial field separation: per-type rules
// ---------------------------------------------------------------------------

describe('isListingFieldVisible — commercial field separation', () => {
  const NON_COMMERCIAL: PropertyType[] = ['apartment', 'house', 'land', 'agricultural_land'];

  // carpetArea: ONLY for 'commercial'
  it('carpetArea is visible for commercial only', () => {
    expect(isListingFieldVisible('carpetArea', 'commercial', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter((t) => t !== 'commercial')) {
      expect(
        isListingFieldVisible('carpetArea', type, 'sale'),
        `carpetArea should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  // floorNumber: ONLY for 'commercial'
  it('floorNumber is visible for commercial only', () => {
    expect(isListingFieldVisible('floorNumber', 'commercial', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter((t) => t !== 'commercial')) {
      expect(
        isListingFieldVisible('floorNumber', type, 'sale'),
        `floorNumber should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  // totalFloors: ONLY for 'commercial_building'
  it('totalFloors is visible for commercial_building only', () => {
    expect(isListingFieldVisible('totalFloors', 'commercial_building', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter((t) => t !== 'commercial_building')) {
      expect(
        isListingFieldVisible('totalFloors', type, 'sale'),
        `totalFloors should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  // numberOfUnits: commercial_building + warehouse only
  it('numberOfUnits is visible for commercial_building and warehouse only', () => {
    expect(isListingFieldVisible('numberOfUnits', 'commercial_building', 'sale')).toBe(true);
    expect(isListingFieldVisible('numberOfUnits', 'warehouse', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter((t) => t !== 'commercial_building' && t !== 'warehouse')) {
      expect(
        isListingFieldVisible('numberOfUnits', type, 'sale'),
        `numberOfUnits should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  // furnishingStatus, washrooms, parkingCount: commercial + commercial_building + warehouse
  // but NOT commercial_land or residential/agri
  it.each(['furnishingStatus', 'washrooms', 'parkingCount'] as ListingFieldKey[])(
    '%s is visible for commercial/commercial_building/warehouse but NOT commercial_land or residential',
    (field) => {
      expect(isListingFieldVisible(field, 'commercial', 'sale')).toBe(true);
      expect(isListingFieldVisible(field, 'commercial_building', 'sale')).toBe(true);
      expect(isListingFieldVisible(field, 'warehouse', 'sale')).toBe(true);

      // commercial_land explicitly excluded
      expect(isListingFieldVisible(field, 'commercial_land', 'sale')).toBe(false);

      for (const type of NON_COMMERCIAL) {
        expect(
          isListingFieldVisible(field, type, 'sale'),
          `${field} should NOT be visible for ${type}`,
        ).toBe(false);
      }
    },
  );

  // roadFrontageFt + commercialUsage: ALL 4 commercial types
  it('roadFrontageFt is visible for all 4 commercial types', () => {
    const commercialTypes: PropertyType[] = [
      'commercial',
      'commercial_building',
      'warehouse',
      'commercial_land',
    ];
    for (const type of commercialTypes) {
      expect(
        isListingFieldVisible('roadFrontageFt', type, 'sale'),
        `roadFrontageFt should be visible for ${type}`,
      ).toBe(true);
    }
  });

  it('commercialUsage is visible for all 4 commercial types', () => {
    const commercialTypes: PropertyType[] = [
      'commercial',
      'commercial_building',
      'warehouse',
      'commercial_land',
    ];
    for (const type of commercialTypes) {
      expect(
        isListingFieldVisible('commercialUsage', type, 'sale'),
        `commercialUsage should be visible for ${type}`,
      ).toBe(true);
    }
  });

  it('roadFrontageFt is NOT visible for residential/agri types', () => {
    for (const type of NON_COMMERCIAL) {
      expect(
        isListingFieldVisible('roadFrontageFt', type, 'sale'),
        `roadFrontageFt should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  it('commercialUsage is NOT visible for residential/agri types', () => {
    for (const type of NON_COMMERCIAL) {
      expect(
        isListingFieldVisible('commercialUsage', type, 'sale'),
        `commercialUsage should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// AC5 — purpose gating (price/rent fields gated on listingPurpose, not propertyType)
// ---------------------------------------------------------------------------

describe('isListingFieldVisible — purpose gating', () => {
  // Sample across types to confirm propertyType independence
  const SAMPLE_TYPES: PropertyType[] = [
    'land',
    'agricultural_land',
    'apartment',
    'house',
    'commercial',
  ];

  it('price is visible for sale and hidden for rent (across all sample types)', () => {
    for (const type of SAMPLE_TYPES) {
      expect(isListingFieldVisible('price', type, 'sale'), `price/sale/${type}`).toBe(true);
      expect(isListingFieldVisible('price', type, 'rent'), `price/rent/${type}`).toBe(false);
    }
  });

  it('monthlyRent is visible for rent and hidden for sale (across all sample types)', () => {
    for (const type of SAMPLE_TYPES) {
      expect(isListingFieldVisible('monthlyRent', type, 'rent'), `monthlyRent/rent/${type}`).toBe(true);
      expect(isListingFieldVisible('monthlyRent', type, 'sale'), `monthlyRent/sale/${type}`).toBe(false);
    }
  });

  it('securityDepositMonths is visible for rent and hidden for sale (across all sample types)', () => {
    for (const type of SAMPLE_TYPES) {
      expect(
        isListingFieldVisible('securityDepositMonths', type, 'rent'),
        `securityDepositMonths/rent/${type}`,
      ).toBe(true);
      expect(
        isListingFieldVisible('securityDepositMonths', type, 'sale'),
        `securityDepositMonths/sale/${type}`,
      ).toBe(false);
    }
  });

  it('lockInMonths is visible for rent and hidden for sale (across all sample types)', () => {
    for (const type of SAMPLE_TYPES) {
      expect(isListingFieldVisible('lockInMonths', type, 'rent'), `lockInMonths/rent/${type}`).toBe(true);
      expect(isListingFieldVisible('lockInMonths', type, 'sale'), `lockInMonths/sale/${type}`).toBe(false);
    }
  });

  it('purpose-gated fields are independent of propertyType (commercial vs apartment give same result)', () => {
    expect(isListingFieldVisible('price', 'commercial', 'sale')).toBe(
      isListingFieldVisible('price', 'apartment', 'sale'),
    );
    expect(isListingFieldVisible('price', 'commercial', 'rent')).toBe(
      isListingFieldVisible('price', 'apartment', 'rent'),
    );
    expect(isListingFieldVisible('monthlyRent', 'warehouse', 'rent')).toBe(
      isListingFieldVisible('monthlyRent', 'land', 'rent'),
    );
    expect(isListingFieldVisible('lockInMonths', 'agricultural_land', 'sale')).toBe(
      isListingFieldVisible('lockInMonths', 'commercial_building', 'sale'),
    );
  });
});

// ---------------------------------------------------------------------------
// AC4b — preserve invariant: agri SelectItem values in NewListing.tsx are
// display strings, NOT canonicalized enum keys. The listingFieldConfig module
// governs render visibility only — it deliberately does NOT canonicalize values.
//
// AC4b: canonicalization deliberately absent — see enum_divergence_rationale
// ---------------------------------------------------------------------------

describe('AC4b preserve invariant — NewListing.tsx agri selects use display strings (not enum keys)', () => {
  const __dir = dirname(fileURLToPath(import.meta.url));
  // Resolve relative to this test file (src/lib/) → src/pages/broker/NewListing.tsx
  const newListingSrc = readFileSync(
    resolve(__dir, '../pages/broker/NewListing.tsx'),
    'utf-8',
  );

  // soilType: values must be display strings ('Red laterite' etc.), not enum keys
  it('soilType SelectItem values are display strings in NewListing.tsx', () => {
    expect(newListingSrc).toContain("'Red laterite'");
    expect(newListingSrc).toContain("'Black cotton'");
    expect(newListingSrc).toContain("'Sandy loam'");
    expect(newListingSrc).toContain("'Alluvial'");
  });

  it('NewListing.tsx does NOT use enum key RED_LATERITE as a soilType SelectItem value', () => {
    // If someone canonicalizes soilType in NewListing.tsx, this guard breaks.
    // Canonical keys live in agriFieldLabels.ts (for the read path); NewListing keeps display strings.
    expect(newListingSrc).not.toContain('RED_LATERITE');
    expect(newListingSrc).not.toContain('BLACK_COTTON');
    expect(newListingSrc).not.toContain('SANDY_LOAM');
  });

  // roadAccess: display strings preserved
  it('roadAccess SelectItem values are display strings in NewListing.tsx', () => {
    expect(newListingSrc).toContain("'Tarred road'");
    expect(newListingSrc).toContain("'Gravel road'");
    expect(newListingSrc).toContain("'Kachcha road'");
    expect(newListingSrc).toContain("'No road access'");
  });

  it('NewListing.tsx does NOT use enum key TARRED_ROAD as a roadAccess SelectItem value', () => {
    expect(newListingSrc).not.toContain('TARRED_ROAD');
    expect(newListingSrc).not.toContain('KACHCHA_ROAD');
    expect(newListingSrc).not.toContain('GRAVEL_ROAD');
  });

  // cultivationStatus: display strings preserved
  it('cultivationStatus SelectItem values are display strings in NewListing.tsx', () => {
    expect(newListingSrc).toContain("'Cultivated'");
    expect(newListingSrc).toContain("'Fallow'");
    expect(newListingSrc).toContain("'Partially cultivated'");
    expect(newListingSrc).toContain("'Uncultivated'");
  });

  it('NewListing.tsx does NOT use enum key CULTIVATED/FALLOW as cultivationStatus values', () => {
    expect(newListingSrc).not.toContain('PARTIALLY_CULTIVATED');
    expect(newListingSrc).not.toContain('ARECA_PLANTATION');
  });

  // ownershipType: display strings preserved
  it('ownershipType SelectItem values are display strings in NewListing.tsx', () => {
    expect(newListingSrc).toContain("'Patta'");
    expect(newListingSrc).toContain("'Survey settlement'");
    expect(newListingSrc).toContain("'Katha'");
    expect(newListingSrc).toContain("'Revenue'");
  });

  it('NewListing.tsx does NOT use enum key SURVEY_SETTLEMENT as ownershipType value', () => {
    expect(newListingSrc).not.toContain('SURVEY_SETTLEMENT');
    expect(newListingSrc).not.toContain('FREEHOLD');
    // 'PATTA' and 'KATHA' appear in agriFieldLabels.ts, not NewListing.tsx
    expect(newListingSrc).not.toContain('PATTA');
  });
});
