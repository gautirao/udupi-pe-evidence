/**
 * Issue #2515 — focused unit tests for computeCommercialStrengthResult's
 * securityDepositMonths gate. Mirrors ListingTransitionPolicy.validateFields:
 * `"rent".equals(purpose)` requires monthlyRent > 0 AND
 * securityDepositMonths != null (null-check ONLY, not > 0) — 'lease' falls
 * into the else branch (requires price instead) and is NOT gated here, and
 * 'sale' is unaffected. See sibling
 * apps/web/src/components/broker/__tests__/agriculturalListingPayload.test.ts
 * for style/conventions.
 */
import { describe, it, expect } from 'vitest';
import { computeCommercialStrengthResult, type CommercialStrengthResultInputs } from '../commercialListingPayload';

function baseStrengthInputs(overrides: Partial<CommercialStrengthResultInputs> = {}): CommercialStrengthResultInputs {
  return {
    subtypeResolved: true,
    isRentOrLease: false,
    isRent: false,
    priceValid: true,
    securityDepositMonths: '',
    locality: 'Udupi',
    imageCount: 3,
    locationResolved: true,
    addressConfirmed: true,
    commercialSubtype: 'OFFICE',
    builtArea: 500,
    builtAreaUnit: 'sqft',
    floorChoice: 'FIRST_FLOOR',
    floorMode: '',
    landArea: null,
    landAreaUnit: '',
    ...overrides,
  };
}

describe('computeCommercialStrengthResult — securityDepositMonths gate (#2515)', () => {
  it('rent + no deposit (empty string): isSubmittable is false, the securityDeposit gate is unmet, all other gates are met', () => {
    const result = computeCommercialStrengthResult(baseStrengthInputs({
      isRentOrLease: true,
      isRent: true,
      securityDepositMonths: '',
    }));

    expect(result.isSubmittable).toBe(false);
    const depositGate = result.gates.find((g) => g.key === 'securityDeposit');
    expect(depositGate?.met).toBe(false);
    expect(result.missingItems).toContain('Add the security deposit (months)');
    // every other gate must still be satisfied
    expect(result.gates.filter((g) => g.key !== 'securityDeposit').every((g) => g.met)).toBe(true);
  });

  it('rent + valid deposit ("2"): submittable when all other gates are satisfied', () => {
    const result = computeCommercialStrengthResult(baseStrengthInputs({
      isRentOrLease: true,
      isRent: true,
      securityDepositMonths: '2',
    }));

    expect(result.isSubmittable).toBe(true);
    expect(result.gates.find((g) => g.key === 'securityDeposit')?.met).toBe(true);
    expect(result.missingItems).toEqual([]);
  });

  it('rent + deposit "0": submittable — mirrors backend null-check-only semantics, NOT a >0 check', () => {
    const result = computeCommercialStrengthResult(baseStrengthInputs({
      isRentOrLease: true,
      isRent: true,
      securityDepositMonths: '0',
    }));

    expect(result.gates.find((g) => g.key === 'securityDeposit')?.met).toBe(true);
    expect(result.isSubmittable).toBe(true);
  });

  it('sale (isRent=false) with deposit blank: unaffected — the securityDeposit gate does not even appear, and isSubmittable is driven by the other gates only', () => {
    const result = computeCommercialStrengthResult(baseStrengthInputs({
      isRentOrLease: false,
      isRent: false,
      securityDepositMonths: '',
    }));

    expect(result.gates.find((g) => g.key === 'securityDeposit')).toBeUndefined();
    expect(result.isSubmittable).toBe(true);
  });

  it('lease (isRentOrLease=true, isRent=false) with deposit blank: unaffected — backend does not gate lease on deposit, so the client must not either', () => {
    const result = computeCommercialStrengthResult(baseStrengthInputs({
      isRentOrLease: true,
      isRent: false,
      securityDepositMonths: '',
    }));

    expect(result.gates.find((g) => g.key === 'securityDeposit')).toBeUndefined();
    expect(result.isSubmittable).toBe(true);
  });
});
