/**
 * Issue #2459 AC6 (control half) — "Broad/mixed selections disclose the per-row primary-area
 * meaning in BOTH the control label AND the selected-filter chip."
 *
 * The point of these assertions is that the disclosure is FALSIFIABLE. D1 ruled it an acceptance
 * criterion rather than copy, which only means anything if a test goes red when the sentence
 * disappears. So the broad/mixed cases assert on the rendered disclosure element and on the words
 * that name what is being compared — not merely that the control mounted.
 *
 * The single-meaning cases are the control arm: there the label IS the disclosure, so the module
 * returns `disclosure: null` and the element must be ABSENT. A test suite that only ever asserted
 * presence would pass just as happily against a component that always rendered a sentence.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AreaRangeFilter } from '../AreaRangeFilter';
import { MAX_AREA_SQFT } from '@/features/discover/filters/areaBounds';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

function renderFilter(filters: PropertyFilters = {}) {
  const onFiltersChange = vi.fn();
  render(<AreaRangeFilter filters={filters} onFiltersChange={onFiltersChange} />);
  return { onFiltersChange };
}

describe('AreaRangeFilter — contextual label', () => {
  it('names the specific quantity and shows NO disclosure when one meaning is in play', () => {
    renderFilter({ propertyTypes: ['apartment'] });

    expect(screen.getByTestId('area-filter-label')).toHaveTextContent('BUILT-UP AREA (SQ FT)');
    expect(screen.queryByTestId('area-filter-disclosure')).not.toBeInTheDocument();
  });

  it('uses plot size for land, and warehouse area for warehouses', () => {
    const { unmount } = render(
      <AreaRangeFilter filters={{ propertyTypes: ['commercial_land'] }} onFiltersChange={vi.fn()} />,
    );
    expect(screen.getByTestId('area-filter-label')).toHaveTextContent('PLOT SIZE (SQ FT)');
    unmount();

    render(<AreaRangeFilter filters={{ propertyTypes: ['warehouse'] }} onFiltersChange={vi.fn()} />);
    expect(screen.getByTestId('area-filter-label')).toHaveTextContent('WAREHOUSE AREA (SQ FT)');
  });
});

describe('AreaRangeFilter — AC6 disclosure on broad/mixed selections', () => {
  it('discloses both quantities for a mixed residential selection', () => {
    renderFilter({ propertyTypes: ['apartment', 'residential_plot'] });

    expect(screen.getByTestId('area-filter-label')).toHaveTextContent('AREA (SQ FT)');

    const disclosure = screen.getByTestId('area-filter-disclosure');
    expect(disclosure).toHaveTextContent('built-up area for homes');
    expect(disclosure).toHaveTextContent('plot size for plots');
  });

  it('discloses every quantity in play when nothing is narrowed (the broadest selection)', () => {
    renderFilter({});

    expect(screen.getByTestId('area-filter-label')).toHaveTextContent('AREA (SQ FT)');

    const disclosure = screen.getByTestId('area-filter-disclosure');
    expect(disclosure).toHaveTextContent('built-up area for homes');
    expect(disclosure).toHaveTextContent('plot size for plots');
    expect(disclosure).toHaveTextContent('built-up area for shops, offices and commercial buildings');
    expect(disclosure).toHaveTextContent('warehouse area for warehouses and godowns');
    expect(disclosure).toHaveTextContent('plot size for agricultural land');
  });

  it('wires the disclosure to both inputs as their accessible description', () => {
    renderFilter({ propertyTypes: ['apartment', 'residential_plot'] });

    const disclosureId = screen.getByTestId('area-filter-disclosure').getAttribute('id');
    expect(disclosureId).toBeTruthy();
    expect(screen.getByTestId('area-filter-min')).toHaveAttribute('aria-describedby', disclosureId!);
    expect(screen.getByTestId('area-filter-max')).toHaveAttribute('aria-describedby', disclosureId!);
  });

  it('drops the description when there is nothing to disclose', () => {
    renderFilter({ propertyTypes: ['apartment'] });
    expect(screen.getByTestId('area-filter-min')).not.toHaveAttribute('aria-describedby');
  });
});

describe('AreaRangeFilter — bounds', () => {
  it('reflects restored bounds, so a shared link shows the active range', () => {
    renderFilter({ areaMinSqft: 800, areaMaxSqft: 1200 });

    expect(screen.getByTestId('area-filter-min')).toHaveValue(800);
    expect(screen.getByTestId('area-filter-max')).toHaveValue(1200);
  });

  it('commits a typed lower bound through onFiltersChange, preserving siblings', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({ propertyTypes: ['apartment'] });

    await user.type(screen.getByTestId('area-filter-min'), '9');

    expect(onFiltersChange).toHaveBeenCalledWith({
      propertyTypes: ['apartment'],
      areaMinSqft: 9,
    });
  });

  it('clears to undefined rather than 0 — a 0 bound would exclude unresolvable rows (AC5)', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({ areaMinSqft: 800 });

    await user.clear(screen.getByTestId('area-filter-min'));

    expect(onFiltersChange).toHaveBeenCalledWith({ areaMinSqft: undefined });
  });
});

/**
 * #2459 review fixes 3 & 4 — the control's half of the two guards.
 *
 * `fireEvent.change` rather than `user.type` throughout: these assert what a SINGLE committed value
 * does, and typing commits once per keystroke, so `user.type('2000')` would fire four commits whose
 * intermediate states are not what is under test.
 */
