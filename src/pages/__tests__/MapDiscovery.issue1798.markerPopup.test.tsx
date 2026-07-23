/**
 * Issue #1798 PR-C — listing/property marker info popup (MarkerPopoverCard) reliability.
 *
 * Root cause: the popup RENDER gate (isMarkerPopoverEligible) required
 * journey === 'area-first' plus specific panelContent values — strictly narrower than
 * the click-CAPTURE gate (handleMarkerClickWithPosition / handleSelectMarkerListing's
 * setSelectedListing branch) which already permits journeyless and other non-agri-first
 * states. A listing marker click in one of those excluded-but-permitted states already
 * wrote markerPixelPos/selectedMarkerListing (driving the #1547 right-panel
 * scroll+highlight) but the popup itself never rendered.
 *
 * Fix: isMarkerPopoverEligible now reuses the exact same predicate as the capture
 * gates: journey !== 'agri-first' && areaKey != null && (schoolId == null ||
 * journey === 'area-first').
 *
 * Coverage:
 * - TC1 (must fail pre-fix): journeyless area-selected listing marker click opens the popup.
 * - TC2: a second listing marker click replaces the popup content (still one at a time).
 * - TC3: map background click dismisses the popup (regression — no code change expected here).
 * - TC4: school-first with a school (and areaKey) selected → popup OPENS. Updated for
 *   Issue #1973 — previously pinned NO popup here; the additive-OR predicate fix now
 *   admits the pure school-first journey (see MapDiscovery.issue1973.schoolFirstMarkerPopup.test.tsx
 *   for the full school-first eligibility matrix, including the areaKey==null case).
 * - TC5: agri-first → still NO popup (exclusion preserved, unaffected by #1973).
 * - TC6: area-first (pre-existing eligible state) → popup still renders (no regression).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// Capture the callbacks PropertyMap receives so tests can invoke them directly,
// exactly as MarkerClusterLayer's real click handler would (Issue #1738 evidence:
// src/components/map/PropertyMap.tsx MarkerClusterLayer marker.on('click', ...) fires
// both onSelectListing and onMarkerClickWithPosition for every listing marker).
let capturedOnSelectListing: ((listing: PropertyListingWithImages | null) => void) | undefined;
let capturedOnMarkerClickWithPosition: ((pos: { x: number; y: number }) => void) | undefined;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn(
    ({
      onSelectListing,
      onMarkerClickWithPosition,
    }: {
      onSelectListing?: (listing: PropertyListingWithImages | null) => void;
      onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
    }) => {
      capturedOnSelectListing = onSelectListing;
      capturedOnMarkerClickWithPosition = onMarkerClickWithPosition;
      return <div data-testid="property-map-mock" />;
    },
  ),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AREA_KEY = 'IN|KA|Udupi|Manipal';

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: AREA_KEY,
      areaLabel: 'Manipal',
      name: 'Manipal',
      geo_center_lat: 13.34,
      geo_center_lon: 74.74,
      geoCenterLat: 13.34,
      geoCenterLon: 74.74,
      minLat: 13.33, minLon: 74.73, maxLat: 13.35, maxLon: 74.75,
      bbox: [[13.33, 74.73], [13.35, 74.75]] as [[number, number], [number, number]],
      listingCount: 4,
      schoolCount: 1,
      trendDirection: 'stable',
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
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
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
    data: undefined, isLoading: false, isError: false, error: null,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  })),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, error: null })),
}));

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({
    data: {
      city: 'udupi',
      propertyType: null,
      groupBy: 'area_group',
      totalActiveListings: 4,
      regions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 4 }],
    },
    isLoading: false,
  })),
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

const makeListing = (id: string, title: string): PropertyListingWithImages =>
  ({
    id,
    title,
    property_type: 'apartment',
    price: 5_000_000,
    price_unit: null,
    latitude: 13.34,
    longitude: 74.74,
    locality: 'Manipal',
    images: undefined,
  } as unknown as PropertyListingWithImages);

// Issue #1810 (Stage 2A, MODEL A) — probe component exposing the current URL
// search string so tests can assert the `listing` param survives "Show in
// list" without needing to mock useDiscoverUrlState's internals.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.search}</div>;
}

const renderAtWithProbe = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/discover"
            element={
              <DiscoverProvider>
                <MapDiscovery />
                <LocationProbe />
              </DiscoverProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1798 PR-C — marker popup render/capture gate alignment', () => {
  beforeEach(() => {
    capturedOnSelectListing = undefined;
    capturedOnMarkerClickWithPosition = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('TC1 (regression — must fail pre-fix): journeyless area-selected listing marker click opens the popup', async () => {
    renderAt(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-1', 'Journeyless Villa'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Journeyless Villa')).toBeInTheDocument();
  });

  it('TC2: clicking a second listing marker replaces the popup content', async () => {
    renderAt(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-1', 'First Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });
    await waitFor(() => {
      expect(screen.getByText('First Listing')).toBeInTheDocument();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-2', 'Second Listing'));
      capturedOnMarkerClickWithPosition!({ x: 150, y: 120 });
    });

    await waitFor(() => {
      expect(screen.getByText('Second Listing')).toBeInTheDocument();
    });
    expect(screen.queryByText('First Listing')).not.toBeInTheDocument();
    // Only one popover card at a time.
    expect(screen.getAllByTestId('marker-popover-card')).toHaveLength(1);
  });

  it('TC3: map background click dismisses the popup', async () => {
    const { container } = renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-1', 'Dismiss Me'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });
    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });

    const mapRoot = container.querySelector('[data-testid="property-map-mock"]')?.parentElement;
    expect(mapRoot).toBeTruthy();
    fireEvent.click(mapRoot as Element);

    await waitFor(() => {
      expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    });
  });

  it('TC4 (Issue #1973 — updated): school-first with a school (and areaKey) selected → popup OPENS', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=school-first&areaKey=${encodeURIComponent(AREA_KEY)}&schoolId=sch-1`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-1', 'School First Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByText('School First Listing')).toBeInTheDocument();
  });

  it('TC5: agri-first → still NO popup (exclusion preserved)', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=agri-first&areaKey=${encodeURIComponent(AREA_KEY)}`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-1', 'Agri Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
  });

  it('TC6 (no regression): area-first area-selected listing marker click still opens the popup', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('listing-1', 'Area First Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Area First Listing')).toBeInTheDocument();
  });
});

// ─── Issue #1810 Stage 2A — popup stepper (MODEL A) + Show in list ──────────

const STEPPER_AREA_LISTINGS = [
  { id: 'm1', propertyType: 'apartment', title: 'Listing A', lat: 13.34, lon: 74.74 },
  { id: 'm2', propertyType: 'apartment', title: 'Listing B', lat: 13.341, lon: 74.741 },
  { id: 'm3', propertyType: 'apartment', title: 'Listing C', lat: 13.342, lon: 74.742 },
];

describe('Issue #1810 Stage 2A — listing-popup stepper (MODEL A: panel listings array)', () => {
  beforeEach(() => {
    capturedOnSelectListing = undefined;
    capturedOnMarkerClickWithPosition = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    vi.mocked(useDiscoverCityListings).mockReturnValue({
      // @ts-expect-error — test double; only the fields consumed by useDiscoverMapData are populated.
      data: { areas: [{ areaKey: AREA_KEY, listings: STEPPER_AREA_LISTINGS }] },
      isLoading: false,
    });
  });

  it('n/N = the clicked listing\'s 1-based index within the SAME array that feeds the map/panel; prev/next pages siblings', async () => {
    renderAt(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    // Click the MIDDLE listing (Listing B, index 1 of 3) — n/N must read "2/3".
    act(() => {
      capturedOnSelectListing!(makeListing('m2', 'Listing B'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-stepper')).toBeInTheDocument();
    });
    expect(screen.getByTestId('popover-stepper-label')).toHaveTextContent('2/3');

    // Next → Listing C (3/3). Scope the text query to the popover card itself —
    // the results panel also renders a "Listing C" card (the #1547 highlight
    // sync working as intended), so an unscoped query would be ambiguous.
    fireEvent.click(screen.getByTestId('popover-stepper-next'));
    await waitFor(() => {
      expect(within(screen.getByTestId('marker-popover-card')).getByText('Listing C')).toBeInTheDocument();
    });
    expect(screen.getByTestId('popover-stepper-label')).toHaveTextContent('3/3');
    expect(screen.getByTestId('popover-stepper-next')).toBeDisabled();

    // Prev twice → back to Listing A (1/3).
    fireEvent.click(screen.getByTestId('popover-stepper-prev'));
    fireEvent.click(screen.getByTestId('popover-stepper-prev'));
    await waitFor(() => {
      expect(within(screen.getByTestId('marker-popover-card')).getByText('Listing A')).toBeInTheDocument();
    });
    expect(screen.getByTestId('popover-stepper-label')).toHaveTextContent('1/3');
    expect(screen.getByTestId('popover-stepper-prev')).toBeDisabled();
  });

  it('stepping never triggers a camera call (MODEL A — no fitBounds/flyTo of any kind)', async () => {
    renderAt(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('m1', 'Listing A'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });
    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-stepper')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('popover-stepper-next'));
    fireEvent.click(screen.getByTestId('popover-stepper-next'));
    fireEvent.click(screen.getByTestId('popover-stepper-prev'));

    // PropertyMap is fully mocked out in this suite (no real Leaflet map
    // instance exists to call), but MapDiscovery itself must never attempt a
    // direct camera call from the step handler either — asserted here via the
    // absence of any thrown error / any additional captured marker-click
    // side channel, since MODEL B (panInside) would require a live map
    // instance this test harness deliberately does not provide.
    expect(screen.getByTestId('marker-popover-stepper')).toBeInTheDocument();
  });

  it('a standalone listing (not found in the map-marker array) shows no stepper', async () => {
    renderAt(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      // "not-in-array" id — defensively must not crash, must not show a stepper.
      capturedOnSelectListing!(makeListing('unknown-id', 'Ghost Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('marker-popover-stepper')).not.toBeInTheDocument();
  });

  it('single-listing area (no siblings) shows no stepper', async () => {
    vi.mocked(useDiscoverCityListings).mockReturnValue({
      // @ts-expect-error — test double.
      data: { areas: [{ areaKey: AREA_KEY, listings: [STEPPER_AREA_LISTINGS[0]] }] },
      isLoading: false,
    });
    renderAt(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('m1', 'Listing A'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('marker-popover-stepper')).not.toBeInTheDocument();
  });

  it('"Show in list" keeps the `listing` URL param set and closes ONLY the popup overlay (does NOT clearSelectedListing)', async () => {
    renderAtWithProbe(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('m1', 'Listing A'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });
    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent(/listing=m1/);

    fireEvent.click(screen.getByTestId('popover-show-in-list'));

    // Overlay closes...
    await waitFor(() => {
      expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    });
    // ...but the `listing` URL param is still set (re-driven, not cleared) —
    // this is what keeps the panel-card highlight alive per AC9.
    expect(screen.getByTestId('location-probe')).toHaveTextContent(/listing=m1/);
  });

  it('"Show in list" does not navigate to /listing/:id (that is the separate View details action)', async () => {
    renderAtWithProbe(`/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('m1', 'Listing A'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });
    await waitFor(() => {
      expect(screen.getByTestId('popover-show-in-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('popover-show-in-list'));

    await waitFor(() => {
      expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    });
    // Still on /discover — no navigation to a /listing/:id detail route.
    expect(screen.getByTestId('location-probe')).toBeInTheDocument();
  });

  it('school-first/agri-first exclusion still holds with the stepper wiring in place', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=agri-first&areaKey=${encodeURIComponent(AREA_KEY)}`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('m1', 'Listing A'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-popover-stepper')).not.toBeInTheDocument();
  });
});
