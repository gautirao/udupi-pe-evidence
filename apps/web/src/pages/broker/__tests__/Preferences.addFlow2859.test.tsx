/**
 * #2859 B1 — broker Preferences ADD flow over the HTTP boundary (BP4-e..j + the owner's POST-422 KEEP condition).
 * Replacement coverage for e2e/broker-preferences.spec.ts rows that Preferences.pageHttp.test.tsx left UNCOVERED.
 *
 * What is real: BrokerPreferences, useBrokerMarketFocus + useAddMarketFocus (react-query invalidate -> refetch),
 * the real <Toaster/> (rendered toast text, not a toast-mock call), EmptyState, router.
 * Disclosed seams:
 *   - `@/lib/api` is a stateful in-memory fake (RAW wire shapes). The POST resolves citySlug server-side and appends
 *     a `source: 'manual'` row, so the follow-up GET returns it. An unexpected method/path throws loudly.
 *   - `@/components/ui/select` is a FILE-SCOPED pass-through (always-open buttons) because opening the real Radix
 *     Select stalls the jsdom worker (~13 s per open, see Preferences.pageHttp.test.tsx header). The real-Select pick
 *     (BP4-c) is proven once, in isolation, in Preferences.realSelect2859.test.tsx.
 *   - `@/contexts/AuthContext` (identity seam) and `@/components/layout/AppLayout` (shell) as in the pageHttp file.
 * Options render as buttons AND list rows share labels, so every list query is scoped to the 'Market focus areas' list.
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

const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));

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
  useAuth: () => ({ isBroker: true, isAdmin: false, isLoading: false, user: { id: 'broker-uid-2859' } }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// File-scoped Select pass-through: every option is an always-rendered button that calls onValueChange(value).
vi.mock('@/components/ui/select', () => {
  type VC = { onValueChange?: (v: string) => void };
  const pass = (children: React.ReactNode, onValueChange?: (v: string) => void) =>
    React.Children.map(children, (child) =>
      React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<VC>, { onValueChange }) : child,
    );
  return {
    Select: ({ children, onValueChange }: { children: React.ReactNode } & VC) => <div>{pass(children, onValueChange)}</div>,
    SelectTrigger: ({ children, 'aria-label': label }: { children: React.ReactNode; 'aria-label'?: string }) => (
      <span aria-label={label}>{children}</span>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children, onValueChange }: { children: React.ReactNode } & VC) => <div>{pass(children, onValueChange)}</div>,
    SelectItem: ({ children, value, onValueChange }: { children: React.ReactNode; value: string } & VC) => (
      <button type="button" data-testid={`select-item-${value}`} onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    ),
  };
});

import BrokerPreferences from '../Preferences';

const PATH = '/api/broker/market-focus';
const KADRI_KEY = 'IN|KA|Mangalore|Kadri';

const SEEDED_MANIPAL: MarketFocusItem = {
  citySlug: 'Udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  propertyType: 'house',
  listingPurpose: 'sale',
  source: 'seeded',
  createdAt: '2026-10-01T10:00:00Z',
};

interface Server {
  rows: MarketFocusItem[];
  postStatus: number | null;
}
let server: Server;

function installFake(rows: MarketFocusItem[], postStatus: number | null = null) {
  server = { rows: rows.map((r) => ({ ...r })), postStatus };
  mockApi.get.mockImplementation(async (path: string) => {
    if (path !== PATH) throw new Error(`fake api: unexpected GET ${path}`);
    return server.rows.map((r) => ({ ...r }));
  });
  mockApi.post.mockImplementation(async (path: string, body: { areaKey: string; propertyType: string; listingPurpose: string }) => {
    if (path !== PATH) throw new Error(`fake api: unexpected POST ${path}`);
    if (server.postStatus !== null) throw new ApiError(`API request failed: ${server.postStatus}`, server.postStatus, null);
    // server resolves citySlug from areaKey (the client never sends it)
    server.rows.push({
      citySlug: body.areaKey.split('|')[2],
      areaKey: body.areaKey,
      propertyType: body.propertyType,
      listingPurpose: body.listingPurpose,
      source: 'manual',
      createdAt: '2026-10-19T10:00:00Z',
    });
    return undefined;
  });
  mockApi.delete.mockImplementation(async (path: string) => {
    throw new Error(`fake api: unexpected DELETE ${path}`);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/broker/preferences']}>
        <Routes>
          <Route path="/broker/preferences" element={<BrokerPreferences />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

const getCount = () => mockApi.get.mock.calls.filter((c) => c[0] === PATH).length;

async function pickKadriApartmentRent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId(`select-item-${KADRI_KEY}`));
  await user.click(screen.getByTestId('select-item-apartment'));
  await user.click(screen.getByTestId('select-item-rent'));
}

function rowFor(label: string): HTMLElement {
  const list = screen.getByLabelText('Market focus areas');
  return within(list).getByText(label).parentElement!.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BrokerPreferences add flow over HTTP (#2859 B1)', () => {
  it('BP4-e/f/g: Add sends exactly one POST to /api/broker/market-focus whose WHOLE body is {areaKey, propertyType, listingPurpose} (no citySlug)', async () => {
    const user = userEvent.setup();
    installFake([]);
    renderPage();
    await screen.findByTestId('empty-state-description');

    await pickKadriApartmentRent(user);
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeEnabled();
    expect(mockApi.post).toHaveBeenCalledTimes(0); // before: no POST

    await user.click(add);

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1)); // after: exactly one POST
    // exact path + exact whole body: presence of the 3 fields and absence of citySlug in one equality
    expect(mockApi.post.mock.calls).toEqual([
      [PATH, { areaKey: KADRI_KEY, propertyType: 'apartment', listingPurpose: 'rent' }],
    ]);
  });

  it('BP4-h/i: from the empty state, a successful add refetches (GET 1 -> 2) and the list appears with "Kadri, Mangalore" and a "manual" badge', async () => {
    const user = userEvent.setup();
    installFake([]);
    renderPage();

    // before: empty state, no list, one GET
    expect(await screen.findByTestId('empty-state-description')).toBeVisible();
    expect(screen.queryByLabelText('Market focus areas')).toBeNull();
    expect(getCount()).toBe(1);

    await pickKadriApartmentRent(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // follow-up read
    await waitFor(() => expect(getCount()).toBe(2));
    // after: list rendered from the refetched GET, exact label + badge
    const list = await screen.findByLabelText('Market focus areas');
    expect(within(list).getByText('Kadri, Mangalore')).toBeInTheDocument();
    expect(within(rowFor('Kadri, Mangalore')).getByText('manual')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-description')).toBeNull();
    expect(await screen.findByText('Focus area added')).toBeInTheDocument();
  });

  it('BP4-j: the added row carries "manual" while the seeded row in the SAME list carries "seeded" and no "manual" (same-test control)', async () => {
    const user = userEvent.setup();
    installFake([SEEDED_MANIPAL]);
    renderPage();

    const before = await screen.findByLabelText('Market focus areas');
    expect(within(before).getByText('Manipal, Udupi')).toBeInTheDocument();
    expect(within(before).queryByText('Kadri, Mangalore')).toBeNull();
    expect(getCount()).toBe(1);

    await pickKadriApartmentRent(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(getCount()).toBe(2));
    await waitFor(() => expect(within(screen.getByLabelText('Market focus areas')).getByText('Kadri, Mangalore')).toBeInTheDocument());

    const added = rowFor('Kadri, Mangalore');
    const seeded = rowFor('Manipal, Udupi');
    expect(within(added).getByText('manual')).toBeInTheDocument();
    expect(within(added).queryByText('seeded')).toBeNull();
    expect(within(seeded).getByText('seeded')).toBeInTheDocument();
    expect(within(seeded).queryByText('manual')).toBeNull();
  });

  it('BP-422: a POST answered 422 renders the "Unknown area" toast with the exact product copy; no refetch (GET stays 1) and the list is unchanged', async () => {
    const user = userEvent.setup();
    installFake([SEEDED_MANIPAL], 422);
    renderPage();

    const list = await screen.findByLabelText('Market focus areas');
    expect(within(list).getByText('Manipal, Udupi')).toBeInTheDocument();
    expect(getCount()).toBe(1);
    expect(screen.queryByText('Unknown area')).toBeNull();

    await pickKadriApartmentRent(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Unknown area')).toBeInTheDocument();
    expect(screen.getByText('The selected area is not recognised. Please choose a different area.')).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(getCount()).toBe(1); // no follow-up read on 422
    const after = screen.getByLabelText('Market focus areas');
    expect(within(after).getByText('Manipal, Udupi')).toBeInTheDocument(); // control: existing row still rendered
    expect(within(after).queryByText('Kadri, Mangalore')).toBeNull();
    expect(screen.queryByText('Focus area added')).toBeNull();
  });
});
