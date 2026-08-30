/**
 * Tests for AgriGroupSelectedPanel (Issue #1425, extended in #1445; reworked by
 * Issue #2151 PR C, C-F4/C-F6, for server-supplied destination buckets).
 *
 * Covers:
 * - Header chip renders group label and clear button
 * - Clear button fires onClear callback
 * - C-F6 five distinct body states: loading, no-destinations-in-scope,
 *   destination-empty-under-filters, retryable error, 503 not-yet-promoted
 * - Towns list rendered from server-supplied destination buckets (not client-grouped
 *   listings); click identity is the destination's areaKey
 * - Aggregate hero/summary-band counts derived from destination bucket aggregates
 * - Distance chip row: renders chips, aria-pressed state, click handler, empty guard
 * - Agri filters drawer + active-filter chips (unaffected by C-F4, still prop-driven)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { CumulativeDistanceTier, AgriDestinationBucket } from '@/hooks/useRegionalAreaGroups';

// ─── Hoisted mock: useAgriDestinations ─────────────────────────────────────────

const mockUseAgriDestinations = vi.hoisted(() => vi.fn());
const mockRefetchDestinations = vi.hoisted(() => vi.fn());

// Deliberately NOT using importOriginal here: the real useRegionalAreaGroups.ts imports
// '@/lib/api', which transitively imports the Supabase client and requires real env vars this
// test environment doesn't have configured. This component only ever imports `useAgriDestinations`
// (a value) and `CumulativeDistanceTier`/`AgriDestinationBucket` (types, erased at build time) from
// this module, so a full mock with just the one runtime export is both sufficient and avoids that
// transitive dependency entirely.
vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useAgriDestinations: mockUseAgriDestinations,
}));

import { AgriGroupSelectedPanel } from '../AgriGroupSelectedPanel';

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

const makeBucket = (
  areaKey: string,
  overrides: Partial<AgriDestinationBucket> = {},
): AgriDestinationBucket => ({
  areaKey,
  displayName: areaKey,
  distanceKm: 10,
  bearingDeg: 0,
  direction: 'N',
  parcelCount: 1,
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
  // Issue #1445 — new required props; default to no-chip-row for backward compat.
  selectedMaxKm: null,
  availableMaxDistances: undefined,
  onSetMaxKm: noop as (km: 10 | 25 | 50 | 100) => void,
  // Issue #2151 PR C (C-F4) — the destinations fetch is keyed off citySlug/directionCode/
  // selectedMaxKm/intent; provide a stable cityLabel/citySlug pair so tests exercise the real
  // fetch-gating logic (the hook itself is mocked below, so no real network call ever happens).
  cityLabel: 'Udupi',
  citySlug: 'udupi',
};

interface MockDestinationsResult {
  destinations: AgriDestinationBucket[];
  isLoading: boolean;
  isError: boolean;
  isNotYetPromoted: boolean;
  isNotGeneratedForRevision: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Default mock — empty destinations, not loading, no error. Override per test as needed. */