describe('AreaRangeFilter — the control cannot author a request the server 400s', () => {
  it('a pasted decimal CANNOT become an emitted bound, and does not disturb the prior one', () => {
    // The contract is about what reaches `onFiltersChange`, not about what the field displays:
    // rounding to 801 would have submitted a filter the buyer never stated. Asserted as "no call
    // carried an area key" rather than "not called", because a commit of some OTHER key would be
    // an equally valid implementation and is not what this test is about.
    const onFiltersChange = vi.fn();
    render(
      <AreaRangeFilter
        filters={{ areaMinSqft: 800 }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByTestId('area-filter-min'), { target: { value: '800.5' } });

    for (const [emitted] of onFiltersChange.mock.calls) {
      expect(emitted.areaMinSqft).toBe(800);
    }
    expect(onFiltersChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ areaMinSqft: 801 }),
    );
  });

  it('TELLS the buyer the decimal was not applied — a silent refusal is the same defect', () => {
    // D1's reasoning applied to the guard: a value the UI accepts producing an outcome the UI
    // cannot explain is exactly what #2459 exists to close. The refusal must be visible AND
    // programmatically associated, not merely absent from the request.
    render(<AreaRangeFilter filters={{}} onFiltersChange={vi.fn()} />);
    const min = screen.getByTestId('area-filter-min');

    fireEvent.change(min, { target: { value: '800.5' } });

    const error = screen.getByTestId('area-filter-min-error');
    expect(error).toHaveTextContent('whole number');
    expect(error).toHaveTextContent('not applied');
    expect(min).toHaveAttribute('aria-invalid', 'true');
    expect(min.getAttribute('aria-describedby')).toContain(error.getAttribute('id'));
  });

  it('refuses an over-wide integer the same way — integral is not the same as representable', () => {
    // 3000000000 is integral, so the pre-cap guard forwarded it; it 400s on the same Spring
    // Integer binding a decimal does.
    const onFiltersChange = vi.fn();
    render(<AreaRangeFilter filters={{}} onFiltersChange={onFiltersChange} />);

    fireEvent.change(screen.getByTestId('area-filter-min'), { target: { value: '3000000000' } });

    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('area-filter-min-error')).toHaveTextContent('not applied');
  });

  it('clears the refusal once an acceptable value is entered', () => {
    // Without this the message would be sticky, and would outlive the value that caused it.
    const onFiltersChange = vi.fn();
    render(<AreaRangeFilter filters={{}} onFiltersChange={onFiltersChange} />);
    const min = screen.getByTestId('area-filter-min');

    fireEvent.change(min, { target: { value: '800.5' } });
    expect(screen.getByTestId('area-filter-min-error')).toBeInTheDocument();

    fireEvent.change(min, { target: { value: '900' } });

    expect(screen.queryByTestId('area-filter-min-error')).not.toBeInTheDocument();
    expect(min).not.toHaveAttribute('aria-invalid');
    expect(onFiltersChange).toHaveBeenCalledWith({ areaMinSqft: 900 });
  });

  it('refuses per FIELD — a bad min does not mark the max invalid', () => {
    render(<AreaRangeFilter filters={{}} onFiltersChange={vi.fn()} />);

    fireEvent.change(screen.getByTestId('area-filter-min'), { target: { value: '800.5' } });

    expect(screen.getByTestId('area-filter-min-error')).toBeInTheDocument();
    expect(screen.queryByTestId('area-filter-max-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-filter-max')).not.toHaveAttribute('aria-invalid');
  });

  it('CLAMPS the max when a min is pushed above it, rather than committing an inverted pair (fix 3)', () => {
    const onFiltersChange = vi.fn();
    render(
      <AreaRangeFilter
        filters={{ areaMinSqft: 500, areaMaxSqft: 1000 }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByTestId('area-filter-min'), { target: { value: '2000' } });

    expect(onFiltersChange).toHaveBeenCalledWith({ areaMinSqft: 2000, areaMaxSqft: 2000 });
  });

  it('CLAMPS the min when a max is pulled below it (fix 3, the other direction)', () => {
    const onFiltersChange = vi.fn();
    render(
      <AreaRangeFilter
        filters={{ areaMinSqft: 1500, areaMaxSqft: 3000 }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByTestId('area-filter-max'), { target: { value: '900' } });

    expect(onFiltersChange).toHaveBeenCalledWith({ areaMinSqft: 900, areaMaxSqft: 900 });
  });

  it('leaves an ordinary in-range edit completely alone — the control arm for both guards', () => {
    // Without this, a guard that clamped or rounded unconditionally would pass every assertion
    // above while breaking normal use.
    const onFiltersChange = vi.fn();
    render(
      <AreaRangeFilter
        filters={{ areaMinSqft: 500, areaMaxSqft: 3000 }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByTestId('area-filter-min'), { target: { value: '900' } });

    expect(onFiltersChange).toHaveBeenCalledWith({ areaMinSqft: 900, areaMaxSqft: 3000 });
  });

  it('exposes step=1 and max as affordances — UI sugar, NOT the guard', () => {
    // The guard is `classifyAreaBoundInput`, proven by the refusal tests above, which go through a
    // path neither attribute can influence. These assertions exist so a future edit that drops the
    // spinner hints is noticed — not as evidence that anything is blocked.
    //
    // `max` is asserted to equal the SAME exported constant the guard reads, so the number the
    // control invites and the number the contract accepts cannot drift apart.
    renderFilter({});
    expect(screen.getByTestId('area-filter-min')).toHaveAttribute('step', '1');
    expect(screen.getByTestId('area-filter-max')).toHaveAttribute('step', '1');
    expect(screen.getByTestId('area-filter-min')).toHaveAttribute('max', String(MAX_AREA_SQFT));
    expect(screen.getByTestId('area-filter-max')).toHaveAttribute('max', String(MAX_AREA_SQFT));
  });
});
