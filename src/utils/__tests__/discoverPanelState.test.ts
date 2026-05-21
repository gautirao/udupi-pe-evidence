import { describe, it, expect } from 'vitest';
import { derivePanelContent } from '../discoverPanelState';
import type { DiscoverUrlState } from '../../hooks/useDiscoverUrlState';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('derivePanelContent — guided-entry (no journey)', () => {
  it('returns guided-entry when journey is null and no area/school', () => {
    expect(derivePanelContent(makeState())).toBe('guided-entry');
  });

  it('returns guided-entry when journey is null even with q set', () => {
    expect(derivePanelContent(makeState({ q: 'beach house' }))).toBe('guided-entry');
  });
});

describe('derivePanelContent — area-first journey', () => {
  it('returns area-groups-landing when journey=area-first and no areaKey (regardless of groupId)', () => {
    expect(derivePanelContent(makeState({ journey: 'area-first' }))).toBe('area-groups-landing');
  });

  it('returns area-groups-landing when journey=area-first, groupId is set, no areaKey', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', groupId: 'coastal-homes' })),
    ).toBe('area-groups-landing');
  });

  it('returns area-selected (not area-groups-landing) when areaKey is also set', () => {
    // areaKey takes priority over groupId within area-first journey
    expect(
      derivePanelContent(
        makeState({ journey: 'area-first', groupId: 'coastal-homes', areaKey: 'IN|KA|Udupi|Manipal' }),
      ),
    ).toBe('area-selected');
  });

  it('returns area-selected when journey=area-first and areaKey is set', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal' })),
    ).toBe('area-selected');
  });
});

describe('derivePanelContent — school-first journey', () => {
  it('returns school-browse when journey=school-first with no area or school', () => {
    expect(derivePanelContent(makeState({ journey: 'school-first' }))).toBe('school-browse');
  });

  it('returns schools-in-area when journey=school-first and areaKey is set but no schoolId', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'school-first', areaKey: 'IN|KA|Udupi|Manipal' }),
      ),
    ).toBe('schools-in-area');
  });

  it('returns school-selected when journey=school-first and schoolId is set', () => {
    expect(
      derivePanelContent(makeState({ journey: 'school-first', schoolId: 'school-abc' })),
    ).toBe('school-selected');
  });
});

describe('derivePanelContent — area-school-combined', () => {
  it('returns area-school-combined when both areaKey and schoolId are set (area-first)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'area-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          schoolId: 'school-abc',
        }),
      ),
    ).toBe('area-school-combined');
  });

  it('returns area-school-combined when both areaKey and schoolId are set (school-first)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'school-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          schoolId: 'school-abc',
        }),
      ),
    ).toBe('area-school-combined');
  });

  it('returns area-school-combined when both are set and no journey (cross-entry path)', () => {
    // A user can end up with both via deep-link; combined state takes priority.
    expect(
      derivePanelContent(
        makeState({ areaKey: 'IN|KA|Udupi|Manipal', schoolId: 'school-abc' }),
      ),
    ).toBe('area-school-combined');
  });
});

describe('derivePanelContent — precedence rules (regression + new inference)', () => {
  // Case 1: journey='area-first' + areaKey → 'area-selected' (existing)
  it('Case 1: journey=area-first + areaKey → area-selected', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', areaKey: 'udupi-west' })),
    ).toBe('area-selected');
  });

  // Case 2: journey='area-first' + no areaKey → 'area-groups-landing' (existing)
  it('Case 2: journey=area-first + no areaKey → area-groups-landing', () => {
    expect(derivePanelContent(makeState({ journey: 'area-first' }))).toBe('area-groups-landing');
  });

  // Case 3: journey='school-first' + schoolId → 'school-selected' (existing)
  it('Case 3: journey=school-first + schoolId → school-selected', () => {
    expect(
      derivePanelContent(makeState({ journey: 'school-first', schoolId: 'sch-1' })),
    ).toBe('school-selected');
  });

  // Case 4: journey='school-first' + areaKey + no schoolId → 'schools-in-area' (existing)
  it('Case 4: journey=school-first + areaKey (no schoolId) → schools-in-area', () => {
    expect(
      derivePanelContent(makeState({ journey: 'school-first', areaKey: 'udupi-west' })),
    ).toBe('schools-in-area');
  });

  // Case 5: no journey + areaKey + no schoolId → 'area-selected' (NEW: #1049 fix)
  it('Case 5: no journey + areaKey (no schoolId) → area-selected (infer area-first)', () => {
    expect(derivePanelContent(makeState({ areaKey: 'udupi-west' }))).toBe('area-selected');
  });

  // Case 6: no journey + schoolId → 'school-selected' (NEW: protect #1038 cold-load)
  it('Case 6: no journey + schoolId → school-selected (cold-load protection)', () => {
    expect(derivePanelContent(makeState({ schoolId: 'sch-1' }))).toBe('school-selected');
  });

  // Case 7: no journey + no areaKey + no schoolId → 'guided-entry' (city-only)
  it('Case 7: no journey + no areaKey + no schoolId → guided-entry', () => {
    expect(derivePanelContent(makeState())).toBe('guided-entry');
  });

  // Case 8: areaKey + schoolId → 'area-school-combined' (both present, highest priority)
  it('Case 8: areaKey + schoolId (both present) → area-school-combined', () => {
    expect(
      derivePanelContent(makeState({ areaKey: 'udupi-west', schoolId: 'sch-1' })),
    ).toBe('area-school-combined');
  });
});

// ─── Issue #1154: groupId deep-link without journey ───────────────────────────

describe('derivePanelContent — groupId deep-link inference (issue #1154)', () => {
  // AC1: groupId present, journey absent, areaKey null, schoolId null → area-groups-landing
  it('AC1: groupId set, journey null, areaKey null, schoolId null → area-groups-landing', () => {
    expect(
      derivePanelContent(makeState({ groupId: 'coastal-homes' })),
    ).toBe('area-groups-landing');
  });

  // AC2 (regression guard): journey=area-first + groupId still → area-groups-landing
  it('AC2: journey=area-first + groupId set, no areaKey → area-groups-landing', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', groupId: 'coastal-homes' })),
    ).toBe('area-groups-landing');
  });

  // AC3: unknown/non-existent groupId, journey absent → area-groups-landing (no crash)
  it('AC3: unknown groupId, journey null → area-groups-landing (no crash)', () => {
    expect(
      derivePanelContent(makeState({ groupId: 'non-existent-group' })),
    ).toBe('area-groups-landing');
  });

  // R7 regression: groupId + areaKey + schoolId all set → area-school-combined (combined fires first)
  it('R7: groupId + areaKey + schoolId set → area-school-combined (combined takes priority)', () => {
    expect(
      derivePanelContent(
        makeState({ groupId: 'coastal-homes', areaKey: 'udupi-west', schoolId: 'sch-1' }),
      ),
    ).toBe('area-school-combined');
  });

  // R4 regression: groupId + areaKey set, no schoolId → area-selected (areaKey takes priority)
  it('R4: groupId + areaKey set, no schoolId → area-selected (areaKey takes priority)', () => {
    expect(
      derivePanelContent(makeState({ groupId: 'coastal-homes', areaKey: 'udupi-west' })),
    ).toBe('area-selected');
  });

  // R3 regression: schoolId set, no journey, no groupId, no areaKey → school-selected
  it('R3: schoolId set, no journey, no groupId, no areaKey → school-selected', () => {
    expect(
      derivePanelContent(makeState({ schoolId: 'sch-1' })),
    ).toBe('school-selected');
  });
});
