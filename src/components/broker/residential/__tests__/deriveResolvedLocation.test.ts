import { describe, it, expect } from 'vitest';
import { derivePublicLoc } from '../deriveResolvedLocation';

// ---------------------------------------------------------------------------
// Issue #1722 correction #4 — PRIVACY deriver. publicLoc must NEVER include
// postcode/state/country/road/house_number, and must never leak the raw
// Nominatim `display_name` verbatim when it contains those fields.
// ---------------------------------------------------------------------------

describe('derivePublicLoc — structured address fields', () => {
  it('prefers suburb + city from the structured address', () => {
    const publicLoc = derivePublicLoc({
      display_name: 'MG Road, Manipal, Udupi District, Karnataka, 576104, India',
      address: {
        road: 'MG Road',
        suburb: 'Manipal',
        city: 'Udupi',
        postcode: '576104',
        state: 'Karnataka',
        country: 'India',
      },
    });
    expect(publicLoc).toBe('Manipal, Udupi');
    expect(publicLoc).not.toMatch(/576104|Karnataka|India|MG Road/);
  });

  it('falls back to neighbourhood/village and town/county when suburb/city are absent', () => {
    const publicLoc = derivePublicLoc({
      display_name: 'Some Village, Some County, Karnataka, India',
      address: { village: 'Some Village', county: 'Some County', state: 'Karnataka', country: 'India' },
    });
    expect(publicLoc).toBe('Some Village, Some County');
  });

  it('de-dupes when the structured fields resolve to the same string', () => {
    const publicLoc = derivePublicLoc({
      display_name: 'Udupi, Udupi District, Karnataka, India',
      address: { suburb: 'Udupi', city: 'Udupi' },
    });
    expect(publicLoc).toBe('Udupi');
  });

  it('never emits postcode, state, or country even when structured fields are present', () => {
    const publicLoc = derivePublicLoc({
      display_name: 'Manipal, Udupi, Karnataka, 576104, India',
      address: { suburb: 'Manipal', city: 'Udupi', postcode: '576104', state: 'Karnataka', country: 'India' },
    });
    expect(publicLoc).not.toContain('576104');
    expect(publicLoc).not.toContain('Karnataka');
    expect(publicLoc).not.toContain('India');
  });
});

describe('derivePublicLoc — display_name fallback (no structured address)', () => {
  it('takes the first two comma segments', () => {
    const publicLoc = derivePublicLoc({
      display_name: 'Manipal, Udupi District, Karnataka, India',
      address: undefined,
    });
    expect(publicLoc).toBe('Manipal, Udupi District');
  });

  it('drops an all-numeric segment (PIN code) from the leading segments', () => {
    const publicLoc = derivePublicLoc({
      display_name: '576104, Manipal, Udupi District, Karnataka, India',
      address: undefined,
    });
    expect(publicLoc).toBe('Manipal, Udupi District');
    expect(publicLoc).not.toContain('576104');
  });

  it('never emits a bare postcode as the whole result', () => {
    const publicLoc = derivePublicLoc({ display_name: '576104', address: undefined });
    expect(publicLoc).toBe('');
  });

  it('skips empty segments from stray double commas', () => {
    const publicLoc = derivePublicLoc({
      display_name: 'Manipal,, Udupi District, Karnataka',
      address: undefined,
    });
    expect(publicLoc).toBe('Manipal, Udupi District');
  });
});
