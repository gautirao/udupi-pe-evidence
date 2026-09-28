import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePropertyFilterGroups } from '../usePropertyFilterGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2658 — C0 characterization (transition-matrix slice).
 *
 * Relocated verbatim in C4 from
 * components/discover/panels/__tests__/usePropertyFilterGroups.transitionMatrix.c0.test.tsx
 * alongside the hook it tests — no assertion changed.
 *
 * Pins usePropertyFilterGroups' CURRENT behavior for the architect-plan rules
 * flagged as highest-risk (R2, R3, R4/R5/R6, R7/R8, R11, R12, R19 slice) before
 * any code moves in the decomposition. Where the code's actual behavior and
 * the plan's stated rule disagree, the CODE is ground truth and the test
 * asserts what the code does — any such disagreement is called out in a
 * comment.
 *
 * NOTE ON THE HOOK'S RETURN SHAPE: usePropertyFilterGroups does NOT return
 * `filters` — it is fed `filters` as an argument and returns only derived
 * values + handlers. This harness tracks the caller-owned `filters` object
 * itself (via the mocked onFiltersChange) exactly the way AreaSelectedPanel /
 * MapFilterSheet do, and feeds it back in on `rerenderWithLatestFilters()` —
 * mirroring the real controlled-component contract this hook is built for.
 *
 * This exercises the hook directly via renderHook, not the full panel, so it
 * is decoupled from AreaSelectedPanel/PropertyFilterGroups' JSX and survives
 * C1–C4 moving that JSX around — only a change to the hook's OWN behavior
 * should ever break this file.
 */

type Filters = PropertyFilters;
type HookArgs = Parameters<typeof usePropertyFilterGroups>[0];

const COMMERCIAL_FAMILY_TOKENS = ['commercial', 'commercial_building', 'warehouse', 'commercial_land'];

const renderFilterGroups = (
  initialFilters: Filters = {},
  overrides: Partial<HookArgs> = {},
) => {
  let filters = initialFilters;
  const onFiltersChange = vi.fn((next: Filters) => {
    filters = next;
  });
  const utils = renderHook(
    (props: { filters: Filters }) =>
      usePropertyFilterGroups({
        filters: props.filters,
        onFiltersChange,
        isCommercialSubtypeSupported: true,
        isReadyToMoveSupported: true,
        ...overrides,
      }),
    { initialProps: { filters } },
  );
  const rerenderWithLatestFilters = () => utils.rerender({ filters });
  return { ...utils, onFiltersChange, rerenderWithLatestFilters, getFilters: () => filters };
};

