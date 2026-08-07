/**
 * Issue #2088 delta-3, item 3 / AC-default-journey.
 *
 * `useAreaUrlDomain` (state/url/area.ts) resolves a bare `/discover` (no
 * `journey` param) to `'area-first'` instead of the old no-journey landing,
 * UNLESS the caller deep-linked with an explicit `scope=` param — which keeps
 * the legacy AreaMarkerLayer/setScope landing genuinely reachable, not merely
 * theoretically so.
 *
 * Issue #2088 QA-FIX — the default is now CONDITIONAL on the city actually
 * having an active canonical node hierarchy: it probes the same root-resolve
 * endpoint `useAreasNavigationJourney` calls, and a CONFIRMED 404 ("no active
 * navigation hierarchy for this city") flips the default from 'area-first' to
 * null instead of leaving every `journey === 'area-first'` gate site routing
 * into a canonical surface with nothing to resolve. See area.ts's own module
 * comment on this for the full reasoning. That probe is a real (mocked)
 * network fetch, so these cases now render + `waitFor` the settled state
 * instead of asserting synchronously — the ONLY change from the original
 * suite's approach.
 *
 * ── HARNESS ──
 * Mirrors `navigationCommandMatrix.test.ts`'s `makeHarness` (same file's
 * counting-spy `UrlDomainCtx` construction) rather than mounting a router —
 * exercising the domain hook directly against a hand-built `UrlDomainCtx` is
 * this codebase's established pattern for URL-domain unit tests and keeps
 * this file decoupled from `navigationCommandMatrix.test.ts` itself (which
 * MUST stay byte-unmodified per this issue's scope contract). The QueryClient
 * (real instance now, `retry: false`, passed both via `ctx.queryClient` and
 * `mockApiGet`) is new — the original harness's `null as unknown as
 * QueryClient` stand-in only worked because the default was synchronous.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { QueryClient } from '@tanstack/react-query';
import type { UrlDebounceTimers, UrlDomainCtx } from '../_shared';
import { useAreaUrlDomain } from '../area';
import { ApiError } from '@/lib/api';

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

function makeCtx(
  search: string,
  city = 'bangalore',
): { ctx: UrlDomainCtx; setUrlParams: ReturnType<typeof vi.fn>; queryClient: QueryClient } {
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
  return { ctx, setUrlParams, queryClient };
}

beforeEach(() => {
  mockApiGet.mockReset();
});

describe('AC-default-journey — a bare /discover (no journey param) resolves to area-first when the city has an active hierarchy', () => {
  it('no journey, no scope -> journey === "area-first"', async () => {
    mockApiGet.mockResolvedValue({ requested: 'root', resolution: 'CITY_ROOT', node: { nodeKey: 'root' } });
    const { ctx } = makeCtx('city=bangalore');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    await waitFor(() => expect(result.current.state.journey).toBe('area-first'));
  });

  it('completely empty search string still resolves to area-first', async () => {
    mockApiGet.mockResolvedValue({ requested: 'root', resolution: 'CITY_ROOT', node: { nodeKey: 'root' } });
    const { ctx } = makeCtx('');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    await waitFor(() => expect(result.current.state.journey).toBe('area-first'));
  });
});

describe('AC-default-journey — QA-FIX: a bare /discover for a city with NO active hierarchy degrades to the legacy landing, never area-first', () => {
  it('root-resolve 404s ("City has no active navigation hierarchy") -> journey settles to null, not "area-first"', async () => {
    const notFound = new ApiError('City has no active navigation hierarchy', 404, {
      error: 'City has no active navigation hierarchy',
    });
    mockApiGet.mockRejectedValue(notFound);
    const { ctx } = makeCtx('city=udupi', 'udupi');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    // Optimistic default while the probe is in flight — unchanged fast path.
    expect(result.current.state.journey).toBe('area-first');
    await waitFor(() => expect(result.current.state.journey).toBeNull());
  });

  it('a transient/non-404 probe failure does NOT suppress the default — only a confirmed 404 does', async () => {
    const serverError = new ApiError('Internal Server Error', 500, { error: 'Internal Server Error' });
    mockApiGet.mockRejectedValue(serverError);
    const { ctx } = makeCtx('city=bangalore');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    // Stays optimistic — a 500 is not evidence the city lacks a hierarchy.
    expect(result.current.state.journey).toBe('area-first');
  });
});

describe('AC-default-journey — an explicit journey param is preserved, never overridden by the default', () => {
  it.each(['area-first', 'school-first', 'agri-first'] as const)(
    'journey=%s is read back verbatim',
    (journey) => {
      const { ctx } = makeCtx(`city=bangalore&journey=${journey}`);
      const { result } = renderHook(() => useAreaUrlDomain(ctx));
      expect(result.current.state.journey).toBe(journey);
      // Explicit journey short-circuits before the default's hierarchy probe.
      expect(mockApiGet).not.toHaveBeenCalled();
    },
  );
});

describe('AC-default-journey — a deep-linked scope= URL still reaches the legacy landing path unchanged (genuinely reachable, not just theoretically)', () => {
  it('scope present, no journey -> journey is null (NOT area-first) — the legacy landing default is preserved', () => {
    const { ctx } = makeCtx('city=bangalore&scope=north-bangalore');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    expect(result.current.state.journey).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('an INVALID scope value still suppresses the area-first default — presence alone is what matters, not validity', () => {
    const { ctx } = makeCtx('city=bangalore&scope=not-a-real-scope');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    expect(result.current.state.journey).toBeNull();
  });

  it('scope= AND an explicit journey= together: the explicit journey still wins over both the scope-suppression and the default', () => {
    const { ctx } = makeCtx('city=bangalore&scope=north-bangalore&journey=school-first');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    expect(result.current.state.journey).toBe('school-first');
  });
});

describe('AC-default-journey — the default is VIRTUAL: the URL is never rewritten/redirected to add journey=area-first', () => {
  it('reading state.journey on a bare /discover never invokes setUrlParams — no history entry, no redirect', async () => {
    mockApiGet.mockResolvedValue({ requested: 'root', resolution: 'CITY_ROOT', node: { nodeKey: 'root' } });
    const { ctx, setUrlParams } = makeCtx('city=bangalore');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    expect(result.current.state.journey).toBe('area-first');
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(setUrlParams).not.toHaveBeenCalled();
  });

  it('a legacy alias short-name journey value (e.g. "area") normalizes through the read layer without ever calling setUrlParams either', () => {
    // normalizeDiscoverSearchParams resolves short-name aliases at READ time
    // only (module doc: "never rewrites the URL itself") — this assertion
    // guards that item 3's new default logic composes with that existing
    // read-time normalization without introducing a write.
    const { ctx, setUrlParams } = makeCtx('city=bangalore&journey=area');
    const { result } = renderHook(() => useAreaUrlDomain(ctx));
    expect(result.current.state.journey).toBe('area-first');
    expect(setUrlParams).not.toHaveBeenCalled();
  });
});
