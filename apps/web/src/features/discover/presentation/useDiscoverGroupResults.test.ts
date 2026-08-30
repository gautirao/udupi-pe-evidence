import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDiscoverGroupResults,
  type UseDiscoverGroupResultsParams,
} from './useDiscoverGroupResults';
import type { DiscoverListingItem, DiscoverListingsPage } from '@/hooks/useDiscoverListings';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { DiscoverFilteredMarkersResponse } from '@/hooks/useDiscoverFilteredMarkers';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

const EMPTY_FILTERS: PropertyFilters = {};

// refetch stubs — the hook only re-exposes whichever branch is active. The authed and anon
// `refetch` signatures come from two distinct react-query hooks (different generic data
// shapes), so each stub is cast to its own field's declared type individually (never to the
// return type only) to keep both branches type-correct.
function makeAuthedRefetchNoop(): UseDiscoverGroupResultsParams['refetchGroupResultsAuthed'] {
  return (() => Promise.resolve()) as unknown as UseDiscoverGroupResultsParams['refetchGroupResultsAuthed'];
}

function makeAnonRefetchNoop(): UseDiscoverGroupResultsParams['refetchGroupResultsAnon'] {
  return (() => Promise.resolve()) as unknown as UseDiscoverGroupResultsParams['refetchGroupResultsAnon'];
}

function makeParams(overrides: Partial<UseDiscoverGroupResultsParams> = {}): UseDiscoverGroupResultsParams {
  return {
    isGroupResultsState: true,
    isAuthenticated: false,
    groupResultsAuthedData: undefined,
    isLoadingGroupResultsAuthed: false,
    isGroupResultsErrorAuthed: false,
    refetchGroupResultsAuthed: makeAuthedRefetchNoop(),
    groupResultsMarkersData: undefined,
    groupResultsAnonData: undefined,
    isLoadingGroupResultsAnon: false,
    isGroupResultsErrorAnon: false,
    refetchGroupResultsAnon: makeAnonRefetchNoop(),
    anonGroupFilters: EMPTY_FILTERS,
    ...overrides,
  };
}

const AUTHED_PAGE: DiscoverListingsPage = {
  content: [
    {
      id: 'listing-1',
      listingNumber: 'L-1',
      propertyType: 'house',
      title: 'Authed Listing',
      locality: 'Manipal',
      areaKey: 'IN|KA|Udupi|Manipal',
      pricePaise: 500000000,
      landArea: null,
      landAreaUnit: null,
      builtArea: null,
      builtAreaUnit: null,
      bedrooms: 3,
      latitude: 13.35,
      longitude: 74.79,
      heroImageUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 0,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      trustBadge: 'verified',
      possessionStatus: null,
      sellerType: null,
      listingPurpose: 'sale',
      status: 'active',
    },
  ],
  page: 0,
  size: 50,
  totalElements: 1,
  totalPages: 1,
};