function mockDestinations(overrides: Partial<MockDestinationsResult> = {}) {
  mockUseAgriDestinations.mockReturnValue({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    isNotGeneratedForRevision: false,
    error: null,
    refetch: mockRefetchDestinations,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDestinations();
});

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

// ─── Issue #2151 PR C (C-F6) — five distinct body states ─────────────────────

describe('AgriGroupSelectedPanel — C-F6 state 1: loading', () => {
  it('renders skeleton rows when the destinations fetch is loading', () => {
    mockDestinations({ isLoading: true });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    const skeletons = screen.getAllByTestId('agri-group-listing-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('also shows loading when the legacy `isLoading` prop is true (folded in)', () => {
    mockDestinations({ isLoading: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} isLoading={true} />);
    expect(screen.getAllByTestId('agri-group-listing-skeleton').length).toBeGreaterThanOrEqual(3);
  });

  it('does not render the towns list while loading', () => {
    mockDestinations({ isLoading: true, destinations: [makeBucket('a')] });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.queryByTestId('agri-group-locality-btn')).not.toBeInTheDocument();
  });
});

describe('AgriGroupSelectedPanel — C-F6 state 2: no destinations in scope', () => {
  it('renders the plain empty state when destinations=[] and no advanced filters are active', () => {
    mockDestinations({ destinations: [] });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No agricultural land for sale in this region')).toBeInTheDocument();
  });

  it('renders "for rent" empty state when intent=rent', () => {
    mockDestinations({ destinations: [] });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} intent="rent" />);
    expect(screen.getByText('No agricultural land for rent in this region')).toBeInTheDocument();
  });

  it('back-to-list button in empty state fires onClear', async () => {
    mockDestinations({ destinations: [] });
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} onClear={onClear} />);
    await user.click(screen.getByTestId('agri-group-back-btn'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupSelectedPanel — C-F6 state 3: destination empty under active filters', () => {
  it('renders the filtered-empty testid (distinct from the plain empty state) when an advanced filter is active', () => {
    mockDestinations({ destinations: [] });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} agriAcresMin={5} />);
    expect(screen.getByTestId('agri-filtered-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText(/no agricultural listings match/i)).toBeInTheDocument();
  });
});

describe('AgriGroupSelectedPanel — C-F6 state 4: retryable error (generic/network)', () => {
  it('renders the generic error state when the destinations fetch errors', () => {
    mockDestinations({ isError: true });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.getByTestId('agri-group-error-state')).toBeInTheDocument();
    expect(screen.getByText(/could not load listings/i)).toBeInTheDocument();
  });

  it('is distinct from the 503 not-yet-promoted state', () => {
    mockDestinations({ isError: true, isNotYetPromoted: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.getByTestId('agri-group-error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-not-promoted-state')).not.toBeInTheDocument();
  });

  it('retry button calls both onRetry (legacy listings retry) and the destinations refetch', async () => {
    mockDestinations({ isError: true });
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} onRetry={onRetry} />);
    await user.click(screen.getByTestId('agri-group-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(mockRefetchDestinations).toHaveBeenCalledTimes(1);
  });

  it('back-to-list button in error state fires onClear', async () => {
    mockDestinations({ isError: true });
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} onClear={onClear} />);
    await user.click(screen.getByTestId('agri-group-back-btn'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('also errors when the legacy `isError` prop is true (folded in)', () => {
    mockDestinations({ isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} isError={true} />);
    expect(screen.getByTestId('agri-group-error-state')).toBeInTheDocument();
  });
});

describe('AgriGroupSelectedPanel — C-F6 state 5: reference model unavailable (503 not-yet-promoted)', () => {
  it('renders a distinct not-promoted state, never the generic error state', () => {
    mockDestinations({ isNotYetPromoted: true, isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.getByTestId('agri-group-not-promoted-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-error-state')).not.toBeInTheDocument();
  });

  it('renders a distinct not-promoted state, never an empty-result state', () => {
    mockDestinations({ isNotYetPromoted: true, isError: false, destinations: [] });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.getByTestId('agri-group-not-promoted-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-filtered-empty-state')).not.toBeInTheDocument();
  });

  it('does NOT render a Retry button — this state is not shopper-retryable', () => {
    mockDestinations({ isNotYetPromoted: true, isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.queryByTestId('agri-group-retry-btn')).not.toBeInTheDocument();
  });

  it('back-to-list link still fires onClear', async () => {
    mockDestinations({ isNotYetPromoted: true, isError: false });
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} onClear={onClear} />);
    await user.click(screen.getByTestId('agri-group-back-btn'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('takes priority even when the (Level-3) listings isError prop is also true', () => {
    mockDestinations({ isNotYetPromoted: true, isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} isError={true} />);
    expect(screen.getByTestId('agri-group-not-promoted-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-error-state')).not.toBeInTheDocument();
  });
});

describe('AgriGroupSelectedPanel — #2151 Track 3 state: preview revision not generated', () => {
  it('renders a distinct not-generated-for-revision state, never the generic error or empty state', () => {
    mockDestinations({ isNotGeneratedForRevision: true, isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.getByTestId('agri-group-not-generated-for-revision-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-filtered-empty-state')).not.toBeInTheDocument();
  });

  it('does NOT render a Retry button — this state is not retryable', () => {
    mockDestinations({ isNotGeneratedForRevision: true, isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.queryByTestId('agri-group-retry-btn')).not.toBeInTheDocument();
  });

  it('back-to-list link still fires onClear', async () => {
    mockDestinations({ isNotGeneratedForRevision: true, isError: false });
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} onClear={onClear} />);
    await user.click(screen.getByTestId('agri-group-back-btn'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('is distinct from — and does not trigger — the not-yet-promoted state', () => {
    mockDestinations({ isNotGeneratedForRevision: true, isNotYetPromoted: false, isError: false });
    render(<AgriGroupSelectedPanel {...baseProps} listings={null} />);
    expect(screen.getByTestId('agri-group-not-generated-for-revision-state')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-not-promoted-state')).not.toBeInTheDocument();
  });
});

// ─── Issue #2151 PR C (C-F4) — server-supplied destination buckets ───────────

describe('AgriGroupSelectedPanel — destination buckets (towns list)', () => {
  it('renders one locality button per destination bucket, using displayName as the label', () => {
    mockDestinations({
      destinations: [
        makeBucket('IN|KA|Udupi|Shirva', { displayName: 'Shirva', parcelCount: 3 }),
        makeBucket('IN|KA|Udupi|Hebri', { displayName: 'Hebri', parcelCount: 1 }),
      ],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    expect(btns).toHaveLength(2);
    expect(btns[0]).toHaveTextContent('Shirva');
    expect(btns[1]).toHaveTextContent('Hebri');
  });

  it('preserves server-supplied bucket order (no client-side re-sort)', () => {
    mockDestinations({
      destinations: [
        makeBucket('c', { displayName: 'Zebra Town', parcelCount: 1 }),
        makeBucket('a', { displayName: 'Apple Town', parcelCount: 9 }),
        makeBucket('b', { displayName: 'Mango Town', parcelCount: 5 }),
      ],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    const btns = screen.getAllByTestId('agri-group-locality-btn');
    // Server order (Zebra, Apple, Mango) is preserved verbatim — NOT count-desc, NOT alpha.
    expect(btns[0]).toHaveTextContent('Zebra Town');
    expect(btns[1]).toHaveTextContent('Apple Town');
    expect(btns[2]).toHaveTextContent('Mango Town');
  });

  it('renders the bucket parcelCount (singular/plural)', () => {
    mockDestinations({
      destinations: [makeBucket('a', { displayName: 'Shirva', parcelCount: 1 })],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-locality-btn')).toHaveTextContent('1 parcel');
  });

  it('renders the bucket parcelAcreage total when present (2dp for fractional values)', () => {
    mockDestinations({
      destinations: [makeBucket('a', { displayName: 'Shirva', parcelCount: 2, parcelAcreage: 5.5 })],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-locality-acreage')).toHaveTextContent('5.50 acres total');
  });

  it('renders the bucket parcelAcreage total without decimals for a whole-number acreage', () => {
    mockDestinations({
      destinations: [makeBucket('a', { displayName: 'Shirva', parcelCount: 2, parcelAcreage: 6 })],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-locality-acreage')).toHaveTextContent('6 acres total');
  });

  it('omits the acreage line when parcelAcreage is undefined (absent from JSON)', () => {
    mockDestinations({
      destinations: [makeBucket('a', { displayName: 'Shirva', parcelCount: 2 })],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.queryByTestId('agri-group-locality-acreage')).not.toBeInTheDocument();
  });

  it('clicking a locality button calls onSelectLocality with the bucket areaKey (NOT display text)', async () => {
    const user = userEvent.setup();
    const onSelectLocality = vi.fn();
    mockDestinations({
      destinations: [makeBucket('IN|KA|Udupi|Shirva', { displayName: 'Shirva', parcelCount: 1 })],
    });
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={[]} onSelectLocality={onSelectLocality} />,
    );
    await user.click(screen.getByTestId('agri-group-locality-btn'));
    expect(onSelectLocality).toHaveBeenCalledTimes(1);
    expect(onSelectLocality).toHaveBeenCalledWith('IN|KA|Udupi|Shirva');
  });

  it('does not render inline listing rows for the towns view', () => {
    mockDestinations({
      destinations: [makeBucket('a', { displayName: 'Shirva', parcelCount: 1 })],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
  });
});

// ─── Aggregate hero / summary-band counts (now bucket-derived) ────────────────

describe('AgriGroupSelectedPanel — aggregate count (bucket-derived)', () => {
  it('renders plural parcel count in hero + summary band, summed across buckets (default intent=buy)', () => {
    mockDestinations({
      destinations: [
        makeBucket('a', { parcelCount: 3 }),
        makeBucket('b', { parcelCount: 2 }),
      ],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-listing-count')).toHaveTextContent('5');
    expect(screen.getByTestId('agri-group-listing-count')).toHaveTextContent('parcels');
    expect(screen.getByTestId('agri-group-count-band')).toHaveTextContent(
      'Agri parcels for sale · grouped into 2 towns',
    );
  });

  it('renders singular parcel count when the bucket sum is 1', () => {
    mockDestinations({ destinations: [makeBucket('a', { parcelCount: 1 })] });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-listing-count')).toHaveTextContent('1');
    expect(screen.getByTestId('agri-group-listing-count')).toHaveTextContent('parcel');
    expect(screen.getByTestId('agri-group-count-band')).toHaveTextContent(
      'Agri parcel for sale · grouped into 1 town',
    );
  });

  it('renders "for rent" count when intent=rent', () => {
    mockDestinations({
      destinations: [makeBucket('a', { parcelCount: 1 }), makeBucket('b', { parcelCount: 1 })],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} intent="rent" />);
    expect(screen.getByTestId('agri-group-count-band')).toHaveTextContent(
      'Agri parcels for rent · grouped into 2 towns',
    );
  });

  it('sums parcelAcreage across buckets for the summary-band total', () => {
    mockDestinations({
      destinations: [
        makeBucket('a', { parcelCount: 1, parcelAcreage: 3.5 }),
        makeBucket('b', { parcelCount: 1, parcelAcreage: 1.5 }),
      ],
    });
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-group-count-band')).toHaveTextContent('5.00 acres total');
  });
});

// ─── Issue #1445 — Distance chip row (unaffected by C-F4) ────────────────────

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
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.queryByTestId('distance-chip-10')).not.toBeInTheDocument();
  });
});

// ─── Issue #1457 — agri filters drawer (unaffected by C-F4) ──────────────────

async function openFiltersDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('agri-filters-trigger'));
  expect(await screen.findByTestId('agri-filters-panel')).toBeInTheDocument();
}

describe('AgriGroupSelectedPanel — agri filters drawer (Issue #1457)', () => {
  it('does NOT render the filter form until the Filters drawer is opened', () => {
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.queryByTestId('agri-filters-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('agri-filters-trigger')).toBeInTheDocument();
  });

  it('renders AgriFiltersPanel after opening the Filters drawer', async () => {
    const user = userEvent.setup();
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    await openFiltersDrawer(user);
    expect(screen.getByTestId('agri-filters-panel')).toBeInTheDocument();
  });

  it('calls onApplyFilters callback when Apply Filters clicked inside the drawer', async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    render(
      <AgriGroupSelectedPanel {...baseProps} listings={[]} onApplyFilters={onApplyFilters} />,
    );
    await openFiltersDrawer(user);
    await user.click(screen.getByTestId('agri-filters-apply'));
    expect(onApplyFilters).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupSelectedPanel — Filters button active-filter count', () => {
  it('shows no count badge when no advanced filters are active', () => {
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} />);
    expect(screen.queryByTestId('agri-filters-count')).not.toBeInTheDocument();
  });

  it('shows count = 1 when only the acreage range is set', () => {
    render(<AgriGroupSelectedPanel {...baseProps} listings={[]} agriAcresMin={5} />);
    expect(screen.getByTestId('agri-filters-count')).toHaveTextContent('1');
  });

  it('does NOT count distance/maxKm, region or intent toward the badge', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        intent="rent"
        selectedMaxKm={25}
        availableMaxDistances={ALL_TIERS}
      />,
    );
    expect(screen.queryByTestId('agri-filters-count')).not.toBeInTheDocument();
  });
});

// ─── Issue #2151 PR C (code-reviewer finding, HIGH) — fetch keys off citySlug, not cityLabel ──

describe('AgriGroupSelectedPanel — destination fetch uses citySlug, not cityLabel', () => {
  it('calls useAgriDestinations with the canonical slug even when cityLabel diverges from it', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        cityLabel="Sri Ganganagar"
        citySlug="sri-ganganagar"
      />,
    );
    const [cityArg] = mockUseAgriDestinations.mock.calls[0];
    expect(cityArg).toBe('sri-ganganagar');
  });

  it('does NOT derive the fetch key from cityLabel (would otherwise produce a spaced, non-matching string)', () => {
    render(
      <AgriGroupSelectedPanel
        {...baseProps}
        listings={[]}
        cityLabel="Sri Ganganagar"
        citySlug="sri-ganganagar"
      />,
    );
    const [cityArg] = mockUseAgriDestinations.mock.calls[0];
    expect(cityArg).not.toBe('sri ganganagar');
    expect(cityArg).toBe('sri-ganganagar');
  });
});
