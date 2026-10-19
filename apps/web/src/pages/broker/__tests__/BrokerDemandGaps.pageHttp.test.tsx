/**
 * #2835 (#2750 PR-6 batch A) — broker "Demand Gaps" page over the HTTP boundary.
 * Covers the page-level rows of e2e/broker-demand-gaps.spec.ts (DG1-DG7) that the hook-mocked
 * BrokerDemandGaps.test.tsx cannot prove: the endpoint paths, the dismiss POST, the hook -> page wiring, and the
 * identity rule (the client never sends a broker id: it is JWT-derived server-side).
 *
 * What is real: BrokerDemandGaps, useBrokerDemandGaps (+ mark-read / dismiss mutations, incl. the invalidate ->
 * refetch chain), react-query, DemandSummaryCards / TopGapCards / AllGapsTable / CaptureDemandSection / SignalLegend,
 * the real ui/select (rendered), router.
 * What is mocked, and why (disclosed seams):
 *   - `@/lib/api` is replaced whole (the real module builds a Supabase client at import). `api.get/post` are served by
 *     a dispatcher that returns RAW wire-shape bodies (DemandGapsResponse with Metric { value, confidenceLabel }) and
 *     throws on any unexpected path. An unexpected path therefore reddens the test instead of silently passing.
 *   - `@/contexts/AuthContext` is a controllable `useAuth` (identity seam; role mapping not exercised here).
 *   - `@/components/layout/AppLayout` is a pass-through shell.
 * No data hook and no ui component is mocked.
 *
 * Legacy weaknesses tightened (see docs/testing/e2e-retirement-map-pr6a.md): DG1 "signal legend" (legacy `.first()`
 * matched a top-card badge; the legend has no such text), DG2 null-state (legacy locator was unsatisfiable),
 * DG4a (legacy bounds [1,2] -> exact 2 dismiss / 1 mark-as-read), DG6b (both sort directions, exact row count).
 *
 * DG6a (filter) - see the `describe` at the bottom for what is and is not covered and why.
 * Not asserted on purpose: bearer-token attachment (api.ts is mocked); any admin expectation (owner ruling pending).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DemandGapsResponse, GapItem } from '@/hooks/useBrokerDemandGaps';
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

// jsdom lacks the pointer-capture / scrollIntoView APIs Radix calls (precedent:
// components/broker/__tests__/CommercialListingForm.parity.test.tsx:101-112).
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import BrokerDemandGaps from '../BrokerDemandGaps';
import { ApiError } from '@/lib/api';

// ── fixtures (verbatim legacy contract shapes) ──────────────────────────────────────────────────
const GAPS_PATH = '/api/broker/demand-gaps';
const KORA = 'Koramangala|Bangalore South|Bangalore';
const HSR = 'HSR Layout|Bangalore South|Bangalore';
const INDI = 'Indiranagar|Bangalore East|Bangalore';

const GAP_KORA: GapItem = {
  id: 'gap-uuid-1',
  areaKey: KORA,
  propertyType: 'APARTMENT',
  listingPurpose: 'SALE',
  budgetBand: '50L-75L',
  week: '2026-06-16',
  gapScore: { value: 8.4, confidenceLabel: 'Score available' },
  signalType: 'supply_gap',
  actionType: 'add_listing',
  confidence: { value: 'High', confidenceLabel: 'Confidence: High' },
  buyerEnquiries: { value: 12, confidenceLabel: 'Buyer enquiries available' },
  brokerLiveCount: 2,
  readAt: null,
  dismissedAt: null,
};

const GAP_HSR_NULL: GapItem = {
  id: null,
  areaKey: HSR,
  propertyType: 'VILLA',
  listingPurpose: 'RENT',
  budgetBand: '25K-40K',
  week: '2026-06-16',
  gapScore: { value: null, confidenceLabel: 'Insufficient data' },
  signalType: 'possible_gap',
  actionType: 'review_gap',
  confidence: { value: null, confidenceLabel: 'Low confidence' },
  buyerEnquiries: { value: null, confidenceLabel: 'Suppressed' },
  brokerLiveCount: 0,
  readAt: null,
  dismissedAt: null,
};

const GAP_INDI: GapItem = {
  ...GAP_KORA,
  id: 'gap-uuid-2',
  areaKey: INDI,
  gapScore: { value: 3.2, confidenceLabel: 'Score available' },
  signalType: 'price_signal',
  actionType: 'improve_listing',
};

const STANDARD: DemandGapsResponse = {
  summary: {
    buyerSearches: { value: 240, confidenceLabel: 'Buyer searches available' },
    buyerEnquiries: { value: 18, confidenceLabel: 'Buyer enquiries available' },
    demandGapsFound: 5,
    brokerMatchingListings: 3,
    opportunitiesToAct: 2,
  },
  topGaps: [GAP_KORA],
  allGaps: [GAP_KORA, GAP_HSR_NULL],
  captureDemandListings: [
    {
      listingId: 'listing-uuid-1',
      title: '3BHK Apartment Koramangala',
      areaKey: KORA,
      propertyType: 'APARTMENT',
      listingPurpose: 'SALE',
      pricePaise: 750000000,
      qualityScore: 72,
    },
  ],
};

const NULL_METRICS: DemandGapsResponse = {
  ...STANDARD,
  summary: {
    buyerSearches: { value: null, confidenceLabel: 'Insufficient data' },
    buyerEnquiries: { value: null, confidenceLabel: 'Insufficient data' },
    demandGapsFound: 0,
    brokerMatchingListings: 0,
    opportunitiesToAct: 0,
  },
  topGaps: [],
  captureDemandListings: [],
};

const EMPTY: DemandGapsResponse = {
  summary: {
    buyerSearches: { value: 0, confidenceLabel: 'Buyer searches available' },
    buyerEnquiries: { value: 0, confidenceLabel: 'Buyer enquiries available' },
    demandGapsFound: 0,
    brokerMatchingListings: 0,
    opportunitiesToAct: 0,
  },
  topGaps: [],
  allGaps: [],
  captureDemandListings: [],
};

// ── fake server ─────────────────────────────────────────────────────────────────────────────────
let body: DemandGapsResponse;
let getFailStatus: number | null;

function installFake() {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path !== GAPS_PATH) throw new Error(`fake api: unexpected GET ${path}`);
    if (getFailStatus !== null) throw new ApiError(`API request failed: ${getFailStatus}`, getFailStatus, null);
    return JSON.parse(JSON.stringify(body));
  });
  mockApi.post.mockImplementation(async (path: string) => {
    if (!/^\/api\/broker\/alerts\/[^/?#]+\/(read|dismiss)$/.test(path)) throw new Error(`fake api: unexpected POST ${path}`);
    return undefined;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.current = { isBroker: true, isAdmin: false, isLoading: false };
  body = STANDARD;
  getFailStatus = null;
  installFake();
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
      <MemoryRouter initialEntries={['/broker/demand-gaps']}>
        <Probe />
        <Routes>
          <Route path="/broker/demand-gaps" element={<BrokerDemandGaps />} />
          <Route path="/" element={<div data-testid="at-home" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const gapsGetCount = () => mockApi.get.mock.calls.filter(([p]) => p === GAPS_PATH).length;

/** The whole serialised argument list of every api call: the client must never send a broker id. */
function expectNoClientBrokerId() {
  const all = JSON.stringify([mockApi.get.mock.calls, mockApi.post.mock.calls, mockApi.delete.mock.calls]);
  expect(all).toContain(GAPS_PATH); // control: the serialisation really contains the calls
  expect(all).not.toMatch(/broker_?id|brokerId/i);
}

