/**
 * Issue #2660 (C4) — H1 guard at the hook boundary. Callers rebuild the
 * `{areaBase, scope}` source objects on EVERY render (grouping props into
 * view/commands does that by construction). The hook must depend only on the
 * values inside them, so an unrelated re-render with equal values yields the
 * SAME resolved object — otherwise `areaListingsForPanel` ->
 * `selectedListingPreview` -> the page's preview effect re-fires every render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAreaLeafResultSource } from '../useAreaLeafResultSource';
import type { UseAreaLeafResultSourceParams } from '../useAreaLeafResultSource';
import { makeListing } from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';

const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverCityListings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverCityListings')>(
    '@/hooks/useDiscoverCityListings',
  );
  return { ...actual, useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args) };
});

const LEAF = 'IN|KA|Bangalore|Manipal';
const MAP_LISTINGS = [makeListing({ id: 'map-1' })];
const VIEWPORT_LISTINGS = [makeListing({ id: 'vp-1' })];
const refetch = vi.fn();
const FILTERS = {};

/** Builds FRESH source objects around the SAME stable values on every call. */
function params(kind: 'area' | 'viewport'): UseAreaLeafResultSourceParams {
  return {
    city: 'bangalore',
    areaKey: LEAF,
    effectiveFilters: FILTERS,
    debouncedSearch: undefined,
    listingPurpose: 'sale',
    isAuthenticated: true,
    source: {
      areaBase: { listings: MAP_LISTINGS, areaKey: LEAF, loading: false, fetching: false, error: false, retry: refetch },
      scope:
        kind === 'viewport'
          ? { kind: 'viewport', audience: 'auth', listings: VIEWPORT_LISTINGS, loading: false }
          : { kind: 'area' },
    },
  };
}

beforeEach(() => {
  // A stable query snapshot, as react-query keeps `data`/`refetch` stable
  // across renders that produce no new response.
  const data = { areas: [] };
  const queryRefetch = vi.fn();
  mockUseDiscoverCityListings.mockImplementation(() => ({
    data,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: queryRefetch,
  }));
});

describe('useAreaLeafResultSource — H1 memo identity across freshly-built source objects', () => {
  it.each(['area', 'viewport'] as const)('%s scope: equal values in new objects -> same resolved object', (kind) => {
    const { result, rerender } = renderHook((p: UseAreaLeafResultSourceParams) => useAreaLeafResultSource(p), {
      initialProps: params(kind),
    });
    const first = result.current;
    rerender(params(kind));
    expect(result.current).toBe(first);
  });

  it('a REAL change (area -> viewport scope) does produce a new resolution', () => {
    const { result, rerender } = renderHook((p: UseAreaLeafResultSourceParams) => useAreaLeafResultSource(p), {
      initialProps: params('area'),
    });
    expect(result.current.listings).toBe(MAP_LISTINGS);
    rerender(params('viewport'));
    expect(result.current.listings).toBe(VIEWPORT_LISTINGS);
    expect(result.current.isViewportScope).toBe(true);
  });

  it('a matched map base or a substituted scope disables the own fallback query (areaKeys: [])', () => {
    renderHook(() => useAreaLeafResultSource(params('area')));
    expect(mockUseDiscoverCityListings).toHaveBeenLastCalledWith(expect.objectContaining({ areaKeys: [] }));
  });
});
