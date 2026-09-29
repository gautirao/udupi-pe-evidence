/**
 * Issue #1824 Slice S7 — camera panner/tick orchestration (R9), extracted into
 * useDiscoverCameraOrchestration. These are the 3 MANDATORY new JSDOM camera
 * guards flagged by the architect's [regression_test_map] as zero-coverage
 * gaps (Playwright-only today):
 *
 *   1. schoolFocusTick — fire on schoolId/radiusKm change (school-first) +
 *      NOT when journey!=='school-first' or lat/lon null.
 *   2. AC9 — schoolMarkerFocusTick FIT-ONCE (#1547, the single highest-risk
 *      regression gate: a bbox refetch must NOT re-fire the fit mid-pan).
 *   3. AC10 — macro-region scope fitBounds ONE-SHOT (currently zero guard).
 *
 * Follows the props-log mount pattern from MapDiscovery.issue1069/1815/1447
 * (PropertyMap mocked to a props-capturing stub; DiscoverRightPanel/AppLayout
 * stubbed; every data-fetching hook mocked; useDiscoverPageState,
 * useDiscoverMapData, useDiscoverJourneyTransitions, and
 * useDiscoverCameraOrchestration run FOR REAL). useDiscoverUrlState is mocked
 * directly (mirrors MapDiscovery.issue1447.test.tsx) so each test can drive
 * urlState transitions deterministically across `rerender` calls without
 * depending on MemoryRouter re-navigation (which ignores a changed
 * `initialEntries` prop on an already-mounted router).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

// ─── Hoisted handles ───────────────────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);
const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());
const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());
const mockUseSchoolRadiusListings = vi.hoisted(() => vi.fn());

const propertyMapPropsLog = vi.hoisted(() => ({
  entries: [] as Array<{
    schoolFocusTick: number;
    schoolMarkerFocusTick: number;
    panToArea: unknown;
  }>,
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: {
    schoolFocusTick?: number;
    schoolMarkerFocusTick?: number;
    panToArea?: unknown;
  }) => {
    propertyMapPropsLog.entries.push({
      schoolFocusTick: props.schoolFocusTick ?? 0,
      schoolMarkerFocusTick: props.schoolMarkerFocusTick ?? 0,
      panToArea: props.panToArea ?? null,
    });
    return <div data-testid="property-map-mock" />;
  },
  PropertyListingWithImages: vi.fn(),
}));

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: () => <div data-testid="discover-right-panel-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Issue #1953 (build step 2) — MapDiscovery is no longer a production caller
// of useDiscoverUrlState(); it consumes the DiscoverProvider facade instead,
// so this suite mocks the facade module rather than the underlying hook.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => mockUseDiscoverUrlState()[0],
  useDiscoverViewport: () => mockUseDiscoverUrlState()[0].viewport,
  useDiscoverActions: () => mockUseDiscoverUrlState()[1],
  // Issue #1953 (build step 3) — MapDiscovery now also reads useDiscoverShell
  // (mobileView only, for the RH4 bboxTimerRef clear-on-leave-MAP effect).
  // This suite doesn't exercise the mobile shell, so a static desktop/LIST
  // stub is sufficient.
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    // Issue #2729 (R1 fix) — new required shell member (see context/types.ts).
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSchoolRadiusListings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSchoolRadiusListings')>(
    '@/hooks/useSchoolRadiusListings',
  );
  return {
    ...actual,
    useSchoolRadiusListings: (...args: unknown[]) => mockUseSchoolRadiusListings(...args),
  };
});

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args),
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

const SCHOOL = {
  id: 'sch-1',
  name: 'Test School',
  latitude: 13.35,
  longitude: 74.79,
  city: 'udupi',
  areaKey: null,
  board: 'CBSE',
};

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn((schoolId?: string) => ({
    data: schoolId === SCHOOL.id ? SCHOOL : undefined,
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

// Issue #1910 (PR2 review fix, canonical region aliases) — id is a
// realistic descriptive kebab-case slug, NOT the bare direction word
// 'north': resolveScope now recognizes 'north' as a built-in alias for the
// canonical region key 'N' regardless of any namespace, so a group literally
// id'd 'north' would (correctly, per that fix) now resolve as a REGION
// scope, not a group scope — no longer isolating this fixture's actual
// intent (a "group posing as region" pattern, Udupi's simplified hierarchy
// where a single group IS the region-summary entry, matched by exact group
// id — see COASTAL_GROUP_ID in MapDiscovery.issue1808.regionGuidance.test.tsx
// for the same convention using a real, non-colliding descriptive slug).
const NORTH_GROUP = {
  id: 'north-belt',
  name: 'North Belt',
  subtitle: 'North Udupi areas',
  region_label: 'North Udupi',
  school_count: 0,
  area_keys: [MANIPAL.areaKey, KATAPADI.areaKey],
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'udupi', areas: [MANIPAL, KATAPADI] },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({
    data: { groups: [NORTH_GROUP] },
    isLoading: false,
  })),
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

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({
    data: null, isLoading: false, isError: false, refetch: vi.fn(),
  })),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null, Circle: () => null, Polygon: () => null, ZoomControl: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeDefaultActions() {
  return {
    selectArea: vi.fn(), deselectArea: vi.fn(), setSchoolParams: vi.fn(),
    setFiltersLive: vi.fn(), setFiltersCommitted: vi.fn(), setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(), clearAreaContext: vi.fn(), clearSchoolContext: vi.fn(),
    startOver: vi.fn(), setJourney: vi.fn(), selectGroup: vi.fn(), setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(), reportViewport: vi.fn(), setCity: vi.fn(), changeCity: vi.fn(),
    selectRegionalGroup: vi.fn(), setRegion: vi.fn(), setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(), clearRegionAndMaxKm: vi.fn(), setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(), enterSchoolPicking: vi.fn(), clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(), clearSchoolSelection: vi.fn(), clearAreaSelection: vi.fn(),
    setScope: vi.fn(), enterGroupResults: vi.fn(), clearGroupResults: vi.fn(),
  };
}

function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    selectedRegion: null,
    selectedMaxKm: null,
    selectedListing: null,
    selectedLocality: null,
    intent: 'buy',
    scope: null,
    ...overrides,
  } as DiscoverUrlState;
}

function renderTree() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={['/discover?city=udupi']}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rerenderTree(rerender: (ui: React.ReactElement) => void) {
  rerender(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={['/discover?city=udupi']}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Counts distinct transitions into a synthetic group/scope-bounds AreaPoint. */
