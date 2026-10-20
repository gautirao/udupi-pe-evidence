/**
 * #2859 B4 (csv35, e2e/commercial-subtype-implied-type-hotfix.spec.ts S6b, S7.url) — the MIXED
 * commercial selection's URL shape, and the subtype param's removal when its type is unticked.
 *
 * A NEW file (not useDiscoverUrlState.test.ts, which is red at base, #2813). Drives the REAL facade
 * through a MemoryRouter, the same harness as features/discover/state/url/__tests__/commercialSubtype.test.ts.
 * The trivial first it guards against an import-graph failure making the whole file vacuous.
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

const params = (r: ReturnType<typeof renderFacade>['result']) =>
  new URLSearchParams(r.current.location.search);

describe('#2859 B4 — useDiscoverUrlState mixed commercial subtype URL', () => {
  it('import-graph guard: the facade mounts and reads the city', () => {
    const { result } = renderFacade('/discover?city=udupi');
    expect(params(result).get('city')).toBe('udupi');
  });

  it('S6b: a mixed Shop + Warehouse selection writes type=commercial,warehouse & subtype=SHOP,WAREHOUSE and reads back both', () => {
    const { result } = renderFacade('/discover?city=udupi');
    expect(params(result).has('subtype')).toBe(false);

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['commercial', 'warehouse'],
        commercialSubtypes: ['SHOP', 'WAREHOUSE'],
      });
    });

    expect(params(result).get('type')).toBe('commercial,warehouse');
    expect(params(result).get('subtype')).toBe('SHOP,WAREHOUSE');
    expect(result.current.urlState[0].filters.propertyTypes).toEqual(['commercial', 'warehouse']);
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['SHOP', 'WAREHOUSE']);
  });

  it('S6b (load): the same URL restores the mixed selection on mount', () => {
    const { result } = renderFacade('/discover?city=udupi&type=commercial,warehouse&subtype=SHOP,WAREHOUSE');
    expect(result.current.urlState[0].filters.propertyTypes).toEqual(['commercial', 'warehouse']);
    expect(result.current.urlState[0].filters.commercialSubtypes).toEqual(['SHOP', 'WAREHOUSE']);
  });

  it('S7.url: unticking Warehouse removes the subtype param while type=apartment stays', () => {
    const { result } = renderFacade('/discover?city=udupi&type=apartment,warehouse&subtype=WAREHOUSE');
    // Before: both present.
    expect(params(result).get('subtype')).toBe('WAREHOUSE');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['apartment'],
        commercialSubtypes: undefined,
      });
    });

    // After: the subtype param is gone (not empty), and the remaining type is still written.
    expect(params(result).has('subtype')).toBe(false);
    expect(params(result).get('type')).toBe('apartment');
    expect(result.current.urlState[0].filters.commercialSubtypes).toBeUndefined();
  });
});
