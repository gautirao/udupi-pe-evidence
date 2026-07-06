/**
 * Tests for AgriGroupLocalityPanel (Issue #1464)
 *
 * Covers:
 * - Header renders locality name and count
 * - Close button fires onClose
 * - Listings sorted by id ascending (deterministic)
 * - onSelectListing called with correct id on row click
 * - Loading state: skeletons, no listing rows
 * - Error state: message + retry + back buttons
 * - Empty state: message + back button
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AgriGroupLocalityPanel } from '../AgriGroupLocalityPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeListing = (id: string, overrides: Partial<AgriMapListingItem> = {}): AgriMapListingItem => ({
  id,
  areaKey: 'IN|KA|Udupi|Shirva',
  latitude: 13.2,
  longitude: 74.8,
  propertyType: 'agricultural_land',
  locality: 'Shirva',
  landArea: 1.5,
  landAreaUnit: 'acre',
  ...overrides,
});

const noop = () => {};

const baseProps = {
  localityName: 'Shirva',
  listings: [],
  isLoading: false,
  isError: false,
  onRetry: noop,
  onSelectListing: noop,
  onClose: noop,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgriGroupLocalityPanel — header', () => {
  it('renders the locality name in the header', () => {
    render(<AgriGroupLocalityPanel {...baseProps} />);
    expect(screen.getByTestId('agri-locality-name')).toHaveTextContent('Shirva');
  });

  it('renders count in hero stats (plural, default intent=buy → "for sale")', () => {
    const listings = [makeListing('l1'), makeListing('l2')];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} />);
    expect(screen.getByTestId('agri-locality-count')).toHaveTextContent('2');
    expect(screen.getByTestId('agri-locality-count')).toHaveTextContent('parcels for sale');
  });

  it('renders count in hero stats (singular, default intent=buy → "for sale")', () => {
    const listings = [makeListing('l1')];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} />);
    expect(screen.getByTestId('agri-locality-count')).toHaveTextContent('1');
    expect(screen.getByTestId('agri-locality-count')).toHaveTextContent('parcel for sale');
  });

  it('renders "for rent" count when intent=rent', () => {
    const listings = [makeListing('l1'), makeListing('l2')];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} intent="rent" />);
    expect(screen.getByTestId('agri-locality-count')).toHaveTextContent('parcels for rent');
  });

  it('close button calls onClose when clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgriGroupLocalityPanel {...baseProps} onClose={onClose} />);
    await user.click(screen.getByTestId('agri-locality-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupLocalityPanel — listings state', () => {
  it('renders one row per listing', () => {
    const listings = [makeListing('l1'), makeListing('l2'), makeListing('l3')];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} />);
    expect(screen.getAllByTestId('agri-locality-listing-row')).toHaveLength(3);
  });

  it('listings are sorted by id ascending regardless of input order', () => {
    // Input order: z3, z1, z2 — rendered order must be z1, z2, z3
    const listings = [
      makeListing('z3'),
      makeListing('z1'),
      makeListing('z2'),
    ];
    const onSelectListing = vi.fn();
    render(
      <AgriGroupLocalityPanel
        {...baseProps}
        listings={listings}
        onSelectListing={onSelectListing}
      />,
    );
    const rows = screen.getAllByTestId('agri-locality-listing-row');
    // Click first row — must be z1 (lowest id alphabetically)
    rows[0].click();
    expect(onSelectListing).toHaveBeenCalledWith('z1');
  });

  it('clicking a listing row fires onSelectListing with the correct id', async () => {
    const user = userEvent.setup();
    const onSelectListing = vi.fn();
    const listings = [makeListing('abc-id'), makeListing('xyz-id')];
    render(
      <AgriGroupLocalityPanel
        {...baseProps}
        listings={listings}
        onSelectListing={onSelectListing}
      />,
    );
    const rows = screen.getAllByTestId('agri-locality-listing-row');
    await user.click(rows[0]);
    // id ascending: abc-id < xyz-id, so first row = abc-id
    expect(onSelectListing).toHaveBeenCalledWith('abc-id');
  });

  it('does not mutate the listings prop array when sorting', () => {
    const listings = [makeListing('z3'), makeListing('z1')];
    const original = [...listings];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} />);
    // The original array must not have been mutated
    expect(listings).toEqual(original);
  });
});

describe('AgriGroupLocalityPanel — loading state', () => {
  it('renders skeleton rows when isLoading=true', () => {
    render(<AgriGroupLocalityPanel {...baseProps} isLoading={true} />);
    const skeletons = screen.getAllByTestId('agri-locality-listing-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('does not render listing rows when isLoading=true', () => {
    const listings = [makeListing('l1')];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} isLoading={true} />);
    expect(screen.queryByTestId('agri-locality-listing-row')).not.toBeInTheDocument();
  });
});

describe('AgriGroupLocalityPanel — error state', () => {
  it('renders error state when isError=true', () => {
    render(<AgriGroupLocalityPanel {...baseProps} isError={true} />);
    expect(screen.getByTestId('agri-locality-error-state')).toBeInTheDocument();
  });

  it('retry button fires onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<AgriGroupLocalityPanel {...baseProps} isError={true} onRetry={onRetry} />);
    await user.click(screen.getByTestId('agri-locality-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('back button in error state fires onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgriGroupLocalityPanel {...baseProps} isError={true} onClose={onClose} />);
    // back button in error state
    const backBtn = screen.getByTestId('agri-locality-back-btn');
    await user.click(backBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AgriGroupLocalityPanel — empty state', () => {
  it('renders empty state when listings is empty array', () => {
    render(<AgriGroupLocalityPanel {...baseProps} listings={[]} />);
    expect(screen.getByTestId('agri-locality-empty-state')).toBeInTheDocument();
  });

  it('back button in empty state fires onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgriGroupLocalityPanel {...baseProps} listings={[]} onClose={onClose} />);
    await user.click(screen.getByTestId('agri-locality-back-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Issue #1547 — agri card variant: anon price gate (no-leak) + selection ────
describe('AgriGroupLocalityPanel — anon price gate (no-leak)', () => {
  // NON-NULL price so the anon assertion cannot false-pass on a missing value.
  const priced = makeListing('p1', { pricePaise: 7500000 * 100, landArea: 2, landAreaUnit: 'acre' });

  it('anonymous: shows "Sign in to view price" and never a rupee value', () => {
    const { container } = render(
      <AgriGroupLocalityPanel {...baseProps} listings={[priced]} isAuthenticated={false} />,
    );
    expect(screen.getByTestId('agri-locality-price-signin')).toBeInTheDocument();
    // No rupee glyph anywhere in the parcel cards (the static "< ₹1 Cr" filter
    // PILL LABELS are constants, not listing data, so the ₹ guard is scoped to
    // the listings list — the actual leak surface).
    const list = screen.getByTestId('agri-locality-listings-list');
    expect(list.textContent).not.toMatch(/₹/);
    // No price VALUE anywhere in the whole panel.
    expect(container.textContent).not.toMatch(/75,00,000|7,500,000/);
  });

  it('authenticated: shows the formatted rupee price (same fixture)', () => {
    const { container } = render(
      <AgriGroupLocalityPanel {...baseProps} listings={[priced]} isAuthenticated />,
    );
    expect(screen.queryByTestId('agri-locality-price-signin')).not.toBeInTheDocument();
    expect(container.textContent).toMatch(/₹/);
  });

  it('authenticated with no price: shows "Price on request", no rupee value', () => {
    const noPrice = makeListing('np', { pricePaise: null });
    render(
      <AgriGroupLocalityPanel {...baseProps} listings={[noPrice]} isAuthenticated />,
    );
    expect(screen.getByText('Price on request')).toBeInTheDocument();
    // ₹ guard scoped to the parcel cards; static filter pill labels contain ₹.
    const list = screen.getByTestId('agri-locality-listings-list');
    expect(list.textContent).not.toMatch(/₹/);
  });
});

describe('AgriGroupLocalityPanel — selected state + chips', () => {
  it('marks the matching row aria-pressed + data-selected', () => {
    const listings = [makeListing('a'), makeListing('b')];
    render(<AgriGroupLocalityPanel {...baseProps} listings={listings} selectedListingId="b" />);
    const rows = screen.getAllByTestId('agri-locality-listing-row');
    const selected = rows.find((r) => r.getAttribute('data-selected') === 'true');
    expect(selected).toBeTruthy();
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    // The non-selected row is not marked.
    expect(rows.filter((r) => r.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('renders agri spec chips, omitting null/false fields', () => {
    const listing = makeListing('c', {
      landCategory: 'FARMLAND',
      waterSource: 'BOREWELL',
      farmhouseAvailable: true,
      fencingDone: false, // false → omitted (null != false)
    });
    render(<AgriGroupLocalityPanel {...baseProps} listings={[listing]} />);
    expect(screen.getByText('Farmland')).toBeInTheDocument();
    expect(screen.getByText('Borewell')).toBeInTheDocument();
    expect(screen.getByText('Farmhouse')).toBeInTheDocument();
    expect(screen.queryByText('Fenced')).not.toBeInTheDocument();
  });
});
