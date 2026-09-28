import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { hasPropertyFilters } from '../hasPropertyFilters';
import { clearPropertyFilters } from '../clearPropertyFilters';
import { isCommercialFromFilters, isFamilyUnset, resolveActiveFamily } from '../familyResolution';
import {
  computeAllCommercialPatch,
  computeRemoveSubtypePatch,
  computeSwitchToCommercialPatch,
  computeSwitchToResidentialPatch,
  computeToggleSubtypePatch,
} from '../familySwitchTransitions';

/**
 * Issue #2658 (C1) — differential test.
 *
 * usePropertyFilterGroups is NOT yet rewired to delegate to these selectors
 * (that wiring is deferred to a follow-up commit — see this issue's C1
 * commit message for why). This test instead proves the new pure selectors
 * produce IDENTICAL output to the CURRENT hook's live emissions for the same
 * inputs/actions, so the eventual delegation is a mechanical no-op rather
 * than a re-derivation that could silently drift from what the hook actually
 * does today.
 */

type Filters = PropertyFilters;

const renderFilterGroups = (initialFilters: Filters = {}) => {
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
      }),
    { initialProps: { filters } },
  );
  const rerenderWithLatestFilters = () => utils.rerender({ filters });
  return { ...utils, onFiltersChange, rerenderWithLatestFilters, getFilters: () => filters };
};

describe('#2658 C1 — buyer-filters selectors vs. the live hook (differential)', () => {
  describe('hasPropertyFilters', () => {
    const cases: Filters[] = [
      {},
      { priceMax: 0 },
      { areaMinSqft: 0 },
      { areaMinSqft: 1500 },
      { commercialSubtypes: ['SHOP'] },
      { propertyTypes: ['apartment'], bedrooms: [2] },
      { readyToMove: true },
    ];

    it.each(cases)('matches the live hook for filters=%j', (filters) => {
      const { result } = renderFilterGroups(filters);
      expect(hasPropertyFilters(filters)).toBe(result.current.hasPropertyFilters);
    });
  });

  describe('clearPropertyFilters', () => {
    it('matches the live hook emission for a fully-populated filter set', () => {
      const initial: Filters = {
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
      };
      const { result, getFilters } = renderFilterGroups(initial);
      act(() => result.current.handleClearPropertyFilters());
      expect(clearPropertyFilters(initial)).toEqual(getFilters());
    });
  });

  describe('familyResolution', () => {
    it('isCommercialFromFilters matches commercialFromFilters for a subtype-only selection', () => {
      const filters: Filters = { commercialSubtypes: ['SHOP'] };
      const { result } = renderFilterGroups(filters);
      expect(isCommercialFromFilters(filters)).toBe(result.current.commercialFromFilters);
    });

    it('isCommercialFromFilters matches commercialFromFilters for a family-token selection', () => {
      const filters: Filters = { propertyTypes: ['warehouse'] };
      const { result } = renderFilterGroups(filters);
      expect(isCommercialFromFilters(filters)).toBe(result.current.commercialFromFilters);
    });

    it('isCommercialFromFilters matches commercialFromFilters for a Residential-only selection', () => {
      const filters: Filters = { propertyTypes: ['apartment'] };
      const { result } = renderFilterGroups(filters);
      expect(isCommercialFromFilters(filters)).toBe(result.current.commercialFromFilters);
    });

    it('resolveActiveFamily matches activeFamily across the override x derivation matrix', () => {
      const matrix: {
        filters: Filters;
        override: 'residential' | 'commercial' | null;
      }[] = [
        { filters: {}, override: null },
        { filters: {}, override: 'commercial' },
        { filters: {}, override: 'residential' },
        { filters: { propertyTypes: ['apartment'] }, override: 'commercial' },
        { filters: { commercialSubtypes: ['SHOP'] }, override: 'residential' },
      ];
      for (const { filters, override } of matrix) {
        const commercialFromFilters = isCommercialFromFilters(filters);
        const familyIsUnset = isFamilyUnset(filters);
        const expected = resolveActiveFamily({
          commercialFromFilters,
          familyIsUnset,
          familyOverride: override,
        });
        // Reconstruct the same expression the hook uses inline, since the hook
        // does not expose familyOverride/familyIsUnset directly.
        const hookEquivalent: 'residential' | 'commercial' = commercialFromFilters
          ? 'commercial'
          : familyIsUnset && override !== null
            ? override
            : 'residential';
        expect(expected).toBe(hookEquivalent);
      }
    });
  });

  describe('familySwitchTransitions', () => {
    it('computeSwitchToCommercialPatch (no memory) matches the live hook — writes the 4 family tokens', () => {
      const filters: Filters = { propertyTypes: ['apartment', 'villa'] };
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups(filters);
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('commercial'));
      expect(computeSwitchToCommercialPatch(filters, undefined)).toEqual(getFilters());
    });

    it('computeSwitchToCommercialPatch (with memory) matches the live hook — restores the subtype', () => {
      // Bank a commercial memory first via the real hook, then compare the
      // NEXT switch-to-commercial emission against the pure selector fed the
      // same memory value.
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups({
        commercialSubtypes: ['SHOP'],
      });
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('residential'));
      rerenderWithLatestFilters();
      const residentialFilters = getFilters();
      act(() => result.current.handleSelectFamily('commercial'));
      expect(computeSwitchToCommercialPatch(residentialFilters, ['SHOP'])).toEqual(getFilters());
    });

    it('computeSwitchToResidentialPatch matches the live hook — strips family tokens, memory as fallback', () => {
      const filters: Filters = { propertyTypes: ['warehouse'] };
      const { result, rerenderWithLatestFilters, getFilters } = renderFilterGroups(filters);
      rerenderWithLatestFilters();
      act(() => result.current.handleSelectFamily('residential'));
      expect(computeSwitchToResidentialPatch(filters, undefined)).toEqual(getFilters());
    });

    it('computeAllCommercialPatch matches the live hook\'s "All commercial" emission', () => {
      const filters: Filters = { commercialSubtypes: ['SHOP'] };
      const { result, getFilters } = renderFilterGroups(filters);
      act(() => result.current.handleToggleSubtype(null));
      expect(computeAllCommercialPatch(filters)).toEqual(getFilters());
    });

    it('computeToggleSubtypePatch matches the live hook for an add and a remove-last', () => {
      const addFilters: Filters = { commercialSubtypes: ['SHOP'] };
      const add = renderFilterGroups(addFilters);
      act(() => add.result.current.handleToggleSubtype('WAREHOUSE'));
      expect(computeToggleSubtypePatch(addFilters, 'WAREHOUSE')).toEqual(add.getFilters());

      const removeLastFilters: Filters = { commercialSubtypes: ['SHOP'] };
      const removeLast = renderFilterGroups(removeLastFilters);
      act(() => removeLast.result.current.handleToggleSubtype('SHOP'));
      expect(computeToggleSubtypePatch(removeLastFilters, 'SHOP')).toEqual(removeLast.getFilters());
    });

    it('computeRemoveSubtypePatch matches the live hook\'s removeSubtype emission', () => {
      const filters: Filters = { commercialSubtypes: ['SHOP'] };
      const { result, getFilters } = renderFilterGroups(filters);
      act(() => result.current.handleRemoveSubtype('SHOP'));
      expect(computeRemoveSubtypePatch(filters, 'SHOP')).toEqual(getFilters());
    });
  });
});
