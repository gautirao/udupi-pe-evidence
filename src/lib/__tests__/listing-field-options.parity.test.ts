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
} from '../agriFieldLabels';
import { FURNISHING_OPTIONS } from '../listing-constants';

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
  };
  residential: {
    furnishingStatus: string[];
  };
  commercial: {
    listingPurpose: string[];
    floorChoice: string[];
    availability: string[];
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
