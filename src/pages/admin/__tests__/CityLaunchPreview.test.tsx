/**
 * CityLaunchPreview — Issue #1911 PR3.
 *
 * MapDiscovery is mocked (it is the frozen, unmodified production component
 * and pulls in the full live Supabase/Discover dependency graph — out of
 * scope to boot here). The stub reads useDiscoverSource()/
 * useDiscoverActionsEnabled() from the SAME context module CityLaunchPreview
 * wires up, so these tests prove the wiring itself: the provider reaches
 * descendants, the ribbon renders, the mutation guard disables the
 * View-details action, and a `preview:` id never routes to the real
 * /listing/{uuid} page.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CityLaunchPreview from '../CityLaunchPreview';
import { useDiscoverSource, useDiscoverActionsEnabled } from '@/features/discover/state/DiscoverDataSourceContext';

vi.mock('@/pages/MapDiscovery', () => ({
  default: function MockMapDiscovery() {
    const source = useDiscoverSource();
    const actionsEnabled = useDiscoverActionsEnabled();
    const navigate = useNavigate();
    // Mirrors the real PropertyCard preview id shape: preview:{revisionId}:{areaKey}.
    const previewId = 'preview:42:IN|KA|Udupi|Manipal';
    return (
      <div data-testid="map-discovery-stub">
        <p data-testid="source-mode">{source.mode}</p>
        <button
          type="button"
          data-testid="view-details-stub"
          disabled={!actionsEnabled}
          onClick={() => {
            // Mirrors PropertyCard's handleActivate gate: preview mode never
            // calls the real navigate-to-/listing/{id} path.
            if (!actionsEnabled) return;
            navigate(`/listing/${previewId}`);
          }}
        >
          View details
        </button>
      </div>
    );
  },
}));

// ─── Issue #1911 PR3 rework — mock scaffold for rendering the REAL MapDiscovery
// (unmocked) so the real useAreaGroups(...) → api.get(...) data path is
// genuinely exercised. Mirrors the proven mock set from
// MapDiscovery.groupResults.test.tsx MINUS the useAreaGroups mock (kept real)
// PLUS a spy on '@/lib/api' so every path MapDiscovery's data hooks request
// can be recorded and asserted on. These mocks are additive and inert for the
// existing tests above (which fully mock '@/pages/MapDiscovery' and never
// reach any of this). ────────────────────────────────────────────────────────

// vi.hoisted — vi.mock('@/lib/api', ...) below is hoisted above plain const
// declarations, so these fixtures (referenced inside that factory) must be
// registered via vi.hoisted to avoid a temporal-dead-zone ReferenceError.
const { PREVIEW_AREA_GROUPS_DTO, LIVE_ONLY_AREA_GROUPS_DTO } = vi.hoisted(() => ({
  PREVIEW_AREA_GROUPS_DTO: {
    groups: [
      { slug: 'preview-only-group', name: 'Preview Only Group', areaKeys: ['IN|KA|Udupi|Manipal'] },
    ],
  },
  // A distinct, easily-identifiable fixture that must NEVER be observed by a
  // preview-mode render — the isolation proof (see the isolation test below).
  LIVE_ONLY_AREA_GROUPS_DTO: {
    groups: [
      { slug: 'live-only-group', name: 'Live Only Group', areaKeys: ['IN|KA|Udupi|LiveOnlyArea'] },
    ],
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, isAdmin: false, isDealer: false }),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/PublicDiscoverLayout', () => ({
  PublicDiscoverLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: () => ({
    data: { content: [], totalElements: 0, page: 0, size: 50, totalPages: 0, aggregates: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: (city: string) => ({
    data: { city, markers: [], truncated: false },
    isLoading: false,
    isFetching: false,
  }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({
    data: { city: 'udupi', areas: [] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: () => ({
    data: { areas: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: () => ({ groups: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: () => ({ data: undefined }),
  useSchoolById: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: () => ({ data: undefined, isLoading: false, error: null }),
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

// The spy: records every path api.get is called with. Deliberately keyed on
// the EXACT preview-vs-live area-groups paths so the isolation assertion is
// genuine (not a mock of useAreaGroups itself — useAreaGroups is NOT mocked
// anywhere in this file/describe block; it runs for real and calls through
// to this api.get spy). Any other Discover endpoint (regions/markers/etc,
// also threaded and hit for real by MapDiscovery's other unmocked hooks)
// resolves to an inert empty shape so rendering settles without retries.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async (path: string) => {
      if (path.startsWith('/api/admin/city-launch') && path.endsWith('/area-groups')) {
        return PREVIEW_AREA_GROUPS_DTO;
      }
      if (path.startsWith('/api/discover/area-groups')) {
        // The LIVE area-groups endpoint — must never be hit while previewing.
        return LIVE_ONLY_AREA_GROUPS_DTO;
      }
      return {
        regions: [], groups: [], areas: [], markers: [], listings: [],
        content: [], totalElements: 0, cityId: null, citySlug: '',
      };
    }),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

function renderAtPreviewRoute(cityId: string, revisionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/admin/city-launch/${cityId}/preview/${revisionId}`]}>
      <Routes>
        <Route path="/admin/city-launch/:cityId/preview/:revisionId" element={<CityLaunchPreview />} />
        <Route path="/listing/:id" element={<div data-testid="real-listing-page">Real listing page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CityLaunchPreview', () => {
  it('renders the SIMULATED · PREVIEW ribbon', () => {
    renderAtPreviewRoute('7', '42');
    expect(screen.getByTestId('simulated-preview-ribbon')).toBeInTheDocument();
  });

  it('wraps MapDiscovery in a preview DiscoverDataSource sourced from the URL params', () => {
    renderAtPreviewRoute('7', '42');
    expect(screen.getByTestId('map-discovery-stub')).toBeInTheDocument();
    expect(screen.getByTestId('source-mode')).toHaveTextContent('preview');
  });

  it('the mutation guard disables the View-details action in preview mode', () => {
    renderAtPreviewRoute('7', '42');
    expect(screen.getByTestId('view-details-stub')).toBeDisabled();
  });

  it('a preview: id never routes to the real /listing/{uuid} page', async () => {
    renderAtPreviewRoute('7', '42');
    await userEvent.click(screen.getByTestId('view-details-stub'));
    expect(screen.queryByTestId('real-listing-page')).not.toBeInTheDocument();
    // Still on the preview screen.
    expect(screen.getByTestId('map-discovery-stub')).toBeInTheDocument();
  });

  it('shows an error state (not MapDiscovery) for a non-numeric cityId/revisionId', () => {
    renderAtPreviewRoute('abc', '42');
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid preview link/i);
    expect(screen.queryByTestId('map-discovery-stub')).not.toBeInTheDocument();
  });

  it('shows an error state for a zero/negative revisionId', () => {
    renderAtPreviewRoute('7', '0');
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid preview link/i);
    expect(screen.queryByTestId('map-discovery-stub')).not.toBeInTheDocument();
  });
});

// ─── Issue #1911 PR3 rework — THE KEY TEST: real MapDiscovery, real
// useAreaGroups, proving the area-groups isolation gap is closed.
//
// Every test above fully mocks '@/pages/MapDiscovery', so it never exercises
// MapDiscovery's real `useAreaGroups(urlState.city || DEFAULT_CITY)` call —
// that's exactly how the isolation bug went undetected. This block unmocks
// '@/pages/MapDiscovery' (and does NOT mock '@/hooks/useAreaGroups' anywhere)
// so the real hook runs and calls through to the '@/lib/api' spy declared
// above. Only true leaf rendering deps (Leaflet, PropertyMap, Supabase
// client, the other Discover data hooks) are stubbed — see the mock block
// above renderAtPreviewRoute.
describe('CityLaunchPreview — area-groups isolation with the REAL MapDiscovery (Issue #1911 PR3 rework)', () => {
  let RealCityLaunchPreview: React.ComponentType;
  let apiGetSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    vi.doUnmock('@/pages/MapDiscovery');
    vi.resetModules();
    const cityLaunchPreviewModule = await import('../CityLaunchPreview');
    RealCityLaunchPreview = cityLaunchPreviewModule.default;
    const apiModule = await import('@/lib/api');
    apiGetSpy = vi.mocked(apiModule.api.get);
  });

  afterAll(() => {
    // Restore the top-of-file mock so module state doesn't bleed into any
    // test file run after this one in the same worker.
    vi.doMock('@/pages/MapDiscovery', () => ({
      default: function MockMapDiscovery() {
        const source = useDiscoverSource();
        const actionsEnabled = useDiscoverActionsEnabled();
        return (
          <div data-testid="map-discovery-stub">
            <p data-testid="source-mode">{source.mode}</p>
            <button type="button" data-testid="view-details-stub" disabled={!actionsEnabled}>
              View details
            </button>
          </div>
        );
      },
    }));
  });

  beforeEach(() => {
    apiGetSpy.mockClear();
  });

  function renderRealPreview(cityId: string, revisionId: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/admin/city-launch/${cityId}/preview/${revisionId}`]}>
          <Routes>
            <Route
              path="/admin/city-launch/:cityId/preview/:revisionId"
              element={<RealCityLaunchPreview />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('(a) in preview mode, the real useAreaGroups call reaches api.get with the preview area-groups path', async () => {
    renderRealPreview('7', '42');

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith(
        '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups',
        { skipAuth: false },
      );
    });
  });

  it('(b) in preview mode, api.get is NEVER called with the live /api/discover/area-groups path — isolation proof', async () => {
    renderRealPreview('7', '42');

    // Wait for the real hook's request to land before asserting the negative,
    // so this isn't a false pass from asserting before any fetch fired.
    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith(
        '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups',
        { skipAuth: false },
      );
    });

    const liveAreaGroupsCalls = apiGetSpy.mock.calls.filter(
      ([path]) => typeof path === 'string' && path.startsWith('/api/discover/area-groups'),
    );
    expect(liveAreaGroupsCalls).toHaveLength(0);
  });

  it('preview groups come from the revision sandbox endpoint, never the live-only fixture — cross-revision isolation', async () => {
    renderRealPreview('7', '42');

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith(
        '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups',
        { skipAuth: false },
      );
    });

    // The live-only fixture (what the LIVE /api/discover/area-groups endpoint
    // would have returned, per the mock above) must never have been fetched —
    // proves the render is fed exclusively by the preview endpoint's response.
    const liveAreaGroupsCalls = apiGetSpy.mock.calls.filter(
      ([path]) => typeof path === 'string' && path.startsWith('/api/discover/area-groups'),
    );
    expect(liveAreaGroupsCalls).toHaveLength(0);
  });

  it('two different revisionIds produce two different preview area-groups paths (no cross-revision collision)', async () => {
    renderRealPreview('7', '42');
    await waitFor(() => {
      expect(
        apiGetSpy.mock.calls.some(
          ([path]) => path === '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups',
        ),
      ).toBe(true);
    });
    apiGetSpy.mockClear();

    renderRealPreview('7', '99');
    await waitFor(() => {
      expect(
        apiGetSpy.mock.calls.some(
          ([path]) => path === '/api/admin/city-launch/cities/7/revisions/99/preview/area-groups',
        ),
      ).toBe(true);
    });

    // Revision 42's preview path must not resurface in revision 99's calls.
    expect(
      apiGetSpy.mock.calls.some(
        ([path]) => path === '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups',
      ),
    ).toBe(false);
  });
});
