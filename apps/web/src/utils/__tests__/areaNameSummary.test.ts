/**
 * Tests for areaNameSummary utility (Issue #1659).
 *
 * Covers:
 * 1. Returns comma-separated names when ≤ maxShown names resolve.
 * 2. Caps at maxShown and appends "+ n more" for long lists.
 * 3. Returns null when no area keys resolve (caller falls back to description).
 * 4. Never shows raw area keys.
 * 5. Deduplicates names when the same name appears for different area keys.
 * 6. Handles exactly 4 names (optional cap=4 mode).
 */

import { describe, it, expect } from 'vitest';
import { formatMemberAreaSummary, buildAreaNameIndex } from '../areaNameSummary';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INDEX = new Map([
  ['IN|KA|Bangalore|Whitefield', 'Whitefield'],
  ['IN|KA|Bangalore|Marathahalli', 'Marathahalli'],
  ['IN|KA|Bangalore|SarjapurRoad', 'Sarjapur Road'],
  ['IN|KA|Bangalore|ElectronicCity', 'Electronic City'],
  ['IN|KA|Udupi|Manipal', 'Manipal'],
  ['IN|KA|Udupi|Udupi', 'Udupi'],
]);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('formatMemberAreaSummary', () => {
  it('returns all names joined when ≤ maxShown (default 3)', () => {
    const result = formatMemberAreaSummary(
      ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Udupi'],
      INDEX,
    );
    expect(result).toBe('Manipal, Udupi');
  });

  it('returns exactly 3 names joined when exactly 3 resolve', () => {
    const result = formatMemberAreaSummary(
      [
        'IN|KA|Bangalore|Whitefield',
        'IN|KA|Bangalore|Marathahalli',
        'IN|KA|Bangalore|SarjapurRoad',
      ],
      INDEX,
    );
    expect(result).toBe('Whitefield, Marathahalli, Sarjapur Road');
  });

  it('caps at 3 and appends "+ n more" when 4 keys resolve (default cap)', () => {
    const result = formatMemberAreaSummary(
      [
        'IN|KA|Bangalore|Whitefield',
        'IN|KA|Bangalore|Marathahalli',
        'IN|KA|Bangalore|SarjapurRoad',
        'IN|KA|Bangalore|ElectronicCity',
      ],
      INDEX,
    );
    expect(result).toBe('Whitefield, Marathahalli, Sarjapur Road + 1 more');
  });

  it('shows all 4 names when maxShown=4', () => {
    const result = formatMemberAreaSummary(
      [
        'IN|KA|Bangalore|Whitefield',
        'IN|KA|Bangalore|Marathahalli',
        'IN|KA|Bangalore|SarjapurRoad',
        'IN|KA|Bangalore|ElectronicCity',
      ],
      INDEX,
      4,
    );
    expect(result).toBe('Whitefield, Marathahalli, Sarjapur Road, Electronic City');
  });

  it('returns null when no keys resolve (caller should fall back to description)', () => {
    const result = formatMemberAreaSummary(
      ['IN|KA|Bangalore|NonExistent', 'IN|KA|Bangalore|AlsoMissing'],
      INDEX,
    );
    expect(result).toBeNull();
  });

  it('returns null for an empty keys array', () => {
    const result = formatMemberAreaSummary([], INDEX);
    expect(result).toBeNull();
  });

  it('never shows raw area keys — unresolved keys are silently skipped', () => {
    const result = formatMemberAreaSummary(
      ['IN|KA|Bangalore|Whitefield', 'IN|KA|Bangalore|RAWKEY_MISSING'],
      INDEX,
    );
    // Only the resolved name appears; the raw key is not in the output.
    expect(result).toBe('Whitefield');
    expect(result).not.toContain('RAWKEY_MISSING');
    expect(result).not.toContain('IN|KA|');
  });

  it('deduplicates names when two area keys map to the same display name', () => {
    const dedupIndex = new Map([
      ['IN|KA|Udupi|A', 'Manipal'],
      ['IN|KA|Udupi|B', 'Manipal'], // deliberate duplicate display name
      ['IN|KA|Udupi|C', 'Udupi'],
    ]);
    const result = formatMemberAreaSummary(
      ['IN|KA|Udupi|A', 'IN|KA|Udupi|B', 'IN|KA|Udupi|C'],
      dedupIndex,
    );
    // "Manipal" should only appear once; "Udupi" should follow.
    expect(result).toBe('Manipal, Udupi');
  });

  it('returns a single name without trailing comma', () => {
    const result = formatMemberAreaSummary(
      ['IN|KA|Udupi|Manipal'],
      INDEX,
    );
    expect(result).toBe('Manipal');
    expect(result).not.toContain(',');
  });
});

describe('buildAreaNameIndex', () => {
  it('builds a map from areaKey to name', () => {
    const areas = [
      { areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal' },
      { areaKey: 'IN|KA|Udupi|Udupi', name: 'Udupi Town' },
    ];
    const index = buildAreaNameIndex(areas);
    expect(index.get('IN|KA|Udupi|Manipal')).toBe('Manipal');
    expect(index.get('IN|KA|Udupi|Udupi')).toBe('Udupi Town');
    expect(index.size).toBe(2);
  });

  it('returns an empty map for empty input', () => {
    const index = buildAreaNameIndex([]);
    expect(index.size).toBe(0);
  });
});
