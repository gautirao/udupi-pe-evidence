import { describe, it, expect } from 'vitest';
import { buildAreaKey } from './areaKey';

describe('buildAreaKey', () => {
  it('builds a basic key with country and state prefix', () => {
    expect(buildAreaKey('Udupi', 'Manipal')).toBe('IN|KA|Udupi|Manipal');
  });

  it('builds a key for a different locality in the same district', () => {
    expect(buildAreaKey('Udupi', 'Kundapura')).toBe('IN|KA|Udupi|Kundapura');
  });

  it('trims leading and trailing whitespace from both inputs', () => {
    expect(buildAreaKey('  Udupi  ', '  Manipal  ')).toBe('IN|KA|Udupi|Manipal');
  });

  it('handles locality names that contain a space', () => {
    expect(buildAreaKey('Udupi', 'Manipal Town')).toBe('IN|KA|Udupi|Manipal Town');
  });

  it('returns empty string when district is empty', () => {
    expect(buildAreaKey('', 'Manipal')).toBe('');
  });

  it('returns empty string when locality is empty', () => {
    expect(buildAreaKey('Udupi', '')).toBe('');
  });

  it('returns empty string when district is whitespace-only', () => {
    expect(buildAreaKey('   ', 'Manipal')).toBe('');
  });

  it('returns empty string when locality is whitespace-only', () => {
    expect(buildAreaKey('Udupi', '   ')).toBe('');
  });

  it('raw output contains literal pipe characters (not %7C)', () => {
    const key = buildAreaKey('Udupi', 'Manipal');
    expect(key).toContain('|');
    expect(key).not.toContain('%7C');
  });

  it('round-trip: encodeURIComponent encodes pipes as %7C', () => {
    const raw = buildAreaKey('Udupi', 'Manipal');
    expect(encodeURIComponent(raw)).toBe('IN%7CKA%7CUdupi%7CManipal');
  });

  it('does not sanitize pipe characters in input (callers must provide clean geocoding output)', () => {
    // Pipe in input produces a structurally ambiguous key — callers must ensure
    // district/locality from geocoding does not contain the pipe delimiter.
    const key = buildAreaKey('Udupi', 'North|South');
    expect(key).toBe('IN|KA|Udupi|North|South');
  });

  it('accepts null district and returns empty string', () => {
    expect(buildAreaKey(null, 'Manipal')).toBe('');
  });

  it('accepts undefined locality and returns empty string', () => {
    expect(buildAreaKey('Udupi', undefined)).toBe('');
  });
});
