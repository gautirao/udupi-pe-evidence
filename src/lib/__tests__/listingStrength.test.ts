import { describe, it, expect } from 'vitest';
import { computeListingStrength, type ListingStrengthInput } from '../listingStrength';

// ---------------------------------------------------------------------------
// Issue #1718 — client-side submit-gate mirror. MUST match
// backend/.../listing/workflow/ListingTransitionPolicy.java validateFields():
//   - submittable property type: apartment | house | villa | residential_plot
//   - price > 0 (sale) OR monthlyRent > 0 AND securityDepositMonths present (rent)
//   - >= 3 images, addressConfirmed === true, locality non-blank
//   - apartment: bedrooms + builtArea + builtAreaUnit
//   - house / villa: no extra required fields
//   - residential_plot: landArea + landAreaUnit
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<ListingStrengthInput> = {}): ListingStrengthInput {
  return {
    propertyType: 'apartment',
    listingPurpose: 'sale',
    priceRupees: 5_000_000,
    monthlyRent: null,
    securityDepositMonths: '',
    locality: 'Manipal',
    imageCount: 3,
    addressConfirmed: true,
    locationResolved: true,
    bedrooms: '2',
    builtArea: 1200,
    builtAreaUnit: 'sqft',
    landArea: null,
    landAreaUnit: '',
    ...overrides,
  };
}

describe('computeListingStrength — shared gates', () => {
  it('is submittable when every shared + type gate is met (apartment, sale)', () => {
    const result = computeListingStrength(baseInput());
    expect(result.isSubmittable).toBe(true);
    expect(result.missingItems).toEqual([]);
    expect(result.percent).toBe(100);
  });

  it('fails the price gate when price is 0 or null (sale)', () => {
    const result = computeListingStrength(baseInput({ priceRupees: null }));
    expect(result.isSubmittable).toBe(false);
    expect(result.missingItems).toContain('Add the total price');
  });

  it('requires monthlyRent AND securityDepositMonths for rent', () => {
    const rentMissingDeposit = computeListingStrength(
      baseInput({ listingPurpose: 'rent', priceRupees: null, monthlyRent: 15000, securityDepositMonths: '' }),
    );
    expect(rentMissingDeposit.isSubmittable).toBe(false);
    expect(rentMissingDeposit.missingItems).toContain('Add the monthly rent and security deposit');

    const rentComplete = computeListingStrength(
      baseInput({ listingPurpose: 'rent', priceRupees: null, monthlyRent: 15000, securityDepositMonths: '2' }),
    );
    expect(rentComplete.isSubmittable).toBe(true);
  });

  it('fails when fewer than 3 images', () => {
    const result = computeListingStrength(baseInput({ imageCount: 2 }));
    expect(result.isSubmittable).toBe(false);
    expect(result.missingItems.some((m) => m.includes('3 photos'))).toBe(true);
  });

  it('fails when address is not confirmed', () => {
    const result = computeListingStrength(baseInput({ addressConfirmed: false, locationResolved: false }));
    expect(result.isSubmittable).toBe(false);
    expect(result.missingItems).toContain('Location entered');
    expect(result.missingItems).toContain('Map pin confirmed');
  });

  it('fails when locality is blank', () => {
    const result = computeListingStrength(baseInput({ locality: '   ' }));
    expect(result.isSubmittable).toBe(false);
    expect(result.missingItems).toContain('Add the locality');
  });
});

describe('computeListingStrength — apartment type-specific gate', () => {
  it('requires bedrooms + builtArea + builtAreaUnit', () => {
    const missingBedrooms = computeListingStrength(baseInput({ bedrooms: '' }));
    expect(missingBedrooms.isSubmittable).toBe(false);

    const missingBuiltArea = computeListingStrength(baseInput({ builtArea: null }));
    expect(missingBuiltArea.isSubmittable).toBe(false);

    const missingUnit = computeListingStrength(baseInput({ builtAreaUnit: '' }));
    expect(missingUnit.isSubmittable).toBe(false);

    const complete = computeListingStrength(baseInput());
    expect(complete.isSubmittable).toBe(true);
  });
});

