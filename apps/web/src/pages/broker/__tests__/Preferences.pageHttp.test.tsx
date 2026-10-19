/**
 * #2835 (#2750 PR-6 batch A) — broker Preferences ("Market Focus") page over the HTTP boundary.
 * Covers the page-level rows of e2e/broker-preferences.spec.ts (BP2, BP3, BP5) that the hook-mocked
 * Preferences.test.tsx cannot prove: the endpoint paths, the request bodies, the hook -> page wiring, and the
 * real Radix AlertDialog behaviour (`alertdialog` role). The add flow (BP4) is NOT covered, see the spike verdict.
 *
 * What is real: BrokerPreferences, useBrokerMarketFocus (+ add/remove/seed mutations), react-query, the real
 * ui/select (rendered, never opened), ui/alert-dialog, ui/toast (a real <Toaster/> renders the hooks' toasts), EmptyState, router.
 * What is mocked, and why (disclosed seams):
 *   - `@/lib/api` is replaced whole (the real module builds a Supabase client at import): `api.get/post/delete`
 *     are served by a stateful in-memory fake that returns RAW wire-shape bodies (MarketFocusItem[] incl. citySlug,
 *     `{ inserted }`, ApiError with a numeric status). An unexpected method/path throws loudly.
 *   - `@/contexts/AuthContext` is a controllable `useAuth` (identity seam; role mapping is not exercised here).
 *   - `@/components/layout/AppLayout` is a pass-through shell (the real one needs the full provider stack).
 * No data hook and no ui component is mocked.
 *
 * REAL-SELECT SPIKE VERDICT (BP4-c / add flow NOT covered here): driving the real Radix Select (open -> pick) in this
 * jsdom/vitest environment is not deterministic. After a Select opens, awaiting any macrotask (findBy*, userEvent,
 * waitFor) stalls the worker for ~13 s per open (3 picks ~ 44 s; the precedent CommercialListingForm.parity.test.tsx
 * is itself 9/23 red at the default 5 s timeout here). Per the owner decision the Select is NOT stubbed, so the
 * add flow (POST body {areaKey, propertyType, listingPurpose} without citySlug, POST 422 toast, add -> invalidate ->
 * refetch) is left UNCOVERED by this file and stays with the legacy E2E (BP4-c, BP4-e..j). The real Radix AlertDialog
 * (remove flow, BP5) is deterministic and covered.
 *
 * Not asserted on purpose: "no GET for a plain user" (the hook has no `enabled` gate; it fires before the page's
 * own Navigate), and any bearer-token behaviour (api.ts is mocked).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import type { MarketFocusItem } from '@/hooks/useBrokerMarketFocus';
import { Toaster } from '@/components/ui/toaster';

// ── seams ───────────────────────────────────────────────────────────────────────────────────────
const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/api', () => {
  // distinct local name: a factory-local `ApiError` collides with this file's `import { ApiError }` rewrite
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
  current: { isBroker: true, isAdmin: false, isLoading: false, user: { id: 'broker-uid-1' } } as {
    isBroker: boolean;
    isAdmin: boolean;
    isLoading: boolean;
    user: { id: string } | null;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// jsdom lacks the pointer-capture / scrollIntoView APIs Radix calls (precedent:
// components/broker/__tests__/CommercialListingForm.parity.test.tsx:101-112). Kept from the Select spike; the
// real AlertDialog is exercised with them in place.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Import after mocks
import BrokerPreferences from '../Preferences';

// ── stateful fake server (RAW wire shapes) ──────────────────────────────────────────────────────
const PATH = '/api/broker/market-focus';
const SEED_PATH = '/api/broker/market-focus/seed';

const SEEDED_MANIPAL: MarketFocusItem = {
  citySlug: 'Udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  propertyType: 'house',
  listingPurpose: 'sale',
  source: 'seeded',
  createdAt: '2026-10-01T10:00:00Z',
};
const MANUAL_KADRI: MarketFocusItem = {
  citySlug: 'Mangalore',
  areaKey: 'IN|KA|Mangalore|Kadri',
  propertyType: 'apartment',
  listingPurpose: 'rent',
  source: 'manual',
  createdAt: '2026-10-02T10:00:00Z',
};

interface FakeServer {
  rows: MarketFocusItem[];
  /** Fail the next N GETs with this status. */
  getFailures: { left: number; status: number };
  /** When set, DELETE throws this status (and, for 404, the row is gone server-side). */
  deleteStatus: number | null;
  seedRows: MarketFocusItem[];
}

let server: FakeServer;

function resetServer(rows: MarketFocusItem[] = []) {
  server = {
    rows: rows.map((r) => ({ ...r })),
    getFailures: { left: 0, status: 500 },
    deleteStatus: null,
    seedRows: [],
  };
}

function fail(status: number): never {
  throw new ApiError(`API request failed: ${status}`, status, null);
}

