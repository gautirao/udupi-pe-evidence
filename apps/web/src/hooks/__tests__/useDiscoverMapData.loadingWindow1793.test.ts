/**
 * Issue #1793 SR-024 (PR-A review fix cycle 1) — the loading window of the anon school-radius
 * request, and the scoping of the anon viewport "last good" cards.
 *
 * A1: `listingDataLoading` is `isAuthenticated && discoverListingsLoading` (always false for anon),
 *   so the school panel had no loading signal while the anon school-radius query was pending or
 *   retrying (App.tsx's bare QueryClient retries a failing GET ~3x) and rendered "No homes within
 *   N km". `schoolRadiusPanelLoading` is that missing signal, gated like the error (enabled && anon).
 *   The REAL `useSchoolRadiusListings` + react-query run here (retry enabled), only `api.get` is a
 *   deterministic stand-in.
 * A2: `anonViewportLastGoodRef` must hold only the CURRENT viewport's cards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ResultScope } from '@/features/discover/state/resultScope';

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

/** retry ENABLED (1 retry, ~instant delay) — the production default is 3 retries with backoff. */
function makeWrapper(gcTime?: number) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 1, ...(gcTime != null ? { gcTime } : {}) } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const BASE_PARAMS = {
  city: 'bangalore',
  selectedArea: null as null,
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
const SCHOOL_FILTERS = { schoolLat: 12.9, schoolLon: 77.5, schoolRadiusKm: 3 };

const isSchoolRadiusPath = (p: unknown) => String(p).includes('/school-radius-listings');
const isListingsPath = (p: unknown) => /\/cities\/[^/]+\/listings\?/.test(String(p));
const schoolRadiusCalls = () => mockApiGet.mock.calls.filter(([p]) => isSchoolRadiusPath(p)).length;

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

describe('Issue #1793 A1 — anon school-radius loading window (real react-query, retry enabled)', () => {
  it('anon: loading stays true while pending AND during the retry window, flips to error after the final failure, and a data-less Retry is loading again (never settled-empty)', async () => {
    // call 1 rejects at once, call 2 (the retry) is held pending, call 3 (user Retry) is held pending.
    let rejectSecond: (e: Error) => void = () => undefined;
    const second = new Promise<never>((_, rej) => {
      rejectSecond = rej;
    });
    const third = new Promise<never>(() => undefined);
    let n = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (!isSchoolRadiusPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      n += 1;
      if (n === 1) return Promise.reject(new Error('500'));
      if (n === 2) return second;
      return third;
    });

    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, filters: SCHOOL_FILTERS }),
      { wrapper: makeWrapper() },
    );

    // (1) initial pending
    expect(result.current.schoolRadiusPanelLoading).toBe(true);
    expect(result.current.isErrorSchoolRadiusListings).toBe(false);

    // (2) retry window: the first attempt has FAILED, the retry is in flight
    await waitFor(() => expect(schoolRadiusCalls()).toBe(2));
    expect(result.current.schoolRadiusPanelLoading).toBe(true);
    expect(result.current.isErrorSchoolRadiusListings).toBe(false);

    // (3) final failure: error block, no loading
    await act(async () => {
      rejectSecond(new Error('500'));
      await second.catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isErrorSchoolRadiusListings).toBe(true));
    expect(result.current.schoolRadiusPanelLoading).toBe(false);

    // (4) Retry on a data-less error: the query returns to pending => loading, not an empty state
    act(() => {
      result.current.refetchSchoolRadiusListings();
    });
    await waitFor(() => expect(schoolRadiusCalls()).toBe(3));
    expect(result.current.schoolRadiusPanelLoading).toBe(true);
    expect(result.current.isErrorSchoolRadiusListings).toBe(false);
  });

  it('signed-in control: the panel loading signal is anon-only and listingDataLoading is untouched', () => {
    mockApiGet.mockImplementation((path: string) =>
      isSchoolRadiusPath(path) ? new Promise<never>(() => undefined) : Promise.resolve({ city: 'bangalore', areas: [] }),
    );
    mockDiscoverListings.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: vi.fn(),
    });
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, isAuthenticated: true, filters: SCHOOL_FILTERS }),
      { wrapper: makeWrapper() },
    );
    // The school-radius query IS in flight (marker fallback) ...
    expect(result.current.schoolRadiusListingsLoading).toBe(true);
    // ... but it is not the signed-in panel's card source: panel loading stays off, and the
    // signed-in loading signal still comes from the auth listings exactly as before.
    expect(result.current.schoolRadiusPanelLoading).toBe(false);
    expect(result.current.listingDataLoading).toBe(true);
  });

  it('gated on the query being ENABLED: with no school coordinates the panel loading signal is false', () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, filters: {} }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.schoolRadiusPanelLoading).toBe(false);
  });
});

