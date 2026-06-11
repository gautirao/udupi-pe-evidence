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
    selectedGroup: null,
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

describe('derivePanelContent — agri-first journey (MVP2 + Issue #1371)', () => {
  it('returns agri-landing when journey=agri-first and no areaKey', () => {
    expect(derivePanelContent(makeState({ journey: 'agri-first' }))).toBe('agri-landing');
  });

  // Issue #1371 — area selected in agri-first journey routes to the new agri-selected state.
  it('returns agri-selected when journey=agri-first and areaKey is present', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'agri-first', areaKey: 'IN|KA|Udupi|Manipal' }),
      ),
    ).toBe('agri-selected');
  });

  // Stray schoolId alone (no areaKey) must NOT route agri out of agri-landing.
  it('returns agri-landing when journey=agri-first and schoolId present but no areaKey', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'agri-first', schoolId: 'sch-1' }),
      ),
    ).toBe('agri-landing');
  });

  // areaKey + schoolId: areaKey wins → agri-selected (schoolId is ignored in agri journey).
  it('returns agri-selected when journey=agri-first and both areaKey + schoolId present', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          schoolId: 'sch-1',
        }),
      ),
    ).toBe('agri-selected');
  });

  // A stray groupId without areaKey must NOT route agri to area-groups-landing.
  it('returns agri-landing when journey=agri-first and groupId present but no areaKey', () => {
    expect(
      derivePanelContent(makeState({ journey: 'agri-first', groupId: 'coastal-homes' })),
    ).toBe('agri-landing');
  });

  // groupId + areaKey: areaKey wins → agri-selected.
  it('returns agri-selected when journey=agri-first, areaKey + groupId both present', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'agri-first', areaKey: 'IN|KA|Udupi|Manipal', groupId: 'coastal-homes' }),
      ),
    ).toBe('agri-selected');
  });
});

// ─── Issue #1425: agri-group-selected routing ─────────────────────────────────

describe('derivePanelContent — agri-group-selected (Issue #1425)', () => {
  const group = { directionKey: 'N', distanceBandKey: '10_25' };

  // Core: selectedGroup set + no areaKey → agri-group-selected
  it('returns agri-group-selected when journey=agri-first and selectedGroup is set (no areaKey)', () => {
    expect(
      derivePanelContent(makeState({ journey: 'agri-first', selectedGroup: group })),
    ).toBe('agri-group-selected');
  });

  // Precedence: areaKey always wins over selectedGroup
  it('returns agri-selected (not agri-group-selected) when both areaKey and selectedGroup present', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          selectedGroup: group,
          areaKey: 'IN|KA|Udupi|Manipal',
        }),
      ),
    ).toBe('agri-selected');
  });

  // selectedGroup=null + no areaKey → agri-landing (unchanged)
  it('returns agri-landing when journey=agri-first, selectedGroup=null, no areaKey', () => {
    expect(
      derivePanelContent(makeState({ journey: 'agri-first', selectedGroup: null })),
    ).toBe('agri-landing');
  });

  // area-first journey is unaffected by selectedGroup
  it('area-first journey returns area-groups-landing regardless of selectedGroup', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', selectedGroup: group })),
    ).toBe('area-groups-landing');
  });

  // area-first + areaKey still returns area-selected even with selectedGroup
  it('area-first + areaKey + selectedGroup → area-selected (area-first unaffected)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'area-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          selectedGroup: group,
        }),
      ),
    ).toBe('area-selected');
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

// ─── Issue #1430: agri-group-peek routing ─────────────────────────────────────

describe('derivePanelContent — agri-group-peek (Issue #1430)', () => {
  // Core: region + maxKm + listing (no areaKey) → agri-group-peek
  it('agri-first + region + maxKm + listing (no areaKey) → agri-group-peek', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          selectedRegion: 'N',
          selectedMaxKm: 25,
          selectedListing: 'listing-uuid-abc',
        }),
      ),
    ).toBe('agri-group-peek');
  });

  // Regression: region + maxKm, NO listing → agri-group-selected (unchanged)
  it('agri-first + region + maxKm + NO listing → agri-group-selected (unchanged)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          selectedRegion: 'N',
          selectedMaxKm: 25,
          selectedListing: null,
        }),
      ),
    ).toBe('agri-group-selected');
  });

  // areaKey always wins over listing (areaKey → agri-selected, listing ignored)
  it('agri-first + areaKey + region + maxKm + listing → agri-selected (areaKey wins)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          selectedRegion: 'N',
          selectedMaxKm: 25,
          selectedListing: 'listing-uuid-abc',
        }),
      ),
    ).toBe('agri-selected');
  });

  // listing without region+maxKm → agri-landing (listing is ignored without context)
  it('agri-first + NO region + NO maxKm + listing → agri-landing (listing ignored)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          selectedListing: 'listing-uuid-abc',
        }),
      ),
    ).toBe('agri-landing');
  });

  // Non-agri journey: listing param is ignored for area-first
  it('non-agri journey (area-first) + listing → correct non-agri panel (listing ignored)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'area-first',
          selectedListing: 'listing-uuid-abc',
        }),
      ),
    ).toBe('area-groups-landing');
  });

  // Non-agri journey: listing param is ignored for school-first
  it('non-agri journey (school-first) + listing → school-browse (listing ignored)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'school-first',
          selectedListing: 'listing-uuid-abc',
        }),
      ),
    ).toBe('school-browse');
  });
});

