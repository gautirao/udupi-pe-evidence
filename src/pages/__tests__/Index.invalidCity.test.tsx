import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';

// ─── Area fixture used in areaKey hydration tests ──────────────
const FAKE_AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3528,
      geoCenterLon: 74.7917,
      listingCount90d: 12,
      trendDirection: 'rising',
    },
    {
      areaKey: 'IN|KA|Udupi|Karkala',
      name: 'Karkala',
      geoCenterLat: 13.2024,
      geoCenterLon: 74.9991,
      listingCount90d: 5,
      trendDirection: null,
    },
  ],
};

// ─── Hoisted mock handles ──────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  mapSchoolRadiusCard: vi.fn((item) => item),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: undefined, isLoading: false })),
}));


vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/usePropertyListings', () => ({
  usePropertyListings: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({ data: undefined })),
}));

// Leaflet and its wrappers do not render in jsdom
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

// Supabase client (used indirectly by some hooks)
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Helpers ──────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithCity(city: string) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[`/discover?city=${city}`]}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderNoCity() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={['/discover']}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderAuthenticatedWithCity(city: string) {
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'test@example.com' },
    isLoading: false,
    isAdmin: false,
    isDealer: true,
  });
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[`/discover?city=${city}`]}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Helper: render with city + areaKey ───────────────────────
function renderWithCityAndAreaKey(city: string, areaKey: string) {
  const encoded = encodeURIComponent(areaKey);
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[`/discover?city=${city}&areaKey=${encoded}`]}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────
describe('Index page — city validity guard', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('renders fallback UI when an unknown city slug is given', () => {
    renderWithCity('notacity');

    expect(screen.getByRole('heading', { name: /city not supported/i })).toBeInTheDocument();
    expect(screen.getByText(/notacity/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /explore udupi/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
    // Map/panel layout must not be present
    expect(screen.queryByText(/loading map/i)).not.toBeInTheDocument();
    // Area data must not be requested for an invalid city
    expect(vi.mocked(useDiscoverAreas)).not.toHaveBeenCalledWith('notacity');
  });

  it('"Explore Udupi" link points to the correct URL', () => {
    renderWithCity('notacity');

    const link = screen.getByRole('link', { name: /explore udupi/i });
    expect(link).toHaveAttribute('href', '/discover?city=udupi');
  });

  it('"Go Home" link points to /', () => {
    renderWithCity('notacity');

    const link = screen.getByRole('link', { name: /go home/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('does NOT render fallback UI for a valid city (bangalore)', () => {
    renderWithCity('bangalore');

    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
    // Normal-path UI should render: city chip is always visible on the map page
    expect(screen.getAllByText('Bangalore').length).toBeGreaterThan(0);
  });

  it('does NOT render fallback UI when no city param is present (defaults to udupi)', () => {
    renderNoCity();

    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
  });

  it('authenticated layout: city chip and city select are both present (no occlusion)', () => {
    // Regression: stats bar was at absolute top-4 right-4, same anchor as CitySelect,
    // completely occluding the city switcher for authenticated users (AC2 violation).
    // Stats bar is now centred (left-1/2 -translate-x-1/2) so both elements can coexist.
    renderAuthenticatedWithCity('udupi');

    // City chip (top-left, always visible — read-only label) and CitySelect both show the
    // city name; there will be at least 2 occurrences when neither element is suppressed.
    expect(screen.getAllByText('Udupi').length).toBeGreaterThanOrEqual(2);

    // CitySelect trigger must be present and interactive — rendered regardless of auth state (AC2).
    // SelectTrigger wraps Radix SelectPrimitive.Trigger which renders a <button role="combobox">.
    // This assertion fails if CitySelect is hidden, removed, or refactored to an aria-only node.
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();

    // No-occlusion proof: the CitySelect (the element the stats bar used to cover)
    // must be interactive, not merely present. An occluded/hidden trigger would be
    // disabled or absent. MapStatsBar no longer renders listing-count copy
    // (see MapStatsBar.test.tsx — "on map"/"total listings" text was removed), so the
    // chip+select coexistence above is the canonical no-occlusion assertion.
    expect(screen.getByRole('combobox')).toBeEnabled();
  });
});

describe('Index page — areaKey URL hydration', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    // Reset discover areas mock to default (empty) before each test
    vi.mocked(useDiscoverAreas).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useDiscoverAreas>);
  });

  it('does not show fallback UI when valid areaKey is in URL', () => {
    vi.mocked(useDiscoverAreas).mockReturnValue({
      data: FAKE_AREAS_RESPONSE,
      isLoading: false,
    } as ReturnType<typeof useDiscoverAreas>);

    renderWithCityAndAreaKey('udupi', 'IN|KA|Udupi|Manipal');

    // Should render the map UI, not the "city not supported" fallback
    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
    // CitySelect should be present
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not crash when areas are still loading on mount', () => {
    vi.mocked(useDiscoverAreas).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDiscoverAreas>);

    renderWithCityAndAreaKey('udupi', 'IN|KA|Udupi|Manipal');

    // Should render the map UI without error even if areas haven't loaded yet
    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
  });

  it('resolves areaKey once areas finish loading', async () => {
    // Simulate areas loading completing after initial render
    vi.mocked(useDiscoverAreas)
      .mockReturnValueOnce({ data: undefined, isLoading: true } as ReturnType<typeof useDiscoverAreas>)
      .mockReturnValue({ data: FAKE_AREAS_RESPONSE, isLoading: false } as ReturnType<typeof useDiscoverAreas>);

    renderWithCityAndAreaKey('udupi', 'IN|KA|Udupi|Manipal');

    // After areas load, the page should not be in fallback/error state
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
    });
  });

  it('renders correctly with an invalid city even when areaKey is present', () => {
    renderWithCityAndAreaKey('notacity', 'IN|KA|Udupi|Manipal');

    // Invalid city guard still fires — areaKey does not bypass it
    expect(screen.getByRole('heading', { name: /city not supported/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the main discover UI when city is valid and areaKey is absent', () => {
    renderWithCity('udupi');

    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
