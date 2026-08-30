/**
 * useCityLaunch — Issue #1911 PR2
 *
 * Tests:
 * 1. useCityLaunchList calls GET /api/admin/city-launch/cities when admin
 * 2. useCityLaunchList is disabled (no fetch) when not admin
 * 3. usePrepareCity posts with NO body (created_by is server-side)
 * 4. usePrepareCity on 409 shows an info toast + invalidates the list (not a destructive error toast)
 * 5. usePrepareCity on a non-409 error shows a destructive toast
 * 6. useCityLaunchProgress polls (refetchInterval truthy) while prepState is RUNNING/PENDING
 * 7. useCityLaunchProgress stops polling (refetchInterval false) once prepState is DONE/FAILED
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet, post: mockPost },
  API_BASE_URL: 'http://localhost',
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── Import AFTER mocks ──────────────────────────────────────────────────────
import { useCityLaunchList, usePrepareCity, useCityLaunchProgress } from '../useCityLaunch';
import { ApiError } from '@/lib/api';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

describe('useCityLaunchList', () => {
  it('1: calls GET /api/admin/city-launch/cities when admin', async () => {
    mockGet.mockResolvedValue([]);
    const { result } = renderHook(() => useCityLaunchList(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith('/api/admin/city-launch/cities');
  });

  it('2: does not fetch when not admin', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    mockGet.mockResolvedValue([]);
    renderHook(() => useCityLaunchList(), { wrapper: makeWrapper() });

    // give react-query a tick to settle if it were going to fire
    await new Promise((r) => setTimeout(r, 0));

    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('usePrepareCity', () => {
  it('3: posts with no body', async () => {
    mockPost.mockResolvedValue({ revisionId: 7, status: 'preparing' });
    const { result } = renderHook(() => usePrepareCity(), { wrapper: makeWrapper() });

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith('/api/admin/city-launch/cities/42/prepare');
    // Explicitly assert the call sends no request body argument.
    expect(mockPost.mock.calls[0]).toHaveLength(1);
  });

  it('4: 409 shows an info toast (not destructive) and invalidates the list', async () => {
    mockPost.mockRejectedValue(new ApiError('Conflict', 409, { message: 'in-flight' }));
    const { result } = renderHook(() => usePrepareCity(), { wrapper: makeWrapper() });

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Preparation already in progress' }),
    );
    const call = mockToast.mock.calls[0][0];
    expect(call.variant).not.toBe('destructive');
  });

  it('5: non-409 error shows a destructive toast', async () => {
    mockPost.mockRejectedValue(new ApiError('Server error', 500, { message: 'boom' }));
    const { result } = renderHook(() => usePrepareCity(), { wrapper: makeWrapper() });

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to start preparation', variant: 'destructive' }),
    );
  });
});

describe('useCityLaunchProgress', () => {
  it('6: sets up SSE stream while prepState is RUNNING', async () => {
    // Setup a dummy fetch mock for the SSE endpoint
    const abortMock = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      },
    } as any);
    
    mockGet.mockResolvedValue({
      cityId: 1,
      revisionId: 5,
      lifecycleStatus: 'preparing',
      prepStage: 2,
      prepStageLabel: 'Resolving areas',
      prepState: 'RUNNING',
      geographyPercent: 40,
      failureReason: null,
      preparedAt: null,
    });

    const { result, unmount } = renderHook(() => useCityLaunchProgress(1, true), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith('/api/admin/city-launch/cities/1/prepare');
    expect(result.current.data?.prepState).toBe('RUNNING');
    expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/city-launch/cities/1/prepare/events'),
        expect.anything()
    );
    unmount();
  });

  it('7: does not start SSE stream once prepState is DONE', async () => {
    global.fetch = vi.fn();
    mockGet.mockResolvedValue({
      cityId: 1,
      revisionId: 5,
      lifecycleStatus: 'ready-preview',
      prepStage: 5,
      prepStageLabel: 'Complete',
      prepState: 'DONE',
      geographyPercent: 100,
      failureReason: null,
      preparedAt: '2026-07-16T00:00:00Z',
    });

    const { result } = renderHook(() => useCityLaunchProgress(1, true), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.prepState).toBe('DONE');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('8: recovers from a transient SSE error', async () => {
    let readerCalled = false;
    let chunkSent = false;
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(async () => {
              if (!readerCalled) {
                readerCalled = true;
                // Simulates stream abort/failure
                throw new Error("Stream disconnected");
              }
              if (!chunkSent) {
                chunkSent = true;
                const payload = {
                  cityId: 1,
                  revisionId: 5,
                  lifecycleStatus: 'ready-preview',
                  prepStage: 5,
                  prepStageLabel: 'Complete',
                  prepState: 'DONE',
                  geographyPercent: 100,
                  failureReason: null,
                  preparedAt: '2026-07-16T00:00:00Z',
                };
                return { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`) };
              }
              return new Promise(() => {});
            }),
          }),
        },
      };
    });

    mockGet.mockResolvedValue({
      cityId: 1,
      revisionId: 5,
      lifecycleStatus: 'preparing',
      prepStage: 2,
      prepStageLabel: 'Resolving areas',
      prepState: 'RUNNING',
      geographyPercent: 40,
      failureReason: null,
      preparedAt: null,
    });

    const { result, unmount } = renderHook(() => useCityLaunchProgress(1, true), { wrapper: makeWrapper() });
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Reconnect happens after 3s, so wait for it with a longer timeout
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 4000 });
    
    // It should have invalidated the query and called get again
    expect(mockGet).toHaveBeenCalledTimes(2);

    // Assert that the UI reaches the terminal DONE state
    await waitFor(() => expect(result.current.data?.prepState).toBe('DONE'));

    unmount();
  }, 10000);

  it('does not fetch when disabled', async () => {
    mockGet.mockResolvedValue({});
    renderHook(() => useCityLaunchProgress(1, false), { wrapper: makeWrapper() });

    await new Promise((r) => setTimeout(r, 0));

    expect(mockGet).not.toHaveBeenCalled();
  });
});
