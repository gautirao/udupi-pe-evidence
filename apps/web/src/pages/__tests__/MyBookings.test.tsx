import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import MyBookings from '../MyBookings';
import { useCancelBooking, BookingResponse } from '@/hooks/useBookings';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// Issue #2247: every case in this file used to mock `useMyBookings`'s *output*
// directly, which bypasses the exact unmarshalling layer (`useBookings.ts`
// reading `.content`/`.page.*` off a response that is actually the flat
// `PagedResponse` envelope) where the real bug lived. That let the suite stay
// green against provably broken hooks. Fixed by mocking one level lower — at
// the `api.get` network boundary — so the real `useMyBookings` hook (imported
// unmocked below) does the actual unmarshalling on every case.

const mockMutate = vi.fn();
const mockApiGet = vi.hoisted(() => vi.fn());

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

// Only useCancelBooking is mocked — useMyBookings runs for real against the
// mocked api.get response above.
vi.mock('@/hooks/useBookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBookings')>();
  return {
    ...actual,
    useCancelBooking: vi.fn(),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    isAdmin: false,
    isBroker: false,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
 * Builds the REAL five-key `PagedResponse` envelope the backend actually sends
 * (`items` + flat `page`/`size`/`totalElements`/`totalPages`) — never the old
 * `{ content, page: { ... } }` shape, which would hide the #2247 bug entirely.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderMyBookings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyBookings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCancelBooking).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCancelBooking>);
});

describe('MyBookings page', () => {
  it('renders a booking row (listing id, date, time slot) from the real five-key PagedResponse envelope', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([
        makeBooking({
          id: 'booking-real-envelope',
          listingId: 'listing-real-envelope-id',
          requestedDate: '2026-04-15',
          requestedTimeSlot: '15:00-16:00',
        }),
      ]),
    );

    renderMyBookings();

    expect(await screen.findByText('listing-real-envelope-id')).toBeInTheDocument();
    expect(screen.getByText('2026-04-15')).toBeInTheDocument();
    expect(screen.getByText('15:00-16:00')).toBeInTheDocument();
  });

  it('shows decline reason for a DECLINED booking that has one', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([
        makeBooking({
          id: 'booking-declined',
          status: 'DECLINED',
          declineReason: 'Slot no longer available',
        }),
      ]),
    );

    renderMyBookings();

    expect(
      await screen.findByText(/Declined: Slot no longer available/),
    ).toBeInTheDocument();
  });

  it('does not show a decline note for a DECLINED booking with no reason', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([
        makeBooking({
          id: 'booking-declined-no-reason',
          status: 'DECLINED',
          declineReason: null,
        }),
      ]),
    );

    renderMyBookings();

    expect(await screen.findByText('Declined')).toBeInTheDocument(); // badge
    expect(screen.queryByText(/^Declined:/)).not.toBeInTheDocument();
  });

  it('does not show any decline note for a non-DECLINED booking', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([
        makeBooking({
          id: 'booking-confirmed',
          status: 'CONFIRMED',
          declineReason: null,
        }),
      ]),
    );

    renderMyBookings();

    expect(await screen.findByText('Confirmed')).toBeInTheDocument(); // badge
    expect(screen.queryByText(/Declined:/)).not.toBeInTheDocument();
  });

  it('shows empty state message when there are no bookings', async () => {
    mockApiGet.mockResolvedValueOnce(makePagedResponse([]));

    renderMyBookings();

    expect(
      await screen.findByText('You have no viewing requests yet.'),
    ).toBeInTheDocument();
  });

  it('shows Cancel Booking button for a REQUESTED booking', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([makeBooking({ status: 'REQUESTED' })]),
    );

    renderMyBookings();

    expect(
      await screen.findByRole('button', { name: 'Cancel Booking' }),
    ).toBeInTheDocument();
  });

  it('does not show Cancel Booking button for CONFIRMED bookings', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([makeBooking({ status: 'CONFIRMED' })]),
    );

    renderMyBookings();

    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not show Cancel Booking button for CANCELLED bookings', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([makeBooking({ status: 'CANCELLED' })]),
    );

    renderMyBookings();

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not show Cancel Booking button for COMPLETED bookings', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([makeBooking({ status: 'COMPLETED' })]),
    );

    renderMyBookings();

    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not show Cancel Booking button for DECLINED bookings', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([makeBooking({ status: 'DECLINED' })]),
    );

    renderMyBookings();

    expect(await screen.findByText('Declined')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('shows "On Hold" badge and no Cancel Booking button for NEEDS_RESOLUTION bookings', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse([makeBooking({ status: 'NEEDS_RESOLUTION' })]),
    );

    renderMyBookings();

    expect(await screen.findByText('On Hold')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });
});
