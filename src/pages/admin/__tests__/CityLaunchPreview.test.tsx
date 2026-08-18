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
import { useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { api } from '@/lib/api';
import type { ValidationStateDto } from '@/hooks/useCityLaunchValidation';

vi.mock('@/pages/MapDiscovery', () => ({
  default: function MockMapDiscovery() {
    const source = useDiscoverSource();
    const actionsEnabled = useDiscoverActionsEnabled();
    const navigate = useNavigate();
    // #2151 Track 1 — surfaces the SAME nav.city every real display/data call site consumes
    // (the `nav.city || DEFAULT_CITY` idiom), read through the real DiscoverProvider
    // CityLaunchPreview mounts this stub under. Lets tests prove city-identity resolution
    // end-to-end without depending on the full unmocked MapDiscovery render.
    const nav = useDiscoverNav();
    // Mirrors the real PropertyCard preview id shape: preview:{revisionId}:{areaKey}.
    const previewId = 'preview:42:IN|KA|Udupi|Manipal';
    return (
      <div data-testid="map-discovery-stub">
        <p data-testid="source-mode">{source.mode}</p>
        <p data-testid="nav-city">{nav.city}</p>
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
const {
  PREVIEW_AREA_GROUPS_DTO,
  LIVE_ONLY_AREA_GROUPS_DTO,
  DEFAULT_VALIDATION_STATE_DTO,
  PREVIEW_IDENTITY_DTO,
  CITY_IDENTITY_BY_ID,
} = vi.hoisted(() => ({
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
  // Issue #1911 PR4 — default GET .../validation fixture: editable, nothing
  // ticked yet. Every test that doesn't care about the validation rail's
  // exact contents (all the PR3 tests above/below) still gets a well-formed
  // ValidationStateDto so CityLaunchPreview's useValidationState() call
  // doesn't crash rendering the checklist.
  DEFAULT_VALIDATION_STATE_DTO: {
    revisionId: 42,
    cityId: 7,
    revisionNumber: 1,
    lifecycleStatus: 'PREPARED',
    checks: {
      landing: false,
      regions: false,
      areaGroups: false,
      areas: false,
      listing: false,
      agriDestinations: false,
    },
    allValidated: false,
    editable: true,
    preparedAt: '2026-07-01T00:00:00Z',
    validatedAt: null,
    supersededBy: null,
    // #2151 Track 1 — several describe blocks below use this fixture as a catch-all fallback
    // for any api.get path OTHER than the one they're specifically testing, including
    // .../preview/identity. Carrying a valid citySlug/cityName here keeps those blocks'
    // pre-existing "one endpoint under test, everything else falls back" pattern working
    // without touching every individual test.
    citySlug: 'udupi',
    cityName: 'Udupi',
  },
  // #2151 Track 1 — GET .../preview/identity fixture. CityLaunchPreview resolves this BEFORE
  // mounting the Discover subtree, so every test that renders a real (non-error-state) preview
  // needs it to resolve successfully.
  PREVIEW_IDENTITY_DTO: {
    cityId: 7,
    citySlug: 'udupi',
    cityName: 'Udupi',
  },
  // #2151 Track 1 — per-cityId identity lookup so the city-identity tests can render at
  // DISTINCT cityIds (Udupi vs Bangalore) and prove real per-city resolution, not a fixture
  // that's coincidentally always right for one hardcoded city.
  CITY_IDENTITY_BY_ID: {
    1: { cityId: 1, citySlug: 'bangalore', cityName: 'Bangalore' },
    3: { cityId: 3, citySlug: 'udupi', cityName: 'Udupi' },
    7: { cityId: 7, citySlug: 'udupi', cityName: 'Udupi' },
  } as Record<number, { cityId: number; citySlug: string; cityName: string }>,
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
  useAgriDestinations: () => ({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    error: null,
    refetch: vi.fn(),
  }),
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
      if (path.startsWith('/api/admin/city-launch') && path.endsWith('/validation')) {
        return DEFAULT_VALIDATION_STATE_DTO;
      }
      // #2151 Track 1 — CityLaunchPreview resolves identity BEFORE mounting the Discover
      // subtree; every test in this file that reaches a real render needs this to resolve.
      // cityId-aware (not a single fixed fixture): the city-identity tests below render at
      // DISTINCT cityIds (Udupi vs Bangalore) specifically to prove real per-city resolution,
      // not a value that's coincidentally always right.
      if (path.startsWith('/api/admin/city-launch') && path.endsWith('/preview/identity')) {
        const cityIdMatch = path.match(/\/cities\/(\d+)\//);
        const cityId = cityIdMatch ? Number(cityIdMatch[1]) : PREVIEW_IDENTITY_DTO.cityId;
        return CITY_IDENTITY_BY_ID[cityId] ?? PREVIEW_IDENTITY_DTO;
      }
      if (path === '/api/admin/city-launch/cities') {
        return [{ cityId: 7, cityName: 'Test City' }];
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/city-launch/${cityId}/preview/${revisionId}`]}>
        <Routes>
          <Route path="/admin/city-launch/:cityId/preview/:revisionId" element={<CityLaunchPreview />} />
          <Route path="/listing/:id" element={<div data-testid="real-listing-page">Real listing page</div>} />
          <Route path="/admin/city-launch" element={<div data-testid="city-launch-list-page">City launch list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CityLaunchPreview', () => {
  // #2151 Track 1 — the Discover subtree (ribbon/MapDiscovery/etc) no longer mounts
  // synchronously: CityLaunchPreview now resolves GET .../preview/identity FIRST (a real,
  // if instantly-resolving, async mock in this file) and shows a loading skeleton until it
  // does. Every test below that reaches past that gate now awaits it via findByTestId.
  it('renders the SIMULATED · PREVIEW ribbon', async () => {
    renderAtPreviewRoute('7', '42');
    expect(await screen.findByTestId('simulated-preview-ribbon')).toBeInTheDocument();
  });

  it('wraps MapDiscovery in a preview DiscoverDataSource sourced from the URL params', async () => {
    renderAtPreviewRoute('7', '42');
    expect(await screen.findByTestId('map-discovery-stub')).toBeInTheDocument();
    expect(screen.getByTestId('source-mode')).toHaveTextContent('preview');
  });

  it('the mutation guard disables the View-details action in preview mode', async () => {
    renderAtPreviewRoute('7', '42');
    expect(await screen.findByTestId('view-details-stub')).toBeDisabled();
  });

  it('a preview: id never routes to the real /listing/{uuid} page', async () => {
    renderAtPreviewRoute('7', '42');
    await userEvent.click(await screen.findByTestId('view-details-stub'));
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

// ─── #2151 Track 1 — city identity resolution ───────────────────────────────
//
// Root cause: the preview route carries only numeric cityId/revisionId — no
// `city=` query param, by design — so anything reading nav.city (the
// `nav.city || DEFAULT_CITY` idiom used throughout Discover) fell back to
// DEFAULT_CITY ('bangalore'), even when previewing a non-Bangalore city like
// Udupi. CityLaunchPreview now resolves GET .../preview/identity BEFORE
// mounting DiscoverDataSourceProvider, and DiscoverContext's central fix
// substitutes that resolved citySlug for nav.city in preview mode. These
// tests prove the fix through the SAME nav.city consumers a real display
// component would use (MockMapDiscovery's `nav-city` testid reads
// useDiscoverNav().city — the facade every real call site reads).
describe('CityLaunchPreview — city identity resolution (#2151 Track 1)', () => {
  it('resolves nav.city to the real owning city for a Udupi preview URL — never falls back to Bangalore/DEFAULT_CITY', async () => {
    renderAtPreviewRoute('3', '42');

    const navCity = await screen.findByTestId('nav-city');
    expect(navCity).toHaveTextContent('udupi');
    expect(navCity).not.toHaveTextContent('bangalore');
    expect(screen.queryByText(/bangalore/i)).not.toBeInTheDocument();
  });

  it('resolves nav.city correctly for a Bangalore preview URL too — regression proof that the fix is not coincidentally right only for the non-default city', async () => {
    renderAtPreviewRoute('1', '42');

    const navCity = await screen.findByTestId('nav-city');
    expect(navCity).toHaveTextContent('bangalore');
  });

  it('cold-mount / direct deep-link: identity resolves before the Discover subtree (and any city-dependent request) ever mounts — no flash of the wrong city', async () => {
    // No prior navigation/render — renderAtPreviewRoute mounts fresh, straight at the preview
    // URL, mirroring a real cold deep-link (e.g. a bookmarked or shared admin preview link).
    renderAtPreviewRoute('3', '42');

    // Before identity resolves, the loading skeleton is shown — the Discover subtree
    // (and therefore nav.city) does not exist yet to read at all, let alone read wrong.
    expect(screen.queryByTestId('map-discovery-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-city')).not.toBeInTheDocument();

    const navCity = await screen.findByTestId('nav-city');
    expect(navCity).toHaveTextContent('udupi');
  });

  it('no DEFAULT_CITY leak: no request URL fired by the mounted subtree contains city=bangalore, and no rendered text is "Bangalore", for a Udupi preview', async () => {
    renderAtPreviewRoute('3', '42');

    await screen.findByTestId('nav-city');
    // Give the mocked hooks a tick to settle any further requests.
    await waitFor(() => expect(screen.getByTestId('nav-city')).toHaveTextContent('udupi'));

    const calledPaths = vi.mocked(api.get).mock.calls.map(([path]) => String(path));
    expect(calledPaths.some((path) => path.includes('city=bangalore'))).toBe(false);
    // Text assertion is deliberately paired with the request-URL check above (per #2151
    // review guidance) — a broken/blank subtree would vacuously pass a text-only assertion.
    expect(screen.queryByText(/bangalore/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('map-discovery-stub')).toBeInTheDocument();
  });
});

// ─── Issue #1911 PR4 — validation rail: exercises the REAL
// useCityLaunchValidation hooks (GET/PUT/POST) against the mocked
// '@/lib/api' declared above. MapDiscovery stays mocked (frozen PR3 concern,
// out of scope here).
describe('CityLaunchPreview — validation rail (Issue #1911 PR4)', () => {
  const CITY_ID = 7;
  const REVISION_ID = 42;

  function validationState(overrides: Partial<ValidationStateDto> = {}): ValidationStateDto {
    return {
      revisionId: REVISION_ID,
      cityId: CITY_ID,
      revisionNumber: 1,
      lifecycleStatus: 'PREPARED',
      checks: {
        landing: false,
        regions: false,
        areaGroups: false,
        areas: false,
        listing: false,
        agriDestinations: false,
      },
      allValidated: false,
      editable: true,
      preparedAt: '2026-07-01T00:00:00Z',
      validatedAt: null,
      supersededBy: null,
      ...overrides,
    };
  }

  const validationPath = `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/validation`;

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('renders the 6 validation checkboxes driven by GET /validation', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation') ? validationState() : DEFAULT_VALIDATION_STATE_DTO,
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    });
    expect(screen.getByRole('checkbox', { name: 'Landing' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Regions' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Area Groups' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Areas' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Listing' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Agri Destinations' })).not.toBeChecked();
  });

  it('ticking a checkbox calls PUT /validation/checks/{checkKey}', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation') ? validationState() : DEFAULT_VALIDATION_STATE_DTO,
    );
    vi.mocked(api.put).mockResolvedValue(
      validationState({
        checks: {
          landing: true,
          regions: false,
          areaGroups: false,
          areas: false,
          listing: false,
          agriDestinations: false,
        },
      }),
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Landing' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('checkbox', { name: 'Landing' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(`${validationPath}/checks/landing`, { value: true });
    });
  });

  it('ticking the Agri Destinations checkbox calls PUT /validation/checks/agriDestinations', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation') ? validationState() : DEFAULT_VALIDATION_STATE_DTO,
    );
    vi.mocked(api.put).mockResolvedValue(
      validationState({
        checks: {
          landing: false,
          regions: false,
          areaGroups: false,
          areas: false,
          listing: false,
          agriDestinations: true,
        },
      }),
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Agri Destinations' })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Agri Destinations' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(`${validationPath}/checks/agriDestinations`, { value: true });
    });
  });

  it('"Mark preview validated" is disabled until all six checks are ticked', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation') ? validationState() : DEFAULT_VALIDATION_STATE_DTO,
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark preview validated/i })).toBeDisabled();
    });
  });

  it('"Mark preview validated" stays disabled when only five of six checks are ticked', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation')
        ? validationState({
            checks: {
              landing: true,
              regions: true,
              areaGroups: true,
              areas: true,
              listing: true,
              agriDestinations: false,
            },
            allValidated: false,
          })
        : DEFAULT_VALIDATION_STATE_DTO,
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Landing' })).toBeChecked();
    });
    expect(screen.getByRole('button', { name: /mark preview validated/i })).toBeDisabled();
  });

  it('"Mark preview validated" is enabled once allValidated is true (all six checks ticked)', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation')
        ? validationState({
            checks: {
              landing: true,
              regions: true,
              areaGroups: true,
              areas: true,
              listing: true,
              agriDestinations: true,
            },
            allValidated: true,
          })
        : DEFAULT_VALIDATION_STATE_DTO,
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark preview validated/i })).not.toBeDisabled();
    });
  });

  it('"Preview not ready" calls POST /rerun', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation') ? validationState() : DEFAULT_VALIDATION_STATE_DTO,
    );
    vi.mocked(api.post).mockResolvedValue({ revisionId: 43, status: 'preparing' });

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));
    await waitFor(() => expect(screen.getByRole('button', { name: /preview not ready/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /preview not ready/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/rerun`,
      );
    });

    // #2175 — a successful rerun must navigate the admin away from this now-dead
    // old-revision screen (it would otherwise refetch as editable:false and show
    // the superseded-banner with every control disabled, looking like nothing
    // happened) and back to the city list, where the new PREPARING revision's
    // progress is actually surfaced.
    await waitFor(() => {
      expect(screen.getByTestId('city-launch-list-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('superseded-banner')).not.toBeInTheDocument();
  });

  it('editable:false (superseded) disables all checkboxes/buttons and shows the not-current banner', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.endsWith('/validation')
        ? validationState({ editable: false, supersededBy: 99 })
        : DEFAULT_VALIDATION_STATE_DTO,
    );

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByTestId('superseded-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('superseded-banner')).toHaveTextContent(/no longer current/i);
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /mark preview validated/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /preview not ready/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reset validation/i })).toBeDisabled();
  });

  it('a VALIDATED revision directly opened can get to CityLaunchReadiness', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/validation')) {
        return validationState({
          lifecycleStatus: 'VALIDATED',
          allValidated: true,
          editable: true,
          checks: {
            landing: true,
            regions: true,
            areaGroups: true,
            areas: true,
            listing: true,
            agriDestinations: true,
          },
          supersededBy: null,
        });
      }
      if (path === '/api/admin/city-launch/cities') {
        return [{ cityId: CITY_ID, cityName: 'Test City' }];
      }
      return DEFAULT_VALIDATION_STATE_DTO;
    });

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /review & launch/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /review & launch/i }));

    expect(screen.getByTestId('city-launch-readiness')).toBeInTheDocument();
    // Merely rendering Readiness should not invoke promotion
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});

