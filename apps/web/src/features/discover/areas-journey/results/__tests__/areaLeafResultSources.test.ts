/**
 * Issue #2660 (C4) — focused unit coverage for the AREA-leaf result-source
 * model: the flat-signals -> discriminated-scope adapter, the area-base
 * identity guard, and the pure resolver's pinned quirks (T1/T5, #2461).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isAreaBaseMatched,
  resolveAreaLeafResultSource,
  toAreaLeafScopeSource,
} from '../areaLeafResultSources';
import type {
  AreaLeafAreaBase,
  AreaLeafResultSourceInputs,
  AreaLeafScopeSignals,
} from '../areaLeafResultSources';
import { makeListing } from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';

const LEAF = 'IN|KA|Bangalore|Manipal';

const NO_SIGNALS: AreaLeafScopeSignals = {
  isAnonViewport: undefined,
  anonViewportListings: undefined,
  anonViewportListingsLoading: undefined,
  isAuthViewport: undefined,
  authViewportListings: undefined,
  authViewportListingsLoading: undefined,
  isPolygonScope: undefined,
  polygonListings: undefined,
  polygonListingsLoading: undefined,
  isErrorPolygonListings: undefined,
  refetchPolygonListings: undefined,
};

describe('toAreaLeafScopeSource — flat committed-scope signals -> one discriminated scope', () => {
  const anon = [makeListing({ id: 'anon' })];
  const auth = [makeListing({ id: 'auth' })];
  const poly = [makeListing({ id: 'poly' })];
  const refetchPolygon = vi.fn();
  const ALL: AreaLeafScopeSignals = {
    isAnonViewport: false,
    anonViewportListings: anon,
    anonViewportListingsLoading: true,
    isAuthViewport: false,
    authViewportListings: auth,
    authViewportListingsLoading: false,
    isPolygonScope: false,
    polygonListings: poly,
    polygonListingsLoading: true,
    isErrorPolygonListings: true,
    refetchPolygonListings: refetchPolygon,
  };

  it('no committed scope -> area (carrying no substituted data)', () => {
    expect(toAreaLeafScopeSource(ALL)).toEqual({ kind: 'area' });
    expect(toAreaLeafScopeSource(NO_SIGNALS)).toEqual({ kind: 'area' });
  });

  it('anon viewport carries ONLY the anon listings/loading', () => {
    expect(toAreaLeafScopeSource({ ...ALL, isAnonViewport: true })).toEqual({
      kind: 'viewport',
      audience: 'anon',
      listings: anon,
      loading: true,
    });
  });

  it('anon viewport also carries its OWN error/retry (#1793 SR-024 (approved AC A2)); the auth viewport never does', () => {
    const refetchAnon = vi.fn();
    const withAnonError = { ...ALL, isErrorAnonViewport: true, refetchAnonViewport: refetchAnon };
    expect(toAreaLeafScopeSource({ ...withAnonError, isAnonViewport: true })).toEqual({
      kind: 'viewport',
      audience: 'anon',
      listings: anon,
      loading: true,
      error: true,
      retry: refetchAnon,
    });
    const authScope = toAreaLeafScopeSource({ ...withAnonError, isAuthViewport: true });
    expect(authScope).toMatchObject({ kind: 'viewport', audience: 'auth' });
    expect(authScope).not.toHaveProperty('error', true);
  });

  it('auth viewport carries ONLY the auth listings/loading', () => {
    expect(toAreaLeafScopeSource({ ...ALL, isAuthViewport: true })).toEqual({
      kind: 'viewport',
      audience: 'auth',
      listings: auth,
      loading: false,
    });
  });

  it('polygon carries its own listings/loading/error/retry', () => {
    const scope = toAreaLeafScopeSource({ ...ALL, isPolygonScope: true });
    expect(scope).toEqual({ kind: 'polygon', listings: poly, loading: true, error: true, retry: refetchPolygon });
  });

  it('precedence is anon viewport > auth viewport > polygon (the pre-extraction order; see T10)', () => {
    expect(toAreaLeafScopeSource({ ...ALL, isAnonViewport: true, isAuthViewport: true, isPolygonScope: true })).toMatchObject({
      kind: 'viewport',
      audience: 'anon',
    });
    expect(toAreaLeafScopeSource({ ...ALL, isAuthViewport: true, isPolygonScope: true })).toMatchObject({
      kind: 'viewport',
      audience: 'auth',
    });
  });
});

describe('isAreaBaseMatched — #2353 identity guard', () => {
  const base = (over: Partial<AreaLeafAreaBase>): AreaLeafAreaBase => ({
    listings: [],
    areaKey: LEAF,
    loading: false,
    fetching: false,
    error: false,
    retry: undefined,
    ...over,
  });

  it('trusts a settled EMPTY array keyed to this leaf', () => {
    expect(isAreaBaseMatched(base({ listings: [] }), LEAF)).toBe(true);
  });
  it('does not trust undefined listings', () => {
    expect(isAreaBaseMatched(base({ listings: undefined }), LEAF)).toBe(false);
  });
  it('does not trust listings keyed to a DIFFERENT area', () => {
    expect(isAreaBaseMatched(base({ areaKey: 'IN|KA|Bangalore|Other' }), LEAF)).toBe(false);
  });
  it('does not trust an absent base', () => {
    expect(isAreaBaseMatched(undefined, LEAF)).toBe(false);
  });
});

describe('resolveAreaLeafResultSource — pinned quirks', () => {
  const mapRetry = vi.fn();
  const ownRefetch = vi.fn();
  const polygonRetry = vi.fn();
  function inputs(over: Partial<AreaLeafResultSourceInputs> = {}): AreaLeafResultSourceInputs {
    return {
      hasMapAreaListings: true,
      areaBase: { listings: [makeListing({ id: 'map' })], loading: false, fetching: true, error: true, retry: mapRetry },
      substituted: { listings: [makeListing({ id: 'sub' })], loading: true, error: false, retry: polygonRetry },
      ownQuery: { listings: [makeListing({ id: 'own' })], isLoading: false, isFetching: false, isError: false, refetch: ownRefetch },
      ...over,
    };
  }

  it('T1 — viewport: cards/loading from the viewport, error/retry from the matched AREA base', () => {
    const r = resolveAreaLeafResultSource({ kind: 'viewport', audience: 'auth' }, inputs());
    expect(r.listings.map((l) => l.id)).toEqual(['sub']);
    expect(r.loading).toBe(true);
    expect(r.error).toBe(true);
    expect(r.retry).toBe(mapRetry);
    expect(r.isViewportScope).toBe(true);
  });

  it('T1 — auth viewport with NO matched base: error/retry from the own fallback query (unchanged, signed-in behaviour)', () => {
    const r = resolveAreaLeafResultSource(
      { kind: 'viewport', audience: 'auth' },
      inputs({ hasMapAreaListings: false, ownQuery: { ...inputs().ownQuery, isError: true } }),
    );
    expect(r.error).toBe(true);
    expect(r.retry).toBe(ownRefetch);
  });

  // #1793 SR-024 (approved AC A2) — the T1 quirk "viewport error/retry come from the AREA base /
  // own fallback query" was pinned for BOTH audiences. For the ANON viewport it meant a failed
  // "Search this area" request was invisible (the AREA query is disabled and cannot error), so the
  // failure rendered as a zero-result state. The anon viewport now reports ITS OWN query's
  // error/retry; the auth audience keeps the original T1 behaviour (see the test above).
  it('T1 amended — anon viewport: error/retry come from the VIEWPORT query itself, not the AREA base (#1793 SR-024 (approved AC A2))', () => {
    const viewportRetry = vi.fn();
    const r = resolveAreaLeafResultSource(
      { kind: 'viewport', audience: 'anon' },
      inputs({
        areaBase: { listings: [], loading: false, fetching: false, error: false, retry: mapRetry },
        substituted: { listings: [], loading: false, error: true, retry: viewportRetry },
      }),
    );
    expect(r.error).toBe(true);
    expect(r.retry).toBe(viewportRetry);
    expect(r.retry).not.toBe(mapRetry);
    expect(r.origin).toBe('viewport');
  });

  it('T1 amended — anon viewport: an AREA-base error never masquerades as a viewport error (#1793 SR-024 (approved AC A2))', () => {
    const r = resolveAreaLeafResultSource(
      { kind: 'viewport', audience: 'anon' },
      inputs({
        areaBase: { listings: [], loading: false, fetching: false, error: true, retry: mapRetry },
        substituted: { listings: [], loading: false, error: false, retry: vi.fn() },
      }),
    );
    expect(r.error).toBe(false);
  });

  it('T5 — fetching never branches on scope: the matched base\'s fetching applies under viewport AND polygon', () => {
    expect(resolveAreaLeafResultSource({ kind: 'viewport', audience: 'anon' }, inputs()).fetching).toBe(true);
    expect(resolveAreaLeafResultSource({ kind: 'polygon' }, inputs()).fetching).toBe(true);
  });

  it('#2461 — polygon: error/retry belong to the polygon query, not the AREA base', () => {
    const r = resolveAreaLeafResultSource({ kind: 'polygon' }, inputs());
    expect(r.error).toBe(false);
    expect(r.retry).toBe(polygonRetry);
    expect(r.origin).toBe('polygon');
  });

  it('area + matched base -> map origin; area without -> own-query origin', () => {
    expect(resolveAreaLeafResultSource({ kind: 'area' }, inputs()).origin).toBe('map');
    const own = resolveAreaLeafResultSource({ kind: 'area' }, inputs({ hasMapAreaListings: false }));
    expect(own.origin).toBe('own-query');
    expect(own.listings.map((l) => l.id)).toEqual(['own']);
    expect(own.retry).toBe(ownRefetch);
  });
});

// Issue #1793 PR-C (CR F1) — `settled` = THIS scope's own query is loaded, not failed and not a
// keepPreviousData placeholder. It is NOT `!fetching` (the T5-pinned shared refresh signal).
describe('resolveAreaLeafResultSource — settled (the request card gate)', () => {
  const noop = vi.fn();
  const settledInputs = (over: Partial<AreaLeafResultSourceInputs> = {}): AreaLeafResultSourceInputs => ({
    hasMapAreaListings: true,
    areaBase: { listings: [], loading: false, fetching: false, error: false, retry: noop, placeholder: false },
    substituted: { listings: [], loading: false, error: false, retry: noop, placeholder: false },
    ownQuery: { listings: [], isLoading: false, isFetching: false, isError: false, refetch: noop, isPlaceholderData: false },
    ...over,
  });

  it('AREA / matched base: a placeholder is NOT settled even when fetching reads false', () => {
    const r = resolveAreaLeafResultSource(
      { kind: 'area' },
      settledInputs({ areaBase: { listings: [], loading: false, fetching: false, error: false, retry: noop, placeholder: true } }),
    );
    expect(r.fetching).toBe(false);
    expect(r.settled).toBe(false);
  });

  it('AREA / matched base: a same-key background refetch (fetching, no placeholder) IS settled', () => {
    const r = resolveAreaLeafResultSource(
      { kind: 'area' },
      settledInputs({ areaBase: { listings: [], loading: false, fetching: true, error: false, retry: noop, placeholder: false } }),
    );
    expect(r.fetching).toBe(true);
    expect(r.settled).toBe(true);
  });

  it.each([
    ['loading', { loading: true, fetching: true, error: false, retry: noop, listings: [] }],
    ['error', { loading: false, fetching: false, error: true, retry: noop, listings: [] }],
  ])('AREA / matched base: %s is not settled', (_n, base) => {
    expect(resolveAreaLeafResultSource({ kind: 'area' }, settledInputs({ areaBase: base })).settled).toBe(false);
  });

  it('AREA / own fallback query: placeholder, loading and error are not settled; a refetch is', () => {
    const own = (over: Partial<AreaLeafResultSourceInputs['ownQuery']>) =>
      resolveAreaLeafResultSource(
        { kind: 'area' },
        settledInputs({ hasMapAreaListings: false, ownQuery: { ...settledInputs().ownQuery, ...over } }),
      );
    expect(own({}).settled).toBe(true);
    expect(own({ isFetching: true }).settled).toBe(true);
    expect(own({ isPlaceholderData: true }).settled).toBe(false);
    expect(own({ isLoading: true }).settled).toBe(false);
    expect(own({ isError: true }).settled).toBe(false);
  });

  it('ANON viewport: a placeholder (previous viewport) is not settled; its own loading/error are not settled; a refetch is', () => {
    const anon = (over: Partial<AreaLeafResultSourceInputs['substituted']>) =>
      resolveAreaLeafResultSource(
        { kind: 'viewport', audience: 'anon' },
        settledInputs({ substituted: { ...settledInputs().substituted, ...over } }),
      );
    expect(anon({}).settled).toBe(true);
    expect(anon({ placeholder: true }).settled).toBe(false);
    expect(anon({ loading: true }).settled).toBe(false);
    expect(anon({ error: true }).settled).toBe(false);
    // The AREA base's fetching never leaks into the anon viewport's settled (T5 is about `fetching` only).
    expect(
      resolveAreaLeafResultSource(
        { kind: 'viewport', audience: 'anon' },
        settledInputs({ areaBase: { listings: [], loading: false, fetching: true, error: false, retry: noop, placeholder: true } }),
      ).settled,
    ).toBe(true);
  });

  it('AUTH viewport and POLYGON: settled = not loading and not errored (no keepPreviousData)', () => {
    const run = (scope: Parameters<typeof resolveAreaLeafResultSource>[0], over: Partial<AreaLeafResultSourceInputs['substituted']>, baseErr = false) =>
      resolveAreaLeafResultSource(
        scope,
        settledInputs({
          areaBase: { listings: [], loading: false, fetching: true, error: baseErr, retry: noop, placeholder: false },
          substituted: { ...settledInputs().substituted, ...over },
        }),
      ).settled;
    expect(run({ kind: 'viewport', audience: 'auth' }, {})).toBe(true);
    expect(run({ kind: 'viewport', audience: 'auth' }, { loading: true })).toBe(false);
    expect(run({ kind: 'viewport', audience: 'auth' }, {}, true)).toBe(false); // T1: error from the AREA base
    expect(run({ kind: 'polygon' }, {})).toBe(true);
    expect(run({ kind: 'polygon' }, { loading: true })).toBe(false);
    expect(run({ kind: 'polygon' }, { error: true })).toBe(false);
  });

  it('toAreaLeafScopeSource carries isPlaceholderAnonViewport onto the anon viewport only', () => {
    const anon = toAreaLeafScopeSource({ ...NO_SIGNALS, isAnonViewport: true, isPlaceholderAnonViewport: true });
    expect(anon).toMatchObject({ kind: 'viewport', audience: 'anon', placeholder: true });
    const auth = toAreaLeafScopeSource({ ...NO_SIGNALS, isAuthViewport: true, isPlaceholderAnonViewport: true });
    expect(auth).not.toHaveProperty('placeholder');
  });
});
