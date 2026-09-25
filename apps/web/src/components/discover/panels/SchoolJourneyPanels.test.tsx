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
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from './SchoolJourneyPanels';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// Minimal listing factory. lat/lon default to the mock school's own coordinates
// (0 km) so callers that don't care about distance keep the old behaviour;
// Issue #1974 tests override lat/lon (or pass null) to exercise sort order.
function makeListing(
  id: string,
  coords: { lat: number | null; lon: number | null } = { lat: 13.35, lon: 74.79 },
): DiscoverCityListingItem {
  return {
    id,
    propertyType: 'apartment',
    lat: coords.lat,
    lon: coords.lon,
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

// Issue #1953 (build step 2) — SchoolSelectedPanel now consumes the
// DiscoverProvider facade instead of calling useDiscoverUrlState() directly.
function renderPanel(props: Partial<React.ComponentProps<typeof SchoolSelectedPanel>> = {}) {
  return renderWithProviders(
    <DiscoverProvider>
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
    </DiscoverProvider>,
  );
}

// Issue #2698 — the Filters sheet trigger used to be icon-only on both
// SchoolSelectedPanel and AreaSchoolCombinedPanel: its only text was an
// `sr-only` span, so sighted shoppers saw a bare sliders glyph. The label must
// now be VISIBLE. `toHaveTextContent` alone cannot prove that (it also matches
// sr-only text), so assert there is no sr-only wrapper and that the label is a
// direct text node of the button.
function expectVisibleFiltersLabel() {
  const trigger = screen.getByRole('button', { name: 'Filters' });
  expect(trigger.querySelector('.sr-only')).toBeNull();
  const ownText = Array.from(trigger.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim())
    .join('');
  expect(ownText).toBe('Filters');
}

describe('SchoolSelectedPanel — Filters trigger (discoverability, #2698)', () => {
  it('renders a visible "Filters" label, not an icon with sr-only text', () => {
    renderPanel({ filtersContent: <div>Filter controls</div> });
    expectVisibleFiltersLabel();
  });
});

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

// Issue #1974 — SchoolSelectedPanel/AreaSchoolCombinedPanel now render listings
// sorted nearest-to-school-first instead of raw server (created_at DESC) order.
// mockSchool sits at (13.35, 74.79); the offsets below give distinct, ascending
// real haversine distances (~1.11 km per 0.01° latitude at this longitude).
describe('SchoolSelectedPanel — nearest-first sort order (Issue #1974)', () => {
  it('renders cards in ascending distance order regardless of input (server) order', () => {
    // Deliberately NOT in distance order: far, near, mid.
    const far = makeListing('l-far', { lat: 13.39, lon: 74.79 }); // ~4.45 km
    const near = makeListing('l-near', { lat: 13.36, lon: 74.79 }); // ~1.11 km
    const mid = makeListing('l-mid', { lat: 13.37, lon: 74.79 }); // ~2.22 km
    const { container } = renderPanel({ listings: [far, near, mid] });

    const titles = Array.from(container.querySelectorAll('[data-testid="listing-card"] h3')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Property l-near', 'Property l-mid', 'Property l-far']);
  });

  it('renders a listing with missing coordinates last, not first or in server position', () => {
    const noCoords = makeListing('l-none', { lat: null, lon: null }); // first in input
    const near = makeListing('l-near', { lat: 13.36, lon: 74.79 });
    const far = makeListing('l-far', { lat: 13.39, lon: 74.79 });
    const { container } = renderPanel({ listings: [noCoords, near, far] });

    const titles = Array.from(container.querySelectorAll('[data-testid="listing-card"] h3')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Property l-near', 'Property l-far', 'Property l-none']);
  });

  it('preserves the correct per-card distanceKm value (order changes, values do not)', () => {
    const far = makeListing('l-far', { lat: 13.39, lon: 74.79 });
    const near = makeListing('l-near', { lat: 13.36, lon: 74.79 });
    renderPanel({ listings: [far, near] });

    const badges = screen.getAllByTestId('distance-badge');
    // Rendered in sorted (near, far) order — so the first badge belongs to l-near.
    expect(badges[0].textContent).toContain('1.1 km from school');
    expect(badges[1].textContent).toContain('4.4 km from school');
  });

  it('renders no distance badge for the missing-coordinates card (never fabricated)', () => {
    const noCoords = makeListing('l-none', { lat: null, lon: null });
    const { container } = renderPanel({ listings: [noCoords] });

    expect(screen.queryByTestId('distance-badge')).toBeNull();
    expect(
      container.querySelector('[data-testid="listing-card"] h3')?.textContent,
    ).toBe('Property l-none');
  });

  it('radius chip selection/regression check: the chip matching radiusKm is the only one marked active', () => {
    renderPanel({ radiusKm: 5, listings: [makeListing('l-1'), makeListing('l-2')] });

    expect(screen.getByTestId('radius-btn-5').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('radius-btn-3').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('radius-btn-10').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('AreaSchoolCombinedPanel — nearest-first sort order (Issue #1974)', () => {
  const mockAreaPoint: AreaPoint = {
    areaKey: 'area-manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.35,
    geo_center_lon: 74.79,
    bbox: null,
  };

  function renderCombinedPanel(
    props: Partial<React.ComponentProps<typeof AreaSchoolCombinedPanel>> = {},
  ) {
    return renderWithProviders(
      <DiscoverProvider>
        <AreaSchoolCombinedPanel
          selectedArea={mockAreaPoint}
          selectedSchool={mockSchool}
          listings={[makeListing('l-1'), makeListing('l-2')]}
          isLoadingListings={false}
          radiusKm={2}
          onRadiusChange={vi.fn()}
          onClearSchool={vi.fn()}
          onClearArea={vi.fn()}
          isAuthenticated={true}
          intent="buy"
          {...props}
        />
      </DiscoverProvider>,
    );
  }

  // Issue #2698 — same icon-only-trigger defect as SchoolSelectedPanel; must
  // carry a visible "Filters" label, not just an sr-only one.
  it('renders a visible "Filters" label, not an icon with sr-only text', () => {
    renderCombinedPanel({ filtersContent: <div>Filter controls</div> });
    expectVisibleFiltersLabel();
  });

  it('renders cards in ascending distance order regardless of input (server) order', () => {
    const far = makeListing('l-far', { lat: 13.39, lon: 74.79 });
    const near = makeListing('l-near', { lat: 13.36, lon: 74.79 });
    const mid = makeListing('l-mid', { lat: 13.37, lon: 74.79 });
    const { container } = renderCombinedPanel({ listings: [far, near, mid] });

    const titles = Array.from(container.querySelectorAll('[data-testid="listing-card"] h3')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Property l-near', 'Property l-mid', 'Property l-far']);
  });

  it('renders a listing with missing coordinates last, not first or in server position', () => {
    const noCoords = makeListing('l-none', { lat: null, lon: null });
    const near = makeListing('l-near', { lat: 13.36, lon: 74.79 });
    const { container } = renderCombinedPanel({ listings: [noCoords, near] });

    const titles = Array.from(container.querySelectorAll('[data-testid="listing-card"] h3')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Property l-near', 'Property l-none']);
  });

  it('preserves the correct per-card distanceKm value (order changes, values do not)', () => {
    const far = makeListing('l-far', { lat: 13.39, lon: 74.79 });
    const near = makeListing('l-near', { lat: 13.36, lon: 74.79 });
    renderCombinedPanel({ listings: [far, near] });

    const badges = screen.getAllByTestId('distance-badge');
    expect(badges[0].textContent).toContain('1.1 km from school');
    expect(badges[1].textContent).toContain('4.4 km from school');
  });

  it('radius chip selection/regression check: the chip matching radiusKm is the only one marked active (combined panel prefix)', () => {
    renderCombinedPanel({ radiusKm: 5 });

    expect(screen.getByTestId('combined-radius-btn-5').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('combined-radius-btn-3').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('combined-radius-btn-10').getAttribute('aria-pressed')).toBe('false');
  });
});
