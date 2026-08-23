import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import BrokerBookings from '../BrokerBookings';
import {
  useConfirmBooking,
  useDeclineBooking,
  useCancelBooking,
  BookingResponse,
} from '@/hooks/useBookings';

// ─── Why this file exists (#2282, regression guard for #2278) ─────────────────
//
// #2278 fixed `useBrokerBookings` to read the real backend envelope's `.items`
// key instead of the never-existent `.content` key. Prior coverage
// (useBrokerBookings.envelope.test.tsx) exercised the hook in isolation, but
// nothing rendered the actual `BrokerBookings` page against the real hook, so
// a future regression in the page/hook wiring could slip through unnoticed.
// This file renders the real page with the real (unmocked) `useBrokerBookings`
// hook, mocking only `api.get` at the network boundary — never the hook's
// return value — so the real unmarshalling logic runs on every case.
//
// ─── Negative-control pairing rule (orchestrator amendment) ───────────────────
//
// A redirected page, a spinner-only render, and a query that never fired all
// produce the same "no rows, empty states visible" output as a genuine empty
// response. So every test in this file that asserts an ABSENCE (no row
// rendered, an empty-state string, etc.) is paired with a positive assertion
// that `api.get` was actually invoked with the expected endpoint — proving the
// query fired and the component reached its real data-driven render path,
// rather than a guard/loading short-circuit that would trivially satisfy the
// absence assertion for the wrong reason.

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());
const mockConfirmMutate = vi.fn();
const mockDeclineMutate = vi.fn();
const mockCancelMutate = vi.fn();

// api.ts imports the real supabase client module at top level (for
// getAuthToken); stub it so importOriginal() below doesn't try to construct a
// real client, which throws without VITE_SUPABASE_URL in this test environment.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { ...actual.api, get: mockApiGet },
  };
});

// Only the mutation hooks are mocked — useBrokerBookings runs for real against
// the mocked api.get response above. NEVER mock useBrokerBookings' return
// value; that would bypass the exact unmarshalling layer #2278 fixed.
vi.mock('@/hooks/useBookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBookings')>();
  return {
    ...actual,
    useConfirmBooking: vi.fn(),
    useDeclineBooking: vi.fn(),
    useCancelBooking: vi.fn(),
  };
});

// useBrokerBookings is gated on `enabled: !!user && (isBroker || isAdmin)`, and
// the page redirects when `!isBroker && !isAdmin && userRole !== 'user'`, and
// shows a spinner while `isLoading` is true. Any of those states short-circuit
// the render before the real data path runs, which is why the risk scan called
// this out as the top vacuity trap for this file.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'broker-1' },
    isBroker: true,
    isAdmin: false,
    isLoading: false,
    userRole: 'broker',
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Typed against the FE `BookingResponse` interface (which is missing
// `cancellationReason` relative to the backend DTO — a known, pre-existing,
// out-of-scope gap). Building fixtures from this type, rather than the full
// backend DTO, keeps that gap from forcing a production edit here.
const makeBooking = (overrides: Partial<BookingResponse>): BookingResponse => ({
  id: 'booking-1',
  listingId: 'listing-abc',
  requesterId: 'user-1',
  brokerId: 'broker-1',
  requestedDate: '2026-03-01',
  requestedTimeSlot: '10:00-11:00',
  status: 'REQUESTED',
  requesterMessage: null,
  declineReason: null,
  cancelledBy: null,
  createdAt: '2026-02-01T10:00:00Z',
  updatedAt: '2026-02-01T10:00:00Z',
  ...overrides,
});

/**
 * Builds the REAL five-key `PagedResponse` envelope the backend actually
 * sends (`items` + flat `page`/`size`/`totalElements`/`totalPages`).
 * Deliberately does NOT include `content` or a nested `pageable` — those keys
 * do not exist on the real backend response, and the #2278 bug was caused by
 * the hook assuming they did.
 */
function makePagedResponse(items: BookingResponse[]) {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  };
}

/**
 * The legacy Spring `Page<T>` shape (`content` + nested `page`), which has NO
 * `items` key at all. This is the exact shape that #2278 fixed
 * `useBrokerBookings` to stop assuming. Used only by the permanent
 * negative-control test (AC7).
 */
