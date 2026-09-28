import { describe, it, expect } from 'vitest';
import { resolveAreaSelectedResults, type AreaSelectedResultsInput } from './areaSelectedResults';

type Listing = { id: string };

function baseInput(
  overrides: Partial<AreaSelectedResultsInput<Listing, Listing, string>> = {},
): AreaSelectedResultsInput<Listing, Listing, string> {
  return {
    isAnonViewport: false,
    isAuthViewport: false,
    isPolygonScope: false,
    anonViewportListings: [{ id: 'anon' }],
    authViewportListings: [{ id: 'auth' }],
    polygonListings: [{ id: 'polygon' }],
    anonViewportListingsLoading: false,
    authViewportListingsLoading: false,
    polygonListingsLoading: false,
    areaListings: [{ id: 'area' }],
    isLoadingListings: false,
    areaResultSummaryText: '3 of 10 match in Manipal',
    isListingsError: false,
    isErrorAuthViewport: false,
    isErrorPolygonListings: false,
    onRetryListings: 'retry-area',
    onRetryAuthViewport: 'retry-auth',
    onRetryPolygonListings: 'retry-polygon',
    ...overrides,
  };
}

/** R7 differential — byte-for-byte copy of the ORIGINAL inline expressions
 * from DiscoverRightPanel.tsx :1771-1786 / :1823-1830 / :1890-1897. */
function originalInline<TAreaListing, TAnonListing, TRetry>(
  input: AreaSelectedResultsInput<TAreaListing, TAnonListing, TRetry>,
) {
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

describe('resolveAreaSelectedResults (#2657 C1)', () => {
  it('plain area scope: no substitution, summary text kept', () => {
    const view = resolveAreaSelectedResults(baseInput());
    expect(view).toEqual({
      listings: [{ id: 'area' }],
      summaryText: '3 of 10 match in Manipal',
      isLoading: false,
      isError: false,
      isViewportScope: false,
      retry: 'retry-area',
    });
  });

  it('anon viewport scope: substitutes listings, suppresses summary text, isError always false, retry undefined', () => {
    const view = resolveAreaSelectedResults(baseInput({ isAnonViewport: true, isErrorAuthViewport: true }));
    expect(view.listings).toEqual([{ id: 'anon' }]);
    expect(view.summaryText).toBeUndefined();
    expect(view.isError).toBe(false);
    expect(view.retry).toBeUndefined();
    expect(view.isViewportScope).toBe(true);
  });

  it('auth viewport scope: substitutes listings, uses isErrorAuthViewport and its retry', () => {
    const view = resolveAreaSelectedResults(baseInput({ isAuthViewport: true, isErrorAuthViewport: true }));
    expect(view.listings).toEqual([{ id: 'auth' }]);
    expect(view.isError).toBe(true);
    expect(view.retry).toBe('retry-auth');
  });

  it('polygon scope: substitutes listings, uses isErrorPolygonListings and its retry', () => {
    const view = resolveAreaSelectedResults(baseInput({ isPolygonScope: true, isErrorPolygonListings: true }));
    expect(view.listings).toEqual([{ id: 'polygon' }]);
    expect(view.isError).toBe(true);
    expect(view.retry).toBe('retry-polygon');
  });

  it('R7 differential: matches the original inline expressions across a table of inputs', () => {
    const table: Array<Partial<AreaSelectedResultsInput<Listing, Listing, string>>> = [
      {},
      { isAnonViewport: true },
      { isAnonViewport: true, isErrorAuthViewport: true },
      { isAuthViewport: true },
      { isAuthViewport: true, isErrorAuthViewport: true },
      { isPolygonScope: true },
      { isPolygonScope: true, isErrorPolygonListings: true },
      { isListingsError: true },
    ];
    for (const overrides of table) {
      const input = baseInput(overrides);
      expect(resolveAreaSelectedResults(input)).toEqual(originalInline(input));
    }
  });
});