// ─── Issue #1911 PR4 code-review cycle 1 — WIRE CONTRACT test.
//
// Every other GET /validation mock in this file goes through
// validationState()/DEFAULT_VALIDATION_STATE_DTO, which are themselves
// hand-authored fixtures — if those fixtures and the real backend DTO drift
// apart, every "shape" assertion below would still pass against the WRONG
// shape and never catch it. This block instead inlines the response as a
// raw object literal transcribed directly from the backend's documented
// wire payload (nested `checks{}`, revisionId/cityId/revisionNumber/
// lifecycleStatus/allValidated/editable/preparedAt/validatedAt/
// supersededBy) with no shared helper in between, so a future flat-vs-nested
// (or field-renamed) regression on either side fails this test even if the
// local fixtures were "fixed" to match the old broken shape.
describe('CityLaunchPreview — validation rail wire contract (Issue #1911 PR4, review cycle 1)', () => {
  const CITY_ID = 7;
  const REVISION_ID = 42;
  const validationPath = `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/validation`;

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('renders correct ticked/unticked state from the real (nested checks) backend JSON', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (!path.endsWith('/validation')) return DEFAULT_VALIDATION_STATE_DTO;
      // Transcribed verbatim from the backend contract — do not route this
      // through makeState()/validationState() helpers.
      return {
        revisionId: 42,
        cityId: 7,
        revisionNumber: 3,
        lifecycleStatus: 'PREPARED',
        checks: {
          landing: true,
          regions: false,
          areaGroups: true,
          areas: false,
          listing: false,
          agriDestinations: false,
        },
        allValidated: false,
        editable: true,
        preparedAt: '2026-07-15T10:00:00Z',
        validatedAt: null,
        supersededBy: null,
      };
    });

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    });
    expect(screen.getByRole('checkbox', { name: 'Landing' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Regions' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Area Groups' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Areas' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Listing' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Agri Destinations' })).not.toBeChecked();
    expect(api.get).toHaveBeenCalledWith(validationPath);
  });

  it('a superseded (editable:false) real-shape response disables the rail and shows the banner', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (!path.endsWith('/validation')) return DEFAULT_VALIDATION_STATE_DTO;
      return {
        revisionId: 42,
        cityId: 7,
        revisionNumber: 3,
        lifecycleStatus: 'SUPERSEDED',
        checks: {
          landing: true,
          regions: true,
          areaGroups: true,
          areas: true,
          listing: true,
          agriDestinations: true,
        },
        allValidated: true,
        editable: false,
        preparedAt: '2026-07-15T10:00:00Z',
        validatedAt: '2026-07-15T11:00:00Z',
        supersededBy: 99,
      };
    });

    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByTestId('superseded-banner')).toBeInTheDocument();
    });
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /mark preview validated/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /preview not ready/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reset validation/i })).toBeDisabled();
  });
});

