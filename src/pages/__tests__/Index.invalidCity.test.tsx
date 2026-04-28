import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import Index from '../Index';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';

// ─── Hoisted mock handles ──────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, isAdmin: false, isDealer: false }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverMarkers', () => ({
  useDiscoverMarkers: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/usePropertyListings', () => ({
  usePropertyListings: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  useLocalities: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
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
          <Route path="/discover" element={<Index />} />
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
          <Route path="/discover" element={<Index />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────
describe('Index page — city validity guard', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
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
    // Normal-path UI should render: anonymous login CTA is always visible to unauthenticated users
    expect(screen.getByText(/sign in to see full details/i)).toBeInTheDocument();
  });

  it('does NOT render fallback UI when no city param is present (defaults to udupi)', () => {
    renderNoCity();

    expect(screen.queryByRole('heading', { name: /city not supported/i })).not.toBeInTheDocument();
  });
});
