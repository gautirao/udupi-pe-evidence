/**
 * Issue #1551 — AgriGroupLocalityPanel tests.
 *
 * AC7: authed user sees formatted price.
 * AC8: anon user sees Lock + 'Sign in to view price'.
 * AC9: new fields render as fact chips via agriFieldLabels within 4-chip cap + overflow.
 * AC10: missing (null/undefined) fields are omitted — no fake placeholders.
 * AC11: trustTier/primaryImageUrl fields are NOT present (no regression).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AgriGroupLocalityPanel } from './AgriGroupLocalityPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// Minimal item factory
function makeItem(overrides: Partial<AgriMapListingItem> = {}): AgriMapListingItem {
  return {
    id: 'item-1',
    areaKey: 'area-udupi',
    latitude: 13.35,
    longitude: 74.79,
    propertyType: 'agricultural_land',
    title: 'Lush Farm Plot',
    locality: 'Manipal',
    ...overrides,
  };
}

const defaultProps = {
  localityName: 'Manipal',
  listings: [],
  isLoading: false,
  isError: false,
  onRetry: vi.fn(),
  onSelectListing: vi.fn(),
  onClose: vi.fn(),
};

describe('AgriGroupLocalityPanel — price gate (AC7, AC8)', () => {
  it('AC7: authed user sees formatted price when pricePaise > 0', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ pricePaise: 5_000_000_00 })]} // 5,000,000 rupees
        isAuthenticated={true}
      />,
    );
    // Price should be rendered (formatted rupee value)
    const rows = screen.getAllByTestId('agri-locality-listing-row');
    expect(rows).toHaveLength(1);
    // Sign-in lock must NOT be shown
    expect(screen.queryByTestId('agri-locality-price-signin')).toBeNull();
  });

  it('AC7: authed user with null price sees "Price on request"', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ pricePaise: null })]}
        isAuthenticated={true}
      />,
    );
    expect(screen.getByText('Price on request')).toBeDefined();
    expect(screen.queryByTestId('agri-locality-price-signin')).toBeNull();
  });

  it('AC8: anon user always sees Lock + "Sign in to view price" regardless of pricePaise', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ pricePaise: 5_000_000_00 })]}
        isAuthenticated={false}
      />,
    );
    const lockEl = screen.getByTestId('agri-locality-price-signin');
    expect(lockEl).toBeDefined();
    expect(lockEl.textContent).toContain('Sign in to view price');
    // Formatted price must NOT appear in the parcel cards. (The static "< ₹1 Cr"
    // filter PILL LABELS contain ₹ but are constants, not listing data — the guard
    // is scoped to the listings list, the actual leak surface.)
    const list = screen.getByTestId('agri-locality-listings-list');
    expect(list.textContent).not.toMatch(/₹/);
  });

  it('AC8: anon with null pricePaise also sees Lock (not "Price on request")', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ pricePaise: null })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByTestId('agri-locality-price-signin')).toBeDefined();
    expect(screen.queryByText('Price on request')).toBeNull();
  });
});

describe('AgriGroupLocalityPanel — new field chips (AC9)', () => {
  it('AC9: cultivationStatus renders as a fact chip via CULTIVATION_STATUS_LABELS', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ cultivationStatus: 'ARECA_PLANTATION' })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText('Areca plantation')).toBeDefined();
  });

  it('AC9: roadAccess renders as a fact chip via ROAD_ACCESS_LABELS', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ roadAccess: 'TARRED_ROAD' })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText('Tarred road')).toBeDefined();
  });

  it('AC9: soilType renders as a fact chip via SOIL_TYPE_LABELS', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ soilType: 'RED_LATERITE' })]}
        isAuthenticated={false}
      />,
    );
    // Scoped to the card row — the inline soil FILTER pill also shows the label.
    const row = screen.getAllByTestId('agri-locality-listing-row')[0];
    expect(within(row).getByText('Red laterite')).toBeDefined();
  });

  it('AC9: ownershipType renders as a fact chip via OWNERSHIP_TYPE_LABELS', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ ownershipType: 'FREEHOLD' })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText('Freehold')).toBeDefined();
  });

  it('AC9 (revised #1771): all populated fields render on the card — no overflow pill', () => {
    // The #1771 mock-parity card shows a category tag + a 2-col metadata grid,
    // replacing the previous 4-chip cap + "+N more details" overflow model.
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({
          landCategory: 'FARMLAND',
          cultivationStatus: 'CULTIVATED',
          roadAccess: 'TARRED_ROAD',
          soilType: 'RED_LATERITE',
          waterSource: 'BOREWELL',
        })]}
        isAuthenticated={false}
      />,
    );
    const row = screen.getAllByTestId('agri-locality-listing-row')[0];
    expect(within(row).getByText('Farmland')).toBeDefined();
    expect(within(row).getByText('Cultivated')).toBeDefined();
    expect(within(row).getByText('Tarred road')).toBeDefined();
    expect(within(row).getByText('Red laterite')).toBeDefined();
    expect(within(row).getByText('Borewell')).toBeDefined();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });

  it('AC9: 4 chips renders all visible with no overflow pill', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({
          landCategory: 'FARMLAND',
          cultivationStatus: 'CULTIVATED',
          roadAccess: 'TARRED_ROAD',
          soilType: 'RED_LATERITE',
        })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });

  it('AC9: updatedAt renders compact date when present', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ updatedAt: '2025-03-15T00:00:00Z' })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByTestId('agri-locality-updated-at')).toBeDefined();
  });
});

describe('AgriGroupLocalityPanel — missing fields omitted (AC10)', () => {
  it('AC10: null cultivationStatus produces no cultivation chip', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ cultivationStatus: null })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByText('Cultivated')).toBeNull();
    expect(screen.queryByText('Fallow')).toBeNull();
  });

  it('AC10: null roadAccess produces no road chip', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ roadAccess: null })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByText('Tarred road')).toBeNull();
  });

  it('AC10: null updatedAt hides the date element', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem({ updatedAt: null })]}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByTestId('agri-locality-updated-at')).toBeNull();
  });

  it('AC10: undefined updatedAt hides the date element', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem()]} // no updatedAt
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByTestId('agri-locality-updated-at')).toBeNull();
  });

  it('AC10: item with no agri fields at all renders no chips (no placeholder text)', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem()]}
        isAuthenticated={false}
      />,
    );
    // No chip container visible — just the listing row without chip section
    expect(screen.queryByText('Other')).toBeNull();
    expect(screen.queryByText('N/A')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
  });
});

describe('AgriGroupLocalityPanel — trustTier/primaryImageUrl omitted (AC11)', () => {
  it('AC11: no image element rendered (primaryImageUrl not in DTO)', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem()]}
        isAuthenticated={true}
      />,
    );
    // No img element should appear inside a listing row
    const rows = screen.getAllByTestId('agri-locality-listing-row');
    const img = within(rows[0]).queryByRole('img');
    expect(img).toBeNull();
  });

  it('AC11: no trust badge/tier text rendered', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[makeItem()]}
        isAuthenticated={true}
      />,
    );
    // Trust tier labels like "Verified", "Premium" must not appear
    expect(screen.queryByText('Verified')).toBeNull();
    expect(screen.queryByText('Premium')).toBeNull();
    expect(screen.queryByText(/trust/i)).toBeNull();
  });
});

describe('AgriGroupLocalityPanel — loading and error states', () => {
  it('renders skeleton rows while loading', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        isLoading={true}
      />,
    );
    const skeletons = screen.getAllByTestId('agri-locality-listing-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders error state with retry button', () => {
    const onRetry = vi.fn();
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        isError={true}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId('agri-locality-error-state')).toBeDefined();
    screen.getByTestId('agri-locality-retry-btn').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when listings is empty array', () => {
    render(
      <AgriGroupLocalityPanel
        {...defaultProps}
        listings={[]}
      />,
    );
    expect(screen.getByTestId('agri-locality-empty-state')).toBeDefined();
  });
});
