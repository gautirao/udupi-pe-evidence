// Issue #2708 — the ONE canonical Buy/Rent intent-transition rule, shared by List
// (city.ts's setIntent) and Map (MapFilterSheet's handleSelectIntent). See
// intentTransition.ts's header for the rule itself.
import { describe, expect, it } from 'vitest';
import { applyIntentTransition, type IntentTransitionFilters } from '../intentTransition';

describe('applyIntentTransition', () => {
  it('Buy → Rent: drops residential_plot when it is the only selected type', () => {
    const result = applyIntentTransition({ propertyTypes: ['residential_plot'] }, 'rent');
    expect(result.propertyTypes).toBeUndefined();
  });

  it('Buy → Rent: drops only residential_plot out of a mixed selection', () => {
    const result = applyIntentTransition(
      { propertyTypes: ['apartment', 'residential_plot', 'house'] },
      'rent',
    );
    expect(result.propertyTypes).toEqual(['apartment', 'house']);
  });

  it('Buy → Rent: leaves a selection with no residential_plot unchanged', () => {
    const result = applyIntentTransition({ propertyTypes: ['apartment', 'house'] }, 'rent');
    expect(result.propertyTypes).toEqual(['apartment', 'house']);
  });

  it('Buy → Rent: undefined propertyTypes stays undefined', () => {
    const result = applyIntentTransition({} as IntentTransitionFilters, 'rent');
    expect(result.propertyTypes).toBeUndefined();
  });

  it('Rent → Buy: propertyTypes are left completely untouched (Rent-only drop)', () => {
    const result = applyIntentTransition(
      { propertyTypes: ['apartment', 'residential_plot'] },
      'buy',
    );
    expect(result.propertyTypes).toEqual(['apartment', 'residential_plot']);
  });

  it('always resets priceMin/priceMax, both directions', () => {
    const toRent = applyIntentTransition(
      { priceMin: 1_000_000, priceMax: 5_000_000 },
      'rent',
    );
    expect(toRent.priceMin).toBeUndefined();
    expect(toRent.priceMax).toBeUndefined();

    const toBuy = applyIntentTransition(
      { priceMin: 1_000_000, priceMax: 5_000_000 },
      'buy',
    );
    expect(toBuy.priceMin).toBeUndefined();
    expect(toBuy.priceMax).toBeUndefined();
  });

  it('preserves every other field on the input object untouched', () => {
    const result = applyIntentTransition(
      {
        propertyTypes: ['apartment'],
        priceMin: 1,
        priceMax: 2,
        bedrooms: [2, 3],
        sellerTypes: ['owner'],
      } as { propertyTypes?: string[]; priceMin?: number; priceMax?: number } & Record<
        string,
        unknown
      >,
      'rent',
    );
    expect(result.bedrooms).toEqual([2, 3]);
    expect(result.sellerTypes).toEqual(['owner']);
  });
});
