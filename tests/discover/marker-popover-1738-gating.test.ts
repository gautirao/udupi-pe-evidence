/**
 * COMPONENT-LEVEL SUBSTITUTE — Issue #1738 marker-popover eligibility gating.
 *
 * Why this file exists: the Mode-3 Stage B QA-authoring task asked for a live
 * browser E2E run of the #1738 procedure (radius overlay + marker + popup
 * open/dismiss) against a local Vite dev server on :5183. Bringing up that dev
 * server in this worktree crashed on every route ("Invalid hook call... Cannot
 * read properties of null (reading 'useRef')" inside <TooltipProvider>, i.e.
 * every page, not just Discover). This reproduces identically on the
 * PRE-EXISTING e2e/discover/school-radius-marker-click-repro-1738.spec.ts (which
 * predates Batch B and does not touch any Batch B file), and does NOT reproduce
 * against the main repo checkout's dev server — so it is a worktree-local Vite
 * dev-server dependency-optimization fault (survives `npm install` + clearing
 * node_modules/.vite), not a Batch B regression. `npm test` / Vitest is healthy
 * in this worktree (proven — see the passing run cited in the QA report), so
 * this file substitutes a functional, business-meaningful assertion of the
 * #1738 contract using the REAL exported logic the E2E spec exercises, per the
 * LIVE-UNAVAILABLE substitute path in the Stage-B procedure.
 *
 * What #1738 actually is (ground truth, not the originally-specified
 * `journey=school-first` procedure text — see discover-1738-regression.spec.ts
 * header for the full correction): MarkerPopoverCard only renders when
 * `journey === 'area-first' && selectedArea && (panelContent === 'area-selected'
 * || panelContent === 'area-school-combined')` (src/pages/MapDiscovery.tsx,
 * `isAreaFirstPopoverEligible`, ~L2311-2319). `derivePanelContent` routes BOTH
 * area-first and school-first area+school selections to the SAME
 * 'area-school-combined' panel content — so the journey check must be explicit,
 * or school-first would wrongly gain the popover. This file locks that contract
 * down at the panel-state-derivation layer (the actual root cause of the
 * original bug), and confirms the radius legend's independent gate
 * (`isSchoolRadiusOverlayState`) is NOT journey-scoped, so it legitimately
 * coexists with the popover in area-first while also appearing (correctly,
 * without a popover) in school-first.
 *
 * MarkerPopoverCard's own dismiss behaviour (X button / Escape / non-Escape
 * ignored) is already covered by
 * src/components/discover/__tests__/MarkerPopoverCard.test.tsx and is not
 * duplicated here.
 *
 * Coverage gap this leaves (documented, not silently dropped): `isAreaFirstPopoverEligible`
 * itself is inline in MapDiscovery.tsx, not exported, so it cannot be imported
 * directly — this file replicates its literal boolean formula (cited above) and
 * decorates every assertion with the *real* `derivePanelContent` output so the
 * replica cannot silently drift from panel-content routing (the actual failure
 * mode of the original bug). Extracting `isAreaFirstPopoverEligible` as a named
 * export would let a future revision assert it directly; flagged here rather
 * than fixed, since this file must not modify implementation code.
 */

import { describe, it, expect } from 'vitest';
import { derivePanelContent } from '@/utils/discoverPanelState';
import { isSchoolRadiusOverlayState } from '@/components/discover/SchoolRadiusMapOverlay';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

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
    intent: 'buy',
    ...overrides,
  };
}

/**
 * Literal replica of MapDiscovery.tsx's `isAreaFirstPopoverEligible` (see file
 * header). `hasSelectedArea` stands in for the hydrated `selectedArea` object
 * MapDiscovery derives from `areaKey` + the areas list — true whenever areaKey
 * is set in these fixtures, matching how the real app resolves it once areas
 * have loaded.
 */
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

const AREA_KEY = 'IN|KA|Udupi|Manipal';
const SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';

describe('Issue #1738 — marker-popover eligibility gating (component-level substitute)', () => {
  it('AC1 equivalent: area-first + areaKey only -> area-selected, popover-eligible', () => {
    const state = makeState({ journey: 'area-first', areaKey: AREA_KEY });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-selected');
    expect(isAreaFirstPopoverEligible('area-first', true, panelContent)).toBe(true);
  });

  it('AC2 equivalent (the fix): area-first + areaKey + schoolId -> area-school-combined, STILL popover-eligible', () => {
    const state = makeState({ journey: 'area-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-school-combined');
    expect(isAreaFirstPopoverEligible('area-first', true, panelContent)).toBe(true);

    // The radius legend's own gate is schoolId-driven, not journey-scoped — it must
    // ALSO be visible here, proving the popover and the legend legitimately coexist
    // in this one state (the state exercised by discover-1738-regression.spec.ts).
    expect(isSchoolRadiusOverlayState(panelContent, true)).toBe(true);
  });

  it('AC5 equivalent (non-regression): school-first + areaKey + schoolId -> SAME area-school-combined panelContent, but NOT popover-eligible', () => {
    const state = makeState({ journey: 'school-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID });
    const panelContent = derivePanelContent(state);

    // Root cause of the original bug: panelContent is IDENTICAL to the area-first case above.
    expect(panelContent).toBe('area-school-combined');
    // The fix: the explicit journey==='area-first' guard must exclude school-first here,
    // even though panelContent alone can't tell the two journeys apart.
    expect(isAreaFirstPopoverEligible('school-first', true, panelContent)).toBe(false);

    // The radius legend is NOT journey-scoped, so school-first legitimately shows it too
    // (its own tiered/peek marker UI is a separate, unaffected concern from the legend).
    expect(isSchoolRadiusOverlayState(panelContent, true)).toBe(true);
  });

  it('regression guard: area-first with NO area selected is never popover-eligible regardless of panelContent', () => {
    const state = makeState({ journey: 'area-first' });
    const panelContent = derivePanelContent(state);

    expect(isAreaFirstPopoverEligible('area-first', false, panelContent)).toBe(false);
  });

  it('regression guard: agri-first is never popover-eligible even with areaKey set (own peek/panel)', () => {
    const state = makeState({ journey: 'agri-first', areaKey: AREA_KEY });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('agri-selected');
    expect(isAreaFirstPopoverEligible('agri-first', true, panelContent)).toBe(false);
  });
});
