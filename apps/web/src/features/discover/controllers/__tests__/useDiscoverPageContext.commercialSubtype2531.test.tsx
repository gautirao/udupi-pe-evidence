/**
 * Issue #2531 — `urlDiscoverFilters`, the projection that made every downstream fix inert.
 *
 * THE DROP POINT THAT A CALL-SITE ENUMERATION CANNOT FIND. #2531 was first fixed by
 * forwarding `commercialSubtypes` at six `useDiscoverCityListings` call sites. Two of
 * those six reach the hook through `buildCityListingsQueryParams`, and both are handed
 * `urlDiscoverFilters` — an explicit 15-key projection built here that did NOT name
 * `commercialSubtypes`. So the adapter forwarded the field faithfully and the field never
 * ARRIVED: a no-op fix on a third of the call sites, with every test green, because each
 * test supplied the filters object itself rather than letting this projection build it.
 *
 * The same object is serialised by `buildDiscoverSearchParams` for the AUTHENTICATED
 * group-results listings and markers queries, so the omission silently un-narrowed those
 * too, even though that serialiser has emitted `commercialSubtypes` since #2431.
 *
 * This is a DROP POINT, not a call site — which is exactly why enumerating call sites did
 * not surface it, and why this spec exists at the projection rather than at a consumer.
 *
 * The defect class is the one this codebase keeps paying for: an explicit key list that a
 * new axis has to be remembered into. #2553 removed one such list (`toCommittedUrlFilters`
 * now spreads); #2023 and #2553 were both caused by others. This test does not remove the
 * list — it pins the one axis that matters and fails loudly if it is dropped again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

// ─── Mocks ────────────────────────────────────────────────────

/** Mutable so each test controls the URL-derived filters the projection reads. */
let mockNavFilters: DiscoverUrlFilters = {};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// The layer selector is unrelated to this projection and needs a fuller nav shape than
// these tests supply; stubbed so a crash there cannot masquerade as a projection failure.
vi.mock('@/features/discover/selectors/mapLayerCategory', () => ({
  computeDiscoverLayer: () => ({ kind: 'city' }),
  toLayerInput: (x: unknown) => x,
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    q: '',
    intent: 'buy' as const,
    journey: 'area-first' as const,
    filters: mockNavFilters,
  }),
  useDiscoverViewport: () => null,
  useDiscoverActions: () => ({}),
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    isMobileShell: false,
    setMobileView: vi.fn(),
    isAreaSetDraftOpen: false,
  }),
}));

import { useDiscoverPageContext } from '../useDiscoverPageContext';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(MemoryRouter, null, children),
  );
}

function urlDiscoverFilters() {
  const { result } = renderHook(() => useDiscoverPageContext(), { wrapper });
  return result.current.urlDiscoverFilters;
}

beforeEach(() => {
  mockNavFilters = {};
});

describe('#2531 — urlDiscoverFilters carries the Commercial subtype', () => {
  it('projects a single subtype out of URL state', () => {
    mockNavFilters = { commercialSubtypes: ['OFFICE'] };
    expect(urlDiscoverFilters().commercialSubtypes).toEqual(['OFFICE']);
  });

  it('projects a multi-subtype selection whole', () => {
    mockNavFilters = { commercialSubtypes: ['SHOP', 'OFFICE'] };
    expect(urlDiscoverFilters().commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  /**
   * ONE AXIS — the shape that reproduces the buyer report. Shop and Office both imply
   * property_type='commercial', so the property-type key this projection ALREADY carried
   * cannot separate them. That is precisely why the omission was invisible: everything
   * looked filtered, because `propertyTypes: ['commercial']` did arrive.
   */
  it('projects the subtype when the URL carries no property type at all', () => {
    mockNavFilters = { commercialSubtypes: ['OFFICE'] };
    const projected = urlDiscoverFilters();
    expect(projected.propertyTypes).toBeUndefined();
    expect(projected.commercialSubtypes).toEqual(['OFFICE']);
  });

  /**
   * Falsifiability control, same projection shape, varying only the subtype key. Without
   * it, a projection that hardcoded a subtype would satisfy every assertion above.
   */
  it('leaves the axis undefined when the URL carries no subtype', () => {
    mockNavFilters = { propertyTypes: ['commercial'] };
    const projected = urlDiscoverFilters();
    expect(projected.commercialSubtypes).toBeUndefined();
    // Same-shape control: the projection IS running and IS carrying other axes, so the
    // undefined above is a real absence rather than an unbuilt object.
    expect(projected.propertyTypes).toEqual(['commercial']);
  });

  /**
   * Regression guard for the sibling keys this projection already owned. A "fix" that
   * rebuilt the key list and dropped one of these would trade this bug for its twin —
   * which is the exact history of #2023 and #2553 at other projections.
   */
  it('still carries the axes it already owned', () => {
    mockNavFilters = {
      propertyTypes: ['commercial'],
      commercialSubtypes: ['SHOP'],
      bedrooms: [2],
      priceMin: 100,
      priceMax: 200,
      readyToMove: true,
    };
    const projected = urlDiscoverFilters();
    expect(projected.commercialSubtypes).toEqual(['SHOP']);
    expect(projected.bedrooms).toEqual([2]);
    expect(projected.priceMin).toBe(100);
    expect(projected.priceMax).toBe(200);
    expect(projected.readyToMove).toBe(true);
  });

  /**
   * THE MEMO-DEPENDENCY HALF — independently a bug, and invisible to every arm above.
   *
   * Each arm above renders the hook FRESH, so a corrected object literal alone satisfies
   * them: the memo computes once and there is no stale value to serve. The real buyer case
   * is a LIVE change — a shopper switching Shop to Office alters `?subtype=` and nothing
   * else. If `nav.filters.commercialSubtypes` is absent from the dep array then every other
   * dep is unchanged across that switch, the memo does not recompute, and the controllers
   * keep serving the PREVIOUS subtype: correct code, stale value.
   *
   * So this arm holds every other axis constant and varies ONLY the subtype across a
   * rerender. A literal-only fix passes all six assertions above and fails this one — which
   * is what makes the two halves independently falsifiable rather than jointly assumed.
   */
  it('re-derives on a subtype-only change, with every other axis held constant', () => {
    mockNavFilters = { commercialSubtypes: ['SHOP'] };
    const { result, rerender } = renderHook(() => useDiscoverPageContext(), { wrapper });
    expect(result.current.urlDiscoverFilters.commercialSubtypes).toEqual(['SHOP']);

    // ONLY the subtype differs. No other key changes, so no other dep can trigger the
    // memo — if this recomputes, it is because the subtype dep is present.
    mockNavFilters = { commercialSubtypes: ['OFFICE'] };
    rerender();

    expect(result.current.urlDiscoverFilters.commercialSubtypes).toEqual(['OFFICE']);
  });
});
