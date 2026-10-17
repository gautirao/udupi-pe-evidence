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
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
      selectedListingId,
    }: {
      onSelectListing?: (listing: PropertyListingWithImages | null) => void;
      onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
      onReady?: () => void;
      selectedListingId?: string | null;
    }) => {
      capturedOnReady = onReady;
      return (
        <div data-testid="property-map-mock">
          {mockMarkerListings.map((listing) => (
            // #2750 PR-5 review-fix r2 (C3): forward the URL-driven selection the way the real
            // MarkerClusterLayer marks `.property-marker--selected`, so a cold ?listing= link can assert the highlight.
            <div
              key={listing.id}
              data-listing-id={listing.id}
              data-selected={selectedListingId === listing.id ? 'true' : undefined}
            >
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

  // #2750 PR-4 B1 T1 — issue-2089-filter-list-map-parity (LIST HALF + URL survival only). Caveat: the map half is NOT pinned here — `useDiscoverFilteredMarkers` is stubbed to undefined, so no marker count is asserted, and markers not narrowing by property type (useSchoolListings.ts ~L173-180) is a possible defect this test deliberately does not lock in.
  // The e2e spec (RR Nagar, anon, 390x844) asserted ONE filter state drives both the list cards and the map marker
  // set: Apartments chip → list 2→1, `type=apartment` in the URL, Map exactly 1 marker, and back to List keeps count
  // + URL. This drives the anon school-first feed (apartment + house in the public school-radius payload) through the
  // real page: `applyAnonPropertyFilters` (useSchoolListings) narrows the cards. Oracle = `listing-card` testids (never
  // titles: cards and the mock marker buttons carry the same text — the duplicate-text hazard behind the red :275).
  // The unfiltered arm is the positive control (2 cards) so the narrowing is measured, not assumed.
  const SCHOOL_RADIUS_CARDS = [
    { id: 'fp-apartment', propertyType: 'apartment', title: 'Filter Parity Apartment', locality: 'Manipal', latitude: 13.34, longitude: 74.74, priceBand: '₹50L–1Cr', listingPurpose: 'sale' },
    { id: 'fp-house', propertyType: 'house', title: 'Filter Parity House', locality: 'Manipal', latitude: 13.341, longitude: 74.741, priceBand: '₹50L–1Cr', listingPurpose: 'sale' },
  ];

  it('#2089 filter parity (anon, mobile, school-first): type=apartment narrows the list cards 2→1 with type=apartment in the URL, and the narrowing + URL survive a List→Map→List toggle', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    vi.mocked(useDiscoverFilteredMarkers).mockReturnValue({
      data: undefined, isLoading: false, isFetching: false,
    } as unknown as ReturnType<typeof useDiscoverFilteredMarkers>);
    vi.mocked(useSchoolRadiusListings).mockReturnValue({
      data: { content: SCHOOL_RADIUS_CARDS, page: 0, size: 50, hasMore: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useSchoolRadiusListings>);
    installMobileMatchMediaMock();

    // ARM 1 (positive control, no filter): the page really renders the feed — 2 cards.
    const unfiltered = renderAtWithProbe(SCHOOL_FIRST_URL);
    await waitFor(() => {
      expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
    });
    expect(probeParams().get('type')).toBeNull();
    unfiltered.unmount();

    // ARM 2 (type=apartment): 1 card, URL keeps type=apartment, and both survive the List→Map→List toggle.
    renderAtWithProbe(`${SCHOOL_FIRST_URL}&type=apartment`);
    await waitFor(() => {
      expect(screen.getAllByTestId('listing-card')).toHaveLength(1);
    });
    expect(probeParams().get('type')).toBe('apartment');

    fireEvent.click(await screen.findByTestId('control-bar-map-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('mobile-map-close-list-button')).toBeInTheDocument();
    });
    expect(probeParams().get('type')).toBe('apartment');

    fireEvent.click(screen.getByTestId('mobile-map-close-list-button'));
    await waitFor(() => {
      expect(screen.getAllByTestId('listing-card')).toHaveLength(1);
    });
    expect(probeParams().get('type')).toBe('apartment');
  });

  // #2750 PR-4 B1 T1 — issue-2089-marker-swap-fixture. The e2e spec (RR Nagar, two markers 300 m apart, 390x844)
  // asserted: tap marker A → sheet shows A; tap marker B (NO Close) → the sheet stays open showing B, and the
  // `listing=` URL param follows A → B. The sheet-swap half is the G3-M9 mobile `it` above (school-first, where
  // `listing=` is deliberately NOT written — #1973); the `listing=` half is only observable in an AREA-FIRST
  // area state (useMarkerSelection's URL-write gate), so this `it` is the area-first variant and reads ONLY the
  // URL probe (the mock PropertyMap's marker buttons carry the listing titles too — the duplicate-text hazard
  // behind the red :275 `it` above — so no getByText on titles). The legacy areaKey area state does not mount the
  // mobile sheet (it is the canonical node= AREA leaf that does); the property here is the URL one: a marker-to-
  // marker tap moves listing= and is never mistaken for a background tap that clears it.
  it('#2089 marker swap (area-first, mobile): tapping marker A then marker B (no Close) keeps the sheet open on B and moves the URL listing= from A to B', async () => {
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
      installMobileMatchMediaMock();
      renderAtWithProbe(
        `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}`,
      );

      fireEvent.click(await screen.findByTestId('control-bar-map-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('mobile-map-close-list-button')).toBeInTheDocument();
        expect(capturedOnReady).toBeDefined();
      });
      act(() => {
        capturedOnReady!();
      });
      const [markerA, markerB] = screen.getAllByTestId('property-marker');
      expect(probeParams().get('listing')).toBeNull();

      fireEvent.click(markerA);
      await waitFor(() => {
        expect(probeParams().get('listing')).toBe('sf-auth-1');
      });

      // Real bubbling click on B, no Close in between. If the bubbled marker click were taken for a
      // background tap, handlePopoverDismiss would CLEAR listing= here instead of moving it to B.
      fireEvent.click(markerB);
      await waitFor(() => {
        expect(probeParams().get('listing')).toBe('sf-auth-2');
      });
      // And it stays B (not cleared a tick later by a trailing dismiss).
      await new Promise((r) => setTimeout(r, 50));
      expect(probeParams().get('listing')).toBe('sf-auth-2');
    } finally {
      vi.mocked(useDiscoverAreas).mockReturnValue({ data: { city: 'udupi', areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverAreas>);
      vi.mocked(useDiscoverCityListings).mockReturnValue({ data: { areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverCityListings>);
    }
  });

  // #2750 PR-5 B1 T3 — discover-1939-listing-peek-url-restore (AC1/AC2/AC3/AC4/AC9, F1, F3 A -> delayed B).
  // Real MemoryRouter + Routes (a real /listing/:id route so "View details" UNMOUNTS MapDiscovery) + real
  // DiscoverProvider; Back/Forward are the router's own navigate(-1)/navigate(1), never a prop call. Desktop
  // (no mobile matchMedia), area-first on Manipal, authed. The popover is addressed by its own testid and
  // read with within(): the mock PropertyMap's marker buttons carry the same titles (the duplicate-text hazard).
  describe('#2750 PR-5 T3 1939 listing peek URL restore', () => {
    const MANIPAL = 'IN|KA|Udupi|Manipal';
    const TITLE_A = 'Peek Home A';
    const TITLE_B = 'Peek Home B';
    const baseCityListing = (id: string, title: string, lat: number, lon: number) =>
      ({ id, title, lat, lon, propertyType: 'apartment', pricePaise: 5_000_000_00, locality: 'Manipal' });
    const LISTING_A = baseCityListing('peek-a', TITLE_A, 13.34, 74.74);
    const LISTING_B = baseCityListing('peek-b', TITLE_B, 13.341, 74.741);

    let probeNavigate: ReturnType<typeof useNavigate> | undefined;
    let probeLocation: ReturnType<typeof useLocation> | undefined;
    function RouterProbe() {
      probeNavigate = useNavigate();
      probeLocation = useLocation();
      return null;
    }
    const probeSearch = () => new URLSearchParams(probeLocation?.search ?? '');

    function provideMarkers(listings: ReturnType<typeof baseCityListing>[]) {
      vi.mocked(useDiscoverAreas).mockReturnValue({
        data: {
          city: 'udupi',
          areas: [
            {
              areaKey: MANIPAL, name: 'Manipal', geoCenterLat: 13.34, geoCenterLon: 74.74,
              minLat: 13.3, minLon: 74.7, maxLat: 13.38, maxLon: 74.78, listingCount: listings.length, schoolCount: 3,
            },
          ],
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useDiscoverAreas>);
      vi.mocked(useDiscoverCityListings).mockReturnValue({
        data: { city: 'udupi', limitPerArea: 50, areas: [{ areaKey: MANIPAL, areaName: 'Manipal', listings }] },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useDiscoverCityListings>);
      mockMarkerListings = listings.map((l) => makeListing(l.id, l.title));
    }
    const peekUrl = (listingId?: string) =>
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(MANIPAL)}${
        listingId ? `&listing=${listingId}` : ''
      }`;
    const treeAt = (url: string) => (
      <QueryClientProvider client={peekQC}>
        <MemoryRouter initialEntries={[url]}>
          <RouterProbe />
          <Routes>
            <Route path="/listing/:id" element={<div data-testid="listing-detail-stub" />} />
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    let peekQC: QueryClient;
    const markReady = async () => {
      await waitFor(() => {
        expect(capturedOnReady).toBeDefined();
      });
      act(() => {
        capturedOnReady!();
      });
    };
    const popoverCard = () => screen.getByTestId('marker-popover-card');

    beforeEach(() => {
      peekQC = makeQC();
      probeNavigate = undefined;
      probeLocation = undefined;
      provideMarkers([LISTING_A]);
    });
    afterEach(() => {
      vi.mocked(useDiscoverAreas).mockReturnValue({ data: { city: 'udupi', areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverAreas>);
      vi.mocked(useDiscoverCityListings).mockReturnValue({ data: { areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverCityListings>);
    });

    // #2750 PR-5 1939-N1
    it('cold deep link ?listing=<id> hydrates the marker popover (dialog + title) and writes no other URL param', async () => {
      const cold = render(treeAt(peekUrl('peek-a')));
      await markReady();

      const card = await screen.findByTestId('marker-popover-card');
      expect(card).toHaveAttribute('role', 'dialog');
      expect(card).toHaveTextContent(TITLE_A);

      // C3 (Codex r2): the retired AC1/AC2 also required the SELECTED-MARKER highlight on the cold link — the URL id
      // reaches the map as selectedListingId (DiscoverMapCanvas.tsx:1018), so the marker wrapper is data-selected.
      expect(document.querySelector('[data-listing-id="peek-a"]')).toHaveAttribute('data-selected', 'true');

      // AC9 (tripwire): hydration writes NOTHING — the unrelated params are exactly what the cold URL carried
      // and the history entry is the one the router started on ('default': location.key never changed).
      await act(async () => {
        await Promise.resolve();
      });
      const params = probeSearch();
      expect(params.get('city')).toBe('udupi');
      expect(params.get('journey')).toBe('area-first');
      expect(params.get('areaKey')).toBe(MANIPAL);
      expect(params.get('listing')).toBe('peek-a');
      expect(probeLocation?.key).toBe('default');

      // Control arm (same mount shape WITHOUT listing=): the marker is on the map but no popover is hydrated.
      cold.unmount();
      render(treeAt(peekUrl()));
      await markReady();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getAllByTestId('property-marker')).toHaveLength(1);
      expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
      expect(document.querySelector('[data-listing-id="peek-a"]')).not.toHaveAttribute('data-selected');
    });

    // #2750 PR-5 review-fix r3 sweep (composed X path): the retired AC6 "X closes the card and removes listing=".
    // The hook (useMarkerSelection) and the URL facade were each proven alone; this drives the REAL popover X button
    // through the page wiring (popover -> handlePopoverDismiss -> clearSelectedListing -> router URL -> popover gone).
    it('the popover X button closes the card, removes listing= from the URL and clears the marker highlight (real router)', async () => {
      render(treeAt(peekUrl('peek-a')));
      await markReady();
      expect(await screen.findByTestId('marker-popover-card')).toHaveTextContent(TITLE_A);
      expect(probeSearch().get('listing')).toBe('peek-a');

      fireEvent.click(screen.getByRole('button', { name: 'Close property preview' }));

      await waitFor(() => {
        expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
      });
      expect(probeSearch().has('listing')).toBe(false);
      expect(probeSearch().get('city')).toBe('udupi');
      expect(probeSearch().get('areaKey')).toBe(MANIPAL);
      expect(document.querySelector('[data-listing-id="peek-a"]')).not.toHaveAttribute('data-selected');
    });

    // #2750 PR-5 1939-N2
    it('View details -> Back reopens the popover and restores listing=; Forward then Back reopens it again (real router)', async () => {
      render(treeAt(peekUrl()));
      await markReady();

      fireEvent.click(screen.getAllByTestId('property-marker')[0]);
      await waitFor(() => {
        expect(probeSearch().get('listing')).toBe('peek-a');
      });
      fireEvent.click(within(await screen.findByTestId('marker-popover-card')).getByTestId('popover-view-details'));

      // View details is a real PUSH to /listing/:id: MapDiscovery (and its popover) UNMOUNTS.
      await screen.findByTestId('listing-detail-stub');
      expect(probeLocation?.pathname).toBe('/listing/peek-a');
      expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();

      // Back: MapDiscovery re-mounts cold on the URL that names listing=peek-a.
      act(() => {
        probeNavigate!(-1);
      });
      await waitFor(() => {
        expect(probeLocation?.pathname).toBe('/discover');
      });
      expect(probeSearch().get('listing')).toBe('peek-a');
      await markReady();
      expect(await screen.findByTestId('marker-popover-card')).toHaveTextContent(TITLE_A);

      // Forward -> the detail route again; Back a SECOND time -> the popover reopens a second time.
      act(() => {
        probeNavigate!(1);
      });
      await screen.findByTestId('listing-detail-stub');
      expect(probeLocation?.pathname).toBe('/listing/peek-a');
      act(() => {
        probeNavigate!(-1);
      });
      await waitFor(() => {
        expect(probeLocation?.pathname).toBe('/discover');
      });
      expect(probeSearch().get('listing')).toBe('peek-a');
      await markReady();
      expect(await screen.findByTestId('marker-popover-card')).toHaveTextContent(TITLE_A);

      // F1 leg: from the open popover, Back removes listing= and CLOSES it; Forward restores listing= and REOPENS it.
      act(() => {
        probeNavigate!(-1);
      });
      await waitFor(() => {
        expect(probeSearch().get('listing')).toBeNull();
      });
      await waitFor(() => {
        expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
      });
      act(() => {
        probeNavigate!(1);
      });
      await waitFor(() => {
        expect(probeSearch().get('listing')).toBe('peek-a');
      });
      expect(await screen.findByTestId('marker-popover-card')).toHaveTextContent(TITLE_A);
    });

    // #2750 PR-5 1939-N3
    it('in-app switch from open A to a not-yet-resolvable B closes A, keeps listing=B, then opens B (title B, never A)', async () => {
      const view = render(treeAt(peekUrl('peek-a')));
      await markReady();
      expect(await screen.findByTestId('marker-popover-card')).toHaveTextContent(TITLE_A);

      // In-app transition (client-side, the popover for A is live in memory) to B, which the marker set cannot resolve yet.
      act(() => {
        probeNavigate!(peekUrl('peek-b'));
      });
      await waitFor(() => {
        expect(probeSearch().get('listing')).toBe('peek-b');
      });
      // A's card closes promptly and no card is shown for the unresolvable B; the URL keeps B.
      await waitFor(() => {
        expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
      });
      expect(probeSearch().get('listing')).toBe('peek-b');

      // B's marker data lands.
      provideMarkers([LISTING_A, LISTING_B]);
      view.rerender(treeAt(peekUrl('peek-b')));
      const cardB = await screen.findByTestId('marker-popover-card');
      expect(cardB).toHaveTextContent(TITLE_B);
      expect(within(cardB).queryByText(TITLE_A)).not.toBeInTheDocument();
      expect(probeSearch().get('listing')).toBe('peek-b');
    });
  });
});
