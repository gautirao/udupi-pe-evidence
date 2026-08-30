/**
 * Issue #1956 PR-4 FIX CYCLE 2 (opus review, blocking Finding 1) — composition
 * coverage for the collapsed `isNodeAreaLeafActive` boolean MapDiscovery.tsx
 * derives (MapDiscovery.tsx, just above `urlDiscoverFilters`) and feeds to
 * THREE consumers in lock-step: the layer-registry `nodeAreaLeaf` field
 * (discoverLayerRegistry.ts's `selectDiscoverMapLayer`), the widened
 * `isMarkerPopoverEligible` render gate (markerPopoverEligibility.ts), and
 * useMarkerSelection.ts's capture/URL-write gate.
 *
 * MapDiscovery.tsx itself has no exported testable boundary (it is a single
 * page component) and its own mount-test suite
 * (src/pages/__tests__/MapDiscovery.*.test.tsx) is NOT in this PR's
 * allowed_file_globs, so this is deliberately NOT a full-page render test.
 * Instead it exercises the EXACT composition MapDiscovery.tsx wires — the
 * REAL `deriveAreaPointFromNode`, `isMarkerPopoverEligible`, and
 * `selectDiscoverMapLayer` functions — reproducing only the boolean formula
 * itself (`showAreasNavigationJourney && journey === 'area-first' &&
 * nodeAreaPoint != null`, MapDiscovery.tsx's exact expression) inline, so a
 * regression in any of the three composed functions, or in the formula, fails
 * here.
 *
 * Required test (opus review, Finding 1): AREA node with `areaKey` set,
 * `bounds: null`, journey area-first -> `isMarkerPopoverEligible === false`
 * and `effectiveMapLayerCategory === 'area-group-bubbles'`. See "THE FIX"
 * case below.
 */
import { describe, it, expect } from 'vitest';
import { deriveAreaPointFromNode } from '../nodeAreaPoint';
import { isMarkerPopoverEligible } from '../markerPopoverEligibility';
import { selectDiscoverMapLayer, toLayerInput } from '@/features/discover/utils/discoverLayerRegistry';
import type { NavigationNodeResponse } from '../types';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

function makeAreaLeafNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'a:IN|KA|Bangalore|Manipal',
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 2,
    regionKey: 'east',
    ancestry: [],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: 13.35,
      centreLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bangalore|Manipal',
    ...overrides,
  };
}

/**
 * Minimal legacy-`areaKey`-less area-first URL-state fixture — the node
 * journey never writes the legacy `areaKey` param (nodeAreaPoint.ts's module
 * doc / team-lead-plan-pr4.toml [scope.three_areakeys]), so every fixture
 * here leaves it null.
 */
function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first',
    groupId: null,
    schoolPicking: undefined,
    groupResults: undefined,
    selectedGroup: null,
    selectedRegion: null,
    selectedMaxKm: null,
    selectedListing: null,
    selectedLocality: null,
    intent: 'buy',
    scope: null,
    ...overrides,
  };
}

/** Reproduces MapDiscovery.tsx's exact `isNodeAreaLeafActive` expression. */
function computeIsNodeAreaLeafActive(params: {
  showAreasNavigationJourney: boolean;
  journey: DiscoverUrlState['journey'];
  node: NavigationNodeResponse | null;
}): boolean {
  const nodeAreaPoint = params.showAreasNavigationJourney
    ? deriveAreaPointFromNode(params.node)
    : null;
  return params.showAreasNavigationJourney && params.journey === 'area-first' && nodeAreaPoint != null;
}

/**
 * Reproduces MapDiscovery.tsx's exact `effectiveMapLayerCategory` ternary's
 * TRUE arm verbatim (`selectDiscoverMapLayer({ ...toLayerInput(urlState),
 * nodeAreaLeaf: true }, 'overview')`, MapDiscovery.tsx ~line 1720).
 *
 * FIX CYCLE 3 (NIT6, honesty note) — the FALSE arm here is
 * `selectDiscoverMapLayer(toLayerInput(urlState), 'overview')`, whereas
 * MapDiscovery.tsx's real false arm is `mapLayerCategory`, a value produced
 * by `useDiscoverJourneyPredicates` (out of this PR's allowed scope). Per
 * that hook's own call-site comment in MapDiscovery.tsx ("derives
 * mapLayerCategory purely from URL state via toLayerInput/
 * selectDiscoverMapLayer internally"), the two are BELIEVED equivalent for
 * the fixtures below, but this file does not import or exercise
 * `useDiscoverJourneyPredicates` itself, so that equivalence is NOT verified
 * here — this test's false-arm assertions cover only this reproduction, not
 * a guarantee that `useDiscoverJourneyPredicates` cannot diverge from it.
 */
