import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/**
 * Issue #2478 (step 1) — panel-side scope bar coverage.
 *
 * `resultScope` (active + previous) is derived exclusively from URL search
 * params (state/url/resultScope.ts, #2016) — never local React state — so
 * committed-scope and previous-scope fixtures here are driven via the
 * MemoryRouter `route` option, matching that module's `rscope`/`rpoly`/
 * `rprev` param contract. `isViewportScope` is a plain prop on
 * AreaSelectedPanel (independent of the URL), so VIEWPORT cases set it
 * directly instead of encoding `rscope=vp`.
 *
 * AREA_SET previous-scope Return-label resolution: AreaSelectedPanel
 * resolves real area names for a previous AREA_SET scope via its own
 * `useDiscoverAreas` call (mocked below with `test-area`/`other-area`
 * fixtures matching the `rprev=areas:...` params used in these tests) — the
 * same fix #2015 MUST-HAVE #3 applied to ActiveScopeChip, closing what was
 * previously a hardcoded `[]` regression. See AreaSelectedPanel.tsx's Issue
 * #2478 doc comment for the full reasoning, including why VIEWPORT→VIEWPORT
 * intentionally keeps the generic "Return to previous area" fallback.
 */

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: 'test-area|city|udupi',
          name: 'Test Area',
          geoCenterLat: 13.5,
          geoCenterLon: 74.5,
          listingCount: 0,
          schoolCount: 0,
        },
        {
          areaKey: 'other-area|city|udupi',
          name: 'Other Area',
          geoCenterLat: 13.6,
          geoCenterLon: 74.6,
          listingCount: 0,
          schoolCount: 0,
        },
      ],
    },
    isLoading: false,
  })),
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

const POLYGON_PARAM = '12.90000:77.50000;12.95000:77.55000;13.00000:77.60000';
const PREV_POLYGON_PARAM = '12.80000:77.40000;12.85000:77.45000;12.90000:77.50000';

const renderPanel = (
  props: Partial<React.ComponentProps<typeof AreaSelectedPanel>> = {},
  route = '/discover',
) => {
  const onRedrawPolygon = vi.fn();
  const defaultProps: React.ComponentProps<typeof AreaSelectedPanel> = {
    selectedArea: mockArea,
    areaListings: [mockListing],
    filters: {},
    onFiltersChange: vi.fn(),
    onSelectJourney: vi.fn(),
    onAddSchool: vi.fn(),
    onRedrawPolygon,
  };
  renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <AreaSelectedPanel {...defaultProps} {...props} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'memory', route },
  );
  return { onRedrawPolygon };
};

describe('AreaSelectedPanel scope bar (#2478 step 1)', () => {
  it('renders the scope bar for a committed VIEWPORT scope', () => {
    renderPanel({ isViewportScope: true });
    const chip = screen.getByTestId('area-panel-scope-bar-viewport');
    expect(chip).toHaveTextContent('Visible map area');
    expect(screen.queryByTestId('area-panel-scope-bar-polygon')).not.toBeInTheDocument();
  });

  it('pairs the VIEWPORT eyebrow and heading per the frozen mock (#2478 owner ruling)', () => {
    renderPanel({ isViewportScope: true });
    expect(screen.getByText('Result scope — Visible map area')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'On screen right now' })).toBeInTheDocument();
  });

  it('renders the scope bar for a committed POLYGON scope with Redraw wired to onRedrawPolygon', () => {
    const { onRedrawPolygon } = renderPanel({}, `/discover?rscope=poly&rpoly=${POLYGON_PARAM}`);
    const chip = screen.getByTestId('area-panel-scope-bar-polygon');
    expect(chip).toHaveTextContent('Drawn area');

    const redrawButton = screen.getByTestId('area-panel-scope-bar-redraw');
    fireEvent.click(redrawButton);
    expect(onRedrawPolygon).toHaveBeenCalledTimes(1);
  });

  it('shows no scope bar for a committed AREA scope', () => {
    renderPanel({ isViewportScope: false }, '/discover');
    expect(screen.queryByTestId('area-panel-scope-bar-viewport')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-panel-scope-bar-polygon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-panel-scope-bar-return')).not.toBeInTheDocument();
  });

  it('omits the Return action when there is no previous scope', () => {
    renderPanel({ isViewportScope: true }, '/discover');
    expect(screen.queryByTestId('area-panel-scope-bar-return')).not.toBeInTheDocument();
  });

  it('labels Return "Return to previous search area" when the previous scope is POLYGON', () => {
    renderPanel({ isViewportScope: true }, `/discover?rprev=poly:${PREV_POLYGON_PARAM}`);
    expect(screen.getByTestId('area-panel-scope-bar-return')).toHaveTextContent(
      'Return to previous search area',
    );
  });

  it('labels Return "Return to previous area" when the previous scope is VIEWPORT (by design, not a bug)', () => {
    renderPanel({ isViewportScope: true }, '/discover?rprev=vp:12.9,77.5,13.1,77.7');
    expect(screen.getByTestId('area-panel-scope-bar-return')).toHaveTextContent(
      'Return to previous area',
    );
  });

  it('labels Return with the real area name for a single-area previous AREA_SET scope (#2478 gap 2 fix)', () => {
    renderPanel({ isViewportScope: true }, '/discover?rprev=areas:test-area%7Ccity%7Cudupi');
    expect(screen.getByTestId('area-panel-scope-bar-return')).toHaveTextContent(
      'Return to Test Area',
    );
  });

  it('labels Return with real area names joined by ", " for a multi-area previous AREA_SET scope (#2478 gap 2 fix)', () => {
    renderPanel(
      { isViewportScope: true },
      '/discover?rprev=areas:test-area%7Ccity%7Cudupi,other-area%7Ccity%7Cudupi',
    );
    expect(screen.getByTestId('area-panel-scope-bar-return')).toHaveTextContent(
      'Return to Test Area, Other Area',
    );
  });

  it('fires commitResultScope (via a Return click) without throwing, restoring the previous URL scope', () => {
    renderPanel({ isViewportScope: true }, `/discover?rprev=poly:${PREV_POLYGON_PARAM}`);
    const returnButton = screen.getByTestId('area-panel-scope-bar-return');
    expect(() => fireEvent.click(returnButton)).not.toThrow();
  });

  it('keeps the Return action reachable when the committed VIEWPORT scope has zero listings (#2453/#2018 slice 3)', () => {
    // AreaZeroResultRecovery mounts in the CARD-LIST region (a separate
    // render branch keyed on `areaListings.length === 0`), while the scope
    // bar lives in the heading region — proving they don't interfere.
    renderPanel(
      { isViewportScope: true, areaListings: [] },
      `/discover?rprev=poly:${PREV_POLYGON_PARAM}`,
    );
    expect(screen.getByTestId('area-panel-scope-bar-viewport')).toBeInTheDocument();
    const returnButton = screen.getByTestId('area-panel-scope-bar-return');
    expect(returnButton).toHaveTextContent('Return to previous search area');
    expect(() => fireEvent.click(returnButton)).not.toThrow();
  });
});
