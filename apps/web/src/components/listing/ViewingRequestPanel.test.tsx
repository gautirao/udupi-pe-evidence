/**
 * ViewingRequestPanel — unit tests for #1797.
 *
 * Covers the inline booking state machine (idle → pending → success/error), the
 * anon intent-preservation handoff (sessionStorage, no PII, restored post-auth), and
 * the useCreateBooking contract relocation ({ listingId, requestedDate,
 * requestedTimeSlot, requesterMessage? }).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const mockMutate = vi.hoisted(() => vi.fn());
const mockReset = vi.hoisted(() => vi.fn());
const mockUseCreateBooking = vi.hoisted(() => vi.fn());
const mockOpenAuthModal = vi.hoisted(() => vi.fn());
const mockEmitLeadIntent = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBookings', () => ({
  TIME_SLOTS: ['09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00', '15:00-16:00', '16:00-17:00'],
  useCreateBooking: mockUseCreateBooking,
}));

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal: mockOpenAuthModal, closeAuthModal: vi.fn(), isOpen: false }),
}));

vi.mock('@/hooks/useDiscoverTelemetry', () => ({
  useDiscoverTelemetry: () => ({ emitLeadIntent: mockEmitLeadIntent, emitFilterApply: vi.fn(), emitPanelOpen: vi.fn() }),
}));

import { ViewingRequestPanel } from './ViewingRequestPanel';
import type { User } from '@supabase/supabase-js';

const LISTING_ID = 'listing-abc';
const MOCK_USER = { id: 'user-1', email: 'buyer@example.com' } as unknown as User;
const INTENT_KEY = `viewing-intent:${LISTING_ID}`;

function pickFirstQuickDateAndTime() {
  // Quick pills are labelled "Tom" (tomorrow) then weekday abbreviations — click the first one.
  const [firstPill] = screen.getAllByTestId(/^viewing-date-pill-/);
  fireEvent.click(firstPill);
  fireEvent.click(screen.getByTestId('viewing-time-slot-09:00-10:00'));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockUseCreateBooking.mockReturnValue({ mutate: mockMutate, isPending: false, isError: false, reset: mockReset });
});

describe('idle state', () => {
  it('renders quick-pick date pills starting tomorrow (never "today") and a disabled submit', () => {
    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.getByText('Tom')).toBeInTheDocument();
    expect(screen.getByTestId('request-viewing-btn')).toBeDisabled();
  });

  it('reveals time slots only after a date is picked', () => {
    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    expect(screen.queryByTestId('viewing-time-slot-09:00-10:00')).not.toBeInTheDocument();
    const firstPill = screen.getAllByTestId(/^viewing-date-pill-/)[0];
    fireEvent.click(firstPill);
    expect(screen.getByTestId('viewing-time-slot-09:00-10:00')).toBeInTheDocument();
  });
});

describe('signed-in submit → success → reset (#1797 AC1/AC2)', () => {
  it('submits the exact useCreateBooking contract and shows the inline success state', () => {
    mockMutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.();
    });
    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);

    pickFirstQuickDateAndTime();
    const submit = screen.getByTestId('request-viewing-btn');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockMutate.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        listingId: LISTING_ID,
        requestedDate: expect.any(String),
        requestedTimeSlot: '09:00-10:00',
      }),
    );
    expect(mockEmitLeadIntent).toHaveBeenCalledTimes(1);

    // Inline success — no modal, echoes the chosen date/time, and is explicit that
    // this is a request, not a confirmed booking.
    const success = screen.getByTestId('viewing-request-success');
    expect(success).toHaveAttribute('role', 'status');
    expect(success).toHaveTextContent(/viewing request sent/i);
    expect(success).toHaveTextContent(/not a confirmed booking/i);

    // "Request another time" resets the form for a fresh pick — no stale selection
    // that could resubmit a duplicate booking.
    fireEvent.click(screen.getByTestId('viewing-request-reset'));
    expect(screen.queryByTestId('viewing-request-success')).not.toBeInTheDocument();
    expect(screen.getByTestId('request-viewing-btn')).toBeDisabled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('disables controls while pending (no double-submit)', () => {
    mockUseCreateBooking.mockReturnValue({ mutate: mockMutate, isPending: true, isError: false, reset: mockReset });
    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    expect(screen.getByTestId('request-viewing-btn')).toBeDisabled();
    expect(screen.getByText(/sending request/i)).toBeInTheDocument();
  });

  it('shows an inline alert on failure and allows retry (form stays open)', () => {
    mockUseCreateBooking.mockReturnValue({ mutate: mockMutate, isPending: false, isError: true, reset: mockReset });
    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    pickFirstQuickDateAndTime();
    const alert = screen.getByTestId('viewing-request-error');
    expect(alert).toHaveAttribute('role', 'alert');
    // Form is still open/editable, not replaced by the error.
    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();
  });

  it('enforces the message maxLength/counter (500 chars)', () => {
    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    pickFirstQuickDateAndTime();
    const textarea = screen.getByTestId('viewing-message-input');
    expect(textarea).toHaveAttribute('maxlength', '500');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(screen.getByText('5/500')).toBeInTheDocument();
  });
});

describe('anonymous buyer — Option A (#1797 binding decision)', () => {
  it('shows the same interactive panel (no modal, no wall) with pills/slots enabled', () => {
    render(<ViewingRequestPanel listingId={LISTING_ID} user={null} />);
    const firstPill = screen.getAllByTestId(/^viewing-date-pill-/)[0];
    expect(firstPill).not.toBeDisabled();
    fireEvent.click(firstPill);
    expect(screen.getByTestId('viewing-time-slot-09:00-10:00')).not.toBeDisabled();
  });

  it('"Send" persists ONLY date + time slot to sessionStorage (no PII) and routes to sign-in — never calls the booking mutation', () => {
    render(<ViewingRequestPanel listingId={LISTING_ID} user={null} />);
    pickFirstQuickDateAndTime();
    fireEvent.click(screen.getByTestId('request-viewing-btn'));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockOpenAuthModal).toHaveBeenCalledWith(
      expect.objectContaining({ returnTo: `/listing/${LISTING_ID}`, redirect: `/listing/${LISTING_ID}` }),
    );

    const stored = sessionStorage.getItem(INTENT_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(Object.keys(parsed).sort()).toEqual(['date', 'timeSlot']);
    expect(parsed.timeSlot).toBe('09:00-10:00');
  });
});

describe('post-sign-in intent restore', () => {
  it('restores a previously-picked date/time once the buyer is signed in, then clears sessionStorage', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ date: iso, timeSlot: '10:00-11:00' }));

    render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);

    // Submit should already be enabled — both date and time were restored automatically.
    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();
    // The stored intent is a one-shot value — cleared immediately after restore.
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull();
  });

  // ── Issue #2005 (Slice 2 PR6) — Category B: [user, listingId] trigger-key regression ──
  it('re-runs the restore check when user transitions from null to signed-in (the anon -> auth trigger)', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ date: iso, timeSlot: '11:00-12:00' }));

    const { rerender } = render(<ViewingRequestPanel listingId={LISTING_ID} user={null} />);
    // Anonymous: the restore effect guards on `!user` and returns early — nothing consumed yet.
    expect(sessionStorage.getItem(INTENT_KEY)).not.toBeNull();
    expect(screen.getByTestId('request-viewing-btn')).toBeDisabled();

    // user: null -> MOCK_USER is exactly the [user, listingId] trigger-key change.
    rerender(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);

    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull();
  });

  it('does not re-run the restore check on a re-render with the same user/listingId (an excluded-input change)', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ date: iso, timeSlot: '11:00-12:00' }));

    const { rerender } = render(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull();

    // Buyer picks a different date manually after the restore (selecting a new date
    // resets the time slot pick, so re-pick a time too).
    const pills = screen.getAllByTestId(/^viewing-date-pill-/);
    fireEvent.click(pills[pills.length - 1]);
    fireEvent.click(screen.getByTestId('viewing-time-slot-09:00-10:00'));
    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();

    // A benign re-render with the SAME user/listingId (e.g. a parent state update)
    // must not re-run the restore and clobber the buyer's manual pick.
    rerender(<ViewingRequestPanel listingId={LISTING_ID} user={MOCK_USER} />);
    expect(screen.getByTestId('request-viewing-btn')).toBeEnabled();
  });
});
