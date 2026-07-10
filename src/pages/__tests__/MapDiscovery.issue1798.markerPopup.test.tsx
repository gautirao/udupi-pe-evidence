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
 * - TC4: school-first with a school selected → still NO popup (exclusion preserved).
 * - TC5: agri-first → still NO popup (exclusion preserved).
 * - TC6: area-first (pre-existing eligible state) → popup still renders (no regression).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

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
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
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
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
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

  it('TC4: school-first with a school selected → still NO popup (exclusion preserved)', async () => {
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

    // Give any (incorrect) render a chance, then assert absence.
    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
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
