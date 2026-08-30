/**
 * representativeNames.test.ts — Issue #1956 PR 3 (Slice 4).
 */
import { describe, it, expect } from 'vitest';
import { presentClusterRepresentatives, MAX_REPRESENTATIVE_NAMES } from '../representativeNames';
import type { ClusterableAreaMember } from '../areaClustering';

function member(overrides: Partial<ClusterableAreaMember> & { areaKey: string }): ClusterableAreaMember {
  return {
    nodeKey: `a:${overrides.areaKey}`,
    displayLabel: overrides.areaKey,
    lat: 13.0,
    lon: 77.6,
    listingCount: 1,
    displayOrder: 0,
    schoolCount: 0,
    ...overrides,
  };
}

describe('presentClusterRepresentatives', () => {
  it('caps representative names at 2 and reports "+N areas with matches" for visible 5 / displayed 2', () => {
    const members = [
      member({ areaKey: 'e', displayLabel: 'Echo', listingCount: 1 }),
      member({ areaKey: 'a', displayLabel: 'Alpha', listingCount: 10 }),
      member({ areaKey: 'b', displayLabel: 'Bravo', listingCount: 8 }),
      member({ areaKey: 'c', displayLabel: 'Charlie', listingCount: 3 }),
      member({ areaKey: 'd', displayLabel: 'Delta', listingCount: 2 }),
    ];
    const result = presentClusterRepresentatives(members, 'areas');
    expect(result.representativeNames).toEqual(['Alpha', 'Bravo']);
    expect(result.countResult.label).toBe('+3 areas with matches');
    expect(result.countResult.usesPlusForm).toBe(true);
  });

  it('reports "N areas with matches" (no plus) for visible 2 / displayed 2', () => {
    const members = [
      member({ areaKey: 'a', displayLabel: 'Alpha', listingCount: 10 }),
      member({ areaKey: 'b', displayLabel: 'Bravo', listingCount: 8 }),
    ];
    const result = presentClusterRepresentatives(members, 'areas');
    expect(result.representativeNames).toEqual(['Alpha', 'Bravo']);
    expect(result.countResult.label).toBe('2 areas with matches');
    expect(result.countResult.usesPlusForm).toBe(false);
  });

  it('reports "1 areas with matches" (locked copy, never "+0") for a single member', () => {
    const members = [member({ areaKey: 'a', displayLabel: 'Alpha', listingCount: 4 })];
    const result = presentClusterRepresentatives(members, 'areas');
    expect(result.representativeNames).toEqual(['Alpha']);
    expect(result.countResult.label).toBe('1 areas with matches');
    expect(result.countResult.label).not.toContain('+0');
  });

  it('never emits "+0" across the 2/3/4/5 visible-count threshold band', () => {
    for (const visibleCount of [2, 3, 4, 5]) {
      const members = Array.from({ length: visibleCount }, (_, i) =>
        member({ areaKey: `area-${i}`, displayLabel: `Area ${i}`, listingCount: visibleCount - i }),
      );
      const result = presentClusterRepresentatives(members, 'areas');
      expect(result.countResult.label).not.toContain('+0');
      expect(result.representativeNames.length).toBeLessThanOrEqual(MAX_REPRESENTATIVE_NAMES);
    }
  });

  it('ranks deterministically: listingCount desc, then displayOrder asc, then areaKey asc — no ties possible', () => {
    const members = [
      member({ areaKey: 'z-key', displayLabel: 'Zeta', listingCount: 5, displayOrder: 2 }),
      member({ areaKey: 'a-key', displayLabel: 'Alpha', listingCount: 5, displayOrder: 1 }),
      member({ areaKey: 'm-key', displayLabel: 'Mid', listingCount: 5, displayOrder: 1 }),
    ];
    // First tie-break: displayOrder asc -> 'a-key'/'m-key' (order 1) beat 'z-key' (order 2).
    // Second tie-break among the order-1 pair: displayLabel 'Alpha' < 'Mid'.
    const result = presentClusterRepresentatives(members, 'areas', 2);
    expect(result.representativeNames).toEqual(['Alpha', 'Mid']);
  });

  it('ranks by Schools journey eligible count when journey is "schools", not by listing count', () => {
    const members = [
      member({ areaKey: 'lots-of-flats', displayLabel: 'Flats', listingCount: 100, schoolCount: 0 }),
      member({ areaKey: 'lots-of-schools', displayLabel: 'Schools', listingCount: 1, schoolCount: 9 }),
    ];
    const result = presentClusterRepresentatives(members, 'schools');
    expect(result.representativeNames[0]).toBe('Schools');
  });

  it('respects a custom limit', () => {
    const members = [
      member({ areaKey: 'a', displayLabel: 'Alpha', listingCount: 3 }),
      member({ areaKey: 'b', displayLabel: 'Bravo', listingCount: 2 }),
      member({ areaKey: 'c', displayLabel: 'Charlie', listingCount: 1 }),
    ];
    const result = presentClusterRepresentatives(members, 'areas', 1);
    expect(result.representativeNames).toEqual(['Alpha']);
    expect(result.countResult.label).toBe('+2 areas with matches');
  });

  it('handles zero members without emitting a negative or "+0"', () => {
    const result = presentClusterRepresentatives([], 'areas');
    expect(result.representativeNames).toEqual([]);
    expect(result.countResult.hiddenCount).toBe(0);
    expect(result.countResult.label).toBe('0 areas with matches');
  });
});
