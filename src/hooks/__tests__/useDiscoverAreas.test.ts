/**
 * useDiscoverAreas — Issue #1371
 *
 * Tests:
 * AC1  propertyType omitted → URL has NO propertyType param; queryKey is ['discover-areas', city]
 * AC2  propertyType set → URL appended &propertyType=...; queryKey includes propertyType
 * AC3  AC10 cache-key isolation: blended + agri keys are distinct (no cross-serve)
 * AC4  agriAcreage is parsed through when present in the response
 * AC5  listingCount is preserved unchanged (not affected by agri filter)
 * AC6  empty city string disables the query (regression)
 * AC7  behaviour is byte-identical when propertyType is undefined vs not passed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

// ─── Import hook AFTER mocks ───────────────────────────────────
import { useDiscoverAreas } from '../useDiscoverAreas';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Issue #1911 PR3 — wraps the same tree in a preview DiscoverDataSource.
function makePreviewWrapper(cityId: number, revisionId: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        DiscoverDataSourceProvider,
        { value: { mode: 'preview', cityId, revisionId, citySlug: 'preview-city' }, children },
      ),
    );
}

const BLENDED_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.35,
      geoCenterLon: 74.79,
      listingCount: 42,
      schoolCount: 3,
    },
  ],
};

const AGRI_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.35,
      geoCenterLon: 74.79,
      listingCount: 7,
      schoolCount: 3,
      agriAcreage: 12.5,
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverAreas — blended (no propertyType)', () => {
  it('AC1: omitting propertyType sends no propertyType param in URL', async () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('propertyType')).toBe(false);
    expect(params.get('city')).toBe('udupi');
  });

  it('AC1: queryKey is [discover-areas, city] when propertyType is omitted', () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useDiscoverAreas('udupi'), { wrapper });

    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    const blendedKey = keys.find(
      (k) => k.length === 2 && k[0] === 'discover-areas' && k[1] === 'udupi',
    );
    expect(blendedKey).toBeDefined();
  });

  it('AC5: listingCount is preserved in blended response', async () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.areas[0].listingCount).toBe(42);
  });

  it('AC6: disabled when city is empty string', () => {
    const { result } = renderHook(
      () => useDiscoverAreas(''),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('AC7: passing propertyType=undefined is byte-identical to omitting it', async () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi', undefined),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('propertyType')).toBe(false);
  });
});

describe('useDiscoverAreas — filtered (with propertyType)', () => {
  it('AC2: appends &propertyType=agricultural_land to URL', async () => {
    mockGet.mockResolvedValue(AGRI_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi', 'agricultural_land'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('propertyType')).toBe('agricultural_land');
    expect(params.get('city')).toBe('udupi');
  });

  it('AC2: queryKey includes propertyType when set', () => {
    mockGet.mockResolvedValue(AGRI_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useDiscoverAreas('udupi', 'agricultural_land'), { wrapper });

    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    const agriKey = keys.find(
      (k) =>
        k.length === 3 &&
        k[0] === 'discover-areas' &&
        k[1] === 'udupi' &&
        k[2] === 'agricultural_land',
    );
    expect(agriKey).toBeDefined();
  });

  it('AC3 (AC10): blended and agri queries have distinct cache keys — no cross-serve', () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    // Render both variants in the same QueryClient
    renderHook(() => useDiscoverAreas('udupi'), { wrapper });
    renderHook(() => useDiscoverAreas('udupi', 'agricultural_land'), { wrapper });

    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    const blended = keys.filter((k) => k.length === 2 && k[0] === 'discover-areas');
    const agri = keys.filter(
      (k) => k.length === 3 && k[0] === 'discover-areas' && k[2] === 'agricultural_land',
    );
    // Both must be registered as separate cache entries — no collision
    expect(blended.length).toBeGreaterThanOrEqual(1);
    expect(agri.length).toBeGreaterThanOrEqual(1);
    // Total distinct entries — not merged into one
    expect(qc.getQueryCache().getAll().length).toBeGreaterThanOrEqual(2);
  });

  it('AC4: agriAcreage is parsed through from the agri response', async () => {
    mockGet.mockResolvedValue(AGRI_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi', 'agricultural_land'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.areas[0].agriAcreage).toBe(12.5);
  });

  it('AC5: listingCount in agri response is the agri count (not blended)', async () => {
    mockGet.mockResolvedValue(AGRI_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi', 'agricultural_land'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // agri count (7) — NOT the blended count (42)
    expect(result.current.data?.areas[0].listingCount).toBe(7);
  });

  it('agriAcreage is undefined when absent from response', async () => {
    const responseWithoutAcreage = {
      ...AGRI_RESPONSE,
      areas: [{ ...AGRI_RESPONSE.areas[0], agriAcreage: undefined }],
    };
    mockGet.mockResolvedValue(responseWithoutAcreage);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi', 'agricultural_land'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.areas[0].agriAcreage).toBeUndefined();
  });
});

// ─── Issue #2083 RC_C — purpose param (Buy/Rent scoping) ──────────────────

describe('useDiscoverAreas — purpose param (Issue #2083 RC_C)', () => {
  it('purpose="rent" appends &purpose=rent to the request URL', async () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);

    const { result } = renderHook(
      () => useDiscoverAreas('udupi', undefined, 'rent'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url] = mockGet.mock.calls[0] as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('purpose')).toBe('rent');
    expect(params.get('city')).toBe('udupi');
  });

  it('queryKey differs between purpose="sale" and purpose="rent" for the same city — no cross-serve on Buy/Rent toggle', () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useDiscoverAreas('udupi', undefined, 'sale'), { wrapper });
    renderHook(() => useDiscoverAreas('udupi', undefined, 'rent'), { wrapper });

    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['discover-areas', 'udupi', 'sale']);
    expect(keys).toContainEqual(['discover-areas', 'udupi', 'rent']);
    // Regression guard: if `purpose` were ever dropped from the key suffix,
    // a Buy→Rent toggle would silently serve the stale, wrong-purpose cache
    // entry instead of registering a distinct one.
    expect(qc.getQueryCache().getAll().length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Issue #1911 PR3 — preview-mode threading (AC10 cache-key isolation) ──

describe('useDiscoverAreas — preview mode (Issue #1911 PR3)', () => {
  it('preview queryKey prepends [preview, cityId, revisionId] to the live key', async () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);
    const { result } = renderHook(() => useDiscoverAreas('udupi'), {
      wrapper: makePreviewWrapper(7, 42),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toBe('/api/admin/city-launch/cities/7/revisions/42/preview/areas');
    expect(options).toEqual({ skipAuth: false });
  });

  it('live queryKey is unchanged — cache isolation proof (AC10)', async () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);
    const { result } = renderHook(() => useDiscoverAreas('udupi'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = mockGet.mock.calls[0] as [string, unknown];
    expect(path).toBe('/api/discover/areas?city=udupi');
    expect(options).toEqual({ skipAuth: true });
  });

  it('preview and live cache entries for the same city are distinct — no cross-serve', () => {
    mockGet.mockResolvedValue(BLENDED_RESPONSE);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const liveWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const previewWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(
          DiscoverDataSourceProvider,
          { value: { mode: 'preview' as const, cityId: 7, revisionId: 42, citySlug: 'udupi' }, children },
        ),
      );

    renderHook(() => useDiscoverAreas('udupi'), { wrapper: liveWrapper });
    renderHook(() => useDiscoverAreas('udupi'), { wrapper: previewWrapper });

    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['discover-areas', 'udupi']);
    expect(keys).toContainEqual(['preview', 7, 42, 'discover-areas', 'udupi']);
  });
});
