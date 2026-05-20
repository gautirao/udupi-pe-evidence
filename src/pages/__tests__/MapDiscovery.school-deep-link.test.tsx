/**
 * Issue #1145 — non-404 school deep-link lookup errors must clear the URL param
 * and show a recoverable toast. 404 must still silently clear (AC3 regression guard).
 *
 * Strategy: mount MapDiscovery at a URL with ?schoolId=test-school-123. Control
 * useSchoolById's return value via the hoisted mock handle to simulate 500 errors,
 * 404 errors, network TypeErrors, and success. Assert URL param clearing and toast
 * invocation accordingly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { ApiError } from '@/lib/api';

// ─── Hoisted handles ─────────────────────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// Mutable handle: tests set .returnValue before render to control useSchoolById output.
const mockUseSchoolById = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined, isLoading: true, error: null })),
);

const mockToast = vi.hoisted(() => vi.fn());

// Capture URL search params from inside router — we spy via MemoryRouter's location.
// Simpler approach: capture the setSchoolParams call by observing URL via a
// location-capturing component mounted alongside MapDiscovery.
const capturedSearchParams = vi.hoisted(() => ({ value: '' }));

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: (...args: unknown[]) => mockUseSchoolById(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: () => <div data-testid="discover-right-panel-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'udupi', areas: [] },
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

// ─── Helper: capture current URL params ──────────────────────────────────────
// Mount a sibling Route that records the latest search string so we can assert
// that schoolId was cleared from the URL.
function LocationCapture() {
  const loc = useLocation();
  capturedSearchParams.value = loc.search;
  return null;
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<><MapDiscovery /><LocationCapture /></>} />
          <Route path="*" element={<><MapDiscovery /><LocationCapture /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
const SCHOOL_DEEP_LINK = '/discover?city=udupi&schoolId=test-school-123&journey=school-first';

describe('Issue #1145 — school deep-link error handling', () => {
  beforeEach(() => {
    mockToast.mockClear();
    capturedSearchParams.value = '';
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  describe('AC1 + AC2 — non-404 ApiError (500)', () => {
    it('clears schoolId from URL and shows a destructive toast', async () => {
      mockUseSchoolById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new ApiError('Internal Server Error', 500, {}),
      });

      renderAt(SCHOOL_DEEP_LINK);

      await waitFor(() => {
        expect(capturedSearchParams.value).not.toContain('schoolId');
      });

      expect(mockToast).toHaveBeenCalledOnce();
      const toastArg = mockToast.mock.calls[0][0] as Record<string, unknown>;
      expect(toastArg.variant).toBe('destructive');
      expect(toastArg.title).toMatch(/school details unavailable/i);
    });
  });

  describe('AC1 + AC2 — network error (TypeError)', () => {
    it('clears schoolId from URL and shows a destructive toast for fetch rejections', async () => {
      mockUseSchoolById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new TypeError('Failed to fetch'),
      });

      renderAt(SCHOOL_DEEP_LINK);

      await waitFor(() => {
        expect(capturedSearchParams.value).not.toContain('schoolId');
      });

      expect(mockToast).toHaveBeenCalledOnce();
      const toastArg = mockToast.mock.calls[0][0] as Record<string, unknown>;
      expect(toastArg.variant).toBe('destructive');
    });
  });

  describe('AC3 regression — 404 silently clears without toast', () => {
    it('removes schoolId from URL but does NOT call toast for 404', async () => {
      mockUseSchoolById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new ApiError('Not Found', 404, {}),
      });

      renderAt(SCHOOL_DEEP_LINK);

      await waitFor(() => {
        expect(capturedSearchParams.value).not.toContain('schoolId');
      });

      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('success path — school loads normally', () => {
    it('does not clear schoolId and does not toast when school data arrives', async () => {
      mockUseSchoolById.mockReturnValue({
        data: {
          id: 'test-school-123',
          name: 'Test School',
          latitude: 13.354,
          longitude: 74.708,
          city: 'udupi',
          areaKey: 'IN|KA|Udupi|Malpe',
          board: 'STATE',
          category: 'PRIMARY',
        },
        isLoading: false,
        error: null,
      });

      renderAt(SCHOOL_DEEP_LINK);

      // Allow React effects to settle.
      await waitFor(() => {
        expect(document.querySelector('[data-testid="property-map-mock"]')).not.toBeNull();
      });

      // schoolId must still be present in the URL.
      expect(capturedSearchParams.value).toContain('schoolId=test-school-123');
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('no-op when schoolId is absent', () => {
    it('does not toast when there is no schoolId in URL', async () => {
      mockUseSchoolById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new ApiError('Internal Server Error', 500, {}),
      });

      // URL without schoolId — cleanup effect must short-circuit.
      renderAt('/discover?city=udupi&journey=area-first');

      await waitFor(() => {
        expect(document.querySelector('[data-testid="property-map-mock"]')).not.toBeNull();
      });

      expect(mockToast).not.toHaveBeenCalled();
    });
  });
});
