/**
 * Issue #2186 (AC5/AC6) — schoolId/radiusKm/clusterFocus never apply to agri-first
 * (no school or area-cluster-hierarchy concept there). Two write paths must strip
 * all three:
 *   AC5 — an explicit switch INTO agri-first (setJourney) strips them from the URL.
 *   AC6 — a cold-load agri-first URL that still carries stale values normalizes
 *         them away once on mount (agricultural.ts's ref-guarded effect).
 *
 * Harness mirrors defaultJourney.test.ts's makeCtx (this codebase's established
 * pattern for URL-domain unit tests against a hand-built UrlDomainCtx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { QueryClient } from '@tanstack/react-query';
import type { UrlDebounceTimers, UrlDomainCtx } from '../_shared';
import { useAreaUrlDomain } from '../area';
import { useAgriculturalUrlDomain } from '../agricultural';
import { CLUSTER_FOCUS_PARAM } from '../clusterFocus';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { ...actual.api, get: mockApiGet },
  };
});

function timerRef(): MutableRefObject<ReturnType<typeof setTimeout> | null> {
  return { current: null };
}

function makeCtx(search: string, city = 'udupi'): { ctx: UrlDomainCtx; setUrlParams: ReturnType<typeof vi.fn> } {
  const timers: UrlDebounceTimers = {
    viewport: timerRef(),
    filtersLive: timerRef(),
    search: timerRef(),
  };
  const setUrlParams = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ctx: UrlDomainCtx = {
    urlParams: new URLSearchParams(search),
    setUrlParams: setUrlParams as unknown as UrlDomainCtx['setUrlParams'],
    timers,
    queryClient,
    reads: { city },
    liveUrlParamsRef: { current: new URLSearchParams(search) },
  };
  return { ctx, setUrlParams };
}

/** Applies the (updater, options) pair captured from the LAST setUrlParams call to `initial`. */
function applyLastWrite(setUrlParams: ReturnType<typeof vi.fn>, initial: string): URLSearchParams {
  const [updater] = setUrlParams.mock.calls[setUrlParams.mock.calls.length - 1] as [
    (prev: URLSearchParams) => URLSearchParams,
    unknown,
  ];
  return updater(new URLSearchParams(initial));
}

beforeEach(() => {
  mockApiGet.mockReset();
});

describe('AC5 — setJourney(agri-first) strips schoolId/radiusKm/clusterFocus', () => {
  it('switching from school-first (with schoolId/radiusKm/clusterFocus set) to agri-first clears all three', () => {
    const initial = 'journey=school-first&schoolId=12345&radiusKm=3&clusterFocus=IN%7CKA%7CBengaluru%7CWhitefield&city=udupi';
    const { ctx, setUrlParams } = makeCtx(initial);
    const { result } = renderHook(() => useAreaUrlDomain(ctx));

    result.current.actions.setJourney('agri-first');

    const next = applyLastWrite(setUrlParams, initial);
    expect(next.get('journey')).toBe('agri-first');
    expect(next.get('schoolId')).toBeNull();
    expect(next.get('radiusKm')).toBeNull();
    expect(next.get(CLUSTER_FOCUS_PARAM)).toBeNull();
  });

  it('switching to a non-agri journey does NOT strip schoolId/radiusKm/clusterFocus', () => {
    const initial = 'journey=school-first&schoolId=12345&radiusKm=3&clusterFocus=IN%7CKA%7CBengaluru%7CWhitefield&city=udupi';
    const { ctx, setUrlParams } = makeCtx(initial);
    const { result } = renderHook(() => useAreaUrlDomain(ctx));

    result.current.actions.setJourney('area-first');

    const next = applyLastWrite(setUrlParams, initial);
    expect(next.get('journey')).toBe('area-first');
    expect(next.get('schoolId')).toBe('12345');
    expect(next.get('radiusKm')).toBe('3');
    expect(next.get(CLUSTER_FOCUS_PARAM)).not.toBeNull();
  });
});

describe('AC6 — cold-load agri-first URL with stale params normalizes them away on mount', () => {
  it('journey=agri-first cold-loaded with stale schoolId/radiusKm/clusterFocus strips all three, keeps region/maxKm', () => {
    const initial =
      'journey=agri-first&region=N&maxKm=25&schoolId=12345&radiusKm=3&clusterFocus=IN%7CKA%7CBengaluru%7CWhitefield&city=udupi';
    const { ctx, setUrlParams } = makeCtx(initial);
    renderHook(() => useAgriculturalUrlDomain(ctx));

    expect(setUrlParams).toHaveBeenCalled();
    const next = applyLastWrite(setUrlParams, initial);
    expect(next.get('schoolId')).toBeNull();
    expect(next.get('radiusKm')).toBeNull();
    expect(next.get(CLUSTER_FOCUS_PARAM)).toBeNull();
    // region/maxKm are agri-first's own params — must survive the strip untouched.
    expect(next.get('region')).toBe('N');
    expect(next.get('maxKm')).toBe('25');
  });

  it('journey=agri-first cold-loaded with NO stale params never calls setUrlParams for the strip', () => {
    const initial = 'journey=agri-first&region=N&maxKm=25&city=udupi';
    const { ctx, setUrlParams } = makeCtx(initial);
    renderHook(() => useAgriculturalUrlDomain(ctx));

    expect(setUrlParams).not.toHaveBeenCalled();
  });

  it('a non-agri-first cold load with stale schoolId/radiusKm/clusterFocus is left untouched by this effect', () => {
    const initial = 'journey=school-first&schoolId=12345&radiusKm=3&clusterFocus=IN%7CKA%7CBengaluru%7CWhitefield&city=udupi';
    const { ctx, setUrlParams } = makeCtx(initial);
    renderHook(() => useAgriculturalUrlDomain(ctx));

    expect(setUrlParams).not.toHaveBeenCalled();
  });
});