describe('computeListingStrength — house/villa (no extra required fields)', () => {
  it('is submittable for house with only the shared gates met', () => {
    const result = computeListingStrength(
      baseInput({ propertyType: 'house', bedrooms: '', builtArea: null, builtAreaUnit: '' }),
    );
    expect(result.isSubmittable).toBe(true);
  });

  it('is submittable for villa with only the shared gates met', () => {
    const result = computeListingStrength(
      baseInput({ propertyType: 'villa', bedrooms: '', builtArea: null, builtAreaUnit: '' }),
    );
    expect(result.isSubmittable).toBe(true);
  });
});

describe('computeListingStrength — residential_plot type-specific gate', () => {
  it('requires landArea + landAreaUnit (mirrors "land")', () => {
    const missingArea = computeListingStrength(
      baseInput({ propertyType: 'residential_plot', bedrooms: '', builtArea: null, builtAreaUnit: '', landArea: null, landAreaUnit: '' }),
    );
    expect(missingArea.isSubmittable).toBe(false);
    expect(missingArea.missingItems).toContain('Add the plot area');

    const complete = computeListingStrength(
      baseInput({ propertyType: 'residential_plot', bedrooms: '', builtArea: null, builtAreaUnit: '', landArea: 5, landAreaUnit: 'cent' }),
    );
    expect(complete.isSubmittable).toBe(true);
  });

  // Issue #2040 (AC3, second layer) — regression-lock: the plot branch of the
  // type-specific gate must ignore builtArea/builtAreaUnit ENTIRELY. A
  // fully-populated builtArea must neither satisfy nor interact with the
  // plot gate — only landArea/landAreaUnit matter. This is the
  // listingStrength.ts half of AC3; the rendered-DOM half lives in
  // ResidentialListingForm.fieldGrouping.test.tsx's plot negative case.
  it('AC3 — ignores builtArea/builtAreaUnit entirely; only landArea/landAreaUnit gate the type-specific requirement', () => {
    // builtArea/builtAreaUnit fully present but landArea missing -> still NOT
    // submittable, and the missing-item is the plot-specific label, never a
    // built-up-area one. Proves builtArea cannot substitute for landArea.
    const builtAreaPresentButLandMissing = computeListingStrength(
      baseInput({
        propertyType: 'residential_plot',
        bedrooms: '',
        builtArea: 1200,
        builtAreaUnit: 'sqft',
        landArea: null,
        landAreaUnit: '',
      }),
    );
    expect(builtAreaPresentButLandMissing.isSubmittable).toBe(false);
    expect(builtAreaPresentButLandMissing.missingItems).toContain('Add the plot area');
    expect(builtAreaPresentButLandMissing.missingItems.some((m) => /built-up area/i.test(m))).toBe(false);

    // landArea present, builtArea absent entirely -> submittable (mirrors the
    // existing "complete" case above, restated explicitly for the invariant).
    const landOnlyComplete = computeListingStrength(
      baseInput({
        propertyType: 'residential_plot',
        bedrooms: '',
        builtArea: null,
        builtAreaUnit: '',
        landArea: 5,
        landAreaUnit: 'cent',
      }),
    );
    expect(landOnlyComplete.isSubmittable).toBe(true);

    // Gate shape for plot: shared gates (6) + one plot-specific typeSpecific
    // gate (7) — never a distinct 'builtArea' gate key.
    expect(landOnlyComplete.gates).toHaveLength(7);
    expect(landOnlyComplete.gates.some((g) => g.key === 'builtArea')).toBe(false);
    const plotTypeSpecific = landOnlyComplete.gates.find((g) => g.key === 'typeSpecific');
    expect(plotTypeSpecific?.targetFieldId).toBe('plotArea');
  });
});

