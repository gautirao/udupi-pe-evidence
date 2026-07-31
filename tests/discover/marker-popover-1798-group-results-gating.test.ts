/**
 * Issue #1798 PR-B — group-results / dense-area-group marker-popover gating.
 *
 * Issue #1956 PR-4 (scope amendment n=1) — COVERAGE GAP CLOSED, and a stale
 * "ground truth" citation CORRECTED (preserve-corrections rule: recorded
 * here rather than silently overwritten).
 *
 * The previous revision of this file replicated THREE inline MapDiscovery.tsx
 * locals it cited as current — `isAreaFirstPopoverEligible`,
 * `isSelectedGroupState`, `isGroupResultsPopoverEligible` — none of which
 * exist in MapDiscovery.tsx on this branch (verified: zero hits). Production
 * had already CONSOLIDATED marker-popover render eligibility into the single
 * `isMarkerPopoverEligible` formula documented in
 * tests/discover/marker-popover-1738-gating.test.ts (journey/areaKey/schoolId
 * only — no panelContent, no groupId/focusedGroup/isGroupResultsState term)
 * BEFORE this PR, so this file's replicas had already silently drifted from
 * production — exactly the bug class this extraction closes. That
 * consolidated formula does NOT admit a resolved-group, no-area
 * ("group-results") state: `groupId` alone leaves `areaKey` null, and (before
 * PR-4) there was no other arm that could make the predicate true for such a
 * state. The "eligible via isGroupResultsPopoverEligible" claims below are
 * therefore corrected to `false` for every state that has no resolved
 * `areaKey`.
 *
 * `isMarkerPopoverEligible` is now imported directly from
 * `src/features/discover/navigation/markerPopoverEligibility.ts` (the same
 * export `marker-popover-1738-gating.test.ts` and both production sites —
 * MapDiscovery.tsx's render gate, useMarkerSelection.ts's capture gate —
 * import); every local replica in this file is DELETED. Every assertion is
 * still decorated with the REAL `derivePanelContent` output so this suite
 * cannot silently drift from panel-content routing.
 */

import { describe, it, expect } from 'vitest';
import { derivePanelContent } from '@/utils/discoverPanelState';
import { isMarkerPopoverEligible } from '@/features/discover/navigation/markerPopoverEligibility';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

function makeState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    ...overrides,
  };
}

const GROUP_ID = 'thanisandra-hennur-belt';

describe('Issue #1798/#1956 PR-4 — group-results / dense-area-group marker-popover gating against the REAL consolidated predicate', () => {
  it('CORRECTED: area-first + resolved groupId (server-filtered group-results), no areaKey -> NOT eligible under the real formula (areaKey is null; no group-results arm exists)', () => {
    // derivePanelContent requires the explicit groupResults flag (set by
    // onEnterGroupResults / the "View all" CTA) — groupId alone routes to
    // area-groups-landing (see the next test).
    const state = makeState({ journey: 'area-first', groupId: GROUP_ID, groupResults: true });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-group-results');
    expect(
      isMarkerPopoverEligible({ journey: 'area-first', areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(false);
  });

  it('CORRECTED: area-first + focused group, no area selected (Level-2 dense-group state) -> NOT eligible under the real formula (areaKey is null)', () => {
    const state = makeState({ journey: 'area-first', groupId: GROUP_ID });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-groups-landing');
    expect(
      isMarkerPopoverEligible({ journey: 'area-first', areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(false);
  });

  it('regression guard: once a real areaKey resolves (Level-3) -> eligible via the ORIGINAL #1738 areaKey clause, unaffected by groupId', () => {
    const AREA_KEY = 'IN|KA|Bangalore|Thanisandra';
    const state = makeState({ journey: 'area-first', groupId: GROUP_ID, areaKey: AREA_KEY });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-selected');
    expect(
      isMarkerPopoverEligible({ journey: 'area-first', areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(true);
  });

  it('regression guard: school-first + resolved groupId, no areaKey/schoolId -> NOT popover-eligible', () => {
    const state = makeState({ journey: 'school-first', groupId: GROUP_ID });
    derivePanelContent(state);

    expect(
      isMarkerPopoverEligible({ journey: 'school-first', areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(false);
  });

  it('regression guard: agri-first is never popover-eligible, groupId notwithstanding', () => {
    const state = makeState({ journey: 'agri-first', groupId: GROUP_ID });
    derivePanelContent(state);

    expect(
      isMarkerPopoverEligible({ journey: 'agri-first', areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(false);
  });

  it('regression guard: area-first with NO groupId and NOT in group-results -> gate is false (plain landing)', () => {
    const state = makeState({ journey: 'area-first' });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-groups-landing');
    expect(
      isMarkerPopoverEligible({ journey: 'area-first', areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(false);
  });

  it('no journey at all (guided-entry) -> gate is false', () => {
    const state = makeState();
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('guided-entry');
    expect(
      isMarkerPopoverEligible({ journey: state.journey, areaKey: state.areaKey, schoolId: state.schoolId }),
    ).toBe(false);
  });
});
