/**
 * SchoolSelectedPanel — DOM-order oracle (Issue #2661 commit 1, characterization).
 *
 * Locks in the render order of the major sections inside the single scroll
 * container (`school-selected-scroll`):
 *   summary-band-or-skeleton -> radius chips -> bounded-search CTA/count (if present)
 *   -> result heading -> listing body.
 *
 * A later extraction (#2661 commits 2-6) that accidentally reorders these
 * sections fails loudly here even though every individual field-level test in
 * SchoolSelectedPanel.test.tsx would still pass (those assert presence/wiring
 * per section in isolation, never relative order). Pattern follows #1838's
 * DescribeStep.domOrder.test.tsx (ordered data-testid capture via querySelectorAll).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel } from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockSchool: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

const makeListing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 500000000,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat: 13.354,
  lon: 74.791,
});

/** Ordered list of every `data-testid` in the scroll container, in DOM order. */
function scrollTestIdOrder(container: HTMLElement): string[] {
  const scroll = container.querySelector('[data-testid="school-selected-scroll"]');
  if (!scroll) return [];
  return Array.from(scroll.querySelectorAll('[data-testid]')).map(
    (el) => el.getAttribute('data-testid') ?? '',
  );
}

interface FlatOverrides {
  school?: SchoolResult | null;
  listings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onBoundedSearch?: () => void;
  boundedSearchTriggered?: boolean;
}

function renderPanel(props: FlatOverrides = {}) {
  const {
    school = mockSchool,
    listings = [makeListing('l-1')],
    isLoadingListings = false,
    isAuthenticated = false,
    onBoundedSearch,
    boundedSearchTriggered,
  } = props;
  return renderWithProviders(
    <DiscoverProvider>
      <SchoolSelectedPanel
        view={{
          chrome: {},
          viewer: { isAuthenticated },
          school,
          radius: { km: 3 },
          listings: { data: listings, loading: isLoadingListings },
          propertyFilters: { value: {} },
          boundedSearch: { triggered: boundedSearchTriggered },
        }}
        commands={{
          chrome: {},
          radius: { change: vi.fn() },
          listings: {},
          propertyFilters: { replace: vi.fn() },
          boundedSearch: onBoundedSearch ? { trigger: onBoundedSearch } : undefined,
        }}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

describe('SchoolSelectedPanel — DOM-order oracle (Issue #2661)', () => {
  it('loaded, with results and the bounded-search count line: summary -> radius-btn -> bounded-search-count -> result-heading -> listings-body', () => {
    const { container } = renderPanel({
      listings: [makeListing('l-1'), makeListing('l-2')],
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
    });
    const order = scrollTestIdOrder(container);
    // Only the anchor testids relevant to section order are asserted (not an
    // exhaustive list — the full inventory is covered by the separate testid-
    // inventory test), each present exactly once here.
    expect(order).toEqual([
      'school-summary-band',
      'school-summary-name',
      'change-school-btn',
      'school-summary-count',
      'radius-btn-3',
      'radius-btn-5',
      'radius-btn-10',
      'school-bounded-search-count',
      'radius-result-heading',
      'radius-result-count',
      'school-listings-body',
      'listing-card',
      'listing-save-button',
      'distance-badge',
      'listing-view-details',
      'listing-card',
      'listing-save-button',
      'distance-badge',
      'listing-view-details',
    ]);
  });

  it('cold-load skeleton: skeleton -> radius chips -> listings-body (no result heading, no bounded-search line)', () => {
    const { container } = renderPanel({ school: null, listings: [], isLoadingListings: true });
    const order = scrollTestIdOrder(container);
    expect(order).toEqual([
      'school-summary-skeleton',
      'radius-btn-3',
      'radius-btn-5',
      'radius-btn-10',
      'school-listings-body',
      'listing-skeleton',
      'listing-skeleton',
      'listing-skeleton',
    ]);
  });

  it('bounded-search CTA (not yet triggered) appears before the listing body', () => {
    const { container } = renderPanel({
      listings: [],
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: false,
    });
    const order = scrollTestIdOrder(container);
    const ctaIdx = order.indexOf('school-bounded-search-cta');
    const bodyIdx = order.indexOf('school-listings-body');
    expect(ctaIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(ctaIdx);
  });
});