function countSyntheticBoundsCalls(log: Array<{ panToArea: unknown }>): number {
  let count = 0;
  let prev: unknown;
  for (const { panToArea } of log) {
    if (panToArea !== prev) {
      const p = panToArea as { areaKey?: string } | null;
      if (p != null && p.areaKey === GROUP_BOUNDS_SYNTHETIC_KEY) count++;
      prev = panToArea;
    }
  }
  return count;
}

describe('Issue #1824 S7 — camera orchestration (schoolFocusTick, #1547 fit-once, scope one-shot)', () => {
  beforeEach(() => {
    propertyMapPropsLog.entries.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverCityListings.mockReturnValue({ data: { areas: [] }, isLoading: false });
    mockUseSchoolRadiusListings.mockReturnValue({ data: { content: [], hasMore: false }, isLoading: false });
  });

  describe('schoolFocusTick guard', () => {
    it('increments on schoolId/radiusKm change while school-first; NOT when journey!=="school-first" or lat/lon null', async () => {
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ journey: 'area-first' }),
        makeDefaultActions(),
      ]);

      const { rerender } = renderTree();

      await waitFor(() => {
        expect(propertyMapPropsLog.entries.length).toBeGreaterThan(0);
      });
      // area-first journey: selecting a school id must not move schoolFocusTick.
      expect(propertyMapPropsLog.entries.at(-1)?.schoolFocusTick).toBe(0);

      // Switch to school-first with a resolvable schoolId — SchoolResult has
      // lat/lon hydrated synchronously via the mocked useSchoolById, so the tick fires.
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ journey: 'school-first', schoolId: SCHOOL.id, radiusKm: 3 }),
        makeDefaultActions(),
      ]);
      rerenderTree(rerender);

      await waitFor(() => {
        expect(propertyMapPropsLog.entries.at(-1)?.schoolFocusTick).toBe(1);
      });

      // radiusKm change with the SAME school — fires again.
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ journey: 'school-first', schoolId: SCHOOL.id, radiusKm: 5 }),
        makeDefaultActions(),
      ]);
      rerenderTree(rerender);

      await waitFor(() => {
        expect(propertyMapPropsLog.entries.at(-1)?.schoolFocusTick).toBe(2);
      });
    });
  });

  describe('#1547 fit-once', () => {
    it('#1547 fit-once: schoolMarkerFocusTick fires exactly once when school listings first settle and does NOT re-fire on a same-key isLoadingAreaListings re-toggle', async () => {
      // (i) initial render: school-first + selected school + isLoadingAreaListings=true
      // (listingsReadyKey null) -> last schoolMarkerFocusTick prop === 0.
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ journey: 'school-first', schoolId: SCHOOL.id, radiusKm: 3 }),
        makeDefaultActions(),
      ]);
      mockUseDiscoverCityListings.mockReturnValue({ data: { areas: [] }, isLoading: true });
      mockUseSchoolRadiusListings.mockReturnValue({ data: { content: [], hasMore: false }, isLoading: true });

      const { rerender } = renderTree();

      // Wait for the school to hydrate (schoolFocusTick reaching 1 is a reliable
      // settle signal: it only fires once selectedSchool's lat/lon are populated).
      await waitFor(() => {
        expect(propertyMapPropsLog.entries.at(-1)?.schoolFocusTick).toBe(1);
      });
      expect(propertyMapPropsLog.entries.at(-1)?.schoolMarkerFocusTick).toBe(0);

      // (ii) isLoadingAreaListings=false + schoolListings.length>0 (via the anon
      // school-radius endpoint) -> listingsReadyKey becomes non-null -> tick === 1.
      mockUseDiscoverCityListings.mockReturnValue({ data: { areas: [] }, isLoading: false });
      mockUseSchoolRadiusListings.mockReturnValue({
        data: { content: [{ id: 'sr-1', latitude: 13.35, longitude: 74.79 }], hasMore: false },
        isLoading: false,
      });
      rerenderTree(rerender);

      await waitFor(() => {
        expect(propertyMapPropsLog.entries.at(-1)?.schoolMarkerFocusTick).toBe(1);
      });

      // (iii) toggle isLoadingAreaListings true -> false again with the SAME
      // schoolId+radiusKm (SAME key) -> tick STILL === 1 (no re-increment — the
      // anti-snap-back gate).
      mockUseDiscoverCityListings.mockReturnValue({ data: { areas: [] }, isLoading: true });
      rerenderTree(rerender);
      await waitFor(() => {
        expect(propertyMapPropsLog.entries.length).toBeGreaterThan(0);
      });

      mockUseDiscoverCityListings.mockReturnValue({ data: { areas: [] }, isLoading: false });
      rerenderTree(rerender);
      await waitFor(() => {
        // Give the effect a chance to run; assert it settles at 1, not 2.
        expect(propertyMapPropsLog.entries.at(-1)?.schoolMarkerFocusTick).toBe(1);
      });

      // (iv) CONTROL: change radiusKm (or schoolId) so listingsReadyKey becomes a
      // DIFFERENT key -> a genuinely new key DOES re-fit -> tick === 2.
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ journey: 'school-first', schoolId: SCHOOL.id, radiusKm: 5 }),
        makeDefaultActions(),
      ]);
      rerenderTree(rerender);

      await waitFor(() => {
        expect(propertyMapPropsLog.entries.at(-1)?.schoolMarkerFocusTick).toBe(2);
      });
    });
  });

  describe('scope fit one-shot', () => {
    it('scope fit one-shot: macro-region scope sets panToArea once, does NOT re-fire on background refetch, and yields to groupId/areaKey', async () => {
      // (i) scope='north-belt' (NORTH_GROUP's own id — the "group posing as
      // region" pattern), groupId/areaKey null, areas+groups loaded ->
      // setPanToArea called exactly ONCE with the macro-region synthetic bounds.
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ scope: 'north-belt' }),
        makeDefaultActions(),
      ]);

      const { rerender } = renderTree();

      await waitFor(() => {
        expect(countSyntheticBoundsCalls(propertyMapPropsLog.entries)).toBe(1);
      });

      // (ii) BACKGROUND REFETCH: rerender with a NEW discoverAreas array identity,
      // same scope -> call count STILL 1 (no re-fire — the prevScopeRef one-shot holds).
      rerenderTree(rerender);
      await waitFor(() => {
        expect(propertyMapPropsLog.entries.length).toBeGreaterThan(0);
      });
      expect(countSyntheticBoundsCalls(propertyMapPropsLog.entries)).toBe(1);

      // (iii) YIELD: rerender with groupId set (an unresolvable groupId, so the
      // group-fit effect itself computes no bounds and adds no calls of its own —
      // isolating the assertion to the scope-fit's own yield/one-shot behaviour).
      mockUseDiscoverUrlState.mockReturnValue([
        makeUrlState({ scope: 'north-belt', groupId: 'unresolvable-group' }),
        makeDefaultActions(),
      ]);
      rerenderTree(rerender);
      await waitFor(() => {
        expect(propertyMapPropsLog.entries.length).toBeGreaterThan(0);
      });
      expect(countSyntheticBoundsCalls(propertyMapPropsLog.entries)).toBe(1);
    });
  });
});
