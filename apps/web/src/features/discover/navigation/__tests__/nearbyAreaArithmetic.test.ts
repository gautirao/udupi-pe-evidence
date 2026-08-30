import { describe, expect, it } from 'vitest';

import {
  computeNearbyAreaCount,
  rankClusterRepresentatives,
  type RankableClusterMember,
} from '../nearbyAreaArithmetic';
import {
  isMemberEligible,
  type DiscoverJourney,
} from '../journeyVisibility';

function member(
  areaKey: string,
  overrides: Partial<RankableClusterMember> = {},
): RankableClusterMember {
  return {
    areaKey,
    displayLabel: areaKey,
    eligibleListingCount: 1,
    eligibleSchoolCount: 0,
    visible: true,
    ...overrides,
  };
}

/* ───────────────────── the two REQUIRED worked examples ─────────────────────── */

describe('computeNearbyAreaCount — locked worked examples', () => {
  it('visible 5 / displayed 2 renders "+3 areas with matches"', () => {
    const result = computeNearbyAreaCount({
      visibleMemberCount: 5,
      displayedRepresentativeCount: 2,
    });
    expect(result.hiddenCount).toBe(3);
    expect(result.label).toBe('+3 areas with matches');
    expect(result.usesPlusForm).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('visible 2 / displayed 2 renders "2 areas with matches"', () => {
    const result = computeNearbyAreaCount({
      visibleMemberCount: 2,
      displayedRepresentativeCount: 2,
    });
    expect(result.hiddenCount).toBe(0);
    expect(result.label).toBe('2 areas with matches');
    expect(result.usesPlusForm).toBe(false);
    expect(result.problems).toEqual([]);
  });
});

describe('computeNearbyAreaCount — "+0" is never emitted', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [7, 7],
    [40, 40],
  ])('visible %i / displayed %i never produces a "+" label', (visible, displayed) => {
    const result = computeNearbyAreaCount({
      visibleMemberCount: visible,
      displayedRepresentativeCount: displayed,
    });
    expect(result.label.startsWith('+')).toBe(false);
    expect(result.label).toBe(`${visible} areas with matches`);
  });

  it('property: across the whole 0..30 x 0..30 grid, no label is ever "+0 ..."', () => {
    for (let visible = 0; visible <= 30; visible += 1) {
      for (let displayed = 0; displayed <= 30; displayed += 1) {
        const { label, hiddenCount } = computeNearbyAreaCount({
          visibleMemberCount: visible,
          displayedRepresentativeCount: displayed,
        });
        expect(label).not.toBe('+0 areas with matches');
        expect(hiddenCount).toBeGreaterThanOrEqual(0);
        // The plus form appears if and only if something is genuinely hidden.
        expect(label.startsWith('+')).toBe(hiddenCount > 0);
      }
    }
  });

  it('property: hiddenCount === visible - displayed wherever that difference is non-negative', () => {
    for (let visible = 0; visible <= 30; visible += 1) {
      for (let displayed = 0; displayed <= visible; displayed += 1) {
        expect(
          computeNearbyAreaCount({
            visibleMemberCount: visible,
            displayedRepresentativeCount: displayed,
          }).hiddenCount,
        ).toBe(visible - displayed);
      }
    }
  });
});

