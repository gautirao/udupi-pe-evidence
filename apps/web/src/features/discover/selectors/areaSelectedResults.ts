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
  /**
   * Issue #1793 SR-024 — the anon "Search this area" viewport query's OWN error. Optional so
   * callers that predate it read as "no viewport error" (the former hard-coded `false`).
   */
  isErrorAnonViewport?: boolean | undefined;
  /**
   * Issue #2795 — the AREA query is serving the PREVIOUS key's response (`keepPreviousData`).
   * Optional: absent reads as "not a placeholder".
   */
  isPlaceholderAreaListings?: boolean | undefined;
  /** Issue #2795 — the anon viewport query is serving the previous viewport's response. Optional. */
  isPlaceholderAnonViewport?: boolean | undefined;
  onRetryListings: TRetry;
  onRetryAuthViewport: TRetry;
  onRetryPolygonListings: TRetry;
  /** Issue #1793 SR-024 — refetches the anon viewport query `isErrorAnonViewport` mirrors. */
  onRetryAnonViewport?: TRetry | undefined;
}

export interface AreaSelectedResultsView<TAreaListing, TAnonListing, TRetry> {
  listings: TAreaListing[] | TAnonListing[] | undefined;
  summaryText: string | null | undefined;
  isLoading: boolean | undefined;
  isError: boolean | undefined;
  isViewportScope: boolean;
  /**
   * Issue #2795 — the ACTIVE scope's own query has settled to a real result: loaded, not failed, and
   * not a keepPreviousData placeholder. Gates the "Request a property" card; deliberately not
   * `isFetching` (a same-key background refetch is still settled and must not unmount a draft).
   */
  settled: boolean;
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

  const isLoading = isScopeSubstituted ? substitutedListingsLoading : input.isLoadingListings;
  const isError = input.isAnonViewport
    ? (input.isErrorAnonViewport ?? false)
    : input.isAuthViewport
      ? input.isErrorAuthViewport
      : input.isPolygonScope
        ? input.isErrorPolygonListings
        : input.isListingsError;
  // Only the anon viewport and the AREA query keep previous data; auth viewport and polygon do not.
  const isPlaceholder = input.isAnonViewport
    ? (input.isPlaceholderAnonViewport ?? false)
    : isScopeSubstituted
      ? false
      : (input.isPlaceholderAreaListings ?? false);

  return {
    settled: !isLoading && !isError && !isPlaceholder,
    listings: isScopeSubstituted ? substitutedListings : input.areaListings,
    summaryText: isScopeSubstituted ? undefined : input.areaResultSummaryText,
    isLoading: isScopeSubstituted ? substitutedListingsLoading : input.isLoadingListings,
    // Issue #1793 SR-024 — the anon viewport used to be hard-coded `false` here (and `retry`
    // undefined below), which rendered a failed "Search this area" request as a zero-result state.
    // It now reports its OWN query's error/retry; an absent signal still reads as "no error".
    isError: input.isAnonViewport
      ? (input.isErrorAnonViewport ?? false)
      : input.isAuthViewport
        ? input.isErrorAuthViewport
        : input.isPolygonScope
          ? input.isErrorPolygonListings
          : input.isListingsError,
    isViewportScope,
    retry: input.isAnonViewport
      ? input.onRetryAnonViewport
      : input.isAuthViewport
        ? input.onRetryAuthViewport
        : input.isPolygonScope
          ? input.onRetryPolygonListings
          : input.onRetryListings,
  };
}
