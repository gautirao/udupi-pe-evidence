/**
 * Issue #2596 owner follow-up — the committed area chips belong in the RIGHT PANEL.
 *
 * Owner: *"the area name chips come on the map, it should be on the right panel as in the mock."*
 *
 * These assert PRESENCE in the panel and the kit's ORDER. They deliberately do not assert the
 * absence of the map row: that is a separate change, gated on this one landing first, and an
 * absence assertion written here would pass trivially today for the wrong reason.
 *
 * Removal acts on the COMMITTED set and takes effect immediately — distinct from the map
 * overlay's chips, which edit the uncommitted draft and only apply on "Show listings". Same
 * AREA_SET state, different layer; no second selection state.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSetSelectedHeader } from '../AreaSetSelectedExtras';
// The action row contains `DrawSearchAreaEntry`, which calls `useDiscoverNav()` and THROWS
// outside its provider by design. A bare render of this header therefore fails before any
// assertion runs — which looks exactly like the chips being absent. They are not; the provider is.
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'bangalore',
      areas: [
        { areaKey: 'A', name: 'Hebbal', geoCenterLat: 0, geoCenterLon: 0, listingCount: 4, schoolCount: 1 },
        { areaKey: 'B', name: 'Nagawara', geoCenterLat: 0, geoCenterLon: 0, listingCount: 3, schoolCount: 1 },
        { areaKey: 'C', name: 'Kempapura', geoCenterLat: 0, geoCenterLon: 0, listingCount: 2, schoolCount: 0 },
      ],
    },
    isLoading: false,
  })),
}));

const renderHeader = (over: Partial<React.ComponentProps<typeof AreaSetSelectedHeader>> = {}) =>
  renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <AreaSetSelectedHeader
          areaKeys={['A', 'B', 'C']}
          city="bangalore"
          count={81}
          intentNoun="sale"
          isLoadingListings={false}
          onEditAreas={vi.fn()}
          onClearAreas={vi.fn()}
          onRemoveArea={vi.fn()}
          onFitAll={vi.fn()}
          onFocusArea={vi.fn()}
          {...over}
        />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );

describe('#2596 — committed area chips in the right panel', () => {
  it('renders one removable chip per committed area', () => {
    renderHeader();
    for (const [key, name] of [['A', 'Hebbal'], ['B', 'Nagawara'], ['C', 'Kempapura']]) {
      expect(screen.getByTestId(`area-set-panel-committed-chip-${key}`)).toHaveTextContent(name);
      expect(
        screen.getByTestId(`area-set-panel-committed-chip-${key}-dismiss`),
      ).toBeInTheDocument();
    }
  });

  it('follows the kit order: heading -> chips -> actions', () => {
    renderHeader();
    const heading = screen.getByTestId('area-set-heading');
    const chips = screen.getByTestId('area-set-panel-committed-chips');
    const actions = screen.getByTestId('area-set-action-row');
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(heading.compareDocumentPosition(chips) & FOLLOWING).toBeTruthy();
    expect(chips.compareDocumentPosition(actions) & FOLLOWING).toBeTruthy();
    // The action row used to sit ABOVE the heading; pin that it no longer does.
    expect(actions.compareDocumentPosition(heading) & FOLLOWING).toBeFalsy();
  });

  it('dismissing a chip asks the caller to remove THAT area', () => {
    const onRemoveArea = vi.fn();
    renderHeader({ onRemoveArea });
    fireEvent.click(screen.getByTestId('area-set-panel-committed-chip-B-dismiss'));
    expect(onRemoveArea).toHaveBeenCalledTimes(1);
    expect(onRemoveArea).toHaveBeenCalledWith('B');
  });

  it('gives each dismiss control an accessible name naming its area', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: 'Remove Nagawara from the selected areas' }),
    ).toBeInTheDocument();
  });

  // Degrades honestly: with no resolved area records there are no names to show, so no chips —
  // rather than a row of raw area keys.
  it('renders no chip row when the area records have not resolved', async () => {
    const mod = await import('@/hooks/useDiscoverAreas');
    vi.mocked(mod.useDiscoverAreas).mockReturnValueOnce({
      data: { city: 'bangalore', areas: [] },
      isLoading: false,
    } as ReturnType<typeof mod.useDiscoverAreas>);
    renderHeader();
    expect(screen.queryByTestId('area-set-panel-committed-chips')).not.toBeInTheDocument();
  });
});
