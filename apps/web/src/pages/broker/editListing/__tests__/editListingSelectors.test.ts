/**
 * editListingSelectors — Issue #1838 PR F unit tests.
 *
 * Every selector here is a pure, React-free function — no renderHook, no
 * MemoryRouter, no field-hook composition. This is the direct-input
 * characterization layer for the derived gates that used to be inline
 * expressions in useEditListingCommands.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  selectStep1Complete, selectStep2Complete, selectStep3Complete, selectWizardSteps,
  selectCommercialSubtype, selectEditCtx, selectIsSubmittable, selectStatusBadgeVariant,
  selectTitleLocalityWarning, selectRequiredFieldsComplete, selectAllConditionsMet,
} from '../editListingSelectors';

describe('selectStep1Complete', () => {
  it('is true for a rent listing with propertyType + positive monthlyRent + locality', () => {
    expect(selectStep1Complete({
      listingPurpose: 'rent', propertyType: 'apartment', monthlyRent: '15000', priceRupees: null, locality: 'Manipal',
    })).toBe(true);
  });

  it('is false for a rent listing with monthlyRent "0"', () => {
    expect(selectStep1Complete({
      listingPurpose: 'rent', propertyType: 'apartment', monthlyRent: '0', priceRupees: null, locality: 'Manipal',
    })).toBe(false);
  });

  it('is true for a sale listing with propertyType + positive price + locality (ignores monthlyRent)', () => {
    expect(selectStep1Complete({
      listingPurpose: 'sale', propertyType: 'apartment', monthlyRent: '', priceRupees: 5000000, locality: 'Manipal',
    })).toBe(true);
  });

  it('is false for a sale listing with priceRupees null', () => {
    expect(selectStep1Complete({
      listingPurpose: 'sale', propertyType: 'apartment', monthlyRent: '', priceRupees: null, locality: 'Manipal',
    })).toBe(false);
  });
});

describe('selectStep2Complete / selectStep3Complete', () => {
  it('step2 is a passthrough of canSubmitImages', () => {
    expect(selectStep2Complete(true)).toBe(true);
    expect(selectStep2Complete(false)).toBe(false);
  });

  it('step3 is true only when addressConfirmed is exactly true', () => {
    expect(selectStep3Complete(true)).toBe(true);
    expect(selectStep3Complete(false)).toBe(false);
    expect(selectStep3Complete(undefined)).toBe(false);
  });
});

describe('selectWizardSteps', () => {
  const BASE_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Review & Submit'] as const;
  const AGRI_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Draw Boundary', 'Review & Submit'] as const;

  it('builds a 4-entry array for non-agri listings with the terminal step always incomplete', () => {
    const steps = selectWizardSteps({
      isAgriListing: false, wizardSteps: BASE_STEPS,
      step1Complete: true, step2Complete: true, step3Complete: true,
    });
    expect(steps).toEqual([
      { label: 'Describe', isComplete: true },
      { label: 'Add Photos', isComplete: true },
      { label: 'Pin Location', isComplete: true },
      { label: 'Review & Submit', isComplete: false },
    ]);
  });

  it('builds a 5-entry array for agri listings, inserting an always-incomplete Draw Boundary step', () => {
    const steps = selectWizardSteps({
      isAgriListing: true, wizardSteps: AGRI_STEPS,
      step1Complete: false, step2Complete: false, step3Complete: false,
    });
    expect(steps).toEqual([
      { label: 'Describe', isComplete: false },
      { label: 'Add Photos', isComplete: false },
      { label: 'Pin Location', isComplete: false },
      { label: 'Draw Boundary', isComplete: false },
      { label: 'Review & Submit', isComplete: false },
    ]);
  });
});

describe('selectCommercialSubtype / selectEditCtx', () => {
  it('returns undefined when propertyType is empty', () => {
    expect(selectCommercialSubtype('', '')).toBeUndefined();
  });

  it('derives SHOP from an explicit commercial choice', () => {
    expect(selectCommercialSubtype('commercial', 'SHOP')).toBe('SHOP');
  });

  it('selectEditCtx exposes isRent + fieldVisible from the shared makeUpdatePayloadCtx helper', () => {
    const ctx = selectEditCtx('apartment', 'rent', undefined);
    expect(ctx.isRent).toBe(true);
    expect(typeof ctx.fieldVisible).toBe('function');
  });
});

describe('selectIsSubmittable / selectStatusBadgeVariant', () => {
  it('DRAFT and REJECTED are submittable; other statuses are not', () => {
    expect(selectIsSubmittable('DRAFT')).toBe(true);
    expect(selectIsSubmittable('REJECTED')).toBe(true);
    expect(selectIsSubmittable('PUBLISHED')).toBe(false);
  });

  it('maps status to the expected Badge variant', () => {
    expect(selectStatusBadgeVariant('REJECTED')).toBe('destructive');
    expect(selectStatusBadgeVariant('DRAFT')).toBe('secondary');
    expect(selectStatusBadgeVariant('PUBLISHED')).toBe('outline');
  });
});

describe('selectTitleLocalityWarning', () => {
  it('shows the warning when the title was manually edited and omits the confirmed locality', () => {
    const result = selectTitleLocalityWarning({
      titleManuallyEdited: true, confirmedLocality: 'Kaup, Udupi', title: 'My custom title',
    });
    expect(result.confirmedLocalityShort).toBe('kaup');
    expect(result.titleIncludesLocality).toBe(false);
    expect(result.showTitleLocalityWarning).toBe(true);
  });

  it('does not show the warning when the title includes the confirmed locality', () => {
    const result = selectTitleLocalityWarning({
      titleManuallyEdited: true, confirmedLocality: 'Kaup, Udupi', title: 'Property in Kaup',
    });
    expect(result.showTitleLocalityWarning).toBe(false);
  });

  it('does not show the warning when the title was never manually edited', () => {
    const result = selectTitleLocalityWarning({
      titleManuallyEdited: false, confirmedLocality: 'Kaup, Udupi', title: 'Something else entirely',
    });
    expect(result.showTitleLocalityWarning).toBe(false);
  });

  it('does not show the warning when no locality has been confirmed yet', () => {
    const result = selectTitleLocalityWarning({
      titleManuallyEdited: true, confirmedLocality: '', title: 'Something else entirely',
    });
    expect(result.showTitleLocalityWarning).toBe(false);
  });
});

describe('selectRequiredFieldsComplete / selectAllConditionsMet', () => {
  it('uses monthlyRent for rent listings and priceRupees for sale listings (isRent, not listingPurpose)', () => {
    expect(selectRequiredFieldsComplete({
      isRent: true, monthlyRent: '15000', priceRupees: null, propertyType: 'apartment', locality: 'Manipal',
    })).toBe(true);
    expect(selectRequiredFieldsComplete({
      isRent: false, monthlyRent: '', priceRupees: 5000000, propertyType: 'apartment', locality: 'Manipal',
    })).toBe(true);
  });

  // #2859 B4 (csv205 LG.derive) — a blank locality makes the required-fields term false for BOTH
  // purposes; the same input with a locality is true (same-it control). NOTE: the client check is
  // `!!locality`, so whitespace-only is NOT claimed here (deliberately not pinned either way);
  // rejecting blank/whitespace is the server's guardCompleteness rule (backend slice, LTPT).
  it('#2859 LG.derive: an empty locality makes requiredFieldsComplete false for sale and rent; a filled locality makes it true', () => {
    const sale = { isRent: false, monthlyRent: '', priceRupees: 5000000, propertyType: 'house' as const };
    const rent = { isRent: true, monthlyRent: '15000', priceRupees: null, propertyType: 'apartment' as const };

    expect(selectRequiredFieldsComplete({ ...sale, locality: '' })).toBe(false);
    expect(selectRequiredFieldsComplete({ ...rent, locality: '' })).toBe(false);
    expect(selectRequiredFieldsComplete({ ...sale, locality: 'Manipal' })).toBe(true);
    expect(selectRequiredFieldsComplete({ ...rent, locality: 'Manipal' })).toBe(true);
  });

  it('selectAllConditionsMet ANDs every term, including the title/locality warning negation', () => {
    expect(selectAllConditionsMet({
      canSubmitImages: true, addressConfirmed: true, requiredFieldsComplete: true, showTitleLocalityWarning: false,
    })).toBe(true);
    expect(selectAllConditionsMet({
      canSubmitImages: true, addressConfirmed: true, requiredFieldsComplete: true, showTitleLocalityWarning: true,
    })).toBe(false);
    expect(selectAllConditionsMet({
      canSubmitImages: false, addressConfirmed: true, requiredFieldsComplete: true, showTitleLocalityWarning: false,
    })).toBe(false);
  });
});
