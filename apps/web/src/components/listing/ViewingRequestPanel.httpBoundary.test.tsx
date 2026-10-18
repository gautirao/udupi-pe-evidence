/**
 * ViewingRequestPanel — HTTP-boundary tests (#2837 / #2750 PR-6 batch C, stage B1).
 *
 * Replaces assertions of e2e/journey/booking-journey.spec.ts (UB2 duplicate -> inline error,
 * UB1 payload) and e2e/listing-detail-viewing.spec.ts (LDV1 POST body, LDV3 anon never books).
 *
 * BOUNDARY (disclosed): the REAL ViewingRequestPanel and the REAL useCreateBooking
 * (react-query useMutation -> api.post('/api/bookings', body)) run. ONLY the HTTP client
 * (`@/lib/api`, including API_BASE_URL which useDiscoverTelemetry imports) is mocked, plus the
 * AuthModalContext UI context (no data) so the anon "open sign-in" branch is observable.
 * No data hook is vi.mock'ed. A 409 here is the same rejection ApiError the real client throws
 * for a duplicate active booking; the server-side 409 itself is covered by
 * BookingControllerTest.create_duplicateActiveBooking_returns409 (MUT-C18) and canonical T17.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const apiPost = vi.hoisted(() => vi.fn());
const mockOpenAuthModal = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://api.test',
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public body: unknown) {
      super(message);
      this.name = 'ApiError';
    }
  },
  api: { get: vi.fn(), post: apiPost, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal: mockOpenAuthModal, closeAuthModal: vi.fn(), isOpen: false }),
}));

import { ViewingRequestPanel } from './ViewingRequestPanel';
import { ApiError } from '@/lib/api';
import type { User } from '@supabase/supabase-js';

const LISTING_ID = 'listing-http-2837';
const USER = { id: 'user-1', email: 'buyer@example.test' } as unknown as User;
const INTENT_KEY = `viewing-intent:${LISTING_ID}`;
const SLOT = '10:00-11:00';
/** Clock frozen at LOCAL 2026-10-17 12:00 -> tomorrow (first pill) is 2026-10-18. */
const TOMORROW = '2026-10-18';

const bookingsPosts = () => apiPost.mock.calls.filter(([path]) => path === '/api/bookings');

function renderPanel(user: User | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ViewingRequestPanel listingId={LISTING_ID} user={user} />
    </QueryClientProvider>,
  );
}

function pickDateAndSlot(slot = SLOT) {
  fireEvent.click(screen.getAllByTestId(/^viewing-date-pill-/)[0]);
  fireEvent.click(screen.getByTestId(`viewing-time-slot-${slot}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear(); // telemetry consent default-deny: no fetch from emitLeadIntent
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UB2 — duplicate booking surfaces an inline error, never a success (real useCreateBooking)', () => {
  it('UB2: POST /api/bookings rejecting 409 -> viewing-request-error (role=alert) shown, success absent, form still usable', async () => {
    apiPost.mockRejectedValue(new ApiError('API request failed: 409 Conflict', 409, { message: 'duplicate' }));
    renderPanel(USER);
    pickDateAndSlot();
    fireEvent.click(screen.getByTestId('request-viewing-btn'));

    // Positive control FIRST: the error alert appears (the mutation really settled as failed).
    const alert = await screen.findByTestId('viewing-request-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(/failed to send your request/i);
    // The negative, on the same render, after the settle.
    expect(screen.queryByTestId('viewing-request-success')).toBeNull();
    // Retry stays possible: the selection was kept and the submit is enabled again.
    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();
    expect(bookingsPosts()).toHaveLength(1);
  });

  it('UB2 CONTROL: POST /api/bookings resolving 201 -> viewing-request-success shown and the error is absent', async () => {
    apiPost.mockResolvedValue({ id: 'b-1', listingId: LISTING_ID, status: 'REQUESTED' });
    renderPanel(USER);
    pickDateAndSlot();
    fireEvent.click(screen.getByTestId('request-viewing-btn'));

    const success = await screen.findByTestId('viewing-request-success');
    expect(success).toHaveAttribute('role', 'status');
    expect(success).toHaveTextContent(/viewing request sent/i);
    expect(screen.queryByTestId('viewing-request-error')).toBeNull();
    expect(bookingsPosts()).toHaveLength(1);
  });
});

describe('LDV1-http — the POST body that really leaves the client', () => {
  it('LDV1-http: POST /api/bookings carries listingId, ISO requestedDate, requestedTimeSlot === picked slot and requesterMessage', async () => {
    apiPost.mockResolvedValue({ id: 'b-2' });
    renderPanel(USER);
    pickDateAndSlot(SLOT);
    const note = 'Please call from the gate.';
    fireEvent.change(screen.getByTestId('viewing-message-input'), { target: { value: note } });
    fireEvent.click(screen.getByTestId('request-viewing-btn'));

    // Positive control: the request settled as a success.
    await screen.findByTestId('viewing-request-success');

    expect(bookingsPosts()).toHaveLength(1);
    const [path, body] = bookingsPosts()[0];
    expect(path).toBe('/api/bookings');
    expect(body).toStrictEqual({
      listingId: LISTING_ID,
      requestedDate: TOMORROW,
      requestedTimeSlot: SLOT,
      requesterMessage: note,
    });
    expect(typeof (body as { requestedDate: unknown }).requestedDate).toBe('string');
  });
});

describe('LDV3-http — anonymous buyers never book', () => {
  it('LDV3-http: anon submit opens sign-in, issues NO POST /api/bookings, and stores ONLY date + timeSlot', async () => {
    renderPanel(null);
    pickDateAndSlot(SLOT);
    const submit = screen.getByTestId('request-viewing-btn');
    expect(submit).toHaveTextContent(/sign in to request viewing/i);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    // Positive control: the anon branch ran (sign-in opened with a return path).
    await waitFor(() => expect(mockOpenAuthModal).toHaveBeenCalledTimes(1));
    expect(mockOpenAuthModal).toHaveBeenCalledWith({
      returnTo: `/listing/${LISTING_ID}`,
      redirect: `/listing/${LISTING_ID}`,
    });

    // The negative: the HTTP client was never asked to POST a booking (or anything else).
    expect(bookingsPosts()).toHaveLength(0);
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.queryByTestId('viewing-request-success')).toBeNull();
    expect(screen.queryByTestId('viewing-request-error')).toBeNull();

    const stored = sessionStorage.getItem(INTENT_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(Object.keys(parsed).sort()).toEqual(['date', 'timeSlot']);
    expect(parsed).toEqual({ date: TOMORROW, timeSlot: SLOT });
  });
});
