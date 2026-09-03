import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResultScopeUrlDomain } from './resultScope';
import type { UrlDomainCtx } from './_shared';

function makeCtx(initial: string): { ctx: UrlDomainCtx; getParams: () => URLSearchParams } {
  let params = new URLSearchParams(initial);
  const setUrlParams = vi.fn(
    (
      updater: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
      _opts?: { replace?: boolean },
    ) => {
      params = typeof updater === 'function' ? updater(params) : updater;
    },
  );
  const ctx: UrlDomainCtx = {
    urlParams: params,
    // Cast: the real SetDiscoverUrlParams type is react-router's setSearchParams;
    // this test only exercises the (updater, opts) call shape the domain module uses.
    setUrlParams: setUrlParams as unknown as UrlDomainCtx['setUrlParams'],
    timers: {
      viewport: { current: null },
      filtersLive: { current: null },
      search: { current: null },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryClient: {} as any,
    reads: { city: 'bangalore' },
    liveUrlParamsRef: { current: params },
  };
  return { ctx, getParams: () => params };
}

describe('useResultScopeUrlDomain', () => {
  it('reads_no_committed_scope_when_rscope_is_absent', () => {
    const { ctx } = makeCtx('city=bangalore');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));
    expect(result.current.state.resultScope).toEqual({ active: null, previous: null });
  });

  it('reads_an_AREA_SET_scope', () => {
    const { ctx } = makeCtx('rscope=areas&rareas=hebbal,jakkur');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));
    expect(result.current.state.resultScope.active).toEqual({
      kind: 'AREA_SET',
      areaKeys: ['hebbal', 'jakkur'],
    });
  });

  it('reads_a_POLYGON_scope_at_5dp_precision', () => {
    const { ctx } = makeCtx('rscope=poly&rpoly=12.90000:77.50000;12.95000:77.55000;12.90000:77.60000');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));
    expect(result.current.state.resultScope.active).toEqual({
      kind: 'POLYGON',
      coordinates: [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]],
    });
  });

  it('reads_an_inert_VIEWPORT_scope_from_a_hand_edited_or_restored_URL', () => {
    const { ctx } = makeCtx('rscope=vp&rvp=12.9,77.5,13.0,77.6');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));
    expect(result.current.state.resultScope.active).toEqual({
      kind: 'VIEWPORT',
      bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 },
    });
  });

  it('malformed_multi_key_URL_only_honours_the_key_matching_rscope', () => {
    // A hand-edited URL carrying BOTH rareas and rpoly — rscope=areas wins,
    // rpoly is never read into the active scope.
    const { ctx } = makeCtx('rscope=areas&rareas=hebbal&rpoly=12.9:77.5;12.95:77.55;12.9:77.6');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));
    expect(result.current.state.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
  });

  it('commit_pushes_exactly_once_and_writes_the_new_scope_payload', () => {
    const { ctx, getParams } = makeCtx('city=bangalore');
    const setUrlParamsSpy = ctx.setUrlParams as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));

    act(() => {
      result.current.actions.commitResultScope({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
    });

    expect(setUrlParamsSpy).toHaveBeenCalledTimes(1);
    expect(setUrlParamsSpy.mock.calls[0][1]).toEqual({ replace: false });
    expect(getParams().get('rscope')).toBe('areas');
    expect(getParams().get('rareas')).toBe('hebbal');
    expect(getParams().has('rpoly')).toBe(false);
    expect(getParams().has('rvp')).toBe(false);
  });

  it('Issue #2015 AC7 — commit with { history: "replace" } writes replace:true (viewport-drift commits do not push a history entry)', () => {
    const { ctx, getParams } = makeCtx('city=bangalore');
    const setUrlParamsSpy = ctx.setUrlParams as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));

    act(() => {
      result.current.actions.commitResultScope(
        { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 } },
        { history: 'replace' },
      );
    });

    expect(setUrlParamsSpy).toHaveBeenCalledTimes(1);
    expect(setUrlParamsSpy.mock.calls[0][1]).toEqual({ replace: true });
    expect(getParams().get('rscope')).toBe('vp');
  });

  it('commit_captures_the_outgoing_scope_into_rprev_by_name', () => {
    const { ctx, getParams } = makeCtx('rscope=areas&rareas=hebbal,nagawara,jakkur');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));

    act(() => {
      result.current.actions.commitResultScope({
        kind: 'POLYGON',
        coordinates: [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]],
      });
    });

    expect(getParams().get('rscope')).toBe('poly');
    expect(getParams().get('rprev')).toBe('areas:hebbal,nagawara,jakkur');
  });

  it('a_second_commit_strips_the_previously-written_payload_key_of_a_different_kind', () => {
    const { ctx, getParams } = makeCtx('rscope=poly&rpoly=12.9:77.5;12.95:77.55;12.9:77.6');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));

    act(() => {
      result.current.actions.commitResultScope({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
    });

    expect(getParams().has('rpoly')).toBe(false);
    expect(getParams().get('rscope')).toBe('areas');
    expect(getParams().get('rprev')).toBe('poly:12.90000:77.50000;12.95000:77.55000;12.90000:77.60000');
  });

  it('J3.5 — restoring the previous scope (Return to selected areas) round-trips it exactly, by name', () => {
    const { ctx, getParams } = makeCtx('rscope=areas&rareas=hebbal,nagawara,jakkur');
    const { result, rerender } = renderHook(() => useResultScopeUrlDomain(ctx));

    act(() => {
      result.current.actions.commitResultScope({
        kind: 'POLYGON',
        coordinates: [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]],
      });
    });
    ctx.urlParams = getParams();
    rerender();

    const previous = result.current.state.resultScope.previous;
    expect(previous).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal', 'nagawara', 'jakkur'] });

    // "Return to selected areas" commits `previous` back as `active`.
    act(() => {
      if (previous) result.current.actions.commitResultScope(previous);
    });
    expect(getParams().get('rscope')).toBe('areas');
    expect(getParams().get('rareas')).toBe('hebbal,nagawara,jakkur');
  });

  it('committing_null_clears_the_scope', () => {
    const { ctx, getParams } = makeCtx('rscope=areas&rareas=hebbal');
    const { result } = renderHook(() => useResultScopeUrlDomain(ctx));

    act(() => {
      result.current.actions.commitResultScope(null);
    });

    expect(getParams().has('rscope')).toBe(false);
    expect(getParams().has('rareas')).toBe(false);
    expect(getParams().get('rprev')).toBe('areas:hebbal');
  });
});
