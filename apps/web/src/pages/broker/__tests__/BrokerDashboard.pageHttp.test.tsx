/**
 * #2835 (#2750 PR-6 batch A) — broker dashboard over the HTTP boundary.
 * Covers the page-level rows of e2e/broker-dashboard-v2.spec.ts (BD1, BD2, BD3) that the hook-mocked
 * BrokerDashboard.v2.test.tsx cannot prove: the endpoints, the hook -> page wiring, and the raw-body -> view-model
 * mapping.
 *
 * What is real: BrokerDashboard, useBrokerDashboardData, useBrokerQualitySummary / useBrokerMyListings (incl. the
 * PageResponse -> view-model mapper), react-query, DashboardSummary / DashboardNavigation / DashboardRecentActivity /
 * DashboardTrust / TrustProgressPanel, the router.
 * What is mocked, and why (disclosed seams):
 *   - `@/lib/api` is replaced whole (the real module builds a Supabase client at import). `api.get` is served by a
 *     path dispatcher that returns RAW wire-shape bodies: BrokerQualitySummaryResponse as the backend sends it, and
 *     PageResponse { content, page: { size, number, totalElements, totalPages } } for the recent listings, and the
 *     TrustProgressResponse for /api/listings/<id>/trust-progress. An unexpected path throws loudly.
 *   - `@/contexts/AuthContext` is a controllable `useAuth` (identity seam; the dealer/broker -> isBroker role mapping
 *     is not exercised here).
 *   - `@/components/layout/AppLayout` is a pass-through shell (the real one needs the full provider stack).
 * No data hook and no ui component is mocked.
 *
 * Not asserted on purpose: bearer-token attachment (api.ts is mocked); any admin expectation (owner ruling pending).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BrokerQualitySummaryResponse, ListingResponse } from '@/hooks/useBrokerListings';

// ── seams ───────────────────────────────────────────────────────────────────────────────────────
const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return { api: mockApi, ApiError: MockApiError };
});

const authState = vi.hoisted(() => ({
  current: {} as {
    isBroker: boolean;
    isAdmin: boolean;
    isLoading: boolean;
    userRole: string | null;
    user: { id: string; user_metadata: { full_name: string } } | null;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import BrokerDashboard from '../BrokerDashboard';
import { ApiError } from '@/lib/api';

// ── stateful fake server (RAW wire shapes) ──────────────────────────────────────────────────────
const QUALITY_PATH = '/api/listings/mine/quality-summary';
const RECENT_PATH = '/api/listings/mine?page=0&size=5';

function qualitySummary(overrides: Partial<BrokerQualitySummaryResponse> = {}): BrokerQualitySummaryResponse {
  return {
    portfolio: { activeListings: 2, totalListings: 5 },
    quality: {
      state: 'COMPLETE',
      averageQualityScore: 78,
      countComputed: 5,
      countTotal: 5,
      percentageComputed: 100,
    },
    actionSignals: {
      needsFixes: { count: 3, state: 'COMPLETE' },
      missingLocation: { count: 4, state: 'COMPLETE' },
      incomplete: { count: 2, state: 'COMPLETE' },
      buyerReady: { count: 6, state: 'COMPLETE' },
    },
    engagement: { state: 'UNAVAILABLE', views: null, enquiries: null, reason: 'Engagement tracking is not yet available.' },
    demandGap: { state: 'LIMITED_DATA', signal: null, reason: 'Not enough data to compute demand gaps.' },
    ...overrides,
  };
}

function listingRow(over: Record<string, unknown>): ListingResponse {
  return {
    id: 'row',
    displayId: 'L-1',
    title: 'Row',
    locality: 'Manipal',
    status: 'DRAFT',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-02T10:00:00Z',
    ...over,
  } as unknown as ListingResponse;
}

interface FakeServer {
  quality: BrokerQualitySummaryResponse;
  recent: ListingResponse[];
  trust: unknown;
  failQuality: number | null;
  failRecent: number | null;
}
let server: FakeServer;

function resetServer(over: Partial<FakeServer> = {}) {
  server = {
    quality: qualitySummary(),
    recent: [],
    trust: { badges: [], cta: null },
    failQuality: null,
    failRecent: null,
    ...over,
  };
}

function installFake() {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === QUALITY_PATH) {
      if (server.failQuality !== null) throw new ApiError(`API request failed: ${server.failQuality}`, server.failQuality, null);
      return JSON.parse(JSON.stringify(server.quality));
    }
    if (path === RECENT_PATH) {
      if (server.failRecent !== null) throw new ApiError(`API request failed: ${server.failRecent}`, server.failRecent, null);
      return {
        content: JSON.parse(JSON.stringify(server.recent)),
        page: { size: 5, number: 0, totalElements: server.recent.length, totalPages: server.recent.length ? 1 : 0 },
      };
    }
    const trust = /^\/api\/listings\/([^/]+)\/trust-progress$/.exec(path);
    if (trust) return JSON.parse(JSON.stringify(server.trust));
    throw new Error(`fake api: unexpected GET ${path}`);
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
function Probe() {
  const loc = useLocation();
  return <div data-testid="probe" data-pathname={loc.pathname} data-search={loc.search} />;
}

function setAuth(over: Partial<typeof authState.current> = {}) {
  authState.current = {
    isBroker: true,
    isAdmin: false,
    isLoading: false,
    userRole: 'broker',
    user: { id: 'broker-uid-1', user_metadata: { full_name: 'Test Broker' } },
    ...over,
  };
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/broker/dashboard']}>
        <Probe />
        <Routes>
          <Route path="/broker/dashboard" element={<BrokerDashboard />} />
          <Route path="/" element={<div data-testid="at-home" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function summaryRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Portfolio summary' });
}

/** The CardContent (value container) that holds a label span, scoped to a root. */
function cardOf(root: HTMLElement, label: string): HTMLElement {
  return within(root).getByText(label).parentElement!.parentElement as HTMLElement;
}

