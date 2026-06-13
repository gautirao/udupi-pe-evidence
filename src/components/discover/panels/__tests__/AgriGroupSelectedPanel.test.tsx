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
  it('renders one locality button per distinct locality', () => {
    const listings = [makeListing('a1'), makeListing('a2'), makeListing('a3')];
    // Each listing gets a different locality by default (makeListing sets locality to `Locality ${id}`)
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={3} />,
    );
    // 3 distinct localities → 3 locality buttons, 0 listing rows
    expect(screen.getAllByTestId('agri-group-locality-btn')).toHaveLength(3);
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
  });

  it('no inline listing rows are visible at Level 2 (towns-only view)', () => {
    const listings = [makeListing('a1'), makeListing('a2')];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
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

  it('count-desc primary: high-count town appears before low-count town even when alpha order differs', () => {
    // "Apple" is alpha-first but has only 1 listing; "Zebra" has 2 — Zebra must win on count.
    // "Mango" also has 1 listing — alpha tie-break between Apple and Mango gives Apple before Mango.
    const listings = [
      makeListing('z1', { locality: 'Zebra' }),
      makeListing('z2', { locality: 'Zebra' }),
      makeListing('a1', { locality: 'Apple' }),
      makeListing('m1', { locality: 'Mango' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={4} />,
    );
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    // Zebra: 2 (count-desc wins over alpha); Apple: 1 (alpha-tie second); Mango: 1 (alpha-tie third)
    expect(btns[0]).toHaveTextContent('Zebra');
    expect(btns[1]).toHaveTextContent('Apple');
    expect(btns[2]).toHaveTextContent('Mango');
  });

  it('single locality group shows correct count when all listings share one locality', () => {
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
      />,
    );
    // One group section, one button showing count 3, no listing rows
    expect(screen.getAllByTestId('agri-group-locality-group')).toHaveLength(1);
    const btn = screen.getByTestId('agri-group-locality-btn');
    expect(btn).toHaveTextContent('3 agricultural properties');
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
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

// ─── Issue #1486 — Sort by count desc + acreage line ──────────────────────────

describe('AgriGroupSelectedPanel — sort count-desc + acreage (Issue #1486)', () => {
  it('AC1: sorts towns by listing count descending', () => {
    // Shirva: 3 listings, Hebri: 1 listing — Shirva must appear first
    const listings = [
      makeListing('a1', { locality: 'Hebri' }),
      makeListing('a2', { locality: 'Shirva' }),
      makeListing('a3', { locality: 'Shirva' }),
      makeListing('a4', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={4} />,
    );
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    expect(btns[0]).toHaveTextContent('Shirva');
    expect(btns[1]).toHaveTextContent('Hebri');
  });

  it('AC2: equal-count towns sorted alphabetically (locale-aware, case-insensitive)', () => {
    // All towns have 2 listings — must sort alpha: Apple, Mango, Zebra
    const listings = [
      makeListing('z1', { locality: 'Zebra' }),
      makeListing('z2', { locality: 'Zebra' }),
      makeListing('a1', { locality: 'Apple' }),
      makeListing('a2', { locality: 'Apple' }),
      makeListing('m1', { locality: 'Mango' }),
      makeListing('m2', { locality: 'Mango' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={6} />,
    );
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    expect(btns[0]).toHaveTextContent('Apple');
    expect(btns[1]).toHaveTextContent('Mango');
    expect(btns[2]).toHaveTextContent('Zebra');
  });

  it('AC2: count-desc takes priority over alpha (3-listing town before 1-listing town)', () => {
    // "Aaaa" (alpha-first) has 1 listing; "Zzzz" has 3 — Zzzz must appear first
    const listings = [
      makeListing('a1', { locality: 'Aaaa' }),
      makeListing('z1', { locality: 'Zzzz' }),
      makeListing('z2', { locality: 'Zzzz' }),
      makeListing('z3', { locality: 'Zzzz' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={4} />,
    );
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    expect(btns[0]).toHaveTextContent('Zzzz');
    expect(btns[1]).toHaveTextContent('Aaaa');
  });

  it('AC4: acreage line shows sum of computedAreaAcres for a town', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva', computedAreaAcres: 3.5 }),
      makeListing('a2', { locality: 'Shirva', computedAreaAcres: 1.5 }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    // Sum = 5.0 acres — integer format (no decimals)
    const acreageEl = screen.getByTestId('agri-group-locality-acreage');
    expect(acreageEl).toHaveTextContent('5 acres total');
  });

  it('AC4: acreage line uses 2dp when sum is fractional', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva', computedAreaAcres: 2.75 }),
      makeListing('a2', { locality: 'Shirva', computedAreaAcres: 1.0 }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    const acreageEl = screen.getByTestId('agri-group-locality-acreage');
    expect(acreageEl).toHaveTextContent('3.75 acres total');
  });

  it('AC4: acreage line omitted when all computedAreaAcres are null', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva', computedAreaAcres: null }),
      makeListing('a2', { locality: 'Shirva', computedAreaAcres: null }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    expect(screen.queryByTestId('agri-group-locality-acreage')).not.toBeInTheDocument();
  });

  it('AC4: acreage line omitted when computedAreaAcres is absent from all listings', () => {
    // makeListing without computedAreaAcres override — field is undefined
    const listings = [
      makeListing('a1', { locality: 'Shirva' }),
      makeListing('a2', { locality: 'Shirva' }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    expect(screen.queryByTestId('agri-group-locality-acreage')).not.toBeInTheDocument();
  });

  it('AC4: acreage line shown when at least one listing has non-null computedAreaAcres (others null)', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva', computedAreaAcres: 4.0 }),
      makeListing('a2', { locality: 'Shirva', computedAreaAcres: null }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    const acreageEl = screen.getByTestId('agri-group-locality-acreage');
    expect(acreageEl).toHaveTextContent('4 acres total');
  });

  it('AC4 (F2): undefined computedAreaAcres (never backfilled) mixed with a non-null value — sums correctly', () => {
    // makeListing without computedAreaAcres override leaves the field as undefined.
    // The filter `v != null` must exclude both null and undefined, summing only the 2.0.
    const listings = [
      makeListing('a1', { locality: 'Shirva' }), // computedAreaAcres: undefined
      makeListing('a2', { locality: 'Shirva', computedAreaAcres: 2.0 }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={2} />,
    );
    const acreageEl = screen.getByTestId('agri-group-locality-acreage');
    expect(acreageEl).toHaveTextContent('2 acres total');
  });

  it('AC4 (F1): float accumulation — 0.1 × 20 sums to 2.0000000000000004 in V8; must render "2 acres total" not "2.00 acres total"', () => {
    // Confirmed in Node.js/V8:
    //   Array.from({length:20}, () => 0.1).reduce((a,b) => a+b, 0) === 2.0000000000000004
    // That value fails `% 1 === 0` (remainder is 4e-16) without prior rounding to 2dp.
    const driftingListings = Array.from({ length: 20 }, (_, i) =>
      makeListing(`drift-${i}`, { locality: 'Shirva', computedAreaAcres: 0.1 }),
    );
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={driftingListings} listingCount={20} />,
    );
    const acreageEl = screen.getByTestId('agri-group-locality-acreage');
    // Without Math.round fix: renders "2.00 acres total" (falls into toFixed branch)
    // With fix: renders "2 acres total"
    expect(acreageEl).toHaveTextContent('2 acres total');
    expect(acreageEl).not.toHaveTextContent('2.00 acres total');
  });

  it('AC4: each town shows its own acreage independently', () => {
    const listings = [
      makeListing('a1', { locality: 'Shirva', computedAreaAcres: 5.0 }),
      makeListing('a2', { locality: 'Shirva', computedAreaAcres: 5.0 }),
      makeListing('b1', { locality: 'Hebri', computedAreaAcres: null }),
    ];
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={listings} listingCount={3} />,
    );
    // Shirva: 2 listings (appears first), Hebri: 1 listing
    const acreageEls = screen.getAllByTestId('agri-group-locality-acreage');
    // Only Shirva group has acreage (Hebri all-null)
    expect(acreageEls).toHaveLength(1);
    expect(acreageEls[0]).toHaveTextContent('10 acres total');
  });
});

// ─── Issue #1456 — Cumulative distance hint text ──────────────────────────────

describe('AgriGroupSelectedPanel — cumulative distance hint (Issue #1456)', () => {
  it('renders hint text when distance tiers are present', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
      />,
    );
    expect(
      screen.getByText('Includes properties at closer distances too.'),
    ).toBeInTheDocument();
  });

  it('does NOT render hint text when availableMaxDistances is undefined (no chip row)', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        selectedMaxKm={null}
        availableMaxDistances={undefined}
      />,
    );
    expect(
      screen.queryByText('Includes properties at closer distances too.'),
    ).not.toBeInTheDocument();
  });
});
