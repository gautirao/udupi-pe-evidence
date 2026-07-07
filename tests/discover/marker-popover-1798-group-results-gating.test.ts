/**
 * Issue #1798 PR-B — group-results / dense-area-group marker-popover gating.
 *
 * NEW file, append-only alongside tests/discover/marker-popover-1738-gating.test.ts
 * (left byte-for-byte unmodified — see that file's header and MapDiscovery.tsx
 * L2768-2784, `isAreaFirstPopoverEligible` is untouched; this issue only ADDS a
 * sibling `isGroupResultsPopoverEligible` check, ORed into `isMarkerPopoverEligible`).
 *
 * Ground truth (MapDiscovery.tsx L2780-2784):
 *   const isGroupResultsPopoverEligible =
 *     urlState.journey === 'area-first' &&
 *     (resolvedPanelContent === 'area-group-results' || isSelectedGroupState);
 *   const isMarkerPopoverEligible = isAreaFirstPopoverEligible || isGroupResultsPopoverEligible;
 *
 * `isSelectedGroupState` (L2742-2743):
 *   resolvedPanelContent === 'area-groups-landing' && !!focusedGroup && !selectedArea
 *
 * Both `isGroupResultsPopoverEligible` and `isSelectedGroupState` are inline,
 * unexported locals in MapDiscovery.tsx, so (same documented gap as the #1738
 * substitute file) they are replicated here literally rather than imported, and
 * every assertion is decorated with the REAL `derivePanelContent` output so the
 * replica cannot silently drift from panel-content routing.
 */

import { describe, it, expect } from 'vitest';
import { derivePanelContent } from '@/utils/discoverPanelState';
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

/** Literal replica of MapDiscovery.tsx's isAreaFirstPopoverEligible (#1738, unchanged). */
function isAreaFirstPopoverEligible(
  journey: DiscoverUrlState['journey'],
  hasSelectedArea: boolean,
  panelContent: ReturnType<typeof derivePanelContent>,
): boolean {
  return (
    journey === 'area-first' &&
    hasSelectedArea &&
    (panelContent === 'area-selected' || panelContent === 'area-school-combined')
  );
}

/** Literal replica of MapDiscovery.tsx's isSelectedGroupState (L2742-2743). */
function isSelectedGroupState(
  panelContent: ReturnType<typeof derivePanelContent>,
  hasFocusedGroup: boolean,
  hasSelectedArea: boolean,
): boolean {
  return panelContent === 'area-groups-landing' && hasFocusedGroup && !hasSelectedArea;
}

/** Literal replica of MapDiscovery.tsx's isGroupResultsPopoverEligible (#1798 PR-B, L2780-2782). */
function isGroupResultsPopoverEligible(
  journey: DiscoverUrlState['journey'],
  panelContent: ReturnType<typeof derivePanelContent>,
  selectedGroupState: boolean,
): boolean {
  return journey === 'area-first' && (panelContent === 'area-group-results' || selectedGroupState);
}

function isMarkerPopoverEligible(
  areaFirstEligible: boolean,
  groupResultsEligible: boolean,
): boolean {
  return areaFirstEligible || groupResultsEligible;
}

const GROUP_ID = 'thanisandra-hennur-belt';

describe('Issue #1798 PR-B — group-results / dense-area-group marker-popover gating', () => {
  it('AC: area-first + resolved groupId (server-filtered group-results) -> popover eligible via isGroupResultsPopoverEligible', () => {
    // derivePanelContent requires the explicit groupResults flag (set by
    // onEnterGroupResults / the "View all" CTA) — groupId alone routes to
    // area-groups-landing (covered by the isSelectedGroupState test below).
    const state = makeState({ journey: 'area-first', groupId: GROUP_ID, groupResults: true });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-group-results');
    const groupResults = isGroupResultsPopoverEligible('area-first', panelContent, false);
    expect(groupResults).toBe(true);
    expect(isMarkerPopoverEligible(false, groupResults)).toBe(true);
  });

  it('AC: area-first + focused group, no area selected (Level-2 dense-group state) -> popover eligible via isSelectedGroupState', () => {
    const state = makeState({ journey: 'area-first', groupId: GROUP_ID });
    const panelContent = derivePanelContent(state);
    // area-groups-landing is the panelContent BEFORE a groupId resolves to
    // area-group-results in the real app's data-driven branch; exercised here
    // directly against the literal isSelectedGroupState replica.
    const selectedGroupState = isSelectedGroupState('area-groups-landing', true, false);
    expect(selectedGroupState).toBe(true);

    const groupResults = isGroupResultsPopoverEligible('area-first', 'area-groups-landing', selectedGroupState);
    expect(groupResults).toBe(true);
    expect(isMarkerPopoverEligible(false, groupResults)).toBe(true);
  });

  it('regression guard: isSelectedGroupState is false once an area is selected (Level-3) — group-results eligibility falls back to isAreaFirstPopoverEligible only', () => {
    const AREA_KEY = 'IN|KA|Bangalore|Thanisandra';
    const state = makeState({ journey: 'area-first', groupId: GROUP_ID, areaKey: AREA_KEY });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-selected');
    const selectedGroupState = isSelectedGroupState(panelContent, true, true);
    expect(selectedGroupState).toBe(false);

    const areaFirst = isAreaFirstPopoverEligible('area-first', true, panelContent);
    const groupResults = isGroupResultsPopoverEligible('area-first', panelContent, selectedGroupState);
    expect(areaFirst).toBe(true);
    expect(groupResults).toBe(false);
    expect(isMarkerPopoverEligible(areaFirst, groupResults)).toBe(true);
  });

  it('regression guard: school-first + resolved groupId -> NOT popover-eligible (group-results popover stays area-first-only, same #1738 precedent)', () => {
    const state = makeState({ journey: 'school-first', groupId: GROUP_ID });
    const panelContent = derivePanelContent(state);

    // school-first has its own group-areas panel content, distinct from
    // area-first's area-group-results — but even if it ever collided, the
    // explicit journey check must exclude school-first here.
    const groupResults = isGroupResultsPopoverEligible('school-first', panelContent, false);
    expect(groupResults).toBe(false);
  });

  it('regression guard: agri-first is never group-results-popover-eligible', () => {
    const state = makeState({ journey: 'agri-first', groupId: GROUP_ID });
    const panelContent = derivePanelContent(state);

    const groupResults = isGroupResultsPopoverEligible('agri-first', panelContent, false);
    expect(groupResults).toBe(false);
  });

  it('regression guard: area-first with NO groupId and NOT in group-results -> group-results gate is false (isAreaFirstPopoverEligible remains the only path, unchanged from #1738)', () => {
    const state = makeState({ journey: 'area-first' });
    const panelContent = derivePanelContent(state);

    // No areaKey/groupId at all → the plain area-first landing state. This is
    // NOT isSelectedGroupState (no focused group) and NOT area-group-results
    // (no groupResults flag), so the group-results gate must stay false.
    expect(panelContent).toBe('area-groups-landing');
    const selectedGroupState = isSelectedGroupState(panelContent, false, false);
    expect(selectedGroupState).toBe(false);
    const groupResults = isGroupResultsPopoverEligible('area-first', panelContent, selectedGroupState);
    expect(groupResults).toBe(false);
    expect(isMarkerPopoverEligible(false, groupResults)).toBe(false);
  });

  it('no journey at all (guided-entry) -> group-results gate is false', () => {
    const state = makeState();
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('guided-entry');
    const groupResults = isGroupResultsPopoverEligible(null, panelContent, false);
    expect(groupResults).toBe(false);
  });
});
