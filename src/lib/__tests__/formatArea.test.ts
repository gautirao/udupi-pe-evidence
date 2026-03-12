import { describe, it, expect } from 'vitest';
import { formatArea } from '../formatters';

describe('formatArea', () => {
  // ─── Null / undefined / zero ────────────────────────────────────────────────

  it('returns empty string for null area', () => {
    expect(formatArea(null, 'cent')).toBe('');
  });

  it('returns empty string for undefined area', () => {
    expect(formatArea(undefined, 'sqft')).toBe('');
  });

  // ─── Cents (singular and plural) ───────────────────────────────────────────

  it('formats "cent" (singular, backend canonical form)', () => {
    expect(formatArea(5, 'cent')).toBe('5.00 cents');
  });

  it('formats "cents" (plural variant)', () => {
    expect(formatArea(10.5, 'cents')).toBe('10.50 cents');
  });

  it('converts cents >= 100 to acres', () => {
    expect(formatArea(150, 'cent')).toBe('1.50 acres');
  });

  it('converts exactly 100 cents to acres', () => {
    expect(formatArea(100, 'cent')).toBe('1.00 acres');
  });

  it('converts 250 cents to acres', () => {
    expect(formatArea(250, 'cents')).toBe('2.50 acres');
  });

  // ─── Acres ─────────────────────────────────────────────────────────────────

  it('formats "acre" (singular)', () => {
    expect(formatArea(2.5, 'acre')).toBe('2.50 acres');
  });

  it('formats "acres" (plural)', () => {
    expect(formatArea(1, 'acres')).toBe('1.00 acres');
  });

  // ─── Guntas ────────────────────────────────────────────────────────────────

  it('formats small gunta values', () => {
    expect(formatArea(15, 'gunta')).toBe('15.00 guntas');
  });

  it('formats guntas with "guntas" (plural)', () => {
    expect(formatArea(20, 'guntas')).toBe('20.00 guntas');
  });

  it('formats guntas with legacy "guntha" spelling', () => {
    expect(formatArea(10, 'guntha')).toBe('10.00 guntas');
  });

  it('displays compound acres + guntas for >= 40 guntas', () => {
    // 100 guntas = 2 acres 20 guntas
    expect(formatArea(100, 'gunta')).toBe('2 acres 20 guntas');
  });

  it('displays whole acres when no remainder', () => {
    // 80 guntas = 2 acres exactly
    expect(formatArea(80, 'gunta')).toBe('2 acres');
  });

  it('displays singular acre for exactly 40 guntas', () => {
    expect(formatArea(40, 'gunta')).toBe('1 acre');
  });

  // ─── Sq Ft ─────────────────────────────────────────────────────────────────

  it('formats sqft with Indian locale', () => {
    const result = formatArea(1200, 'sqft');
    // en-IN: 1,200 sq ft
    expect(result).toContain('1,200');
    expect(result).toContain('sq ft');
  });

  it('defaults to sq ft when no unit', () => {
    const result = formatArea(2400);
    expect(result).toContain('2,400');
    expect(result).toContain('sq ft');
  });

  it('converts large sqft values to acres', () => {
    // 43560 sqft = 1 acre
    expect(formatArea(87120, 'sqft')).toBe('2.00 acres');
  });

  // ─── Sq M ──────────────────────────────────────────────────────────────────

  it('formats sqm with Indian locale', () => {
    const result = formatArea(100, 'sqm');
    expect(result).toContain('100');
    expect(result).toContain('sq m');
  });

  // ─── Case insensitivity ────────────────────────────────────────────────────

  it('handles uppercase unit', () => {
    expect(formatArea(5, 'CENT')).toBe('5.00 cents');
  });

  it('handles mixed case unit', () => {
    expect(formatArea(2, 'Acre')).toBe('2.00 acres');
  });
});
