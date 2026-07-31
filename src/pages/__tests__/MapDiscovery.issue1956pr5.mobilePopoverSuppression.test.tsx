/**
 * Issue #1956 PR-5 — Phase 7A defect fix: on mobile Map mode, selecting a
 * listing rendered TWO overlapping preview surfaces for the SAME listing —
 * the new `mobile-listing-preview-sheet` (MobileListingPreviewSheet) AND the
 * pre-existing `marker-popover-card` (MarkerPopoverCard, via
 * DiscoverMapMarkerPopover) — confirmed live via getComputedStyle (both
 * fully visible, same z-index). Root cause: DiscoverMapCanvas.tsx's
 * `<DiscoverMapMarkerPopover>` render is gated ONLY on `isMarkerPopoverEligible`
 * (src/features/discover/views/DiscoverMapCanvas.tsx:693), with no mobile
 * guard, while MapDiscovery.tsx separately mounts MobileListingPreviewSheet
 * whenever `mobileMapOpen && selectedListingPreview` (L2070) — both fire for
 * the same URL-backed `listing=` selection in mobile Map mode.
 *
 * Fix (MapDiscovery.tsx, the `isMarkerPopoverEligible` prop passed into
 * `<DiscoverMapMount>`): narrowed to `isMarkerPopoverEligible && !mobileMapOpen`
 * at the render-prop call site only — the raw `isMarkerPopoverEligible` const
 * (shared with the capture/URL-write effects, risk R1) is untouched.
 *
 * THE TEST THAT SHOULD HAVE EXISTED (per this defect's own diagnosis): the
 * prior E2E spec (issue-1956-pr5-s5-mobile-listing-preview.spec.ts) asserted
 * the new sheet is PRESENT and on top, but never asserted the old popover is
 * ABSENT — which is exactly how a 19/19 green suite coexisted with a visibly
 * broken double-surface screen. This file is a component/integration-level
 * regression test (React Testing Library, mounting the REAL MapDiscovery
 * page) — not a full Playwright E2E, which needs a live dev server + backend
 * this environment does not provide. It proves the render-gate logic exactly
 * as it will execute in the browser (PropertyMap and DiscoverRightPanelContainer
 * are mocked at their leaf boundary only, exactly as the pre-existing
 * MapDiscovery.issue1798.markerPopup.test.tsx suite already does for the
 * marker-popover render/capture gate).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { SelectedListingPreviewAnon } from '@/features/discover/navigation/selectedListingPreview';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

let capturedOnSelectListing: ((listing: PropertyListingWithImages | null) => void) | undefined;
let capturedOnMarkerClickWithPosition: ((pos: { x: number; y: number }) => void) | undefined;
let capturedOnSelectedListingPreviewChange:
  | ((preview: SelectedListingPreviewAnon | null) => void)
  | undefined;

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

// Leaf-level mock, mirroring the PropertyMap mock above: captures
// `onSelectedListingPreviewChange` so the test can drive
// `selectedListingPreview` directly, without needing to satisfy the full
// canonical Areas-journey/AreaLeafListingsSurface data pipeline this ~90-prop
// container otherwise requires. Everything else this container renders is
// out of scope for this defect (which is purely about which MAP-side preview
// surface renders).
vi.mock('@/features/discover/views/DiscoverRightPanelContainer', () => ({
  DiscoverRightPanelContainer: (props: {
    onSelectedListingPreviewChange?: (preview: SelectedListingPreviewAnon | null) => void;
  }) => {
    capturedOnSelectedListingPreviewChange = props.onSelectedListingPreviewChange;
    return null;
  },
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
      listingCount: 1,
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
      totalActiveListings: 1,
      regions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 1 }],
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

const PREVIEW_FIXTURE: SelectedListingPreviewAnon = {
  kind: 'anon',
  id: 'listing-1',
  primaryImageUrl: null,
  propertyType: 'apartment',
  bedrooms: 3,
  areaLabel: 'Manipal',
  trustBadge: 'verified',
  priceBand: '₹1-2Cr',
};

/**
 * Controllable matchMedia mock — the shared setup.ts stub always reports
 * matches:false (desktop). Mobile-mode tests install their own to flip
 * `isMobileShell` true, mirroring the established pattern in
 * DiscoverContext.test.tsx.
 */
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

