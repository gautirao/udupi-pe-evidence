/**
 * Issue #1745 Batch B map-hierarchy fix — per-hierarchy-level unit coverage of
 * `selectDiscoverMapLayer` (src/utils/discoverLayerRegistry.ts).
 *
 * THE BUG this rule fixes: at the journeyless city landing (no journey,
 * scope=null) MapDiscovery.tsx's `overviewAreas` fell through to `liveAreas`
 * (every area with listingCount > 0 — ~100 individual pills) instead of the
 * ~4-8 macro-region bubbles the right-panel summary shows. Root cause: the
 * existing group-bubble derivation was gated on a journey being active.
 *
 * This table locks down BOTH:
 *   (a) the two NEW rows this fix adds (journeyless landing × scope), and
 *   (b) that every PRE-EXISTING journey/drill-down row's resolved kind is
 *       UNCHANGED — i.e. behavior-preservation for Batch B's presentational
 *       work and every prior Discover slice.
 *
 * `selectDiscoverMapLayer` composes with `computeDiscoverLayer`
 * (which delegates to `derivePanelContent`) for the panel axis — it must
 * never re-implement journey/precedence routing itself. This file asserts
 * outcomes, not internals, so it cannot be gamed by an implementation that
 * happens to return the right value without actually composing.
 */
import { describe, it, expect } from 'vitest';
import {
  selectDiscoverMapLayer,
  type DiscoverLayerInput,
  type DiscoverLayerSelection,
  type DiscoverMapLayerKind,
} from '@/utils/discoverLayerRegistry';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: {
  journey?: DiscoverJourney | null;
  scope?: string | null;
  selection?: Partial<DiscoverLayerSelection>;
} = {}): DiscoverLayerInput {
  const selection: DiscoverLayerSelection = {
    areaKey: null,
    schoolId: null,
    groupId: null,
    schoolPicking: undefined,
    groupResults: undefined,
    selectedGroup: null,
    selectedRegion: null,
    selectedMaxKm: null,
    selectedListing: null,
    selectedLocality: null,
    ...overrides.selection,
  };
  return {
    scope: { region: overrides.scope ?? null },
    journey: overrides.journey ?? null,
    selection,
  };
}

