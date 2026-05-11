/**
 * Issue #1069 — when a group is focused (URL ?groupId=…) and no area is
 * selected, MapDiscovery must derive a synthetic group-bounds AreaPoint via
 * computeGroupBounds and pass it to PropertyMap.panToArea, so AreaPanner
 * can fitBounds (clamped to AREA_LAYER_MAX_ZOOM) to all member areas.
 *
 * Verifies the producer side of the fix: panToArea arrives at PropertyMap
 * with areaKey === GROUP_BOUNDS_SYNTHETIC_KEY for both narrow groups
 * (University Belt — the regression) and wide groups (Coastal Strip —
 * non-regression).
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
}));

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { panToArea?: unknown }) => {
    propertyMapPropsLog.panToAreas.push(props.panToArea ?? null);
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: () => <div data-testid="discover-right-panel-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Fixture areas: Manipal + Katapadi (narrow), Malpe + Kaup (wide)
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
const MALPE = {
  areaKey: 'IN|KA|Udupi|Malpe',
  areaLabel: 'Malpe',
  name: 'Malpe',
  geo_center_lat: 13.355, geo_center_lon: 74.705,
  geoCenterLat: 13.355, geoCenterLon: 74.705,
  minLat: 13.34, minLon: 74.69, maxLat: 13.37, maxLon: 74.72,
  bbox: [[13.34, 74.69], [13.37, 74.72]] as [[number, number], [number, number]],
  listingCount: 0, schoolCount: 0, trendDirection: 'stable',
};
const KAUP = {
  areaKey: 'IN|KA|Udupi|Kaup',
  areaLabel: 'Kaup',
  name: 'Kaup',
  geo_center_lat: 13.225, geo_center_lon: 74.745,
  geoCenterLat: 13.225, geoCenterLon: 74.745,
  minLat: 13.21, minLon: 74.73, maxLat: 13.24, maxLon: 74.76,
  bbox: [[13.21, 74.73], [13.24, 74.76]] as [[number, number], [number, number]],
  listingCount: 0, schoolCount: 0, trendDirection: 'stable',
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'udupi', areas: [MANIPAL, KATAPADI, MALPE, KAUP] },
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
        {
          id: 'coastal-strip',
          name: 'Coastal Strip',
          subtitle: 'Beachside and fishing villages',
          region_label: 'West Udupi',
          school_count: 0,
          area_keys: ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Kaup'],
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

const expectSyntheticGroupBounds = (panToArea: unknown) => {
  const p = panToArea as {
    areaKey?: string;
    bbox?: [[number, number], [number, number]];
  } | null;
  expect(p, 'panToArea should be set').not.toBeNull();
  expect(p?.areaKey).toBe(GROUP_BOUNDS_SYNTHETIC_KEY);
  expect(p?.bbox, 'group bbox required').toBeDefined();
  return p!.bbox!;
};

describe('Issue #1069 — group-focus passes synthetic group-bounds to PropertyMap', () => {
  beforeEach(() => {
    propertyMapPropsLog.panToAreas.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('University Belt (narrow group) → panToArea is synthetic group bounds covering Manipal+Katapadi', async () => {
    renderAt('/discover?city=udupi&groupId=university-belt');

    await waitFor(() => {
      const last = propertyMapPropsLog.panToAreas.at(-1);
      const bbox = expectSyntheticGroupBounds(last);
      // Union of Manipal [[13.34,74.78],[13.37,74.82]] and Katapadi [[13.355,74.785],[13.375,74.8]]
      const [[s, w], [n, e]] = bbox;
      expect(s).toBeCloseTo(13.34, 3);
      expect(w).toBeCloseTo(74.78, 3);
      expect(n).toBeCloseTo(13.375, 3);
      expect(e).toBeCloseTo(74.82, 3);
    });
  });

  it('Coastal Strip (wide group) → panToArea is synthetic group bounds covering Malpe+Kaup (non-regression)', async () => {
    renderAt('/discover?city=udupi&groupId=coastal-strip');

    await waitFor(() => {
      const last = propertyMapPropsLog.panToAreas.at(-1);
      const bbox = expectSyntheticGroupBounds(last);
      // Union of Malpe [[13.34,74.69],[13.37,74.72]] and Kaup [[13.21,74.73],[13.24,74.76]]
      const [[s, w], [n, e]] = bbox;
      expect(s).toBeCloseTo(13.21, 3);
      expect(w).toBeCloseTo(74.69, 3);
      expect(n).toBeCloseTo(13.37, 3);
      expect(e).toBeCloseTo(74.76, 3);
    });
  });
});