describe('computeNearbyAreaCount — negative combinations are clamped AND reported', () => {
  it('clamps a negative hidden count to 0 and reports it explicitly', () => {
    const result = computeNearbyAreaCount({
      visibleMemberCount: 1,
      displayedRepresentativeCount: 3,
    });
    expect(result.hiddenCount).toBe(0);
    expect(result.usesPlusForm).toBe(false);
    expect(result.problems.map((p) => p.code)).toContain('NEGATIVE_HIDDEN_COUNT');
    expect(result.problems[0].message).toContain('inconsistent snapshots');
  });

  it('never clamps SILENTLY — a clamped result always carries a problem', () => {
    for (let visible = 0; visible <= 20; visible += 1) {
      for (let displayed = 0; displayed <= 20; displayed += 1) {
        const result = computeNearbyAreaCount({
          visibleMemberCount: visible,
          displayedRepresentativeCount: displayed,
        });
        const wasClamped = displayed > visible;
        expect(result.problems.length > 0).toBe(wasClamped);
      }
    }
  });

  it('reports a negative input rather than trusting it', () => {
    const result = computeNearbyAreaCount({
      visibleMemberCount: -4,
      displayedRepresentativeCount: 0,
    });
    expect(result.problems.map((p) => p.code)).toContain('NEGATIVE_INPUT');
    expect(result.hiddenCount).toBe(0);
    expect(result.label).toBe('0 areas with matches');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 2.5])(
    'reports a non-integer input (%s) rather than rendering it',
    (bad) => {
      const result = computeNearbyAreaCount({
        visibleMemberCount: bad,
        displayedRepresentativeCount: 0,
      });
      expect(result.problems.map((p) => p.code)).toContain('NON_INTEGER_INPUT');
      expect(result.label).toBe('0 areas with matches');
    },
  );
});

/* ─────────────────── deterministic representative ranking ──────────────────── */

describe('rankClusterRepresentatives', () => {
  const members: RankableClusterMember[] = [
    member('a:whitefield', { eligibleListingCount: 12, displayOrder: 3 }),
    member('a:varthur', { eligibleListingCount: 30, displayOrder: 2 }),
    member('a:kadugodi', { eligibleListingCount: 12, displayOrder: 1 }),
    member('a:hoodi', { eligibleListingCount: 4, displayOrder: 4 }),
  ];

  it('ranks by listing count, then display order', () => {
    expect(rankClusterRepresentatives(members, 3, 'areas').map((m) => m.areaKey)).toEqual([
      'a:varthur',
      'a:kadugodi',
      'a:whitefield',
    ]);
  });

  it('DETERMINISM: the same inputs in any arrival order yield the same names in the same order', () => {
    const expected = rankClusterRepresentatives(members, 3, 'areas').map((m) => m.areaKey);
    const permutations: RankableClusterMember[][] = [
      [...members].reverse(),
      [members[2], members[0], members[3], members[1]],
      [members[3], members[1], members[2], members[0]],
      [members[1], members[3], members[0], members[2]],
    ];
    for (const permutation of permutations) {
      expect(rankClusterRepresentatives(permutation, 3, 'areas').map((m) => m.areaKey)).toEqual(expected);
    }
  });

  it('DETERMINISM: fully-tied members still get a stable total order via areaKey', () => {
    const tied: RankableClusterMember[] = [
      member('a:c', { eligibleListingCount: 5, displayLabel: 'Same', displayOrder: 1 }),
      member('a:a', { eligibleListingCount: 5, displayLabel: 'Same', displayOrder: 1 }),
      member('a:b', { eligibleListingCount: 5, displayLabel: 'Same', displayOrder: 1 }),
    ];
    expect(rankClusterRepresentatives(tied, 3, 'areas').map((m) => m.areaKey)).toEqual([
      'a:a',
      'a:b',
      'a:c',
    ]);
    expect(rankClusterRepresentatives([...tied].reverse(), 3, 'areas').map((m) => m.areaKey)).toEqual([
      'a:a',
      'a:b',
      'a:c',
    ]);
  });

  it('repeated calls are byte-identical', () => {
    const first = rankClusterRepresentatives(members, 2, 'areas').map((m) => m.areaKey);
    for (let i = 0; i < 5; i += 1) {
      expect(rankClusterRepresentatives(members, 2, 'areas').map((m) => m.areaKey)).toEqual(first);
    }
  });

  it('picks representatives ONLY from VISIBLE members', () => {
    const withHidden: RankableClusterMember[] = [
      member('a:hidden-giant', { eligibleListingCount: 999, visible: false }),
      ...members,
    ];
    const picked = rankClusterRepresentatives(withHidden, 4, 'areas').map((m) => m.areaKey);
    expect(picked).not.toContain('a:hidden-giant');
    expect(picked).toHaveLength(4);
  });

  it('never mutates or reorders the input array', () => {
    const input = [...members];
    const snapshot = input.map((m) => m.areaKey);
    rankClusterRepresentatives(input, 2, 'areas');
    expect(input.map((m) => m.areaKey)).toEqual(snapshot);
  });

  it('returns an empty list for a non-positive or non-integer limit', () => {
    expect(rankClusterRepresentatives(members, 0, 'areas')).toEqual([]);
    expect(rankClusterRepresentatives(members, -1, 'areas')).toEqual([]);
    expect(rankClusterRepresentatives(members, 1.5, 'areas')).toEqual([]);
  });

  it('returns fewer than the limit when there are fewer visible members', () => {
    expect(rankClusterRepresentatives([member('a:only')], 5, 'areas')).toHaveLength(1);
  });

  it('feeds computeNearbyAreaCount coherently: visible count minus picked count is the hidden count', () => {
    const visible = members.filter((m) => m.visible);
    const picked = rankClusterRepresentatives(members, 2, 'areas');
    const result = computeNearbyAreaCount({
      visibleMemberCount: visible.length,
      displayedRepresentativeCount: picked.length,
    });
    expect(result.hiddenCount).toBe(2);
    expect(result.label).toBe('+2 areas with matches');
    expect(result.problems).toEqual([]);
  });
});

