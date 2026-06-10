/**
 * Tests for AgriGroupSelectedPanel (Issue #1425)
 *
 * Covers:
 * - Header chip renders group label and clear button
 * - Clear button fires onClear callback
 * - Loading state: skeleton rows visible, no listing rows
 * - Empty state: "No listings in this region" + back-to-list button fires onClear
 * - Error state: error message + retry button + back-to-list button
 * - Listings state: rows rendered + click fires onSelectListing with correct id
 * - Aggregate count renders correct singular/plural text
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AgriGroupSelectedPanel } from '../AgriGroupSelectedPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeListing = (id: string, overrides: Partial<AgriMapListingItem> = {}): AgriMapListingItem => ({
  id,
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.35,
  longitude: 74.79,
  propertyType: 'agricultural_land',
  locality: `Locality ${id}`,
  landArea: 2.5,
  landAreaUnit: 'acre',
  ...overrides,
});

const noop = () => {};

const baseProps = {
  groupLabel: 'North · 10–25 km',
  listings: null,
  listingCount: 0,
  isLoading: false,
  isError: false,
  onRetry: noop,
  onClear: noop,
  onSelectListing: noop,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgriGroupSelectedPanel — header chip', () => {
  it('renders the group label text in the header chip', () => {
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-selected-label')).toHaveTextContent('North · 10–25 km');
  });

  it('renders the clear button with accessible label', () => {
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByRole('button', { name: /clear selected region/i })).toBeInTheDocument();
  });

  it('clear button fires onClear callback when clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} onClear={onClear} />);
    await user.click(screen.getByTestId('agri-group-selected-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupSelectedPanel — loading state', () => {
  it('renders skeleton rows when isLoading=true', () => {
    render(<AgriGroupSelectedPanel {...baseProps} isLoading={true} listings={null} />);
    const skeletons = screen.getAllByTestId('agri-group-listing-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('does not render listing rows when isLoading=true', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        isLoading={true}
        listings={[makeListing('l1')]}
      />,
    );
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
  });
});

describe('AgriGroupSelectedPanel — empty state', () => {
  it('renders "No listings in this region" when listings is empty array', () => {
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} listingCount={0} />);
    expect(screen.getByTestId('agri-group-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No listings in this region')).toBeInTheDocument();
  });

  it('back-to-list button in empty state fires onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={[]} listingCount={0} onClear={onClear} />,
    );
    const backBtn = screen.getByTestId('agri-group-back-btn');
    await user.click(backBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupSelectedPanel — error state', () => {
  it('renders error state when isError=true', () => {
    render(<AgriGroupSelectedPanel {...baseProps} isError={true} listings={null} />);
    expect(screen.getByTestId('agri-group-error-state')).toBeInTheDocument();
    expect(screen.getByText(/could not load listings/i)).toBeInTheDocument();
  });

  it('retry button fires onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <AgriGroupSelectedPanel {...baseProps} isError={true} listings={null} onRetry={onRetry} />,
    );
    await user.click(screen.getByTestId('agri-group-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('back-to-list button in error state fires onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <AgriGroupSelectedPanel {...baseProps} isError={true} listings={null} onClear={onClear} />,
    );
    await user.click(screen.getByTestId('agri-group-back-btn'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupSelectedPanel — listings state', () => {
  const listings = [makeListing('a1'), makeListing('a2'), makeListing('a3')];

  it('renders one row per listing', () => {
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={3} />,
    );
    expect(screen.getAllByTestId('agri-group-listing-row')).toHaveLength(3);
  });

  it('click on a listing row fires onSelectListing with the correct id', async () => {
    const user = userEvent.setup();
    const onSelectListing = vi.fn();
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={listings}
        listingCount={3}
        onSelectListing={onSelectListing}
      />,
    );
    const rows = screen.getAllByTestId('agri-group-listing-row');
    await user.click(rows[1]);
    expect(onSelectListing).toHaveBeenCalledWith('a2');
  });

  it('renders land area for listings that have it', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[makeListing('x1', { landArea: 3, landAreaUnit: 'acre' })]}
        listingCount={1}
      />,
    );
    expect(screen.getByTestId('agri-group-land-area')).toHaveTextContent('3 acre');
  });

  it('does not render land area element when landArea is null', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[makeListing('x1', { landArea: null, landAreaUnit: null })]}
        listingCount={1}
      />,
    );
    expect(screen.queryByTestId('agri-group-land-area')).not.toBeInTheDocument();
  });
});

describe('AgriGroupSelectedPanel — aggregate count', () => {
  it('renders plural "properties" when listingCount > 1', () => {
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={[makeListing('a1'), makeListing('a2')]} listingCount={2} />,
    );
    expect(screen.getByTestId('agri-group-listing-count')).toHaveTextContent(
      '2 agri properties in this region',
    );
  });

  it('renders singular "property" when listingCount === 1', () => {
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={[makeListing('a1')]} listingCount={1} />,
    );
    expect(screen.getByTestId('agri-group-listing-count')).toHaveTextContent(
      '1 agri property in this region',
    );
  });
});
