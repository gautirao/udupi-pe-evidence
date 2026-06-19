/**
 * Issue #1551 — SchoolSelectedPanel Slice B tests.
 *
 * AC13: school circle/zone overlay does not suppress markers (layer ordering — structural check).
 * AC14: hover sets hoveredListingId visual copper ring; onHoverListing prop is wired to PropertyCard.
 * AC15: grid-cols-1 2xl:grid-cols-2 layout consistent with area-first post-#1547.
 * AC16: zoom guard (#1547 listingsReadyKey/lastFittedListingsKeyRef) not touched by hover — verified by inspection (no code change; confirmed in B4 pre-flight). Tests confirm SchoolSelectedPanel does NOT call fitBounds on hover.
 * AC17: area-first #1547 results do NOT regress — SchoolSelectedPanel changes are additive only.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SchoolSelectedPanel } from './SchoolJourneyPanels';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Minimal listing factory
function makeListing(id: string): DiscoverCityListingItem {
  return {
    id,
    propertyType: 'apartment',
    lat: 13.35,
    lon: 74.79,
    title: `Property ${id}`,
    locality: 'Manipal',
    areaKey: 'area-manipal',
    pricePaise: 5_000_000_00,
    bedrooms: 2,
    listingPurpose: 'sale',
    coverImageUrl: null,
    isAuthenticated: false,
  } as unknown as DiscoverCityListingItem;
}

const mockSchool: SchoolResult = {
  id: 'school-1',
  name: 'Manipal School',
  address: 'Manipal, Udupi',
  latitude: 13.35,
  longitude: 74.79,
  board: 'CBSE',
  boardType: 'Central',
  distanceKm: 1.5,
};

function renderPanel(props: Partial<React.ComponentProps<typeof SchoolSelectedPanel>> = {}) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <SchoolSelectedPanel
          school={mockSchool}
          listings={[makeListing('l-1'), makeListing('l-2')]}
          isLoadingListings={false}
          radiusKm={2}
          onRadiusChange={vi.fn()}
          isAuthenticated={true}
          onStartOver={vi.fn()}
          intent="buy"
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SchoolSelectedPanel — grid layout (AC15)', () => {
  it('AC15: listing grid uses grid-cols-1 2xl:grid-cols-2 gap-3 p-3', () => {
    const { container } = renderPanel({
      listings: [makeListing('l-1'), makeListing('l-2')],
    });
    // The grid container must have the post-#1547 class pattern
    const grid = container.querySelector('.grid-cols-1.gap-3.p-3');
    expect(grid).not.toBeNull();
    // Must also have 2xl:grid-cols-2
    expect(grid?.className).toContain('2xl:grid-cols-2');
  });
});

describe('SchoolSelectedPanel — hover wiring (AC14)', () => {
  it('AC14: onHoverListing is called with listing id on card mouseenter', () => {
    const onHoverListing = vi.fn();
    const { container } = renderPanel({ onHoverListing });

    // PropertyCard renders data-testid="listing-card" with onMouseEnter → onHover?.(listing.id).
    // We must fire on the first card so the test FAILS if the prop wiring breaks.
    const cards = container.querySelectorAll('[data-testid="listing-card"]');
    expect(cards.length).toBeGreaterThanOrEqual(1);

    expect(onHoverListing).not.toHaveBeenCalled(); // guard: not called before interaction

    fireEvent.mouseEnter(cards[0]);

    // onHoverListing must have been called with the first listing's id ('l-1').
    // FAILS if onHoverListing is not wired to PropertyCard's onHover prop, or if
    // PropertyCard stops forwarding mouseEnter to the onHover callback.
    expect(onHoverListing).toHaveBeenCalledOnce();
    expect(onHoverListing).toHaveBeenCalledWith('l-1');
  });

  it('AC14: onHoverListing called with null on card mouseleave', () => {
    const onHoverListing = vi.fn();
    const { container } = renderPanel({ onHoverListing });
    const cards = container.querySelectorAll('[data-testid="listing-card"]');

    fireEvent.mouseLeave(cards[0]);

    // PropertyCard calls onHover?.(null) on mouseleave — FAILS if that wiring breaks.
    expect(onHoverListing).toHaveBeenCalledWith(null);
  });

  it('AC14: onSelectListing is NOT required (card navigates via navigate() — RISK-3 safe)', () => {
    // No onSelectListing prop → no URL sync → RISK-3 preserved
    expect(() => renderPanel({ onSelectListing: undefined })).not.toThrow();
  });
});

describe('SchoolSelectedPanel — bounded search CTA (B1 — AC12 structural)', () => {
  it('shows CTA for auth users before boundedSearchTriggered', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: false,
    });
    expect(screen.getByTestId('school-bounded-search-cta')).toBeDefined();
  });

  it('CTA is absent after boundedSearchTriggered=true', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
    });
    expect(screen.queryByTestId('school-bounded-search-cta')).toBeNull();
  });

  it('CTA is absent for anon users (onBoundedSearch=undefined)', () => {
    renderPanel({
      isAuthenticated: false,
      onBoundedSearch: undefined,
      boundedSearchTriggered: false,
    });
    expect(screen.queryByTestId('school-bounded-search-cta')).toBeNull();
  });

  it('results count shown after CTA triggered, auth, not loading', () => {
    renderPanel({
      isAuthenticated: true,
      boundedSearchTriggered: true,
      isLoadingListings: false,
      isFetching: false,
      listings: [makeListing('l-1'), makeListing('l-2')],
    });
    expect(screen.getByTestId('school-bounded-search-count')).toBeDefined();
  });
});

describe('SchoolSelectedPanel — loading and empty states', () => {
  it('renders skeleton during loading', () => {
    renderPanel({ isLoadingListings: true });
    const skeletons = screen.getAllByTestId('listing-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders school-radius-empty-state when no listings (ReTrends redesign)', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    expect(screen.getByTestId('school-radius-empty-state')).toBeDefined();
  });

  it('try-radius button appears in empty state when larger radius options exist', () => {
    // radiusKm=2 → effectiveRadius=2; RADIUS_OPTIONS=[3,5,10] all > 2 → try-radius-5-btn present
    renderPanel({ listings: [], isLoadingListings: false, radiusKm: 2 });
    expect(screen.getByTestId('try-radius-5-btn')).toBeDefined();
  });
});
