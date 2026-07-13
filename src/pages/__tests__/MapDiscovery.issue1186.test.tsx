/**
 * Issue #1186 — clearable "Search" context chip (page-level integration).
 * Issue #1817 — REVISED: the Search chip is no longer context-gated on area/school
 * selection. Per the design (§3/§4), `q` is a first-class piece of result-affecting
 * filter/search state at ANY scope (city, region, group, area, school) — the OLD
 * area/school gate predates #1817's "scope lives in the breadcrumb, filters/search
 * live in chips" model and is now removed. The chip renders whenever `q` is non-empty
 * (after trim), full stop. Area/school themselves are NEVER chips (AC2) — they live
 * only in the breadcrumb — so this file no longer asserts a `chip-area` testid.
 *
 * Dismissing the chip must clear ONLY `q` (via urlActions.setSearchQuery('')),
 * leaving sibling context/filter chips intact.
 *
 * Harness mirrors MapDiscovery.startOver-chip.test.tsx: DiscoverRightPanel is mocked to
 * render the `activeContextChips` prop directly, and a LocationProbe renders the live URL
 * so the dismiss test can assert `q` was removed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';

// ─── Hoisted handles ────────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// ─── Mocks ──────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Render `activeContextChips` directly so the test can assert chip presence/absence
// without mounting the full DiscoverRightPanel tree.
vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: ({
    activeContextChips,
  }: {
    activeContextChips?: React.ReactNode;
  }) => <div data-testid="right-panel-mock">{activeContextChips}</div>,
}));

const KUNJIBETTU_AREA_KEY = 'IN|KA|Udupi|Kunjibettu';

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: KUNJIBETTU_AREA_KEY,
      areaLabel: 'Kunjibettu',
      name: 'Kunjibettu',
      geo_center_lat: 13.342,
      geo_center_lon: 74.745,
      geoCenterLat: 13.342,
      geoCenterLon: 74.745,
      minLat: 13.33, minLon: 74.73, maxLat: 13.36, maxLon: 74.76,
      bbox: [[13.33, 74.73], [13.36, 74.76]] as [[number, number], [number, number]],
      listingCount: 3,
      schoolCount: 1,
      trendDirection: 'stable' as const,
    },
  ],
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: AREAS_RESPONSE, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: vi.fn(() => ({
    data: undefined, isLoading: false, isFetching: false, error: null,
  })),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({
    data: undefined, isLoading: false, isFetching: false,
  })),
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null,
  Circle: () => null,
  Polygon: () => null,
  ZoomControl: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Renders the live URL (path + search) so tests can assert URL-state mutations. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname + loc.search}</div>;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1186 — Search context chip (page-level)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('(i) AC9 — cold-load ?areaKey=...&q=<term> renders the search chip on first paint', async () => {
    const url =
      '/discover?city=udupi&journey=area-first' +
      '&areaKey=' + encodeURIComponent(KUNJIBETTU_AREA_KEY) +
      '&q=villa';

    renderAt(url);

    const chip = await screen.findByTestId('chip-search');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('villa');
  });

  // Issue #1817 — REVERSED from the old #1186 AC3: the search chip is no longer
  // context-gated on area/school. `q` alone (city scope, no area/school) now renders
  // the chip, matching design §9's `/discover?city=bangalore&q=plot` cold-load row.
  it('(ii) AC9 — cold-load ?q=<term> with no area/school selected also renders the search chip', async () => {
    const url = '/discover?city=udupi&q=villa';

    renderAt(url);

    const chip = await screen.findByTestId('chip-search');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('villa');
  });

  it('(iii) negative guard — area selected but no q does NOT render the search chip', async () => {
    const url =
      '/discover?city=udupi&journey=area-first' +
      '&areaKey=' + encodeURIComponent(KUNJIBETTU_AREA_KEY);

    renderAt(url);

    await screen.findByTestId('right-panel-mock');
    expect(screen.queryByTestId('chip-search')).not.toBeInTheDocument();
  });

  it('(iv) AC3 — dismissing the search chip clears q from the URL and preserves sibling chips', async () => {
    const user = userEvent.setup();
    const url =
      '/discover?city=udupi&journey=area-first' +
      '&areaKey=' + encodeURIComponent(KUNJIBETTU_AREA_KEY) +
      '&beds=2&q=villa';

    renderAt(url);

    // Search chip + sibling filter chip visible on first paint.
    expect(await screen.findByTestId('chip-search')).toBeInTheDocument();
    expect(screen.getByTestId('chip-bhk')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('q=villa');

    // Dismiss the search chip → setSearchQuery('') removes q from the URL.
    await user.click(screen.getByTestId('chip-search-dismiss'));

    await waitFor(() => {
      expect(screen.queryByTestId('chip-search')).not.toBeInTheDocument();
    });
    // q removed from URL; sibling URL params (areaKey, beds) preserved.
    const probe = screen.getByTestId('location-probe');
    expect(probe).not.toHaveTextContent('q=villa');
    expect(probe).toHaveTextContent('beds=2');
    // Sibling chips survive a search-clear (onClearSearch touched only q).
    expect(screen.getByTestId('chip-bhk')).toBeInTheDocument();
  });
});
