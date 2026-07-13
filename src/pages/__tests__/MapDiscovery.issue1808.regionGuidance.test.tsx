/**
 * Issue #1808 — region-selection guidance, end-to-end through the real
 * MapDiscovery + DiscoverRightPanel + GuidedEntryPanel wiring (only
 * PropertyMap/leaflet and data-fetching hooks are mocked; the real
 * useDiscoverUrlState hook drives the URL, exactly like the sibling
 * MapDiscovery.issue1745-batchB-overviewClick.test.tsx harness this file
 * extends).
 *
 * Covers:
 *  - region-overview predicate: card/legend appear only at scope set +
 *    journey null + no groupId/areaKey/schoolId; negative at scope=null and
 *    at journey=area-first (narrower/different state).
 *  - deep-link (?scope=coastal-homes) → card + legend visible, ring/helper
 *    NOT applied (no motion on load) — single-group region → "areas" copy.
 *  - map bubble click (scope=null → 'north') → arms the pulse: card + legend
 *    + panel ring/helper appear — multi-group region → "zones" copy.
 *  - dismiss clears card + legend + ring/helper together (AC6); ephemeral
 *    only (no localStorage writes).
 *  - choosing a journey clears all guidance (AC6/AC11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const propertyMapProps = vi.hoisted(() => ({
  current: null as { areas: AreaPoint[]; onAreaClick?: (area: AreaPoint) => void } | null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { areas?: AreaPoint[]; onAreaClick?: (area: AreaPoint) => void }) => {
    propertyMapProps.current = { areas: props.areas ?? [], onAreaClick: props.onAreaClick };
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────
// Single-group region (Coastal Homes) — direct-group-match branch of
// overviewAreas returns member AREA pins (no isGroup) → "areas" copy variant.
const COASTAL_GROUP_ID = 'coastal-homes';
const COASTAL_AREA_A = 'IN|KA|Udupi|Malpe';
const COASTAL_AREA_B = 'IN|KA|Udupi|Ullal';
const COASTAL_GROUP = {
  id: COASTAL_GROUP_ID,
  name: 'Coastal Homes',
  subtitle: null,
  region_label: null,
  school_count: 0,
  area_keys: [COASTAL_AREA_A, COASTAL_AREA_B],
  focus_lat: 13.35,
  focus_lon: 74.75,
};

// Multi-group region (North Udupi, two zones) — group-mapping branch of
// overviewAreas returns isGroup:true bubbles → "zones" copy variant.
const NORTH_AREA_A = 'IN|KA|Udupi|Kalyanpur';
const NORTH_AREA_B = 'IN|KA|Udupi|Kaup';
const NORTH_ZONE_A = {
  id: 'north-zone-a',
  name: 'North Zone A',
  subtitle: null,
  region_label: 'North Udupi',
  school_count: 0,
  area_keys: [NORTH_AREA_A],
  focus_lat: 13.42,
  focus_lon: 74.75,
};
const NORTH_ZONE_B = {
  id: 'north-zone-b',
  name: 'North Zone B',
  subtitle: null,
  region_label: 'North Udupi',
  school_count: 0,
  area_keys: [NORTH_AREA_B],
  focus_lat: 13.45,
  focus_lon: 74.76,
};

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: COASTAL_AREA_A, areaLabel: 'Malpe', name: 'Malpe',
      geo_center_lat: 13.354, geo_center_lon: 74.708,
      geoCenterLat: 13.354, geoCenterLon: 74.708,
      minLat: 13.34, minLon: 74.69, maxLat: 13.37, maxLon: 74.72,
      bbox: [[13.34, 74.69], [13.37, 74.72]] as [[number, number], [number, number]],
      listingCount: 4, schoolCount: 4, trendDirection: 'stable' as const,
    },
    {
      areaKey: COASTAL_AREA_B, areaLabel: 'Ullal', name: 'Ullal',
      geo_center_lat: 13.36, geo_center_lon: 74.71,
      geoCenterLat: 13.36, geoCenterLon: 74.71,
      minLat: 13.35, minLon: 74.7, maxLat: 13.37, maxLon: 74.72,
      bbox: [[13.35, 74.7], [13.37, 74.72]] as [[number, number], [number, number]],
      listingCount: 2, schoolCount: 1, trendDirection: 'stable' as const,
    },
    {
      areaKey: NORTH_AREA_A, areaLabel: 'Kalyanpur', name: 'Kalyanpur',
      geo_center_lat: 13.42, geo_center_lon: 74.75,
      geoCenterLat: 13.42, geoCenterLon: 74.75,
      minLat: 13.41, minLon: 74.74, maxLat: 13.43, maxLon: 74.76,
      bbox: [[13.41, 74.74], [13.43, 74.76]] as [[number, number], [number, number]],
      listingCount: 3, schoolCount: 1, trendDirection: 'stable' as const,
    },
    {
      areaKey: NORTH_AREA_B, areaLabel: 'Kaup', name: 'Kaup',
      geo_center_lat: 13.45, geo_center_lon: 74.76,
      geoCenterLat: 13.45, geoCenterLon: 74.76,
      minLat: 13.44, minLon: 74.75, maxLat: 13.46, maxLon: 74.77,
      bbox: [[13.44, 74.75], [13.46, 74.77]] as [[number, number], [number, number]],
      listingCount: 5, schoolCount: 2, trendDirection: 'stable' as const,
    },
  ],
};

const SUMMARY_RESPONSE = {
  city: 'udupi',
  propertyType: null,
  groupBy: 'area_group',
  totalActiveListings: 14,
  regions: [
    { regionKey: COASTAL_GROUP_ID, regionLabel: 'Coastal Homes', listingCount: 6 },
    { regionKey: 'north', regionLabel: 'North Udupi', listingCount: 8 },
  ],
  hotspots: [],
  generatedAt: new Date().toISOString(),
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: AREAS_RESPONSE, isLoading: false })),
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false, error: null })),
}));
vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
}));
vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({ data: SUMMARY_RESPONSE, isLoading: false, isError: false })),
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

const mockUseAreaGroups = vi.hoisted(() =>
  vi.fn(() => ({ data: { groups: [COASTAL_GROUP, NORTH_ZONE_A, NORTH_ZONE_B] }, isLoading: false })),
);
vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: (...args: Parameters<typeof mockUseAreaGroups>) => mockUseAreaGroups(...args),
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

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname + loc.search}</div>;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1808 — region-selection guidance', () => {
  beforeEach(() => {
    propertyMapProps.current = null;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    localStorage.clear();
  });

  it('predicate negative: no card/legend/ring at city landing (scope=null)', async () => {
    renderAt('/discover?city=udupi');
    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    expect(screen.queryByTestId('region-guidance-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-overview-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-guide-helper')).not.toBeInTheDocument();
  });

  it('predicate negative: no card/legend at journey=area-first (narrower/different state than region-overview)', async () => {
    renderAt(`/discover?city=udupi&journey=area-first&scope=${COASTAL_GROUP_ID}`);
    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    expect(screen.queryByTestId('region-guidance-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-overview-legend')).not.toBeInTheDocument();
  });

  it('predicate negative: no card/legend/helper/ring when scope is set AND groupId is also set (journey still null)', async () => {
    renderAt(`/discover?city=udupi&scope=north&groupId=${NORTH_ZONE_A.id}`);
    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    expect(screen.queryByTestId('region-guidance-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-overview-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-guide-helper')).not.toBeInTheDocument();
    const journeySection = screen.queryByTestId('journey-switcher-section');
    if (journeySection) {
      expect(journeySection).not.toHaveClass('dp-attn-on');
      expect(journeySection).not.toHaveClass('dp-attn-static');
    }
  });

  it('deep-link (?scope=coastal-homes, single-group) → card + legend render "areas" copy; ring/helper NOT applied (no motion on load)', async () => {
    renderAt(`/discover?city=udupi&scope=${COASTAL_GROUP_ID}`);

    await waitFor(() => {
      expect(screen.getByTestId('region-guidance-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Showing the areas of Coastal Homes.')).toBeInTheDocument();
    expect(screen.getByTestId('region-overview-legend')).toHaveTextContent('Areas in this region');
    // Ring/helper never fire on deep-link.
    expect(screen.queryByTestId('region-guide-helper')).not.toBeInTheDocument();
    const journeySection = screen.getByTestId('journey-switcher-section');
    expect(journeySection).not.toHaveClass('dp-attn-on');
    expect(journeySection).not.toHaveClass('dp-attn-static');
  });

  it('map bubble click (multi-group "north") arms the pulse: card + legend + panel ring/helper show "zones" copy', async () => {
    renderAt('/discover?city=udupi');

    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    const bubbles = propertyMapProps.current!.areas;
    const northBubble = bubbles.find((a) => a.areaKey === 'north');
    expect(northBubble, 'north macro-region bubble should be present').toBeTruthy();

    act(() => {
      propertyMapProps.current!.onAreaClick!(northBubble!);
    });

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe).toHaveTextContent('scope=north');
    });

    await waitFor(() => {
      expect(screen.getByTestId('region-guidance-card')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Showing the zones of North Udupi — pick one to see its areas.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('region-overview-legend')).toHaveTextContent('Zones in this region');
    expect(screen.getByTestId('region-guide-helper')).toHaveTextContent(
      "North Udupi selected. The map shows this region's zones",
    );
    expect(screen.getByTestId('journey-switcher-section')).toHaveClass('dp-attn-on');

    // No new journey-choice row was introduced (decision q2).
    expect(screen.queryByTestId('journey-choice-row')).not.toBeInTheDocument();
  });

  it('dismiss clears card + legend + ring/helper together; writes nothing to localStorage', async () => {
    renderAt('/discover?city=udupi');
    await waitFor(() => expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function'));
    const northBubble = propertyMapProps.current!.areas.find((a) => a.areaKey === 'north')!;
    act(() => {
      propertyMapProps.current!.onAreaClick!(northBubble);
    });
    await waitFor(() => expect(screen.getByTestId('region-guidance-card')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dismiss region guidance' }));

    await waitFor(() => {
      expect(screen.queryByTestId('region-guidance-card')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('region-overview-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-guide-helper')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('choosing a journey clears the guidance (AC6/AC11)', async () => {
    renderAt('/discover?city=udupi');
    await waitFor(() => expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function'));
    const northBubble = propertyMapProps.current!.areas.find((a) => a.areaKey === 'north')!;
    act(() => {
      propertyMapProps.current!.onAreaClick!(northBubble);
    });
    await waitFor(() => expect(screen.getByTestId('region-guidance-card')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByTestId('journey-card-area-first'));

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe).toHaveTextContent('journey=area-first');
    });
    expect(screen.queryByTestId('region-guidance-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-overview-legend')).not.toBeInTheDocument();
  });
});
