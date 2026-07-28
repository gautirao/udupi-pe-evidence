import { describe, expect, it } from 'vitest';

import {
  NO_MATCHES_WITH_CURRENT_FILTERS,
  eligibleCountFor,
  isMemberEligible,
  levelMayUsePlusForm,
  partitionMembersByJourney,
  presentStructuralLevel,
  resolveAreaEntry,
  type DiscoverJourney,
  type StructuralLevelIdentity,
} from '../journeyVisibility';
import { computeNearbyAreaCount } from '../nearbyAreaArithmetic';
import type { AreaMember, NavigationNodeType } from '../types';

function member(areaKey: string, listings: number, schools: number): AreaMember {
  return {
    areaKey,
    displayLabel: areaKey,
    eligibleListingCount: listings,
    eligibleSchoolCount: schools,
  };
}

const MEMBERS: AreaMember[] = [
  member('a:listings-only', 4, 0),
  member('a:schools-only', 0, 7),
  member('a:both', 2, 3),
  member('a:neither', 0, 0),
];

/* ───────────────────────── AC1.9 — journey eligibility ─────────────────────── */

describe('journey eligibility', () => {
  it('the areas journey measures eligibleListingCount', () => {
    expect(eligibleCountFor(member('a:x', 5, 9), 'areas')).toBe(5);
  });

  it('the schools journey measures eligibleSchoolCount', () => {
    expect(eligibleCountFor(member('a:x', 5, 9), 'schools')).toBe(9);
  });

  it.each<[DiscoverJourney, string[]]>([
    ['areas', ['a:listings-only', 'a:both']],
    ['schools', ['a:schools-only', 'a:both']],
  ])('%s journey includes only members with > 0 of its own dimension', (journey, expected) => {
    const { visible } = partitionMembersByJourney(MEMBERS, journey);
    expect(visible.map((m) => m.areaKey)).toEqual(expected);
  });

  it('excludes zero-content members from browse clusters', () => {
    const { hidden } = partitionMembersByJourney(MEMBERS, 'areas');
    expect(hidden.map((m) => m.areaKey)).toEqual(['a:schools-only', 'a:neither']);
  });

  it('excludes zero-content members from the +N arithmetic too', () => {
    // The +N is computed over the VISIBLE partition, so a zero-content member can
    // never inflate it. 2 visible, 1 displayed => "+1", not "+3".
    const { visible } = partitionMembersByJourney(MEMBERS, 'areas');
    const result = computeNearbyAreaCount({
      visibleMemberCount: visible.length,
      displayedRepresentativeCount: 1,
    });
    expect(result.label).toBe('+1 areas with matches');
  });

  it('a member with exactly 0 is excluded; exactly 1 is included (the boundary)', () => {
    expect(isMemberEligible(member('a:zero', 0, 0), 'areas')).toBe(false);
    expect(isMemberEligible(member('a:one', 1, 0), 'areas')).toBe(true);
  });

  it('preserves input order in both partitions and never mutates the input', () => {
    const input = [...MEMBERS];
    const snapshot = input.map((m) => m.areaKey);
    const { visible, hidden } = partitionMembersByJourney(input, 'areas');
    expect(input.map((m) => m.areaKey)).toEqual(snapshot);
    expect([...visible, ...hidden]).toHaveLength(MEMBERS.length);
  });
});

/* ──────────────── AC1.8 — structural levels are never hidden ───────────────── */