// ─── Issue #1446: agri-group-selected routing via selectedRegion + selectedMaxKm ──

describe('derivePanelContent — agri-group-selected via region+maxKm (Issue #1446)', () => {
  // a. region + maxKm + no listing → agri-group-selected
  it('#1446-a: agri-first + selectedRegion=North + selectedMaxKm=25 + no listing → agri-group-selected', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'agri-first', selectedRegion: 'N', selectedMaxKm: 25 }),
      ),
    ).toBe('agri-group-selected');
  });

  // b. region + maxKm + listing → agri-group-peek (listing takes over)
  it('#1446-b: agri-first + selectedRegion=North + selectedMaxKm=25 + listing → agri-group-peek', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'agri-first',
          selectedRegion: 'N',
          selectedMaxKm: 25,
          selectedListing: 'some-listing-uuid',
        }),
      ),
    ).toBe('agri-group-peek');
  });

  // c. region + maxKm=null → does NOT route to agri-group-selected (stays at agri-landing)
  it('#1446-c: agri-first + selectedRegion=North + selectedMaxKm=null → agri-landing (not agri-group-selected)', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'agri-first', selectedRegion: 'N', selectedMaxKm: null }),
      ),
    ).not.toBe('agri-group-selected');
  });

  // d. residential journey: region + maxKm do not affect routing (AC8)
  it('#1446-d: residential journey (area-first) + selectedRegion=North + selectedMaxKm=25 → NOT agri-group-selected (AC8)', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'area-first', selectedRegion: 'N', selectedMaxKm: 25 }),
      ),
    ).not.toBe('agri-group-selected');
  });

  // e. school journey: region + maxKm do not affect routing (AC8)
  it('#1446-e: school journey (school-first) + selectedRegion=North + selectedMaxKm=25 → NOT agri-group-selected (AC8)', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'school-first', selectedRegion: 'N', selectedMaxKm: 25 }),
      ),
    ).not.toBe('agri-group-selected');
  });
});

// ─── Issue #1157: area-first "add a school in this area" sub-step ──────────────

describe('area-first school-picking sub-step (Issue #1157)', () => {
  // (a) The transient marker shows the schools-in-area panel without flipping journey.
  it('(a) area-first + areaKey + schoolPicking + no schoolId → schools-in-area', () => {
    expect(
      derivePanelContent(
        makeState({ journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal', schoolPicking: true }),
      ),
    ).toBe('schools-in-area');
  });

  // (b) Once a school is selected, schoolId precedence wins (placement + !schoolId guard).
  it('(b) area-first + areaKey + schoolId (+schoolPicking) → area-school-combined (precedence)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'area-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          schoolId: 'sch-1',
          schoolPicking: true,
        }),
      ),
    ).toBe('area-school-combined');
  });

  // (c) Without an areaKey there is nothing to pick schools within → landing.
  it('(c) area-first + schoolPicking + no areaKey → area-groups-landing', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', schoolPicking: true })),
    ).toBe('area-groups-landing');
  });

  // (d) The marker only affects the area-first branch; school-first ignores it.
  it('(d) school-first + schoolPicking → school-browse (marker ignored)', () => {
    expect(
      derivePanelContent(makeState({ journey: 'school-first', schoolPicking: true })),
    ).toBe('school-browse');
  });

  // (e) Regression: no marker → area-selected (unchanged behaviour).
  it('(e) area-first + areaKey + no marker → area-selected (unchanged)', () => {
    expect(
      derivePanelContent(makeState({ journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal' })),
    ).toBe('area-selected');
  });

  // (f) Option (i) post-select state: selecting a school in the sub-step sets schoolId
  // and drops schoolPicking while keeping journey=area-first → area-school-combined
  // (no journey flip). This is the AC3 contract for the area-first select path.
  it('(f) area-first + areaKey + schoolId (schoolPicking dropped) → area-school-combined (no flip)', () => {
    expect(
      derivePanelContent(
        makeState({
          journey: 'area-first',
          areaKey: 'IN|KA|Udupi|Manipal',
          schoolId: 'sch-1',
        }),
      ),
    ).toBe('area-school-combined');
  });
});
