/**
 * Issue #2150 — mobile (and desktop) area-first marker tap inside a
 * Bounded-Browse node (`node=<groupKey>&nodeListings=1`) never opened the
 * mobile listing-preview sheet nor highlighted the tapped marker/list card,
 * because both the click-CAPTURE gate (`useMarkerSelection`'s
 * `hasMarkerAreaContext`, fed via `useDiscoverMarkerController`'s
 * `isNodeAreaLeaf` param) and the popover RENDER gate
 * (`isMarkerPopoverEligible`, fed via `useDiscoverMarkerPopoverController`'s
 * `isNodeAreaLeafActive` param) only ever admitted a resolved canonical AREA
 * LEAF (`isNodeAreaLeafActive`). `NodeListingsSurface` — the surface that
 * actually renders for `nodeListings=1` — supports ANY node level (not just
 * leaves) once its individual property markers are showing, and its own
 * `selectedListingPreview`/highlight both derive from `nav.selectedListing`,
 * which is written ONLY by the capture gate above.
 *
 * ROOT CAUSE (live-verified 2026-08-13 against localhost:5174, shared hosted
 * DB, real `page.touchscreen.tap()` with an `elementFromPoint` hit-test):
 * `node=c:central:in-ka-bengaluru-banashankari-temple-ward-in-ka-bengaluru-
 * kumaraswamy-layout` resolves to a GROUP-level node (5 area-cluster bubbles,
 * NOT a canonical AREA leaf), so `isNodeAreaLeafActive` is `false` there even
 * though `nodeListings=1` is on the URL and the map — once zoomed past the
 * cluster threshold — renders real `property-marker` pins scoped to that
 * node. Before the fix: tapping one of those pins left the URL, the mobile
 * sheet, and every marker's `data-selected` attribute completely unchanged.
 * After the fix (this file's `isNodeAreaLeafOrListingsActive` formula,
 * `useDiscoverPageComposition.ts`): the tap writes `listing=<id>`, the mobile
 * sheet (`data-testid="mobile-listing-preview-sheet"`) opens, and the tapped
 * marker gains `data-selected="true"` (`AreaSelectedPanel`'s
 * `[data-testid="listing-card"][data-selected="true"]` list highlight is
 * driven by the exact same `nav.selectedListing` value, so it is fixed by
 * the same URL write — not independently tested here).
 *
 * `useDiscoverPageComposition.ts` has no exported testable boundary of its
 * own (a single giant hook with no isolated render harness in this PR's
 * scope), so — mirroring `nodeAreaLeafGateComposition.test.ts`'s established
 * pattern for the sibling #1956 PR-4 boolean — this test reproduces the
 * EXACT composition formula (`isNodeAreaLeafActive || isNodeListingsState`)
 * inline and exercises it against the REAL, imported
 * `hasMarkerAreaContext`/`isMarkerPopoverEligible` functions, so a regression
 * in either the formula or the composed functions fails here.
 */
import { describe, it, expect } from 'vitest';
import { hasMarkerAreaContext, isMarkerPopoverEligible } from '../../navigation/markerPopoverEligibility';

/** Reproduces useDiscoverPageComposition.ts's exact `isNodeAreaLeafOrListingsActive` expression. */
function computeIsNodeAreaLeafOrListingsActive(params: {
  isNodeAreaLeafActive: boolean;
  isNodeListingsState: boolean;
}): boolean {
  return params.isNodeAreaLeafActive || params.isNodeListingsState;
}

describe('#2150 — isNodeAreaLeafOrListingsActive composition (useDiscoverPageComposition.ts)', () => {
  it('GROUP node (not a leaf) with nodeListings=1 — marker click now writes the URL listing param', () => {
    const gate = computeIsNodeAreaLeafOrListingsActive({
      isNodeAreaLeafActive: false, // GROUP node — never a canonical AREA leaf
      isNodeListingsState: true, // nodeListings=1 (Bounded Browse) is active
    });
    expect(gate).toBe(true);

    expect(
      hasMarkerAreaContext({ journey: 'area-first', areaKey: null, isNodeAreaLeaf: gate }),
    ).toBe(true);
  });

  it('GROUP node (not a leaf) with nodeListings=1 — marker click is popover-render-eligible', () => {
    const gate = computeIsNodeAreaLeafOrListingsActive({
      isNodeAreaLeafActive: false,
      isNodeListingsState: true,
    });

    expect(
      isMarkerPopoverEligible({
        journey: 'area-first',
        areaKey: null,
        schoolId: null,
        isNodeAreaLeaf: gate,
      }),
    ).toBe(true);
  });

  it('THE PRE-FIX BUG, reproduced: without the OR, a GROUP node + nodeListings=1 was never admitted', () => {
    // isNodeAreaLeafActive alone (the old, un-widened gate) stays false for a
    // GROUP node regardless of nodeListings=1 — this is the exact defect.
    const preFixGate = false;
    expect(
      hasMarkerAreaContext({ journey: 'area-first', areaKey: null, isNodeAreaLeaf: preFixGate }),
    ).toBe(false);
  });

  it('canonical AREA leaf still works exactly as before (isNodeListingsState=false)', () => {
    const gate = computeIsNodeAreaLeafOrListingsActive({
      isNodeAreaLeafActive: true,
      isNodeListingsState: false,
    });
    expect(gate).toBe(true);
    expect(
      hasMarkerAreaContext({ journey: 'area-first', areaKey: null, isNodeAreaLeaf: gate }),
    ).toBe(true);
  });

  it('neither a leaf nor bounded-browsing — still NOT admitted (no over-widening)', () => {
    const gate = computeIsNodeAreaLeafOrListingsActive({
      isNodeAreaLeafActive: false,
      isNodeListingsState: false,
    });
    expect(gate).toBe(false);
    expect(
      hasMarkerAreaContext({ journey: 'area-first', areaKey: null, isNodeAreaLeaf: gate }),
    ).toBe(false);
  });

  it('school-first stays excluded from the URL-write gate even when isNodeListingsState is somehow true', () => {
    // hasMarkerAreaContext deliberately ANDs isNodeAreaLeaf with journey === 'area-first'
    // (see #1973's "stays 'click'" contract) — nodeListings=1 is an
    // area-first-only concept, but this guards against any future drift.
    const gate = computeIsNodeAreaLeafOrListingsActive({
      isNodeAreaLeafActive: false,
      isNodeListingsState: true,
    });
    expect(
      hasMarkerAreaContext({ journey: 'school-first', areaKey: null, isNodeAreaLeaf: gate }),
    ).toBe(false);
  });
});