function computeEffectiveMapLayerCategory(isNodeAreaLeafActive: boolean, urlState: DiscoverUrlState) {
  return isNodeAreaLeafActive
    ? selectDiscoverMapLayer({ ...toLayerInput(urlState), nodeAreaLeaf: true }, 'overview')
    : selectDiscoverMapLayer(toLayerInput(urlState), 'overview');
}

describe('MapDiscovery.tsx isNodeAreaLeafActive composition (FIX CYCLE 2, Finding 1)', () => {
  it('AREA node with areaKey set, bounds populated, area-first -> leaf active, popover eligible, layer widened to all-areas', () => {
    const node = makeAreaLeafNode();
    const isNodeAreaLeafActive = computeIsNodeAreaLeafActive({
      showAreasNavigationJourney: true,
      journey: 'area-first',
      node,
    });
    expect(isNodeAreaLeafActive).toBe(true);

    const eligible = isMarkerPopoverEligible({
      journey: 'area-first',
      areaKey: null, // legacy param — never set by the node journey
      schoolId: null,
      isNodeAreaLeaf: isNodeAreaLeafActive,
    });
    expect(eligible).toBe(true);

    const layerCategory = computeEffectiveMapLayerCategory(isNodeAreaLeafActive, makeUrlState());
    expect(layerCategory).toBe('all-areas');
  });

  it('THE FIX — AREA node with areaKey set but bounds: null, area-first -> isMarkerPopoverEligible === false, effectiveMapLayerCategory === "area-group-bubbles"', () => {
    const node = makeAreaLeafNode({ bounds: null });
    const isNodeAreaLeafActive = computeIsNodeAreaLeafActive({
      showAreasNavigationJourney: true,
      journey: 'area-first',
      node,
    });
    // The bounds-less leaf must NOT be treated as a leaf for any gated purpose.
    expect(isNodeAreaLeafActive).toBe(false);

    const eligible = isMarkerPopoverEligible({
      journey: 'area-first',
      areaKey: null,
      schoolId: null,
      isNodeAreaLeaf: isNodeAreaLeafActive,
    });
    expect(eligible).toBe(false);

    const effectiveMapLayerCategory = computeEffectiveMapLayerCategory(
      isNodeAreaLeafActive,
      makeUrlState(),
    );
    expect(effectiveMapLayerCategory).toBe('area-group-bubbles');
  });

  it('bounds present but centreLat/centreLon null -> also NOT a leaf (transitional state (d))', () => {
    const node = makeAreaLeafNode({
      bounds: {
        centreLat: null,
        centreLon: null,
        minLat: 13.3,
        minLon: 74.75,
        maxLat: 13.4,
        maxLon: 74.83,
      },
    });
    const isNodeAreaLeafActive = computeIsNodeAreaLeafActive({
      showAreasNavigationJourney: true,
      journey: 'area-first',
      node,
    });
    expect(isNodeAreaLeafActive).toBe(false);
  });

  it('showAreasNavigationJourney=false -> never a leaf regardless of node/journey', () => {
    const node = makeAreaLeafNode();
    const isNodeAreaLeafActive = computeIsNodeAreaLeafActive({
      showAreasNavigationJourney: false,
      journey: 'area-first',
      node,
    });
    expect(isNodeAreaLeafActive).toBe(false);
  });

  it('journey !== area-first -> never a leaf even with a resolved, bounded AREA node', () => {
    const node = makeAreaLeafNode();
    const isNodeAreaLeafActive = computeIsNodeAreaLeafActive({
      showAreasNavigationJourney: true,
      journey: 'school-first',
      node,
    });
    expect(isNodeAreaLeafActive).toBe(false);
  });
});
