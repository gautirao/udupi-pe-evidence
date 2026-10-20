/**
 * #2859 B2 (handoff 285902) W1 — admin moderation queue over a STATEFUL in-test fake.
 * Replaces the queue-transition claims of e2e/journey/admin-moderation.spec.ts (csv190) and
 * e2e/journey/pending-approvals-review-2369.spec.ts (csv196).
 *
 * The fake backend is `server`: GET /api/admin/listings/pending returns its current rows (the GET
 * counter is asserted), and a successful approve / reject / return-for-edits removes the row, as
 * the real backend does once the status leaves PENDING_REVIEW. A transition is claimed only when
 * one it() shows the before row, the action, GET count +1, and the after state.
 *
 * Real: PendingListings page, the filters, the table, ListingReviewDrawer with the real Radix Sheet /
 * AlertDialog / Select (pointer polyfills as in PendingListings.test.tsx), TanStack Query invalidation.
 * Injected: `@/lib/api` (the fake above) and `useToast` (hoisted spy) — toast claims are the call
 * ARGUMENT only; the visible toast is not rendered here (R_toast: no real Toaster mounted).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

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

const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) } },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  },
}));

import { api, ApiError } from '@/lib/api';
import PendingListings from '../PendingListings';

function makeListing(overrides: Partial<ListingResponse>): ListingResponse {
  return {
    id: 'x', status: 'PENDING_REVIEW', propertyType: 'house', title: 'Untitled', locality: 'Manipal',
    price: 5000000, description: 'Synthetic description 2859', landArea: null, landAreaUnit: null,
    bedrooms: 3, builtArea: 1200, builtAreaUnit: 'sqft', latitude: 13.35, longitude: 74.79,
    addressConfirmed: true, imageCount: 4, firstImageUrl: 'https://example.com/p.jpg', rejectionReason: null,
    videoUrl: null, reraNumber: null, listingNumber: 2859, displayId: 'PS-2859',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', areaKey: 'KA|UDUPI|MANIPAL',
    listingPurpose: null, carpetArea: null, carpetAreaUnit: null, floorNumber: null, totalFloors: null,
    furnishingStatus: null, washrooms: null, parkingCount: null, roadFrontageFt: null, commercialUsage: null,
    numberOfUnits: null, monthlyRent: null, securityDepositMonths: null, lockInMonths: null, sellerType: null,
    earnedBadgeCount: 0, waterSource: null, soilType: null, roadAccess: null, cultivationStatus: null,
    ownershipType: null, surveyNumber: null,
    ...overrides,
  } as ListingResponse;
}

/** Stateful fake of the admin moderation backend. */
let server: ListingResponse[] = [];
let pendingGets = 0;
type PostHandler = (url: string, body: unknown) => unknown;
let onPost: PostHandler = () => ({});

