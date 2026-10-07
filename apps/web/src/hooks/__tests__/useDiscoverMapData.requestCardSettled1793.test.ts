/**
 * Issue #1793 PR-C (fix cycle 1, CR F1) — the "own query settled" signals that gate the
 * "Request a property" card, measured against the REAL react-query hooks (only `api.get` is a
 * deterministic stand-in).
 *
 * The contract: a scope's query is "settled" when it has loaded, not failed, and is NOT serving the
 * PREVIOUS key's response (keepPreviousData placeholder). Crucially this is NOT `isFetching`:
 *   - an anonymous radius change / viewport re-search keeps the previous [] on screen while the new
 *     request is in flight and the shared `isFetching` is false for anonymous callers (so the card
 *     must key off the placeholder flag);
 *   - a same-key background refetch IS settled and must not read as "not settled".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ResultScope } from '@/features/discover/state/resultScope';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: mockDiscoverListings,
}));
vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: mockTrendsOptions,
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: mockSchoolById,
}));
vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class extends Error {},
}));

import { useDiscoverMapData } from '../useDiscoverMapData';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const BASE_PARAMS = {
  city: 'bangalore',
  selectedArea: null as AreaPoint | null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: false,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
  journey: 'school-first' as const,
};

const isSchoolRadiusPath = (p: unknown) => String(p).includes('/school-radius-listings');
const isCityListingsPath = (p: unknown) => /\/cities\/[^/]+\/listings\?/.test(String(p));

/** A promise the test resolves by hand, to hold a request in flight. */
function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const schoolPage = (hasMore = false) => ({ content: [], hasMore, page: 0, size: 50 });

beforeEach(() => {
  vi.clearAllMocks();
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockDiscoverListings.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

describe('schoolRadiusPanelSettled — anonymous school-radius card source', () => {
  const render = () =>
    renderHook(
      ({ radius }: { radius: number }) =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          filters: { schoolLat: 12.9, schoolLon: 77.5, schoolRadiusKm: radius },
        }),
      { wrapper: makeWrapper(), initialProps: { radius: 1 } },
    );

  it('F1a: a radius change over a placeholder [] is NOT settled while the new radius loads, though panel loading and isFetching read false', async () => {
    const radius3 = deferred<ReturnType<typeof schoolPage>>();
    mockApiGet.mockImplementation((path: string) => {
      if (!isSchoolRadiusPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      return String(path).includes('schoolRadiusKm=3') ? radius3.promise : Promise.resolve(schoolPage());
    });
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.schoolRadiusPanelSettled).toBe(true));

    rerender({ radius: 3 });
    // The previous radius' [] is still served (keepPreviousData) while the 3 km request is held.
    await waitFor(() => expect(result.current.schoolRadiusListingsLoading).toBe(false));
    expect(result.current.schoolRadiusPanelLoading).toBe(false); // the existing loading signal does NOT cover this window
    expect(result.current.isFetching).toBe(false); // anonymous callers never raise the shared flag
    expect(result.current.schoolRadiusPanelSettled).toBe(false);

    await act(async () => {
      radius3.resolve(schoolPage());
      await radius3.promise;
    });
    await waitFor(() => expect(result.current.schoolRadiusPanelSettled).toBe(true));
  });

  it('F1c: a same-key background refetch stays settled', async () => {
    const held = deferred<ReturnType<typeof schoolPage>>();
    let n = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (!isSchoolRadiusPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      n += 1;
      return n === 1 ? Promise.resolve(schoolPage()) : held.promise;
    });
    const { result } = render();
    await waitFor(() => expect(result.current.schoolRadiusPanelSettled).toBe(true));

    act(() => {
      result.current.refetchSchoolRadiusListings();
    });
    await waitFor(() => expect(n).toBe(2)); // the refetch is genuinely in flight
    expect(result.current.schoolRadiusPanelSettled).toBe(true);
    await act(async () => {
      held.resolve(schoolPage());
      await held.promise;
    });
  });

  it('not settled while the first load is pending, and not settled on a failed request', async () => {
    const first = deferred<ReturnType<typeof schoolPage>>();
    mockApiGet.mockImplementation((path: string) =>
      isSchoolRadiusPath(path) ? first.promise : Promise.resolve({ city: 'bangalore', areas: [] }),
    );
    const { result, unmount } = render();
    expect(result.current.schoolRadiusPanelSettled).toBe(false);
    unmount();

    mockApiGet.mockImplementation((path: string) =>
      isSchoolRadiusPath(path) ? Promise.reject(new Error('500')) : Promise.resolve({ city: 'bangalore', areas: [] }),
    );
    const failed = render();
    await waitFor(() => expect(failed.result.current.isErrorSchoolRadiusListings).toBe(true));
    expect(failed.result.current.schoolRadiusPanelSettled).toBe(false);
  });

  it('exposes the page-cap flag the panel needs for F2', async () => {
    mockApiGet.mockImplementation((path: string) =>
      isSchoolRadiusPath(path) ? Promise.resolve(schoolPage(true)) : Promise.resolve({ city: 'bangalore', areas: [] }),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.schoolRadiusPanelSettled).toBe(true));
    expect(result.current.schoolRadiusHasMore).toBe(true);
  });

  it('not settled with no school coordinates (the query is disabled)', () => {
    const { result } = renderHook(() => useDiscoverMapData({ ...BASE_PARAMS, filters: {} }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.schoolRadiusPanelSettled).toBe(false);
  });
});