describe('structural levels (DIRECTION / Local Destination)', () => {
  const direction: StructuralLevelIdentity = {
    nodeKey: 'd:central',
    nodeType: 'DIRECTION',
    displayLabel: 'Central Bangalore',
    parentNodeKey: null,
    displayOrder: 1,
  };

  it('stays visible with a real count', () => {
    const presented = presentStructuralLevel(direction, 12);
    expect(presented.visible).toBe(true);
    expect(presented.countLabel).toBe('12 areas with matches');
    expect(presented.isZeroContent).toBe(false);
  });

  it('stays visible at ZERO and renders the locked literal', () => {
    const presented = presentStructuralLevel(direction, 0);
    expect(presented.visible).toBe(true);
    expect(presented.countLabel).toBe('No matches with current filters');
    expect(presented.countLabel).toBe(NO_MATCHES_WITH_CURRENT_FILTERS);
    expect(presented.isZeroContent).toBe(true);
  });

  it('NEGATIVE TEST: never uses the +N form, at any count', () => {
    // A +N asserts the displayed NAMES are themselves matching members. A stable
    // canonical region label carries no such guarantee, so the form is forbidden
    // here regardless of how many matches sit beneath it.
    for (const count of [0, 1, 2, 5, 50, 323]) {
      const presented = presentStructuralLevel(direction, count);
      expect(presented.usesPlusForm).toBe(false);
      expect(presented.countLabel.startsWith('+')).toBe(false);
    }
  });

  it.each<[NavigationNodeType, boolean]>([
    ['ROOT', false],
    ['DIRECTION', false],
    ['CLUSTER', false],
    ['AREA', true],
  ])('levelMayUsePlusForm(%s) === %s', (nodeType, expected) => {
    expect(levelMayUsePlusForm(nodeType)).toBe(expected);
  });

  it('identity, parentage, position and NAME are provably filter-invariant', () => {
    // Same identity, four different filter outcomes: only the count copy moves.
    const across = [0, 3, 40, 323].map((count) => presentStructuralLevel(direction, count));
    for (const presented of across) {
      expect(presented.nodeKey).toBe('d:central');
      expect(presented.nodeType).toBe('DIRECTION');
      expect(presented.displayLabel).toBe('Central Bangalore');
      expect(presented.parentNodeKey).toBeNull();
      expect(presented.displayOrder).toBe(1);
      expect(presented.visible).toBe(true);
    }
    expect(new Set(across.map((p) => p.countLabel)).size).toBe(4);
  });

  it('a Local Destination behaves identically to a Direction', () => {
    const localDestination: StructuralLevelIdentity = {
      nodeKey: 'c:whitefield-belt',
      nodeType: 'CLUSTER',
      displayLabel: 'Whitefield Belt',
      parentNodeKey: 'd:e',
      displayOrder: 2,
    };
    expect(presentStructuralLevel(localDestination, 0)).toMatchObject({
      visible: true,
      usesPlusForm: false,
      countLabel: NO_MATCHES_WITH_CURRENT_FILTERS,
      parentNodeKey: 'd:e',
      displayOrder: 2,
    });
  });

  it('treats a nonsensical count as zero rather than rendering it', () => {
    expect(presentStructuralLevel(direction, -3).countLabel).toBe(
      NO_MATCHES_WITH_CURRENT_FILTERS,
    );
    expect(presentStructuralLevel(direction, Number.NaN).countLabel).toBe(
      NO_MATCHES_WITH_CURRENT_FILTERS,
    );
  });
});

/* ───────────── §2.3 — a zero-content AREA reached directly stays real ───────── */

describe('resolveAreaEntry', () => {
  const zeroContent = member('a:quiet', 0, 0);
  const populated = member('a:busy', 6, 2);

  it('a populated area is present on every entry path', () => {
    for (const entryPath of ['browse', 'canonical-url', 'explicit-search'] as const) {
      expect(resolveAreaEntry({ member: populated, journey: 'areas', entryPath })).toBe('present');
    }
  });

  it('a zero-content area is excluded from BROWSE', () => {
    expect(
      resolveAreaEntry({ member: zeroContent, journey: 'areas', entryPath: 'browse' }),
    ).toBe('excluded-from-browse');
  });

  it('a zero-content area reached by CANONICAL URL stays resolvable with an empty state', () => {
    expect(
      resolveAreaEntry({ member: zeroContent, journey: 'areas', entryPath: 'canonical-url' }),
    ).toBe('direct-empty-state');
  });

  it('a zero-content area reached by EXPLICIT SEARCH stays resolvable with an empty state', () => {
    expect(
      resolveAreaEntry({ member: zeroContent, journey: 'areas', entryPath: 'explicit-search' }),
    ).toBe('direct-empty-state');
  });

  it('direct-empty-state is a DISTINCT outcome from excluded-from-browse', () => {
    const browse = resolveAreaEntry({
      member: zeroContent,
      journey: 'areas',
      entryPath: 'browse',
    });
    const direct = resolveAreaEntry({
      member: zeroContent,
      journey: 'areas',
      entryPath: 'canonical-url',
    });
    expect(browse).not.toBe(direct);
    // Neither is "hidden"/absent — the direct path must never resolve to nothing.
    expect(direct).not.toBe('excluded-from-browse');
  });

  it('the journey decides which dimension counts as zero content', () => {
    const schoolsOnly = member('a:schools-only', 0, 5);
    expect(
      resolveAreaEntry({ member: schoolsOnly, journey: 'areas', entryPath: 'browse' }),
    ).toBe('excluded-from-browse');
    expect(
      resolveAreaEntry({ member: schoolsOnly, journey: 'schools', entryPath: 'browse' }),
    ).toBe('present');
  });
});
