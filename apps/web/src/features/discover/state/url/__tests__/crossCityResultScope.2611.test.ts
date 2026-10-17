import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { isAreaKeyMatchingCity } from '@/lib/localityUtils';
import { resolveDiscoverMarkerScope } from '@/features/discover/selectors/markerScope';
import { buildNavigationCountsFilters } from '@/features/discover/adapters/navigationCountsFilters';
import { buildCityListingsQueryParams } from '@/features/discover/adapters/cityListingsQueryParams';

function wrapper(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    );
  };
}

function renderFacade(initialUrl: string) {
  return renderHook(
    () => ({
      urlState: useDiscoverUrlState(),
      location: useLocation(),
      navigationType: useNavigationType(),
    }),
    { wrapper: wrapper(initialUrl) },
  );
}

describe('Issue #2611 — Cross-city result scope state ownership and normalization', () => {
  it('isAreaKeyMatchingCity correctly identifies matching and cross-city area keys', () => {
    expect(isAreaKeyMatchingCity('IN|KA|Bengaluru|Hebbal', 'bangalore')).toBe(true);
    expect(isAreaKeyMatchingCity('IN|KA|Bengaluru|Hebbal', 'udupi')).toBe(false);
    expect(isAreaKeyMatchingCity('a:IN|KA|Bengaluru|Hebbal', 'udupi')).toBe(false);
    expect(isAreaKeyMatchingCity('IN|KA|Udupi|Manipal', 'udupi')).toBe(true);
    expect(isAreaKeyMatchingCity('IN|KA|Udupi|Manipal', 'bangalore')).toBe(false);
  });

  it('1. Bengaluru/Hebbal -> switch city -> Udupi/Manipal (Hebbal rareas does not survive)', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&node=a:IN|KA|Bengaluru|Hebbal&rscope=areas&rareas=IN|KA|Bengaluru|Hebbal',
    );

    // Initial state check
    const initialSearch = new URLSearchParams(result.current.location.search);
    expect(initialSearch.get('city')).toBe('bangalore');
    expect(initialSearch.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal');

    // Switch city to Udupi
    act(() => {
      result.current.urlState[1].changeCity('udupi');
    });

    const midSearch = new URLSearchParams(result.current.location.search);
    expect(midSearch.get('city')).toBe('udupi');
    expect(midSearch.has('node')).toBe(false);
    expect(midSearch.has('rscope')).toBe(false);
    expect(midSearch.has('rareas')).toBe(false);
    expect(midSearch.has('rprev')).toBe(false);

    // Navigate to Manipal in Udupi atomically
    act(() => {
      result.current.urlState[1].selectArea('IN|KA|Udupi|Manipal', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Udupi|Manipal'],
      });
    });

    const finalSearch = new URLSearchParams(result.current.location.search);
    expect(finalSearch.get('city')).toBe('udupi');
    expect(finalSearch.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(finalSearch.get('rscope')).toBe('areas');
    expect(finalSearch.get('rareas')).toBe('IN|KA|Udupi|Manipal');
    expect(finalSearch.get('rareas') ?? '').not.toContain('Hebbal');
  });

  it('2. Reverse direction: Udupi area -> switch city -> Bengaluru area (Manipal rareas does not survive)', () => {
    const { result } = renderFacade(
      '/discover?city=udupi&node=a:IN|KA|Udupi|Manipal&rscope=areas&rareas=IN|KA|Udupi|Manipal',
    );

    // Switch city to Bengaluru
    act(() => {
      result.current.urlState[1].changeCity('bangalore');
    });

    const midSearch = new URLSearchParams(result.current.location.search);
    expect(midSearch.get('city')).toBe('bangalore');
    expect(midSearch.has('node')).toBe(false);
    expect(midSearch.has('rscope')).toBe(false);
    expect(midSearch.has('rareas')).toBe(false);

    // Select Hebbal in Bengaluru atomically
    act(() => {
      result.current.urlState[1].selectArea('IN|KA|Bengaluru|Hebbal', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Bengaluru|Hebbal'],
      });
    });

    const finalSearch = new URLSearchParams(result.current.location.search);
    expect(finalSearch.get('city')).toBe('bangalore');
    expect(finalSearch.get('areaKey')).toBe('IN|KA|Bengaluru|Hebbal');
    expect(finalSearch.get('rscope')).toBe('areas');
    expect(finalSearch.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal');
    expect(finalSearch.get('rareas') ?? '').not.toContain('Manipal');
  });

  it('3. Same-city area -> area navigation (preserves existing result-scope behavior)', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&node=a:IN|KA|Bengaluru|Hebbal&rscope=areas&rareas=IN|KA|Bengaluru|Hebbal',
    );

    // Select Nagawara in the same city (Bengaluru)
    act(() => {
      result.current.urlState[1].selectArea('IN|KA|Bengaluru|Nagawara', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Nagawara'],
      });
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('city')).toBe('bangalore');
    expect(search.get('areaKey')).toBe('IN|KA|Bengaluru|Nagawara');
    expect(search.get('rscope')).toBe('areas');
    expect(search.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal,IN|KA|Bengaluru|Nagawara');
  });

  it('4. Direct hydration of invalid cross-city URL (city=udupi&node=Manipal&rareas=Bengaluru/Hebbal normalizes/fails safe)', () => {
    const { result } = renderFacade(
      '/discover?city=udupi&node=a:IN|KA|Udupi|Manipal&rscope=areas&rareas=IN|KA|Bengaluru|Hebbal',
    );

    // Rejection of cross-city area key on hydration: resultScope.active should derive as null (not Hebbal)
    expect(result.current.urlState[0].resultScope?.active).toBeNull();
  });

  it('4b. Direct hydration without node (city=udupi&rscope=areas&rareas=IN|KA|Bengaluru|Hebbal fails safe to no active scope)', () => {
    const { result } = renderFacade(
      '/discover?city=udupi&rscope=areas&rareas=IN|KA|Bengaluru|Hebbal',
    );

    expect(result.current.urlState[0].resultScope?.active).toBeNull();
  });

  it('5. Browser back/forward history consistency across city transitions', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&node=a:IN|KA|Bengaluru|Hebbal&rscope=areas&rareas=IN|KA|Bengaluru|Hebbal',
    );

    // Initial check: bangalore & Hebbal
    expect(result.current.urlState[0].city).toBe('bangalore');
    expect(result.current.urlState[0].resultScope?.active).toEqual({
      kind: 'AREA_SET',
      areaKeys: ['IN|KA|Bengaluru|Hebbal'],
    });

    // Switch city to Udupi
    act(() => {
      result.current.urlState[1].changeCity('udupi');
    });
    expect(result.current.urlState[0].city).toBe('udupi');
    expect(result.current.urlState[0].resultScope?.active).toBeNull();
  });

  it('6. List, count, and marker query parity after transition', () => {
    const city = 'udupi';
    const areaKeys = ['IN|KA|Udupi|Manipal'];

    const markerScope = resolveDiscoverMarkerScope({
      sourceMode: 'residential',
      journey: 'area-first',
      schoolId: null,
      rawNodeParam: 'a:IN|KA|Udupi|Manipal',
      resolvedNodeKey: 'a:IN|KA|Udupi|Manipal',
      groupAreaKeys: undefined,
    });

    expect(markerScope).toEqual({
      kind: 'node',
      nodeKey: 'a:IN|KA|Udupi|Manipal',
    });

    const listingsParams = buildCityListingsQueryParams(
      city,
      areaKeys,
      {},
      'buy',
    );

    expect(listingsParams).toEqual({
      city: 'udupi',
      areaKeys: ['IN|KA|Udupi|Manipal'],
      limitPerArea: 20,
      propertyType: undefined,
      commercialSubtypes: undefined,
      bedrooms: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      areaMinSqft: undefined,
      areaMaxSqft: undefined,
      q: undefined,
      listingPurpose: 'buy',
    });

    const countsFilters = buildNavigationCountsFilters('buy', {});
    expect(countsFilters.purpose).toBe('buy');
  });

  // #2750 PR-5 city-switch-N3 — drives the REAL router so Back is observed, not inferred from a flag.
  it('switching city drops areaKey and viewport, keeps filters, and is one PUSH that Back undoes', () => {
    const initialUrl =
      '/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.3&lon=74.8&zoom=14&type=apartment';
    const { result } = renderHook(
      () => ({
        urlState: useDiscoverUrlState(),
        location: useLocation(),
        navigationType: useNavigationType(),
        navigate: useNavigate(),
      }),
      { wrapper: wrapper(initialUrl) },
    );
    const initialSearch = result.current.location.search;
    expect(new URLSearchParams(initialSearch).get('areaKey')).toBe('IN|KA|Udupi|Manipal');

    act(() => {
      result.current.urlState[1].changeCity('kundapur');
    });

    const switched = new URLSearchParams(result.current.location.search);
    expect(switched.get('city')).toBe('kundapur');
    expect(switched.has('areaKey')).toBe(false);
    expect(switched.has('lat')).toBe(false);
    expect(switched.has('lon')).toBe(false);
    expect(switched.has('zoom')).toBe(false);
    // Property filters survive a city switch.
    expect(switched.get('type')).toBe('apartment');
    expect(result.current.navigationType).toBe('PUSH');

    // PUSH means Back restores the Udupi entry exactly (area + viewport back); a REPLACE would leave the page.
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.search).toBe(initialSearch);
    const restored = new URLSearchParams(result.current.location.search);
    expect(restored.get('city')).toBe('udupi');
    expect(restored.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(restored.get('lat')).toBe('13.3');
    expect(restored.get('lon')).toBe('74.8');
    expect(restored.get('zoom')).toBe('14');
  });
});
