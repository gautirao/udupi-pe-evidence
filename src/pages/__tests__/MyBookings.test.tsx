import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import MyBookings from '../MyBookings';
import { useMyBookings, useCancelBooking, BookingResponse } from '@/hooks/useBookings';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockMutate = vi.fn();

vi.mock('@/hooks/useBookings', () => ({
  useMyBookings: vi.fn(),
  useCancelBooking: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    isAdmin: false,
    isBroker: false,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
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
  it('shows decline reason for a DECLINED booking that has one', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [
        makeBooking({
          id: 'booking-declined',
          status: 'DECLINED',
          declineReason: 'Slot no longer available',
        }),
      ],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.getByText(/Declined: Slot no longer available/)).toBeInTheDocument();
  });

  it('does not show a decline note for a DECLINED booking with no reason', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [
        makeBooking({
          id: 'booking-declined-no-reason',
          status: 'DECLINED',
          declineReason: null,
        }),
      ],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.getByText('Declined')).toBeInTheDocument(); // badge
    expect(screen.queryByText(/^Declined:/)).not.toBeInTheDocument();
  });

  it('does not show any decline note for a non-DECLINED booking', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [
        makeBooking({
          id: 'booking-confirmed',
          status: 'CONFIRMED',
          declineReason: null,
        }),
      ],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.queryByText(/Declined:/)).not.toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument(); // badge
  });

  it('shows empty state message when there are no bookings', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      totalPages: 0,
      totalElements: 0,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(
      screen.getByText('You have no viewing requests yet.'),
    ).toBeInTheDocument();
  });

  it('shows Cancel Booking button for a REQUESTED booking', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [makeBooking({ status: 'REQUESTED' })],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.getByRole('button', { name: 'Cancel Booking' })).toBeInTheDocument();
  });

  it('does not show Cancel Booking button for CONFIRMED bookings', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [makeBooking({ status: 'CONFIRMED' })],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not show Cancel Booking button for CANCELLED bookings', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [makeBooking({ status: 'CANCELLED' })],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not show Cancel Booking button for COMPLETED bookings', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [makeBooking({ status: 'COMPLETED' })],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('does not show Cancel Booking button for DECLINED bookings', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [makeBooking({ status: 'DECLINED' })],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('shows "On Hold" badge and no Cancel Booking button for NEEDS_RESOLUTION bookings', () => {
    vi.mocked(useMyBookings).mockReturnValue({
      data: [makeBooking({ status: 'NEEDS_RESOLUTION' })],
      isLoading: false,
      isError: false,
      totalPages: 1,
      totalElements: 1,
    } as ReturnType<typeof useMyBookings>);

    renderMyBookings();

    expect(screen.getByText('On Hold')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });
});
