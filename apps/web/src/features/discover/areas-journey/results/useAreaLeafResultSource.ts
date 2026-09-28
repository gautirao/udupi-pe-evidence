/**
 * Issue #2660 (Commit 2) — owns the ONE remaining fallback
 * `useDiscoverCityListings` call for the AREA-first canonical leaf surface,
 * extracted out of `AreaLeafListingsSurface` verbatim (same enable/disable
 * gating, same full parameter list, same order). Resolves the result via
 * `areaLeafResultSources.ts`'s pure adapter.
 *
 * H1 hazard (identified by commit 0's T4, which found this instability
 * ALREADY PRESENT pre-decomposition — `viewportListings`/
 * `substitutedListings` allocated a fresh `[]` on every render regardless of
 * whether any relevant prop changed, breaking the surface's memoization
 * unconditionally): fixed here by memoizing `scope` on the 3 primitive
 * boolean flags (not on a freshly-constructed wrapper object) and by
 * building the resolver's dependency array from the individual prop values
 * this hook receives, never from a locally-constructed object/array
 * literal. T4 is re-run against this hook (not just re-asserted) as this
 * commit's regression gate.
 *
 * C4 — the input is now the ONE discriminated `AreaLeafResultSourceView`
 * instead of 16 flat fields. The H1 discipline is unchanged: the view's
 * objects are rebuilt by the caller every render, so they are read down to
 * individual values first and only those values are memo dependencies.
 */
import { useMemo } from 'react';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { isAreaBaseMatched, resolveAreaLeafResultSource } from '@/features/discover/areas-journey/results/areaLeafResultSources';
import type {
  AreaLeafResultSourceView,
  CommittedAreaResultScope,
  ResolvedAreaLeafResultSource,
} from '@/features/discover/areas-journey/results/areaLeafResultSources';

export interface UseAreaLeafResultSourceParams {
  city: string;
  areaKey: string;
  effectiveFilters: PropertyFilters;
  debouncedSearch: string | undefined;
  listingPurpose: 'sale' | 'rent';
  isAuthenticated: boolean;
  /** The ONE discriminated result-source contract (Issue #2660 C4). */
  source: AreaLeafResultSourceView;
}

