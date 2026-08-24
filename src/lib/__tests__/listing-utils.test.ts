// #2293 — intOrUndef/floatOrUndef boundary-condition coverage.
//
// Contract: null/undefined/blank/whitespace-only/non-numeric input -> undefined.
// Any other finite number (including 0, -0, and negatives) is preserved as-is.
// Field-specific domain validation (e.g. "monthly rent must be > 0 for
// rentals") is deliberately NOT this helper's job — it's enforced by the
// caller/backend (see backend ListingTransitionPolicy.validateRentalFields).
import { describe, it, expect } from 'vitest';
import { intOrUndef, floatOrUndef } from '../listing-utils';

describe('intOrUndef', () => {
  it('preserves a legitimate 0', () => {
    expect(intOrUndef('0')).toBe(0);
  });

  it('preserves "-0" as a zero value (not undefined)', () => {
    const result = intOrUndef('-0');
    expect(result).not.toBeUndefined();
    // Object.is(-0, 0) is false, so compare with === (which treats -0 and 0 as equal)
    // rather than toBe/toEqual (which use Object.is under the hood).
    expect(result === 0).toBe(true);
  });

  it('preserves a positive integer', () => {
    expect(intOrUndef('5')).toBe(5);
  });

  it('preserves a negative integer (field-level validation is the caller/backend\'s job)', () => {
    expect(intOrUndef('-5')).toBe(-5);
  });

  it('preserves a very large integer', () => {
    expect(intOrUndef('1000000')).toBe(1000000);
  });

  it('returns undefined for an empty string', () => {
    expect(intOrUndef('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(intOrUndef('   ')).toBeUndefined();
  });

  it('returns undefined for non-numeric input', () => {
    expect(intOrUndef('abc')).toBeUndefined();
  });

  it('truncates a decimal string to its integer part (parseInt semantics)', () => {
    expect(intOrUndef('3.7')).toBe(3);
  });
});

describe('floatOrUndef', () => {
  it('preserves a legitimate 0', () => {
    expect(floatOrUndef('0')).toBe(0);
  });

  it('preserves "-0" as a zero value (not undefined)', () => {
    const result = floatOrUndef('-0');
    expect(result).not.toBeUndefined();
    expect(result === 0).toBe(true);
  });

  it('preserves a positive float', () => {
    expect(floatOrUndef('12.5')).toBe(12.5);
  });

  it('preserves a negative float (field-level validation is the caller/backend\'s job)', () => {
    expect(floatOrUndef('-12.5')).toBe(-12.5);
  });

  it('preserves a very large float', () => {
    expect(floatOrUndef('99999.99')).toBe(99999.99);
  });

  it('returns undefined for an empty string', () => {
    expect(floatOrUndef('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(floatOrUndef('   ')).toBeUndefined();
  });

  it('returns undefined for non-numeric input', () => {
    expect(floatOrUndef('NaN')).toBeUndefined();
  });

  it('returns undefined for garbage input', () => {
    expect(floatOrUndef('abc')).toBeUndefined();
  });
});
