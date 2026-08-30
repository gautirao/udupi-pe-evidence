/**
 * useAuthCacheSync — Issue #1462 (cache invalidation on auth change)
 *
 * The hook must call queryClient.invalidateQueries({ queryKey: ['listing'] })
 * when auth state (!!session) changes, but NOT on token refreshes that leave
 * the boolean unchanged.
 *
 * Tests:
 * 11  session null → truthy (sign-in): invalidateQueries called with { queryKey: ['listing'] }
 * 12  session truthy → null (sign-out): invalidateQueries called with { queryKey: ['listing'] }
 * 13  token refresh (session object changes, !!session stays true): invalidateQueries NOT called
 * 14  stable auth on mount (no state change): invalidateQueries NOT called on initial mount
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockSession = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession.current }),
}));

// Import AFTER mocks
import { useAuthCacheSync } from '../useAuthCacheSync';

// ─── Helpers ──────────────────────────────────────────────────
function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useAuthCacheSync — invalidateQueries on auth change (Issue #1462)', () => {
  beforeEach(() => {
    mockSession.current = null;
  });

  it("11: session null → truthy (sign-in) calls invalidateQueries({ queryKey: ['listing'] })", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Start with no session
    mockSession.current = null;
    const { rerender } = renderHook(() => useAuthCacheSync(), {
      wrapper: makeWrapper(queryClient),
    });

    // Mount does NOT fire invalidation (useRef guard skips when prev === current)
    const callsAfterMount = invalidateSpy.mock.calls.length;
    expect(callsAfterMount).toBe(0); // guard: no mount-time invalidation

    // Simulate sign-in: session becomes truthy
    mockSession.current = { user: { id: 'u1' }, access_token: 'tok1' };
    rerender();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['listing'] });
    // Called at least once more than after mount
    expect(invalidateSpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("12: session truthy → null (sign-out) calls invalidateQueries({ queryKey: ['listing'] })", async () => {
    // Start with active session
    mockSession.current = { user: { id: 'u1' }, access_token: 'tok1' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { rerender } = renderHook(() => useAuthCacheSync(), {
      wrapper: makeWrapper(queryClient),
    });

    // Mount does NOT fire invalidation (useRef guard skips when prev === current)
    const callsAfterMount = invalidateSpy.mock.calls.length;
    expect(callsAfterMount).toBe(0); // guard: no mount-time invalidation

    // Simulate sign-out
    mockSession.current = null;
    rerender();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['listing'] });
    expect(invalidateSpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('13: token refresh (!!session stays true) does NOT trigger another invalidation', async () => {
    // Start with active session
    mockSession.current = { user: { id: 'u1' }, access_token: 'tok1' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { rerender } = renderHook(() => useAuthCacheSync(), {
      wrapper: makeWrapper(queryClient),
    });

    // Mount does NOT fire invalidation (useRef guard skips when prev === current)
    const callsAfterMount = invalidateSpy.mock.calls.length;

    // Token refresh: NEW session object reference, but !!session is still true
    act(() => {
      mockSession.current = { user: { id: 'u1' }, access_token: 'tok-refreshed' };
    });
    rerender();

    // isAuthed boolean has NOT changed (true → true), so effect must NOT re-run
    expect(invalidateSpy.mock.calls.length).toBe(callsAfterMount);
  });

  it('14: stable auth on initial mount does NOT call invalidateQueries', async () => {
    // Mount with isAuthenticated=true from the start — the useRef guard should
    // prevent the effect from calling invalidateQueries on mount because
    // prevAuthedRef.current === isAuthed (both true).
    mockSession.current = { user: { id: 'u1' }, access_token: 'tok1' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useAuthCacheSync(), {
      wrapper: makeWrapper(queryClient),
    });

    // Allow effects to flush
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Mount must NOT trigger an invalidation when auth state is already stable
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
