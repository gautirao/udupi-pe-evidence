/**
 * Issue #2431 — the Shop/Office affordance inside PropertyTypeFilter.
 *
 * The two behaviours worth testing here are the ones a reviewer would otherwise have to take on
 * trust, because both exist to prevent an INVISIBLE filter:
 *
 *  - ticking a subtype selects the Commercial family for you, since a subtype without it returns
 *    zero results (the server applies the subtype literally);
 *  - unticking Commercial clears the subtypes, since the controls that expressed them are no
 *    longer relevant and a retained subtype would silently narrow the results.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyTypeFilter } from '../PropertyTypeFilter';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

function renderFilter(filters: PropertyFilters = {}) {
  const onFiltersChange = vi.fn();
  render(<PropertyTypeFilter filters={filters} onFiltersChange={onFiltersChange} />);
  return { onFiltersChange };
}

describe('#2431 — Shop/Office affordance', () => {
  it('offers exactly Shop and Office, and not the other commercial subtypes', () => {
    renderFilter();

    expect(screen.getByLabelText('Shop')).toBeInTheDocument();
    expect(screen.getByLabelText('Office')).toBeInTheDocument();

    // BUILDING/WAREHOUSE/LAND are addressable as property types, not as subtypes. Offering them
    // in both places would give a buyer two ways to ask the same question.
    expect(screen.queryByLabelText('Commercial building')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Commercial land')).not.toBeInTheDocument();
  });

  it('reflects a restored selection, so a shared link shows which subtype is active', () => {
    renderFilter({ propertyTypes: ['commercial'], commercialSubtypes: ['OFFICE'] });

    expect(screen.getByLabelText('Office')).toBeChecked();
    expect(screen.getByLabelText('Shop')).not.toBeChecked();
  });

  it('ticking Shop also selects the Commercial family — a subtype alone would return zero', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter();

    await user.click(screen.getByLabelText('Shop'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
      }),
    );
  });

  it('does not duplicate the Commercial family when it is already selected', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({ propertyTypes: ['commercial'] });

    await user.click(screen.getByLabelText('Office'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['OFFICE'],
      }),
    );
  });

  it('preserves other selected property types when a subtype implies Commercial', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({ propertyTypes: ['apartment'] });

    await user.click(screen.getByLabelText('Shop'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyTypes: ['apartment', 'commercial'],
        commercialSubtypes: ['SHOP'],
      }),
    );
  });

  it('UNTICKING Commercial clears the subtypes, so no invisible filter is left applied', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({
      propertyTypes: ['commercial'],
      commercialSubtypes: ['SHOP', 'OFFICE'],
    });

    await user.click(screen.getByLabelText('Commercial'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyTypes: undefined,
        commercialSubtypes: undefined,
      }),
    );
  });

  it('unticking a DIFFERENT property type leaves the subtypes alone', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({
      propertyTypes: ['commercial', 'apartment'],
      commercialSubtypes: ['SHOP'],
    });

    await user.click(screen.getByLabelText('Apartment'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
      }),
    );
  });

  it('unticking the last subtype removes the filter rather than sending an empty list', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderFilter({
      propertyTypes: ['commercial'],
      commercialSubtypes: ['SHOP'],
    });

    await user.click(screen.getByLabelText('Shop'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ commercialSubtypes: undefined }),
    );
  });

  it('tells the buyer that older commercial listings without a recorded subtype are hidden', () => {
    renderFilter();
    expect(screen.getByText(/Older commercial listings/i)).toBeInTheDocument();
  });
});
