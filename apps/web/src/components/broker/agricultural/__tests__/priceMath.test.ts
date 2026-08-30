import { describe, it, expect } from 'vitest';
import { computeAgriPriceBreakdown, toSqft } from '../priceMath';

describe('priceMath.toSqft', () => {
  it('converts cents/guntas/sqm/acres to sqft using AreaField.tsx-identical factors', () => {
    expect(toSqft(1, 'cent')).toBeCloseTo(435.6);
    expect(toSqft(1, 'gunta')).toBeCloseTo(1089);
    expect(toSqft(1, 'sqm')).toBeCloseTo(10.7639);
    expect(toSqft(1, 'acre')).toBeCloseTo(43560);
    expect(toSqft(500, 'sqft')).toBe(500);
  });
});

describe('priceMath.computeAgriPriceBreakdown', () => {
  it('derives per-acre / per-cent / per-sq.ft from a price entered in acres', () => {
    // 2 acres = 87120 sqft; price 8,712,000 -> 100/sqft
    const result = computeAgriPriceBreakdown(8_712_000, 2, 'acre');
    expect(result.perSqft).toBe(100);
    expect(result.perAcre).toBe(4_356_000); // 100 * 43560
    expect(result.perCent).toBe(43_560); // 100 * 435.6
  });

  it('derives correctly across units (cents input produces the same per-sqft rate as acres input)', () => {
    // 200 cents == 2 acres == 87120 sqft
    const result = computeAgriPriceBreakdown(8_712_000, 200, 'cent');
    expect(result.perSqft).toBe(100);
    expect(result.perAcre).toBe(4_356_000);
  });

  it('returns all-null (never NaN/Infinity) when area is zero', () => {
    const result = computeAgriPriceBreakdown(1_000_000, 0, 'acre');
    expect(result).toEqual({ perAcre: null, perCent: null, perSqft: null });
  });

  it('returns all-null when area is null/empty', () => {
    const result = computeAgriPriceBreakdown(1_000_000, null, 'acre');
    expect(result).toEqual({ perAcre: null, perCent: null, perSqft: null });
    expect(Number.isNaN(result.perAcre)).toBe(false);
  });

  it('returns all-null when price is missing or non-positive', () => {
    expect(computeAgriPriceBreakdown(null, 2, 'acre')).toEqual({ perAcre: null, perCent: null, perSqft: null });
    expect(computeAgriPriceBreakdown(0, 2, 'acre')).toEqual({ perAcre: null, perCent: null, perSqft: null });
    expect(computeAgriPriceBreakdown(-5, 2, 'acre')).toEqual({ perAcre: null, perCent: null, perSqft: null });
  });

  it('returns all-null for a negative area (never a negative or Infinity rate)', () => {
    const result = computeAgriPriceBreakdown(1_000_000, -3, 'acre');
    expect(result).toEqual({ perAcre: null, perCent: null, perSqft: null });
  });
});
