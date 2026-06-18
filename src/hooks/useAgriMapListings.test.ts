/**
 * Issue #1551 — useAgriMapListings auth-scope cache-key + conditional skipAuth tests.
 *
 * AC6 (SECURITY-CRITICAL): proves that:
 *   1. The REAL hook emits a queryKey that differs between isAuthenticated=true ('authed')
 *      and false ('anon'). Captured by intercepting useQuery with vi.mock (hoisted), which
 *      wraps the real implementation so the rest of the hook still executes.
 *   2. The REAL api.get call options: authed → undefined (no skipAuth); anon → { skipAuth: true }.
 *      Captured from the actual mocked api.get invocation when the queryFn runs.
 *
 * FAIL conditions:
 *   - If the hook drops the authScope segment from queryKey → key[1] assertions fail.
 *   - If skipAuth stops being conditional (always set, or never set) → api.get options fail.
 *   - The QueryClient isolation test fails if TanStack starts treating the two keys as identical.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAgriMapListings, AGRI_MAP_LISTINGS_QUERY_KEY_BASE } from './useAgriMapListings';

// ─── Hoisted capture state ────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() factories, so the variables are available
// inside the factory closure and in the test body.

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: { queryKey: undefined as unknown, queryFn: undefined as unknown },
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
// Intercept useQuery to capture the options the hook passes, then call through to
// the real implementation so the hook behaves normally (queryFn runs, etc.).

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...real,
    useQuery: vi.fn((options: Parameters<typeof real.useQuery>[0]) => {
      // Capture what the hook actually passes — this is the assertion target.
      capturedOptions.queryKey = options.queryKey;
      capturedOptions.queryFn  = options.queryFn;
      // Call the real useQuery so the hook works end-to-end.
      return real.useQuery(options);
    }),
  };
});

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// ─── Cache-key auth-scope: captured from REAL hook via intercepted useQuery ───
//
// These tests FAIL if someone drops the authScope segment ('authed'/'anon') from
// the hook's queryKey or reorders the dimensions — we assert what the hook actually
// passes to useQuery, not a locally re-derived mirror.

describe('useAgriMapListings — REAL queryKey auth-scope (AC6 — SECURITY-CRITICAL)', () => {
  beforeEach(async () => {
    capturedOptions.queryKey = undefined;
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ city: 'udupi', listings: [], truncated: false, limit: 250 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('authed hook emits queryKey with "authed" at auth-scope position', () => {
    const client = freshClient();
    renderHook(
      () => useAgriMapListings('udupi', ['area-1'], 'sale', /* isAuthenticated= */ true),
      { wrapper: makeWrapper(client) },
    );

    const key = capturedOptions.queryKey as unknown[];
    expect(key).toBeDefined();
    // Base segment
    expect(key[0]).toBe('agri-map-listings');
    // Auth-scope literal — FAILS if the hook drops or renames this segment.
    expect(key[1]).toBe('authed');
    expect(key[2]).toBe('udupi');
    expect(key[3]).toBe('sale');
    expect(key[4]).toBe('area-1');
  });

  it('anon hook emits queryKey with "anon" at auth-scope position', () => {
    const client = freshClient();
    renderHook(
      () => useAgriMapListings('udupi', ['area-1'], 'sale', /* isAuthenticated= */ false),
      { wrapper: makeWrapper(client) },
    );

    const key = capturedOptions.queryKey as unknown[];
    expect(key).toBeDefined();
    expect(key[0]).toBe('agri-map-listings');
    // FAILS if the hook drops 'anon' — anon users could read authed-price cache entries.
    expect(key[1]).toBe('anon');
  });

  it('authed and anon queryKeys are structurally distinct (no cache collision)', () => {
    const client = freshClient();
    renderHook(
      () => useAgriMapListings('udupi', ['area-1'], 'sale', true),
      { wrapper: makeWrapper(client) },
    );
    const authedKey = capturedOptions.queryKey as unknown[];

    capturedOptions.queryKey = undefined;

    renderHook(
      () => useAgriMapListings('udupi', ['area-1'], 'sale', false),
      { wrapper: makeWrapper(client) },
    );
    const anonKey = capturedOptions.queryKey as unknown[];

    expect(authedKey).not.toEqual(anonKey);
    expect(authedKey[1]).toBe('authed');
    expect(anonKey[1]).toBe('anon');
    // All dimensions beyond auth-scope must match (same query, different scope).
    expect(authedKey.slice(2)).toEqual(anonKey.slice(2));
  });

  it('base key structure: [base, authScope, city, listingPurpose, ...sortedAreaKeys]', () => {
    const client = freshClient();
    renderHook(
      () => useAgriMapListings('udupi', ['z-area', 'a-area'], 'rent', true),
      { wrapper: makeWrapper(client) },
    );

    const key = capturedOptions.queryKey as unknown[];
    expect(key[0]).toBe('agri-map-listings');
    expect(key[1]).toBe('authed');
    expect(key[2]).toBe('udupi');
    expect(key[3]).toBe('rent');
    // Area keys are sorted ascending by the hook before being spread into the key.
    expect(key[4]).toBe('a-area');
    expect(key[5]).toBe('z-area');
  });

  it('undefined listingPurpose encodes as null in key — stable across renders', () => {
    const client = freshClient();
    renderHook(
      () => useAgriMapListings('udupi', ['area-1'], undefined, false),
      { wrapper: makeWrapper(client) },
    );

    const key = capturedOptions.queryKey as unknown[];
    expect(key[3]).toBeNull();
  });
});

