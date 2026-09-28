/**
 * Issue #1153 — Start Over must clear ActiveContextChips (BHK chip regression).
 *
 * Root cause: handleStartOver only deleted schoolLat/schoolLon/schoolRadiusKm from
 * local `filters` state, leaving bedrooms/propertyTypes/etc. ActiveContextChips reads
 * from local `filters`, so the BHK chip persisted after Start Over.
 *
 * Fix: setFilters({}) instead of the partial-delete block.
 *
 * Strategy: Render MapDiscovery at a URL that includes ?beds=2 so the BHK chip is
 * initially visible. Click Start Over and assert the chip is gone. DiscoverRightPanel
 * is mocked to render the `activeContextChips` prop it receives, so ActiveContextChips
 * renders without pulling in the full panel tree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

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

// Render `activeContextChips` and a stub Start Over button so the test can
// assert chip presence/absence without mounting the full DiscoverRightPanel tree.
// Issue #2657 C8 — `activeContextChips` now arrives at `view.shared.chrome.activeContextChips`,
// `onStartOver` at `commands.shared.chrome.startOver`.
vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: ({
    view,
    commands,
  }: import('@/components/discover/DiscoverRightPanel').DiscoverRightPanelProps) => (
    <div data-testid="right-panel-mock">
      <button onClick={commands.shared.chrome.startOver}>Start Over</button>
      {view.shared.chrome.activeContextChips}
    </div>
  ),
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

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1153 — Start Over clears ActiveContextChips', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('BHK chip disappears after clicking Start Over', async () => {
    const user = userEvent.setup();
    const url =
      '/discover?city=udupi&journey=school-first' +
      '&areaKey=' + encodeURIComponent(KUNJIBETTU_AREA_KEY) +
      '&beds=2';

    renderAt(url);

    // The BHK chip must be visible on initial render (beds=2 in URL seeds filters.bedrooms).
    const bhkChip = await screen.findByTestId('chip-bhk');
    expect(bhkChip).toBeInTheDocument();
    expect(bhkChip).toHaveTextContent('2 BHK');

    // Click Start Over — it lives in the page header area (rendered directly by MapDiscovery).
    const startOverButtons = await screen.findAllByRole('button', { name: /start over/i });
    await user.click(startOverButtons[0]);

    // After Start Over, the BHK chip must be gone — setFilters({}) clears bedrooms.
    await waitFor(() => {
      expect(screen.queryByTestId('chip-bhk')).not.toBeInTheDocument();
    });
  });
});
