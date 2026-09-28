/**
 * AC11 — Real-path integration test for agri count wiring
 *
 * Regression guard for the false-green: previously unit tests hand-passed agriAreasData
 * as a prop, so the wire MapDiscovery → useDiscoverMapData → DiscoverRightPanel was never
 * exercised. This test renders a wrapper that calls useDiscoverMapData and forwards ALL
 * its outputs to DiscoverRightPanel — agriAreasData is NOT hand-passed; it flows through
 * the hook chain exactly as it does in production.
 *
 * Assertions:
 *   (1) Rendered agri count == agriAreasData[areaKey].listingCount (authoritative backend value)
 *   (2) When areaListings.length DIFFERS from the authoritative count (2 loaded, 15 total),
 *       the rendered count is 15, NOT 2.
 *   (3) agriAcreage renders when non-null; is absent when null.
 *   (4) Zero-agri area shows the empty state (not a count or listing cards).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// Mock api.get at the network layer so useDiscoverAreas (called inside
// useDiscoverMapData) resolves to the right fixture based on the URL.
// This is the key difference from the existing unit tests — no hand-passing of
// agriAreasData as a prop.
const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class extends Error {},
}));

// Stub the sub-hooks that useDiscoverMapData calls (not under test here).
const mockUseDiscoverListings = vi.hoisted(() => vi.fn());
const mockUseDiscoverFilteredMarkers = vi.hoisted(() => vi.fn());
const mockUseTrendsOptions = vi.hoisted(() => vi.fn());
const mockUseSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockUseSchoolById = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: mockUseDiscoverListings,
}));
vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockUseDiscoverFilteredMarkers,
}));
vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: mockUseTrendsOptions,
}));
vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: mockUseSchoolRadiusListings,
  mapSchoolRadiusCard: vi.fn((x: unknown) => x),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: mockUseSchoolById,
}));

// react-router-dom: keep real MemoryRouter, stub useNavigate only.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AREA_KEY = 'IN|KA|Udupi|Manipal';

const BLENDED_AREAS_RESPONSE = {
  city: 'udupi',
  areas: [{
    areaKey: AREA_KEY,
    name: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 42,   // blended — must NOT appear in agri-selected count display
    schoolCount: 3,
  }],
};

// Authoritative agri response: listingCount=15, agriAcreage=8.3
// areaListings in tests will have only 2 items (simulating limitPerArea cap) to
// prove the count shown is 15 (hook result) and NOT 2 (areaListings.length).
const AGRI_AREAS_RESPONSE_WITH_ACREAGE = {
  city: 'udupi',
  areas: [{
    areaKey: AREA_KEY,
    name: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 15,   // authoritative agri count
    schoolCount: 3,
    agriAcreage: 8.3,
  }],
};

const AGRI_AREAS_RESPONSE_NO_ACREAGE = {
  city: 'udupi',
  areas: [{
    areaKey: AREA_KEY,
    name: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 15,
    schoolCount: 3,
    // agriAcreage intentionally absent
  }],
};

const AGRI_AREAS_RESPONSE_ZERO = {
  city: 'udupi',
  areas: [{
    areaKey: AREA_KEY,
    name: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 0,
    schoolCount: 3,
  }],
};

// City listings: only 2 loaded items (capped by limitPerArea) — distinct from backend total
const CITY_LISTINGS_RESPONSE_TWO_ITEMS = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [{
    areaKey: AREA_KEY,
    areaName: 'Manipal',
    listings: [
      { id: 'l1', propertyType: 'agricultural_land', locality: 'Manipal' },
      { id: 'l2', propertyType: 'agricultural_land', locality: 'Manipal' },
    ] as DiscoverCityListingItem[],
  }],
};

const CITY_LISTINGS_RESPONSE_ZERO = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [{ areaKey: AREA_KEY, areaName: 'Manipal', listings: [] }],
};

const SELECTED_AREA: AreaPoint = {
  areaKey: AREA_KEY,
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.79,
  bbox: null,
  listingCount: 42,
  schoolCount: 3,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function setupSubHookMocks() {
  mockUseDiscoverListings.mockReturnValue({
    data: undefined, isLoading: false, isFetching: false, error: null,
  });
  mockUseDiscoverFilteredMarkers.mockReturnValue({
    data: undefined, isLoading: false, isFetching: false,
  });
  mockUseTrendsOptions.mockReturnValue({ data: undefined });
  mockUseSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockUseSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
}

/**
 * AC11IntegrationWrapper — the real-path harness.
 *
 * Calls useDiscoverMapData (real implementation) and passes ALL its outputs
 * directly to DiscoverRightPanel. agriAreasData is NOT injected as a prop —
 * it flows from the hook's agri-scoped useDiscoverAreas call, which resolves
 * via the mocked api.get at the network layer.
 */
