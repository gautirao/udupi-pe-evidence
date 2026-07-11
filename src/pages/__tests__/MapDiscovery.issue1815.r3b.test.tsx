/**
 * Issue #1815 (R3b/R6) — a panel search match must promote that area to a
 * full labelled map pin, per AreaMarkerLayer's own documented contract:
 * "Areas matching the active panel search — always forced to full labelled
 * pins." The live e2e found this never happened: typing a matching area
 * name correctly filtered the panel, but the map kept its pre-search pills.
 *
 * Root cause (src/pages/MapDiscovery.tsx): `areaSearchMatchKeys` — the prop
 * threaded through to AreaMarkerLayer's `searchMatchKeys` — was hardcoded to
 * `undefined` (a leftover from #1798 PR-B1, before search-driven map
 * promotion was in scope), even though the debounced live search-query
 * state it should have been derived from (`debouncedAreaSearchQuery`,
 * already wired up from the panel via `onAreaSearchQueryChange`) existed the
 * whole time. This test drives that exact boundary directly: it captures
 * DiscoverRightPanel's `onAreaSearchQueryChange` callback (simulating the
 * panel reporting a live keystroke) and asserts the matched area key
 * eventually reaches PropertyMap's `areaSearchMatchKeys` prop — and that the
 * camera-owning `panToArea` prop is untouched by the search (R3b's own
 * "no camera move while typing" requirement).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';

// ─── Hoisted handles ───────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const propertyMapPropsLog = vi.hoisted(() => ({
  panToAreas: [] as Array<unknown>,
  areaSearchMatchKeys: [] as Array<string[] | undefined>,
}));

const discoverRightPanelHandle = vi.hoisted(() => ({
  onAreaSearchQueryChange: null as ((query: string) => void) | null,
}));

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { panToArea?: unknown; areaSearchMatchKeys?: string[] }) => {
    propertyMapPropsLog.panToAreas.push(props.panToArea ?? null);
    propertyMapPropsLog.areaSearchMatchKeys.push(props.areaSearchMatchKeys);
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: (props: { onAreaSearchQueryChange?: (query: string) => void }) => {
    discoverRightPanelHandle.onAreaSearchQueryChange = props.onAreaSearchQueryChange ?? null;
    return <div data-testid="discover-right-panel-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Fixture areas — same University Belt pair used by MapDiscovery.issue1069.test.tsx.
const MANIPAL = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  name: 'Manipal',
  geo_center_lat: 13.3525, geo_center_lon: 74.7869,
  geoCenterLat: 13.3525, geoCenterLon: 74.7869,
  minLat: 13.34, minLon: 74.78, maxLat: 13.37, maxLon: 74.82,
  bbox: [[13.34, 74.78], [13.37, 74.82]] as [[number, number], [number, number]],
  listingCount: 0, schoolCount: 0, trendDirection: 'stable',
};
const KATAPADI = {
  areaKey: 'IN|KA|Udupi|Katapadi',
  areaLabel: 'Katapadi',
  name: 'Katapadi',
  geo_center_lat: 13.366, geo_center_lon: 74.792,
  geoCenterLat: 13.366, geoCenterLon: 74.792,
  minLat: 13.355, minLon: 74.785, maxLat: 13.375, maxLon: 74.8,
  bbox: [[13.355, 74.785], [13.375, 74.8]] as [[number, number], [number, number]],
  listingCount: 0, schoolCount: 0, trendDirection: 'stable',
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'udupi', areas: [MANIPAL, KATAPADI] },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({
    data: {
      groups: [
        {
          id: 'university-belt',
          name: 'University Belt',
          subtitle: 'Academic and student housing',
          region_label: 'Central Udupi',
          school_count: 0,
          area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Katapadi'],
        },
      ],
    },
    isLoading: false,
  })),
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
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
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

function isSyntheticGroupBounds(panToArea: unknown): boolean {
  const p = panToArea as { areaKey?: string } | null;
  return !!p && p.areaKey === GROUP_BOUNDS_SYNTHETIC_KEY;
}

describe('Issue #1815 (R3b/R6) — panel search promotes a matching area to a map pin', () => {
  beforeEach(() => {
    propertyMapPropsLog.panToAreas.length = 0;
    propertyMapPropsLog.areaSearchMatchKeys.length = 0;
    discoverRightPanelHandle.onAreaSearchQueryChange = null;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('a search query matching Katapadi eventually reaches PropertyMap as areaSearchMatchKeys=["IN|KA|Udupi|Katapadi"], without moving the camera', async () => {
    renderAt('/discover?city=udupi&groupId=university-belt');

    // Let the group-framing fit settle first (proves the panel/map plumbing
    // is otherwise healthy before the search-specific assertion).
    await waitFor(() => {
      expect(propertyMapPropsLog.panToAreas.some(isSyntheticGroupBounds)).toBe(true);
    });
    const panToAreaCountBeforeSearch = propertyMapPropsLog.panToAreas.length;
    const lastPanToAreaBeforeSearch = propertyMapPropsLog.panToAreas.at(-1);

    expect(discoverRightPanelHandle.onAreaSearchQueryChange).not.toBeNull();

    // Simulate the panel reporting a live keystroke — this is exactly the
    // callback ScopedSearch fires on every character via
    // onAreaSearchQueryChange, which drives MapDiscovery's
    // areaSearchQuery -> (200ms debounce) -> debouncedAreaSearchQuery state.
    discoverRightPanelHandle.onAreaSearchQueryChange!('Katapadi');

    // REGRESSION ASSERTION: pre-fix, areaSearchMatchKeys was hardcoded to
    // `undefined` and this would never become true.
    await waitFor(
      () => {
        const last = propertyMapPropsLog.areaSearchMatchKeys.at(-1);
        expect(last).toEqual(['IN|KA|Udupi|Katapadi']);
      },
      { timeout: 2000 },
    );

    // No camera move: panToArea must not have changed as a result of the
    // search (still the same synthetic group bounds it was before typing).
    const lastPanToAreaAfterSearch = propertyMapPropsLog.panToAreas.at(-1);
    expect(lastPanToAreaAfterSearch).toEqual(lastPanToAreaBeforeSearch);
    void panToAreaCountBeforeSearch;
  });

  it('an empty search query clears areaSearchMatchKeys back to undefined', async () => {
    renderAt('/discover?city=udupi&groupId=university-belt');

    await waitFor(() => {
      expect(propertyMapPropsLog.panToAreas.some(isSyntheticGroupBounds)).toBe(true);
    });
    expect(discoverRightPanelHandle.onAreaSearchQueryChange).not.toBeNull();

    discoverRightPanelHandle.onAreaSearchQueryChange!('Manipal');
    await waitFor(
      () => {
        expect(propertyMapPropsLog.areaSearchMatchKeys.at(-1)).toEqual(['IN|KA|Udupi|Manipal']);
      },
      { timeout: 2000 },
    );

    discoverRightPanelHandle.onAreaSearchQueryChange!('');
    await waitFor(
      () => {
        expect(propertyMapPropsLog.areaSearchMatchKeys.at(-1)).toBeUndefined();
      },
      { timeout: 2000 },
    );
  });

  it('a query matching no area yields areaSearchMatchKeys=undefined (never an empty array)', async () => {
    renderAt('/discover?city=udupi&groupId=university-belt');

    await waitFor(() => {
      expect(propertyMapPropsLog.panToAreas.some(isSyntheticGroupBounds)).toBe(true);
    });
    expect(discoverRightPanelHandle.onAreaSearchQueryChange).not.toBeNull();

    discoverRightPanelHandle.onAreaSearchQueryChange!('ZZZ-no-such-area');
    // Give the 200ms debounce + a settle margin, then assert it never
    // becomes a populated array.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(propertyMapPropsLog.areaSearchMatchKeys.at(-1)).toBeUndefined();
  });
});
