/**
 * Issue #2817 — outgoing-request guard for the anonymous Discover listing request.
 *
 * Pins apps/web/src/lib/api.ts (`if (!skipAuth) { token = await getAuthToken(); if (token) ... }`)
 * as exercised by the non-preview queryFn in useDiscoverCityListings.ts, which deliberately
 * does NOT pass skipAuth (#1616): an anonymous session must reach fetch with only the two
 * default headers (no Authorization, no token in the URL, no credentials), while a signed-in
 * session carries `Bearer <token>` on the same request.
 *
 * Scope, stated honestly: areaKeys are passed straight into the hook here, so this proves the
 * HOOK forwards the selected areaKeys unwidened (exactly one in, exactly one on the wire). It
 * does NOT prove the Discover caller maps a single-area `node=` to one areaKeys; that
 * caller-side node -> areaKeys scoping, which AC5.8 of
 * e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts exercised through the page, is NOT
 * replaced here. The header/auth half of AC5.8 is what this file replaces when PR-7 retires it.
 *
 * '@/lib/api' is deliberately NOT mocked: the real client runs, only the Supabase session
 * source and global fetch are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────
// vi.mock (not doMock): the hook statically imports '@/lib/api', which statically imports
// the Supabase client, so the mock must be registered before module evaluation.
const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

// ─── Import after mocks ───────────────────────────────────────
import { useDiscoverCityListings } from '../useDiscoverCityListings';

// ─── Helpers ──────────────────────────────────────────────────

// Fresh client per test: the query key carries no token, so a shared client would turn
// later arms into cache hits and never reach fetch.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const RESPONSE = {
  city: 'udupi',
  limitPerArea: 5,
  areas: [{ areaKey: 'udupi|manipal', areaName: 'Manipal', listings: [] }],
};

const AREA_KEY = 'udupi|manipal';
const LISTINGS_PATH = '/api/discover/cities/udupi/listings';

let fetchSpy: ReturnType<typeof vi.spyOn>;

// Runs the real hook once and returns what actually reached fetch.
async function runAndCaptureRequest(isAuthenticated: boolean) {
  const { result } = renderHook(
    () => useDiscoverCityListings({ city: 'udupi', areaKeys: [AREA_KEY], isAuthenticated }),
    { wrapper: makeWrapper() },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [rawUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  const url = new URL(String(rawUrl), 'http://x');
  // api.ts always passes a plain object; lower-case the names for case-insensitive checks.
  const byLowerName = Object.fromEntries(
    Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );
  return { url, init, names: Object.keys(byLowerName).sort(), byLowerName };
}

// No credential-looking material may ride the query string.
function expectNoTokenInUrl(url: URL) {
  for (const needle of ['token', 'access_token', 'dummy', 'bearer']) {
    expect(url.search.toLowerCase()).not.toContain(needle);
  }
}

beforeEach(() => {
  mockGetSession.mockReset();
  // Fresh Response per call: a body can only be read once.
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(RESPONSE), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('useDiscoverCityListings outgoing request layer (#2817)', () => {
  it('#2817 A: anonymous session sends only the default headers, no token or credentials, and exactly one areaKeys', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { url, init, names } = await runAndCaptureRequest(false);

    expect(url.pathname).toBe(LISTINGS_PATH);
    expect(init.method).toBe('GET');
    // Allow-list: any new header (Authorization, apikey, x-auth-token, ...) turns this red.
    expect(names).toEqual(['accept', 'content-type']);
    expect(names).not.toContain('authorization');
    expectNoTokenInUrl(url);
    expect(init.credentials).not.toBe('include');
    expect(url.searchParams.getAll('areaKeys')).toEqual([AREA_KEY]);
  });

  it('#2817 A2: session with an empty access_token still sends only the default headers', async () => {
    // Pins the truthiness guard (`if (token)`), not a null check.
    mockGetSession.mockResolvedValue({ data: { session: { access_token: '' } } });

    const { url, init, names } = await runAndCaptureRequest(false);

    expect(url.pathname).toBe(LISTINGS_PATH);
    expect(names).toEqual(['accept', 'content-type']);
    expect(names).not.toContain('authorization');
    expectNoTokenInUrl(url);
    expect(init.credentials).not.toBe('include');
  });

  it('#2817 B (control): signed-in session sends Authorization "Bearer <token>" on the same request', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'dummy-token' } } });

    const { url, init, byLowerName } = await runAndCaptureRequest(true);

    expect(url.pathname).toBe(LISTINGS_PATH);
    expect(init.method).toBe('GET');
    expect(byLowerName['authorization']).toBe('Bearer dummy-token');
    expect(url.searchParams.getAll('areaKeys')).toEqual([AREA_KEY]);
  });
});