describe('schoolRadiusPanelSettled — signed-in card source (discover listings)', () => {
  const params = {
    ...BASE_PARAMS,
    isAuthenticated: true,
    filters: { schoolLat: 12.9, schoolLon: 77.5, schoolRadiusKm: 3 },
  };
  const page = { content: [], totalElements: 0, totalPages: 0 };
  const run = (query: Record<string, unknown>) => {
    mockApiGet.mockImplementation(() => new Promise<never>(() => undefined));
    mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null, refetch: vi.fn(), ...query });
    return renderHook(() => useDiscoverMapData(params), { wrapper: makeWrapper() }).result;
  };

  it('settled once the listings page has loaded, and a background refetch (isFetching) keeps it settled', () => {
    expect(run({ data: page }).current.schoolRadiusPanelSettled).toBe(true);
    expect(run({ data: page, isFetching: true }).current.schoolRadiusPanelSettled).toBe(true);
  });

  it('not settled while loading, with no data, or on error', () => {
    expect(run({ isLoading: true, isFetching: true }).current.schoolRadiusPanelSettled).toBe(false);
    expect(run({}).current.schoolRadiusPanelSettled).toBe(false);
    expect(run({ data: page, error: new Error('500') }).current.schoolRadiusPanelSettled).toBe(false);
  });
});

