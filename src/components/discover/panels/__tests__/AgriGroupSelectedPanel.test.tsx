/**
 * Tests for AgriGroupSelectedPanel (Issue #1425, extended in #1445)
 *
 * Covers:
 * - Header chip renders group label and clear button
 * - Clear button fires onClear callback
 * - Loading state: skeleton rows visible, no listing rows
 * - Empty state: "No listings in this region" + back-to-list button fires onClear
 * - Error state: error message + retry button + back-to-list button
 * - Listings state: rows rendered + click fires onSelectListing with correct id
 * - Aggregate count renders correct singular/plural text
 * - Distance chip row: renders chips, aria-pressed state, click handler, empty guard
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AgriGroupSelectedPanel } from '../AgriGroupSelectedPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';

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

const makeTier = (maxKm: 10 | 25 | 50 | 100): CumulativeDistanceTier => ({
  maxKm,
  distanceLabel: `Up to ${maxKm} km`,
  includedBandCodes: [],
  listingCount: 2,
  areaKeys: [],
});

const ALL_TIERS: CumulativeDistanceTier[] = [
  makeTier(10),
  makeTier(25),
  makeTier(50),
  makeTier(100),
];

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
  // Issue #1445 — new required props; default to no-chip-row for backward compat.
  selectedMaxKm: null,
  availableMaxDistances: undefined,
  onSetMaxKm: noop as (km: 10 | 25 | 50 | 100) => void,
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

// ─── Issue #1445 — Distance chip row ─────────────────────────────────────────

describe('AgriGroupSelectedPanel — distance chip row', () => {
  it('(a) renders all 4 chip buttons when availableMaxDistances is provided', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
      />,
    );
    expect(screen.getByTestId('distance-chip-10')).toBeInTheDocument();
    expect(screen.getByTestId('distance-chip-25')).toBeInTheDocument();
    expect(screen.getByTestId('distance-chip-50')).toBeInTheDocument();
    expect(screen.getByTestId('distance-chip-100')).toBeInTheDocument();
  });

  it('(b) selected chip has aria-pressed=true, others do not', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
      />,
    );
    expect(screen.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-10')).not.toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-50')).not.toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-100')).not.toHaveAttribute('aria-pressed', 'true');
  });

  it('(c) clicking a chip calls onSetMaxKm with the correct km value', async () => {
    const user = userEvent.setup();
    const onSetMaxKm = vi.fn();
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
        onSetMaxKm={onSetMaxKm}
      />,
    );
    await user.click(screen.getByTestId('distance-chip-50'));
    expect(onSetMaxKm).toHaveBeenCalledTimes(1);
    expect(onSetMaxKm).toHaveBeenCalledWith(50);
  });

  it('(d) no chip row when availableMaxDistances is undefined', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={null}
        availableMaxDistances={undefined}
      />,
    );
    expect(screen.queryByTestId('distance-chip-10')).not.toBeInTheDocument();
    expect(screen.queryByTestId('distance-chip-25')).not.toBeInTheDocument();
  });

  it('(d) no chip row when availableMaxDistances is empty array', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={null}
        availableMaxDistances={[]}
      />,
    );
    expect(screen.queryByTestId('distance-chip-10')).not.toBeInTheDocument();
    expect(screen.queryByTestId('distance-chip-25')).not.toBeInTheDocument();
  });

  // ── Issue #1446: chip-switching additions ─────────────────────────────────

  it('(e) AC4 rerender: chip selection tracks selectedMaxKm prop changes', () => {
    const { rerender } = render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
      />,
    );
    // Initial: chip-25 selected, chip-50 not selected
    expect(screen.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-50')).not.toHaveAttribute('aria-pressed', 'true');

    // Rerender with selectedMaxKm=50
    rerender(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={50}
        availableMaxDistances={ALL_TIERS}
      />,
    );
    // After rerender: chip-50 selected, chip-25 no longer selected
    expect(screen.getByTestId('distance-chip-50')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-25')).not.toHaveAttribute('aria-pressed', 'true');
  });

  it('(f) AC2 region preservation: chip-50 click fires onSetMaxKm with exactly 50', async () => {
    const user = userEvent.setup();
    const onSetMaxKm = vi.fn();
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
        onSetMaxKm={onSetMaxKm}
      />,
    );
    await user.click(screen.getByTestId('distance-chip-50'));
    expect(onSetMaxKm).toHaveBeenCalledTimes(1);
    expect(onSetMaxKm).toHaveBeenCalledWith(50);
    // Verify the callback was NOT called with any other value
    expect(onSetMaxKm).not.toHaveBeenCalledWith(25);
    expect(onSetMaxKm).not.toHaveBeenCalledWith(10);
    expect(onSetMaxKm).not.toHaveBeenCalledWith(100);
  });
});

// ─── Issue #1464 — Locality grouping ─────────────────────────────────────────

describe('AgriGroupSelectedPanel — locality grouping (Issue #1464)', () => {
  it('groups listings from 2 different localities into 2 group sections', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva' }),
      makeListing('a2', { locality: 'Hebri' }),
      makeListing('a3', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={3} />,
    );
    // Two locality group sections
    expect(screen.getAllByTestId('agri-group-locality-group')).toHaveLength(2);
  });

  it('renders correct count label for each group (plural)', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva' }),
      makeListing('a2', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    expect(btns[0]).toHaveTextContent('2 agricultural properties');
  });

  it('renders correct count label for a single-item group (singular)', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={1} />,
    );
    const btn = screen.getByTestId('agri-group-locality-btn');
    expect(btn).toHaveTextContent('1 agricultural property');
  });

  it('listing with null locality is grouped under its areaKey', () => {
    const listing = makeListing('a1', { locality: null, areaKey: 'IN|KA|Udupi|Kota' });
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={[listing]} listingCount={1} />,
    );
    // Group header shows the areaKey
    const btn = screen.getByTestId('agri-group-locality-btn');
    expect(btn).toHaveTextContent('IN|KA|Udupi|Kota');
  });

  it('groups are sorted alphabetically regardless of input order', () => {
    // Input order: Zebra then Apple then Mango — groups must appear A, M, Z
    const listings = [
      makeListing('a3', { locality: 'Zebra' }),
      makeListing('a1', { locality: 'Apple' }),
      makeListing('a2', { locality: 'Mango' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={3} />,
    );
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    expect(btns[0]).toHaveTextContent('Apple');
    expect(btns[1]).toHaveTextContent('Mango');
    expect(btns[2]).toHaveTextContent('Zebra');
  });

  it('within-group listing rows are sorted by id ascending', async () => {
    // Input order: z3, z1, z2 (descending by name) → rendered order must be z1, z2, z3
    const user = userEvent.setup();
    const onSelectListing = vi.fn();
    const listings = [
      makeListing('z3', { locality: 'Shirva' }),
      makeListing('z1', { locality: 'Shirva' }),
      makeListing('z2', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={listings}
        listingCount={3}
        onSelectListing={onSelectListing}
      />,
    );
    // All 3 are in one group (same locality), order must be id-ascending
    const rows = screen.getAllByTestId('agri-group-listing-row');
    expect(rows).toHaveLength(3);
    // Click the first row — it must correspond to z1 (lowest id lexicographically)
    await user.click(rows[0]);
    expect(onSelectListing).toHaveBeenCalledWith('z1');
  });

  it('clicking a locality group button calls onSelectLocality with the locality name', async () => {
    const user = userEvent.setup();
    const onSelectLocality = vi.fn();
    const listings = [
      makeListing('a1', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={listings}
        listingCount={1}
        onSelectLocality={onSelectLocality}
      />,
    );
    const btn = screen.getByTestId('agri-group-locality-btn');
    await user.click(btn);
    expect(onSelectLocality).toHaveBeenCalledTimes(1);
    expect(onSelectLocality).toHaveBeenCalledWith('Shirva');
  });
});
