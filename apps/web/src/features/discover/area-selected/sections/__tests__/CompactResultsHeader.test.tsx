/**
 * Issue #2729 §2 — compact desktop Results header: "Properties in <scope>" / count / in-scope
 * search / scope menu, on the shared "Edit areas ▾"/"Options ▾" surface. Same pointer-capture
 * shim as ScopeActionsMenu.test.tsx (this component renders that menu).
 */
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { CompactResultsHeader, type CompactResultsHeaderProps } from '../CompactResultsHeader';

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: () => ({ data: { polygonSearchAvailable: true } }),
}));
// Issue #2729 D4 — ScopeActionsMenu now resolves Draw-search-area eligibility (incl.
// isAuthenticated) itself so it never renders an empty menu; `renderWithProviders`' AuthProvider
// defaults unauthenticated, so a single-area scope with no other action would otherwise hide the
// trigger entirely (correct behaviour — see ScopeActionsMenu.test.tsx's D4 describe block). This
// file's own "single-area scope" test wants a signed-in shopper specifically.
vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>();
  return { ...actual, useAuth: () => ({ user: { id: 'u1' }, isLoading: false }) };
});
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'bangalore', areas: [{ areaKey: 'A', name: 'Hebbal', geoCenterLat: 0, geoCenterLon: 0, listingCount: 4, schoolCount: 1 }, { areaKey: 'B', name: 'Nagawara', geoCenterLat: 0, geoCenterLon: 0, listingCount: 3, schoolCount: 1 }] },
  })),
}));

const renderHeader = (over: Partial<CompactResultsHeaderProps> = {}) => {
  const props: CompactResultsHeaderProps = {
    multiAreaKeys: null,
    resolvedAreasCity: 'bangalore',
    count: 42,
    headingNoun: 'Properties',
    countNoun: 'shown for sale',
    areaLabel: 'Hebbal',
    resultScopeKind: 'AREA',
    isViewportScope: false,
    scopeActions: {},
    ...over,
  };
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <CompactResultsHeader {...props} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );
};

