/**
 * Issue #2433 — tests for the Commercial result-card summary.
 *
 * Every absence assertion here is paired with a positive-case assertion for the
 * SAME fact, so deleting the production branch cannot turn this file green.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCommercialSummary,
  resolveFloorFact,
  MAX_SUMMARY_FACTS,
} from '../commercialSummary';

describe('buildCommercialSummary — per-subtype fact selection', () => {
  it('SHOP shows built area, floor and hub', () => {
    expect(
      buildCommercialSummary('SHOP', 'commercial', {
        builtArea: 850,
        builtAreaUnit: 'sq ft',
        floorChoice: 'GROUND',
        hubType: 'HIGH_STREET',
      }),
    ).toEqual(['850 sq ft', 'Floor: Ground', 'Hub: High Street']);
  });

  it('OFFICE shows built area, seats and floor', () => {
    expect(
      buildCommercialSummary('OFFICE', 'commercial', {
        builtArea: 2400,
        builtAreaUnit: 'sq ft',
        officeSeats: 40,
        floorNumber: 3,
        totalFloors: 7,
      }),
    ).toEqual(['2,400 sq ft', '40 seats', 'Floor 3 of 7']);
  });

  it('BUILDING shows built area, floors and occupancy', () => {
    expect(
      buildCommercialSummary('BUILDING', 'commercial_building', {
        builtArea: 18000,
        builtAreaUnit: 'sq ft',
        totalFloors: 5,
        occupancyStatus: 'PARTIALLY_OCCUPIED',
      }),
    ).toEqual(['18,000 sq ft', '5 floors', 'Occupancy: Partially Occupied']);
  });

  it('WAREHOUSE shows area, clear height and loading bays', () => {
    expect(
      buildCommercialSummary('WAREHOUSE', 'warehouse', {
        builtArea: 12000,
        builtAreaUnit: 'sq ft',
        warehouseClearHeightFt: 18,
        warehouseLoadingBays: 4,
      }),
    ).toEqual(['12,000 sq ft', 'Clear height 18 ft', '4 loading bays']);
  });

  it('WAREHOUSE singularises a single loading bay', () => {
    const summary = buildCommercialSummary('WAREHOUSE', 'warehouse', {
      warehouseLoadingBays: 1,
    });
    expect(summary).toContain('1 loading bay');
    expect(summary).not.toContain('1 loading bays');
  });

  it('LAND shows land area, road frontage and zoning', () => {
    expect(
      buildCommercialSummary('LAND', 'commercial_land', {
        landArea: 9000,
        landAreaUnit: 'sq ft',
        roadFrontageFt: 30,
        commercialZoning: 'MIXED_USE',
      }),
    ).toEqual(['9,000 sq ft', 'Frontage 30 ft', 'Zoning: Mixed Use']);
  });

  it('WAREHOUSE falls back to land area when built area is absent', () => {
    expect(
      buildCommercialSummary('WAREHOUSE', 'warehouse', {
        landArea: 20000,
        landAreaUnit: 'sq ft',
      }),
    ).toEqual(['20,000 sq ft']);
  });

  it('never exceeds the density cap even when every fact is populated', () => {
    const summary = buildCommercialSummary('OFFICE', 'commercial', {
      builtArea: 2400,
      builtAreaUnit: 'sq ft',
      officeSeats: 40,
      floorNumber: 3,
      totalFloors: 7,
      hubType: 'HIGH_STREET',
      occupancyStatus: 'VACANT',
      commercialZoning: 'MIXED_USE',
      roadFrontageFt: 30,
    });
    expect(summary).toHaveLength(MAX_SUMMARY_FACTS);
  });
});

describe('buildCommercialSummary — the NULL-subtype legacy branch', () => {
  it('renders AREA ONLY for a legacy commercial row and infers nothing', () => {
    const legacy = buildCommercialSummary(null, 'commercial', {
      builtArea: 1200,
      builtAreaUnit: 'sq ft',
      // A legacy row reads null on every V104 column. These are set anyway, to
      // prove the generic branch ignores them rather than merely lacking them.
      hubType: 'HIGH_STREET',
      officeSeats: 25,
      occupancyStatus: 'VACANT',
      floorChoice: 'GROUND',
    });

    expect(legacy).toEqual(['1,200 sq ft']);
  });

  it('never renders Shop or Office wording for a null subtype', () => {
    const legacy = buildCommercialSummary(null, 'commercial', {
      builtArea: 1200,
      builtAreaUnit: 'sq ft',
      officeSeats: 25,
      hubType: 'HIGH_STREET',
    });
    const joined = legacy.join(' ');

    expect(joined).not.toMatch(/shop/i);
    expect(joined).not.toMatch(/office/i);
    expect(joined).not.toMatch(/seats/i);
    expect(joined).not.toMatch(/hub/i);

    // Paired positive case: those exact facts DO render when the subtype is
    // recorded, so the assertions above prove suppression rather than absence.
    const office = buildCommercialSummary('OFFICE', 'commercial', {
      builtArea: 1200,
      builtAreaUnit: 'sq ft',
      officeSeats: 25,
    });
    expect(office.join(' ')).toMatch(/25 seats/);
  });

  it('renders nothing at all for a non-Commercial listing', () => {
    expect(
      buildCommercialSummary(null, 'apartment', {
        builtArea: 1200,
        builtAreaUnit: 'sq ft',
      }),
    ).toEqual([]);

    expect(buildCommercialSummary(null, 'house', { builtArea: 900 })).toEqual([]);
    expect(buildCommercialSummary(null, 'agricultural_land', { landArea: 2 })).toEqual([]);

    // Paired positive case: the identical facts DO produce a summary once the
    // property type is Commercial.
    expect(
      buildCommercialSummary(null, 'commercial', {
        builtArea: 1200,
        builtAreaUnit: 'sq ft',
      }),
    ).toEqual(['1,200 sq ft']);
  });
});

describe('buildCommercialSummary — absent facts are omitted, never placeholdered', () => {
  it('returns an empty array when no fact is populated', () => {
    expect(buildCommercialSummary('SHOP', 'commercial', {})).toEqual([]);
    expect(buildCommercialSummary(null, 'commercial', {})).toEqual([]);
  });

  it('omits only the missing fact and keeps the rest in order', () => {
    expect(
      buildCommercialSummary('SHOP', 'commercial', {
        builtArea: 850,
        builtAreaUnit: 'sq ft',
        hubType: 'HIGH_STREET',
        // floor deliberately absent on BOTH storage shapes
      }),
    ).toEqual(['850 sq ft', 'Hub: High Street']);
  });

  it('treats zero, negative and non-finite counts as absent', () => {
    expect(
      buildCommercialSummary('OFFICE', 'commercial', { officeSeats: 0 }),
    ).toEqual([]);
    expect(
      buildCommercialSummary('WAREHOUSE', 'warehouse', { warehouseLoadingBays: -2 }),
    ).toEqual([]);
    expect(
      buildCommercialSummary('WAREHOUSE', 'warehouse', { warehouseClearHeightFt: NaN }),
    ).toEqual([]);

    // Paired positive case: a real value renders.
    expect(
      buildCommercialSummary('OFFICE', 'commercial', { officeSeats: 12 }),
    ).toEqual(['12 seats']);
  });

  it('never emits a raw enum token with underscores', () => {
    const summary = buildCommercialSummary('BUILDING', 'commercial_building', {
      occupancyStatus: 'PARTIALLY_OCCUPIED',
    });
    expect(summary.join(' ')).not.toMatch(/_/);
    expect(summary).toEqual(['Occupancy: Partially Occupied']);
  });
});

describe('resolveFloorFact — the dual-source V104/V102 hazard', () => {
  it('reads the V104 flat shape when the V102 child row is absent', () => {
    expect(resolveFloorFact({ floorChoice: 'GROUND' })).toBe('Floor: Ground');
    expect(resolveFloorFact({ floorMode: 'UPPER_FLOOR' })).toBe('Floor: Upper Floor');
  });

  it('reads the V102 typed-child shape when the V104 columns are null', () => {
    expect(resolveFloorFact({ floorNumber: 2, totalFloors: 6 })).toBe('Floor 2 of 6');
    expect(resolveFloorFact({ floorNumber: 2 })).toBe('Floor 2');
    expect(resolveFloorFact({ totalFloors: 6 })).toBe('6 floors');
  });

  it('renders floor 0 as Ground rather than dropping it', () => {
    // Guards the falsy-zero bug: `if (floorNumber)` would silently lose a
    // ground-floor shop, which is the single most common Commercial case.
    expect(resolveFloorFact({ floorNumber: 0 })).toBe('Floor Ground');
    expect(resolveFloorFact({ floorNumber: 0, totalFloors: 4 })).toBe('Floor Ground of 4');
  });

  it('prefers V104 when a row carries BOTH shapes', () => {
    expect(resolveFloorFact({ floorChoice: 'GROUND', floorNumber: 3, totalFloors: 9 })).toBe(
      'Floor: Ground',
    );
  });

  it('returns null when neither storage shape carries a floor', () => {
    expect(resolveFloorFact({})).toBeNull();
    expect(resolveFloorFact({ floorChoice: '   ' })).toBeNull();

    // Paired positive case: the same call shape DOES resolve when data exists,
    // so the nulls above prove fallback exhaustion rather than a dead function.
    expect(resolveFloorFact({ floorNumber: 1 })).toBe('Floor 1');
  });

  it('surfaces an unanticipated token rather than dropping or mislabelling it', () => {
    // No fixed dictionary exists for these free-text columns, so a value nobody
    // anticipated must still read as words.
    expect(resolveFloorFact({ floorChoice: 'mezzanine_level' })).toBe('Floor: Mezzanine Level');
  });
});