function expectNoClientBrokerId() {
  const all = JSON.stringify([mockApi.get.mock.calls, mockApi.post.mock.calls, mockApi.delete.mock.calls]);
  expect(all).toContain(QUALITY_PATH); // control: the serialisation really contains the calls
  expect(all).not.toMatch(/broker_?id|brokerId/i);
  expect(all).not.toContain('broker-uid-1'); // the signed-in user's actual id value never rides on a request
  expect(all).not.toMatch(/user_?id|userId|owner_?id/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth();
  resetServer();
  installFake();
});

describe('BrokerDashboard over HTTP (#2835)', () => {
  // ── BD1: the broker stays on the dashboard and the 5 summary cards come from the response ─────
  it('BD1: a broker stays on /broker/dashboard and the five summary cards render their labels and VALUES from the quality-summary response', async () => {
    renderDashboard();

    expect(await within(await screen.findByRole('region', { name: 'Portfolio summary' })).findByText('Active Listings')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveAttribute('data-pathname', '/broker/dashboard'); // not redirected
    expect(screen.queryByTestId('at-home')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome back, Test Broker');

    const region = summaryRegion();
    // label + the value that flowed from the response (distinct numbers, so a mis-wired prop cannot hide)
    const active = cardOf(region, 'Active Listings');
    expect(within(active).getByText('2')).toBeInTheDocument();
    expect(within(active).getByText('of 5 total')).toBeInTheDocument();

    const quality = cardOf(region, 'Avg Quality');
    expect(within(quality).getByText('78')).toBeInTheDocument();
    expect(within(quality).getByText('/ 100 avg quality')).toBeInTheDocument();

    const fixes = cardOf(region, 'Needs Fixes');
    expect(within(fixes).getByText('3')).toBeInTheDocument();

    const location = cardOf(region, 'Missing Location');
    expect(within(location).getByText('4')).toBeInTheDocument();

    const ready = cardOf(region, 'Buyer-Ready');
    expect(within(ready).getByText('6')).toBeInTheDocument();

    // exact requests: the two dashboard endpoints, nothing else (no featured listing => no trust request)
    const paths = mockApi.get.mock.calls.map((c) => c[0]).sort();
    expect(paths).toEqual([RECENT_PATH, QUALITY_PATH].sort());
    expect(mockApi.get.mock.calls.every((c) => c.length === 1)).toBe(true); // no options argument
    expectNoClientBrokerId();
  });

  it('BD1 (error): a failing quality-summary shows the error cards and a Retry button, never the labels; Retry recovers', async () => {
    const user = userEvent.setup();
    server.failQuality = 500;
    renderDashboard();

    const retry = await screen.findByRole('button', { name: 'Retry quality summary' });
    expect(within(summaryRegion()).queryByText('Active Listings')).toBeNull();
    expect(within(summaryRegion()).getAllByText('Quality failed')).toHaveLength(2);
    expect(screen.getByText('Could not load action signals.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome back, Test Broker'); // page shell survives

    server.failQuality = null;
    await user.click(retry);
    expect(await within(summaryRegion()).findByText('Active Listings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry quality summary' })).toBeNull();
  });

  it('BD1 (guard): a signed-in non-broker is sent to / and NO dashboard request is made', async () => {
    setAuth({ isBroker: false, userRole: 'user' });
    renderDashboard();

    expect(await screen.findByTestId('at-home')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveAttribute('data-pathname', '/');
    expect(screen.queryByRole('region', { name: 'Portfolio summary' })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('BD1 (loading): while auth is loading neither the page nor any request appears', async () => {
    setAuth({ isLoading: true, isBroker: false });
    renderDashboard();

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByTestId('at-home')).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  // ── BD2: action cards + workspaces ────────────────────────────────────────────────────────────
  it('BD2: "Start here today" and "Broker workspaces" headings, the "Possible demand gap" tile, and the limited-data / coming-soon copy from each of its two sources', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { level: 2, name: 'Start here today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Broker workspaces' })).toBeInTheDocument();

    // the action cards exist only when the summary arrived from the real hook
    const actions = screen.getByRole('heading', { level: 2, name: 'Start here today' }).closest('section')!;
    expect(await within(actions).findByText('Possible demand gap')).toBeInTheDocument();
    expect(within(actions).getByText('Limited data — more signals coming soon')).toBeInTheDocument(); // action-card source
    expect(within(actions).getByText('Verify exact locations')).toBeInTheDocument();
    expect(within(actions).getByText('4 listings have missing or approximate location')).toBeInTheDocument();
    expect(within(actions).getByText('Finish incomplete listings')).toBeInTheDocument();
    expect(within(actions).getByText('2 drafts still in progress')).toBeInTheDocument();

    // the nav-card source of "limited data" and the engagement copy (separate sources: either alone must redden)
    const nav = screen.getByRole('heading', { level: 2, name: 'Broker workspaces' }).closest('section')!;
    expect(within(nav).getByText('Demand Gaps')).toBeInTheDocument();
    expect(within(nav).getByText('Limited data — coming in a future update')).toBeInTheDocument(); // nav-card source
    expect(within(nav).getByText('Engagement')).toBeInTheDocument();
    expect(within(nav).getByText('Engagement tracking coming soon')).toBeInTheDocument();
    // the two coming-soon cards are NOT links; the two live workspaces are
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/broker/listings',
      '/broker/listings?status=DRAFT',
    ]);
  });

  it('BD2 (no data): without the quality-summary the "Possible demand gap" tile is absent (it exists only when the hook delivers a summary)', async () => {
    server.failQuality = 500;
    renderDashboard();

    await screen.findByRole('button', { name: 'Retry quality summary' });
    expect(screen.queryByText('Possible demand gap')).toBeNull();
    // control: the static nav-card source still renders, so the page is mounted
    expect(screen.getByText('Limited data — coming in a future update')).toBeInTheDocument();
  });

  // ── BD3: "Details coming soon" is a label, not a link ─────────────────────────────────────────
  it('BD3: the quality card shows a "Details coming soon" label that is NOT a link to /broker/listing-quality, while the same grid DOES link to /broker/listings?status=LIVE', async () => {
    renderDashboard();

    const label = await within(await screen.findByRole('region', { name: 'Portfolio summary' })).findByText('Details coming soon');
    expect(label).toBeVisible();
    expect(label.closest('a')).toBeNull();

    const grid = summaryRegion().querySelector('[aria-live="polite"]') as HTMLElement;
    expect(grid).not.toBeNull();
    const hrefs = within(grid).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/broker/listings?status=LIVE'); // positive control: links ARE rendered in this grid
    expect(hrefs).not.toContain('/broker/listing-quality');
    expect(document.querySelector('a[href="/broker/listing-quality"]')).toBeNull();
  });

  // ── recent activity + the featured-listing trust request ─────────────────────────────────────
  it('recent activity: the PageResponse rows are mapped (status label, title, link target); a LIVE row triggers exactly one trust-progress GET and a trust section', async () => {
    server.recent = [
      listingRow({ id: 'live-1', title: 'Sea view villa', status: 'LIVE' }),
      listingRow({ id: 'draft-1', title: 'Half-done flat', status: 'DRAFT', locality: 'Kadri' }),
    ];
    server.trust = {
      badges: [
        { dimensionType: 'IDENTITY', badgeState: 'AVAILABLE', grantedAt: null, autoGranted: null, rejectionReason: null },
      ],
      cta: 'IDENTITY',
    };
    renderDashboard();

    const live = await screen.findByRole('link', { name: /Sea view villa/ });
    expect(live).toHaveAttribute('href', '/listing/live-1');
    expect(within(live).getByText('Live')).toBeInTheDocument();
    const draft = screen.getByRole('link', { name: /Half-done flat/ });
    expect(draft).toHaveAttribute('href', '/broker/listings/draft-1/edit');
    expect(within(draft).getByText('Draft')).toBeInTheDocument();
    expect(within(draft).getByText('Kadri')).toBeInTheDocument();

    expect(await screen.findByText('Trust Progress — Sea view villa')).toBeInTheDocument();
    expect(screen.getByText('Complete your trust verification to rank higher in buyer searches.', { exact: false })).toBeInTheDocument();
    const trustCalls = mockApi.get.mock.calls.filter((c) => c[0] === '/api/listings/live-1/trust-progress');
    expect(trustCalls).toEqual([['/api/listings/live-1/trust-progress']]);
    expectNoClientBrokerId();
  });

  it('recent activity (empty): zero rows show the empty state with a Create Listing link', async () => {
    renderDashboard();
    expect(await screen.findByText('No listings yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Listing' })).toHaveAttribute('href', '/broker/listings/new');
  });

  it('recent activity (error): a failing recent request shows "Failed to load recent listings" and Try again, while the summary cards still render', async () => {
    server.failRecent = 500;
    renderDashboard();

    expect(await screen.findByText('Failed to load recent listings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(await within(summaryRegion()).findByText('Active Listings')).toBeInTheDocument(); // independent queries
  });
});
