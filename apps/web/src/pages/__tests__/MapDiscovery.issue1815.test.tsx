/**
 * Issue #1815 (live-e2e follow-up) — group-focus fitBounds must not silently
 * skip forever when `discoverAreas` resolves BEFORE `areaGroupsData`.
 *
 * Root cause: the group-bounds fitBounds effect in MapDiscovery.tsx advanced
 * its one-shot `prevGroupIdRef`/`prevAreaKeyRef` "group changed" transition
 * signal as soon as `areasLoading` was false — even if `areaGroupsData`
 * (needed for `focusedGroup.area_keys`, hence `memberAreas`/`bounds`) was
 * STILL loading. If discoverAreas won that race, the effect would compute an
 * empty `groupAreaKeys` => null `bounds` => never call `setPanToArea`, but
 * had already burned the transition signal — so when areaGroupsData resolved
 * moments later, the effect no longer fired, and the group-framing camera
 * fit silently never happened for that page load. This left AreaMarkerLayer
 * bucketing against the pre-fit (wrong, far-too-zoomed-out) camera state,
 * which is exactly what produced the observed bimodal live-e2e pill count
 * (correctly-framed ~4 representatives vs incorrectly-stuck ~1).
 *
 * Fix: also gate on `isLoadingAreaGroups` (the flag the sibling scope-fit
 * effect at ~L2234 already uses) before EITHER checking transitions or
 * advancing the refs, so the one-shot signal is only consumed once both
 * independent async fetches have actually resolved.
 *
 * These tests reuse MapDiscovery.issue1069.test.tsx's harness/fixtures but
 * make useDiscoverAreas/useAreaGroups STATEFUL mocks so the relative
 * resolution order (and a genuinely-empty group) can be controlled directly,
 * which the static mocks in the 1069 file cannot express.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';

// ─── Hoisted handles ───────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const propertyMapPropsLog = vi.hoisted(() => ({
  panToAreas: [] as Array<unknown>,
}));

// Stateful — each test controls these directly to simulate the two
// independent async fetches resolving in either order.
const mockUseDiscoverAreas = vi.hoisted(() => vi.fn());
const mockUseAreaGroups = vi.hoisted(() => vi.fn());

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
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

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Fixture areas — mirrors MapDiscovery.issue1069.test.tsx's University Belt pair.
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
  useDiscoverAreas: (...args: unknown[]) => mockUseDiscoverAreas(...args),
}));
vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: (...args: unknown[]) => mockUseAreaGroups(...args),
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
          <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

function isSyntheticGroupBounds(panToArea: unknown): boolean {
  const p = panToArea as { areaKey?: string } | null;
  return !!p && p.areaKey === GROUP_BOUNDS_SYNTHETIC_KEY;
}

const UNIVERSITY_BELT_GROUP = {
  id: 'university-belt',
  name: 'University Belt',
  subtitle: 'Academic and student housing',
  region_label: 'Central Udupi',
  school_count: 0,
  area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Katapadi'],
};

const EMPTY_GROUP = {
  id: 'empty-group',
  name: 'Empty Group',
  subtitle: 'No members',
  region_label: 'Central Udupi',
  school_count: 0,
  area_keys: [] as string[],
};

describe('Issue #1815 — group-bounds fitBounds race (areasLoading resolves before areaGroupsData)', () => {
  beforeEach(() => {
    propertyMapPropsLog.panToAreas.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverAreas.mockReset();
    mockUseAreaGroups.mockReset();
  });

  it('setPanToArea is eventually called with the synthetic group bounds once BOTH discoverAreas and areaGroupsData resolve, even when discoverAreas resolves first', async () => {
    // discoverAreas resolves immediately (isLoading: false from the start).
    mockUseDiscoverAreas.mockReturnValue({
      data: { city: 'udupi', areas: [MANIPAL, KATAPADI] },
      isLoading: false,
    });
    // areaGroupsData is STILL LOADING on first render — the exact race that
    // previously burned the one-shot transition signal.
    mockUseAreaGroups.mockReturnValue({ data: undefined, isLoading: true });

    const { rerender } = renderAt('/discover?city=udupi&groupId=university-belt');

    // While areaGroupsData is still loading, the fitBounds effect must NOT
    // have fired yet (the guard correctly held it back) — no synthetic
    // group-bounds panToArea should appear.
    await waitFor(() => {
      expect(propertyMapPropsLog.panToAreas.length).toBeGreaterThan(0);
    });
    expect(propertyMapPropsLog.panToAreas.some(isSyntheticGroupBounds)).toBe(false);

    // areaGroupsData now resolves (simulating it arriving after discoverAreas).
    mockUseAreaGroups.mockReturnValue({
      data: { groups: [UNIVERSITY_BELT_GROUP] },
      isLoading: false,
    });
    rerender(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={['/discover?city=udupi&groupId=university-belt']}>
          <Routes>
            <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The fitBounds effect must now fire — this is the regression assertion:
    // pre-fix, this would never become true because the transition signal
    // was already consumed on the first (areaGroupsData-still-loading) pass.
    await waitFor(() => {
      expect(propertyMapPropsLog.panToAreas.some(isSyntheticGroupBounds)).toBe(true);
    });
  });

  it('a genuinely zero-member group does not wedge — the component settles cleanly with panToArea never set, no hang', async () => {
    mockUseDiscoverAreas.mockReturnValue({
      data: { city: 'udupi', areas: [MANIPAL, KATAPADI] },
      isLoading: false,
    });
    mockUseAreaGroups.mockReturnValue({
      data: { groups: [EMPTY_GROUP] },
      isLoading: false,
    });

    renderAt('/discover?city=udupi&groupId=empty-group');

    // The page must render and settle (property-map-mock present) without
    // hanging — this is the black-box proof that the effect did not wedge
    // (spin forever re-evaluating) on a group with zero resolvable members.
    await waitFor(() => {
      expect(propertyMapPropsLog.panToAreas.length).toBeGreaterThan(0);
    });
    // bounds is null for a zero-member group — setPanToArea must never have
    // been called with a synthetic group-bounds AreaPoint.
    expect(propertyMapPropsLog.panToAreas.some(isSyntheticGroupBounds)).toBe(false);
  });
});
