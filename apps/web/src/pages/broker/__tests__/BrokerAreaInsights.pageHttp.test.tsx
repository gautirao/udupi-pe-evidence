/**
 * #2835 (#2750 PR-6 batch A) — broker "Area insights" page over the HTTP boundary.
 * Covers the page-level rows of e2e/broker-area-insights.spec.ts (BAI-0..BAI-3) that the hook-mocked
 * BrokerAreaInsights.test.tsx cannot prove: the request the page actually makes (path derived from the route params),
 * the response -> metric-card wiring, the suppressed-null vs true-zero distinction, and the disabled CTAs.
 * (BAI-4, the anonymous redirect, lives in App.brokerWorkspaceRoutes.test.tsx.)
 *
 * What is real: BrokerAreaInsights mounted under <Route path="/broker/areas/:citySlug/:areaKey">, useBrokerAreaInsights,
 * react-query, SharedMetricCard / BrokerCountCard / LimitedDataState / AreaNextSteps / SectionCard / Breadcrumb, router.
 * What is mocked, and why (disclosed seams):
 *   - `@/lib/api` is replaced whole (the real module builds a Supabase client at import). `api.get` is served by a
 *     dispatcher that returns the RAW wire body (BrokerAreaInsightsResponse, nullable `areaLabel`) and throws on any
 *     path that is not the insights path for the route params.
 *   - `@/contexts/AuthContext` is a controllable `useAuth` (identity seam). `AppLayout` is a pass-through shell.
 * No data hook and no ui component is mocked.
 *
 * REQUEST PATH: the hook interpolates the decoded areaKey (a raw `|`) into the path without encodeURIComponent
 * (useBrokerAreaInsights.ts:24-26; follow-up filed for the owner, see the map doc). This file therefore does NOT pin
 * the raw-pipe form as a passing positive: the matcher is decode-tolerant (raw `|` and `%7C` are equivalent) and is
 * itself covered by accept AND reject cases below.
 *
 * BAI-2b-1 (UNRESOLVED, owner to rule): the legacy spec expected an h1 named exactly the raw key
 * `IN|KA|Udupi|Manipal` when areaLabel is null. The SHIPPED contract (BrokerAreaInsights.tsx:121-124) deliberately
 * humanises the last pipe segment, so the h1 is `Manipal`. The `BAI-2` test below pins the shipped contract.
 *
 * Not asserted on purpose: bearer-token attachment (api.ts is mocked); the 401 retry arm (1500 ms); any admin expectation.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BrokerAreaInsightsResponse } from '@/types/brokerAreaInsights';
import { formatPrice } from '@/lib/formatters';

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

const authState = vi.hoisted(() => ({ current: { isBroker: true, isAdmin: false, isLoading: false } }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import BrokerAreaInsights from '../BrokerAreaInsights';
import { ApiError } from '@/lib/api';

// ── decode-tolerant path matcher (with its own accept / reject self-tests below) ─────────────────
/** True iff `path` is the insights path for exactly this city + area, treating `|` and `%7C` as equivalent. */
function isInsightsPathFor(path: string, citySlug: string, areaKey: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return decoded === `/api/broker/areas/${citySlug}/${areaKey}/insights`;
}

// ── fixtures (verbatim legacy contract shapes) ──────────────────────────────────────────────────
const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENTRY = `/broker/areas/${CITY}/${encodeURIComponent(AREA_KEY)}`; // IN%7CKA%7CUdupi%7CManipal

const HAPPY: BrokerAreaInsightsResponse = {
  citySlug: CITY,
  areaKey: AREA_KEY,
  areaLabel: 'Manipal',
  available: true,
  confidenceLabel: 'Enough data',
  area: {
    medianPricePaise: { value: 650_000_000, confidenceLabel: 'Enough data' },
    dominantPropertyType: { value: 'Apartment', confidenceLabel: 'Enough data' },
    activeListingCount: { value: 34, confidenceLabel: 'Enough data' },
    freshListingCount: { value: 8, confidenceLabel: 'Enough data' },
    avgListingQuality: { value: 3.7, confidenceLabel: 'Enough data' },
    topBuyerNeedSignalCount: { value: 12, confidenceLabel: 'Enough data' },
  },
  broker: { liveListingsInArea: 3, listingsNeedingAttention: 1, enquiriesOnBrokerListings: 7, opportunitiesToAct: 2 },
};

