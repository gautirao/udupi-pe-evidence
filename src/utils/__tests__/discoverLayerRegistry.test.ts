import { describe, it, expect, vi, afterEach } from 'vitest';
import * as discoverPanelState from '../discoverPanelState';
import { derivePanelContent } from '../discoverPanelState';
import type { DiscoverUrlState } from '../../hooks/useDiscoverUrlState';
import {
  toLayerInput,
  computeDiscoverLayer,
  applyCityChangeReset,
  applyStartOverReset,
  clearRegionScopeForAgri,
  fallbackInvalidSelection,
  PANEL_DERIVATION_FIELDS,
  type DiscoverLayerInput,
  type DiscoverLayerSelection,
  type PanelDerivationField,
} from '../discoverLayerRegistry';

// ─── Structural divergence guard: compile-time typed assertion ────────────────
//
// `journey` is hoisted out of `DiscoverLayerSelection` onto `DiscoverLayerInput.journey`
// directly, so the selection-surface comparison excludes it from PANEL_DERIVATION_FIELDS.
type SelectionDerivationFields = Exclude<PanelDerivationField, 'journey'>;
type KeysEqual<A extends PropertyKey, B extends PropertyKey> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
// If `DiscoverLayerSelection`'s keys ever diverge from PANEL_DERIVATION_FIELDS (minus
// 'journey'), this line fails to typecheck — assigning `true` to a type that resolves
// to `never`/`false`. A new read-field added to derivePanelContent (or removed from
// DiscoverLayerSelection) without updating PANEL_DERIVATION_FIELDS is a compile error.
type AssertSelectionFieldsMatchPanelDerivation =
  KeysEqual<keyof DiscoverLayerSelection, SelectionDerivationFields> extends true ? true : never;
const selectionFieldsMatchPanelDerivation: AssertSelectionFieldsMatchPanelDerivation = true;
void selectionFieldsMatchPanelDerivation;

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
    intent: 'buy',
    scope: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Parity matrix: computeDiscoverLayer(toLayerInput(state)) === derivePanelContent(state) ──

// PARITY_CORPUS — module-scoped so it is shared by both the parity matrix below
// and the runtime Proxy access-guard test (structural divergence guard section).
const parityGroup = { directionKey: 'N', distanceBandKey: '10_25' };