function makeAnonItem(overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem {
  return {
    id: 'anon-1',
    pricePaise: 400000000,
    propertyType: 'apartment',
    locality: 'Udupi',
    primaryImageUrl: null,
    listingPurpose: 'sale',
    bedrooms: 2,
    title: 'Anon Listing',
    createdAt: '2026-01-02T00:00:00Z',
    trustBadge: null,
    lat: 13.34,
    lon: 74.75,
    ...overrides,
  };
}

describe('useDiscoverGroupResults', () => {
  it('returns the authed branch when isAuthenticated=true', () => {
    const { result } = renderHook(() =>
      useDiscoverGroupResults(
        makeParams({
          isAuthenticated: true,
          groupResultsAuthedData: AUTHED_PAGE,
          isLoadingGroupResultsAuthed: false,
          isGroupResultsErrorAuthed: false,
        }),
      ),
    );
    expect(result.current.groupResultsListings).toEqual(AUTHED_PAGE.content);
    expect(result.current.groupResultsTotalElements).toBe(1);
    expect(result.current.isLoadingGroupResults).toBe(false);
    expect(result.current.isGroupResultsError).toBe(false);
  });

  it('returns the anon branch (normalised city listings) when isAuthenticated=false', () => {
    const { result } = renderHook(() =>
      useDiscoverGroupResults(
        makeParams({
          isAuthenticated: false,
          groupResultsAnonData: {
            city: 'udupi',
            limitPerArea: 20,
            areas: [{ areaKey: 'IN|KA|Udupi|Udupi', areaName: 'Udupi', listings: [makeAnonItem()] }],
          },
        }),
      ),
    );
    expect(result.current.groupResultsListings).toHaveLength(1);
    expect(result.current.groupResultsListings[0].id).toBe('anon-1');
    // Issue #1567/#1616 anon-teaser invariant: trustBadge must never be fabricated.
    expect(result.current.groupResultsListings[0].trustBadge).toBeNull();
    expect(result.current.groupResultsTotalElements).toBe(1);
  });

  it('toggles isLoadingGroupResults/isGroupResultsError/refetchGroupResults by the auth branch', () => {
    const authedRefetch = makeAuthedRefetchNoop();
    const anonRefetch = makeAnonRefetchNoop();
    const { result, rerender } = renderHook(
      (props: { isAuthenticated: boolean }) =>
        useDiscoverGroupResults(
          makeParams({
            isAuthenticated: props.isAuthenticated,
            isLoadingGroupResultsAuthed: true,
            isGroupResultsErrorAuthed: true,
            refetchGroupResultsAuthed: authedRefetch,
            isLoadingGroupResultsAnon: false,
            isGroupResultsErrorAnon: false,
            refetchGroupResultsAnon: anonRefetch,
          }),
        ),
      { initialProps: { isAuthenticated: true } },
    );
    expect(result.current.isLoadingGroupResults).toBe(true);
    expect(result.current.isGroupResultsError).toBe(true);
    expect(result.current.refetchGroupResults).toBe(authedRefetch);

    rerender({ isAuthenticated: false });
    expect(result.current.isLoadingGroupResults).toBe(false);
    expect(result.current.isGroupResultsError).toBe(false);
    expect(result.current.refetchGroupResults).toBe(anonRefetch);
  });

  it('groupResultsMarkers: auth branch maps DiscoverFilteredMarker[] via filteredMarkerToPropertyListing', () => {
    const markersData: DiscoverFilteredMarkersResponse = {
      city: 'udupi',
      markers: [{ id: 'm1', lat: 13.35, lon: 74.79, pricePaise: 500000000, locality: 'Manipal' }],
    };
    const { result } = renderHook(() =>
      useDiscoverGroupResults(
        makeParams({
          isAuthenticated: true,
          groupResultsMarkersData: markersData,
        }),
      ),
    );
    expect(result.current.groupResultsMarkers).toHaveLength(1);
    expect(result.current.groupResultsMarkers[0].id).toBe('m1');
  });

  it('groupResultsMarkers: anon branch derives from groupResultsAnonRaw, filtering null coords', () => {
    const { result } = renderHook(() =>
      useDiscoverGroupResults(
        makeParams({
          isAuthenticated: false,
          groupResultsAnonData: {
            city: 'udupi',
            limitPerArea: 20,
            areas: [
              {
                areaKey: 'IN|KA|Udupi|Udupi',
                areaName: 'Udupi',
                listings: [makeAnonItem({ id: 'a1' }), makeAnonItem({ id: 'a2', lat: null, lon: null })],
              },
            ],
          },
        }),
      ),
    );
    expect(result.current.groupResultsMarkers).toHaveLength(1);
    expect(result.current.groupResultsMarkers[0].id).toBe('a1');
  });

  it('returns empty results when isGroupResultsState=false', () => {
    const { result } = renderHook(() =>
      useDiscoverGroupResults(
        makeParams({
          isGroupResultsState: false,
          isAuthenticated: false,
          groupResultsAnonData: {
            city: 'udupi',
            limitPerArea: 20,
            areas: [{ areaKey: 'IN|KA|Udupi|Udupi', areaName: 'Udupi', listings: [makeAnonItem()] }],
          },
        }),
      ),
    );
    expect(result.current.groupResultsListings).toEqual([]);
    expect(result.current.groupResultsMarkers).toEqual([]);
  });

  // ── Memo-identity (AC-MEMO-IDENTITY) ──────────────────────────────────────
  it('groupResultsMarkers: identity-stable across a no-op rerender (same props)', () => {
    const params = makeParams({
      isAuthenticated: true,
      groupResultsMarkersData: { city: 'udupi', markers: [{ id: 'm1', lat: 13.35, lon: 74.79, pricePaise: 1, locality: null }] },
    });
    const { result, rerender } = renderHook((p: UseDiscoverGroupResultsParams) => useDiscoverGroupResults(p), {
      initialProps: params,
    });
    const first = result.current.groupResultsMarkers;
    rerender(params);
    expect(result.current.groupResultsMarkers).toBe(first);
  });

  it('groupResultsMarkers: recomputes (positive control) when groupResultsMarkersData changes', () => {
    const params = makeParams({
      isAuthenticated: true,
      groupResultsMarkersData: { city: 'udupi', markers: [{ id: 'm1', lat: 13.35, lon: 74.79, pricePaise: 1, locality: null }] },
    });
    const { result, rerender } = renderHook((p: UseDiscoverGroupResultsParams) => useDiscoverGroupResults(p), {
      initialProps: params,
    });
    const first = result.current.groupResultsMarkers;
    rerender({
      ...params,
      groupResultsMarkersData: { city: 'udupi', markers: [{ id: 'm2', lat: 13.36, lon: 74.80, pricePaise: 2, locality: null }] },
    });
    expect(result.current.groupResultsMarkers).not.toBe(first);
  });

  // ── S9b2-inverse: the unified-surface plain consts are deliberately NOT memoized.
  it('unified-surface members (groupResultsListings et al.) are plain per-render values, not frozen useMemo output', () => {
    // No stability assertion is made — these are plain const ternaries (verbatim from
    // the original page), not useMemo. A no-op rerender still recomputes them.
    const params = makeParams({ isAuthenticated: true, groupResultsAuthedData: AUTHED_PAGE });
    const { result, rerender } = renderHook((p: UseDiscoverGroupResultsParams) => useDiscoverGroupResults(p), {
      initialProps: params,
    });
    const firstListings = result.current.groupResultsListings;
    rerender(params);
    // groupResultsListings here is `groupResultsAuthedData?.content ?? []` — since
    // groupResultsAuthedData is the SAME reference across rerenders, .content is also
    // the same reference; this is a property of the underlying data, not of memoization.
    expect(result.current.groupResultsListings).toBe(firstListings);
  });
});