describe('selectDiscoverMapLayer — per-hierarchy-level parity table', () => {
  // ─── NEW rows (Issue #1745 Batch B — the actual bug fix) ──────────────────

  it('journeyless landing, scope=null, overview zoom → macro-region-bubbles (THE FIX)', () => {
    expect(selectDiscoverMapLayer(makeInput(), 'overview')).toBe('macro-region-bubbles');
  });

  it('journeyless landing, scope=null, detail zoom → zoom-gated', () => {
    expect(selectDiscoverMapLayer(makeInput(), 'detail')).toBe('zoom-gated');
  });

  it('journeyless landing, scope=<groupId>, overview zoom → region-zone-areas', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ scope: 'university-belt' }), 'overview'),
    ).toBe('region-zone-areas');
  });

  it('journeyless landing, scope=<groupId>, detail zoom → zoom-gated', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ scope: 'university-belt' }), 'detail'),
    ).toBe('zoom-gated');
  });

  it('forcing zoomBucket="overview" yields the zoom-INDEPENDENT category regardless of intended real zoom', () => {
    // This is the pattern MapDiscovery.tsx uses to decide whether raw listing
    // markers should stay suppressed even if the user has manually zoomed in.
    const input = makeInput({ scope: 'university-belt' });
    expect(selectDiscoverMapLayer(input, 'overview')).toBe('region-zone-areas');
  });

  // ─── Cold-load journeyless states that must NOT resolve to guided-entry ───
  // (derivePanelContent infers a different panel state, so the journey==null
  // fast-path in selectDiscoverMapLayer must not fire for these.)

  it('cold-load schoolId only (no journey) → all-areas (not macro-region-bubbles)', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ selection: { schoolId: 'sch-1' } }), 'overview'),
    ).toBe('all-areas');
  });

  it('cold-load areaKey only (no journey) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ selection: { areaKey: 'IN|KA|Udupi|Manipal' } }), 'overview'),
    ).toBe('all-areas');
  });

  it('cold-load groupId only (no journey) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ selection: { groupId: 'coastal-homes' } }), 'overview'),
    ).toBe('all-areas');
  });

  // ─── Area-first journey (pre-existing — must be unchanged) ────────────────

  it('area-first landing (no group/area/school) → area-group-bubbles (pre-existing, unchanged)', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'area-first' }), 'overview'),
    ).toBe('area-group-bubbles');
  });

  it('area-first landing, detail zoom → zoom-gated', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'area-first' }), 'detail'),
    ).toBe('zoom-gated');
  });

  it('area-first + groupId (group selected, no area) → all-areas (dimmed via focusedGroupAreas prop)', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'area-first', selection: { groupId: 'coastal-homes' } }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  it('area-first + areaKey (area selected) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'area-first', selection: { areaKey: 'IN|KA|Udupi|Manipal' } }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  it('area-first + areaKey + schoolId (combined) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({
          journey: 'area-first',
          selection: { areaKey: 'IN|KA|Udupi|Manipal', schoolId: 'sch-1' },
        }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  // ─── School-first journey (pre-existing — must be unchanged; the intentional
  // schools+zones-together landing mix is preserved since it also uses the
  // 'area-group-bubbles' kind, unchanged from before this fix) ──────────────

  it('school-first landing (no group/area/school) → area-group-bubbles (pre-existing, unchanged — schools+zones mix preserved)', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'school-first' }), 'overview'),
    ).toBe('area-group-bubbles');
  });

  it('school-first + groupId (zone selected) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'school-first', selection: { groupId: 'zone-1' } }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  it('school-first + areaKey (area selected, no school) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'school-first', selection: { areaKey: 'IN|KA|Udupi|Manipal' } }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  it('school-first + schoolId (school selected) → all-areas', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'school-first', selection: { schoolId: 'sch-1' } }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  // ─── Agri-first journey (pre-existing — must be unchanged; NO residential
  // area pills ever leak into agri states — AC5) ─────────────────────────────

  it('agri-first landing (no region/area/locality/group) → agri-corridor-bubbles (pre-existing, unchanged)', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'agri-first' }), 'overview'),
    ).toBe('agri-corridor-bubbles');
  });

  it('agri-first landing, detail zoom → zoom-gated', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'agri-first' }), 'detail'),
    ).toBe('zoom-gated');
  });

  it('agri-first + areaKey (area selected) → agri-drilldown (never all-areas — no residential leak)', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'agri-first', selection: { areaKey: 'IN|KA|Udupi|Manipal' } }),
        'overview',
      ),
    ).toBe('agri-drilldown');
  });

  it('agri-first + selectedRegion + selectedMaxKm (corridor + distance tier) → agri-drilldown', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({
          journey: 'agri-first',
          selection: { selectedRegion: 'N', selectedMaxKm: 25 },
        }),
        'overview',
      ),
    ).toBe('agri-drilldown');
  });

  it('agri-first + selectedLocality (locality drill-down) → agri-drilldown', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({ journey: 'agri-first', selection: { selectedLocality: 'some-locality' } }),
        'overview',
      ),
    ).toBe('agri-drilldown');
  });

  it('agri-first + legacy selectedGroup → agri-drilldown', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({
          journey: 'agri-first',
          selection: { selectedGroup: { directionKey: 'N', distanceBandKey: '10_25' } },
        }),
        'overview',
      ),
    ).toBe('agri-drilldown');
  });

  // ─── Journey precedence over scope (mandatory — any active journey IGNORES
  // scope; scope only gates the journeyless state) ───────────────────────────

  it('journey precedence: agri-first landing + scope set → agri-corridor-bubbles (scope IGNORED)', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'agri-first', scope: 'university-belt' }), 'overview'),
    ).toBe('agri-corridor-bubbles');
  });

  it('journey precedence: area-first landing + scope set → area-group-bubbles (scope IGNORED)', () => {
    expect(
      selectDiscoverMapLayer(makeInput({ journey: 'area-first', scope: 'university-belt' }), 'overview'),
    ).toBe('area-group-bubbles');
  });

  it('journey precedence: school-first + schoolId + scope set → all-areas (scope IGNORED)', () => {
    expect(
      selectDiscoverMapLayer(
        makeInput({
          journey: 'school-first',
          scope: 'university-belt',
          selection: { schoolId: 'sch-1' },
        }),
        'overview',
      ),
    ).toBe('all-areas');
  });

  // ─── Return-type exhaustiveness sanity (compile-time) ─────────────────────

  it('every DiscoverMapLayerKind branch is reachable', () => {
    const seen = new Set<DiscoverMapLayerKind>([
      selectDiscoverMapLayer(makeInput(), 'overview'), // macro-region-bubbles
      selectDiscoverMapLayer(makeInput({ scope: 'x' }), 'overview'), // region-zone-areas
      selectDiscoverMapLayer(makeInput({ journey: 'area-first' }), 'overview'), // area-group-bubbles
      selectDiscoverMapLayer(makeInput({ journey: 'agri-first' }), 'overview'), // agri-corridor-bubbles
      selectDiscoverMapLayer(
        makeInput({ journey: 'agri-first', selection: { areaKey: 'a' } }),
        'overview',
      ), // agri-drilldown
      selectDiscoverMapLayer(
        makeInput({ journey: 'area-first', selection: { areaKey: 'a' } }),
        'overview',
      ), // all-areas
      selectDiscoverMapLayer(makeInput(), 'detail'), // zoom-gated
    ]);
    expect(seen).toEqual(
      new Set<DiscoverMapLayerKind>([
        'macro-region-bubbles',
        'region-zone-areas',
        'area-group-bubbles',
        'agri-corridor-bubbles',
        'agri-drilldown',
        'all-areas',
        'zoom-gated',
      ]),
    );
  });
});