function makeLegacyContentResponse(items: BookingResponse[]) {
  return {
    content: items,
    page: {
      size: 20,
      number: 0,
      totalElements: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderBrokerBookings(initialEntries: string[] = ['/broker/bookings']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <BrokerBookings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useConfirmBooking).mockReturnValue({
    mutate: mockConfirmMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useConfirmBooking>);
  vi.mocked(useDeclineBooking).mockReturnValue({
    mutate: mockDeclineMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useDeclineBooking>);
  vi.mocked(useCancelBooking).mockReturnValue({
    mutate: mockCancelMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCancelBooking>);
});

describe('BrokerBookings page', () => {
  // AC2 (no filter) + endpoint-call proof reused by other cases below.
  it('calls /api/bookings/broker with no filter when no listingId is present', async () => {
    mockApiGet.mockResolvedValueOnce(makePagedResponse([]));

    renderBrokerBookings(['/broker/bookings']);

    expect(await screen.findByText('No pending booking requests.')).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith('/api/bookings/broker');
    expect(screen.getByRole('heading', { name: 'Booking Requests' })).toBeInTheDocument();
  });

  // AC2 (listingId filter)
  it('calls /api/bookings/broker?listingId=<id> when ?listingId is present in the URL', async () => {
    mockApiGet.mockResolvedValueOnce(makePagedResponse([]));

    renderBrokerBookings(['/broker/bookings?listingId=listing-filter-target']);

    expect(await screen.findByText('No pending booking requests.')).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/bookings/broker?listingId=listing-filter-target',
    );
    expect(
      screen.getByRole('heading', { name: 'Booking Requests — This Listing' }),
    ).toBeInTheDocument();
  });

  // AC3 + AC4: real five-key envelope, one booking per section, distinct
  // date/time/listing values per section so assertions are unambiguous.
  it('renders broker-relevant details for a populated real five-key envelope, one booking per section', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([
        makeBooking({
          id: 'booking-pending',
          status: 'REQUESTED',
          requestedDate: '2026-05-01',
          requestedTimeSlot: '09:00-10:00',
          requesterMessage: 'Looking forward to the visit',
        }),
        makeBooking({
          id: 'booking-needs-resolution',
          status: 'NEEDS_RESOLUTION',
          listingId: 'listing-needs-resolution-id',
          requestedDate: '2026-05-02',
          requestedTimeSlot: '10:00-11:00',
        }),
        makeBooking({
          id: 'booking-confirmed',
          status: 'CONFIRMED',
          requestedDate: '2026-05-03',
          requestedTimeSlot: '11:00-12:00',
        }),
      ]),
    );

    renderBrokerBookings();

    // Pending Requests section
    expect(await screen.findByText('2026-05-01')).toBeInTheDocument();
    expect(screen.getByText('09:00-10:00')).toBeInTheDocument();
    expect(screen.getByText('“Looking forward to the visit”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();

    // Needs Resolution section
    expect(screen.getByText('2026-05-02')).toBeInTheDocument();
    expect(screen.getByText('10:00-11:00')).toBeInTheDocument();
    expect(screen.getByText('On Hold')).toBeInTheDocument();
    const viewListingLink = screen.getByRole('link', { name: 'View Listing' });
    expect(viewListingLink).toHaveAttribute('href', '/listing/listing-needs-resolution-id');

    // Confirmed Bookings section
    expect(screen.getByText('2026-05-03')).toBeInTheDocument();
    expect(screen.getByText('11:00-12:00')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // AC5, paired with the call-fired proof per the negative-control pairing rule.
  it('renders all three empty-state strings for an empty items array', async () => {
    mockApiGet.mockResolvedValueOnce(makePagedResponse([]));

    renderBrokerBookings();

    expect(await screen.findByText('No pending booking requests.')).toBeInTheDocument();
    expect(screen.getByText('No bookings need resolution.')).toBeInTheDocument();
    expect(screen.getByText('No confirmed bookings yet.')).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith('/api/bookings/broker');
  });

  // AC6 (loading), paired with the call-fired proof.
  it('shows "Loading..." in all three sections while the request is in flight', async () => {
    mockApiGet.mockReturnValueOnce(new Promise(() => {})); // never settles

    renderBrokerBookings();

    const loadingTexts = await screen.findAllByText('Loading...');
    expect(loadingTexts).toHaveLength(3);
    expect(mockApiGet).toHaveBeenCalledWith('/api/bookings/broker');
  });

  // AC6 (error), paired with the call-fired proof.
  it('shows the error banner in all three sections when the request rejects', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network down'));

    renderBrokerBookings();

    const errorTexts = await screen.findAllByText(
      'Failed to load bookings. Please try again.',
    );
    expect(errorTexts).toHaveLength(3);
    expect(mockApiGet).toHaveBeenCalledWith('/api/bookings/broker');
  });

  // AC7: permanent negative-control regression guard for #2278. Feeding the
  // legacy `{ content, page: {...} }` shape (no `items` key at all) must
  // render NO booking rows and all three empty states, while still proving
  // the query fired.
  //
  // Direction of the historical bug, stated explicitly so this guard cannot be
  // misread later: the pre-#2278 hook read `.content`, so it would have
  // accepted the fixture below and rendered rows from it. #2278 corrected the
  // hook to read `.items`, which is the only key the backend actually sends.
  // If a future change regresses the hook back to `.content`, this fixture
  // starts producing visible rows again and the assertions below reject it.
  it('REGRESSION GUARD (#2278): legacy content/page envelope with no items key renders no rows, only empty states', async () => {
    mockApiGet.mockResolvedValueOnce(
      makeLegacyContentResponse([
        makeBooking({ id: 'booking-should-not-render', requestedDate: '2099-01-01' }),
      ]),
    );

    renderBrokerBookings();

    expect(await screen.findByText('No pending booking requests.')).toBeInTheDocument();
    expect(screen.getByText('No bookings need resolution.')).toBeInTheDocument();
    expect(screen.getByText('No confirmed bookings yet.')).toBeInTheDocument();
    expect(screen.queryByText('2099-01-01')).not.toBeInTheDocument();
    // Positive proof the query actually fired (see file-header pairing rule) —
    // without this, a redirected/guarded/never-fired render would produce the
    // exact same "all empty states, no rows" output for the wrong reason.
    expect(mockApiGet).toHaveBeenCalledWith('/api/bookings/broker');
  });
});
