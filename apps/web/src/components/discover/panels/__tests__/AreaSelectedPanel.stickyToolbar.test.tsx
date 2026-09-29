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

/**
 * Issue #2729 §4/§7 — compact sticky filter toolbar. AreaSelectedPanel IS the listing Results
 * surface (it never renders on property detail, alert pages or unrelated Discover hierarchy
 * pages), so wrapping `PropertyFilterGroups` here — and ONLY here, never in
 * MapFilterSheet.tsx/AgriSelectedAreaPanel.tsx, the filter owner's other two consumers — is what
 * confines the sticky behaviour to listing Results by construction.
 *
 * Issue #2729 (post-merge fix-verify) — a real-Playwright `getComputedStyle` probe found the
 * wrapper was ALWAYS mounted (only its `min-[1366px]:*` classes were CSS-inert below that floor),
 * which changed `PropertyFilterGroups`'s parent from a direct flex-item of `.area-panel-container`
 * to a block child of this new div — shifting its computed `min-height`/`min-width` from `auto` to
 * `0px` and moving a sibling by a sub-pixel amount below 1366px. The wrapper is now CONDITIONAL on
 * `isDesktopReskin` (`AreaSelectedPanel.tsx`'s `filterToolbarNode`): mounted with plain (ungated)
 * `sticky`/`top-11`/`z-10`/`bg-background` classes at ≥1366, and ABSENT entirely below it, so
 * `PropertyFilterGroups` is the direct child again, byte-for-byte the merge-base structure. These
 * tests assert PRESENCE at ≥1366 and ABSENCE below it — mirroring `mockMatchMediaWidth`'s
 * established use in `AreaSelectedPanel.desktopReskin.test.tsx`, since jsdom has no real
 * stylesheet and the shared `matchMedia` stub always reports `matches: false` by default.
 */

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

describe('#2729 §4/§7 — AreaSelectedPanel sticky filter toolbar', () => {
  it('at 1366px: wraps the filter toolbar in a sticky container, positioned below the sticky breadcrumb', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    renderPanel();
    const wrapper = screen.getByTestId('area-filters-sticky');
    expect(wrapper.className).toContain('sticky');
    expect(wrapper.className).toContain('top-11');
    expect(wrapper.className).toContain('z-10');
    expect(wrapper.querySelector('[data-design-component="filter-toolbar-compact"]')).not.toBeNull();
  });

  it('below 1366px (1365): the wrapper is ABSENT entirely — PropertyFilterGroups is a direct child again, not merely CSS-unstuck', () => {
    restoreMatchMedia = mockMatchMediaWidth(1365).restore;
    renderPanel();
    expect(screen.queryByTestId('area-filters-sticky')).not.toBeInTheDocument();
    // The filter toolbar itself still renders — just without the extra wrapper node.
    expect(document.querySelector('[data-design-component="filter-toolbar"]')).not.toBeNull();
  });

  it('at 820px (mobile-shell floor): the wrapper is ABSENT entirely, same as 1365', () => {
    restoreMatchMedia = mockMatchMediaWidth(820).restore;
    renderPanel();
    expect(screen.queryByTestId('area-filters-sticky')).not.toBeInTheDocument();
    expect(document.querySelector('[data-design-component="filter-toolbar"]')).not.toBeNull();
  });

  it('MUTATION CHECK: the SAME props render the wrapper present/absent purely as a function of the matchMedia width — proves the gating is real, not a bare CSS-inert class on an always-mounted node', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    const { unmount } = renderPanel();
    expect(screen.getByTestId('area-filters-sticky')).toBeInTheDocument();
    unmount();
    restoreMatchMedia?.();

    restoreMatchMedia = mockMatchMediaWidth(820).restore;
    renderPanel();
    expect(screen.queryByTestId('area-filters-sticky')).not.toBeInTheDocument();
  });

  it('at 1366px: the filter toolbar itself (compact PropertyFilterGroups) still renders inside the wrapper, unchanged', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    renderPanel();
    const wrapper = screen.getByTestId('area-filters-sticky');
    expect(wrapper.querySelector('[data-design-component="filter-toolbar-compact"]')).not.toBeNull();
  });

  it('at 1366px: renders for the Commercial family results state too (same wrapper, same filter owner)', () => {
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
    renderPanel({ filters: { commercialSubtypes: ['SHOP'] } });
    expect(screen.getByTestId('area-filters-sticky')).toBeInTheDocument();
  });
});
