/**
 * Issue #1911 PR5 — useCityLaunchPromotion hook tests.
 *
 * Covers the real backend contract at
 * /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/launch:
 *  - POST with {confirmCityName} to the correct URL.
 *  - 200 PROMOTED success — invalidates validation + admin city-launch list.
 *  - 200 idempotent no-op (idempotentNoop=true) is still treated as success.
 *  - 409/422/404 error handling.
 *
 * The success + idempotent-noop tests inline the RAW backend PromotionReport
 * JSON verbatim (not via a fixture helper/builder) so a future backend shape
 * drift (field rename, camelCase mismatch, etc.) fails this test directly —
 * per the PR2/PR3/PR4 DTO-mismatch anti-recurrence lesson.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCityLaunchPromotion, type PromotionReport } from './useCityLaunchPromotion';

const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
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

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const CITY_ID = 7;
const REVISION_ID = 42;
const LAUNCH_PATH = `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/launch`;

beforeEach(() => {
  mockToast.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useCityLaunchPromotion', () => {
  it('POSTs {confirmCityName} to the launch path, invalidates queries, and returns the raw PROMOTED PromotionReport', async () => {
    // Raw backend JSON, inlined verbatim — the wire-contract guard.
    const rawPromotionReport: PromotionReport = {
      revisionId: 5,
      lifecycleStatus: 'PROMOTED',
      promotedAt: '2026-07-17T05:45:07.845819Z',
      areasPromoted: 1,
      aliasesPromoted: 0,
      regionsPromoted: 1,
      membershipsPromoted: 1,
      groupsPromoted: 0,
      groupMembersPromoted: 0,
      cityActivated: true,
      idempotentNoop: false,
    };
    vi.mocked(api.post).mockResolvedValue(rawPromotionReport);
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCityLaunchPromotion(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ confirmCityName: 'Udupi' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(LAUNCH_PATH, { confirmCityName: 'Udupi' });
    expect(result.current.data).toEqual(rawPromotionReport);
    expect(result.current.data?.lifecycleStatus).toBe('PROMOTED');
    expect(result.current.data?.idempotentNoop).toBe(false);
    expect(result.current.data?.cityActivated).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['city-launch-validation', CITY_ID, REVISION_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'city-launch', 'cities'],
    });
  });

  it('treats an idempotent-noop retry (idempotentNoop=true, zero per-table counts) as a success, not an error', async () => {
    // Raw backend JSON for the already-PROMOTED retry shape, inlined verbatim.
    const idempotentReport: PromotionReport = {
      revisionId: 5,
      lifecycleStatus: 'PROMOTED',
      promotedAt: '2026-07-17T05:45:07.845819Z',
      areasPromoted: 0,
      aliasesPromoted: 0,
      regionsPromoted: 0,
      membershipsPromoted: 0,
      groupsPromoted: 0,
      groupMembersPromoted: 0,
      cityActivated: false,
      idempotentNoop: true,
    };
    vi.mocked(api.post).mockResolvedValue(idempotentReport);
    const client = freshClient();

    const { result } = renderHook(() => useCityLaunchPromotion(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ confirmCityName: 'Udupi' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isError).toBe(false);
    expect(result.current.data?.idempotentNoop).toBe(true);
    expect(result.current.data?.cityActivated).toBe(false);
    expect(result.current.data?.areasPromoted).toBe(0);
  });

  it('on 409 (not promotable), surfaces a distinct error and a "not ready to launch" toast', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('conflict', 409, null));
    const client = freshClient();

    const { result } = renderHook(() => useCityLaunchPromotion(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ confirmCityName: 'Udupi' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as InstanceType<typeof ApiError>).status).toBe(409);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/not ready to launch/i) }),
    );
  });

  it('on 422 (checksum mismatch / canonical drift), surfaces a distinct error and a "re-run prepare" toast', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('unprocessable', 422, null));
    const client = freshClient();

    const { result } = renderHook(() => useCityLaunchPromotion(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ confirmCityName: 'Udupi' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as InstanceType<typeof ApiError>).status).toBe(422);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/drifted/i),
        description: expect.stringMatching(/re-run prepare/i),
      }),
    );
  });

  it('on 404 (revision not found), surfaces a distinct error and a "not found" toast', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('not found', 404, null));
    const client = freshClient();

    const { result } = renderHook(() => useCityLaunchPromotion(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ confirmCityName: 'Udupi' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as InstanceType<typeof ApiError>).status).toBe(404);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/not found/i) }),
    );
  });
});
