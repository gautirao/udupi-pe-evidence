import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Worktree has no apps/web/.env (and must not get one); the supabase client is
// created at import time via src/lib/api.ts, so stub it. No network is exercised.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { useDiscoverPageState } from '../useDiscoverPageState';
import { shouldShowMarkers } from '@/lib/map/zoomPolicy';

/**
 * D9 (issue #2860 validation matrix L82, legacy #1065 "mapZoom sync from URL").
 *
 * The retired e2e/issue-1065-final.spec.ts deep link carries `zoom=14` and
 * `areaKey=` but NO `lat`/`lon`. Property-marker fetching is gated on the LIVE
 * mapZoom (> AREA_LAYER_MAX_ZOOM = 12) via shouldShowMarkers(mapZoom) in
 * useDiscoverMapDataController. This test drives the REAL URL parser
 * (useDiscoverUrlState inside a MemoryRouter) into the REAL useDiscoverPageState
 * and asserts the expected behaviour: the URL zoom is honoured as the initial
 * mapZoom, so markers are enabled from the first render.
 *
 * Control arm: the same zoom with lat/lon present — proves the instrument can
 * observe an honoured URL zoom at all.
 */

function makeWrapper(initialUrl: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    );
}

function useComposed() {
  const [urlState, urlActions] = useDiscoverUrlState();
  const pageState = useDiscoverPageState({ urlState, urlActions });
  return { urlState, mapZoom: pageState.mapZoom };
}

describe('D9 — legacy zoom=14 + areaKey deep link holds the URL zoom', () => {
  it('control: zoom=14 WITH lat/lon is honoured as the initial mapZoom', () => {
    const { result } = renderHook(() => useComposed(), {
      wrapper: makeWrapper(
        '/discover?city=udupi&journey=area-first&lat=13.35000&lon=74.78000&zoom=14&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });
    expect(result.current.mapZoom).toBe(14);
    expect(shouldShowMarkers(result.current.mapZoom)).toBe(true);
  });

  it('legacy #1065 shape: zoom=14 + areaKey WITHOUT lat/lon is honoured as the initial mapZoom', () => {
    const { result } = renderHook(() => useComposed(), {
      wrapper: makeWrapper(
        '/discover?city=udupi&journey=area-first&zoom=14&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });
    expect(result.current.urlState.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.current.mapZoom).toBe(14);
    expect(shouldShowMarkers(result.current.mapZoom)).toBe(true);
  });
});