describe('isPlaceholderAnonViewport — anon "Search this area" re-search', () => {
  const scope = (s: number): ResultScope => ({ kind: 'VIEWPORT', bounds: { s, w: 77.5, n: s + 0.06, e: 77.56 } });
  const A = scope(12.9);
  const B = scope(13.1);
  const render = () =>
    renderHook(
      ({ resultScope }: { resultScope: ResultScope | null }) =>
        useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first', resultScope }),
      { wrapper: makeWrapper(), initialProps: { resultScope: A as ResultScope | null } },
    );

  it('F1b: while viewport B loads over A\'s [] the placeholder flag is true (panel loading is false); false once B settles', async () => {
    const b = deferred<{ city: string; areas: never[] }>();
    mockApiGet.mockImplementation((path: string) => {
      if (!isCityListingsPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      return String(path).includes('bbox=13.') ? b.promise : Promise.resolve({ city: 'bangalore', areas: [] });
    });
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.anonViewportListingsLoading).toBe(false));
    await waitFor(() => expect(result.current.isPlaceholderAnonViewport).toBe(false));

    rerender({ resultScope: B });
    await waitFor(() => expect(result.current.isPlaceholderAnonViewport).toBe(true));
    expect(result.current.anonViewportListingsLoading).toBe(false);

    await act(async () => {
      b.resolve({ city: 'bangalore', areas: [] });
      await b.promise;
    });
    await waitFor(() => expect(result.current.isPlaceholderAnonViewport).toBe(false));
  });

  it('F1c: a same-key refetch of the viewport is not a placeholder', async () => {
    const held = deferred<{ city: string; areas: never[] }>();
    let n = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (!isCityListingsPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      n += 1;
      return n === 1 ? Promise.resolve({ city: 'bangalore', areas: [] }) : held.promise;
    });
    const { result } = render();
    await waitFor(() => expect(n).toBe(1));
    await waitFor(() => expect(result.current.anonViewportListingsLoading).toBe(false));
    act(() => {
      result.current.refetchAnonViewport();
    });
    await waitFor(() => expect(n).toBe(2));
    expect(result.current.isPlaceholderAnonViewport).toBe(false);
    await act(async () => {
      held.resolve({ city: 'bangalore', areas: [] });
      await held.promise;
    });
  });

  it('gated on being an anon viewport: false when no viewport scope is committed', () => {
    mockApiGet.mockImplementation(() => Promise.resolve({ city: 'bangalore', areas: [] }));
    const { result } = renderHook(() => useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first' }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isPlaceholderAnonViewport).toBe(false);
  });
});

describe('isPlaceholderAreaListings — area query', () => {
  const area: AreaPoint = {
    areaKey: 'IN|KA|Bangalore|X',
    areaLabel: 'X',
    geo_center_lat: 12.9,
    geo_center_lon: 77.5,
    bbox: null,
  };
  const render = () =>
    renderHook(
      ({ priceMin }: { priceMin?: number }) =>
        useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first', selectedArea: area, filters: { priceMin } }),
      { wrapper: makeWrapper(), initialProps: {} as { priceMin?: number } },
    );

  it('a filter re-key serves the previous [] as a placeholder (isFetching is also true); a same-key refetch is not a placeholder', async () => {
    const held = deferred<{ city: string; areas: never[] }>();
    mockApiGet.mockImplementation((path: string) => {
      if (!isCityListingsPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      return String(path).includes('minPrice') ? held.promise : Promise.resolve({ city: 'bangalore', areas: [] });
    });
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.isLoadingAreaListings).toBe(false));
    await waitFor(() => expect(result.current.isFetchingAreaListings).toBe(false));
    expect(result.current.isPlaceholderAreaListings).toBe(false);

    rerender({ priceMin: 50 });
    await waitFor(() => expect(result.current.isPlaceholderAreaListings).toBe(true));
    expect(result.current.isFetchingAreaListings).toBe(true);
    expect(result.current.isLoadingAreaListings).toBe(false);

    await act(async () => {
      held.resolve({ city: 'bangalore', areas: [] });
      await held.promise;
    });
    await waitFor(() => expect(result.current.isPlaceholderAreaListings).toBe(false));

    // Same key, background refetch: fetching is true but the data IS this key's own result.
    const second = deferred<{ city: string; areas: never[] }>();
    mockApiGet.mockImplementation((path: string) =>
      isCityListingsPath(path) ? second.promise : Promise.resolve({ city: 'bangalore', areas: [] }),
    );
    act(() => {
      result.current.refetchAreaListings();
    });
    await waitFor(() => expect(result.current.isFetchingAreaListings).toBe(true));
    expect(result.current.isPlaceholderAreaListings).toBe(false);
    await act(async () => {
      second.resolve({ city: 'bangalore', areas: [] });
      await second.promise;
    });
  });
});
