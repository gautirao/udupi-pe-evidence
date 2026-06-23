/**
 * AreaGroupResultsPanel — anon preview banner (Issue #1597)
 *
 * AC assertions:
 *   1. Anon + totalGroupCount > listings.length → preview banner renders with the correct
 *      shownCount / groupName substituted; the sign-in nudge link is present and points
 *      to /auth?returnTo=/discover; the full totalCount is shown in the nudge.
 *   2. Authenticated user → preview banner is NOT rendered regardless of counts.
 *   3. Anon + shownCount >= totalGroupCount → preview banner is suppressed (teaser shows
 *      everything; no nudge needed).
 *   4. totalGroupCount undefined (areas not yet loaded) → banner suppressed.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { AreaGroupResultsPanel } from '../AreaGroupResultsPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverListingItem } from '@/hooks/useDiscoverListings';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COASTAL_GROUP: AreaGroup = {
  id: 'coastal-homes',
  name: 'Coastal Homes',
  area_keys: ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Ullal'],
  subtitle: 'Sea-facing properties',
  description: null,
  region_label: null,
  school_count: 0,
};

function makeListing(id: string): DiscoverListingItem {
  return {
    id,
    listingNumber: null,
    propertyType: 'house',
    title: `Listing ${id}`,
    locality: 'Malpe',
    areaKey: null,
    pricePaise: 5000000,
    landArea: null,
    landAreaUnit: null,
    builtArea: null,
    builtAreaUnit: null,
    bedrooms: 3,
    latitude: 13.354,
    longitude: 74.708,
    heroImageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    firstPublishedAt: null,
    lastUpdatedAt: null,
    daysOnMarket: 0,
    backOnMarket: false,
    reraNumber: null,
    reraValid: false,
    trustTier: null,
    possessionStatus: null,
    sellerType: null,
    listingPurpose: 'sale',
    status: 'active',
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function renderPanel(overrides: Partial<React.ComponentProps<typeof AreaGroupResultsPanel>> = {}) {
  const defaults: React.ComponentProps<typeof AreaGroupResultsPanel> = {
    group: COASTAL_GROUP,
    cityLabel: 'Udupi',
    listings: [makeListing('l1'), makeListing('l2')],
    isLoading: false,
    isError: false,
    isAuthenticated: false,
    totalGroupCount: 10,
  };
  render(
    <BrowserRouter>
      <AreaGroupResultsPanel {...defaults} {...overrides} />
    </BrowserRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AreaGroupResultsPanel — anon preview banner (Issue #1597)', () => {
  it('AC1: anon + totalGroupCount > shownCount → banner renders with correct shownCount / groupName / totalCount', () => {
    renderPanel({
      listings: [makeListing('l1'), makeListing('l2')], // shownCount = 2
      totalGroupCount: 10,                               // totalCount = 10 > 2
      isAuthenticated: false,
    });

    const banner = screen.getByTestId('area-group-results-anon-banner');
    expect(banner).toBeInTheDocument();

    // Header line: "Showing a preview of 2 properties across Coastal Homes"
    expect(banner).toHaveTextContent('Showing a preview of');
    expect(banner).toHaveTextContent('2');
    expect(banner).toHaveTextContent('Coastal Homes');

    // Sign-in nudge: link text contains totalCount
    const signInLink = screen.getByTestId('area-group-results-anon-signin');
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveTextContent('Sign in to view all 10');

    // Link points to the app's existing sign-in route with returnTo
    expect(signInLink).toHaveAttribute('href', '/auth?returnTo=/discover');
  });

  it('AC2: authenticated user → banner is NOT rendered', () => {
    renderPanel({
      listings: [makeListing('l1'), makeListing('l2')],
      totalGroupCount: 10,
      isAuthenticated: true, // authenticated
    });

    expect(screen.queryByTestId('area-group-results-anon-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-results-anon-signin')).not.toBeInTheDocument();
  });

  it('AC3: anon + shownCount >= totalGroupCount → banner suppressed (teaser shows everything)', () => {
    renderPanel({
      listings: [makeListing('l1'), makeListing('l2')],
      totalGroupCount: 2, // equal — nothing is hidden
      isAuthenticated: false,
    });

    expect(screen.queryByTestId('area-group-results-anon-banner')).not.toBeInTheDocument();
  });

  it('AC3b: anon + shownCount > totalGroupCount → banner suppressed', () => {
    renderPanel({
      listings: [makeListing('l1'), makeListing('l2'), makeListing('l3')],
      totalGroupCount: 2, // teaser returned more than totalGroupCount (edge case)
      isAuthenticated: false,
    });

    expect(screen.queryByTestId('area-group-results-anon-banner')).not.toBeInTheDocument();
  });

  it('AC4: totalGroupCount undefined → banner suppressed (areas not yet loaded)', () => {
    renderPanel({
      listings: [makeListing('l1')],
      totalGroupCount: undefined,
      isAuthenticated: false,
    });

    expect(screen.queryByTestId('area-group-results-anon-banner')).not.toBeInTheDocument();
  });

  it('AC1b: singular "property" when shownCount is 1', () => {
    renderPanel({
      listings: [makeListing('l1')], // shownCount = 1
      totalGroupCount: 10,
      isAuthenticated: false,
    });

    const banner = screen.getByTestId('area-group-results-anon-banner');
    // Singular form
    expect(banner).toHaveTextContent('1');
    expect(banner).toHaveTextContent('property across');
  });

  it('banner is suppressed while loading (not shown during in-flight fetch)', () => {
    renderPanel({
      listings: [],
      totalGroupCount: 10,
      isAuthenticated: false,
      isLoading: true, // still loading
    });

    expect(screen.queryByTestId('area-group-results-anon-banner')).not.toBeInTheDocument();
  });

  it('banner is suppressed on error state', () => {
    renderPanel({
      listings: [],
      totalGroupCount: 10,
      isAuthenticated: false,
      isError: true,
    });

    expect(screen.queryByTestId('area-group-results-anon-banner')).not.toBeInTheDocument();
  });
});
