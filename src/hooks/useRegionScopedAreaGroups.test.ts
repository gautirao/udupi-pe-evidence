/**
 * Issue #1910 (PR2) — useRegionScopedAreaGroups tests.
 *
 * Covers:
 *  1. enabled:false / no fetch when regionKey is null/empty (the critical
 *     guard so Udupi and all non-region-scoped views issue zero extra requests).
 *  2. Correct URL construction, including listingPurpose.
 *  3. Real error-state surfacing on fetch failure (PR2 review fix, Finding 3)
 *     — a rejected api.get() call now resolves to isError:true/error set,
 *     NOT a fake-success empty groups array.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useRegionScopedAreaGroups,
  REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE,
} from './useRegionScopedAreaGroups';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

// ─── Hoisted capture state ────────────────────────────────────────────────

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: { queryKey: undefined as unknown, enabled: undefined as unknown },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...real,
    useQuery: vi.fn((options: Parameters<typeof real.useQuery>[0]) => {
      capturedOptions.queryKey = options.queryKey;
      capturedOptions.enabled = options.enabled;
      return real.useQuery(options);
    }),
  };
});

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

// Issue #1911 PR3 — wraps the same tree in a preview DiscoverDataSource.
function makePreviewWrapper(client: QueryClient, cityId: number, revisionId: number) {
  return function PreviewWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        DiscoverDataSourceProvider,
        { value: { mode: 'preview', cityId, revisionId } },
        children,
      ),
    );
  };
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  capturedOptions.queryKey = undefined;
  capturedOptions.enabled = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── enabled:false guard — the critical Udupi/non-region-scope no-op ──────

describe('useRegionScopedAreaGroups — enabled guard (Issue #1910)', () => {
  it('is disabled (enabled:false) and issues zero network requests when regionKey is null', async () => {
    const { api } = await import('@/lib/api');
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('udupi', null, 'sale'), {
      wrapper: makeWrapper(client),
    });

    expect(capturedOptions.enabled).toBe(false);
    // Give any accidental async fetch a tick to fire, then assert it didn't.
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(api.get)).not.toHaveBeenCalled();
  });

  it('is disabled when regionKey is undefined', () => {
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('udupi', undefined, 'sale'), {
      wrapper: makeWrapper(client),
    });
    expect(capturedOptions.enabled).toBe(false);
  });

  it('is disabled when regionKey is an empty string', () => {
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('udupi', '', 'sale'), {
      wrapper: makeWrapper(client),
    });
    expect(capturedOptions.enabled).toBe(false);
  });

  it('is disabled when citySlug is empty even if regionKey is set', () => {
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('', 'east', 'sale'), {
      wrapper: makeWrapper(client),
    });
    expect(capturedOptions.enabled).toBe(false);
  });

  it('is enabled once both citySlug and regionKey are non-empty', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'bangalore', regionKey: 'east', groups: [] });
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('bangalore', 'east', 'sale'), {
      wrapper: makeWrapper(client),
    });
    expect(capturedOptions.enabled).toBe(true);
  });
});

// ─── URL construction ──────────────────────────────────────────────────────

describe('useRegionScopedAreaGroups — URL construction (Issue #1910)', () => {
  it('builds the correct path with citySlug and regionKey, and appends listingPurpose', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'bangalore', regionKey: 'east', groups: [] });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'sale'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [path, options] = vi.mocked(api.get).mock.calls[0];
    expect(path).toBe('/api/discover/cities/bangalore/regions/east/groups?listingPurpose=sale');
    expect(options).toEqual({ skipAuth: true });
  });

  it('omits the listingPurpose query param when not supplied', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'bangalore', regionKey: 'east', groups: [] });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path] = vi.mocked(api.get).mock.calls[0];
    expect(path).toBe('/api/discover/cities/bangalore/regions/east/groups');
  });

  it('URL-encodes citySlug and regionKey', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'a b', regionKey: 'c/d', groups: [] });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('a b', 'c/d'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path] = vi.mocked(api.get).mock.calls[0];
    expect(path).toBe('/api/discover/cities/a%20b/regions/c%2Fd/groups');
  });

  it('queryKey includes citySlug, regionKey, and listingPurpose dimensions', () => {
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('bangalore', 'east', 'rent'), {
      wrapper: makeWrapper(client),
    });
    const key = capturedOptions.queryKey as unknown[];
    expect(key[0]).toBe(REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE[0]);
    expect(key).toEqual([...REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE, 'bangalore', 'east', 'rent']);
  });
});

// ─── Real error-state surfacing (Issue #1910 PR2 review fix, Finding 3) ─────

describe('useRegionScopedAreaGroups — error handling (Issue #1910)', () => {
  it('surfaces a genuine isError/error state (not a fake-success empty array) when api.get rejects', async () => {
    const { api } = await import('@/lib/api');
    const networkError = new Error('network error');
    vi.mocked(api.get).mockRejectedValue(networkError);
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'sale'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(networkError);
    // A genuine backend failure must NOT resolve to a fake-success empty
    // projection — callers need isError to distinguish "no zones here" from
    // "the fetch failed" (see AreaGroupsLandingPanel's error+retry UI).
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('does not retry on failure (retry: false), so isError settles promptly', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValue(new Error('network error'));
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'sale'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
  });

  it('exposes a refetch function that re-issues the request', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(new Error('network error'));
    vi.mocked(api.get).mockResolvedValueOnce({ citySlug: 'bangalore', regionKey: 'east', groups: [] });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'sale'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    result.current.refetch();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(2);
  });

  it('falls back to an empty groups array when the response body has a malformed groups field', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'bangalore', regionKey: 'east', groups: null });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'sale'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.groups).toEqual([]);
  });

  it('returns the real groups array on a successful response', async () => {
    const { api } = await import('@/lib/api');
    const group = {
      groupSlug: 'tech-corridor',
      name: 'Tech Corridor',
      subtitle: null,
      scopingRegionKey: 'east',
      regionDisplayOrder: 1,
      areaKeys: ['IN|KA|Bengaluru|Whitefield'],
      listingCount: 42,
      focusLat: 12.9,
      focusLon: 77.6,
      minLat: 12.8,
      minLon: 77.5,
      maxLat: 13.0,
      maxLon: 77.7,
      boundsStatus: 'COMPLETE',
    };
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'bangalore', regionKey: 'east', groups: [group] });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'sale'),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.groups).toEqual([group]);
  });
});

// ─── Issue #1911 PR3 — preview-mode threading (AC10 cache-key isolation) ──

describe('useRegionScopedAreaGroups — preview mode (Issue #1911 PR3)', () => {
  it('preview queryKey prepends [preview, cityId, revisionId] to the live key', () => {
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('bangalore', 'east', 'rent'), {
      wrapper: makePreviewWrapper(client, 7, 42),
    });
    expect(capturedOptions.queryKey).toEqual([
      'preview',
      7,
      42,
      ...REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE,
      'bangalore',
      'east',
      'rent',
    ]);
  });

  it('live queryKey is unchanged (no preview triple) — cache isolation proof', () => {
    const client = freshClient();
    renderHook(() => useRegionScopedAreaGroups('bangalore', 'east', 'rent'), {
      wrapper: makeWrapper(client),
    });
    expect(capturedOptions.queryKey).toEqual([
      ...REGION_SCOPED_AREA_GROUPS_QUERY_KEY_BASE,
      'bangalore',
      'east',
      'rent',
    ]);
  });

  it('preview mode requests the admin preview path and sends skipAuth:false', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ citySlug: 'bangalore', regionKey: 'east', groups: [] });
    const client = freshClient();
    const { result } = renderHook(
      () => useRegionScopedAreaGroups('bangalore', 'east', 'rent'),
      { wrapper: makePreviewWrapper(client, 7, 42) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [path, options] = vi.mocked(api.get).mock.calls[0];
    // No listingPurpose query — preview's E2 endpoint accepts none.
    expect(path).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/regions/east/groups');
    expect(options).toEqual({ skipAuth: false });
  });
});
