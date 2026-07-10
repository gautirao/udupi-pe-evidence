/**
 * Issue #1798 — area-first "Add school" must return the same Hebbal schools as
 * school-first, for the same canonical area identity (city/scope/groupId/areaKey).
 *
 * Root cause: MapDiscovery's schoolsAreaKey derivation gated the schools query on a
 * literal `journey === 'area-first' && schoolPicking` check. That check missed the
 * "journeyless" cold-load case (areaKey + schoolPicking present with no explicit
 * `journey` param — the shape produced by the repro URL and by #1745 Batch B
 * journeyless deep links), even though derivePanelContent already routes that exact
 * case to 'schools-in-area'. The fix reuses the already-computed `panelContent` value
 * instead of re-deriving journey/schoolPicking combinations, so the schools query and
 * the panel it feeds are always in sync by construction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const HEBBAL_AREA_KEY = 'IN|KA|Bengaluru|Hebbal';
const EMPTY_AREA_KEY = 'IN|KA|Bengaluru|EmptyZone';

const AREAS_RESPONSE = {
  city: 'bangalore',
  areas: [
    {
      areaKey: HEBBAL_AREA_KEY,
      areaLabel: 'Hebbal',
      name: 'Hebbal',
      geo_center_lat: 13.045,
      geo_center_lon: 77.6,
      geoCenterLat: 13.045,
      geoCenterLon: 77.6,
      minLat: 13.03, minLon: 77.59, maxLat: 13.06, maxLon: 77.61,
      bbox: [[13.03, 77.59], [13.06, 77.61]] as [[number, number], [number, number]],
      listingCount: 6,
      schoolCount: 2,
      trendDirection: 'stable',
    },
    {
      areaKey: EMPTY_AREA_KEY,
      areaLabel: 'Empty Zone',
      name: 'Empty Zone',
      geo_center_lat: 13.1,
      geo_center_lon: 77.7,
      geoCenterLat: 13.1,
      geoCenterLon: 77.7,
      minLat: 13.09, minLon: 77.69, maxLat: 13.11, maxLon: 77.71,
      bbox: [[13.09, 77.69], [13.11, 77.71]] as [[number, number], [number, number]],
      listingCount: 3,
      schoolCount: 0,
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

const HEBBAL_SCHOOLS = [
  { id: 'sch-hebbal-1', name: 'Hebbal Public School', latitude: 13.0451, longitude: 77.6001, city: 'bangalore', areaKey: HEBBAL_AREA_KEY, board: 'CBSE', category: 'PRIMARY' },
  { id: 'sch-hebbal-2', name: 'Hebbal Lake Academy', latitude: 13.0455, longitude: 77.6005, city: 'bangalore', areaKey: HEBBAL_AREA_KEY, board: 'ICSE', category: 'SECONDARY' },
];

// Same-endpoint contract: both area-first and school-first go through this one hook,
// keyed strictly by areaKey — never all-city, never by display label.
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn((areaKey?: string) => ({
    data: areaKey === HEBBAL_AREA_KEY
      ? { pages: [{ schools: HEBBAL_SCHOOLS }] }
      : areaKey
        ? { pages: [{ schools: [] }] }
        : undefined,
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

// Pre-existing, unrelated to #1798: DiscoverRightPanel's scope-breadcrumb fallback
// calls prettifyZoneSlug(scope) without importing it when no summaryRegions entry
// matches urlState.scope. Providing a 'north' region here keeps the test on the
// #1798 school-lookup path instead of tripping that separate defect.
vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({
    data: {
      city: 'bangalore',
      propertyType: null,
      groupBy: 'area_group',
      totalActiveListings: 10,
      regions: [{ regionKey: 'north', regionLabel: 'North Bengaluru', listingCount: 10 }],
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

async function expectHebbalSchoolsVisible() {
  await waitFor(() => {
    expect(screen.queryByText('Hebbal Public School')).not.toBeNull();
  });
  expect(screen.queryByText('Hebbal Lake Academy')).not.toBeNull();
}

describe('Issue #1798 — area-first / school-first Hebbal school-lookup consistency', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('area-first "Add school" (journeyless cold-load URL, exact repro) shows the same Hebbal schools as school-first', async () => {
    // Exact repro shape from #1798: no `journey` param, only areaKey/groupId/scope —
    // the "journeyless" cold-load case that was previously silently excluded.
    const AREA_FIRST_URL =
      '/discover?city=bangalore&lat=13.04500&lon=77.60000&zoom=14&scope=north&groupId=north-growth' +
      '&areaKey=' + encodeURIComponent(HEBBAL_AREA_KEY);

    renderAt(AREA_FIRST_URL);

    const addSchoolButton = await screen.findByTestId('add-school-cta');
    await userEvent.setup().click(addSchoolButton);

    await expectHebbalSchoolsVisible();
  });

  it('school-first Hebbal continues to show the same two schools (comparison route, unchanged)', async () => {
    const SCHOOL_FIRST_URL =
      '/discover?city=bangalore&lat=13.04503&lon=77.60004&zoom=14&scope=north&journey=school-first' +
      '&groupId=north-growth&areaKey=' + encodeURIComponent(HEBBAL_AREA_KEY);

    renderAt(SCHOOL_FIRST_URL);

    await expectHebbalSchoolsVisible();
  });

  it('area-first "Add school" also works when journey=area-first is present explicitly (pre-existing path stays intact)', async () => {
    const AREA_FIRST_URL_EXPLICIT =
      '/discover?city=bangalore&lat=13.04500&lon=77.60000&zoom=14&scope=north&journey=area-first' +
      '&groupId=north-growth&areaKey=' + encodeURIComponent(HEBBAL_AREA_KEY);

    renderAt(AREA_FIRST_URL_EXPLICIT);

    const addSchoolButton = await screen.findByTestId('add-school-cta');
    await userEvent.setup().click(addSchoolButton);

    await expectHebbalSchoolsVisible();
  });

  it('does not leak all-city schools when the selected area has none (clean no-results state preserved)', async () => {
    const EMPTY_AREA_URL =
      '/discover?city=bangalore&lat=13.10000&lon=77.70000&zoom=14&scope=north&groupId=north-growth' +
      '&areaKey=' + encodeURIComponent(EMPTY_AREA_KEY);

    renderAt(EMPTY_AREA_URL);

    const addSchoolButton = await screen.findByTestId('add-school-cta');
    await userEvent.setup().click(addSchoolButton);

    await waitFor(() => {
      expect(screen.queryByText(/no schools found/i)).not.toBeNull();
    });
    expect(screen.queryByText('Hebbal Public School')).toBeNull();
    expect(screen.queryByText('Hebbal Lake Academy')).toBeNull();
  });
});