describe('computeListingStrength — issue #2040 AC4: precise apartment unmet-gate labelling', () => {
  it('names ONLY built-up area when bedrooms are already set', () => {
    const result = computeListingStrength(baseInput({ bedrooms: '2', builtArea: null, builtAreaUnit: '' }));
    const typeSpecific = result.gates.find((g) => g.key === 'typeSpecific');
    expect(typeSpecific?.label).toBe('Add built-up area');
    expect(typeSpecific?.label).not.toMatch(/bedrooms/i);
    expect(typeSpecific?.targetFieldId).toBe('builtArea');
  });

  it('mirror case — names ONLY bedrooms when built-up area is already set', () => {
    const result = computeListingStrength(baseInput({ bedrooms: '', builtArea: 1200, builtAreaUnit: 'sqft' }));
    const typeSpecific = result.gates.find((g) => g.key === 'typeSpecific');
    expect(typeSpecific?.label).toBe('Add bedrooms (BHK)');
    expect(typeSpecific?.label).not.toMatch(/built-up area/i);
    expect(typeSpecific?.targetFieldId).toBe('bedrooms');
  });

  it('names BOTH when both are missing', () => {
    const result = computeListingStrength(baseInput({ bedrooms: '', builtArea: null, builtAreaUnit: '' }));
    const typeSpecific = result.gates.find((g) => g.key === 'typeSpecific');
    expect(typeSpecific?.label).toBe('Add bedrooms (BHK) and built-up area');
  });
});

describe('computeListingStrength — issue #2040 AC7: apartment gate-count invariant', () => {
  it('apartment always has exactly 7 gates, regardless of which fields are met', () => {
    const complete = computeListingStrength(baseInput());
    expect(complete.gates).toHaveLength(7);
    expect(complete.gates.map((g) => g.key)).toEqual([
      'type', 'price', 'locality', 'images', 'locationEntered', 'pinConfirmed', 'typeSpecific',
    ]);

    const missingBuiltArea = computeListingStrength(baseInput({ builtArea: null }));
    expect(missingBuiltArea.gates).toHaveLength(7);
    expect(missingBuiltArea.isSubmittable).toBe(false);
    expect(missingBuiltArea.percent).toBeLessThan(100);
  });
});

describe('computeListingStrength — issue #1722 correction #4: two location gates', () => {
  it('locationEntered is met once resolved (search/browser pick) even before the pin is confirmed', () => {
    const result = computeListingStrength(baseInput({ addressConfirmed: false, locationResolved: true }));
    const locationEntered = result.gates.find((g) => g.key === 'locationEntered');
    const pinConfirmed = result.gates.find((g) => g.key === 'pinConfirmed');
    expect(locationEntered?.met).toBe(true);
    expect(pinConfirmed?.met).toBe(false);
    expect(result.isSubmittable).toBe(false);
  });

  it('locationEntered is also met once addressConfirmed is true, even if locationResolved was never locally re-derived (reload-safe)', () => {
    const result = computeListingStrength(baseInput({ addressConfirmed: true, locationResolved: false }));
    const locationEntered = result.gates.find((g) => g.key === 'locationEntered');
    const pinConfirmed = result.gates.find((g) => g.key === 'pinConfirmed');
    expect(locationEntered?.met).toBe(true);
    expect(pinConfirmed?.met).toBe(true);
  });

  it('isSubmittable stays keyed on addressConfirmed alone — matches the backend gate exactly', () => {
    // locationResolved true but pin never confirmed -> still not submittable.
    const notYetPinned = computeListingStrength(baseInput({ addressConfirmed: false, locationResolved: true }));
    expect(notYetPinned.isSubmittable).toBe(false);

    // addressConfirmed true -> submittable regardless of locationResolved.
    const pinned = computeListingStrength(baseInput({ addressConfirmed: true, locationResolved: false }));
    expect(pinned.isSubmittable).toBe(true);
  });
});

describe('computeListingStrength — percent', () => {
  it('is between 0 and 100 and increases as gates are satisfied', () => {
    const empty = computeListingStrength(
      baseInput({ priceRupees: null, imageCount: 0, addressConfirmed: false, locationResolved: false, locality: '', bedrooms: '', builtArea: null, builtAreaUnit: '' }),
    );
    const full = computeListingStrength(baseInput());
    expect(empty.percent).toBeLessThan(full.percent);
    expect(full.percent).toBe(100);
    expect(empty.percent).toBeGreaterThanOrEqual(0);
  });
});
