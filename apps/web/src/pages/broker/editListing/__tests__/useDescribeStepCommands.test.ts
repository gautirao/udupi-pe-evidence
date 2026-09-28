/**
 * useDescribeStepCommands — Issue #1838 PR F hook-level unit tests.
 *
 * Split out of the former useEditListingCommands.test.ts (PR C commit 3),
 * covering exactly the describe-step (step 1) slice of that suite: the
 * changePropertyType commercial-subtype reset, and the dimensions
 * setLandArea/setBuiltArea/setCarpetArea "producer independence" checks
 * (real producer wired up by this hook, not the plain vi.fn()s DescribeStep's
 * own unit tests stub in).
 *
 * Composes the real domain field hooks exactly as EditListingForm.tsx does,
 * minus useEditListingNavigation/useToast/router — this hook needs neither
 * directly (advanceAfterSave/toast are passed in as plain vi.fn()s; only the
 * step-1 payload build itself is characterized here, not navigation).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBaseFields } from '../useBaseFields';
import { useSharedFields } from '../useSharedFields';
import { useCommercialFields } from '../useCommercialFields';
import { useRentFields } from '../useRentFields';
import { useAgriFields } from '../useAgriFields';
import { useResidentialFields } from '../useResidentialFields';
import { useDescribeStepCommands } from '../useDescribeStepCommands';
import { selectCommercialSubtype, selectEditCtx } from '../editListingSelectors';

function useTestHarness() {
  const base = useBaseFields();
  const shared = useSharedFields();
  const commercial = useCommercialFields();
  const rent = useRentFields();
  const agri = useAgriFields();
  const residential = useResidentialFields();

  const { propertyType, listingPurpose } = base.values;
  const commercialSubtype = selectCommercialSubtype(propertyType, commercial.values.explicitSubtype);
  const editCtxFull = selectEditCtx(propertyType, listingPurpose, commercialSubtype);

  const commands = useDescribeStepCommands({
    base, shared, commercial, rent, agri, residential,
    ui: {
      setLandAreaUnitError: vi.fn(),
      setBuiltAreaUnitError: vi.fn(),
      setTitleManuallyEdited: vi.fn(),
    },
    editCtxFull,
    isAgriListing: propertyType === 'agricultural_land',
    advanceAfterSave: vi.fn(),
    // Cast justified: only mutate/isPending are read by this hook, matching
    // the mocking convention already used for the same type elsewhere.
    updateListing: { mutate: vi.fn(), isPending: false } as unknown as Parameters<
      typeof useDescribeStepCommands
    >[0]['updateListing'],
    toast: vi.fn(),
  });

  return { base, shared, commercial, commands, commercialSubtype };
}

describe('useDescribeStepCommands', () => {
  describe('commands.basics.changePropertyType', () => {
    it('resets the explicit commercial subtype choice when switching away from commercial', () => {
      const { result } = renderHook(() => useTestHarness());

      act(() => {
        result.current.base.setters.setPropertyType('commercial');
      });
      act(() => {
        result.current.commercial.setters.setExplicitSubtype('SHOP');
      });
      expect(result.current.commercial.values.explicitSubtype).toBe('SHOP');

      act(() => {
        result.current.commands.basics.changePropertyType('apartment');
      });

      expect(result.current.base.values.propertyType).toBe('apartment');
      expect(result.current.commercial.values.explicitSubtype).toBe('');
    });
  });

  // Issue #1838 PR E/F — "producer independence" check: DescribeStep's own
  // unit tests stub commands.dimensions.setXArea as plain vi.fn()s, so they
  // structurally cannot catch a hook-side miswiring (e.g. setBuiltArea
  // actually calling setLandArea/setLandAreaUnit). These tests exercise the
  // REAL producer wired up by useDescribeStepCommands, asserting the
  // combined (value, unit) setter lands in the correct pair of base/shared
  // fields.
  describe('commands.dimensions — producer independence', () => {
    it('setLandArea(value, unit) sets base.values.landArea and landAreaUnit', () => {
      const { result } = renderHook(() => useTestHarness());

      act(() => {
        result.current.commands.dimensions.setLandArea(10, 'acre');
      });

      expect(result.current.base.values.landArea).toBe(10);
      expect(result.current.base.values.landAreaUnit).toBe('acre');
    });

    it('setBuiltArea(value, unit) sets base.values.builtArea and builtAreaUnit', () => {
      const { result } = renderHook(() => useTestHarness());

      act(() => {
        result.current.commands.dimensions.setBuiltArea(1200, 'sqft');
      });

      expect(result.current.base.values.builtArea).toBe(1200);
      expect(result.current.base.values.builtAreaUnit).toBe('sqft');
    });

    it('setCarpetArea(value, unit) sets shared.values.carpetArea and carpetAreaUnit', () => {
      const { result } = renderHook(() => useTestHarness());

      act(() => {
        result.current.commands.dimensions.setCarpetArea(500, 'sqft');
      });

      expect(result.current.shared.values.carpetArea).toBe(500);
      expect(result.current.shared.values.carpetAreaUnit).toBe('sqft');
    });
  });
});
