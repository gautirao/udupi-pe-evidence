/**
 * Issue #1067 R2 — MapDiscovery: right-panel area-card click must trigger BOTH
 * a URL update AND a map flyTo (via panToArea prop on PropertyMap).
 *
 * Strategy: mock both PropertyMap (capture `panToArea` per render) and
 * DiscoverRightPanel (capture `onSelectAreaKey` so we can invoke it directly).
 * Then assert: invoking the callback with the Padubidri areaKey causes a
 * subsequent render where PropertyMap.panToArea is the matching AreaPoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';

// ─── Hoisted handles ───────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const propertyMapPropsLog = vi.hoisted(() => ({
  panToAreas: [] as Array<unknown>,
}));

const rightPanelHandlers = vi.hoisted(() => ({
  onSelectAreaKey: null as ((areaKey: string) => void) | null,
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
  DiscoverRightPanel: (props: { onSelectAreaKey?: (k: string) => void }) => {
    rightPanelHandlers.onSelectAreaKey = props.onSelectAreaKey ?? null;
    return <div data-testid="discover-right-panel-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Areas hook — Padubidri present (with the exact metadata from the issue).
const PADUBIDRI_AREA_KEY = 'IN|KA|Udupi|Padubidri';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: PADUBIDRI_AREA_KEY,
      areaLabel: 'Padubidri',
      name: 'Padubidri',
      geo_center_lat: 13.1843,
      geo_center_lon: 74.7841,
      geoCenterLat: 13.1843,
      geoCenterLon: 74.7841,
      minLat: 13.17,
      minLon: 74.77,
      maxLat: 13.2,
      maxLon: 74.8,
      bbox: [[13.17, 74.77], [13.2, 74.8]] as [[number, number], [number, number]],
      listingCount: 5,
      schoolCount: 3,
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
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1067 R2 — right-panel area card triggers flyTo', () => {
  beforeEach(() => {
    propertyMapPropsLog.panToAreas.length = 0;
    rightPanelHandlers.onSelectAreaKey = null;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('invoking onSelectAreaKey(padubidri) sets panToArea on PropertyMap', async () => {
    // Cold load: no areaKey yet — Discover renders area-groups-landing path
    // and the right panel exposes onSelectAreaKey as a callback.
    renderAt('/discover?city=udupi');

    // Wait until DiscoverRightPanel mock has captured the handler.
    await waitFor(() => {
      expect(rightPanelHandlers.onSelectAreaKey).not.toBeNull();
    });

    // PropertyMap may have null panToArea so far (no selection yet).
    const beforeLen = propertyMapPropsLog.panToAreas.length;
    expect(beforeLen).toBeGreaterThan(0);

    // Simulate user clicking the Padubidri area card.
    act(() => {
      rightPanelHandlers.onSelectAreaKey!(PADUBIDRI_AREA_KEY);
    });

    // After the click, PropertyMap re-renders with panToArea = matching AreaPoint.
    await waitFor(() => {
      const latest = propertyMapPropsLog.panToAreas.at(-1) as
        | { areaKey?: string; geo_center_lat?: number; geo_center_lon?: number }
        | null;
      expect(latest).not.toBeNull();
      expect(latest?.areaKey).toBe(PADUBIDRI_AREA_KEY);
      expect(latest?.geo_center_lat).toBeCloseTo(13.1843, 4);
      expect(latest?.geo_center_lon).toBeCloseTo(74.7841, 4);
    });
  });
});
