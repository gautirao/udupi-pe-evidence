/**
 * #2835 (#2750 PR-6 batch A) — BD4 of e2e/broker-dashboard-v2.spec.ts: the dashboard "Drafts" workspace takes the
 * broker to /broker/listings?status=DRAFT, the landed page is "My Listings", and the status filter REACHES THE REQUEST.
 * One MemoryRouter holds the real dashboard and the real BrokerListings page, so the click really navigates and the
 * landed page really reads the search params. (No test mounted BrokerListings at all before this file.)
 *
 * What is real: BrokerDashboard + DashboardNavigation, BrokerListings, useBrokerListingsInventory,
 * useBrokerMyListingsInfinite (incl. the PageResponse mapper), react-query, router.
 * What is mocked (disclosed seams): `@/lib/api` whole, served by a path dispatcher returning RAW wire bodies
 * (BrokerQualitySummaryResponse, PageResponse); `@/contexts/AuthContext` (controllable useAuth); AppLayout (pass-through).
 *
 * Request assertions parse the path with URL / URLSearchParams (the hook builds `sort=createdAt%2Cdesc`), never a
 * regex on parameter order. The listing page itself is kept to its empty state so BrokerListingsList / the card's own
 * hooks stay out of scope. Not asserted: page-level denial of a plain `user` (BrokerListings.tsx admits userRole
 * 'user' while routeAccess denies it; only the route-guard test in App.brokerWorkspaceRoutes.test.tsx proves denial).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isBroker: true,
    isAdmin: false,
    isLoading: false,
    userRole: 'broker',
    user: { id: 'broker-uid-1', user_metadata: { full_name: 'Test Broker' } },
  }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import BrokerDashboard from '../BrokerDashboard';
import BrokerListings from '../BrokerListings';
import { ApiError } from '@/lib/api';

// ── fake server (RAW wire shapes) ───────────────────────────────────────────────────────────────
const QUALITY_BODY = {
  portfolio: { activeListings: 2, totalListings: 5 },
  quality: { state: 'COMPLETE', averageQualityScore: 78, countComputed: 5, countTotal: 5, percentageComputed: 100 },
  actionSignals: {
    needsFixes: { count: 3, state: 'COMPLETE' },
    missingLocation: { count: 4, state: 'COMPLETE' },
    incomplete: { count: 2, state: 'COMPLETE' },
    buyerReady: { count: 6, state: 'COMPLETE' },
  },
  engagement: { state: 'UNAVAILABLE', views: null, enquiries: null, reason: 'n/a' },
  demandGap: { state: 'LIMITED_DATA', signal: null, reason: 'n/a' },
};

const emptyPage = (size: number) => ({ content: [], page: { size, number: 0, totalElements: 0, totalPages: 0 } });

let inventoryFailStatus: number | null;

/** Every GET to /api/listings/mine that carries a sort param is the listings-page (infinite) query. */
function inventoryCalls(): URL[] {
  return mockApi.get.mock.calls
    .map((c) => new URL(c[0] as string, 'http://x'))
    .filter((u) => u.pathname === '/api/listings/mine' && u.searchParams.has('sort'));
}

