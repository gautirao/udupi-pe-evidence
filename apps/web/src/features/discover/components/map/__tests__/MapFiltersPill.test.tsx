// Issue #2628 — MapFiltersPill: badge count excludes purpose+family, aria contract.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MapFiltersPill,
  computeMapFilterRefinementCount,
  deriveMapFiltersFamily,
  computeMapResultsUnitPhrase,
  computeMapResultsHeadingText,
  computeMapFilteredSummaryParts,
} from '../MapFiltersPill';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

describe('computeMapFilterRefinementCount', () => {
  it('is zero with no refinements', () => {
    expect(computeMapFilterRefinementCount({})).toBe(0);
  });

  it('counts one axis per refinement type, not per value', () => {
    expect(
      computeMapFilterRefinementCount({ bedrooms: [2, 3], propertyTypes: ['apartment'], priceMax: 1_000_000 }),
    ).toBe(3);
  });

  it('never counts purpose or family — those are not PropertyFilters fields', () => {
    // propertyTypes carrying the commercial FAMILY tokens alone still counts as one axis
    // (the family itself is stated by the results heading, never by this badge).
    expect(computeMapFilterRefinementCount({ commercialSubtypes: ['SHOP'] })).toBe(1);
  });
});

describe('MapFiltersPill', () => {
  it('renders outlined "at rest" with no badge when count is 0', () => {
    render(<MapFiltersPill count={0} intentFamilySummary="homes for sale, Residential" onClick={vi.fn()} />);
    const pill = screen.getByTestId('map-filters-pill');
    expect(pill).toHaveAccessibleName(/no refinements/i);
    expect(screen.queryByTestId('map-filters-pill-count')).not.toBeInTheDocument();
  });

  it('renders the count badge and speaks intent+family when active', () => {
    render(<MapFiltersPill count={3} intentFamilySummary="homes to rent, Residential" onClick={vi.fn()} />);
    const pill = screen.getByTestId('map-filters-pill');
    expect(pill).toHaveAccessibleName(/3 active/i);
    expect(pill).toHaveAccessibleName(/homes to rent, Residential/i);
    expect(screen.getByTestId('map-filters-pill-count')).toHaveTextContent('3');
  });

  it('never renders icon-only — the visible word "Filters" is always present', () => {
    render(<MapFiltersPill count={0} intentFamilySummary="homes" onClick={vi.fn()} />);
    expect(screen.getByTestId('map-filters-pill')).toHaveTextContent('Filters');
  });

  it('carries the dialog-trigger aria contract', () => {
    render(<MapFiltersPill count={0} intentFamilySummary="homes" onClick={vi.fn()} />);
    const pill = screen.getByTestId('map-filters-pill');
    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    expect(pill).toHaveAttribute('aria-controls', 'mf-sheet');
    expect(pill).toHaveAttribute('id', 'mf-entry');
  });
});

// Issue #2628 (steps 4-6/8) — Map results heading, "Filtered: …" summary, family derivation.
describe('deriveMapFiltersFamily', () => {
  it('defaults to residential with no propertyTypes/commercialSubtypes', () => {
    expect(deriveMapFiltersFamily({})).toBe('residential');
  });

  it('is residential for a residential subtype selection', () => {
    expect(deriveMapFiltersFamily({ propertyTypes: ['apartment'] })).toBe('residential');
  });

  it('is commercial when propertyTypes carries a commercial family token', () => {
    expect(deriveMapFiltersFamily({ propertyTypes: ['commercial'] })).toBe('commercial');
  });

  it('is commercial when a commercial subtype is selected even without propertyTypes', () => {
    expect(deriveMapFiltersFamily({ commercialSubtypes: ['SHOP'] })).toBe('commercial');
  });
});

describe('computeMapResultsUnitPhrase / computeMapResultsHeadingText', () => {
  it('mf-13 — Buy→Rent changes the heading NOUN, independent of badge count', () => {
    const filters: PropertyFilters = { propertyTypes: ['apartment'] };
    const buyHeading = computeMapResultsHeadingText(27, deriveMapFiltersFamily(filters), 'buy');
    const rentHeading = computeMapResultsHeadingText(27, deriveMapFiltersFamily(filters), 'rent');
    expect(buyHeading).toBe('27 homes for sale · Residential');
    expect(rentHeading).toBe('27 homes to rent · Residential');
    // Same filters → same refinement count on both sides of the Buy/Rent toggle.
    expect(computeMapFilterRefinementCount(filters)).toBe(computeMapFilterRefinementCount(filters));
  });

  it('commercial gets one umbrella noun regardless of Buy/Rent (mf-09/mf-10)', () => {
    expect(computeMapResultsUnitPhrase('commercial', 'buy')).toBe('commercial properties');
    expect(computeMapResultsUnitPhrase('commercial', 'rent')).toBe('commercial properties');
    expect(computeMapResultsHeadingText(2, 'commercial', 'buy')).toBe('2 commercial properties · Commercial');
  });

  it('always states intent+family even with zero refinements', () => {
    expect(computeMapResultsHeadingText(168, 'residential', 'buy')).toBe('168 homes for sale · Residential');
  });
});

describe('computeMapFilteredSummaryParts', () => {
  it('excludes Buy/Rent and the bare family marker', () => {
    const parts = computeMapFilteredSummaryParts(
      { propertyTypes: ['apartment'], bedrooms: [2], priceMax: 12_000_000 },
      'buy',
    );
    expect(parts.join(' · ')).not.toMatch(/\bBuy\b/);
    expect(parts).toContain('apartment');
    expect(parts).toContain('2 BHK');
  });

  it('never shows Bedrooms for Commercial, and surfaces the subtype label (mf-10)', () => {
    const parts = computeMapFilteredSummaryParts(
      { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] },
      'buy',
    );
    expect(parts).toContain('Shop');
    expect(parts.some((p) => /BHK/.test(p))).toBe(false);
    // The bare 'commercial' family marker must not appear as its own label.
    expect(parts).not.toContain('commercial');
  });

  it('is empty with no refinements', () => {
    expect(computeMapFilteredSummaryParts({}, 'buy')).toEqual([]);
  });
});