/* ────────────── AC1.9 — ranking is JOURNEY-AWARE, not listing-only ───────────── */

describe('AC1.9 — rankClusterRepresentatives ranks by the JOURNEY eligible count', () => {
  // A is a schools-rich / listings-empty area; B is its exact mirror. Whichever
  // dimension the journey measures must decide BOTH visibility and rank, so the
  // two journeys must produce opposite answers on this pair.
  const A: RankableClusterMember = {
    areaKey: 'bangalore|schools-only',
    displayLabel: 'Schools Only',
    eligibleListingCount: 0,
    eligibleSchoolCount: 5,
    displayOrder: 1,
    visible: true,
  };
  const B: RankableClusterMember = {
    areaKey: 'bangalore|listings-only',
    displayLabel: 'Listings Only',
    eligibleListingCount: 5,
    eligibleSchoolCount: 0,
    displayOrder: 2,
    visible: true,
  };

  /** Applies the SAME visibility rule the journey uses, then ranks. */
  const rankForJourney = (journey: DiscoverJourney) =>
    rankClusterRepresentatives(
      [A, B].map((m) => ({ ...m, visible: isMemberEligible(m, journey) })),
      5,
      journey,
    );

  it('the SCHOOLS journey ranks the schools-rich area first and counts only it as visible', () => {
    const ranked = rankForJourney('schools');
    expect(ranked.map((m) => m.areaKey)).toEqual(['bangalore|schools-only']);
    expect(ranked[0].eligibleSchoolCount).toBe(5);
  });

  it('the AREAS journey does the exact reverse', () => {
    const ranked = rankForJourney('areas');
    expect(ranked.map((m) => m.areaKey)).toEqual(['bangalore|listings-only']);
    expect(ranked[0].eligibleListingCount).toBe(5);
  });

  it('with both members forced visible, the journey alone flips the ORDER', () => {
    const both = [A, B];
    expect(rankClusterRepresentatives(both, 5, 'schools').map((m) => m.areaKey)).toEqual([
      'bangalore|schools-only',
      'bangalore|listings-only',
    ]);
    expect(rankClusterRepresentatives(both, 5, 'areas').map((m) => m.areaKey)).toEqual([
      'bangalore|listings-only',
      'bangalore|schools-only',
    ]);
  });

  it('the +N beside a schools cluster describes SCHOOLS-eligible members', () => {
    const visible = [A, B].filter((m) => isMemberEligible(m, 'schools'));
    const picked = rankForJourney('schools');
    const counted = computeNearbyAreaCount({
      visibleMemberCount: visible.length,
      displayedRepresentativeCount: picked.length,
    });
    expect(counted.problems).toEqual([]);
    expect(counted.label).toBe('1 areas with matches');
  });
});
