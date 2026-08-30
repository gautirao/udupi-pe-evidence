/**
 * COMPONENT-LEVEL SUBSTITUTE — Issue #1738 marker-popover eligibility gating,
 * EXPANDED by Issue #1973 (school-first listing-marker popover).
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
 * marker-popover eligibility contract using the REAL exported logic the E2E
 * spec exercises, per the LIVE-UNAVAILABLE substitute path in the Stage-B
 * procedure.
 *
 * #1738 HISTORICAL SCOPE (why school-first WAS excluded, originally): the
 * original bug was that `derivePanelContent` routes BOTH area-first
 * area+school AND school-first area+school selections to the SAME
 * 'area-school-combined' panel content — so a panelContent-only popover gate
 * would wrongly admit school-first too. The #1738 fix added an explicit
 * `journey === 'area-first'` guard to exclude school-first from the popover
 * entirely, since at the time school-first had its own separate tiered/peek
 * marker UI and no listing-marker popover of its own.
 *
 * #1973 EXPANSION (this file now mirrors CURRENT production behaviour, not
 * the historical #1738-only rule): Issue #1973 made pure school-first marker
 * clicks (radius search, cross-area, areaKey == null) ALSO open and persist a
 * listing-marker popover — via an ADDITIVE OR clause on the existing #1738
 * predicate, not a replacement of it. The real production predicate is
 * `isMarkerPopoverEligible` in src/pages/MapDiscovery.tsx (kept
 * byte-identical to the click-capture gate in
 * src/features/discover/state/useMarkerSelection.ts's
 * handleMarkerClickWithPosition — see both files' comments):
 *
 *   journey !== 'agri-first' &&
 *   ((areaKey != null && (schoolId == null || journey === 'area-first')) ||
 *     (journey === 'school-first' && schoolId != null))
 *
 * i.e. the ORIGINAL #1738 area-gated clause is UNCHANGED (still covers
 * area-first, and area-first area+school combined), PLUS a new areaKey-FREE
 * branch admitting school-first once a school is selected (any areaKey value,
 * including null — the #1973 fix). School-first is NO LONGER unconditionally
 * excluded; this file must not (and no longer does) assert that it is.
 *
 * The original `isAreaFirstPopoverEligible` was renamed to the (journey,
 * areaKey, schoolId) shape shown above (not the old (journey,
 * hasSelectedArea, panelContent) shape) — panelContent is still
 * independently derived and asserted per case so a future revision cannot
 * silently drift from panel-content routing (the actual failure mode of the
 * original #1738 bug), but eligibility itself is no longer computed from
 * panelContent. See the PR-4 note below for where that formula now lives.
 *
 * MarkerPopoverCard's own dismiss behaviour (X button / Escape / non-Escape
 * ignored) is already covered by
 * src/components/discover/__tests__/MarkerPopoverCard.test.tsx and is not
 * duplicated here.
 *
 * Issue #1956 PR-4 (scope amendment n=1) — COVERAGE GAP CLOSED. The previous
 * revision of this file replicated `isMarkerPopoverEligible`'s literal
 * boolean formula rather than importing it, because the real predicate was
 * an unexported inline local in MapDiscovery.tsx — a replica can prove
 * itself internally consistent but can never detect production drift
 * (exactly the #1798 bug class). `isMarkerPopoverEligible` is now a named
 * export of `src/features/discover/navigation/markerPopoverEligibility.ts`,
 * imported directly below; `isMarkerPopoverEligibleReplica` is DELETED. Both
 * production call sites (MapDiscovery.tsx's render gate,
 * useMarkerSelection.ts's capture gate) import the SAME function, so this
 * suite now asserts the real, live formula — including PR-4's new
 * `isNodeAreaLeaf` arm (covered in
 * navigation/__tests__/markerPopoverEligibility.test.ts, not duplicated
 * here) — rather than a copy of it.
 */

