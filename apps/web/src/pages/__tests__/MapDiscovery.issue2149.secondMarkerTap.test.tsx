/**
 * Issue #2149 (fix-cycle) — regression coverage for "tapping a second listing
 * marker on mobile closes the preview sheet instead of replacing it".
 *
 * Root cause (confirmed here, not just by code inspection): the map-half
 * wrapping div in `DiscoverMapCanvas.tsx` attaches `handleBackgroundClick` to
 * its own `onClick` once `markerPixelPos != null` (Issue #2089's "tap map
 * background to dismiss the popover" affordance). A real touch tap on a
 * listing marker synthesizes a native `click` DOM event that bubbles up
 * through the real marker DOM node (which lives INSIDE this same wrapping
 * div) to that `onClick` handler — so on every tap AFTER the first marker
 * selection, `handleBackgroundClick` ran immediately after the marker's own
 * click handler and called `handlePopoverDismiss()`, wiping the very
 * selection the marker's own handler had just set. Reproduced below with a
 * real bubbling DOM click on a mock marker element that carries the same
 * `data-listing-id` wrapper the production `MarkerClusterLayer` attaches
 * (`PropertyMap.tsx`), mounted INSIDE `DiscoverMapCanvas`'s real background
 * div — unlike `MapDiscovery.issue1973.schoolFirstMarkerPopup.test.tsx`
 * (calls the captured `onSelectListing`/`onMarkerClickWithPosition` props
 * directly, never dispatching a real DOM event) and
 * `MapDiscovery.issue1956pr5.mobilePopoverSuppression.test.tsx` (mocks
 * `DiscoverPanelSurface` entirely, bypassing the #2149
 * `LegacyRightPanelBridge` report-up effect), this test exercises the real
 * composition root AND the real background-click DOM wiring together.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useSchoolRadiusListings } from '@/hooks/useSchoolRadiusListings';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

let capturedOnReady: (() => void) | undefined;
let mockMarkerListings: PropertyListingWithImages[] = [];

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

// Renders real, clickable marker elements wrapped in the SAME
// `data-listing-id` element MarkerClusterLayer attaches in production
// (`PropertyMap.tsx`'s `marker.on('add', ...)`), so a real (bubbling)
// `fireEvent.click` on the inner button reproduces the actual DOM structure
// a Leaflet marker tap produces — including bubbling up to
// `DiscoverMapCanvas`'s real background `onClick` handler, which a
// hand-called `onSelectListing`/`onMarkerClickWithPosition` prop invocation
// (the pattern every OTHER MapDiscovery test in this directory uses) never
// exercises.
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn(
    ({
      onSelectListing,
      onMarkerClickWithPosition,
      onReady,
    }: {
      onSelectListing?: (listing: PropertyListingWithImages | null) => void;
      onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
      onReady?: () => void;
    }) => {
      capturedOnReady = onReady;
      return (
        <div data-testid="property-map-mock">
          {mockMarkerListings.map((listing) => (
            <div key={listing.id} data-listing-id={listing.id}>
              <button
                type="button"
                data-testid="property-marker"
                onClick={(e) => {
                  onSelectListing?.(listing);
                  onMarkerClickWithPosition?.({ x: e.clientX, y: e.clientY });
                }}
              >
                {listing.title}
              </button>
            </div>
          ))}
        </div>
      );
    },
  ),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false })),
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

vi.mock('@/hooks/useSchoolRadiusListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSchoolRadiusListings')>();
  return {
    ...actual,
    useSchoolRadiusListings: vi.fn(() => ({ data: undefined, isLoading: false })),
  };
});

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({
    data: { id: 'sch-1', name: 'Manipal Public School', latitude: 13.34, longitude: 74.74 },
    isLoading: false,
    error: null,
  })),
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
  useAgriDestinations: vi.fn(() => ({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    error: null,
    refetch: vi.fn(),
  })),
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

const AUTH_SCHOOL_FIRST_MARKERS = [
  { id: 'sf-auth-1', lat: 13.34, lon: 74.74, propertyType: 'apartment', pricePaise: 5_000_000_00, locality: 'Manipal' },
  { id: 'sf-auth-2', lat: 13.341, lon: 74.741, propertyType: 'apartment', pricePaise: 6_000_000_00, locality: 'Manipal' },
];

const originalMatchMedia = window.matchMedia;

function installMobileMatchMediaMock(): void {
  const mql = {
    matches: true,
    media: '(max-width: 820px)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

describe('#2149 repro — second marker tap in mobile school-first Map mode', () => {
  beforeEach(() => {
    capturedOnReady = undefined;
    mockMarkerListings = [
      makeListing('sf-auth-1', 'Home Near School A'),
      makeListing('sf-auth-2', 'Home Near School B'),
    ];
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false });
    vi.mocked(useDiscoverFilteredMarkers).mockReturnValue({
      data: { city: 'udupi', markers: AUTH_SCHOOL_FIRST_MARKERS },
      isLoading: false,
      isFetching: false,
    } as ReturnType<typeof useDiscoverFilteredMarkers>);
    vi.mocked(useSchoolRadiusListings).mockReturnValue({
      data: undefined, isLoading: false,
    } as ReturnType<typeof useSchoolRadiusListings>);
  });

  it('tapping a second marker replaces (not closes) the mobile preview sheet', async () => {
    installMobileMatchMediaMock();
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=school-first&schoolId=sch-1&radiusKm=3`,
    );

    const mapTrigger = await screen.findByTestId('control-bar-map-trigger');
    fireEvent.click(mapTrigger);

    await waitFor(() => {
      expect(screen.getByTestId('mobile-map-close-list-button')).toBeInTheDocument();
      expect(capturedOnReady).toBeDefined();
    });

    act(() => {
      capturedOnReady!();
    });

    const [markerA, markerB] = screen.getAllByTestId('property-marker');

    // Real, bubbling DOM clicks — reproduces the actual marker DOM structure
    // (a `data-listing-id` wrapper nested inside DiscoverMapCanvas's real
    // background div), unlike calling the captured onSelectListing/
    // onMarkerClickWithPosition props directly.
    fireEvent.click(markerA);

    await waitFor(() => {
      expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();
    });
    expect(screen.getByText('Home Near School A')).toBeInTheDocument();

    fireEvent.click(markerB);

    // THE ASSERTION: the sheet must still be open, now showing listing B —
    // pre-fix, the bubbled click reached DiscoverMapCanvas's background
    // `onClick` (handleBackgroundClick) and called handlePopoverDismiss(),
    // clearing the selection the marker's own click handler had just set.
    await waitFor(() => {
      expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();
    });
    expect(screen.getByText('Home Near School B')).toBeInTheDocument();
  });

  // G3-M9 (#2750 PR-3 B1) — retires issue-2149-mobile-school-first-marker-preview "tap A" (schoolId/radiusKm
  // survive the tap), "tap B" (URL unchanged; no desktop popover alongside the sheet) and the desktop
  // title (popover shown, no mobile sheet). Real bubbling clicks, real composition root.
  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="loc-probe">{location.search}</div>;
  }
  const renderAtWithProbe = (url: string) =>
    render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={[url]}>
          <LocationProbe />
          <Routes>
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  const SCHOOL_FIRST_URL = `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=school-first&schoolId=sch-1&radiusKm=3`;
  const probeParams = () => new URLSearchParams(screen.getByTestId('loc-probe').textContent ?? '');

  it('G3-M9 mobile: after tapping marker A then B the sheet shows B, NO desktop marker-popover-card is rendered alongside it, and schoolId=sch-1/radiusKm=3 are still in the URL', async () => {
    installMobileMatchMediaMock();
    renderAtWithProbe(SCHOOL_FIRST_URL);

    fireEvent.click(await screen.findByTestId('control-bar-map-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('mobile-map-close-list-button')).toBeInTheDocument();
      expect(capturedOnReady).toBeDefined();
    });
    act(() => {
      capturedOnReady!();
    });
    const [markerA, markerB] = screen.getAllByTestId('property-marker');

    fireEvent.click(markerA);
    await waitFor(() => {
      expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    const afterA = probeParams();
    expect(afterA.get('schoolId')).toBe('sch-1');
    expect(afterA.get('radiusKm')).toBe('3');

    // NB: scope the text query to the sheet — the mock PropertyMap's marker buttons ALSO carry the
    // listing titles, which is what makes the pre-existing `it` above fail at base ("multiple elements").
    expect(within(screen.getByTestId('mobile-listing-preview-sheet')).getByText('Home Near School A')).toBeInTheDocument();
    fireEvent.click(markerB);
    await waitFor(() => {
      expect(
        within(screen.getByTestId('mobile-listing-preview-sheet')).getByText('Home Near School B'),
      ).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('mobile-listing-preview-sheet')).queryByText('Home Near School A')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    const afterB = probeParams();
    expect(afterB.get('schoolId')).toBe('sch-1');
    expect(afterB.get('radiusKm')).toBe('3');
  });

  it('G3-M9 desktop (no mobile matchMedia): a school-first marker click shows marker-popover-card with the listing, and mobile-listing-preview-sheet is absent', async () => {
    renderAtWithProbe(SCHOOL_FIRST_URL);

    await waitFor(() => {
      expect(capturedOnReady).toBeDefined();
    });
    act(() => {
      capturedOnReady!();
    });
    const [markerA] = await screen.findAllByTestId('property-marker');
    fireEvent.click(markerA);

    const card = await screen.findByTestId('marker-popover-card');
    expect(card).toHaveTextContent('Home Near School A');
    expect(screen.queryByTestId('mobile-listing-preview-sheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-map-close-list-button')).not.toBeInTheDocument();
  });

  // G3-M9-1738 (#2750 PR-3 B1; the page-level popover render for discover/school-radius-marker-click-repro-1738
  // AC1 + AC2). markerPopoverEligibility.test.ts proves the PURE gate; these two prove the page actually RENDERS
  // the popover from a real marker click in the area-first states the 1738 spec drove (AC5 school-first is
  // contradicted by #1973 and covered by the desktop `it` above).
  it.each([
    ['AC1 area-first, area only', `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal`],
    ['AC2 area-first, area + school', `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=3`],
  ])('G3-M9-1738 desktop %s: a marker click renders marker-popover-card with the listing', async (_label, url) => {
    // area-first marker listings come from the SELECTED AREA's city-listings payload (resolveMarkerListings
    // selectedArea branch), not from /api/discover/markers, so resolve the area + give it the same two listings.
    const AREA_KEY = 'IN|KA|Udupi|Manipal';
    vi.mocked(useDiscoverAreas).mockReturnValue({
      data: {
        city: 'udupi',
        areas: [
          {
            areaKey: AREA_KEY, name: 'Manipal', geoCenterLat: 13.34, geoCenterLon: 74.74,
            minLat: 13.3, minLon: 74.7, maxLat: 13.38, maxLon: 74.78, listingCount: 2, schoolCount: 3,
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDiscoverAreas>);
    vi.mocked(useDiscoverCityListings).mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 50,
        areas: [{ areaKey: AREA_KEY, areaName: 'Manipal', listings: AUTH_SCHOOL_FIRST_MARKERS.map((m) => ({ ...m, title: undefined })) }],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useDiscoverCityListings>);
    try {
      renderAtWithProbe(url);

      await waitFor(() => {
        expect(capturedOnReady).toBeDefined();
      });
      act(() => {
        capturedOnReady!();
      });
      const [markerA] = await screen.findAllByTestId('property-marker');
      fireEvent.click(markerA);

      const card = await screen.findByTestId('marker-popover-card');
      expect(card).toHaveTextContent('Home Near School A');
      expect(screen.queryByTestId('mobile-listing-preview-sheet')).not.toBeInTheDocument();
    } finally {
      vi.mocked(useDiscoverAreas).mockReturnValue({ data: { city: 'udupi', areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverAreas>);
      vi.mocked(useDiscoverCityListings).mockReturnValue({ data: { areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverCityListings>);
    }
  });
});