const LIMITED: BrokerAreaInsightsResponse = {
  citySlug: CITY,
  areaKey: AREA_KEY,
  areaLabel: null,
  available: false,
  confidenceLabel: 'Not enough data yet',
  area: {
    medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
    dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
    activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
    topBuyerNeedSignalCount: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  broker: { liveListingsInArea: 0, listingsNeedingAttention: 0, enquiriesOnBrokerListings: 0, opportunitiesToAct: 0 },
};

// ── fake server ─────────────────────────────────────────────────────────────────────────────────
let body: BrokerAreaInsightsResponse;
let failsLeft: { n: number; status: number };

beforeEach(() => {
  vi.clearAllMocks();
  authState.current = { isBroker: true, isAdmin: false, isLoading: false };
  body = HAPPY;
  failsLeft = { n: 0, status: 500 };
  mockApi.get.mockImplementation(async (path: string) => {
    if (!isInsightsPathFor(path, CITY, AREA_KEY)) throw new Error(`fake api: unexpected GET ${path}`);
    if (failsLeft.n > 0) {
      failsLeft.n -= 1;
      throw new ApiError(`API request failed: ${failsLeft.status}`, failsLeft.status, null);
    }
    return JSON.parse(JSON.stringify(body));
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
function Probe() {
  const loc = useLocation();
  return <div data-testid="probe" data-pathname={loc.pathname} />;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ENTRY]}>
        <Probe />
        <Routes>
          <Route path="/broker/areas/:citySlug/:areaKey" element={<BrokerAreaInsights />} />
          <Route path="/broker/listings/new" element={<div data-testid="at-new-listing" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const probePath = () => screen.getByTestId('probe').getAttribute('data-pathname');

/** The CardContent (value container) of a labelled card inside a labelled group. */
function cardIn(groupLabel: string, label: string): HTMLElement {
  const group = screen.getByLabelText(groupLabel);
  return within(group).getByText(label).parentElement!.parentElement as HTMLElement;
}

function expectNoClientBrokerId() {
  const all = JSON.stringify([mockApi.get.mock.calls, mockApi.post.mock.calls, mockApi.delete.mock.calls]);
  expect(all).toContain('insights'); // control: the serialisation really contains the call
  expect(all).not.toMatch(/broker_?id|brokerId/i);
}

async function loaded() {
  return screen.findByRole('heading', { level: 1, name: 'Manipal' });
}

describe('BrokerAreaInsights over HTTP (#2835)', () => {
  // ── BAI-0 / BAI-1: happy path ────────────────────────────────────────────────────────────────
  it('BAI-0/1: the page requests the insights path derived from the route params (one GET, no options) and renders h1, breadcrumb and confidence badge from the response', async () => {
    renderPage();
    const h1 = await loaded();

    expect(mockApi.get).toHaveBeenCalledTimes(1);
    const call = mockApi.get.mock.calls[0];
    expect(call).toHaveLength(1); // no second argument
    expect(isInsightsPathFor(call[0] as string, CITY, AREA_KEY)).toBe(true);
    expectNoClientBrokerId();

    // breadcrumb last segment is scoped to the breadcrumb nav (the legacy `.first()` was satisfied by the h1)
    const crumbs = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(crumbs).getByText('Dashboard')).toBeInTheDocument();
    expect(within(crumbs).getByText('Manipal')).toBeInTheDocument();
    // confidence badge sits in the page header next to the h1
    expect(within(h1.parentElement as HTMLElement).getByText('Enough data')).toBeInTheDocument();
  });

  it('BAI-1b: shared area metrics show the response VALUES in the right cards (exact, scoped), and no card is in the suppressed state', async () => {
    renderPage();
    await loaded();

    expect(within(cardIn('Shared area metrics', 'Median price')).getByText(formatPrice(650_000_000 / 100))).toBeInTheDocument();
    expect(within(cardIn('Shared area metrics', 'Dominant property type')).getByText('Apartment')).toBeInTheDocument();
    expect(within(cardIn('Shared area metrics', 'Active listings (area)')).getByText('34')).toBeInTheDocument();
    expect(within(cardIn('Shared area metrics', 'Fresh listings (7d)')).getByText('8')).toBeInTheDocument();
    expect(within(cardIn('Shared area metrics', 'Avg listing quality')).getByText('3.7')).toBeInTheDocument();
    expect(within(cardIn('Shared area metrics', 'Top buyer need signals')).getByText('12')).toBeInTheDocument();
    expect(screen.queryAllByTestId('suppressed-metric-label')).toHaveLength(0);

    // the buyer-demand preview takes the same value
    expect(
      screen.getByText('12 active buyer signals detected — possible opportunities for your listings'),
    ).toBeInTheDocument();
  });

  it('BAI-1c: broker-own counts show the response VALUES in the right cards; none is a true-zero card', async () => {
    renderPage();
    await loaded();

    expect(within(cardIn('Broker listing health', 'Live listings here')).getByText('3')).toBeInTheDocument();
    expect(within(cardIn('Broker listing health', 'Need attention')).getByText('1')).toBeInTheDocument();
    expect(within(cardIn('Broker listing health', 'Enquiries on your listings')).getByText('7')).toBeInTheDocument();
    expect(within(cardIn('Broker listing health', 'Opportunities to act')).getByText('2')).toBeInTheDocument();
    expect(screen.queryAllByTestId('broker-true-zero')).toHaveLength(0);
  });

  it('BAI-1d: the enabled CTAs point at the right routes (href parsed, area key decoded)', async () => {
    renderPage();
    await loaded();

    const view = screen.getByTestId('cta-view-public-area');
    expect(view).toHaveTextContent('View public area page');
    const url = new URL(view.getAttribute('href') as string, 'http://x');
    expect(url.pathname).toBe('/trends');
    expect(url.searchParams.get('city')).toBe(CITY);
    expect(url.searchParams.get('areaKey')).toBe(AREA_KEY); // decodes to IN|KA|Udupi|Manipal whichever encoding is used

    const add = screen.getByTestId('cta-add-listing');
    expect(add).toHaveTextContent('Add listing in this area');
    expect(add).toHaveAttribute('href', '/broker/listings/new');

    const quality = screen.getByTestId('cta-listing-quality');
    expect(quality).toHaveTextContent('Open listing quality for Manipal');
    expect(quality).toHaveAttribute('href', '/broker/listing-quality');
  });

  // ── BAI-2: limited data ──────────────────────────────────────────────────────────────────────
  it('BAI-2: available=false shows the limited-data notice, the h1 is the SHIPPED humanised "Manipal" (not the raw key), 6 suppressed labels (never 0) and 4 true-zero cards', async () => {
    body = LIMITED;
    renderPage();
    const h1 = await loaded();

    // BAI-2b-1 (UNRESOLVED, owner): the shipped heading contract, BrokerAreaInsights.tsx:121-124
    expect(h1.textContent).toBe('Manipal');
    expect(h1.textContent).not.toContain('|');
    expect(screen.queryByRole('heading', { level: 1, name: AREA_KEY })).toBeNull();

    const notice = screen.getByTestId('limited-data-state');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent('Not enough data yet');
    expect(notice).toHaveTextContent('area intelligence snapshot for Manipal is not yet available');

    // six shared metrics, all suppressed: the label, never a 0
    const suppressed = screen.getAllByTestId('suppressed-metric-label');
    expect(suppressed).toHaveLength(6);
    for (const el of suppressed) expect(el.textContent).toBe('Not enough data yet');
    expect(within(screen.getByLabelText('Shared area metrics')).queryByText('0')).toBeNull();

    // four broker-own true zeros: the numeral 0 plus broker-action framing, never the suppressed label
    const zeros = screen.getAllByTestId('broker-true-zero');
    expect(zeros).toHaveLength(4);
    for (const z of zeros) {
      expect(within(z).getByText('0')).toBeInTheDocument();
      expect(within(z).queryByTestId('suppressed-metric-label')).toBeNull();
    }
    expect(within(zeros[0]).getByText('No live listings here yet — add one')).toBeInTheDocument();
    expect(screen.queryAllByTestId('suppressed-metric-label')).toHaveLength(6); // control: still present elsewhere in the same render
  });

  it('BAI-2 (control): the happy fixture shows NO limited-data notice', async () => {
    renderPage();
    await loaded();
    expect(screen.queryByTestId('limited-data-state')).toBeNull();
  });

  // ── BAI-3: disabled CTAs ─────────────────────────────────────────────────────────────────────
  it('BAI-3: "View demand gaps" and "Compare areas" are disabled <button>s with no href and a "(coming soon)" label; clicking them does not navigate, while clicking an enabled CTA does', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const start = probePath();

    for (const [testId, name] of [
      ['cta-demand-gaps-disabled', 'View demand gaps — coming soon'],
      ['cta-compare-areas-disabled', 'Compare areas — coming soon'],
    ] as const) {
      const btn = screen.getByTestId(testId);
      expect(btn).toBeVisible();
      expect(btn).toBeDisabled();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).not.toHaveAttribute('href');
      expect(btn).toBe(screen.getByRole('button', { name }));
      expect(within(btn).getByText('(coming soon)')).toBeInTheDocument();
      await user.click(btn);
      expect(probePath()).toBe(start); // no navigation
    }

    // control: the probe CAN move - an enabled CTA navigates
    await user.click(screen.getByTestId('cta-add-listing'));
    expect(await screen.findByTestId('at-new-listing')).toBeInTheDocument();
    expect(probePath()).toBe('/broker/listings/new');
  });

  // ── error arms (500 / 403: not retried) ──────────────────────────────────────────────────────
  it('GET 500: shows the failure alert naming the area and a Retry button, never the metrics; Retry recovers', async () => {
    const user = userEvent.setup();
    failsLeft = { n: 1, status: 500 };
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Could not load area insights for ${AREA_KEY}. Please try again.`);
    expect(screen.queryByLabelText('Shared area metrics')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(mockApi.get).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });

  it('GET 403: a permanent denial shows the same failure alert after exactly one request (not retried)', async () => {
    failsLeft = { n: 5, status: 403 };
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load area insights');
    expect(mockApi.get).toHaveBeenCalledTimes(1);
  });
});

// ── the matcher is itself tested: ACCEPT and REJECT ─────────────────────────────────────────────
describe('isInsightsPathFor (decode-tolerant matcher self-test)', () => {
  it.each([
    ['raw pipes', '/api/broker/areas/udupi/IN|KA|Udupi|Manipal/insights'],
    ['percent-encoded pipes', '/api/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal/insights'],
    ['lower-case percent-encoding', '/api/broker/areas/udupi/IN%7cKA%7cUdupi%7cManipal/insights'],
  ])('ACCEPTS %s', (_n, path) => {
    expect(isInsightsPathFor(path, CITY, AREA_KEY)).toBe(true);
  });

  it.each([
    ['wrong city', '/api/broker/areas/mangalore/IN%7CKA%7CUdupi%7CManipal/insights'],
    ['wrong area', '/api/broker/areas/udupi/IN%7CKA%7CUdupi%7CKadri/insights'],
    ['extra trailing segment', '/api/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal/insights/extra'],
    ['a different endpoint suffix', '/api/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal/insights-v2'],
    ['a broker id query', '/api/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal/insights?broker_id=x'],
    ['a broker id segment', '/api/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal/broker-1/insights'],
    ['double-encoded pipes', '/api/broker/areas/udupi/IN%257CKA%257CUdupi%257CManipal/insights'],
    ['malformed encoding', '/api/broker/areas/udupi/%E0%A4%A/insights'],
  ])('REJECTS %s', (_n, path) => {
    expect(isInsightsPathFor(path, CITY, AREA_KEY)).toBe(false);
  });
});