function installFake(rows: ListingResponse[]) {
  server = rows;
  pendingGets = 0;
  onPost = (url) => {
    const m = url.match(/^\/api\/admin\/listings\/([^/]+)\/(approve|reject|return-for-edits)$/);
    if (m) server = server.filter((l) => l.id !== m[1]);
    return {};
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/api/admin/listings/pending')) {
      pendingGets += 1;
      return { content: [...server], page: { size: 200, number: 0, totalElements: server.length, totalPages: 1 } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
  vi.mocked(api.post).mockImplementation(async (url: string, body?: unknown) => onPost(url, body));
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/pending']}>
        <PendingListings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** R_jsdom: a real Radix Select pick takes ~15-45 s in jsdom; the reject its drive the real Select. */
const REAL_SELECT_TIMEOUT_MS = 90_000;

const toastTitles = () => mockToast.mock.calls.map((c) => (c[0] as { title?: string }).title);
const searchBox = () => screen.getByLabelText(/search title, listing id/i);

beforeEach(() => {
  mockToast.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('PendingListings — moderation transitions over a stateful fake (#2859 B2 csv190/csv196)', () => {
  it('AM1.a/AM1.d/PA0/PA1.c/PA1b.a: search narrows to the row, the drawer shows its title, approve posts only after confirm, the drawer closes, GET +1, the row leaves and the sibling stays', async () => {
    const user = userEvent.setup();
    installFake([
      makeListing({ id: 'a', title: 'Approve target 2859' }),
      makeListing({ id: 'b', title: 'Sibling listing 2859', createdAt: '2026-08-02T00:00:00Z' }),
    ]);
    renderPage();

    const rowA = await screen.findByTestId('pending-row-a');
    expect(within(rowA).getByText('Approve target 2859')).toBeInTheDocument();
    expect(within(screen.getByTestId('pending-row-b')).getByText('Sibling listing 2859')).toBeInTheDocument();

    // PA0: search narrows the queue to the one row
    await user.type(searchBox(), 'Approve target');
    expect(screen.getByTestId('pending-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-row-b')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('review-button-a'));
    const drawer = await screen.findByTestId('listing-review-drawer');
    expect(within(drawer).getByRole('heading', { name: 'Approve target 2859' })).toBeInTheDocument();

    // PA1b.a: the drawer's Approve opens the dialog only — no POST, no success toast yet
    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));
    await screen.findByRole('alertdialog');
    expect(api.post).not.toHaveBeenCalled();
    expect(toastTitles()).not.toContain('Listing approved');

    const getsBefore = pendingGets;
    await user.click(screen.getByTestId('confirm-approve-action'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/listings/a/approve'));
    await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
    await waitFor(() => expect(pendingGets).toBe(getsBefore + 1));
    await waitFor(() => expect(screen.queryByTestId('pending-row-a')).not.toBeInTheDocument());
    expect(toastTitles()).toContain('Listing approved');

    // the sibling is still queued once the search is cleared
    await user.clear(searchBox());
    expect(await screen.findByTestId('pending-row-b')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-row-a')).not.toBeInTheDocument();
  });

  it('PA1.a/PA1b.b-c/PA3.a-b: Reject listing is disabled until a reason is picked; Cancel on the approve and the reject confirm dialogs keeps the drawer and the row and posts nothing; confirming the reject then posts', async () => {
    const user = userEvent.setup();
    installFake([makeListing({ id: 'a', title: 'Cancel target 2859' })]);
    renderPage();
    await screen.findByTestId('pending-row-a');
    await user.click(screen.getByTestId('review-button-a'));
    const drawer = await screen.findByTestId('listing-review-drawer');

    // approve -> dialog -> Cancel
    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));
    const approveDialog = await screen.findByRole('alertdialog');
    expect(within(approveDialog).getByRole('heading', { name: 'Approve this listing?' })).toBeInTheDocument();
    expect(within(approveDialog).getByText(/Cancel target 2859/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    await user.click(within(approveDialog).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('listing-review-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('pending-row-a')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    // reject -> (gated until a reason is picked) -> reason -> Reject listing -> dialog -> Cancel
    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }));
    expect(within(drawer).getByRole('button', { name: /reject listing/i })).toBeDisabled();
    await user.click(within(drawer).getByLabelText('Reason'));
    await user.click(await screen.findByText('Incomplete info'));
    await user.click(within(drawer).getByRole('button', { name: /reject listing/i }));
    const rejectDialog = await screen.findByRole('alertdialog');
    await user.click(within(rejectDialog).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('listing-review-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('pending-row-a')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    // positive control: confirming the same reject does post
    await user.click(within(screen.getByTestId('listing-review-drawer')).getByRole('button', { name: /reject listing/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByTestId('confirm-reject-action'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/admin/listings/a/reject', { rejectionReason: 'INCOMPLETE_INFO' }),
    );
  }, REAL_SELECT_TIMEOUT_MS);

  it('AM2.b/AM2.d/PA3.c.1: reject with a note posts "INCOMPLETE_INFO: <note>", calls the toast, the drawer closes, GET +1 and the row leaves (sibling stays)', async () => {
    const user = userEvent.setup();
    installFake([
      makeListing({ id: 'a', title: 'Reject target 2859' }),
      makeListing({ id: 'b', title: 'Sibling listing 2859', createdAt: '2026-08-02T00:00:00Z' }),
    ]);
    renderPage();
    await screen.findByTestId('pending-row-a');
    await user.type(searchBox(), 'Reject target');
    await user.click(screen.getByTestId('review-button-a'));
    const drawer = await screen.findByTestId('listing-review-drawer');

    await user.click(within(drawer).getByRole('button', { name: /^reject$/i }));
    await user.click(within(drawer).getByLabelText('Reason'));
    await user.click(await screen.findByText('Incomplete info'));
    await user.type(within(drawer).getByLabelText('Note to broker (optional)'), 'Add the carpet area');
    await user.click(within(drawer).getByRole('button', { name: /reject listing/i }));
    expect(api.post).not.toHaveBeenCalled();

    const getsBefore = pendingGets;
    await user.click(within(await screen.findByRole('alertdialog')).getByTestId('confirm-reject-action'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/admin/listings/a/reject', {
        rejectionReason: 'INCOMPLETE_INFO: Add the carpet area',
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
    await waitFor(() => expect(pendingGets).toBe(getsBefore + 1));
    await waitFor(() => expect(screen.queryByTestId('pending-row-a')).not.toBeInTheDocument());
    expect(toastTitles()).toContain('Listing rejected');

    await user.clear(searchBox());
    expect(await screen.findByTestId('pending-row-b')).toBeInTheDocument();
  }, REAL_SELECT_TIMEOUT_MS);

  it('PA2.b/PA2.c.1: return-for-edits joins the note textarea into the payload, calls the toast, the drawer closes, GET +1 and the row leaves', async () => {
    const user = userEvent.setup();
    installFake([
      makeListing({ id: 'a', title: 'Return target 2859' }),
      makeListing({ id: 'b', title: 'Sibling listing 2859', createdAt: '2026-08-02T00:00:00Z' }),
    ]);
    renderPage();
    await screen.findByTestId('pending-row-a');
    await user.type(searchBox(), 'Return target');
    await user.click(screen.getByTestId('review-button-a'));
    const drawer = await screen.findByTestId('listing-review-drawer');

    await user.click(within(drawer).getByRole('button', { name: /return for edits/i }));
    await user.click(within(drawer).getByLabelText('Better photos required'));
    await user.type(within(drawer).getByLabelText('Note to broker (optional)'), 'Add a floor plan');

    const getsBefore = pendingGets;
    await user.click(within(drawer).getByRole('button', { name: /send back to broker/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/admin/listings/a/return-for-edits', {
        note: 'Reasons: Better photos required\n\nAdd a floor plan',
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
    await waitFor(() => expect(pendingGets).toBe(getsBefore + 1));
    await waitFor(() => expect(screen.queryByTestId('pending-row-a')).not.toBeInTheDocument());
    expect(toastTitles()).toContain('Returned for edits');

    await user.clear(searchBox());
    expect(await screen.findByTestId('pending-row-b')).toBeInTheDocument();
  });

  it('PA4.b: a stale approve (409, already processed elsewhere) refetches the queue — GET +1, the stale row disappears and the sibling stays', async () => {
    const user = userEvent.setup();
    installFake([
      makeListing({ id: 'a', title: 'Stale target 2859' }),
      makeListing({ id: 'b', title: 'Sibling listing 2859', createdAt: '2026-08-02T00:00:00Z' }),
    ]);
    // another admin already processed "a": the server no longer lists it and the approve is a 409
    onPost = (url) => {
      if (url === '/api/admin/listings/a/approve') {
        server = server.filter((l) => l.id !== 'a');
        throw new ApiError('conflict', 409, { error: 'already processed' });
      }
      return {};
    };
    renderPage();
    await screen.findByTestId('pending-row-a');
    await user.click(screen.getByTestId('review-button-a'));
    const drawer = await screen.findByTestId('listing-review-drawer');
    await user.click(within(drawer).getByRole('button', { name: /^approve$/i }));

    const getsBefore = pendingGets;
    await user.click(await screen.findByTestId('confirm-approve-action'));

    await waitFor(() => expect(toastTitles()).toContain('Already processed'));
    await waitFor(() => expect(pendingGets).toBe(getsBefore + 1));
    await waitFor(() => expect(screen.queryByTestId('pending-row-a')).not.toBeInTheDocument());
    expect(screen.getByTestId('pending-row-b')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('listing-review-drawer')).not.toBeInTheDocument());
  });
});
