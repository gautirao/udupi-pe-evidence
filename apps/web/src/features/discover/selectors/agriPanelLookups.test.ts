import { describe, it, expect } from 'vitest';
import { resolveAgriCorridorLookup, type AgriCorridorLookupInput } from './agriPanelLookups';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';

const CORRIDORS: CorridorGroupData[] = [
  {
    directionCode: 'N',
    groupName: 'North corridor',
    availableMaxDistances: [
      { maxKm: 10, distanceLabel: '0-10 km', includedBandCodes: ['A'], listingCount: 3, areaKeys: ['a'] },
    ],
  },
  {
    directionCode: 'S',
    groupName: 'South corridor',
    availableMaxDistances: [],
  },
];

/** R7 differential — byte-for-byte copy of the ORIGINAL inline expressions
 * from DiscoverRightPanel.tsx's `case 'agri-group-selected'` branch
 * (:1690 availableMaxDistances, :1716 corridorName). */
function originalInline(input: AgriCorridorLookupInput) {
  return {
    availableMaxDistances: input.corridorGroups?.find((c) => c.directionCode === input.selectedRegion)
      ?.availableMaxDistances,
    corridorName: input.corridorGroups?.find((c) => c.directionCode === input.selectedRegion)?.groupName ?? null,
  };
}

describe('resolveAgriCorridorLookup (#2657 C1)', () => {
  it('resolves availableMaxDistances and corridorName for a matched region', () => {
    expect(resolveAgriCorridorLookup({ corridorGroups: CORRIDORS, selectedRegion: 'N' })).toEqual({
      availableMaxDistances: CORRIDORS[0].availableMaxDistances,
      corridorName: 'North corridor',
    });
  });

  it('is undefined/null for an unmatched region', () => {
    expect(resolveAgriCorridorLookup({ corridorGroups: CORRIDORS, selectedRegion: 'W' })).toEqual({
      availableMaxDistances: undefined,
      corridorName: null,
    });
  });

  it('handles an undefined corridorGroups list', () => {
    expect(resolveAgriCorridorLookup({ corridorGroups: undefined, selectedRegion: 'N' })).toEqual({
      availableMaxDistances: undefined,
      corridorName: null,
    });
  });

  it('R7 differential: matches the original inline expressions across a table of inputs', () => {
    const table: AgriCorridorLookupInput[] = [
      { corridorGroups: CORRIDORS, selectedRegion: 'N' },
      { corridorGroups: CORRIDORS, selectedRegion: 'S' },
      { corridorGroups: CORRIDORS, selectedRegion: 'W' },
      { corridorGroups: CORRIDORS, selectedRegion: null },
      { corridorGroups: undefined, selectedRegion: 'N' },
      { corridorGroups: [], selectedRegion: 'N' },
    ];
    for (const input of table) {
      expect(resolveAgriCorridorLookup(input)).toEqual(originalInline(input));
    }
  });
});
