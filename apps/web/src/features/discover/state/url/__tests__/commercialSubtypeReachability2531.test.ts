/**
 * Issue #2531 — URL → wire reachability for the Commercial subtype.
 *
 * WHY THIS EXISTS SEPARATELY. Three specs each proved one link of this chain and
 * none proved the chain:
 *
 *   URL → filters          state/url/__tests__/commercialSubtype.test.ts  (#2431)
 *   commit → filters       views/__tests__/commitAllowlist.2553.test.tsx  (#2553)
 *   filters → wire         hooks/__tests__/useDiscoverMapData.commercialSubtype2531 (#2531)
 *
 * A chain of three green links is not a green chain: #2531 is precisely the case where
 * every individual link passed and the buyer still got Shops, because the axis died in
 * the seam between link 1 and link 3. This spec joins the REAL parser to the REAL
 * adapter — neither end mocked — so the seam itself is asserted.
 *
 * REACHABILITY VIA URL STATE, NOT UI COMPOSITION. The Commercial subtype capability flag
 * is still OFF (`isCommercialSubtypeSupported = false`), so the chip is not clickable and
 * a UI-driven test would assert nothing about the data path — or worse, pass vacuously
 * because the control is absent. Driving the axis through the URL exercises the exact
 * path a shared/bookmarked link takes, which is buyer-reachable TODAY and independent of
 * when the flag flips.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { buildCityListingsQueryParams } from '@/features/discover/adapters/cityListingsQueryParams';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

const AREA_KEYS = ['IN|KA|Udupi|Manipal'];

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

/**
 * Parse a real Discover URL with the REAL facade, then hand the resulting filters to the
 * REAL anon adapter — the same two components `useDiscoverResultsController` wires
 * together on the anonymous path.
 */
function urlToCityListingsParams(initialUrl: string) {
  const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: wrapper(initialUrl) });
  const filters = result.current[0].filters as unknown as PropertyFilters;
  return {
    filters,
    built: buildCityListingsQueryParams('udupi', AREA_KEYS, filters, 'sale'),
  };
}

describe('#2531 — a subtype in the URL reaches the anon city-listings request', () => {
  it('carries a single subtype from the URL through to the request params', () => {
    const { built } = urlToCityListingsParams('/discover?city=udupi&subtype=OFFICE');
    expect(built.commercialSubtypes).toEqual(['OFFICE']);
  });

  it('carries a multi-subtype selection whole, narrowing rather than dropping', () => {
    const { built } = urlToCityListingsParams('/discover?city=udupi&subtype=SHOP,OFFICE');
    expect(built.commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  /**
   * THE ONE-AXIS CASE, and the one that actually reproduces the buyer report. A Commercial
   * selection rides `subtype=` ALONE — no `type=` token. Shop and Office both imply
   * property_type='commercial', so the property-type axis provably cannot separate them:
   * the subtype is the only thing that can, which is why forwarding it must not be
   * conditional on a property type being present.
   */
  it('reaches the request when the URL carries subtype= and NO type=', () => {
    const { filters, built } = urlToCityListingsParams('/discover?city=udupi&subtype=OFFICE');
    expect(filters.propertyTypes).toBeUndefined();
    expect(built.propertyType).toBeUndefined();
    expect(built.commercialSubtypes).toEqual(['OFFICE']);
  });

  /**
   * Falsifiability control — identical query shape, varying only the subtype param. Without
   * it, an adapter that unconditionally emitted every known subtype would satisfy every
   * assertion above.
   */
  it('omits the axis entirely when the URL carries no subtype', () => {
    const { built } = urlToCityListingsParams('/discover?city=udupi&type=commercial');
    expect(built.commercialSubtypes).toBeUndefined();
  });

  /**
   * A hand-edited or stale link degrades to "no subtype filter" rather than reaching the
   * server, which answers an unrecognised subtype with a 400 rather than an empty result.
   * The allowlist that guarantees this lives in the URL layer; this asserts the guarantee
   * SURVIVES the new forwarding rather than being bypassed by it — the failure mode a fix
   * that forwarded raw URL text would introduce.
   */
  it('does not forward an unrecognised subtype the server would 400 on', () => {
    const { built } = urlToCityListingsParams('/discover?city=udupi&subtype=RESTAURANT');
    expect(built.commercialSubtypes).toBeUndefined();
  });

  it('forwards only the valid half of a partly-bad link', () => {
    const { built } = urlToCityListingsParams('/discover?city=udupi&subtype=SHOP,RESTAURANT');
    expect(built.commercialSubtypes).toEqual(['SHOP']);
  });
});