beforeEach(() => {
  vi.clearAllMocks();
  inventoryFailStatus = null;
  mockApi.get.mockImplementation(async (path: string) => {
    const url = new URL(path, 'http://x');
    if (url.pathname === '/api/listings/mine/quality-summary') return JSON.parse(JSON.stringify(QUALITY_BODY));
    if (url.pathname === '/api/listings/mine') {
      if (url.searchParams.has('sort')) {
        if (inventoryFailStatus !== null) throw new ApiError(`API request failed: ${inventoryFailStatus}`, inventoryFailStatus, null);
        return emptyPage(Number(url.searchParams.get('size')));
      }
      return emptyPage(5); // the dashboard's recent-activity query (no sort)
    }
    throw new Error(`fake api: unexpected GET ${path}`);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
function Probe() {
  const loc = useLocation();
  return <div data-testid="probe" data-pathname={loc.pathname} data-search={loc.search} />;
}

function renderAt(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/broker/dashboard" element={<BrokerDashboard />} />
          <Route path="/broker/listings" element={<BrokerListings />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function location() {
  const probe = screen.getByTestId('probe');
  return { pathname: probe.getAttribute('data-pathname'), search: new URLSearchParams(probe.getAttribute('data-search') ?? '') };
}

/** The broker is identified server-side from the JWT: no id key, no id VALUE (broker-uid-1), no user/owner id on any request. */
function expectNoIdentityOnTheWire() {
  expect(mockApi.get.mock.calls.length).toBeGreaterThan(0); // positive control: calls were captured
  const wire = JSON.stringify(mockApi.get.mock.calls);
  expect(wire).not.toMatch(/broker_?id|brokerId/i);
  expect(wire).not.toContain('broker-uid-1');
  expect(wire).not.toMatch(/user_?id|userId|owner_?id/i);
}

describe('Dashboard -> BrokerListings (BD4, #2835)', () => {
  it('BD4: clicking the "Drafts" workspace lands on /broker/listings?status=DRAFT, shows "My Listings", and the request carries status=DRAFT', async () => {
    const user = userEvent.setup();
    renderAt('/broker/dashboard');

    const drafts = await screen.findByRole('link', { name: 'Drafts Continue editing unpublished listings' });
    expect(location().pathname).toBe('/broker/dashboard'); // before the click
    expect(inventoryCalls()).toHaveLength(0); // the listings page has not been mounted yet

    await user.click(drafts);

    expect(await screen.findByRole('heading', { level: 1, name: 'My Listings' })).toBeInTheDocument();
    expect(location().pathname).toBe('/broker/listings');
    expect(location().search.get('status')).toBe('DRAFT');

    await waitFor(() => expect(inventoryCalls().length).toBeGreaterThanOrEqual(1));
    for (const u of inventoryCalls()) {
      expect(u.searchParams.get('status')).toBe('DRAFT'); // the filter reaches the request
      expect(u.searchParams.get('page')).toBe('0');
      expect(u.searchParams.get('size')).toBe('20');
      expect(u.searchParams.get('sort')).toBe('createdAt,desc'); // decoded from sort=createdAt%2Cdesc
      expect([...u.searchParams.keys()].sort()).toEqual(['page', 'size', 'sort', 'status']); // the FULL key set, nothing extra
    }
    expect(await screen.findByText('No draft listings')).toBeInTheDocument(); // the DRAFT chip's empty state
    expectNoIdentityOnTheWire();
  });

  it('BD4 (control): clicking "My Listings" lands on /broker/listings with NO status, and the request carries none (so the DRAFT assertion above can fail)', async () => {
    const user = userEvent.setup();
    renderAt('/broker/dashboard');

    await user.click(await screen.findByRole('link', { name: 'My Listings Browse and manage all listings' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'My Listings' })).toBeInTheDocument();
    expect(location().pathname).toBe('/broker/listings');
    expect(location().search.has('status')).toBe(false);
    await waitFor(() => expect(inventoryCalls().length).toBeGreaterThanOrEqual(1));
    for (const u of inventoryCalls()) {
      expect(u.searchParams.has('status')).toBe(false);
      expect([...u.searchParams.keys()].sort()).toEqual(['page', 'size', 'sort']); // the FULL key set, nothing extra
    }
    expect(await screen.findByText('No listings yet')).toBeInTheDocument();
    expectNoIdentityOnTheWire();
  });

  it('BD4 (deep link): entering /broker/listings?status=LIVE directly requests status=LIVE', async () => {
    renderAt('/broker/listings?status=LIVE');

    expect(await screen.findByRole('heading', { level: 1, name: 'My Listings' })).toBeInTheDocument();
    await waitFor(() => expect(inventoryCalls().length).toBeGreaterThanOrEqual(1));
    for (const u of inventoryCalls()) expect(u.searchParams.get('status')).toBe('LIVE');
    expect(await screen.findByText('No live listings')).toBeInTheDocument();
  });

  it('BD4 (error): a failing listings request shows "Failed to load your listings." with Try again, never the empty state', async () => {
    inventoryFailStatus = 500;
    renderAt('/broker/listings?status=DRAFT');

    expect(await screen.findByText('Failed to load your listings.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('No draft listings')).toBeNull();
    expect(within(document.body).getByRole('heading', { level: 1, name: 'My Listings' })).toBeInTheDocument();
  });
});