// ─── skipAuth captured from REAL api.get invocation (AC6 — SECURITY-CRITICAL) ─
//
// The real queryFn runs (useQuery mock calls through). We assert what the hook
// actually passes as the second argument to api.get — not a locally re-derived value.
// FAILS if skipAuth becomes unconditional (always/never set).

describe('useAgriMapListings — REAL skipAuth from api.get (AC6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authed call passes NO skipAuth option to api.get', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ city: 'udupi', listings: [], truncated: false, limit: 250 });

    const client = freshClient();
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ['area-1'], 'sale', /* isAuthenticated= */ true),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(api.get).mock.calls[0];
    // Authed: no options → api.ts injects Authorization header.
    // FAILS if the hook passes skipAuth:true for authed users (would suppress auth header).
    expect(options).toBeUndefined();
  });

  it('anon call passes { skipAuth: true } to api.get', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ city: 'udupi', listings: [], truncated: false, limit: 250 });

    const client = freshClient();
    const { result } = renderHook(
      () => useAgriMapListings('udupi', ['area-1'], 'sale', /* isAuthenticated= */ false),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(api.get)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(api.get).mock.calls[0];
    // Anon: skipAuth:true → api.ts must NOT send Authorization header.
    // FAILS if the hook stops being conditional (e.g. someone removes the ternary).
    expect(options).toEqual({ skipAuth: true });
  });
});

// ─── AGRI_MAP_LISTINGS_QUERY_KEY_BASE export contract ─────────────────────────

describe('AGRI_MAP_LISTINGS_QUERY_KEY_BASE', () => {
  it('is a readonly tuple containing the base key string', () => {
    expect(AGRI_MAP_LISTINGS_QUERY_KEY_BASE).toEqual(['agri-map-listings']);
    expect(Array.isArray(AGRI_MAP_LISTINGS_QUERY_KEY_BASE)).toBe(true);
  });
});

// ─── QueryClient cache isolation sanity check ─────────────────────────────────
// Seeds real QueryClient entries using the actual key shape from the hook export.
// Proves TanStack treats the two auth-scoped keys as separate cache buckets.
// Kept from original as real coverage of the cache isolation contract.

describe('QueryClient — anon and authed cache entries are distinct', () => {
  it('QueryClient treats anon and authed keys as separate cache entries', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const anonKey   = [...AGRI_MAP_LISTINGS_QUERY_KEY_BASE, 'anon',   'udupi', 'sale', 'area-1'];
    const authedKey = [...AGRI_MAP_LISTINGS_QUERY_KEY_BASE, 'authed', 'udupi', 'sale', 'area-1'];

    // Seed an anon response.
    client.setQueryData(anonKey, { city: 'udupi', listings: [], truncated: false, limit: 250 });

    // Authed key must NOT hit the anon cache entry.
    const authedCachedData = client.getQueryData(authedKey);
    expect(authedCachedData).toBeUndefined();

    client.clear();
  });
});
