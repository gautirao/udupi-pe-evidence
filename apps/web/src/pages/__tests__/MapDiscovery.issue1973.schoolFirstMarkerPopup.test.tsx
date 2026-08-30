/**
 * Issue #1973 — FIX (maintained regression suite; promoted from the Stage-A
 * throwaway repro `MapDiscovery.issue1973.schoolFirstMarkerPopup.repro.test.tsx`,
 * which pinned the BROKEN behaviour and is now retired).
 *
 * Bug: in the pure school-first ("Search near a school") journey — a school +
 * radius selected — clicking a listing/home marker opened NO popup. Root cause:
 * both the RENDER gate (isMarkerPopoverEligible, MapDiscovery.tsx) and the
 * CAPTURE gate (handleMarkerClickWithPosition, useMarkerSelection.ts) required
 * `areaKey != null`, but school-first radius search is cross-area — areaKey is
 * null in that live state — so even a naive schoolId/journey clause flip would
 * still have rejected it.
 *
 * Fix: both gates now use the SAME additive-OR predicate:
 *   journey !== 'agri-first' && (
 *     ( areaKey != null && (schoolId == null || journey === 'area-first') )
 *     || ( journey === 'school-first' && schoolId != null )
 *   )
 *
 * Coverage (per the approved plan's ACs):
 * - AC1: auth school-first (areaKey null, schoolId set) — marker click opens the
 *   popup; stepper n/N matches currentMapMarkerListings (Tier-1 auth markers).
 * - AC2: anon school-first (areaKey null, schoolId set) — marker click opens the
 *   popup from Tier-2 schoolRadiusFallbackMarkers; clicked id is confirmed
 *   present in the resolved marker set via the stepper n/N.
 * - AC3 (no regression): area-first mid school-picking (schoolId==null, areaKey
 *   set) — sanity check that no popup pre-exists before any listing-marker click.
 * - AC4 (no regression): area-first area+school combined (areaKey set, schoolId
 *   set) — listing-marker click still opens the popup (Issue #1738, unaffected
 *   by #1973).
 * - AC5 (no regression): agri-first — still excluded regardless of areaKey.
 * - AC7 (LOAD-BEARING): school-first with an EXPLICIT areaKey==null fixture —
 *   without this fixture, a naive clause-flip (swap `schoolId == null` for
 *   `schoolId != null` without adding the areaKey-free OR branch) would still
 *   pass every other test here while leaving the actual reported bug (cross-area
 *   school-first) unfixed.
 *
 * Issue #1973 rev-2 (A1 source-tracking fix) — the rev-1 gate fix above
 * UNMASKED a clear-race: the #1939 URL->popover reverse-sync effect
 * (MapDiscovery.tsx, keyed on urlState.selectedListing/mapReady/etc.) was
 * clearing the click-set popover in pure school-first, because
 * handleSelectMarkerListing does NOT write the URL `listing` param for pure
 * school-first (the #1547-deferred design) — so urlState.selectedListing
 * stays null and the effect's F1 branch (urlState.selectedListing == null =>
 * clearMarkerPopoverFromUrl()) fired even though the popover was never
 * URL-backed. AC1/AC2 below now genuinely drive mapReady=true (via the
 * PropertyMap mock's onReady prop) so the reverse-sync effect ACTUALLY RUNS
 * and assert the popover SURVIVES it (not just "present immediately after
 * the click", which is how rev-1's tests false-positived — mapReady never
 * flipped true, so the effect always early-returned and never exercised the
 * clear path at all). AC10 pins the race explicitly with the opposite
 * click/mapReady ordering; AC11 pins the area-first Back-nav non-regression
 * (a URL-backed popover MUST still close when the URL loses `listing`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useSchoolRadiusListings } from '@/hooks/useSchoolRadiusListings';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

let capturedOnSelectListing: ((listing: PropertyListingWithImages | null) => void) | undefined;
let capturedOnMarkerClickWithPosition: ((pos: { x: number; y: number }) => void) | undefined;
// Issue #1973 rev-2 — captures DiscoverMapCanvas's onReady prop (the same one
// that drives setMapReady(true) in real usage, MapDiscovery.tsx / DiscoverMapCanvas.tsx
// `onReady={() => setMapReady(true)}`), so tests can flip mapReady true and force
// the #1939 reverse-sync effect to actually run instead of early-returning.
let capturedOnReady: (() => void) | undefined;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

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
      capturedOnSelectListing = onSelectListing;
      capturedOnMarkerClickWithPosition = onMarkerClickWithPosition;
      capturedOnReady = onReady;
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

// Issue #1973 rev-2 (AC11) — captures the real react-router navigate function
// from INSIDE the same MemoryRouter MapDiscovery renders under, so a test can
// call capturedNavigate!(-1) to genuinely pop a history entry (a real Back
// navigation) rather than mocking useDiscoverUrlState. setSelectedListing
// PUSHes (see useDiscoverUrlState.ts), so this pops exactly the `listing=`
// entry a marker click wrote, leaving MapDiscovery's own component state
// (selectedMarkerListing etc.) untouched — the same instance stays mounted.
let capturedNavigate: ReturnType<typeof useNavigate> | undefined;

function NavCapture() {
  capturedNavigate = useNavigate();
  return null;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/discover"
            element={<DiscoverProvider><NavCapture /><MapDiscovery /></DiscoverProvider>}
          />
          <Route
            path="*"
            element={<DiscoverProvider><NavCapture /><MapDiscovery /></DiscoverProvider>}
          />
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

// Tier-1 auth marker fixture feeding currentMapMarkerListings (see resolveMarkerListings —
// FORBIDDEN to edit — school-first + schoolId: Tier 1 is markerListings when non-empty).
const AUTH_SCHOOL_FIRST_MARKERS = [
  { id: 'sf-auth-1', lat: 13.34, lon: 74.74, propertyType: 'apartment', pricePaise: 5_000_000_00, locality: 'Manipal' },
  { id: 'sf-auth-2', lat: 13.341, lon: 74.741, propertyType: 'apartment', pricePaise: 6_000_000_00, locality: 'Manipal' },
];

// Tier-2 anon/public school-radius fixture (public endpoint contract — see
// useSchoolRadiusListings.ts, FORBIDDEN to edit). Needs latitude/longitude so
// deriveAnonSchoolRadiusMarkers does not filter the entries out.
const ANON_SCHOOL_RADIUS_CONTENT = [
  { id: 'sf-anon-1', propertyType: 'apartment', title: 'Anon School First A', locality: 'Manipal', latitude: 13.34, longitude: 74.74 },
  { id: 'sf-anon-2', propertyType: 'apartment', title: 'Anon School First B', locality: 'Manipal', latitude: 13.341, longitude: 74.741 },
];

describe('Issue #1973 FIX — school-first "homes near school" marker click opens the popup', () => {
  beforeEach(() => {
    capturedOnSelectListing = undefined;
    capturedOnMarkerClickWithPosition = undefined;
    capturedOnReady = undefined;
    capturedNavigate = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    vi.mocked(useDiscoverFilteredMarkers).mockReturnValue({
      data: undefined, isLoading: false, isFetching: false,
    } as ReturnType<typeof useDiscoverFilteredMarkers>);
    vi.mocked(useSchoolRadiusListings).mockReturnValue({
      data: undefined, isLoading: false,
    } as ReturnType<typeof useSchoolRadiusListings>);
  });

  it('AC1 + AC7: auth, journey=school-first, areaKey=null (LOAD-BEARING), schoolId set — marker click opens the popup with a matching stepper n/N', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false });
    vi.mocked(useDiscoverFilteredMarkers).mockReturnValue({
      data: { city: 'udupi', markers: AUTH_SCHOOL_FIRST_MARKERS },
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof useDiscoverFilteredMarkers>);

    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=school-first&schoolId=sch-1&radiusKm=3`,
    );

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
      expect(capturedOnReady).toBeDefined();
    });

    // Issue #1973 rev-2 — flip mapReady=true BEFORE the click (the realistic
    // ordering: the map finishes loading, then the user clicks a marker) so
    // the #1939 reverse-sync effect is armed and fires in the SAME act() as
    // the click's state update.
    act(() => {
      capturedOnReady!();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('sf-auth-2', 'Home Near School (Auth)'));
      capturedOnMarkerClickWithPosition!({ x: 120, y: 140 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Home Near School (Auth)')).toBeInTheDocument();
    // sf-auth-2 is the 2nd of 2 markers in AUTH_SCHOOL_FIRST_MARKERS — proves
    // currentMapMarkerListings resolved the Tier-1 auth set even with areaKey null.
    expect(screen.getByTestId('popover-stepper-label')).toHaveTextContent('2/2');

    // Issue #1973 rev-2 — PERSISTENCE, not just immediate presence. Force one
    // more settle tick (the #1939 reverse-sync effect's dependency array
    // includes selectedMarkerListing/mapReady, both already stable at this
    // point, so a no-op re-render here proves the popover isn't merely
    // showing for one render before a delayed clear).
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
  });

  it('AC2: anon, journey=school-first, areaKey=null, schoolId set — marker click opens the popup from Tier-2 schoolRadiusFallbackMarkers', async () => {
    vi.mocked(useSchoolRadiusListings).mockReturnValue({
      data: { content: ANON_SCHOOL_RADIUS_CONTENT, page: 0, size: 50, hasMore: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useSchoolRadiusListings>);

    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=school-first&schoolId=sch-1&radiusKm=3`,
    );

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
      expect(capturedOnReady).toBeDefined();
    });

    // Issue #1973 rev-2 — OPPOSITE ordering from AC1: click FIRST (mapReady
    // still false here, so the #1939 reverse-sync effect is dormant), THEN
    // flip mapReady true. This is the actual reported race: mapReady flips
    // on a later render than the click, so the effect's first live run sees
    // an already click-set popover and must not wipe it.
    act(() => {
      capturedOnSelectListing!(makeListing('sf-anon-1', 'Home Near School (Anon)'));
      capturedOnMarkerClickWithPosition!({ x: 120, y: 140 });
    });

    act(() => {
      capturedOnReady!();
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Home Near School (Anon)')).toBeInTheDocument();
    // sf-anon-1 is the 1st of 2 in ANON_SCHOOL_RADIUS_CONTENT — confirms the
    // clicked id was found within currentMapMarkerListings (Tier-2), not a
    // standalone/no-op click (which would show no stepper at all).
    expect(screen.getByTestId('popover-stepper-label')).toHaveTextContent('1/2');
  });

  it('AC3 (no regression): area-first mid school-picking (schoolId=null, areaKey set) — no popup present before any marker click', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    // A school pin's click handler is not part of PropertyMap's onSelectListing/
    // onMarkerClickWithPosition contract (owned by SchoolMarkerLayer, forbidden
    // to touch here) — this asserts the baseline: nothing pre-opens the listing
    // popup while picking a school in area-first.
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
  });

  it('AC4 (no regression, #1738 unaffected): area-first area+school combined (areaKey set, schoolId set) — marker click still opens the popup', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&schoolId=sch-1`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('combo-1', 'Area+School Combined Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Area+School Combined Listing')).toBeInTheDocument();
  });

  it('AC5 (no regression): agri-first is excluded regardless of areaKey/schoolId', async () => {
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=agri-first&schoolId=sch-1`,
    );

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('agri-1', 'Agri Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
  });

  it('AC10 (rev-2, pin): pure school-first click-set popover SURVIVES the #1939 reverse-sync effect once mapReady is true — the reverse-sync clear-race', async () => {
    // Pre-fix (rev-1 tree, guard absent) this test FAILS: mapReady flips true,
    // the click sets selectedMarkerListing/markerPixelPos WITHOUT writing the
    // URL `listing` param (pure school-first, #1547-deferred), so the #1939
    // reverse-sync effect's F1 branch (urlState.selectedListing == null) sees
    // no URL-backing and calls clearMarkerPopoverFromUrl(), wiping the
    // click-set popover in the same act() as the click.
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false });
    vi.mocked(useDiscoverFilteredMarkers).mockReturnValue({
      data: { city: 'udupi', markers: AUTH_SCHOOL_FIRST_MARKERS },
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof useDiscoverFilteredMarkers>);

    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=school-first&schoolId=sch-1&radiusKm=3`,
    );

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
      expect(capturedOnReady).toBeDefined();
    });

    // Map finishes loading — mapReady becomes true, arming the #1939
    // reverse-sync effect (isMarkerPopoverEligible is already true for pure
    // school-first per the rev-1 gate fix).
    act(() => {
      capturedOnReady!();
    });

    // The REAL onSelectListing + onMarkerClickWithPosition path, exactly as
    // MarkerClusterLayer's click handler invokes it.
    act(() => {
      capturedOnSelectListing!(makeListing('sf-auth-1', 'Home Near School (Auth) — AC10'));
      capturedOnMarkerClickWithPosition!({ x: 80, y: 90 });
    });

    // Let the reverse-sync effect (and any further settle renders) run to
    // completion before asserting — this is the fidelity requirement (AC12):
    // a bare synchronous assertion right after the click would not prove the
    // popover SURVIVES the effect, only that it existed for one render.
    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    expect(screen.getByText('Home Near School (Auth) — AC10')).toBeInTheDocument();
  });

  it('AC11 (rev-2, non-regression): a URL-backed area-first popover STILL CLOSES when the URL loses `listing` (Back navigation)', async () => {
    // Critical non-regression for the A1 fix: area-first marker clicks are
    // URL-backed (handleSelectMarkerListing's #1547/#1738 branch writes
    // setSelectedListing), so the guard must NOT skip the F1 clear for this
    // source — only for a pure click-set (school-first) popover.
    renderAt(
      `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&schoolId=sch-1`,
    );

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
      expect(capturedOnReady).toBeDefined();
      expect(capturedNavigate).toBeDefined();
    });

    act(() => {
      capturedOnReady!();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('combo-1', 'Area+School Combined Listing'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });

    // Real Back navigation: setSelectedListing PUSHes (useDiscoverUrlState.ts),
    // so navigate(-1) pops exactly that history entry, dropping `listing` from
    // the URL while MapDiscovery's own component state (selectedMarkerListing,
    // the popover just opened) is untouched by the navigation itself — this is
    // the scenario the #1939 reverse-sync effect's F1 branch exists for.
    act(() => {
      capturedNavigate!(-1);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    });
  });
});
