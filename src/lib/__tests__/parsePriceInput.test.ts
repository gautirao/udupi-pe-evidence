import { describe, it, expect } from 'vitest';
import { parsePriceInput } from '@/lib/parsePriceInput';

describe('parsePriceInput', () => {
  // Lakh variants
  it('"50 lakh" → 5_000_000', () => {
    expect(parsePriceInput('50 lakh')).toBe(5_000_000);
  });

  it('"50 L" → 5_000_000', () => {
    expect(parsePriceInput('50 L')).toBe(5_000_000);
  });

  it('"50l" → 5_000_000', () => {
    expect(parsePriceInput('50l')).toBe(5_000_000);
  });

  it('"50 lakhs" → 5_000_000', () => {
    expect(parsePriceInput('50 lakhs')).toBe(5_000_000);
  });

  it('"0.5 lakh" → 50_000', () => {
    expect(parsePriceInput('0.5 lakh')).toBe(50_000);
  });

  it('"1.5 lakh" → 150_000', () => {
    expect(parsePriceInput('1.5 lakh')).toBe(150_000);
  });

  // Crore variants
  it('"1.2 crore" → 12_000_000', () => {
    expect(parsePriceInput('1.2 crore')).toBe(12_000_000);
  });

  it('"1.2 cr" → 12_000_000', () => {
    expect(parsePriceInput('1.2 cr')).toBe(12_000_000);
  });

  it('"1.2C" → 12_000_000', () => {
    expect(parsePriceInput('1.2C')).toBe(12_000_000);
  });

  it('"2.5 crores" → 25_000_000', () => {
    expect(parsePriceInput('2.5 crores')).toBe(25_000_000);
  });

  // Plain numbers
  it('"75000" → 75_000', () => {
    expect(parsePriceInput('75000')).toBe(75_000);
  });

  it('"75,000" → 75_000', () => {
    expect(parsePriceInput('75,000')).toBe(75_000);
  });

  it('"1,20,000" → 120_000', () => {
    expect(parsePriceInput('1,20,000')).toBe(120_000);
  });

  // Currency symbol stripping
  it('"₹50 lakh" → 5_000_000', () => {
    expect(parsePriceInput('₹50 lakh')).toBe(5_000_000);
  });

  // Empty / whitespace
  it('"" → null', () => {
    expect(parsePriceInput('')).toBeNull();
  });

  it('"   " → null', () => {
    expect(parsePriceInput('   ')).toBeNull();
  });

  // Invalid strings
  it('"abc" → null', () => {
    expect(parsePriceInput('abc')).toBeNull();
  });

  it('"50 xyz" → null', () => {
    expect(parsePriceInput('50 xyz')).toBeNull();
  });
});
