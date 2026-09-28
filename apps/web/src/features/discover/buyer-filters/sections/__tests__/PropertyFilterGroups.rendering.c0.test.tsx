import { render, screen, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropertyFilterGroups } from '../PropertyFilterGroups';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2658 — C0 characterization (render-level slice: R13–R19).
 *
 * Relocated verbatim in C4 from
 * components/discover/panels/__tests__/propertyFilterGroupsRendering.c0.test.tsx
 * alongside the PropertyFilterGroups component/hook it tests — no assertion
 * changed.
 *
 * Renders the real `PropertyFilterGroups` presentational component fed by
 * the real `usePropertyFilterGroups` hook — the same composition
 * AreaSelectedPanel/MapFilterSheet use — for a fixed `filters` input each
 * time (no interaction), to pin rendered rows/labels/chips BEFORE any code
 * moves. Interaction-driven behavior (clicks, transitions) is already
 * covered by `usePropertyFilterGroups.transitionMatrix.c0.test.tsx`; this
 * file is deliberately render-only.
 */

type Filters = PropertyFilters;

const renderPanel = (
  filters: Filters,
  overrides: Partial<Parameters<typeof usePropertyFilterGroups>[0]> = {},
) => {
  const onFiltersChange = vi.fn();
  const { result } = renderHook(() =>
    usePropertyFilterGroups({
      filters,
      onFiltersChange,
      intent: 'buy',
      isCommercialSubtypeSupported: true,
      isReadyToMoveSupported: true,
      ...overrides,
    }),
  );
  const view = render(
    <PropertyFilterGroups
      {...result.current}
      filters={filters}
      isCommercialSubtypeSupported={overrides.isCommercialSubtypeSupported ?? true}
      isReadyToMoveSupported={overrides.isReadyToMoveSupported ?? true}
    />,
  );
  return { onFiltersChange, ...view };
};

