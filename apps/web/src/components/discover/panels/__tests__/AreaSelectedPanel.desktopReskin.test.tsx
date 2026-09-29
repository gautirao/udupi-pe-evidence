/**
 * Issue #2729 §2/§3/§4 — the desktop-reskin wiring in AreaSelectedPanel.tsx: at the SAME ≥1366
 * signal the shared header hosts controls on (`useDiscoverHeaderHostsControls`), the panel swaps
 * `ResultHeading` for `CompactResultsHeader` (+ its `ScopeActionsMenu`), switches
 * `PropertyFilterGroups` to its `layout="compact"` single-row toolbar, and suppresses
 * `WorkflowGroup`'s in-scope search box (now hosted in the compact header instead). Below that
 * floor every branch is the pre-#2729 layout — which is also every OTHER AreaSelectedPanel test
 * in this repo, since the shared jsdom `matchMedia` stub always reports `matches: false` by
 * default (see `mockMatchMediaWidth.ts`'s own doc comment), so this file is the only place that
 * actually exercises the ≥1366 branch.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { toAreaSelectedPanelContract, type AreaSelectedPanelFlatTestProps } from './areaSelectedPanelTestAdapter';

// Issue #2729 D4 — ScopeActionsMenu now resolves Draw-search-area eligibility itself (incl.
// isAuthenticated) so it never renders empty; `renderWithProviders`' AuthProvider defaults
// unauthenticated (see ScopeActionsMenu.test.tsx's D4 describe block for the full reasoning), and
// this file wants a signed-in shopper so the scope-menu-trigger assertions test the header SWAP,
// not the auth-gating (covered separately in ScopeActionsMenu.test.tsx).
vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>();
  return { ...actual, useAuth: () => ({ user: { id: 'u1' }, isLoading: false }) };
});
vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: () => ({ data: { polygonSearchAvailable: true } }),
}));

const mockArea: AreaPoint = {
  areaKey: 'test-area|city|udupi',
  areaLabel: 'Test Area',
  geo_center_lat: 13.5,
  geo_center_lon: 74.5,
  bbox: null,
};

const mockListing: DiscoverCityListingItem = {
  id: '1',
  propertyType: 'apartment',
  title: 'Test Listing',
  locality: 'Test Area',
  pricePaise: 5000000,
  bedrooms: 2,
  bathrooms: 1,
};

const renderPanel = (props: Partial<AreaSelectedPanelFlatTestProps> = {}) => {
  const defaultProps: AreaSelectedPanelFlatTestProps = {
    selectedArea: mockArea,
    areaListings: [mockListing],
    filters: {},
    onFiltersChange: vi.fn(),
    onSelectJourney: vi.fn(),
    onAddSchool: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
  };
  const { view, commands } = toAreaSelectedPanelContract({ ...defaultProps, ...props });
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <AreaSelectedPanel view={view} commands={commands} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );
};

let restoreMatchMedia: (() => void) | null = null;
afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

describe('#2729 §2/§3/§4 — AreaSelectedPanel desktop-reskin gate', () => {
  it('at 1366px: renders CompactResultsHeader (not ResultHeading), compact filter toolbar, and no duplicate search box', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    renderPanel();

    expect(screen.getByTestId('compact-results-header')).toBeInTheDocument();
    expect(screen.queryByTestId('area-intent-helper')).not.toBeInTheDocument(); // ResultHeading-only content
    expect(screen.getByTestId('scope-actions-menu-trigger')).toBeInTheDocument();

    // §4 — compact single-row toolbar, not the stacked quick-filter card.
    expect(screen.getByTestId('area-filters-sticky').querySelector('[data-design-component="filter-toolbar-compact"]')).not.toBeNull();
    expect(screen.getByTestId('area-filters-sticky').querySelector('[data-design-component="filter-toolbar"]')).toBeNull();

    // §2 — the in-scope search now lives in the compact header, not duplicated in WorkflowGroup.
    expect(screen.getByTestId('compact-results-search-input')).toBeInTheDocument();
    expect(screen.queryByTestId('area-search-input')).not.toBeInTheDocument();
  });

  // Issue #2729 D2 (browser-verified regression) — the filter toolbar rendered ABOVE "Properties
  // in …" at ≥1366. Mock order: header (title/count/scope-menu) -> sticky filter toolbar ->
  // shortcuts -> verified line -> grid.
  it('D2 FIX: at 1366px, the header renders BEFORE the sticky filter toolbar in DOM order', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    renderPanel();
    const header = screen.getByTestId('compact-results-header');
    const toolbar = screen.getByTestId('area-filters-sticky');
    expect(header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('below 1366px, the ORIGINAL #2596 order is unchanged: the filter toolbar still renders BEFORE ResultHeading', () => {
    restoreMatchMedia = mockMatchMediaWidth(820).restore;
    renderPanel();
    // Issue #2729 (post-merge fix-verify) — below 1366 the sticky wrapper (`area-filters-sticky`)
    // no longer mounts at all (see AreaSelectedPanel.stickyToolbar.test.tsx); query the filter
    // toolbar's own root marker directly instead of a wrapper that doesn't exist at this width.
    const toolbar = document.querySelector('[data-design-component="filter-toolbar"]');
    expect(toolbar).not.toBeNull();
    const heading = screen.getByTestId('area-intent-helper');
    expect(toolbar!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Issue #2729 D5 — Trends moved into the compact header's right cluster instead of Toolbar's
  // separate ~45px row, to reclaim vertical space ahead of the first card row.
  it('D5 FIX: at 1366px, Trends renders ONCE, inside the compact header (not a second standalone row)', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    renderPanel({ trendsHref: '/trends/udupi/areas/test-area' });
    expect(screen.getByTestId('compact-results-trends-link')).toHaveAttribute('href', '/trends/udupi/areas/test-area');
    expect(screen.getAllByRole('link', { name: /trends/i })).toHaveLength(1);
  });

  it('below 1366px, Trends stays in its original Toolbar row (unchanged)', () => {
    restoreMatchMedia = mockMatchMediaWidth(820).restore;
    renderPanel({ trendsHref: '/trends/udupi/areas/test-area' });
    expect(screen.queryByTestId('compact-results-trends-link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /trends/i })).toHaveLength(1);
  });

  it('at 820px (mobile-shell floor): renders the pre-#2729 ResultHeading/stacked toolbar/WorkflowGroup search — unchanged', () => {
    restoreMatchMedia = mockMatchMediaWidth(820).restore;
    renderPanel();

    expect(screen.queryByTestId('compact-results-header')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-intent-helper')).toBeInTheDocument(); // ResultHeading's own content
    expect(screen.queryByTestId('scope-actions-menu-trigger')).not.toBeInTheDocument();

    // Issue #2729 (post-merge fix-verify) — no `area-filters-sticky` wrapper below 1366; the
    // stacked filter toolbar renders as a direct child, same as the merge-base structure.
    expect(screen.queryByTestId('area-filters-sticky')).not.toBeInTheDocument();
    expect(document.querySelector('[data-design-component="filter-toolbar"]')).not.toBeNull();
    expect(document.querySelector('[data-design-component="filter-toolbar-compact"]')).toBeNull();

    expect(screen.getByTestId('area-search-input')).toBeInTheDocument();
    expect(screen.queryByTestId('compact-results-search-input')).not.toBeInTheDocument();
  });

  it('MUTATION CHECK: the SAME props render opposite header/toolbar shapes purely as a function of the matchMedia width — proves the branch is gated on the ≥1366 signal, not on any prop difference', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    const { unmount } = renderPanel();
    expect(screen.getByTestId('compact-results-header')).toBeInTheDocument();
    unmount();
    restoreMatchMedia?.();

    restoreMatchMedia = mockMatchMediaWidth(820).restore;
    renderPanel();
    expect(screen.queryByTestId('compact-results-header')).not.toBeInTheDocument();
  });
});