function AC11IntegrationWrapper({
  cityListingsResponse,
}: {
  cityListingsResponse: typeof CITY_LISTINGS_RESPONSE_TWO_ITEMS | typeof CITY_LISTINGS_RESPONSE_ZERO;
}) {
  // api.get routes by URL: agri-scoped if propertyType in URL, else blended or city-listings
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/listings')) {
      return Promise.resolve(cityListingsResponse);
    }
    if (url.includes('propertyType=agricultural_land')) {
      // agri-scoped areas call — resolved based on outer scope (test sets it)
      return (AC11IntegrationWrapper as typeof AC11IntegrationWrapper & { _agriResponse?: unknown })._agriResponse
        ? Promise.resolve((AC11IntegrationWrapper as typeof AC11IntegrationWrapper & { _agriResponse?: unknown })._agriResponse)
        : Promise.resolve(AGRI_AREAS_RESPONSE_WITH_ACREAGE);
    }
    return Promise.resolve(BLENDED_AREAS_RESPONSE);
  });

  const mapData = useDiscoverMapData({
    city: 'udupi',
    selectedArea: SELECTED_AREA,
    filters: {},
    debouncedSearch: '',
    urlSchoolId: null,
    isAuthenticated: false,
    fitTick: 0,
    markersEnabled: false,
    page: 0,
    bbox: null,
    journey: 'agri-first',
  });

  return (
    <DiscoverRightPanel
      panelContent="agri-selected"
      city="udupi"
      areas={mapData.discoverAreas}
      selectedArea={SELECTED_AREA}
      areaListings={mapData.areaListings}
      isLoadingListings={mapData.isLoadingAreaListings}
      isLoadingAreas={mapData.areasLoading}
      // agriAreasData and isLoadingAgriAreas flow from the hook — NOT hand-passed
      agriAreasData={mapData.agriAreasData}
      isLoadingAgriAreas={mapData.isLoadingAgriAreas}
      onStartOver={vi.fn()}
      onSelectJourney={vi.fn()}
      journey="agri-first"
    />
  );
}

function renderAC11(
  agriResponse: typeof AGRI_AREAS_RESPONSE_WITH_ACREAGE,
  cityListingsResponse = CITY_LISTINGS_RESPONSE_TWO_ITEMS,
) {
  (AC11IntegrationWrapper as typeof AC11IntegrationWrapper & { _agriResponse?: unknown })._agriResponse = agriResponse;
  const qc = makeQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AC11IntegrationWrapper cityListingsResponse={cityListingsResponse} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupSubHookMocks();
});

describe('AC11 — agri count/acreage wiring: useDiscoverMapData → DiscoverRightPanel (real path)', () => {
  it(
    'AC11(1+2): renders authoritative agri count (15) from hook, NOT areaListings.length (2)',
    async () => {
      // areaListings has 2 items (limitPerArea cap); agriAreasData[areaKey].listingCount = 15
      // The rendered count MUST be 15 — proving agriAreaSummary.listingCount wins.
      renderAC11(AGRI_AREAS_RESPONSE_WITH_ACREAGE, CITY_LISTINGS_RESPONSE_TWO_ITEMS);

      await waitFor(() =>
        expect(screen.queryByTestId('agri-count-loading')).not.toBeInTheDocument(),
      );

      const countEl = screen.getByTestId('agri-count');
      expect(countEl).toHaveTextContent('15 agricultural listings');
      // Explicit guard: must NOT show 2 (areaListings.length)
      expect(countEl.textContent).not.toMatch(/\b2\b/);
    },
  );

  it('AC11(3a): renders agriAcreage when non-null in agri areas response', async () => {
    renderAC11(AGRI_AREAS_RESPONSE_WITH_ACREAGE, CITY_LISTINGS_RESPONSE_TWO_ITEMS);

    await waitFor(() =>
      expect(screen.queryByTestId('agri-count-loading')).not.toBeInTheDocument(),
    );

    expect(screen.getByTestId('agri-acreage')).toHaveTextContent('8.3 acres');
  });

  it('AC11(3b): agriAcreage element absent when agriAcreage is null/absent in response', async () => {
    renderAC11(AGRI_AREAS_RESPONSE_NO_ACREAGE, CITY_LISTINGS_RESPONSE_TWO_ITEMS);

    await waitFor(() =>
      expect(screen.queryByTestId('agri-count-loading')).not.toBeInTheDocument(),
    );

    expect(screen.queryByTestId('agri-acreage')).not.toBeInTheDocument();
  });

  it('AC11(4): zero-agri area (listingCount=0, no listings) shows empty state, not count', async () => {
    renderAC11(AGRI_AREAS_RESPONSE_ZERO, CITY_LISTINGS_RESPONSE_ZERO);

    await waitFor(() =>
      expect(screen.queryByTestId('agri-count-loading')).not.toBeInTheDocument(),
    );

    // Empty state must be shown
    expect(screen.getByTestId('agri-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No agricultural listings in this area yet')).toBeInTheDocument();
    // Count element shows 0 listings (agriAreaSummary.listingCount = 0)
    expect(screen.getByTestId('agri-count')).toHaveTextContent('0 agricultural listings');
    // No listing cards
    expect(screen.queryByTestId('agri-listing-card')).not.toBeInTheDocument();
  });

  it(
    'AC11(5): agriCount>0 (listingCount=15) + areaListings EMPTY → empty state NOT shown, count strip shows 15',
    async () => {
      // This is the Phase 7A regression guard:
      // Before the fix, the empty-state guard was `areaListings.length === 0`,
      // which fired even when agriCount > 0 (backend count > fetch-loaded count).
      // After the fix, the guard is `agriCount === 0`, so a non-zero backend count
      // SUPPRESSES the empty state even when no listing cards have loaded yet.
      renderAC11(AGRI_AREAS_RESPONSE_WITH_ACREAGE, CITY_LISTINGS_RESPONSE_ZERO);

      await waitFor(() =>
        expect(screen.queryByTestId('agri-count-loading')).not.toBeInTheDocument(),
      );

      // Empty state must NOT appear — backend says 15 listings exist
      expect(screen.queryByTestId('agri-empty-state')).not.toBeInTheDocument();
      // Count strip must show the authoritative backend count (15), not 0
      expect(screen.getByTestId('agri-count')).toHaveTextContent('15 agricultural listings');
    },
  );
});
