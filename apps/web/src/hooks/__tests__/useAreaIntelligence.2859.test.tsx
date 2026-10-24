/**
 * #2859 batch B5 (umbrella #2750) — L7 AI13.path: the REAL useAreaIntelligence hook's request on the wire.
 *
 * Replaces the "hook issues /api/trends/area-intelligence?city&areaKey publicly" hop of the legacy
 * e2e/area-intelligence-1528.spec.ts (whose page.route stubs only echoed themselves).
 *
 * '@/lib/api' is NOT mocked: the real client builds the URL and headers. Only global fetch and the
 * Supabase session source are stubbed (same technique as useDiscoverCityListings.requestShape2836).
 * A session token IS available, so `skipAuth: true` is observable: the request carries no Authorization
 * header and the session is never read. Dummy token only. Loopback base URL (VITE_API_BASE_URL unset).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

import { useAreaIntelligence } from '../useAreaIntelligence';

const AREA_KEY = 'IN|KA|Udupi|Kodi Bengre';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'dummy-token-2859' } } });
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify({ available: false }), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('useAreaIntelligence request on the wire (#2859 B5 L7 AI13.path)', () => {
  it('issues exactly one public GET /api/trends/area-intelligence?city&areaKey (encoded pipe key, no Authorization) and nothing while areaKey is empty', async () => {
    // Control first, in the same it: enabled=false (empty areaKey) issues no request at all.
    const idle = renderHook(() => useAreaIntelligence('udupi', ''), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
    idle.unmount();

    const { result } = renderHook(() => useAreaIntelligence('udupi', AREA_KEY), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe('/api/trends/area-intelligence');
    expect([...url.searchParams.keys()]).toEqual(['city', 'areaKey']);
    expect(url.searchParams.get('city')).toBe('udupi');
    expect(url.searchParams.get('areaKey')).toBe(AREA_KEY);
    // The pipe key is percent-encoded on the wire, never sent raw.
    expect(String(rawUrl)).toContain('areaKey=IN%7CKA%7CUdupi%7CKodi%20Bengre');
    expect(init.method ?? 'GET').toBe('GET');

    // skipAuth: a session token exists, yet none is attached and the session is never consulted.
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['authorization']).toBeUndefined();
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