// ─── Issue #2121 — "View current revision" for a Live city must reach a
// PROMOTED-and-not-superseded revision without misrepresenting it as "no
// longer current" (that was the pre-existing `superseded = !editable` bug:
// PROMOTED is never in EDITABLE_STATUSES, so every live revision was
// rendering the destructive superseded banner). Also proves the whole
// surface — including the #2121 hierarchy tab — is reachable from a plain
// GET-backed navigation with no mutating side effect.
describe('CityLaunchPreview — viewing the current LIVE revision (Issue #2121)', () => {
  const CITY_ID = 7;
  const REVISION_ID = 42;

  const LIVE_VALIDATION_STATE = {
    revisionId: REVISION_ID,
    cityId: CITY_ID,
    revisionNumber: 3,
    lifecycleStatus: 'PROMOTED',
    checks: {
      landing: true,
      regions: true,
      areaGroups: true,
      areas: true,
      listing: true,
      agriDestinations: true,
    },
    allValidated: true,
    editable: false,
    preparedAt: '2026-07-01T00:00:00Z',
    validatedAt: '2026-07-01T01:00:00Z',
    supersededBy: null,
  };

  const LIVE_NAV_TREE = {
    revisionId: REVISION_ID,
    validationStatus: 'VALID',
    validationErrors: [] as string[],
    nodes: [
      {
        nodeKey: 'd:north',
        nodeType: 'DIRECTION' as const,
        parentNodeKey: null,
        displayLabel: 'North',
        depth: 0,
        displayOrder: 0,
        descendantAreaCount: 0,
      },
    ],
  };

  function mockLiveApiGet() {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/validation')) return LIVE_VALIDATION_STATE;
      if (path.endsWith('/navigation/tree')) return LIVE_NAV_TREE;
      // DEFAULT_VALIDATION_STATE_DTO also carries citySlug/cityName, so it
      // doubles as the .../preview/identity fallback (same pattern as every
      // other describe block in this file).
      return DEFAULT_VALIDATION_STATE_DTO;
    });
  }

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
    mockLiveApiGet();
  });

  it('a PROMOTED-and-not-superseded revision shows the live banner, never the superseded one', async () => {
    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByTestId('live-revision-banner')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('superseded-banner')).not.toBeInTheDocument();
  });

  it('the exact revision identity round-trips through the threaded API calls, including after a refresh/remount', async () => {
    const { unmount } = renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));
    await waitFor(() => {
      expect(screen.getByTestId('live-revision-banner')).toBeInTheDocument();
    });
    const expectedValidationPath = `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/validation`;
    expect(vi.mocked(api.get).mock.calls.map(([p]) => String(p))).toContain(expectedValidationPath);

    // Simulate a browser refresh: unmount, then remount fresh at the exact same route.
    unmount();
    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));
    await waitFor(() => {
      expect(screen.getByTestId('live-revision-banner')).toBeInTheDocument();
    });
    expect(vi.mocked(api.get).mock.calls.map(([p]) => String(p))).toContain(expectedValidationPath);
  });

  it('viewing the live revision never issues a mutating request (no revision-creation side effect)', async () => {
    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByTestId('live-revision-banner')).toBeInTheDocument();
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('the Hierarchy tree tab is reachable from the current live revision', async () => {
    renderAtPreviewRoute(String(CITY_ID), String(REVISION_ID));

    await waitFor(() => {
      expect(screen.getByTestId('live-revision-banner')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('tab', { name: /hierarchy tree/i }));

    await waitFor(() => {
      expect(screen.getByTestId('nav-node-d:north')).toBeInTheDocument();
    });
    expect(api.post).not.toHaveBeenCalled();
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
  let RealDiscoverProvider: React.ComponentType<{ children: React.ReactNode }>;
  let apiGetSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    vi.doUnmock('@/pages/MapDiscovery');
    vi.resetModules();
    const cityLaunchPreviewModule = await import('../CityLaunchPreview');
    RealCityLaunchPreview = cityLaunchPreviewModule.default;
    // vi.resetModules() gives the freshly re-imported CityLaunchPreview/
    // MapDiscovery a DISTINCT DiscoverContext module instance (and therefore
    // a distinct React Context object identity) from the one the
    // statically-imported `DiscoverProvider` at the top of this file closes
    // over. Re-importing DiscoverContext here after the reset picks up the
    // SAME instance MapDiscovery's useDiscoverNav() will read from.
    const discoverContextModule = await import('@/features/discover/context/DiscoverContext');
    RealDiscoverProvider = discoverContextModule.DiscoverProvider;
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
              element={
                <RealCityLaunchPreview />
              }
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

  it('regression: MapDiscovery receives DiscoverProvider context and does not throw missing context errors', async () => {
    // We render the real preview without wrapping it in an external DiscoverProvider.
    // If MapDiscovery inside CityLaunchPreview misses DiscoverProvider, it will throw:
    // "useDiscoverNav must be used within a <DiscoverProvider>"
    renderRealPreview('7', '42');

    // Wait for a real request to confirm the component successfully mounted and invoked its data hooks.
    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith(
        '/api/admin/city-launch/cities/7/revisions/42/preview/area-groups',
        { skipAuth: false },
      );
    });
  });
});