/** The CardContent that holds a summary-card label, scoped to the summary grid. */
function summaryCard(label: string): HTMLElement {
  const grid = document.querySelector('[aria-live="polite"]') as HTMLElement;
  return within(grid).getByText(label).parentElement!.parentElement as HTMLElement;
}

async function loaded() {
  return screen.findByRole('cell', { name: KORA });
}

describe('BrokerDemandGaps over HTTP (#2835)', () => {
  // ── DG1 ─────────────────────────────────────────────────────────────────────────────────────
  it('DG1: a broker stays on /broker/demand-gaps and the page renders heading, 5 summary cards with their VALUES, priority card, table, capture section', async () => {
    renderPage();
    await loaded();

    expect(screen.getByTestId('probe')).toHaveAttribute('data-pathname', '/broker/demand-gaps'); // not redirected
    expect(screen.getByRole('heading', { level: 1, name: 'Demand Gaps' })).toBeInTheDocument();

    // 5 summary cards: exact label + the value that flowed from the response
    expect(within(summaryCard('Buyer Searches')).getByText('240')).toBeInTheDocument();
    expect(within(summaryCard('Buyer Enquiries')).getByText('18')).toBeInTheDocument();
    expect(within(summaryCard('Demand Gaps')).getByText('5')).toBeInTheDocument();
    expect(within(summaryCard('Your Listings')).getByText('3')).toBeInTheDocument();
    expect(within(summaryCard('Act Now')).getByText('2')).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 2, name: 'Priority Signals' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Listing' })).toBeInTheDocument(); // supply_gap / add_listing top card
    expect(screen.getByRole('heading', { level: 2, name: 'All Demand Gaps' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: KORA })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: HSR })).toBeInTheDocument();

    // capture-demand section: title, derived price, quality, improve link
    expect(screen.getByRole('heading', { level: 2, name: 'Your Matching Listings — Improve to Capture Demand' })).toBeInTheDocument();
    expect(screen.getByText('3BHK Apartment Koramangala')).toBeInTheDocument();
    expect(screen.getByText(formatPrice(750000000 / 100))).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Improve Listing' })).toHaveAttribute('href', '/broker/listings/listing-uuid-1/edit');
  });

  it('DG1 (legend): the "About these signals" legend is its own region with the confidence levels; the "Supply Gap" text is a badge elsewhere, NOT the legend', async () => {
    renderPage();
    await loaded();

    const legend = screen.getByRole('region', { name: 'About these signals' });
    expect(within(legend).getByRole('heading', { level: 3, name: 'About these signals' })).toBeInTheDocument();
    expect(within(legend).getByText('Confidence levels')).toBeInTheDocument();
    for (const level of ['High', 'Medium', 'Low', 'Suppressed']) {
      expect(within(legend).getByText(level)).toBeInTheDocument();
    }
    // the legacy `getByText(/supply gap/i).first()` was satisfied by these two badges, not by the legend
    expect(within(legend).queryByText('Supply Gap')).toBeNull();
    expect(screen.getAllByText('Supply Gap')).toHaveLength(2); // top-card badge + table-row badge
  });

  // ── DG2 ─────────────────────────────────────────────────────────────────────────────────────
  it('DG2: a null Metric renders its confidenceLabel (testid metric-null-state) and NEVER a big 0; plain-number cards DO render 0 (control)', async () => {
    body = NULL_METRICS;
    renderPage();
    await loaded();

    for (const label of ['Buyer Searches', 'Buyer Enquiries']) {
      const card = summaryCard(label);
      expect(within(card).getByTestId('metric-null-state')).toHaveTextContent('Insufficient data');
      expect(within(card).queryByText('0')).toBeNull();
      expect(card.querySelector('p.text-3xl')).toBeNull();
    }
    // control: the three always-present plain numbers are genuinely 0 in this fixture and are rendered as 0
    for (const label of ['Demand Gaps', 'Your Listings', 'Act Now']) {
      expect(within(summaryCard(label)).getByText('0')).toBeInTheDocument();
      expect(within(summaryCard(label)).queryByTestId('metric-null-state')).toBeNull();
    }
  });

  // ── DG3 ─────────────────────────────────────────────────────────────────────────────────────
  it.each([
    ['add_listing', 'Add Listing'],
    ['improve_listing', 'Improve Listing'],
    ['review_gap', 'Review Gap'],
  ] as const)('DG3 (%s): the top-gap card shows exactly the "%s" button and neither of the other two', async (actionType, label) => {
    const gap: GapItem = { ...GAP_KORA, actionType };
    body = { ...STANDARD, topGaps: [gap], allGaps: [gap], captureDemandListings: [] };
    renderPage();
    await loaded();

    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1); // positive control
    for (const other of ['Add Listing', 'Improve Listing', 'Review Gap'].filter((l) => l !== label)) {
      expect(screen.queryByRole('button', { name: other })).toBeNull();
    }
  });

  // ── DG4a / DG4b ─────────────────────────────────────────────────────────────────────────────
  it('DG4a: dismiss / mark-as-read controls exist only for gaps with an id - EXACTLY 2 dismiss (top card + row) and 1 mark-as-read (row only); id==null contributes none', async () => {
    const topNull: GapItem = { ...GAP_HSR_NULL };
    body = { ...STANDARD, topGaps: [GAP_KORA, topNull], captureDemandListings: [] };
    renderPage();
    await loaded();

    expect(screen.getAllByRole('button', { name: 'Dismiss gap' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(1);
    // control: the id==null gap IS on the page (as a top card and a table row), only its controls are absent
    expect(screen.getByRole('cell', { name: HSR })).toBeInTheDocument();
    expect(screen.getAllByText(HSR)).toHaveLength(2);
  });

  it('DG4b: clicking Dismiss POSTs exactly /api/broker/alerts/gap-uuid-1/dismiss (no body, no broker id) and then refetches the gaps (GET count 1 -> 2)', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(gapsGetCount()).toBe(1);

    await user.click(screen.getAllByRole('button', { name: 'Dismiss gap' })[0]);

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
    expect(mockApi.post.mock.calls).toEqual([['/api/broker/alerts/gap-uuid-1/dismiss']]); // exactly one argument
    await waitFor(() => expect(gapsGetCount()).toBe(2)); // positive control: invalidate -> refetch
    expectNoClientBrokerId();
  });

  it('DG4b (mark read): the row Mark-as-read POSTs /api/broker/alerts/gap-uuid-1/read with no broker id', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Mark as read' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
    expect(mockApi.post.mock.calls).toEqual([['/api/broker/alerts/gap-uuid-1/read']]);
    expectNoClientBrokerId();
  });

  // ── DG5 ─────────────────────────────────────────────────────────────────────────────────────
  it('DG5: empty gaps render the two EmptyStates and "signals found" with a plain 0, and no gap rows', async () => {
    body = EMPTY;
    renderPage();

    expect(await screen.findByText('No demand gaps found')).toBeInTheDocument();
    expect(screen.getByText('No priority gaps right now')).toBeInTheDocument();
    expect(screen.getByText('signals found')).toBeInTheDocument();
    expect(within(summaryCard('Demand Gaps')).getByText('0')).toBeInTheDocument();
    expect(screen.queryAllByRole('cell')).toHaveLength(0);
    expect(screen.queryByRole('cell', { name: KORA })).toBeNull();
    expect(screen.queryByText('Your Matching Listings — Improve to Capture Demand')).toBeNull();
  });

  // ── DG6b: sort ──────────────────────────────────────────────────────────────────────────────
  it('DG6b: the Gap Score sort toggles aria-sort and the row ORDER in both directions; the null-score row stays last each time; exactly 3 data rows', async () => {
    const user = userEvent.setup();
    body = { ...STANDARD, topGaps: [], captureDemandListings: [], allGaps: [GAP_KORA, GAP_INDI, GAP_HSR_NULL] };
    renderPage();
    await loaded();

    const rowAreas = () =>
      screen
        .getAllByRole('row')
        .slice(1) // header
        .map((r) => within(r).getAllByRole('cell')[0].textContent);
    const th = () => screen.getByRole('button', { name: /^Sort by gap score, currently/ }).closest('th')!;

    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3
    expect(screen.getByRole('button', { name: 'Sort by gap score, currently descending' })).toBeInTheDocument();
    expect(th()).toHaveAttribute('aria-sort', 'descending');
    expect(rowAreas()).toEqual([KORA, INDI, HSR]);

    await user.click(screen.getByRole('button', { name: 'Sort by gap score, currently descending' }));
    expect(screen.getByRole('button', { name: 'Sort by gap score, currently ascending' })).toBeInTheDocument();
    expect(th()).toHaveAttribute('aria-sort', 'ascending');
    expect(rowAreas()).toEqual([INDI, KORA, HSR]);

    await user.click(screen.getByRole('button', { name: 'Sort by gap score, currently ascending' }));
    expect(th()).toHaveAttribute('aria-sort', 'descending');
    expect(rowAreas()).toEqual([KORA, INDI, HSR]);
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  // ── DG7: identity ───────────────────────────────────────────────────────────────────────────
  it('DG7: the page makes exactly one GET with exactly the path /api/broker/demand-gaps (no query, no options) and NO call carries a broker id', async () => {
    renderPage();
    await loaded();

    expect(mockApi.get.mock.calls).toEqual([[GAPS_PATH]]);
    expect(mockApi.post).not.toHaveBeenCalled();
    expectNoClientBrokerId();
  });

  // ── error / guards ──────────────────────────────────────────────────────────────────────────
  it('GET 500: shows the page-level failure alert, five "Failed" cards and three Retry buttons, never the table; Retry recovers', async () => {
    const user = userEvent.setup();
    getFailStatus = 500;
    renderPage();

    expect(await screen.findByText('Failed to load demand gap signals. Check your connection and try again.')).toBeInTheDocument();
    expect(screen.getAllByText('Failed')).toHaveLength(5);
    const retries = screen.getAllByRole('button', { name: 'Retry' });
    expect(retries).toHaveLength(3); // page alert + top-gaps alert + all-gaps alert
    expect(screen.queryByRole('cell', { name: KORA })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Demand Gaps' })).toBeInTheDocument();
    expect(gapsGetCount()).toBe(1);

    getFailStatus = null;
    await user.click(retries[0]);
    expect(await loaded()).toBeInTheDocument();
    expect(gapsGetCount()).toBe(2);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('guard: a signed-in non-broker is sent to / and NO GET is made (the hook is gated on the role)', async () => {
    authState.current = { isBroker: false, isAdmin: false, isLoading: false };
    renderPage();

    expect(await screen.findByTestId('at-home')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Demand Gaps' })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('guard (loading): while auth is loading there is no heading, no redirect and no GET', async () => {
    authState.current = { isBroker: false, isAdmin: false, isLoading: true };
    renderPage();

    expect(screen.queryByRole('heading', { level: 1, name: 'Demand Gaps' })).toBeNull();
    expect(screen.queryByTestId('at-home')).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});

// ── DG6a: the client-side filter ─────────────────────────────────────────────────────────────────
describe('DG6a: property-type filter is client-side (#2835)', () => {
  it('DG6a: picking APARTMENT hides the VILLA row, and the filter fires NO extra GET (count stays 1) while a dismiss DOES (count 2, positive control)', async () => {
    renderPage();
    await loaded();
    expect(gapsGetCount()).toBe(1);
    expect(screen.getByRole('cell', { name: HSR })).toBeInTheDocument(); // control: both rows before the filter

    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(3); // area, property type, budget
    const trigger = comboboxes[1];
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const option = screen.getByRole('option', { name: 'APARTMENT' });
    fireEvent.keyDown(option, { key: 'Enter' });

    expect(screen.queryByRole('cell', { name: HSR })).toBeNull();
    expect(screen.getByRole('cell', { name: KORA })).toBeInTheDocument();
    // flush microtasks so an extra fetch triggered by the filter (e.g. invalidateQueries) would have reached api.get
    await act(async () => {
      await Promise.resolve();
    });
    expect(gapsGetCount()).toBe(1);

    // positive control (same spec): a mutation that DOES invalidate moves the same counter 1 -> 2
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss gap' })[0]);
    await waitFor(() => expect(gapsGetCount()).toBe(2));
  }, 60_000);
});
