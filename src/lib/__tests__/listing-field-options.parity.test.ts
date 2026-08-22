/**
 * AC2 drift guard: FE constants ↔ backend-derived JSON contract
 *
 * Reads the committed src/lib/listing-field-options.json (backend authority,
 * verified by ListingFieldOptionsContractTest on the Java side) and asserts
 * that every relevant FE constant's key/value set EXACTLY equals the
 * corresponding contract set. Fails in EITHER direction on divergence.
 *
 * Related: Issue #1693 [M38-10b]
 * DO NOT modify the JSON contract file — it is generated from Java authority classes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  LAND_CATEGORY_LABELS,
  WATER_SOURCE_LABELS,
  SOIL_TYPE_LABELS,
  ROAD_ACCESS_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  AGRI_CONVERSION_STATUS_LABELS,
} from '../agriFieldLabels';
import {
  FURNISHING_OPTIONS,
  COMMERCIAL_SUBTYPE_OPTIONS,
  COMMERCIAL_FLOOR_CHOICE_OPTIONS,
  COMMERCIAL_FLOOR_MODE_OPTIONS,
  SHOP_HUB_TYPE_OPTIONS,
  OFFICE_HUB_TYPE_OPTIONS,
  SHOP_SUITABLE_USE_OPTIONS,
  OFFICE_SUITABLE_USE_OPTIONS,
  BUILDING_SUITABLE_USE_OPTIONS,
  WAREHOUSE_SUITABLE_USE_OPTIONS,
  LAND_SUITABLE_USE_OPTIONS,
  COMMERCIAL_UTILITY_OPTIONS,
  COMMERCIAL_OCCUPANCY_STATUS_OPTIONS,
  COMMERCIAL_FURNISHING_STATUS_OPTIONS,
  COMMERCIAL_OWNERSHIP_OPTIONS,
  COMMERCIAL_AVAILABILITY_OPTIONS,
  WAREHOUSE_FLOORING_OPTIONS,
  COMMERCIAL_AREA_UNIT_OPTIONS,
} from '../listing-constants';

// ── Load backend contract (readFileSync avoids resolveJsonModule requirement) ──

const __dir = dirname(fileURLToPath(import.meta.url));
const contractRaw = readFileSync(
  resolve(__dir, '../listing-field-options.json'),
  'utf-8',
);

interface ListingFieldOptionsContract {
  agri: {
    waterSource: string[];
    soilType: string[];
    roadAccess: string[];
    cultivationStatus: string[];
    ownershipType: string[];
    landCategory: string[];
    agriConversionStatus: string[];
  };
  residential: {
    furnishingStatus: string[];
  };
  commercial: {
    listingPurpose: string[];
    commercialSubtype: string[];
    floorChoice: string[];
    floorMode: string[];
    hubType: {
      shop: string[];
      office: string[];
    };
    suitableUses: {
      shop: string[];
      office: string[];
      building: string[];
      warehouse: string[];
      land: string[];
    };
    utilities: string[];
    occupancyStatus: string[];
    commercialFurnishingStatus: string[];
    commercialOwnership: string[];
    availability: string[];
    warehouseFlooring: string[];
    commercialAreaUnit: string[];
  };
}

const contract: ListingFieldOptionsContract = JSON.parse(contractRaw);

// ── Helper: sorted string array for exact set equality (bidirectional check) ──

function sorted(values: string[]): string[] {
  return [...values].sort();
}

// ── Agri label maps ───────────────────────────────────────────────────────────

describe('listing-field-options parity: agri.landCategory', () => {
  it('LAND_CATEGORY_LABELS keys exactly equal contract agri.landCategory', () => {
    expect(sorted(Object.keys(LAND_CATEGORY_LABELS))).toEqual(
      sorted(contract.agri.landCategory),
    );
  });
});

describe('listing-field-options parity: agri.agriConversionStatus', () => {
  it('AGRI_CONVERSION_STATUS_LABELS keys exactly equal contract agri.agriConversionStatus', () => {
    expect(sorted(Object.keys(AGRI_CONVERSION_STATUS_LABELS))).toEqual(
      sorted(contract.agri.agriConversionStatus),
    );
  });
});

describe('listing-field-options parity: agri.waterSource', () => {
  it('WATER_SOURCE_LABELS keys exactly equal contract agri.waterSource', () => {
    expect(sorted(Object.keys(WATER_SOURCE_LABELS))).toEqual(
      sorted(contract.agri.waterSource),
    );
  });
});

describe('listing-field-options parity: agri.soilType', () => {
  it('SOIL_TYPE_LABELS keys exactly equal contract agri.soilType', () => {
    expect(sorted(Object.keys(SOIL_TYPE_LABELS))).toEqual(
      sorted(contract.agri.soilType),
    );
  });
});

describe('listing-field-options parity: agri.roadAccess', () => {
  it('ROAD_ACCESS_LABELS keys exactly equal contract agri.roadAccess', () => {
    expect(sorted(Object.keys(ROAD_ACCESS_LABELS))).toEqual(
      sorted(contract.agri.roadAccess),
    );
  });
});

describe('listing-field-options parity: agri.cultivationStatus', () => {
  it('CULTIVATION_STATUS_LABELS keys exactly equal contract agri.cultivationStatus', () => {
    expect(sorted(Object.keys(CULTIVATION_STATUS_LABELS))).toEqual(
      sorted(contract.agri.cultivationStatus),
    );
  });
});

describe('listing-field-options parity: agri.ownershipType', () => {
  it('OWNERSHIP_TYPE_LABELS keys exactly equal contract agri.ownershipType', () => {
    expect(sorted(Object.keys(OWNERSHIP_TYPE_LABELS))).toEqual(
      sorted(contract.agri.ownershipType),
    );
  });
});

// ── Residential: furnishing (lowercase — assert exact casing per contract) ────

describe('listing-field-options parity: residential.furnishingStatus', () => {
  it('FURNISHING_OPTIONS values exactly equal contract residential.furnishingStatus', () => {
    const feValues = FURNISHING_OPTIONS.map((o) => o.value as string);
    expect(sorted(feValues)).toEqual(sorted(contract.residential.furnishingStatus));
  });

  it('furnishing values are lowercase (exact casing per backend contract)', () => {
    for (const { value } of FURNISHING_OPTIONS) {
      expect(value).toBe((value as string).toLowerCase());
    }
  });
});

// ── Commercial: FE-constant-keys-equal-contract drift guard (#1684) ───────────
//
// #1730 wired ~13 commercial vocabulary groups into ListingController's
// hard-enforcing (400 on unknown code) validateCommercialFields. #1684 built
// the real FE commercial constants module (listing-constants.ts) that
// CommercialListingForm consumes for its dropdown/multi-select components.
// These assertions now follow the SAME pattern as residential.furnishingStatus
// above: FE-constant VALUE-set exactly equals the contract's code-set, in
// EITHER direction — the FE can never silently drift from the #1730-enforced
// backend vocabulary.

function values(options: readonly { value: string }[]): string[] {
  return options.map((o) => o.value);
}

describe('listing-field-options parity: commercial.commercialSubtype', () => {
  it('COMMERCIAL_SUBTYPE_OPTIONS values exactly equal contract commercial.commercialSubtype', () => {
    expect(sorted(values(COMMERCIAL_SUBTYPE_OPTIONS))).toEqual(sorted(contract.commercial.commercialSubtype));
  });
});

describe('listing-field-options parity: commercial.floorChoice', () => {
  it('COMMERCIAL_FLOOR_CHOICE_OPTIONS values exactly equal contract commercial.floorChoice', () => {
    expect(sorted(values(COMMERCIAL_FLOOR_CHOICE_OPTIONS))).toEqual(sorted(contract.commercial.floorChoice));
  });
});

describe('listing-field-options parity: commercial.floorMode', () => {
  it('COMMERCIAL_FLOOR_MODE_OPTIONS values exactly equal contract commercial.floorMode', () => {
    expect(sorted(values(COMMERCIAL_FLOOR_MODE_OPTIONS))).toEqual(sorted(contract.commercial.floorMode));
  });
});

describe('listing-field-options parity: commercial.hubType', () => {
  it('SHOP_HUB_TYPE_OPTIONS values exactly equal contract commercial.hubType.shop', () => {
    expect(sorted(values(SHOP_HUB_TYPE_OPTIONS))).toEqual(sorted(contract.commercial.hubType.shop));
  });

  it('OFFICE_HUB_TYPE_OPTIONS values exactly equal contract commercial.hubType.office', () => {
    expect(sorted(values(OFFICE_HUB_TYPE_OPTIONS))).toEqual(sorted(contract.commercial.hubType.office));
  });
});

describe('listing-field-options parity: commercial.suitableUses', () => {
  it('SHOP_SUITABLE_USE_OPTIONS values exactly equal contract commercial.suitableUses.shop', () => {
    expect(sorted(values(SHOP_SUITABLE_USE_OPTIONS))).toEqual(sorted(contract.commercial.suitableUses.shop));
  });

  it('OFFICE_SUITABLE_USE_OPTIONS values exactly equal contract commercial.suitableUses.office', () => {
    expect(sorted(values(OFFICE_SUITABLE_USE_OPTIONS))).toEqual(sorted(contract.commercial.suitableUses.office));
  });

  it('BUILDING_SUITABLE_USE_OPTIONS values exactly equal contract commercial.suitableUses.building', () => {
    expect(sorted(values(BUILDING_SUITABLE_USE_OPTIONS))).toEqual(sorted(contract.commercial.suitableUses.building));
  });

  it('WAREHOUSE_SUITABLE_USE_OPTIONS values exactly equal contract commercial.suitableUses.warehouse', () => {
    expect(sorted(values(WAREHOUSE_SUITABLE_USE_OPTIONS))).toEqual(sorted(contract.commercial.suitableUses.warehouse));
  });

  it('LAND_SUITABLE_USE_OPTIONS values exactly equal contract commercial.suitableUses.land', () => {
    expect(sorted(values(LAND_SUITABLE_USE_OPTIONS))).toEqual(sorted(contract.commercial.suitableUses.land));
  });
});

describe('listing-field-options parity: commercial.utilities', () => {
  it('COMMERCIAL_UTILITY_OPTIONS values exactly equal contract commercial.utilities', () => {
    expect(sorted(values(COMMERCIAL_UTILITY_OPTIONS))).toEqual(sorted(contract.commercial.utilities));
  });
});

describe('listing-field-options parity: commercial.occupancyStatus', () => {
  it('COMMERCIAL_OCCUPANCY_STATUS_OPTIONS values exactly equal contract commercial.occupancyStatus', () => {
    expect(sorted(values(COMMERCIAL_OCCUPANCY_STATUS_OPTIONS))).toEqual(sorted(contract.commercial.occupancyStatus));
  });
});

describe('listing-field-options parity: commercial.commercialFurnishingStatus', () => {
  it('COMMERCIAL_FURNISHING_STATUS_OPTIONS values exactly equal contract commercial.commercialFurnishingStatus', () => {
    expect(sorted(values(COMMERCIAL_FURNISHING_STATUS_OPTIONS))).toEqual(sorted(contract.commercial.commercialFurnishingStatus));
  });
});

describe('listing-field-options parity: commercial.commercialOwnership', () => {
  it('COMMERCIAL_OWNERSHIP_OPTIONS values exactly equal contract commercial.commercialOwnership', () => {
    expect(sorted(values(COMMERCIAL_OWNERSHIP_OPTIONS))).toEqual(sorted(contract.commercial.commercialOwnership));
  });
});

describe('listing-field-options parity: commercial.availability', () => {
  it('COMMERCIAL_AVAILABILITY_OPTIONS values exactly equal contract commercial.availability', () => {
    expect(sorted(values(COMMERCIAL_AVAILABILITY_OPTIONS))).toEqual(sorted(contract.commercial.availability));
  });
});

describe('listing-field-options parity: commercial.warehouseFlooring', () => {
  it('WAREHOUSE_FLOORING_OPTIONS values exactly equal contract commercial.warehouseFlooring', () => {
    expect(sorted(values(WAREHOUSE_FLOORING_OPTIONS))).toEqual(sorted(contract.commercial.warehouseFlooring));
  });
});

describe('listing-field-options parity: commercial.commercialAreaUnit', () => {
  it('COMMERCIAL_AREA_UNIT_OPTIONS values exactly equal contract commercial.commercialAreaUnit', () => {
    expect(sorted(values(COMMERCIAL_AREA_UNIT_OPTIONS))).toEqual(sorted(contract.commercial.commercialAreaUnit));
  });
});