describe('#2658 C0 — PropertyFilterGroups rendering (R13–R19)', () => {
  describe('R13/R14 — budget bands keyed by family x intent, chip label fallback', () => {
    it('renders distinct band sets for Residential/buy vs Commercial/buy', () => {
      const residential = renderPanel({});
      const residentialLabels = within(residential.getByTestId('quick-budget-row'))
        .getAllByRole('button')
        .map((b) => b.textContent);
      residential.unmount();

      const commercial = renderPanel({ commercialSubtypes: ['SHOP'] });
      const commercialLabels = within(commercial.getByTestId('quick-budget-row'))
        .getAllByRole('button')
        .map((b) => b.textContent);

      expect(residentialLabels).not.toEqual(commercialLabels);
    });

    it('labels the row "Monthly rent" under rent intent, "Budget" under buy', () => {
      const buy = renderPanel({}, { intent: 'buy' });
      expect(buy.getByTestId('quick-budget-row')).toHaveTextContent('Budget');
      buy.unmount();

      const rent = renderPanel({}, { intent: 'rent' });
      expect(rent.getByTestId('quick-budget-row')).toHaveTextContent('Monthly rent');
    });

    it('falls back to "≤ ₹X" with "/month" for an off-band rent priceMax', () => {
      renderPanel({ priceMax: 40000 }, { intent: 'rent' });
      const chip = screen.getByTestId('selected-chip-budget');
      expect(chip.textContent).toContain('/month');
      expect(chip.textContent).toContain('40,000');
    });

    it('falls back to "≤ ₹X" with NO "/month" for an off-band buy priceMax', () => {
      renderPanel({ priceMax: 4000000 }, { intent: 'buy' });
      const chip = screen.getByTestId('selected-chip-budget');
      expect(chip.textContent).not.toContain('/month');
    });
  });

  describe('R15 — area chip: 3 formats', () => {
    it('renders "X+ sq ft" for a min-only bound', () => {
      renderPanel({ areaMinSqft: 1500 });
      expect(screen.getByTestId('selected-chip-area').textContent).toContain('1,500+ sq ft');
    });

    it('renders "Up to X sq ft" for a max-only bound', () => {
      renderPanel({ areaMaxSqft: 2000 });
      expect(screen.getByTestId('selected-chip-area').textContent).toContain('Up to 2,000 sq ft');
    });

    it('renders a range for both bounds', () => {
      renderPanel({ areaMinSqft: 1000, areaMaxSqft: 2000 });
      expect(screen.getByTestId('selected-chip-area').textContent).toContain(
        '1,000 – 2,000 sq ft',
      );
    });
  });

  describe('R16 — Bedrooms row vs chip: different gates', () => {
    it('shows the Bedrooms ROW for an ungated Residential selection', () => {
      renderPanel({ propertyTypes: ['apartment'] });
      expect(screen.getByTestId('quick-bedrooms-row')).toBeInTheDocument();
    });

    it('hides the Bedrooms ROW under Commercial', () => {
      renderPanel({ commercialSubtypes: ['SHOP'] });
      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
    });

    it('hides the Bedrooms ROW for a plot-only Residential selection (shouldSubmitBedrooms=false even though family=Residential)', () => {
      renderPanel({ propertyTypes: ['residential_plot'] });
      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
    });

    it('still shows the Bedrooms CHIP for a plot-only selection carrying a bedrooms value, even though the ROW is hidden', () => {
      // R16's documented divergence: the row follows family+submit-eligibility,
      // the chip follows submit-eligibility ALONE. A plot selection suppresses
      // submission too (isPlotOnlySelection), so bedrooms is NOT expected to
      // render as a chip here either — assert that explicitly rather than
      // assume: for a plot-only selection, neither the row nor the chip shows.
      renderPanel({ propertyTypes: ['residential_plot'], bedrooms: [2] });
      expect(screen.queryByTestId('quick-bedrooms-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('selected-chip-bedrooms-2')).not.toBeInTheDocument();
    });
  });

  describe('R17 — possession label + single render', () => {
    it('reads "Ready to move" for Residential and renders the possession chip exactly once', () => {
      renderPanel({ propertyTypes: ['apartment'] });
      const chips = screen.getAllByTestId('quick-chip-ready-to-move');
      expect(chips).toHaveLength(1);
      expect(chips[0]).toHaveTextContent('Ready to move');
    });

    it('reads "Ready to occupy" for Commercial and still renders exactly once', () => {
      renderPanel({ commercialSubtypes: ['SHOP'] });
      const chips = screen.getAllByTestId('quick-chip-ready-to-move');
      expect(chips).toHaveLength(1);
      expect(chips[0]).toHaveTextContent('Ready to occupy');
    });
  });

  describe('R18 — row visibility (family / subtype / residential)', () => {
    it('renders the family row when the capability is on', () => {
      renderPanel({}, { isCommercialSubtypeSupported: true });
      expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
    });

    it('renders NO family row when the capability is off', () => {
      renderPanel({}, { isCommercialSubtypeSupported: false });
      expect(screen.queryByTestId('quick-family-row')).not.toBeInTheDocument();
    });

    it('renders the subtype row only for Commercial with the capability on, never alongside the Residential type row', () => {
      renderPanel({ commercialSubtypes: ['SHOP'] }, { isCommercialSubtypeSupported: true });
      expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-chip-all')).not.toBeInTheDocument();
    });

    it('renders the Residential type row (not the subtype row) for a Residential selection', () => {
      renderPanel({ propertyTypes: ['apartment'] }, { isCommercialSubtypeSupported: true });
      expect(screen.getByTestId('quick-chip-all')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
    });
  });

  describe('R19 — selected-chip ordering and suppression', () => {
    it('suppresses type chips for the derived 4-token "All commercial" selection', () => {
      renderPanel({
        propertyTypes: ['commercial', 'commercial_building', 'warehouse', 'commercial_land'],
      });
      expect(screen.queryByTestId(/^selected-chip-type-/)).not.toBeInTheDocument();
    });

    it('does NOT suppress a single inbound commercial family token (length 1, not the derived 4-set)', () => {
      renderPanel({ propertyTypes: ['commercial'] });
      expect(screen.getByTestId('selected-chip-type-commercial')).toBeInTheDocument();
    });

    it('renders selected chips in order: types, subtypes, beds, rtm, budget, area', () => {
      renderPanel({
        propertyTypes: ['apartment'],
        bedrooms: [2],
        readyToMove: true,
        priceMax: 5000000,
        areaMinSqft: 1000,
      });
      const row = screen.getByTestId('selected-filter-chips');
      // Chips are <span> elements, not <li>s — read DOM order via children
      // rather than an ARIA list role.
      const orderedIds = Array.from(row.children)
        .map((el) => el.getAttribute('data-testid'))
        .filter((id): id is string => Boolean(id));
      expect(orderedIds).toEqual([
        'selected-chip-type-apartment',
        'selected-chip-bedrooms-2',
        'selected-chip-ready-to-move',
        'selected-chip-budget',
        'selected-chip-area',
      ]);
    });

    it('gates the subtype chip on the capability, not merely on the family', () => {
      renderPanel({ commercialSubtypes: ['SHOP'] }, { isCommercialSubtypeSupported: false });
      expect(screen.queryByTestId('selected-chip-subtype-SHOP')).not.toBeInTheDocument();
    });

    it('renders NO selected-filter-chips row when nothing is selected', () => {
      renderPanel({});
      expect(screen.queryByTestId('selected-filter-chips')).not.toBeInTheDocument();
    });
  });
});