const PARITY_CORPUS: Array<[string, Partial<DiscoverUrlState>]> = [
    // guided-entry
    ['guided-entry (no journey)', {}],
    ['guided-entry (no journey, q set)', { q: 'beach house' }],

    // agri-first
    ['agri-landing', { journey: 'agri-first' }],
    ['agri-selected (areaKey)', { journey: 'agri-first', areaKey: 'IN|KA|Udupi|Manipal' }],
    [
      'agri-group-selected (region+maxKm)',
      { journey: 'agri-first', selectedRegion: 'N', selectedMaxKm: 25 },
    ],
    [
      'agri-group-peek (region+maxKm+listing)',
      {
        journey: 'agri-first',
        selectedRegion: 'N',
        selectedMaxKm: 25,
        selectedListing: 'listing-1',
      },
    ],
    [
      'agri-group-locality (region+maxKm+locality)',
      {
        journey: 'agri-first',
        selectedRegion: 'N',
        selectedMaxKm: 25,
        selectedLocality: 'Manipal',
      },
    ],
    ['agri-group-selected (legacy selectedGroup)', { journey: 'agri-first', selectedGroup: parityGroup }],
    [
      'agri-selected wins over selectedGroup',
      { journey: 'agri-first', areaKey: 'IN|KA|Udupi|Manipal', selectedGroup: parityGroup },
    ],
    [
      'agri stray schoolId does not fall through',
      { journey: 'agri-first', schoolId: 'sch-1' },
    ],
    [
      'agri stray groupId does not fall through',
      { journey: 'agri-first', groupId: 'coastal-homes' },
    ],

    // school-first
    ['school-browse', { journey: 'school-first' }],
    ['school-group-areas (groupId)', { journey: 'school-first', groupId: 'zone-a' }],
    ['school-group-areas whitespace groupId falls to browse', { journey: 'school-first', groupId: '   ' }],
    ['schools-in-area (areaKey)', { journey: 'school-first', areaKey: 'IN|KA|Udupi|Manipal' }],
    ['school-selected (schoolId)', { journey: 'school-first', schoolId: 'sch-1' }],
    [
      'area-school-combined (school-first, both present)',
      { journey: 'school-first', areaKey: 'IN|KA|Udupi|Manipal', schoolId: 'sch-1' },
    ],

    // area-first
    ['area-groups-landing', { journey: 'area-first' }],
    [
      'area-groups-landing (groupId set, no groupResults)',
      { journey: 'area-first', groupId: 'zone-a' },
    ],
    [
      'area-groups-landing (whitespace groupId, no groupResults)',
      { journey: 'area-first', groupId: '   ' },
    ],
    [
      'area-group-results (groupResults+groupId+!schoolId)',
      { journey: 'area-first', groupId: 'zone-a', groupResults: true },
    ],
    [
      'area-group-results whitespace groupId falls to landing',
      { journey: 'area-first', groupId: '   ', groupResults: true },
    ],
    [
      'area-group-results groupResults without groupId falls to landing',
      { journey: 'area-first', groupResults: true },
    ],
    [
      'area-group-results stray schoolId blocks it',
      { journey: 'area-first', groupId: 'zone-a', groupResults: true, schoolId: 'sch-1' },
    ],
    ['area-selected', { journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal' }],
    [
      'scope=north with area-selected -> same as scope=null (scope is inert on layer derivation)',
      { journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal', scope: 'north' },
    ],
    [
      'area-first schoolPicking -> schools-in-area',
      { journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal', schoolPicking: true },
    ],
    [
      'area-school-combined (area-first, both present, schoolPicking irrelevant)',
      { journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal', schoolId: 'sch-1', schoolPicking: true },
    ],

    // journey-absent cold-load
    ['cold-load schoolId -> school-selected', { schoolId: 'sch-1' }],
    ['cold-load areaKey -> area-selected', { areaKey: 'IN|KA|Udupi|Manipal' }],
    ['cold-load groupId -> area-groups-landing', { groupId: 'zone-a' }],
    [
      'cold-load area+school -> area-school-combined',
      { areaKey: 'IN|KA|Udupi|Manipal', schoolId: 'sch-1' },
    ],
];

describe('computeDiscoverLayer — parity with derivePanelContent', () => {
  it.each(PARITY_CORPUS)('%s', (_label, overrides) => {
    const state = makeState(overrides);
    expect(computeDiscoverLayer(toLayerInput(state))).toBe(derivePanelContent(state));
  });
});

// ─── Delegation guard: fails if computeDiscoverLayer stops calling derivePanelContent ──

describe('computeDiscoverLayer — delegation', () => {
  it('calls derivePanelContent rather than re-implementing branch logic', () => {
    const spy = vi.spyOn(discoverPanelState, 'derivePanelContent');
    const state = makeState({ journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal' });

    const result = computeDiscoverLayer(toLayerInput(state));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toBe('area-selected');
  });
});

// ─── Structural divergence guard: runtime Proxy access-guard ─────────────────
//
// Wraps every PARITY_CORPUS fixture in a Proxy whose get-trap THROWS on any
// property access outside PANEL_DERIVATION_FIELDS, then runs derivePanelContent
// against the guarded object. If derivePanelContent is ever changed to read a
// zeroed/placeholder field (e.g. intent, filters, city, viewport, radiusKm, q) —
// which `computeDiscoverLayer`'s reconstruction fills with fixed placeholder
// values — this test fails loudly instead of silently returning a wrong layer.
describe('Structural divergence guard — runtime Proxy access-guard', () => {
  it('derivePanelContent never reads a DiscoverUrlState field outside PANEL_DERIVATION_FIELDS', () => {
    const allowed = new Set<string>(PANEL_DERIVATION_FIELDS);

    for (const [label, overrides] of PARITY_CORPUS) {
      const state = makeState(overrides);
      const guarded = new Proxy(state, {
        get(target, prop, receiver) {
          if (typeof prop === 'string' && !allowed.has(prop)) {
            throw new Error(
              `derivePanelContent read disallowed field "${prop}" for fixture "${label}" — ` +
                `update PANEL_DERIVATION_FIELDS (discoverLayerRegistry.ts) if this is intentional.`,
            );
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      expect(() => derivePanelContent(guarded)).not.toThrow();
    }
  });
});

// ─── Guard reducers ───────────────────────────────────────────────────────────

function makeInput(overrides: Partial<DiscoverLayerInput> = {}): DiscoverLayerInput {
  return {
    scope: { region: null },
    journey: 'area-first',
    selection: {
      areaKey: 'IN|KA|Udupi|Manipal',
      schoolId: 'sch-1',
      groupId: 'zone-a',
      schoolPicking: true,
      groupResults: true,
      selectedGroup: { directionKey: 'N', distanceBandKey: '10_25' },
      selectedRegion: 'N',
      selectedMaxKm: 25,
      selectedListing: 'listing-1',
      selectedLocality: 'Manipal',
    },
    ...overrides,
  };
}

describe('applyCityChangeReset', () => {
  // Issue #1745 P2 RECONCILE PROOF: applyCityChangeReset now mirrors the real
  // useDiscoverUrlState.changeCity EXACTLY. changeCity does NOT delete schoolPicking
  // or listing/selectedListing on city switch, so this reducer must PRESERVE them
  // (P1's version incorrectly cleared both — that was the divergence this slice fixes).
  it('clears journey, groupId, region-scoped selection fields, and scope', () => {
    const input = makeInput();
    const result = applyCityChangeReset(input);

    expect(result.journey).toBeNull();
    expect(result.scope.region).toBeNull();
    expect(result.selection.areaKey).toBeNull();
    expect(result.selection.groupId).toBeNull();
    expect(result.selection.groupResults).toBeUndefined();
    expect(result.selection.selectedGroup).toBeNull();
    expect(result.selection.selectedRegion).toBeNull();
    expect(result.selection.selectedMaxKm).toBeNull();
    expect(result.selection.selectedLocality).toBeNull();
  });

  it('preserves schoolId (mirrors useDiscoverUrlState.changeCity, which does not clear schoolId)', () => {
    const input = makeInput();
    const result = applyCityChangeReset(input);
    expect(result.selection.schoolId).toBe('sch-1');
  });

  it('preserves schoolPicking (Issue #1745 P2 reconcile — real changeCity does not delete schoolPicking; was incorrectly cleared in P1)', () => {
    const input = makeInput();
    const result = applyCityChangeReset(input);
    expect(result.selection.schoolPicking).toBe(true);
  });

  it('preserves selectedListing (Issue #1745 P2 reconcile — real changeCity does not delete the `listing` param; was incorrectly cleared in P1)', () => {
    const input = makeInput();
    const result = applyCityChangeReset(input);
    expect(result.selection.selectedListing).toBe('listing-1');
  });

  it('does not mutate the input object', () => {
    const input = makeInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    applyCityChangeReset(input);
    expect(input).toEqual(snapshot);
  });
});

describe('applyStartOverReset', () => {
  it('resets to the full neutral landing layer input, including schoolId', () => {
    const input = makeInput();
    const result = applyStartOverReset(input);

    expect(result).toEqual({
      scope: { region: null },
      journey: null,
      selection: {
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
      },
    });
  });

  it('does not mutate the input object', () => {
    const input = makeInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    applyStartOverReset(input);
    expect(input).toEqual(snapshot);
  });

  it('is idempotent', () => {
    const input = makeInput();
    const once = applyStartOverReset(input);
    const twice = applyStartOverReset(once);
    expect(twice).toEqual(once);
  });
});

describe('clearRegionScopeForAgri', () => {
  // Issue #1745 P2 RECONCILE PROOF: the real useDiscoverUrlState.clearRegionAndMaxKm
  // never deletes the `scope` URL param (scope is orthogonal to the agri-only
  // region/maxKm corridor model), so scope.region must be PRESERVED here (P1's
  // version incorrectly cleared it — that was the divergence this slice fixes).
  it('clears the four agri selection fields, preserving scope.region and everything else', () => {
    const input = makeInput({ scope: { region: 'north' } });
    const result = clearRegionScopeForAgri(input);

    expect(result.scope.region).toBe('north');
    expect(result.selection.selectedRegion).toBeNull();
    expect(result.selection.selectedMaxKm).toBeNull();
    expect(result.selection.selectedListing).toBeNull();
    expect(result.selection.selectedLocality).toBeNull();

    // Preserved fields
    expect(result.journey).toBe(input.journey);
    expect(result.selection.areaKey).toBe(input.selection.areaKey);
    expect(result.selection.groupId).toBe(input.selection.groupId);
    expect(result.selection.schoolId).toBe(input.selection.schoolId);
    expect(result.selection.schoolPicking).toBe(input.selection.schoolPicking);
    expect(result.selection.groupResults).toBe(input.selection.groupResults);
    expect(result.selection.selectedGroup).toBe(input.selection.selectedGroup);
  });

  it('is a no-op when the fields are already null', () => {
    const input = makeInput({
      selection: {
        ...makeInput().selection,
        selectedRegion: null,
        selectedMaxKm: null,
        selectedListing: null,
        selectedLocality: null,
      },
    });
    const result = clearRegionScopeForAgri(input);
    expect(result.selection.selectedRegion).toBeNull();
    expect(result.selection.selectedMaxKm).toBeNull();
    expect(result.selection.selectedListing).toBeNull();
    expect(result.selection.selectedLocality).toBeNull();
  });

  it('is idempotent', () => {
    const input = makeInput();
    const once = clearRegionScopeForAgri(input);
    const twice = clearRegionScopeForAgri(once);
    expect(twice).toEqual(once);
  });

  it('does not mutate the input object', () => {
    const input = makeInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    clearRegionScopeForAgri(input);
    expect(input).toEqual(snapshot);
  });
});

describe('fallbackInvalidSelection', () => {
  it('drops areaKey when not in the validity set, preserving schoolId/groupId', () => {
    const input = makeInput();
    const result = fallbackInvalidSelection(input, {
      validAreaKeys: new Set(['some-other-area']),
    });
    expect(result.selection.areaKey).toBeNull();
    expect(result.selection.schoolId).toBe('sch-1');
    expect(result.selection.groupId).toBe('zone-a');
  });

  it('drops schoolId when not in the validity set, falling back to area-level (areaKey retained)', () => {
    const input = makeInput();
    const result = fallbackInvalidSelection(input, {
      validSchoolIds: new Set(['some-other-school']),
    });
    expect(result.selection.schoolId).toBeNull();
    expect(result.selection.areaKey).toBe('IN|KA|Udupi|Manipal');

    // Falls back to schools-in-area via computeDiscoverLayer, not a crash/undefined state.
    expect(computeDiscoverLayer(result)).toBe('schools-in-area');
  });

  it('drops groupId when not in the validity set', () => {
    const input = makeInput();
    const result = fallbackInvalidSelection(input, {
      validGroupIds: new Set(['some-other-group']),
    });
    expect(result.selection.groupId).toBeNull();
  });

  it('keeps ids when they are present in the validity set', () => {
    const input = makeInput();
    const result = fallbackInvalidSelection(input, {
      validAreaKeys: new Set(['IN|KA|Udupi|Manipal']),
      validSchoolIds: new Set(['sch-1']),
      validGroupIds: new Set(['zone-a']),
    });
    expect(result.selection.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.selection.schoolId).toBe('sch-1');
    expect(result.selection.groupId).toBe('zone-a');
  });

  it('keeps ids when no validity set is supplied for that field (undefined = no check)', () => {
    const input = makeInput();
    const result = fallbackInvalidSelection(input, {});
    expect(result.selection.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.selection.schoolId).toBe('sch-1');
    expect(result.selection.groupId).toBe('zone-a');
  });

  it('never throws, even with empty selection and empty validity sets', () => {
    const emptyInput = makeInput({
      selection: {
        areaKey: null,
        schoolId: null,
        groupId: null,
        selectedGroup: null,
      },
    });
    expect(() => fallbackInvalidSelection(emptyInput, {})).not.toThrow();
    expect(() =>
      fallbackInvalidSelection(emptyInput, {
        validAreaKeys: new Set(),
        validSchoolIds: new Set(),
        validGroupIds: new Set(),
      }),
    ).not.toThrow();
  });

  it('does not mutate the input object', () => {
    const input = makeInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    fallbackInvalidSelection(input, { validAreaKeys: new Set(['some-other-area']) });
    expect(input).toEqual(snapshot);
  });
});
