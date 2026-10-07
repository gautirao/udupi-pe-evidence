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
    isErrorAnonViewport: undefined,
    onRetryAnonViewport: undefined,
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
      settled: true,
      retry: 'retry-area',
    });
  });

  // #1793 SR-024 (approved AC A2) — this T1 characterization previously pinned "isError always
  // false, retry undefined" for the anon viewport. That hard-coding is exactly the SR-024 defect
  // (a viewport request failure rendered as a zero-result state), so it is replaced deliberately:
  // the anon viewport now reports ITS OWN query's error/retry. An absent signal still reads as
  // "no error / no retry", and no OTHER scope's error (auth viewport / area) can leak in.
  it('anon viewport scope: substitutes listings, suppresses summary text; with no anon error signal isError stays false and retry undefined (#1793 SR-024 (approved AC A2))', () => {
    const view = resolveAreaSelectedResults(baseInput({ isAnonViewport: true, isErrorAuthViewport: true }));
    expect(view.listings).toEqual([{ id: 'anon' }]);
    expect(view.summaryText).toBeUndefined();
    expect(view.isError).toBe(false);
    expect(view.retry).toBeUndefined();
    expect(view.isViewportScope).toBe(true);
  });

  it('anon viewport scope: its OWN error and retry are surfaced, never the area/auth ones (#1793 SR-024 (approved AC A2))', () => {
    const view = resolveAreaSelectedResults(
      baseInput({
        isAnonViewport: true,
        isListingsError: false,
        isErrorAnonViewport: true,
        onRetryAnonViewport: 'retry-anon',
      }),
    );
    expect(view.isError).toBe(true);
    expect(view.retry).toBe('retry-anon');
    expect(view.listings).toEqual([{ id: 'anon' }]);
  });

  it('anon viewport scope: an AREA error does not masquerade as the viewport error (#1793 SR-024 (approved AC A2))', () => {
    const view = resolveAreaSelectedResults(
      baseInput({ isAnonViewport: true, isListingsError: true, isErrorAnonViewport: false }),
    );
    expect(view.isError).toBe(false);
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
      // `settled` is the additive #2795 output; the pre-existing fields must be unchanged.
      expect(resolveAreaSelectedResults(input)).toEqual({
        ...originalInline(input),
        settled: expect.any(Boolean),
      });
    }
  });
});

describe('resolveAreaSelectedResults — settled (#2795)', () => {
  it('area scope: settled only when loaded, not failed and not a keepPreviousData placeholder', () => {
    expect(resolveAreaSelectedResults(baseInput()).settled).toBe(true);
    expect(resolveAreaSelectedResults(baseInput({ isLoadingListings: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ isListingsError: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ isPlaceholderAreaListings: true })).settled).toBe(false);
  });

  it('area scope: a refetch is not in the inputs, so a same-key background refetch stays settled', () => {
    // The selector never sees isFetching; a settled result with a refetch in flight is still settled.
    expect(resolveAreaSelectedResults(baseInput({ isPlaceholderAreaListings: false })).settled).toBe(true);
  });

  it('area scope: an absent placeholder flag reads as "not a placeholder"', () => {
    expect(resolveAreaSelectedResults(baseInput({ isPlaceholderAreaListings: undefined })).settled).toBe(true);
  });

  it('anon viewport: uses ITS OWN loading/error/placeholder, never the area ones', () => {
    const anon = { isAnonViewport: true };
    expect(resolveAreaSelectedResults(baseInput(anon)).settled).toBe(true);
    expect(resolveAreaSelectedResults(baseInput({ ...anon, anonViewportListingsLoading: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ ...anon, isErrorAnonViewport: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ ...anon, isPlaceholderAnonViewport: true })).settled).toBe(false);
    // The AREA query's states do not leak into the viewport scope.
    expect(
      resolveAreaSelectedResults(
        baseInput({ ...anon, isLoadingListings: true, isListingsError: true, isPlaceholderAreaListings: true }),
      ).settled,
    ).toBe(true);
  });

  it('auth viewport and polygon: loading/error unsettle; no placeholder concept', () => {
    expect(resolveAreaSelectedResults(baseInput({ isAuthViewport: true })).settled).toBe(true);
    expect(resolveAreaSelectedResults(baseInput({ isAuthViewport: true, authViewportListingsLoading: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ isAuthViewport: true, isErrorAuthViewport: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ isPolygonScope: true })).settled).toBe(true);
    expect(resolveAreaSelectedResults(baseInput({ isPolygonScope: true, polygonListingsLoading: true })).settled).toBe(false);
    expect(resolveAreaSelectedResults(baseInput({ isPolygonScope: true, isErrorPolygonListings: true })).settled).toBe(false);
    expect(
      resolveAreaSelectedResults(baseInput({ isPolygonScope: true, isPlaceholderAreaListings: true })).settled,
    ).toBe(true);
  });
});