// `installMobileMatchMediaMock` overwrites `window.matchMedia` with
// `Object.defineProperty`, which persists across tests (unlike a plain
// `vi.spyOn`, it isn't reset by `restoreMocks`/`clearMocks`). Restore the
// original after every test so the desktop test below isn't polluted by a
// mobile mock installed in an earlier test in this file.
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

const AREA_URL = `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&areaKey=${encodeURIComponent(AREA_KEY)}`;

describe('Issue #1956 PR-5 defect fix — mobile Map mode must render exactly ONE listing preview surface', () => {
  beforeEach(() => {
    capturedOnSelectListing = undefined;
    capturedOnMarkerClickWithPosition = undefined;
    capturedOnSelectedListingPreviewChange = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('mobile LIST mode: the map (and therefore the popover) is unmounted — no marker-popover-card, no sheet', async () => {
    installMobileMatchMediaMock();
    renderAt(AREA_URL);

    // The mobile Map trigger is present (confirms isMobileShell picked up the
    // mock) but has not been clicked — mobileView defaults to LIST, so
    // DiscoverMapMount real-unmounts the map (per its own shouldMount gate).
    await waitFor(() => {
      expect(screen.getByTestId('control-bar-map-trigger')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('property-map-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-listing-preview-sheet')).not.toBeInTheDocument();
  });

  it('mobile MAP mode: selecting a listing renders the sheet and suppresses the legacy popover (THE defect fix)', async () => {
    installMobileMatchMediaMock();
    renderAt(AREA_URL);

    const mapTrigger = await screen.findByTestId('control-bar-map-trigger');
    fireEvent.click(mapTrigger);

    // Now in mobile Map mode — the map (and PropertyMap mock) has mounted.
    await waitFor(() => {
      expect(screen.getByTestId('mobile-map-close-list-button')).toBeInTheDocument();
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    // Drive BOTH surfaces' data sources from the SAME underlying listing
    // selection, exactly as the real app does for a single marker tap:
    // selectedListingPreview (lifted from DiscoverRightPanelContainer) and
    // selectedMarkerListing (captured from the marker click).
    act(() => {
      capturedOnSelectedListingPreviewChange?.(PREVIEW_FIXTURE);
      capturedOnSelectListing!(makeListing(PREVIEW_FIXTURE.id, 'Manipal Villa'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    // The intended mobile surface is present...
    await waitFor(() => {
      expect(screen.getByTestId('mobile-listing-preview-sheet')).toBeInTheDocument();
    });

    // ...and the legacy popover is explicitly ABSENT — the whole point of
    // this regression test (a prior E2E asserted only the sheet's presence,
    // never the popover's absence, which is exactly how the double-surface
    // defect shipped green).
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mobile-listing-preview-sheet')).toHaveLength(1);
  });

  it('desktop: unaffected — a marker click still opens exactly one marker-popover-card, and the mobile sheet never renders', async () => {
    // No matchMedia override — the shared setup.ts stub reports matches:false
    // (desktop), so isMobileShell is false and mobileMapOpen is always false.
    renderAt(AREA_URL);

    await waitFor(() => {
      expect(capturedOnMarkerClickWithPosition).toBeDefined();
    });

    act(() => {
      capturedOnSelectedListingPreviewChange?.(PREVIEW_FIXTURE);
      capturedOnSelectListing!(makeListing(PREVIEW_FIXTURE.id, 'Manipal Villa'));
      capturedOnMarkerClickWithPosition!({ x: 100, y: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-popover-card')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('marker-popover-card')).toHaveLength(1);
    expect(screen.queryByTestId('mobile-listing-preview-sheet')).not.toBeInTheDocument();
    // The mobile-only map trigger never renders on desktop.
    expect(screen.queryByTestId('control-bar-map-trigger')).not.toBeInTheDocument();
  });
});