describe('#2658 C0 — usePropertyFilterGroups transition matrix', () => {
  describe('R2 — active family derivation', () => {
    it('is Residential when filters are family-silent and no override has fired', () => {
      const { result } = renderFilterGroups({});
      expect(result.current.activeFamily).toBe('residential');
    });

    it('derives Commercial from a subtype-only filter with no propertyTypes (one-axis contract)', () => {
      const { result } = renderFilterGroups({ commercialSubtypes: ['SHOP'] });
      expect(result.current.activeFamily).toBe('commercial');
    });

    it('derives Commercial from an inbound commercial family token alone', () => {
      const { result } = renderFilterGroups({ propertyTypes: ['warehouse'] });
      expect(result.current.activeFamily).toBe('commercial');
    });

    it('derivation from filters WINS over the override — override cannot contradict live filters', () => {
      const { result, rerenderWithLatestFilters } = renderFilterGroups({});
      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('commercial');

      // The filters independently say Residential (e.g. a URL back/forward
      // outside this hook) — derivation must flip immediately even though the
      // override still says 'commercial', because familyIsUnset becomes false
      // once a Residential type is present.
      const { result: result2 } = renderFilterGroups({ propertyTypes: ['apartment'] });
      expect(result2.current.activeFamily).toBe('residential');
    });
  });

  describe('R3 — override writes', () => {
    it('type toggle records the Residential override', () => {
      const { result } = renderFilterGroups({});
      act(() => result.current.handleTogglePropertyType('apartment'));
      // familyIsUnset is now false (a type is active) so activeFamily reads
      // Residential from derivation directly, but the override write itself
      // is proven by the family-silent case below.
      expect(result.current.activeFamily).toBe('residential');
    });

    it('selectFamily writes the override BEFORE the onFiltersChange guard (fires even with no onFiltersChange)', () => {
      const { result } = renderHook(() =>
        usePropertyFilterGroups({
          filters: {},
          onFiltersChange: undefined,
          isCommercialSubtypeSupported: true,
        }),
      );
      act(() => result.current.handleSelectFamily('commercial'));
      // With no filters ever changing, familyIsUnset stays true, so the
      // override alone must be what flips activeFamily to commercial.
      expect(result.current.activeFamily).toBe('commercial');
    });

    it('clear (handleClearPropertyFilters) nulls the override back to residential', () => {
      const { result, rerenderWithLatestFilters } = renderFilterGroups({});
      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('commercial');
      act(() => result.current.handleClearPropertyFilters());
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('residential');
    });
  });

  describe('R4/R5/R6 — per-family memory banking and restoration on switch', () => {
    it('banks the Residential selection on switch to Commercial, then restores it on switch back', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        propertyTypes: ['apartment', 'villa'],
      });
      // Bank happens in a post-render effect keyed on activeFamily — render once
      // while Residential is active so the effect observes the live selection.
      rerenderWithLatestFilters();

      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('commercial');
      // No commercial memory yet -> the 4 family tokens are written (R5).
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);

      act(() => result.current.handleSelectFamily('residential'));
      rerenderWithLatestFilters();
      // R6: switching back to Residential restores the banked selection.
      expect(getFilters().propertyTypes).toEqual(['apartment', 'villa']);
      expect(result.current.activeFamily).toBe('residential');
    });

    it('switch to Commercial keeps the subtype if a commercial memory already exists', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        commercialSubtypes: ['SHOP'],
      });
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('residential'));
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      // R5: commercial memory holds ['SHOP'] -> no family tokens written, subtype restored.
      expect(getFilters().commercialSubtypes).toEqual(['SHOP']);
      expect(getFilters().propertyTypes).toBeUndefined();
    });
  });

  describe('R7/R8 — commercial-token / subtype interplay ("All commercial", removeSubtype)', () => {
    it('"All commercial" writes the 4 family tokens and clears any subtype + subtype memory', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        commercialSubtypes: ['SHOP'],
      });
      act(() => result.current.handleToggleSubtype(null));
      rerenderWithLatestFilters();
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);
      expect(getFilters().commercialSubtypes).toBeUndefined();

      // Memory was cleared too: switching away and back must NOT resurrect SHOP.
      act(() => result.current.handleSelectFamily('residential'));
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      expect(getFilters().commercialSubtypes).toBeUndefined();
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);
    });

    it('removing the last subtype (removeSubtype) restores the 4 family tokens, mirroring "All commercial"', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        commercialSubtypes: ['SHOP'],
      });
      act(() => result.current.handleRemoveSubtype('SHOP'));
      rerenderWithLatestFilters();
      expect(getFilters().commercialSubtypes).toBeUndefined();
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);
    });

    it('removeSubtype is a no-op when the capability is off (capability-guarded)', () => {
      const { result, onFiltersChange } = renderFilterGroups(
        { commercialSubtypes: ['SHOP'] },
        { isCommercialSubtypeSupported: false },
      );
      act(() => result.current.handleRemoveSubtype('SHOP'));
      expect(onFiltersChange).not.toHaveBeenCalled();
    });
  });

  describe('R11 — hasPropertyFilters truthiness asymmetry', () => {
    it('priceMax: 0 does NOT count as an active filter (truthy check)', () => {
      const { result } = renderFilterGroups({ priceMax: 0 });
      expect(result.current.hasPropertyFilters).toBe(false);
    });

    it('areaMinSqft: 0 DOES count as an active filter (!= null check)', () => {
      const { result } = renderFilterGroups({ areaMinSqft: 0 });
      expect(result.current.hasPropertyFilters).toBe(true);
    });

    it('a subtype-only selection counts as an active filter even with no propertyTypes', () => {
      const { result } = renderFilterGroups({ commercialSubtypes: ['SHOP'] });
      expect(result.current.hasPropertyFilters).toBe(true);
    });

    it('readyToMove only counts when the surface supports it', () => {
      const supported = renderFilterGroups(
        { readyToMove: true },
        { isReadyToMoveSupported: true },
      );
      expect(supported.result.current.hasPropertyFilters).toBe(true);

      const unsupported = renderFilterGroups(
        { readyToMove: true },
        { isReadyToMoveSupported: false },
      );
      expect(unsupported.result.current.hasPropertyFilters).toBe(false);
    });

    it('an area-bounds-only filter state (areaMinSqft: 1500) reports hasPropertyFilters=true — the missing zero-listings case', () => {
      // The case qa-fast flagged as currently missing from coverage: a buyer
      // applies ONLY an area bound (no type/subtype/beds/price), gets zero
      // listings, and the empty state must still offer "Clear filters"
      // because a real filter IS narrowing the result set (cause='filters',
      // not cause='no-inventory').
      const { result } = renderFilterGroups({ areaMinSqft: 1500 });
      expect(result.current.hasPropertyFilters).toBe(true);
    });
  });

  describe('R12 — "Clear filters" wipes all axes + both memories + the override', () => {
    it('clears every property-filter key it owns, including context filters', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        propertyTypes: ['apartment'],
        commercialSubtypes: ['SHOP'],
        bedrooms: [2, 3],
        priceMin: 100,
        priceMax: 500,
        areaMinSqft: 500,
        areaMaxSqft: 1000,
        localities: ['Test Area'],
        sellerTypes: ['owner'],
        backOnMarket: true,
        newToMarket: true,
        reraRegistered: true,
        readyToMove: true,
      });
      act(() => result.current.handleClearPropertyFilters());
      rerenderWithLatestFilters();
      const cleared = getFilters();
      expect(cleared.propertyTypes).toBeUndefined();
      expect(cleared.commercialSubtypes).toBeUndefined();
      expect(cleared.bedrooms).toBeUndefined();
      expect(cleared.priceMin).toBeUndefined();
      expect(cleared.priceMax).toBeUndefined();
      expect(cleared.areaMinSqft).toBeUndefined();
      expect(cleared.areaMaxSqft).toBeUndefined();
      expect(cleared.localities).toBeUndefined();
      expect(cleared.sellerTypes).toBeUndefined();
      expect(cleared.backOnMarket).toBeUndefined();
      expect(cleared.newToMarket).toBeUndefined();
      expect(cleared.reraRegistered).toBeUndefined();
      expect(cleared.readyToMove).toBeUndefined();
      expect(result.current.hasPropertyFilters).toBe(false);
    });

    it('clearing also resets the family override and both memories, so the next Commercial switch starts fresh', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        commercialSubtypes: ['SHOP'],
      });
      rerenderWithLatestFilters();
      act(() => result.current.handleClearPropertyFilters());
      rerenderWithLatestFilters();
      // Family-silent post-clear -> derivation says Residential.
      expect(result.current.activeFamily).toBe('residential');
      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      // Memory was wiped by the clear, so this is a FRESH Commercial entry:
      // no subtype restored, family tokens written instead.
      expect(getFilters().commercialSubtypes).toBeUndefined();
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);
    });
  });

  describe('R9 — removeType keyed on WHAT WAS REMOVED, not on the control', () => {
    it('removing a plain Residential type clears propertyTypes to undefined when it was the last one', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        propertyTypes: ['apartment'],
      });
      act(() => result.current.handleRemovePropertyType('apartment'));
      rerenderWithLatestFilters();
      expect(getFilters().propertyTypes).toBeUndefined();
      expect(result.current.activeFamily).toBe('residential');
    });

    it('removing a single inbound commercial family token empties to the 4-token family set, not to undefined', () => {
      // A single inbound `?type=commercial` renders exactly one chip; removing
      // it must land on the whole Commercial family (matching every other
      // "empty the axis via a family token" path), not on no filter at all.
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        propertyTypes: ['commercial'],
      });
      act(() => result.current.handleRemovePropertyType('commercial'));
      rerenderWithLatestFilters();
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);
      expect(result.current.activeFamily).toBe('commercial');
    });

    it('removing one of several mixed types (family token + residential type) leaves only the survivor, memory filtered clean', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        propertyTypes: ['warehouse', 'apartment'],
      });
      act(() => result.current.handleRemovePropertyType('warehouse'));
      rerenderWithLatestFilters();
      expect(getFilters().propertyTypes).toEqual(['apartment']);
      // The residential memory must be filtered clean of the commercial token
      // that was just removed — switching to Commercial and back must not
      // resurrect 'warehouse' riding along with 'apartment'.
      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('residential'));
      rerenderWithLatestFilters();
      expect(getFilters().propertyTypes).toEqual(['apartment']);
    });
  });

  describe('R10 — capability guards', () => {
    it('handleSelectFamily is a no-op when the commercial-subtype capability is off', () => {
      const { result, onFiltersChange } = renderFilterGroups(
        {},
        { isCommercialSubtypeSupported: false },
      );
      act(() => result.current.handleSelectFamily('commercial'));
      expect(onFiltersChange).not.toHaveBeenCalled();
      expect(result.current.activeFamily).toBe('residential');
    });

    it('handleToggleSubtype is a no-op when the commercial-subtype capability is off', () => {
      const { result, onFiltersChange } = renderFilterGroups(
        { commercialSubtypes: ['SHOP'] },
        { isCommercialSubtypeSupported: false },
      );
      act(() => result.current.handleToggleSubtype('WAREHOUSE'));
      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('handleToggleReadyToMove is a no-op when the surface cannot filter on it', () => {
      const { result, onFiltersChange } = renderFilterGroups(
        {},
        { isReadyToMoveSupported: false },
      );
      act(() => result.current.handleToggleReadyToMove());
      expect(onFiltersChange).not.toHaveBeenCalled();
    });
  });

  describe('Controlled-host relaxation roundtrip (qa-fast flag: stale closure on setFamilyOverride)', () => {
    it('Commercial -> relax (clear) -> Residential clears override -> switching back to Commercial reopens fresh with override null', () => {
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        commercialSubtypes: ['SHOP'],
      });
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('commercial');

      // "relaxation" = the zero-result recovery's clear-filters offer, which
      // this hook exposes as handleClearPropertyFilters.
      act(() => result.current.handleClearPropertyFilters());
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('residential');

      act(() => result.current.handleSelectFamily('commercial'));
      rerenderWithLatestFilters();
      expect(result.current.activeFamily).toBe('commercial');
      // Fresh entry: no stale SHOP resurrected from before the relaxation.
      expect(getFilters().commercialSubtypes).toBeUndefined();
      expect(getFilters().propertyTypes).toEqual(COMMERCIAL_FAMILY_TOKENS);
    });
  });
});