describe('Issue #1793 A2 — anon viewport last-good cards belong to the CURRENT viewport only', () => {
  const scope = (s: number): ResultScope => ({
    kind: 'VIEWPORT',
    bounds: { s, w: 77.5, n: s + 0.06, e: 77.56 },
  });
  const VIEWPORT_A = scope(12.9);
  const VIEWPORT_B = scope(13.1);
  const listingFor = (id: string) => ({
    city: 'bangalore',
    areas: [{ areaKey: 'IN|KA|Bangalore|X', listings: [{ id }] }],
  });

  /** Viewport A (lat 12.9..) answers; viewport B (lat 13.1..) fails. */
  function routeAByBbox(failB: boolean) {
    mockApiGet.mockImplementation((path: string) => {
      if (!isListingsPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      if (String(path).includes('bbox=12.')) return Promise.resolve(listingFor('card-A'));
      return failB ? Promise.reject(new Error('500')) : Promise.resolve(listingFor('card-B'));
    });
  }

  const render = (gcTime?: number) =>
    renderHook(
      ({ resultScope }: { resultScope: ResultScope | null }) =>
        useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first', resultScope }),
      { wrapper: makeWrapper(gcTime), initialProps: { resultScope: VIEWPORT_A as ResultScope | null } },
    );

  it('a failure on viewport B never shows viewport A\'s cards', async () => {
    routeAByBbox(true);
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['card-A']));

    rerender({ resultScope: VIEWPORT_B });
    await waitFor(() => expect(result.current.isErrorAnonViewport).toBe(true));
    expect(result.current.anonViewportListings).toEqual([]);
  });

  it('control: a transient failure on the SAME viewport still retains that viewport\'s last good cards', async () => {
    let failNext = false;
    mockApiGet.mockImplementation((path: string) => {
      if (!isListingsPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      return failNext ? Promise.reject(new Error('500')) : Promise.resolve(listingFor('card-A'));
    });
    const { result } = render();
    await waitFor(() => expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['card-A']));

    failNext = true;
    await act(async () => {
      result.current.refetchAnonViewport();
    });
    await waitFor(() => expect(result.current.isErrorAnonViewport).toBe(true));
    expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['card-A']);
  });

  it('leaving the anon viewport clears the retained cards: re-entering and failing shows none', async () => {
    let fail = false;
    mockApiGet.mockImplementation((path: string) => {
      if (!isListingsPath(path)) return Promise.resolve({ city: 'bangalore', areas: [] });
      return fail ? Promise.reject(new Error('500')) : Promise.resolve(listingFor('card-A'));
    });
    // gcTime 0: the viewport's cache entry is dropped when it is left, so re-entry really refetches.
    const { result, rerender } = render(0);
    await waitFor(() => expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['card-A']));

    rerender({ resultScope: null });
    await waitFor(() => expect(result.current.isAnonViewport).toBe(false));
    expect(result.current.anonViewportListings).toEqual([]);

    fail = true;
    rerender({ resultScope: VIEWPORT_A });
    await waitFor(() => expect(result.current.isErrorAnonViewport).toBe(true));
    expect(result.current.anonViewportListings).toEqual([]);
  });
});