function installFake() {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path !== PATH) throw new Error(`fake api: unexpected GET ${path}`);
    if (server.getFailures.left > 0) {
      server.getFailures.left -= 1;
      fail(server.getFailures.status);
    }
    return server.rows.map((r) => ({ ...r }));
  });
  mockApi.post.mockImplementation(async (path: string) => {
    if (path === SEED_PATH) {
      server.rows.push(...server.seedRows);
      return { inserted: server.seedRows.length };
    }
    throw new Error(`fake api: unexpected POST ${path}`);
  });
  mockApi.delete.mockImplementation(async (path: string, options?: { body?: string }) => {
    if (path !== PATH) throw new Error(`fake api: unexpected DELETE ${path}`);
    if (!options?.body) throw new Error('fake api: DELETE without a body');
    const t = JSON.parse(options.body) as Pick<MarketFocusItem, 'citySlug' | 'areaKey' | 'propertyType' | 'listingPurpose'>;
    const keep = server.rows.filter(
      (r) =>
        !(
          r.citySlug === t.citySlug &&
          r.areaKey === t.areaKey &&
          r.propertyType === t.propertyType &&
          r.listingPurpose === t.listingPurpose
        ),
    );
    const removed = keep.length !== server.rows.length;
    if (server.deleteStatus !== null) {
      if (server.deleteStatus === 404) server.rows = keep; // already gone server-side
      fail(server.deleteStatus);
    }
    if (!removed) fail(404);
    server.rows = keep;
    return undefined;
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh per test
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/broker/preferences']}>
        <Routes>
          <Route path="/broker/preferences" element={<BrokerPreferences />} />
          <Route path="/broker/setup" element={<div data-testid="at-setup" />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

/** The whole serialised argument list of every api call: the client must never send a broker id. */
function expectNoClientBrokerId() {
  const all = JSON.stringify([mockApi.get.mock.calls, mockApi.post.mock.calls, mockApi.delete.mock.calls]);
  expect(all).toContain(PATH); // control: the serialisation really contains the calls
  expect(all).not.toMatch(/broker_?id|brokerId/i);
  expect(all).not.toContain('broker-uid-1'); // the signed-in user's actual id value never rides on a request
  expect(all).not.toMatch(/user_?id|userId|owner_?id/i);
}

/** The row element (outer flex container) for an area label inside the focus list. */
function rowFor(label: string): HTMLElement {
  const list = screen.getByLabelText('Market focus areas');
  const labelEl = within(list).getByText(label);
  return labelEl.parentElement!.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.current = { isBroker: true, isAdmin: false, isLoading: false, user: { id: 'broker-uid-1' } };
  resetServer();
  installFake();
});

// ── BP2: list from GET ──────────────────────────────────────────────────────────────────────────
describe('BrokerPreferences over HTTP (#2835)', () => {
  it('BP2: GET /api/broker/market-focus rows reach the page - heading, re-seed button, seeded + manual rows, remove only on manual', async () => {
    resetServer([SEEDED_MANIPAL, MANUAL_KADRI]);
    renderPage();

    const list = await screen.findByLabelText('Market focus areas');
    expect(screen.getByRole('heading', { level: 1, name: 'Market Focus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-seed focus areas from live listings' })).toBeInTheDocument();

    // exact request: one GET, exact path, no second argument
    expect(mockApi.get.mock.calls).toEqual([[PATH]]);

    // rows come from the response, with their own badge
    expect(within(list).getByText('Manipal, Udupi')).toBeInTheDocument();
    expect(within(list).getByText('Kadri, Mangalore')).toBeInTheDocument();
    expect(within(rowFor('Manipal, Udupi')).getByText('seeded')).toBeInTheDocument();
    expect(within(rowFor('Kadri, Mangalore')).getByText('manual')).toBeInTheDocument();

    // control + negative: only the manual row can be removed
    expect(screen.getByRole('button', { name: /remove focus area: kadri/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove focus area: manipal/i })).toBeNull();
    expect(screen.queryByTestId('empty-state-description')).toBeNull();
    expectNoClientBrokerId();
  });

  // ── BP3: empty state ──────────────────────────────────────────────────────────────────────────
  it('BP3: an empty GET shows the empty state - description (seed|add), seed button, "Add a listing" link - and no list', async () => {
    renderPage();

    const description = await screen.findByTestId('empty-state-description');
    expect(description).toBeVisible();
    expect(description).toHaveTextContent(/seed|add/i);
    expect(description).toHaveTextContent('Seed from your live listings to get started, or add focus areas manually above.');
    expect(screen.getByRole('button', { name: /^seed from my listings$/i })).toBeVisible();
    const addListing = screen.getByRole('link', { name: 'Add a listing' });
    expect(addListing).toBeVisible();
    expect(addListing).toHaveAttribute('href', '/broker/listings/new');
    expect(screen.queryByLabelText('Market focus areas')).toBeNull();
    expect(mockApi.get.mock.calls).toEqual([[PATH]]);

    // add form is present (rendered only; the real Select is never opened, see the spike verdict above)
    expect(screen.getByRole('heading', { level: 3, name: 'Add Focus Area' })).toBeInTheDocument();
    for (const name of ['Select area', 'Select property type', 'Select listing purpose']) {
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled(); // nothing chosen yet
  });

  // ── BP5: remove through the real Radix AlertDialog ────────────────────────────────────────────
  it('BP5: removing a manual row opens a real alertdialog and DELETEs the FULL tuple (incl. server-resolved citySlug); the row disappears and the empty state returns', async () => {
    const user = userEvent.setup();
    resetServer([MANUAL_KADRI]);
    renderPage();

    const list = await screen.findByLabelText('Market focus areas');
    expect(within(list).getByText('Kadri, Mangalore')).toBeInTheDocument(); // positive control before the click

    await user.click(screen.getByRole('button', { name: /remove focus area: kadri/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/remove focus area/i);
    expect(mockApi.delete).not.toHaveBeenCalled(); // nothing is sent until confirmed

    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledTimes(1));
    const call = mockApi.delete.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(PATH);
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({
      citySlug: 'Mangalore',
      areaKey: 'IN|KA|Mangalore|Kadri',
      propertyType: 'apartment',
      listingPurpose: 'rent',
    });

    // invalidate -> refetch -> render
    expect(await screen.findByTestId('empty-state-description')).toBeVisible();
    expect(screen.queryByText(/kadri/i)).toBeNull();
    expect(screen.queryByLabelText('Market focus areas')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText('Focus area removed')).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expectNoClientBrokerId();
  });

  it('BP5 (cancel): Cancel closes the alertdialog without sending a DELETE, and the row stays', async () => {
    const user = userEvent.setup();
    resetServer([MANUAL_KADRI]);
    renderPage();
    await screen.findByLabelText('Market focus areas');

    await user.click(screen.getByRole('button', { name: /remove focus area: kadri/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockApi.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Kadri, Mangalore')).toBeInTheDocument();
  });

  // ── seed ──────────────────────────────────────────────────────────────────────────────────────
  it('seed: the empty-state "Seed from my listings" POSTs the seed path with no body, toasts the count, and the refetched list shows the seeded rows', async () => {
    const user = userEvent.setup();
    server.seedRows = [SEEDED_MANIPAL, { ...SEEDED_MANIPAL, propertyType: 'land' }];
    renderPage();
    await screen.findByTestId('empty-state-description');

    await user.click(screen.getByRole('button', { name: /^seed from my listings$/i }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
    expect(mockApi.post.mock.calls[0]).toEqual([SEED_PATH]); // exactly one argument: no body, no options
    expect(await screen.findByText('Seeded 2 focus areas from your listings')).toBeInTheDocument();
    const list = await screen.findByLabelText('Market focus areas');
    expect(within(list).getAllByText('Manipal, Udupi')).toHaveLength(2);
    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expectNoClientBrokerId();
  });

  // ── error arms ────────────────────────────────────────────────────────────────────────────────
  it('GET 500: shows the failure alert and no list or seed button; Retry refetches and recovers', async () => {
    const user = userEvent.setup();
    resetServer([MANUAL_KADRI]);
    server.getFailures = { left: 1, status: 500 };
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load market focus preferences. Please try again.');
    expect(screen.queryByLabelText('Market focus areas')).toBeNull();
    expect(screen.queryByRole('button', { name: /re-seed focus areas/i })).toBeNull();
    expect(mockApi.get).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole('button', { name: /retry/i }));

    expect(await screen.findByLabelText('Market focus areas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });

  it('GET 403: shows the access-denied alert (not the generic failure text)', async () => {
    server.getFailures = { left: 1, status: 403 };
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Access denied. Broker or admin role required.');
    expect(alert).not.toHaveTextContent(/failed to load/i);
  });

  it('DELETE 404: "Already removed" toast and a refetch that makes the list match the server (row gone)', async () => {
    const user = userEvent.setup();
    resetServer([MANUAL_KADRI]);
    server.deleteStatus = 404;
    renderPage();
    await screen.findByLabelText('Market focus areas');

    await user.click(screen.getByRole('button', { name: /remove focus area: kadri/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^remove$/i }));

    expect(await screen.findByText('Already removed')).toBeInTheDocument();
    expect(screen.getByText(/no longer exists/i)).toBeInTheDocument();
    expect(await screen.findByTestId('empty-state-description')).toBeVisible();
    expect(mockApi.delete).toHaveBeenCalledTimes(1);
    expect(mockApi.get).toHaveBeenCalledTimes(2); // the 404 branch invalidates -> refetch
    expect(screen.queryByText('Focus area removed')).toBeNull();
  });

  // ── page guard ────────────────────────────────────────────────────────────────────────────────
  it('page guard: a signed-in non-broker, non-admin is sent to /broker/setup and never sees the page', async () => {
    authState.current = { isBroker: false, isAdmin: false, isLoading: false, user: null };
    renderPage();

    expect(await screen.findByTestId('at-setup')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /market focus/i })).toBeNull();
    expect(screen.queryByLabelText('Market focus areas')).toBeNull();
  });
});