describe('#2729 §2 — CompactResultsHeader', () => {
  it('single area: title "Properties in Hebbal", count "42 shown for sale"', () => {
    renderHeader();
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent('Properties in Hebbal');
    expect(screen.getByTestId('compact-results-count')).toHaveTextContent('42 shown for sale');
  });

  it('Commercial family: uses the caller-supplied Commercial noun (no re-derivation of family logic)', () => {
    renderHeader({ headingNoun: 'Commercial properties', countNoun: 'commercial listings' });
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent('Commercial properties in Hebbal');
    expect(screen.getByTestId('compact-results-count')).toHaveTextContent('42 commercial listings');
  });

  it('count line is hidden while loading (isLoadingListings), matching ResultHeading', () => {
    renderHeader({ isLoadingListings: true });
    expect(screen.queryByTestId('compact-results-count')).not.toBeInTheDocument();
  });

  it('VIEWPORT scope: title is "On screen right now"', () => {
    renderHeader({ isViewportScope: true, resultScopeKind: 'VIEWPORT' });
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent('On screen right now');
  });

  it('POLYGON scope: title is "<noun> in your drawn area"', () => {
    renderHeader({ resultScopeKind: 'POLYGON' });
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent('Properties in your drawn area');
  });

  it('AREA_SET: title joins the resolved area names', () => {
    renderHeader({ multiAreaKeys: ['A', 'B'] });
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent('Hebbal · Nagawara');
  });

  it('MUTATION CHECK: AREA_SET title falls back to a count when names have not resolved yet (proves the join is real, not a static string)', () => {
    renderHeader({ multiAreaKeys: ['A', 'B', 'unknown-key'] });
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent('3 areas');
  });

  it('renders the in-scope search input reusing the EXISTING searchQuery/onSearchChange, and calling it on type', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderHeader({ search: { query: '', onChange } });
    const input = screen.getByTestId('compact-results-search-input');
    await user.type(input, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('omits the search input entirely when no search handler is supplied (no dead control)', () => {
    renderHeader({ search: undefined });
    expect(screen.queryByTestId('compact-results-search-input')).not.toBeInTheDocument();
  });

  // Issue #2729 N1 — a long Commercial title ("Commercial properties in Sanjeevini Nagar") CSS-
  // truncates at the desktop-reskin floor's real panel width; jsdom cannot measure real layout
  // width, so this asserts the non-lossy fallback the issue explicitly allows: the full string
  // stays reachable via the native `title` attribute even when the visible glyphs are clipped.
  it('N1: the title element carries the FULL untruncated string on its title attribute', () => {
    renderHeader({ headingNoun: 'Commercial properties', countNoun: 'commercial listings', areaLabel: 'Sanjeevini Nagar' });
    const titleEl = screen.getByTestId('compact-results-title');
    expect(titleEl).toHaveAttribute('title', 'Commercial properties in Sanjeevini Nagar');
    expect(titleEl).toHaveTextContent('Commercial properties in Sanjeevini Nagar');
  });

  it('renders the ScopeActionsMenu trigger for the AREA_SET scope it was given ("Edit areas ▾")', () => {
    // Opening/interacting with the live Radix menu is covered structurally in
    // ScopeActionsMenu.test.tsx (see that file's header note on this repo's pre-existing jsdom
    // limitation with Radix DropdownMenu triggers); this asserts the trigger CompactResultsHeader
    // renders is the same one, receiving the scope it was given.
    renderHeader({ multiAreaKeys: ['A', 'B'], scopeActions: { onEditAreas: vi.fn(), onClearAreas: vi.fn(), onFitAll: vi.fn() } });
    const trigger = screen.getByTestId('scope-actions-menu-trigger');
    expect(trigger).toHaveTextContent('Edit areas');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('renders the ScopeActionsMenu trigger for a single-area scope ("Options ▾")', () => {
    renderHeader({ multiAreaKeys: null, resultScopeKind: 'AREA' });
    expect(screen.getByTestId('scope-actions-menu-trigger')).toHaveTextContent('Options');
  });

  // Issue #2729 R6 fix — the merge-base `AreaSetSelectedHeader` (stacked layout) showed removable
  // per-area chips ("Sanjeevini Nagar ×", "Koramangala ×"), the only one-click way to remove a
  // SINGLE committed area — "Clear selected areas" removes ALL of them, a different affordance.
  // The compact header dropped these entirely; `CommittedAreaChips` (extracted verbatim from
  // `AreaSetSelectedHeader`, same testids/classes/handler) restores them here.
  describe('R6 fix — committed area chips', () => {
    it('renders one removable chip per committed area, calling the SAME onRemoveArea handler', () => {
      const onRemoveArea = vi.fn();
      renderHeader({ multiAreaKeys: ['A', 'B'], onRemoveArea });
      expect(screen.getByTestId('area-set-panel-committed-chip-A')).toHaveTextContent('Hebbal');
      expect(screen.getByTestId('area-set-panel-committed-chip-B')).toHaveTextContent('Nagawara');
      screen.getByTestId('area-set-panel-committed-chip-A-dismiss').click();
      expect(onRemoveArea).toHaveBeenCalledWith('A');
    });

    it('MUTATION CHECK: without onRemoveArea, no chips render at all (no dead remove buttons)', () => {
      renderHeader({ multiAreaKeys: ['A', 'B'], onRemoveArea: undefined });
      expect(screen.queryByTestId('area-set-panel-committed-chips')).not.toBeInTheDocument();
    });

    it('single-area scope renders no committed-area chips (nothing to remove-one-of)', () => {
      renderHeader({ multiAreaKeys: null, onRemoveArea: vi.fn() });
      expect(screen.queryByTestId('area-set-panel-committed-chips')).not.toBeInTheDocument();
    });
  });
});
