import { describe, expect, it } from 'vitest';
import { resolveResultScopeKind } from '../resultScopeKind';
import { resolveAreasCity, resolveDisplayCityLabel } from '../areaCityResolution';
import { resolveReturnLabel } from '../previousScopeReturn';

describe('#2658 C2 — area-selected pure selectors', () => {
  describe('resolveResultScopeKind — P2 precedence VIEWPORT > POLYGON > AREA', () => {
    it('VIEWPORT wins even when the committed scope is POLYGON', () => {
      expect(resolveResultScopeKind(true, 'POLYGON')).toBe('VIEWPORT');
    });
    it('POLYGON when not viewport and the committed scope says POLYGON', () => {
      expect(resolveResultScopeKind(false, 'POLYGON')).toBe('POLYGON');
    });
    it('AREA by default (no viewport, no polygon, including AREA_SET/null)', () => {
      expect(resolveResultScopeKind(false, 'AREA_SET')).toBe('AREA');
      expect(resolveResultScopeKind(false, null)).toBe('AREA');
      expect(resolveResultScopeKind(false, undefined)).toBe('AREA');
    });
  });

  describe('resolveAreasCity — city || nav.city || DEFAULT_CITY', () => {
    it('prefers an explicit city prop', () => {
      expect(resolveAreasCity('mangalore', 'udupi', 'udupi')).toBe('mangalore');
    });
    it('falls through to nav.city when city is absent', () => {
      expect(resolveAreasCity(undefined, 'mangalore', 'udupi')).toBe('mangalore');
    });
    it('falls through to DEFAULT_CITY when both are empty (bare /discover URL)', () => {
      expect(resolveAreasCity(undefined, '', 'udupi')).toBe('udupi');
    });
    it('falls through to DEFAULT_CITY when city is an explicit empty string, not just undefined', () => {
      expect(resolveAreasCity('', '', 'udupi')).toBe('udupi');
    });
  });

  describe('resolveDisplayCityLabel — (cityLabel ?? city ?? \'\') || areaLabel', () => {
    it('prefers cityLabel', () => {
      expect(resolveDisplayCityLabel('Udupi', 'other', 'Test Area')).toBe('Udupi');
    });
    it('falls through to city when cityLabel is undefined', () => {
      expect(resolveDisplayCityLabel(undefined, 'mangalore', 'Test Area')).toBe('mangalore');
    });
    it('falls through to areaLabel when both are absent', () => {
      expect(resolveDisplayCityLabel(undefined, undefined, 'Test Area')).toBe('Test Area');
    });
    it('falls through to areaLabel when cityLabel is an explicit empty string (|| not ??)', () => {
      expect(resolveDisplayCityLabel('', undefined, 'Test Area')).toBe('Test Area');
    });
  });

  describe('resolveReturnLabel — P7 three label shapes', () => {
    it('returns null when there is no previous scope', () => {
      expect(resolveReturnLabel(null, [])).toBeNull();
      expect(resolveReturnLabel(undefined, [])).toBeNull();
    });
    it('AREA_SET with exactly 1 resolved area names it directly', () => {
      expect(resolveReturnLabel({ kind: 'AREA_SET' }, ['Hebbal'])).toBe('Return to Hebbal');
    });
    it('AREA_SET with 2+ resolved areas joins them', () => {
      expect(resolveReturnLabel({ kind: 'AREA_SET' }, ['Hebbal', 'Jakkur'])).toBe(
        'Return to Hebbal, Jakkur',
      );
    });
    it('AREA_SET with NO resolved areas (names not loaded) falls back to the generic label', () => {
      expect(resolveReturnLabel({ kind: 'AREA_SET' }, [])).toBe('Return to previous area');
    });
    it('POLYGON gets its own generic label', () => {
      expect(resolveReturnLabel({ kind: 'POLYGON' }, [])).toBe('Return to previous search area');
    });
    it('VIEWPORT (or any other kind) falls back to the generic area label', () => {
      expect(resolveReturnLabel({ kind: 'VIEWPORT' }, [])).toBe('Return to previous area');
    });
  });
});
