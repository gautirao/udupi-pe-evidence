/**
 * Issue #2450 — SITES 5 AND 6 of four: both of `useDiscoverMapData`'s own city-listings
 * queries must forward the AREA (SQ FT) bound.
 *
 * WHY THESE TWO ARE NOT A PANEL TEST. Sites 3 and 4 live in components and are asserted by
 * rendering them. These two live in a hook, and mounting a panel WITH `mapAreaListings` does
 * not exercise them at all — it only proves the panel's own query went idle. So they are
 * asserted here, at the hook.
 *
 * WHY SITE 5 IS LOAD-BEARING RATHER THAN A SECOND COPY. Site 5 is the query that is LIVE
 * whenever the map supplies `mapAreaListings` to the AREA-leaf surface: in that state site 3
 * is disabled by its empty `areaKeys` (pinned in
 * `DiscoverAreasJourneyPanel.areaBounds2450.test.tsx`). The two are mutually exclusive, and
 * the live capture that reported this defect cannot say which of them produced the request
 * it recorded. Fixing only site 3 could therefore have left the measured path untouched.
 *
 * WHY SITE 6 IS UNUSUALLY WELL COVERED. It is the anon "Search this area" bbox-only set,
 * which lands on the backend's SECOND assembly, `getBboxOnlyListings` — a WHERE clause built
 * independently of the area-grouped path. The backend IT arm `bboxOnlyPath_appliesAreaBoundsToo`
 * asserts that assembly narrows; this arm asserts the client actually asks it to. The two
 * approach the same path from opposite ends.
 *
 * THESE SITES TAKE DERIVED LOCALS, NOT `filters` DIRECTLY. The hook feeds both queries from
 * `discover*` locals (`discoverMinPrice`, `discoverBedrooms`, …), so the fix is a matching
 * `discoverAreaMinSqft`/`discoverAreaMaxSqft` derivation rather than two added keys — and
 * these arms assert the value survives that derivation, not merely that a key exists.
 *
 * IDENTIFICATION BY SHAPE, NOT CALL ORDER. With the query hook mocked, both call sites run on
 * every render regardless of their `enabled` gates. Each arm therefore picks its target by a
 * distinguishing property (site 6 passes a `bbox` key and hard-codes `isAuthenticated: false`),
 * so a reordering of the hook body cannot silently repoint an assertion at the wrong site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────

const mockDiscoverAreasGet = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockCityListings = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockDiscoverAreasGet },
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: mockDiscoverListings,
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: mockTrendsOptions,
}));

vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: mockSchoolRadiusListings,
  mapSchoolRadiusCard: vi.fn((x: unknown) => x),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: mockSchoolById,
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: mockCityListings,
}));

// Import hook AFTER mocks
import { useDiscoverMapData } from '../useDiscoverMapData';

// ─── Helpers ──────────────────────────────────────────────────

type CityListingsArgs = Record<string, unknown>;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.35,
      geoCenterLon: 74.79,
      listingCount: 42,
      schoolCount: 3,
    },
  ],
};

const SELECTED_AREA = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.79,
  bbox: null as null,
  listingCount: 42,
  schoolCount: 3,
};

const BASE_PARAMS = {
  city: 'udupi',
  selectedArea: SELECTED_AREA,
  filters: {} as Record<string, unknown>,
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: false,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
};

function renderMapData(filters: Record<string, unknown>) {
  return renderHook(() => useDiscoverMapData({ ...BASE_PARAMS, filters } as never), {
    wrapper: makeWrapper(),
  });
}

/** Every argument object handed to a city-listings query during the render. */
function allCityListingsArgs(): CityListingsArgs[] {
  const calls = mockCityListings.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls.map((c) => c[0] as CityListingsArgs);
}

/** Site 5 — the area-click card list: keyed by areaKeys, and it passes no `bbox`. */
function site5Args(): CityListingsArgs {
  const match = allCityListingsArgs().filter((a) => !('bbox' in a));
  expect(match.length).toBeGreaterThan(0);
  return match[match.length - 1];
}

