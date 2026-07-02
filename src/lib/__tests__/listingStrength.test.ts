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
