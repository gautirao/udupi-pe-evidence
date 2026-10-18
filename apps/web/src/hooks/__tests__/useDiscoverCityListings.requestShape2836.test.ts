/**
 * Issue #2836 (batch B of #2750) — wire shape of the anonymous/authed city-listings request.
 *
 * Pins `if (listingPurpose) params.append('listingPurpose', listingPurpose)`
 * (useDiscoverCityListings.ts:401) on the REAL request that reaches fetch. Before this file the
 * wire form was unpinned: cityListingsQueryParams.test.ts asserts the params OBJECT returned by
 * the adapter, not what the hook puts in the URL, and the #2817 file only exercises the default
 * (no purpose) request. Replaces the listingPurpose=rent request-shape row of the legacy
 * e2e/discover/issue-1956-pr4-price-auth-contract.spec.ts (S2-7 / S2-16).
 *
 * '@/lib/api' is NOT mocked: the real client runs; only the Supabase session source and global
 * fetch are stubbed (same technique as useDiscoverCityListings.anonAuthHeader2817.test.ts).
 * Dummy token only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

import { useDiscoverCityListings } from '../useDiscoverCityListings';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const RESPONSE = {
  city: 'udupi',
  limitPerArea: 5,
  areas: [{ areaKey: 'udupi|manipal', areaName: 'Manipal', listings: [] }],
};
const AREA_KEY = 'udupi|manipal';

let fetchSpy: ReturnType<typeof vi.spyOn>;

async function requestUrl(listingPurpose: string | undefined, isAuthenticated = false) {
  const { result } = renderHook(
    () =>
      useDiscoverCityListings({
        city: 'udupi',
        areaKeys: [AREA_KEY],
        listingPurpose,
        isAuthenticated,
      }),
    { wrapper: makeWrapper() },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [rawUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
  return new URL(String(rawUrl), 'http://x');
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(RESPONSE), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('useDiscoverCityListings request shape (#2836)', () => {
  it('rent intent: listingPurpose=rent is on the wire exactly once, with exactly one areaKeys', async () => {
    const url = await requestUrl('rent');

    expect(url.pathname).toBe('/api/discover/cities/udupi/listings');
    expect(url.searchParams.getAll('listingPurpose')).toEqual(['rent']);
    expect(url.searchParams.getAll('areaKeys')).toEqual([AREA_KEY]);
  });

  it('buy intent (control): listingPurpose=sale is sent, and it differs from the rent request', async () => {
    const url = await requestUrl('sale');

    expect(url.searchParams.getAll('listingPurpose')).toEqual(['sale']);
    expect(url.searchParams.getAll('listingPurpose')).not.toEqual(['rent']);
    expect(url.searchParams.getAll('areaKeys')).toEqual([AREA_KEY]);
  });

  it('no intent: the listingPurpose param is entirely absent (never an empty or "undefined" value)', async () => {
    const url = await requestUrl(undefined);

    expect(url.searchParams.has('listingPurpose')).toBe(false);
    expect(url.search).not.toContain('listingPurpose');
    expect(url.search).not.toContain('undefined');
    expect(url.searchParams.getAll('areaKeys')).toEqual([AREA_KEY]);
  });

  it('signed-in rent request carries the same purpose param plus a Bearer header (auth does not alter the filter)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    const url = await requestUrl('rent', true);

    expect(url.searchParams.getAll('listingPurpose')).toEqual(['rent']);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['authorization']).toBe('Bearer test-token');
  });
});
