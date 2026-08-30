import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBrokerBookings, BookingResponse } from '@/hooks/useBookings';

// ─── Why this hook test lives under src/pages/__tests__/ ──────────────────────
//
// Issue #2247 (PR #2278 owner ruling): both booking hooks must be verified
// against the real flat `PagedResponse` envelope, not just `useMyBookings`
// (covered in MyBookings.test.tsx in this same directory). `useBrokerBookings`
// is a hook, not a page, so `src/hooks/__tests__/` would be the natural home —
// but that path (and `src/pages/broker/__tests__/`) is out of the approved
// `allowed_file_globs` scope for this fix cycle. `src/pages/__tests__/**` *is*
// in scope, and MyBookings.test.tsx already solved the mocking problem this
// hook needs (supabase-client stub + api.get boundary mock), so this sibling
// file reuses that exact pattern rather than expanding scope for a filesystem
// nicety.

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// useBrokerBookings is gated on `enabled: !!user && (isBroker || isAdmin)` —
// without a broker/admin auth context the query never fires and the test
// would pass vacuously.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'broker-1' },
    isAdmin: false,
    isBroker: true,
    isLoading: false,
    signOut: vi.fn(),
  }),
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
function makePagedResponse(items: BookingResponse[], totalPages: number, totalElements: number) {
  return {
    items,
    page: 0,
    size: 20,
    totalElements,
    totalPages,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useBrokerBookings', () => {
  it('returns items as data plus flat totalPages/totalElements from the real five-key PagedResponse envelope', async () => {
    mockApiGet.mockResolvedValueOnce(
      makePagedResponse(
        [
          makeBooking({ id: 'booking-broker-1', listingId: 'listing-broker-1' }),
          makeBooking({ id: 'booking-broker-2', listingId: 'listing-broker-2' }),
        ],
        3,
        41,
      ),
    );

    const { result } = renderHook(() => useBrokerBookings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      makeBooking({ id: 'booking-broker-1', listingId: 'listing-broker-1' }),
      makeBooking({ id: 'booking-broker-2', listingId: 'listing-broker-2' }),
    ]);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalElements).toBe(41);
  });
});
