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

  it('T1 — viewport with NO matched base: error/retry from the own fallback query', () => {
    const r = resolveAreaLeafResultSource(
      { kind: 'viewport', audience: 'anon' },
      inputs({ hasMapAreaListings: false, ownQuery: { ...inputs().ownQuery, isError: true } }),
    );
    expect(r.error).toBe(true);
    expect(r.retry).toBe(ownRefetch);
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
