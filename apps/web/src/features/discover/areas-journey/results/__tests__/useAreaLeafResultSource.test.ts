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

/**
 * #2836 (N5) — the POSITIVE arm the test above never had. When the map supplies no
 * area base for this leaf (standalone caller, or a base keyed to a DIFFERENT leaf) and the
 * committed scope is AREA, this hook's own query MUST name exactly this leaf — one areaKeys
 * value, never widened — and thread the intent + auth state through. Replaces the producer
 * half of the "exactly one areaKeys" row of the legacy issue-1956-pr4-price-auth-contract spec.
 *
 * Scope, stated honestly: this pins ONE of the producers of that request. On the legacy spec's
 * URL (journey=area-first&node=a:...) the map-supplied base normally matches, so the request that
 * actually fires there comes from useDiscoverMapData's activeAreaListingKeys (page composition) and
 * is NOT pinned by this file.
 */
describe('useAreaLeafResultSource — own fallback query names exactly this leaf (#2836 N5)', () => {
  const OTHER_LEAF = 'IN|KA|Bangalore|Whitefield';

  function standalone(overrides: Partial<UseAreaLeafResultSourceParams> = {}): UseAreaLeafResultSourceParams {
    return {
      city: 'bangalore',
      areaKey: LEAF,
      effectiveFilters: FILTERS,
      debouncedSearch: undefined,
      listingPurpose: 'sale',
      isAuthenticated: false,
      source: { scope: { kind: 'area' } },
      ...overrides,
    };
  }

  it('no area base, AREA scope: areaKeys is exactly [leaf], with intent and anon state forwarded', () => {
    renderHook(() => useAreaLeafResultSource(standalone({ listingPurpose: 'rent', isAuthenticated: false })));
    expect(mockUseDiscoverCityListings).toHaveBeenLastCalledWith(
      expect.objectContaining({ city: 'bangalore', areaKeys: [LEAF], listingPurpose: 'rent', isAuthenticated: false }),
    );
  });

  it('no area base, AREA scope, signed in: the same single areaKeys, isAuthenticated=true', () => {
    renderHook(() => useAreaLeafResultSource(standalone({ listingPurpose: 'sale', isAuthenticated: true })));
    expect(mockUseDiscoverCityListings).toHaveBeenLastCalledWith(
      expect.objectContaining({ areaKeys: [LEAF], listingPurpose: 'sale', isAuthenticated: true }),
    );
  });

  it('an area base keyed to a DIFFERENT leaf does not suppress the own query', () => {
    renderHook(() =>
      useAreaLeafResultSource(
        standalone({
          source: {
            areaBase: { listings: MAP_LISTINGS, areaKey: OTHER_LEAF, loading: false, fetching: false, error: false, retry: refetch },
            scope: { kind: 'area' },
          },
        }),
      ),
    );
    expect(mockUseDiscoverCityListings).toHaveBeenLastCalledWith(expect.objectContaining({ areaKeys: [LEAF] }));
  });

  it('control: the same unmatched base under a VIEWPORT scope issues no own areaKeys', () => {
    renderHook(() =>
      useAreaLeafResultSource(
        standalone({
          source: { scope: { kind: 'viewport', audience: 'anon', listings: VIEWPORT_LISTINGS, loading: false } },
        }),
      ),
    );
    expect(mockUseDiscoverCityListings).toHaveBeenLastCalledWith(expect.objectContaining({ areaKeys: [] }));
  });
});
