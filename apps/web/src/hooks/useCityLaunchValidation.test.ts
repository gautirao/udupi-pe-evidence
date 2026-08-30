/**
 * Issue #1911 PR4 — useCityLaunchValidation hook tests.
 *
 * Covers the real backend contract at
 * /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/validation:
 *  - useValidationState: GET with the right query key.
 *  - useToggleCheck: PUT .../checks/{checkKey} {value}; invalidates on success.
 *  - useMarkValidated: 200/422/409 handling.
 *  - useRerunPreview: POST .../rerun; 202/409 handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useValidationState,
  useToggleCheck,
  useMarkValidated,
  useResetValidation,
  useRerunPreview,
  type ValidationStateDto,
} from './useCityLaunchValidation';

const mockToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// CITY_LAUNCH_LIST_QUERY_KEY (below) is imported from useCityLaunch.ts, which
// also imports the real supabase client — mocked here purely so that module
// load doesn't throw "supabaseUrl is required" in the test environment.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
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
const VALIDATION_PATH = `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/validation`;

function makeState(overrides: Partial<ValidationStateDto> = {}): ValidationStateDto {
  return {
    revisionId: REVISION_ID,
    cityId: CITY_ID,
    revisionNumber: 1,
    lifecycleStatus: 'PREPARED',
    checks: {
      landing: false,
      regions: false,
      areaGroups: false,
      areas: false,
      listing: false,
      agriDestinations: false,
    },
    allValidated: false,
    editable: true,
    preparedAt: '2026-07-01T00:00:00Z',
    validatedAt: null,
    supersededBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockToast.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useValidationState', () => {
  it('calls GET .../validation with the correct path and query key', async () => {
    vi.mocked(api.get).mockResolvedValue(makeState());
    const client = freshClient();

    const { result } = renderHook(() => useValidationState(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith(VALIDATION_PATH);
    expect(
      client.getQueryData(['city-launch-validation', CITY_ID, REVISION_ID]),
    ).toEqual(makeState());
  });

  it('does not fetch when cityId/revisionId are invalid', () => {
    const client = freshClient();
    renderHook(() => useValidationState(Number.NaN, REVISION_ID), {
      wrapper: makeWrapper(client),
    });
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('useToggleCheck', () => {
  it('PUTs {value} to the checks/{checkKey} path and invalidates the validation query', async () => {
    vi.mocked(api.put).mockResolvedValue(
      makeState({
        checks: {
          landing: true,
          regions: false,
          areaGroups: false,
          areas: false,
          listing: false,
          agriDestinations: false,
        },
      }),
    );
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useToggleCheck(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ checkKey: 'landing', value: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith(`${VALIDATION_PATH}/checks/landing`, { value: true });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['city-launch-validation', CITY_ID, REVISION_ID],
    });
  });

  it('on 409, surfaces a "no longer current" toast and invalidates', async () => {
    vi.mocked(api.put).mockRejectedValue(new ApiError('conflict', 409, null));
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useToggleCheck(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ checkKey: 'regions', value: true });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/no longer current/i) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['city-launch-validation', CITY_ID, REVISION_ID],
    });
  });

  it('on 422 (Issue #2151: agri destinations has zero rows), surfaces the actionable toast copy and invalidates', async () => {
    // Fixture message deliberately mirrors what api.ts actually produces
    // (it always overwrites the server's message with this generic string) —
    // not the server's original sentence, which never reaches the client.
    vi.mocked(api.put).mockRejectedValue(
      new ApiError('API request failed: 422 Unprocessable Entity', 422, null),
    );
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useToggleCheck(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ checkKey: 'agriDestinations', value: true });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'This check cannot be ticked yet',
        description: expect.stringMatching(/re-run preparation/i),
        variant: 'destructive',
      }),
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to update check' }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['city-launch-validation', CITY_ID, REVISION_ID],
    });
  });

  it('PUTs {value} to the checks/agriDestinations path (Issue #2151 PR A sixth check)', async () => {
    vi.mocked(api.put).mockResolvedValue(
      makeState({
        checks: {
          landing: false,
          regions: false,
          areaGroups: false,
          areas: false,
          listing: false,
          agriDestinations: true,
        },
      }),
    );
    const client = freshClient();

    const { result } = renderHook(() => useToggleCheck(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({ checkKey: 'agriDestinations', value: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith(`${VALIDATION_PATH}/checks/agriDestinations`, { value: true });
  });
});

describe('useMarkValidated', () => {
  it('POSTs mark-validated and updates the query cache on 200', async () => {
    const validated = makeState({
      checks: {
        landing: true,
        regions: true,
        areaGroups: true,
        areas: true,
        listing: true,
        agriDestinations: true,
      },
      allValidated: true,
      lifecycleStatus: 'VALIDATED',
    });
    vi.mocked(api.post).mockResolvedValue(validated);
    const client = freshClient();

    const { result } = renderHook(() => useMarkValidated(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(`${VALIDATION_PATH}/mark-validated`);
    expect(result.current.data).toEqual(validated);
  });

  it('on 422, surfaces "not all checks complete" and invalidates', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('unprocessable', 422, null));
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useMarkValidated(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/not all checks complete/i) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['city-launch-validation', CITY_ID, REVISION_ID],
    });
  });

  it('on 409, surfaces "no longer current" and invalidates', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('conflict', 409, null));
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useMarkValidated(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/no longer current/i) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['city-launch-validation', CITY_ID, REVISION_ID],
    });
  });
});

describe('useResetValidation', () => {
  it('POSTs reset and updates the query cache', async () => {
    const reset = makeState({ lifecycleStatus: 'PREPARED' });
    vi.mocked(api.post).mockResolvedValue(reset);
    const client = freshClient();

    const { result } = renderHook(() => useResetValidation(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith(`${VALIDATION_PATH}/reset`);
  });
});

describe('useRerunPreview', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('POSTs /rerun and invalidates the city-launch list + validation query on 202', async () => {
    vi.mocked(api.post).mockResolvedValue({ revisionId: 43, status: 'preparing' });
    const client = freshClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRerunPreview(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(
      `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}/rerun`,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'city-launch', 'cities'],
    });
  });

  it('on 202, navigates back to the city list and shows a rerunning toast (#2175)', async () => {
    vi.mocked(api.post).mockResolvedValue({ revisionId: 43, status: 'preparing' });
    const client = freshClient();

    const { result } = renderHook(() => useRerunPreview(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockNavigate).toHaveBeenCalledWith('/admin/city-launch');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/rerunning preview/i) }),
    );
  });

  it('on 409, surfaces a "no longer current" toast', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('conflict', 409, null));
    const client = freshClient();

    const { result } = renderHook(() => useRerunPreview(CITY_ID, REVISION_ID), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/no longer current/i) }),
    );
  });
});