export function useAreaLeafResultSource(
  params: UseAreaLeafResultSourceParams,
): ResolvedAreaLeafResultSource {
  const { areaBase, scope: scopeSource } = params.source;

  // Issue #2353 — true when the caller supplied the map's already-fetched
  // area listings AND they are actually keyed to THIS resolved leaf.
  const hasMapAreaListings = isAreaBaseMatched(areaBase, params.areaKey);

  // H1 (Issue #2660) — `params.source` and its nested objects are rebuilt by
  // the caller on every render, so NOTHING below depends on them as objects.
  // They are read down to individual values here, and every memo lists those
  // values (stable query-result arrays/booleans/callbacks) instead.
  const baseListings = areaBase?.listings;
  const baseLoading = areaBase?.loading;
  const baseFetching = areaBase?.fetching;
  const baseError = areaBase?.error;
  const baseRetry = areaBase?.retry;
  const scopeKind = scopeSource.kind;
  const viewportAudience = scopeSource.kind === 'viewport' ? scopeSource.audience : null;
  const substitutedListings = scopeSource.kind === 'area' ? undefined : scopeSource.listings;
  const substitutedLoading = scopeSource.kind === 'area' ? undefined : scopeSource.loading;
  const substitutedError = scopeSource.kind === 'polygon' ? scopeSource.error : undefined;
  const substitutedRetry = scopeSource.kind === 'polygon' ? scopeSource.retry : undefined;

  // Memoized on the primitive discriminant values, not on the caller's
  // freshly-constructed scope object (the H1 fix).
  const scope = useMemo<CommittedAreaResultScope>(() => {
    // `viewportAudience` is non-null whenever scopeKind is 'viewport' (both
    // read from the same union member above); the fallback is unreachable and
    // exists only because TypeScript cannot correlate the two locals.
    if (scopeKind === 'viewport') return { kind: 'viewport', audience: viewportAudience ?? 'anon' };
    return scopeKind === 'polygon' ? { kind: 'polygon' } : { kind: 'area' };
  }, [scopeKind, viewportAudience]);
  const isScopeSubstituted = scope.kind !== 'area';

  const areaListingsQuery = useDiscoverCityListings({
    city: params.city,
    // A VIEWPORT (or #2461 POLYGON) scope disables this surface's own
    // AREA-keyed query too — it would otherwise issue a wasted fetch whose
    // result is never used (the substituted listings take priority below
    // regardless).
    areaKeys: hasMapAreaListings || isScopeSubstituted ? [] : [params.areaKey],
    limitPerArea: 50,
    // Issue #2533 — full selection forwarded; see useDiscoverCityListings' propertyType
    // doc for why the previous `length === 1` collapse dropped the filter outright.
    propertyType: params.effectiveFilters.propertyTypes?.length
      ? params.effectiveFilters.propertyTypes
      : undefined,
    // Issue #2531 — the AREA-FIRST journey's own leaf query, and the sixth of six
    // production call sites. `resolveEffectiveAreaLeafFilters` (caller-side) already
    // projects the subtype as of #2553, so it ARRIVED here and was then dropped on the
    // way to the wire — carried-but-not-forwarded, one layer below the boundary #2553
    // fixed. Widening the hook's params type does nothing for a call site that never
    // passes the field in, which is why this is enumerated rather than assumed.
    commercialSubtypes: params.effectiveFilters.commercialSubtypes?.length
      ? params.effectiveFilters.commercialSubtypes
      : undefined,
    bedrooms: params.effectiveFilters.bedrooms?.length ? params.effectiveFilters.bedrooms : undefined,
    minPrice: params.effectiveFilters.priceMin != null ? params.effectiveFilters.priceMin * 100 : undefined,
    maxPrice: params.effectiveFilters.priceMax != null ? params.effectiveFilters.priceMax * 100 : undefined,
    q: params.debouncedSearch?.trim() || undefined,
    listingPurpose: params.listingPurpose,
    // Issue #2023 — CityAreaListingsService now filters on possession_status = 'READY'
    // for this endpoint too, matching markers/navigation-counts/authenticated Browse-all.
    readyToMove: params.effectiveFilters.readyToMove,
    // Issue #2450 — the AREA (SQ FT) axis. Forwarded RAW, with no applicability gate and
    // no truthiness guard — see the original call site's doc (now on this hook) for why
    // a `?.length`-style guard would incorrectly drop a real `areaMinSqft: 0` selection.
    areaMinSqft: params.effectiveFilters.areaMinSqft,
    areaMaxSqft: params.effectiveFilters.areaMaxSqft,
    isAuthenticated: params.isAuthenticated,
  });

  // Flattened once here (not inside the resolver) so the resolver stays a
  // plain, hook-free pure function; memoized on the query's own `data`
  // reference, which react-query already keeps stable across renders that
  // don't produce a new response.
  const ownQueryListings = useMemo(
    () => areaListingsQuery.data?.areas.flatMap((a) => a.listings) ?? [],
    [areaListingsQuery.data],
  );

  // NOTE: eslint's exhaustive-deps rule flags this as missing
  // `areaListingsQuery` itself in the dependency array below. That is
  // deliberate, not an oversight: react-query returns a new
  // `areaListingsQuery` object on every render regardless of whether the
  // underlying data changed, so depending on the object itself (rather than
  // its individual stable fields, listed below) would reintroduce exactly
  // the H1 hazard this hook exists to fix (see this file's own doc
  // comment). Left as an unsuppressed warning, matching this file's own
  // pre-existing `journey`/`nav.filters` missing-dependency warnings
  // elsewhere in this same component tree — narrowed dependencies are this
  // codebase's accepted pattern for react-query/context result objects.
  return useMemo(
    () =>
      resolveAreaLeafResultSource(scope, {
        hasMapAreaListings,
        areaBase: {
          listings: baseListings,
          loading: baseLoading,
          fetching: baseFetching,
          error: baseError,
          retry: baseRetry,
        },
        substituted: {
          listings: substitutedListings,
          loading: substitutedLoading,
          error: substitutedError,
          retry: substitutedRetry,
        },
        ownQuery: {
          listings: ownQueryListings,
          isLoading: areaListingsQuery.isLoading,
          isFetching: areaListingsQuery.isFetching,
          isError: areaListingsQuery.isError,
          refetch: () => areaListingsQuery.refetch(),
        },
      }),
    [
      scope,
      hasMapAreaListings,
      baseListings,
      baseLoading,
      baseFetching,
      baseError,
      baseRetry,
      substitutedListings,
      substitutedLoading,
      substitutedError,
      substitutedRetry,
      ownQueryListings,
      areaListingsQuery.isLoading,
      areaListingsQuery.isFetching,
      areaListingsQuery.isError,
      areaListingsQuery.refetch,
    ],
  );
}
