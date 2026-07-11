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
 */

import { describe, it, expect } from 'vitest';

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

  it('agricultural_land: landArea + all 9 agri-specific fields + facing (11 total)', () => {
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
      'facing',
    ]);
  });

  // M38-13A (#1626) — apartment/house/villa/residential_plot exact sets are asserted
  // in the dedicated "M38-13A residential typed-listing field-visibility" describe
  // block below (design-spec.md §3 type-adaptive field matrix).

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

  it('carpetArea is NOT visible for non-commercial, non-apartment types', () => {
    // M38-13A (#1626) — apartment's primary area is carpetArea (design §3); excluded here.
    const nonCommercial: PropertyType[] = ['land', 'agricultural_land', 'house', 'villa', 'residential_plot'];
    for (const type of nonCommercial) {
      expect(
        isListingFieldVisible('carpetArea', type, 'sale'),
        `carpetArea should not be visible for ${type}`,
      ).toBe(false);
    }
  });

  it('landArea is NOT visible for apartment (house/villa show it as an optional plot-area extra — M38-13A design §3)', () => {
    expect(isListingFieldVisible('landArea', 'apartment', 'sale')).toBe(false);
  });

  it('builtArea is NOT visible for land or commercial_land', () => {
    expect(isListingFieldVisible('builtArea', 'land', 'sale')).toBe(false);
    expect(isListingFieldVisible('builtArea', 'commercial_land', 'sale')).toBe(false);
  });

  it('agri fields are NOT visible for non-agricultural_land types', () => {
    // NOTE: 'ownershipType' is deliberately excluded here — M38-13A (#1626) reuses it
    // for apartment/house/villa (sale-gated) and residential_plot (design §3); its
    // dual-purpose visibility is asserted separately in the M38-13A describe blocks below.
    const agriFields: ListingFieldKey[] = [
      'waterSource',
      'soilType',
      'roadAccess',
      'cultivationStatus',
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
    // NOTE: 'ownershipType' excluded — M38-13A (#1626) reuses it for apartment
    // (sale-gated); see the dedicated M38-13A describe blocks below.
    const nonAgri = ALL_TYPES.filter((t) => t !== 'agricultural_land');
    const fieldsExclOwnership = AGRI_FIELDS.filter((f) => f !== 'ownershipType');
    for (const type of nonAgri) {
      for (const field of fieldsExclOwnership) {
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

  // carpetArea: 'commercial' + apartment (M38-13A primary area — design §3)
  it('carpetArea is visible for commercial and apartment only', () => {
    expect(isListingFieldVisible('carpetArea', 'commercial', 'sale')).toBe(true);
    expect(isListingFieldVisible('carpetArea', 'apartment', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter((t) => t !== 'commercial' && t !== 'apartment')) {
      expect(
        isListingFieldVisible('carpetArea', type, 'sale'),
        `carpetArea should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  // floorNumber: 'commercial' + apartment (M38-13A — design §3 "Floor number / Total floors")
  it('floorNumber is visible for commercial and apartment only', () => {
    expect(isListingFieldVisible('floorNumber', 'commercial', 'sale')).toBe(true);
    expect(isListingFieldVisible('floorNumber', 'apartment', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter((t) => t !== 'commercial' && t !== 'apartment')) {
      expect(
        isListingFieldVisible('floorNumber', type, 'sale'),
        `floorNumber should NOT be visible for ${type}`,
      ).toBe(false);
    }
  });

  // totalFloors: 'commercial_building' + apartment + house/villa (M38-13A — reused as
  // "Number of floors" for house/villa, design §3)
  it('totalFloors is visible for commercial_building, apartment, house, and villa only', () => {
    expect(isListingFieldVisible('totalFloors', 'commercial_building', 'sale')).toBe(true);
    expect(isListingFieldVisible('totalFloors', 'apartment', 'sale')).toBe(true);
    expect(isListingFieldVisible('totalFloors', 'house', 'sale')).toBe(true);
    expect(isListingFieldVisible('totalFloors', 'villa', 'sale')).toBe(true);
    for (const type of ALL_TYPES.filter(
      (t) => t !== 'commercial_building' && t !== 'apartment' && t !== 'house' && t !== 'villa',
    )) {
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

  // washrooms, parkingCount: commercial + commercial_building + warehouse only
  // (residential uses distinct M38-13A keys — bathrooms, parking2wCount, parking4wCount)
  it.each(['washrooms', 'parkingCount'] as ListingFieldKey[])(
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

  // furnishingStatus: commercial + commercial_building + warehouse, AND apartment/house/villa
  // (M38-13A — design §3 shows furnishing for all residential-unit subtypes too).
  it('furnishingStatus is visible for commercial family and residential-unit types, but NOT commercial_land, plot, or agri', () => {
    for (const type of ['commercial', 'commercial_building', 'warehouse', 'apartment', 'house', 'villa'] as PropertyType[]) {
      expect(isListingFieldVisible('furnishingStatus', type, 'sale'), `furnishingStatus/${type}`).toBe(true);
    }
    for (const type of ['commercial_land', 'residential_plot', 'land', 'agricultural_land'] as PropertyType[]) {
      expect(isListingFieldVisible('furnishingStatus', type, 'sale'), `furnishingStatus/${type}`).toBe(false);
    }
  });

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

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential typed-listing field-visibility.
// Exact sets derived 1:1 from design-spec.md §3 and verified against the
// backend's validateFamilyFields/validateResidentialFieldSet (subset parity).
// ---------------------------------------------------------------------------

describe('M38-13A — apartment/house/villa/residential_plot exact visibleFields (design §3)', () => {
  it('apartment: carpet-primary + residence-shared + apartment-only fields', () => {
    assertExactFields('apartment', [
      'carpetArea', 'builtArea',
      'bedrooms', 'bathrooms', 'furnishingStatus', 'facing',
      'parking2wCount', 'parking4wCount', 'isGated',
      'amenities', 'specialLocationViews', 'projectName', 'builderName', 'ownershipType',
      'balconies', 'floorNumber', 'totalFloors', 'superBuiltArea', 'hasLift', 'hasPowerBackup',
    ]);
  });

  it('house: builtup-primary + residence-shared + house/villa-only fields', () => {
    assertExactFields('house', [
      'builtArea', 'landArea',
      'bedrooms', 'bathrooms', 'furnishingStatus', 'facing',
      'parking2wCount', 'parking4wCount', 'isGated',
      'amenities', 'specialLocationViews', 'projectName', 'builderName', 'ownershipType',
      'totalFloors', 'propertyAge', 'residentialWaterSource',
      'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom',
    ]);
  });

  it('villa: identical visibleFields to house (design §3 has no house-vs-villa distinction)', () => {
    expect(visibleSet('villa')).toEqual(visibleSet('house'));
  });

  it('residential_plot: plot area + plot-only fields', () => {
    assertExactFields('residential_plot', [
      'landArea', 'facing', 'plotDimensions', 'roadWidthFt',
      'isCornerPlot', 'hasBoundaryWall', 'isGatedLayout',
      'hasWaterConnection', 'hasElectricityConnection', 'hasDrainage',
      'ownershipType', 'conversionStatus', 'khataNumber', 'propertyTaxPid',
      'approvingAuthority', 'surveyNumber', 'specialLocationViews',
    ]);
  });
});

describe('M38-13A — hard rule (AC): plot never renders residence-only fields; apartment/house never render plot-only fields', () => {
  const RESIDENCE_ONLY: ListingFieldKey[] = [
    'bedrooms', 'bathrooms', 'balconies', 'furnishingStatus', 'floorNumber', 'totalFloors',
    'parking2wCount', 'parking4wCount', 'hasLift', 'hasPowerBackup',
    'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom', 'propertyAge', 'residentialWaterSource', 'amenities',
  ];
  const PLOT_ONLY: ListingFieldKey[] = [
    'plotDimensions', 'roadWidthFt', 'conversionStatus', 'khataNumber', 'propertyTaxPid', 'approvingAuthority',
    'isCornerPlot', 'hasBoundaryWall', 'isGatedLayout', 'hasWaterConnection', 'hasElectricityConnection', 'hasDrainage',
  ];

  it('residential_plot renders NONE of the residence-only fields', () => {
    for (const field of RESIDENCE_ONLY) {
      expect(isListingFieldVisible(field, 'residential_plot', 'sale'), `${field} must be hidden for residential_plot`).toBe(false);
    }
  });

  it('apartment renders NONE of the plot-only fields', () => {
    for (const field of PLOT_ONLY) {
      expect(isListingFieldVisible(field, 'apartment', 'sale'), `${field} must be hidden for apartment`).toBe(false);
    }
  });

  it('house/villa render NONE of the plot-only fields', () => {
    for (const type of ['house', 'villa'] as PropertyType[]) {
      for (const field of PLOT_ONLY) {
        expect(isListingFieldVisible(field, type, 'sale'), `${field} must be hidden for ${type}`).toBe(false);
      }
    }
  });

  it('apartment does NOT render house/villa-only fields (garden/terrace/compound/servant/age/waterSource)', () => {
    const houseVillaOnly: ListingFieldKey[] = ['hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom', 'propertyAge', 'residentialWaterSource'];
    for (const field of houseVillaOnly) {
      expect(isListingFieldVisible(field, 'apartment', 'sale'), `${field} must be hidden for apartment`).toBe(false);
    }
  });

  it('house/villa do NOT render apartment-only fields (balconies/floorNumber/superBuiltArea/lift/power)', () => {
    const apartmentOnly: ListingFieldKey[] = ['balconies', 'floorNumber', 'superBuiltArea', 'hasLift', 'hasPowerBackup'];
    for (const type of ['house', 'villa'] as PropertyType[]) {
      for (const field of apartmentOnly) {
        expect(isListingFieldVisible(field, type, 'sale'), `${field} must be hidden for ${type}`).toBe(false);
      }
    }
  });
});

describe('M38-13A — sale vs rent conditional (design §4)', () => {
  const RESIDENTIAL_TYPES: PropertyType[] = ['apartment', 'house', 'villa', 'residential_plot'];

  it('maintenancePaise + priceNegotiable are sale-only across all 4 residential types', () => {
    for (const type of RESIDENTIAL_TYPES) {
      expect(isListingFieldVisible('maintenancePaise', type, 'sale'), `maintenancePaise/sale/${type}`).toBe(true);
      expect(isListingFieldVisible('maintenancePaise', type, 'rent'), `maintenancePaise/rent/${type}`).toBe(false);
      expect(isListingFieldVisible('priceNegotiable', type, 'sale'), `priceNegotiable/sale/${type}`).toBe(true);
      expect(isListingFieldVisible('priceNegotiable', type, 'rent'), `priceNegotiable/rent/${type}`).toBe(false);
    }
  });

  it('maintenanceIncluded/rentNegotiable/petsAllowed/availabilityTimeline/preferredTenants are rent-only across all 4 residential types', () => {
    const rentOnly: ListingFieldKey[] = ['maintenanceIncluded', 'rentNegotiable', 'petsAllowed', 'availabilityTimeline', 'preferredTenants'];
    for (const type of RESIDENTIAL_TYPES) {
      for (const field of rentOnly) {
        expect(isListingFieldVisible(field, type, 'rent'), `${field}/rent/${type}`).toBe(true);
        expect(isListingFieldVisible(field, type, 'sale'), `${field}/sale/${type}`).toBe(false);
      }
    }
  });

  it('these gated fields are hidden entirely for non-residential types (commercial/agri/land)', () => {
    const gated: ListingFieldKey[] = ['maintenancePaise', 'maintenanceIncluded', 'priceNegotiable', 'rentNegotiable', 'petsAllowed', 'availabilityTimeline', 'preferredTenants'];
    for (const type of ['commercial', 'land', 'agricultural_land'] as PropertyType[]) {
      for (const field of gated) {
        expect(isListingFieldVisible(field, type, 'sale')).toBe(false);
        expect(isListingFieldVisible(field, type, 'rent')).toBe(false);
      }
    }
  });

  it('possessionStatus (property status) is sale AND residence-only — never rent, never residential_plot', () => {
    for (const type of ['apartment', 'house', 'villa'] as PropertyType[]) {
      expect(isListingFieldVisible('possessionStatus', type, 'sale'), `possessionStatus/sale/${type}`).toBe(true);
      expect(isListingFieldVisible('possessionStatus', type, 'rent'), `possessionStatus/rent/${type}`).toBe(false);
    }
    expect(isListingFieldVisible('possessionStatus', 'residential_plot', 'sale')).toBe(false);
    expect(isListingFieldVisible('possessionStatus', 'residential_plot', 'rent')).toBe(false);
  });

  it('ownershipType is sale-only for apartment/house/villa, but unconditional for residential_plot', () => {
    for (const type of ['apartment', 'house', 'villa'] as PropertyType[]) {
      expect(isListingFieldVisible('ownershipType', type, 'sale'), `ownershipType/sale/${type}`).toBe(true);
      expect(isListingFieldVisible('ownershipType', type, 'rent'), `ownershipType/rent/${type}`).toBe(false);
    }
    expect(isListingFieldVisible('ownershipType', 'residential_plot', 'sale')).toBe(true);
    expect(isListingFieldVisible('ownershipType', 'residential_plot', 'rent')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M38-13A — FE/BE parity: FE visibility must never render a field the backend's
// validateFamilyFields/validateResidentialFieldSet (ListingController.java) would
// reject with 400. Encoded here as the design-spec §3 matrix the backend was
// built to (see approved-plan.toml [fe_visibility].enforcement) — a subset
// check (FE-visible ⊆ BE-allowed), not exact equality, since the backend is a
// strict superset for a few legacy shared fields (e.g. floorNumber) that the
// design intentionally narrows for house/villa's UI.
// ---------------------------------------------------------------------------

describe('M38-13A — FE/BE parity (FE visibility ⊆ backend-allowed fields)', () => {
  // Fields the backend's validateResidentialFieldSet REJECTS (400) for the RESIDENTIAL
  // family (apartment/house/villa) — plot-only fields, always rejected for residence types.
  const BE_REJECTED_FOR_RESIDENCE: ListingFieldKey[] = [
    'isCornerPlot', 'hasBoundaryWall', 'isGatedLayout', 'hasWaterConnection',
    'hasElectricityConnection', 'hasDrainage', 'conversionStatus', 'khataNumber',
    'propertyTaxPid', 'approvingAuthority', 'roadWidthFt', 'plotDimensions',
  ];
  // Fields the backend REJECTS (400) for the PLOT family (residential_plot) — every
  // residence-unit field.
  const BE_REJECTED_FOR_PLOT: ListingFieldKey[] = [
    'bathrooms', 'balconies', 'parking2wCount', 'parking4wCount', 'hasLift', 'hasPowerBackup',
    'isGated', 'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom',
    'propertyAge', 'residentialWaterSource', 'amenities', 'bedrooms', 'washrooms',
    'furnishingStatus', 'floorNumber', 'totalFloors', 'builtArea', 'carpetArea',
  ];

  it('apartment/house/villa never render a field the backend rejects for RESIDENTIAL', () => {
    for (const type of ['apartment', 'house', 'villa'] as PropertyType[]) {
      for (const field of BE_REJECTED_FOR_RESIDENCE) {
        expect(isListingFieldVisible(field, type, 'sale'), `${type} must not render BE-rejected ${field}`).toBe(false);
        expect(isListingFieldVisible(field, type, 'rent'), `${type} must not render BE-rejected ${field}`).toBe(false);
      }
    }
  });

  it('residential_plot never renders a field the backend rejects for PLOT', () => {
    for (const field of BE_REJECTED_FOR_PLOT) {
      expect(isListingFieldVisible(field, 'residential_plot', 'sale'), `residential_plot must not render BE-rejected ${field}`).toBe(false);
      expect(isListingFieldVisible(field, 'residential_plot', 'rent'), `residential_plot must not render BE-rejected ${field}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// M38-13A — legacy safety (scenario_b): legacy property_type {land, other, NULL}
// must NOT resolve to villa/residential_plot config.
// ---------------------------------------------------------------------------

describe('M38-13A — legacy safety: legacy types do not pick up residential-plot/villa config', () => {
  it('land does not render any residential_plot-only field', () => {
    const plotOnly: ListingFieldKey[] = ['plotDimensions', 'roadWidthFt', 'conversionStatus', 'khataNumber', 'propertyTaxPid', 'approvingAuthority'];
    for (const field of plotOnly) {
      expect(isListingFieldVisible(field, 'land', 'sale')).toBe(false);
    }
  });

  it('land does not render any villa/house-only field', () => {
    const houseOnly: ListingFieldKey[] = ['propertyAge', 'residentialWaterSource', 'hasGarden', 'hasTerrace', 'hasCompound', 'hasServantRoom'];
    for (const field of houseOnly) {
      expect(isListingFieldVisible(field, 'land', 'sale')).toBe(false);
    }
  });
});

