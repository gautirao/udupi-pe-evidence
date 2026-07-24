/**
 * Issue #1955 (Areas PR A) — useCityLaunchNavigation hook tests.
 *
 * Covers:
 *  - useNavigationTree: enabled only in preview mode; Zod-validates the response.
 *  - useNavigationDiff: separate cache entries per `against` value.
 *  - useNavigationOverrides: GET list.
 *  - useCreateNavigationOverride: POST; invalidates diff/overrides/tree; 422/409 toasts.
 *  - useDeleteNavigationOverride: DELETE; 404/409 toasts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

const MockApiError = vi.hoisted(
  () =>
    class MockApiError extends Error {
      status: number;
      body: unknown;
      constructor(message: string, status: number, body: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
      }
    },
);

vi.mock('@/lib/api', () => ({
  api: mockApi,
  ApiError: MockApiError,
}));

import {
  useNavigationTree,
  useNavigationDiff,
  useNavigationOverrides,
  useCreateNavigationOverride,
  useDeleteNavigationOverride,
} from './useCityLaunchNavigation';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

const CITY_ID = 7;
const REVISION_ID = 42;
const REVISION_BASE = `/api/admin/city-launch/cities/${CITY_ID}/revisions/${REVISION_ID}`;

function makePreviewWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        DiscoverDataSourceProvider,
        { value: { mode: 'preview', cityId: CITY_ID, revisionId: REVISION_ID }, children },
      ),
    );
  return { wrapper, queryClient };
}

function makeLiveWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

// Fixtures shaped exactly like the real backend DTOs (NavigationPreviewTreeResponse /
// NavigationTreeDiffResponse / AdminNavigationOverrideResponse) — code-review cycle 1 fix.
const VALID_TREE_RESPONSE = {
  revisionId: REVISION_ID,
  validationStatus: 'VALID',
  validationErrors: [] as string[],
  nodes: [
    {
      nodeKey: 'c:north:manipal',
      nodeType: 'CLUSTER' as const,
      parentNodeKey: null,
      regionKey: 'north',
      areaKey: null,
      displayLabel: 'North',
      depth: 0,
      ancestorKeys: [] as string[],
      representativeAreaKeys: ['manipal'],
      displayOrder: 0,
      descendantAreaCount: 1,
      bounds: { centreLat: 13.0, centreLon: 74.79, minLat: 12.9, minLon: 74.7, maxLat: 13.1, maxLon: 74.9 },
    },
  ],
};

const VALID_DIFF_RESPONSE = {
  revisionId: REVISION_ID,
  against: 'BASE' as const,
  overridesFingerprint: 'fp1',
  added: [] as string[],
  removed: [] as string[],
  moved: [],
  relabeled: [],
  representativeChanges: [],
};

const VALID_OVERRIDES_RESPONSE = [
  {
    kind: 'EXCLUDE_AREA' as const,
    id: 1,
    applyOrder: 0,
    subjectAreaKey: 'area-1',
    reason: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNavigationTree', () => {
  it('is disabled in live mode (never calls the API)', () => {
    mockApi.get.mockResolvedValue(VALID_TREE_RESPONSE);
    const { wrapper } = makeLiveWrapper();
    const { result } = renderHook(() => useNavigationTree(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('fetches GET .../navigation/tree in preview mode and Zod-validates the response', async () => {
    mockApi.get.mockResolvedValue(VALID_TREE_RESPONSE);
    const { wrapper } = makePreviewWrapper();
    const { result } = renderHook(() => useNavigationTree(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(`${REVISION_BASE}/navigation/tree`);
    expect(result.current.data?.nodes[0].nodeKey).toBe('c:north:manipal');
  });

  it('surfaces a malformed tree response as a query error, not a thrown crash', async () => {
    mockApi.get.mockResolvedValue({ revisionId: REVISION_ID }); // missing validationStatus/nodes
    const { wrapper } = makePreviewWrapper();
    const { result } = renderHook(() => useNavigationTree(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/Malformed navigation tree/);
  });
});

describe('useNavigationDiff', () => {
  it('uses distinct query keys/paths for BASE vs PREVIOUS_REVISION', async () => {
    mockApi.get.mockResolvedValue(VALID_DIFF_RESPONSE);
    const { wrapper } = makePreviewWrapper();
    const { result: base } = renderHook(() => useNavigationDiff('BASE'), { wrapper });
    const { result: prev } = renderHook(() => useNavigationDiff('PREVIOUS_REVISION'), { wrapper });
    await waitFor(() => expect(base.current.isSuccess).toBe(true));
    await waitFor(() => expect(prev.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(`${REVISION_BASE}/navigation/diff?against=BASE`);
    expect(mockApi.get).toHaveBeenCalledWith(`${REVISION_BASE}/navigation/diff?against=PREVIOUS_REVISION`);
  });
});

describe('useNavigationOverrides', () => {
  it('fetches GET .../navigation/overrides', async () => {
    mockApi.get.mockResolvedValue(VALID_OVERRIDES_RESPONSE);
    const { wrapper } = makePreviewWrapper();
    const { result } = renderHook(() => useNavigationOverrides(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(`${REVISION_BASE}/navigation/overrides`);
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useCreateNavigationOverride', () => {
  it('POSTs the discriminated-union payload and invalidates overrides/diff/tree on success', async () => {
    mockApi.post.mockResolvedValue(VALID_DIFF_RESPONSE);
    const { wrapper, queryClient } = makePreviewWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateNavigationOverride(), { wrapper });

    result.current.mutate({ kind: 'EXCLUDE_AREA', subjectAreaKey: 'area-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith(`${REVISION_BASE}/navigation/overrides`, {
      kind: 'EXCLUDE_AREA',
      subjectAreaKey: 'area-1',
    });
    expect(invalidateSpy).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Override applied' }));
  });

  it('on 422, surfaces the parsed ValidationReport issue messages as a blocking destructive toast', async () => {
    mockApi.post.mockRejectedValue(
      new MockApiError('failed', 422, { issues: [{ message: 'Area not found in this revision' }] }),
    );
    const { wrapper } = makePreviewWrapper();
    const { result } = renderHook(() => useCreateNavigationOverride(), { wrapper });

    result.current.mutate({ kind: 'EXCLUDE_AREA', subjectAreaKey: 'ghost-area' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Override rejected — validation failed',
        description: 'Area not found in this revision',
        variant: 'destructive',
      }),
    );
  });

  it('on 409, surfaces a conflict toast', async () => {
    mockApi.post.mockRejectedValue(new MockApiError('duplicate override', 409, {}));
    const { wrapper } = makePreviewWrapper();
    const { result } = renderHook(() => useCreateNavigationOverride(), { wrapper });

    result.current.mutate({ kind: 'EXCLUDE_AREA', subjectAreaKey: 'area-1' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Override conflicts with an existing one' }),
    );
  });
});

describe('useDeleteNavigationOverride', () => {
  it('DELETEs .../navigation/overrides/{overrideId} and invalidates on success', async () => {
    mockApi.delete.mockResolvedValue(VALID_DIFF_RESPONSE);
    const { wrapper, queryClient } = makePreviewWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteNavigationOverride(), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.delete).toHaveBeenCalledWith(`${REVISION_BASE}/navigation/overrides/1`);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('on 404, surfaces a toast and re-syncs the overrides list', async () => {
    mockApi.delete.mockRejectedValue(new MockApiError('not found', 404, {}));
    const { wrapper } = makePreviewWrapper();
    const { result } = renderHook(() => useDeleteNavigationOverride(), { wrapper });

    result.current.mutate(999);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not remove override' }));
  });
});