/** Site 6 — the anon VIEWPORT set: the only one carrying a `bbox` key. */
function site6Args(): CityListingsArgs {
  const match = allCityListingsArgs().filter((a) => 'bbox' in a);
  expect(match.length).toBeGreaterThan(0);
  return match[match.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null });
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockCityListings.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockDiscoverAreasGet.mockResolvedValue(AREAS_RESPONSE);
});

describe('#2450 site 5 — the map area-listings query forwards the area (sq ft) bound', () => {
  it('forwards a lower bound', () => {
    renderMapData({ areaMinSqft: 1000 });
    expect(site5Args().areaMinSqft).toBe(1000);
  });

  it('forwards an upper bound', () => {
    renderMapData({ areaMaxSqft: 2000 });
    expect(site5Args().areaMaxSqft).toBe(2000);
  });

  it('forwards both ends, with min and max distinguishable', () => {
    renderMapData({ areaMinSqft: 800, areaMaxSqft: 1600 });
    expect(site5Args().areaMinSqft).toBe(800);
    expect(site5Args().areaMaxSqft).toBe(1600);
  });

  /** FALSIFIABILITY CONTROL — identical call shape, varying only the bound. */
  it('omits the axis entirely when no bound is selected', () => {
    renderMapData({});
    expect(site5Args().areaMinSqft).toBeUndefined();
    expect(site5Args().areaMaxSqft).toBeUndefined();
  });

  it('forwards a zero lower bound rather than treating 0 as absent', () => {
    renderMapData({ areaMinSqft: 0 });
    expect(site5Args().areaMinSqft).toBe(0);
  });

  /**
   * The agri journey deliberately does NOT suppress this axis, unlike `commercialSubtypes`.
   * That subtype is forced off because it would AND against the pinned `agricultural_land`
   * family and empty the set; an area bound has no family to conflict with, since #2459
   * resolves the column per row and agricultural_land resolves to PLOT.
   *
   * The effect is STRUCTURAL rather than observable on agricultural inventory: both
   * city-listings assemblies exclude agricultural_land unconditionally
   * (AREA_FIRST_EXCLUDED_PROPERTY_TYPE), so neither query can return an agri row at all. The
   * asymmetry is kept because the REASONS differ — the subtype is unsatisfiable by
   * construction against a pinned family, whereas an area bound is satisfiable for every
   * shape these queries CAN return. An isAgriJourney branch would encode a false equivalence.
   */
  it('still forwards the bound in the agri-first journey (the asymmetry is principled, not an oversight)', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          filters: { areaMinSqft: 1000 },
          journey: 'agri-first',
        } as never),
      { wrapper: makeWrapper() },
    );
    expect(site5Args().areaMinSqft).toBe(1000);
  });
});

describe('#2450 site 6 — the anon viewport (bbox-only) query forwards the area (sq ft) bound', () => {
  it('forwards a lower bound', () => {
    renderMapData({ areaMinSqft: 1000 });
    expect(site6Args().areaMinSqft).toBe(1000);
  });

  it('forwards both ends, with min and max distinguishable', () => {
    renderMapData({ areaMinSqft: 800, areaMaxSqft: 1600 });
    expect(site6Args().areaMinSqft).toBe(800);
    expect(site6Args().areaMaxSqft).toBe(1600);
  });

  /** FALSIFIABILITY CONTROL. */
  it('omits the axis entirely when no bound is selected', () => {
    renderMapData({});
    expect(site6Args().areaMinSqft).toBeUndefined();
    expect(site6Args().areaMaxSqft).toBeUndefined();
  });

  it('forwards a zero lower bound rather than treating 0 as absent', () => {
    renderMapData({ areaMinSqft: 0 });
    expect(site6Args().areaMinSqft).toBe(0);
  });
});
