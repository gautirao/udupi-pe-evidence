/**
 * Issue #2018 (slice 2) — pure label derivation and filter application for the
 * relaxation rows. Tested directly because it is framework-agnostic string and
 * object logic; the component test covers the wiring.
 */
import { describe, it, expect } from 'vitest';
import { relaxationLabel, applyRelaxationPreview } from '../relaxationCopy';
import type { RelaxationPreview } from '@/hooks/useRelaxationPreviews';

const preview = (p: Partial<RelaxationPreview> & Pick<RelaxationPreview, 'kind'>): RelaxationPreview => ({
  resultingCount: 1,
  ...p,
});

describe('relaxationLabel', () => {
  it('names the proposed maximum price in the same format the banner uses', () => {
    expect(
      relaxationLabel(preview({ kind: 'PRICE_MAX', priceMax: 6_000_000 }), {}, 'buy'),
    ).toBe('Increase maximum price to ₹60 L');
  });

  it('names the possession constraint the way the active-filter summary names it', () => {
    // "Ready to move" for buy, "Available now" for rent — matching
    // summariseActiveFilters, so the row and the banner cannot disagree.
    expect(relaxationLabel(preview({ kind: 'READY_TO_MOVE', readyToMove: false }), {}, 'buy'))
      .toBe('Remove Ready to move');
    expect(relaxationLabel(preview({ kind: 'READY_TO_MOVE', readyToMove: false }), {}, 'rent'))
      .toBe('Remove Available now');
  });

  it('names the bedroom count being ADDED, not the whole resulting set', () => {
    expect(
      relaxationLabel(
        preview({ kind: 'BEDROOMS', bedrooms: [2, 3] }),
        { bedrooms: [3] },
        'buy',
      ),
    ).toBe('Include 2 BHK');
  });

  it('reads 4 as "4+", because that is what 4 means in the filter vocabulary', () => {
    expect(
      relaxationLabel(
        preview({ kind: 'BEDROOMS', bedrooms: [4, 5] }),
        { bedrooms: [5] },
        'buy',
      ),
    ).toBe('Include 4+ BHK');
  });

  it('says the bedroom filter is being dropped when the offer is empty', () => {
    expect(
      relaxationLabel(preview({ kind: 'BEDROOMS', bedrooms: [] }), { bedrooms: [3] }, 'buy'),
    ).toBe('Accept any number of bedrooms');
  });

  it('says the property-type filter is being dropped when the offer is empty', () => {
    expect(
      relaxationLabel(preview({ kind: 'PROPERTY_TYPES', propertyTypes: [] }), {}, 'buy'),
    ).toBe('Include every property type');
  });
});

describe('applyRelaxationPreview', () => {
  const ACTIVE = {
    priceMax: 5_000_000,
    bedrooms: [3],
    readyToMove: true,
    propertyTypes: ['villa' as const],
    city: 'bangalore',
  };

  it('changes ONLY the price ceiling', () => {
    expect(applyRelaxationPreview(ACTIVE, preview({ kind: 'PRICE_MAX', priceMax: 6_000_000 })))
      .toEqual({ ...ACTIVE, priceMax: 6_000_000 });
  });

  it('clears the possession constraint rather than pinning it to false', () => {
    // A lingering `readyToMove: false` would stay in the URL and in the
    // banner's filter summary, describing a constraint that no longer applies.
    const next = applyRelaxationPreview(ACTIVE, preview({ kind: 'READY_TO_MOVE', readyToMove: false }));
    expect(next.readyToMove).toBeUndefined();
    expect(next).toEqual({ ...ACTIVE, readyToMove: undefined });
  });

  it('replaces the bedroom set with the offered one', () => {
    expect(applyRelaxationPreview(ACTIVE, preview({ kind: 'BEDROOMS', bedrooms: [2, 3] })))
      .toEqual({ ...ACTIVE, bedrooms: [2, 3] });
  });

  it('clears rather than emptying a list filter', () => {
    expect(applyRelaxationPreview(ACTIVE, preview({ kind: 'BEDROOMS', bedrooms: [] })).bedrooms)
      .toBeUndefined();
    expect(
      applyRelaxationPreview(ACTIVE, preview({ kind: 'PROPERTY_TYPES', propertyTypes: [] }))
        .propertyTypes,
    ).toBeUndefined();
  });

  it('never touches city, purpose-adjacent or geography filters', () => {
    const withGeo = { ...ACTIVE, polygon: [[1, 2]] as [number, number][], localities: ['x'] };
    for (const p of [
      preview({ kind: 'PRICE_MAX', priceMax: 6_000_000 }),
      preview({ kind: 'READY_TO_MOVE', readyToMove: false }),
      preview({ kind: 'BEDROOMS', bedrooms: [2, 3] }),
      preview({ kind: 'PROPERTY_TYPES', propertyTypes: [] }),
    ]) {
      const next = applyRelaxationPreview(withGeo, p);
      expect(next.city).toBe('bangalore');
      expect(next.polygon).toBe(withGeo.polygon);
      expect(next.localities).toBe(withGeo.localities);
    }
  });

  it('does not mutate the filters it was given', () => {
    const original = { ...ACTIVE };
    applyRelaxationPreview(ACTIVE, preview({ kind: 'PRICE_MAX', priceMax: 6_000_000 }));
    expect(ACTIVE).toEqual(original);
  });
});
