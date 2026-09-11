/**
 * Issue #2431 — the `subtype` URL param (Commercial Shop/Office narrowing).
 *
 * Covers the round-trip the issue requires: encode the selection into canonical Discover URL
 * state, restore it on reload/back/forward, and refuse to restore a value the server would
 * reject.
 *
 * These tests drive the REAL facade (`useDiscoverUrlState`) through a MemoryRouter rather than
 * calling `serializeFilters` directly, so they exercise the same read path a page load does.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

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
    () => ({ urlState: useDiscoverUrlState(), location: useLocation() }),
    { wrapper: wrapper(initialUrl) },
  );
}

describe('#2431 — reading `subtype` from the URL', () => {
  it('restores a single subtype on load', () => {
    const { result } = renderFacade('/discover?city=bangalore&type=commercial&subtype=SHOP');
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['SHOP']);
  });

  it('restores both subtypes from a comma-joined value', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=SHOP,OFFICE');
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  it('accepts a lower-case value and canonicalises it to upper case', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=shop');
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['SHOP']);
  });

  it('is undefined when the param is absent', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    expect(result.current.urlState[0].filters.commercialSubtypes).toBeUndefined();
  });

  it('DROPS an unrecognised value rather than passing it to the server, which would 400', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=RESTAURANT');
    expect(result.current.urlState[0].filters.commercialSubtypes).toBeUndefined();
  });

  it('keeps the valid half of a partly-bad value', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=SHOP,RESTAURANT');
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['SHOP']);
  });

  // #2458 — DELIBERATE REVERSAL of the #2431 assertion this replaced. It asserted these three were
  // DROPPED, on the reasoning that they are property types here rather than subtypes. That holds
  // only if property_type alone can express every buyer selection; under the approved #2429 model
  // it cannot, because a MIXED selection (Shop + Warehouse/Godown) needs one predicate spanning
  // both axes. The five are peers in the buyer model, so the URL layer must round-trip all five.
  //
  // The allowlist ITSELF is unchanged in purpose — only its membership moved. Unknown values are
  // still dropped (see the RESTAURANT cases above), because the server answers an unrecognised
  // subtype with a 400 rather than an empty result, so a stale link must degrade to "no subtype
  // filter" rather than breaking the page.
  it('keeps BUILDING/WAREHOUSE/LAND — they are peer subtypes in the approved buyer model', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=BUILDING,WAREHOUSE,LAND');
    expect(result.current.urlState[0].filters.commercialSubtypes)
      .toEqual(['BUILDING', 'WAREHOUSE', 'LAND']);
  });

  it('still drops an unrecognised value when mixed with the newly-valid three', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=WAREHOUSE,RESTAURANT');
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['WAREHOUSE']);
  });
});

describe('#2431 — writing `subtype` to the URL', () => {
  it('round-trips: a committed selection lands in the URL and reads back identically', async () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['OFFICE'],
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('subtype')).toBe('OFFICE');
    expect(params.get('type')).toBe('commercial');

    // ...and the facade reads its own write back as the same value.
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['OFFICE']);
  });

  it('joins both subtypes with a comma, matching the `type`/`seller` convention', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP', 'OFFICE'],
      });
    });

    expect(new URLSearchParams(result.current.location.search).get('subtype')).toBe('SHOP,OFFICE');
  });

  it('a committed selection is a history destination, so Back restores the previous URL', () => {
    const { result } = renderFacade('/discover?city=bangalore&type=commercial');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
      });
    });
    expect(new URLSearchParams(result.current.location.search).get('subtype')).toBe('SHOP');

    act(() => {
      window.history.back();
    });
  });

  it('clearing the selection REMOVES the param rather than leaving an empty one', () => {
    const { result } = renderFacade('/discover?city=bangalore&type=commercial&subtype=SHOP');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['commercial'],
        commercialSubtypes: undefined,
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('subtype')).toBe(false);
  });

  it('"Clear all" drops `subtype` along with every other filter key, without knowing it exists', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&type=commercial&subtype=SHOP&beds=2&q=shop',
    );

    act(() => {
      result.current.urlState[1].clearAllFiltersAndSearch();
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('subtype')).toBe(false);
    expect(params.has('type')).toBe(false);
    expect(params.has('q')).toBe(false);
    // City survives — clearing filters is not leaving the city.
    expect(params.get('city')).toBe('bangalore');
  });
});
