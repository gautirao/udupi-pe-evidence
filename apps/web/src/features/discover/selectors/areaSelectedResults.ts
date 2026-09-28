/**
 * Issue #2657 commit C1 — pure selector lifted VERBATIM in semantics from
 * DiscoverRightPanel.tsx :1771-1786 and :1823-1830/:1890-1897 (the
 * `case 'area-selected'` viewport/polygon result-scope substitution, plus
 * the matching isError/retry selection — Issue #2015 / #2018 / #2461).
 *
 * `isAnonViewport`/`isAuthViewport`/`isPolygonScope` are mutually exclusive
 * (see the callers' own resultScope-kind guarantee); VIEWPORT keeps
 * priority only nominally.
 */
// `TAreaListing` covers areaListings/authViewportListings/polygonListings
// (all the same shape in production — DiscoverCityListingItem[]); the anon
// path is its own distinct shape (AnonViewportListingItem[], band-only
// fields). Two type params, not one, so the union stays exact instead of
// collapsing both call sites onto a single inferred type.
export interface AreaSelectedResultsInput<TAreaListing, TAnonListing, TRetry> {
  isAnonViewport: boolean;
  isAuthViewport: boolean;
  isPolygonScope: boolean;
  anonViewportListings: TAnonListing[] | undefined;
  authViewportListings: TAreaListing[] | undefined;
  polygonListings: TAreaListing[] | undefined;
  anonViewportListingsLoading: boolean | undefined;
  authViewportListingsLoading: boolean | undefined;
  polygonListingsLoading: boolean | undefined;
  areaListings: TAreaListing[];
  isLoadingListings: boolean | undefined;
  areaResultSummaryText: string | null | undefined;
  isListingsError: boolean;
  isErrorAuthViewport: boolean | undefined;
  isErrorPolygonListings: boolean | undefined;
  onRetryListings: TRetry;
  onRetryAuthViewport: TRetry;
  onRetryPolygonListings: TRetry;
}

export interface AreaSelectedResultsView<TAreaListing, TAnonListing, TRetry> {
  listings: TAreaListing[] | TAnonListing[] | undefined;
  summaryText: string | null | undefined;
  isLoading: boolean | undefined;
  isError: boolean | undefined;
  isViewportScope: boolean;
  retry: TRetry | undefined;
}

export function resolveAreaSelectedResults<TAreaListing, TAnonListing, TRetry>(
  input: AreaSelectedResultsInput<TAreaListing, TAnonListing, TRetry>,
): AreaSelectedResultsView<TAreaListing, TAnonListing, TRetry> {
  const isViewportScope = input.isAnonViewport || input.isAuthViewport;
  const viewportListings = input.isAnonViewport ? input.anonViewportListings : input.authViewportListings;
  const viewportListingsLoading = input.isAnonViewport
    ? input.anonViewportListingsLoading
    : input.authViewportListingsLoading;
  const isScopeSubstituted = isViewportScope || input.isPolygonScope;
  const substitutedListings = isViewportScope ? viewportListings : input.polygonListings;
  const substitutedListingsLoading = isViewportScope
    ? viewportListingsLoading
    : input.polygonListingsLoading;

  return {
    listings: isScopeSubstituted ? substitutedListings : input.areaListings,
    summaryText: isScopeSubstituted ? undefined : input.areaResultSummaryText,
    isLoading: isScopeSubstituted ? substitutedListingsLoading : input.isLoadingListings,
    isError: input.isAnonViewport
      ? false
      : input.isAuthViewport
        ? input.isErrorAuthViewport
        : input.isPolygonScope
          ? input.isErrorPolygonListings
          : input.isListingsError,
    isViewportScope,
    retry: input.isAnonViewport
      ? undefined
      : input.isAuthViewport
        ? input.onRetryAuthViewport
        : input.isPolygonScope
          ? input.onRetryPolygonListings
          : input.onRetryListings,
  };
}