import { describe, it, expect } from 'vitest';
import { derivePanelContent } from '@/utils/discoverPanelState';
import { isSchoolRadiusOverlayState } from '@/components/discover/SchoolRadiusMapOverlay';
import { isMarkerPopoverEligible } from '@/features/discover/navigation/markerPopoverEligibility';
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

const AREA_KEY = 'IN|KA|Udupi|Manipal';
const SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';

describe('Issue #1738/#1973 — marker-popover eligibility gating (component-level substitute)', () => {
  it('(a) area-first + areaKey only -> area-selected, ELIGIBLE', () => {
    const state = makeState({ journey: 'area-first', areaKey: AREA_KEY });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-selected');
    expect(isMarkerPopoverEligible({ journey: 'area-first', areaKey: AREA_KEY, schoolId: null })).toBe(true);
  });

  it('(b) area-first + areaKey + schoolId -> area-school-combined, ELIGIBLE', () => {
    const state = makeState({ journey: 'area-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('area-school-combined');
    expect(
      isMarkerPopoverEligible({ journey: 'area-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID }),
    ).toBe(true);

    // The radius legend's own gate is schoolId-driven, not journey-scoped — it must
    // ALSO be visible here, proving the popover and the legend legitimately coexist
    // in this one state (the state exercised by discover-1738-regression.spec.ts).
    expect(isSchoolRadiusOverlayState(panelContent, true)).toBe(true);
  });

  it('(c) THE #1973 FIX — school-first + schoolId + areaKey==null -> school-selected, ELIGIBLE (load-bearing new case)', () => {
    const state = makeState({ journey: 'school-first', areaKey: null, schoolId: SCHOOL_ID });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('school-selected');
    // Pure school-first radius search is cross-area (areaKey is null in this live
    // state) — the #1973 additive-OR branch admits it regardless, unlike the old
    // #1738-only rule which required areaKey != null for every eligible case.
    expect(
      isMarkerPopoverEligible({ journey: 'school-first', areaKey: null, schoolId: SCHOOL_ID }),
    ).toBe(true);
  });

  it('(d) school-first + schoolId + areaKey set -> area-school-combined, ELIGIBLE', () => {
    const state = makeState({ journey: 'school-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID });
    const panelContent = derivePanelContent(state);

    // Same panelContent as case (b) — root cause of the original #1738 bug: the two
    // journeys are indistinguishable by panelContent alone, so eligibility must key
    // off journey/schoolId directly, not panelContent.
    expect(panelContent).toBe('area-school-combined');
    expect(
      isMarkerPopoverEligible({ journey: 'school-first', areaKey: AREA_KEY, schoolId: SCHOOL_ID }),
    ).toBe(true);

    // The radius legend is NOT journey-scoped, so school-first legitimately shows it too
    // (its own tiered/peek marker UI is a separate, unaffected concern from the legend).
    expect(isSchoolRadiusOverlayState(panelContent, true)).toBe(true);
  });

  it('(e) agri-first -> EXCLUDED, even with areaKey set (own peek/panel)', () => {
    const state = makeState({ journey: 'agri-first', areaKey: AREA_KEY });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('agri-selected');
    expect(isMarkerPopoverEligible({ journey: 'agri-first', areaKey: AREA_KEY, schoolId: null })).toBe(
      false,
    );
  });

  it('(f) journeyless / no-context (journey null, no areaKey, no schoolId) -> EXCLUDED', () => {
    const state = makeState({ journey: null });
    const panelContent = derivePanelContent(state);

    expect(panelContent).toBe('guided-entry');
    expect(isMarkerPopoverEligible({ journey: null, areaKey: null, schoolId: null })).toBe(false);
  });

  it('regression guard: area-first with NO area selected is never popover-eligible', () => {
    const state = makeState({ journey: 'area-first' });
    derivePanelContent(state);

    expect(isMarkerPopoverEligible({ journey: 'area-first', areaKey: null, schoolId: null })).toBe(false);
  });
});
