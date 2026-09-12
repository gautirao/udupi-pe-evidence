/**
 * Issue #2459 AC7 — the contextual area bounds must survive reload and browser back/forward,
 * restoring both the visible value AND the predicate that was actually run.
 *
 * Two halves, and both matter:
 *   1. URL round-trip through the REAL facade (`useDiscoverUrlState`) over a MemoryRouter, so the
 *      read path is the one a page load takes — same harness as the #2431 `subtype` tests.
 *   2. The value reaching the WIRE. A bound that round-trips through the URL but is never emitted
 *      as a query param restores the control and silently drops the predicate — which is exactly
 *      the half of AC7 that a URL-only test would score as a pass.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { MAX_AREA_SQFT } from '@/features/discover/filters/areaBounds';


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

describe('#2459 — reading the area bounds from the URL', () => {
  it('restores both bounds on load', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&areaMinSqft=800&areaMaxSqft=1600',
    );
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(800);
    expect(result.current.urlState[0].filters.areaMaxSqft).toBe(1600);
  });

  it('restores a lower bound alone — an open-ended range is a real selection', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=1200');
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(1200);
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  it('is undefined when the params are absent', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  it('DROPS a non-numeric value rather than forwarding NaN to the server', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=abc&areaMaxSqft=');
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  it('DROPS a negative bound — an area cannot be negative', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=-500');
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
  });

  it('keeps the valid half when only one bound is junk', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=800&areaMaxSqft=xyz');
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(800);
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  // ── #2459 review fix 4 — the decimal that made this file's own doc comment false ──────────
  it('DROPS a decimal bound, which would 400 on Integer request binding, not on the validator', () => {
    // `1200.5` parsed clean as a finite non-negative number and was forwarded verbatim. Both
    // controllers bind `Integer`, so Spring's REQUEST BINDING rejected it before
    // `AreaBoundsParam.validate()` could run — the server's designed message never fired, and
    // filters.ts's written promise of "degrades to no area filter rather than to a bad request"
    // was false for every decimal.
    const { result } = renderFacade(
      '/discover?city=bangalore&areaMinSqft=800.5&areaMaxSqft=1200.5',
    );
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  // ── #2459 magnitude cap — the same defect one layer down ──────────────────────────────────
  it('DROPS an integral bound too wide for the Integer binding', () => {
    // These are the values the integrality guard let through: `Number.isInteger` is true of all
    // three, so each parsed clean and 400d on exactly the same Spring request binding a decimal
    // did — the designed validator never running, again.
    const { result } = renderFacade(
      '/discover?city=bangalore&areaMinSqft=2147483648&areaMaxSqft=3000000000',
    );
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  it('DROPS a bound that would serialise as exponent notation', () => {
    // `String(Number('999999999999999999999'))` is "1e+21" — a value the wire could not even
    // spell as a decimal integer.
    const { result } = renderFacade(
      '/discover?city=bangalore&areaMinSqft=999999999999999999999',
    );
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
  });

  it('KEEPS the cap boundary itself — the control arm for the magnitude guard', () => {
    // Without this, a guard that dropped every large value would pass both assertions above.
    const { result } = renderFacade(`/discover?city=bangalore&areaMinSqft=${MAX_AREA_SQFT}`);
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(MAX_AREA_SQFT);
  });

  it('a dropped over-wide bound never reaches the WIRE either', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=3000000000');
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: {
        areaMinSqft: result.current.urlState[0].filters.areaMinSqft,
        areaMaxSqft: result.current.urlState[0].filters.areaMaxSqft,
      },
    });
    expect(params.has('areaMinSqft')).toBe(false);
  });

  it('a dropped decimal never reaches the WIRE either', () => {
    // The URL half alone would be a pass on a broken feature: the value is dropped from state but
    // a separately-built request could still carry it.
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=800.5');
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: {
        areaMinSqft: result.current.urlState[0].filters.areaMinSqft,
        areaMaxSqft: result.current.urlState[0].filters.areaMaxSqft,
      },
    });
    expect(params.has('areaMinSqft')).toBe(false);
  });

  it('still accepts an INTEGER bound — the control arm for the integrality guard', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=800&areaMaxSqft=1200');
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(800);
    expect(result.current.urlState[0].filters.areaMaxSqft).toBe(1200);
  });

  // ── #2459 review fix 3 — the inverted pair nothing client-side could see ──────────────────
  it('DROPS an inverted range to no filter rather than reloading a shared link into a 400', () => {
    // Each value is individually valid, so every single-key guard passed it through. The server
    // 400s the pair BY DESIGN (`AreaBoundsParam:48-51`) where "no results" is the honest answer.
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=2000&areaMaxSqft=1000');
    expect(result.current.urlState[0].filters.areaMinSqft).toBeUndefined();
    expect(result.current.urlState[0].filters.areaMaxSqft).toBeUndefined();
  });

  it('an inverted range never reaches the WIRE either', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=2000&areaMaxSqft=1000');
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: {
        areaMinSqft: result.current.urlState[0].filters.areaMinSqft,
        areaMaxSqft: result.current.urlState[0].filters.areaMaxSqft,
      },
    });
    expect(params.has('areaMinSqft')).toBe(false);
    expect(params.has('areaMaxSqft')).toBe(false);
  });

  it('keeps min === max — an exact-size search is NOT inverted (the control arm)', () => {
    // Without this, a guard using `>=` would pass every inversion test while silently deleting a
    // legitimate search.
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=1200&areaMaxSqft=1200');
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(1200);
    expect(result.current.urlState[0].filters.areaMaxSqft).toBe(1200);
  });
});

describe('#2459 review fix 3 — an inverted range cannot be WRITTEN to a shareable URL', () => {
  it('refuses to serialise an inverted pair, so no such link can be produced', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({ areaMinSqft: 2000, areaMaxSqft: 1000 });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('areaMinSqft')).toBe(false);
    expect(params.has('areaMaxSqft')).toBe(false);
  });

  it('actively REMOVES an inherited pair that a later edit inverts', () => {
    // Not merely "stops writing": the params were already on the URL.
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=900&areaMaxSqft=2400');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({ areaMinSqft: 3000, areaMaxSqft: 2400 });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('areaMinSqft')).toBe(false);
    expect(params.has('areaMaxSqft')).toBe(false);
  });

  it('still writes a VALID pair — the control arm', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({ areaMinSqft: 900, areaMaxSqft: 2400 });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('areaMinSqft')).toBe('900');
    expect(params.get('areaMaxSqft')).toBe('2400');
  });
});

describe('#2459 — writing the area bounds to the URL', () => {
  it('round-trips: a committed range lands in the URL and reads back identically', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({ areaMinSqft: 900, areaMaxSqft: 2400 });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('areaMinSqft')).toBe('900');
    expect(params.get('areaMaxSqft')).toBe('2400');
    expect(result.current.urlState[0].filters.areaMinSqft).toBe(900);
    expect(result.current.urlState[0].filters.areaMaxSqft).toBe(2400);
  });

  it('clearing a bound REMOVES the param rather than leaving an empty one', () => {
    const { result } = renderFacade('/discover?city=bangalore&areaMinSqft=900&areaMaxSqft=2400');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({ areaMinSqft: 900, areaMaxSqft: undefined });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('areaMinSqft')).toBe('900');
    expect(params.has('areaMaxSqft')).toBe(false);
  });

  it('"Clear all" drops both bounds without needing to know they exist', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&areaMinSqft=900&areaMaxSqft=2400&beds=2',
    );

    act(() => {
      result.current.urlState[1].clearAllFiltersAndSearch();
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('areaMinSqft')).toBe(false);
    expect(params.has('areaMaxSqft')).toBe(false);
    expect(params.get('city')).toBe('bangalore');
  });

  it('leaves every other filter param untouched', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['apartment'],
        bedrooms: [3],
        priceMin: 1000000,
        areaMinSqft: 900,
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('type')).toBe('apartment');
    expect(params.get('beds')).toBe('3');
    expect(params.get('priceMin')).toBe('1000000');
    expect(params.get('areaMinSqft')).toBe('900');
  });
});

describe('#2459 — the bounds reach the wire, not just the URL', () => {
  it('emits both params when set', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { areaMinSqft: 800, areaMaxSqft: 1600 },
    });
    expect(params.get('areaMinSqft')).toBe('800');
    expect(params.get('areaMaxSqft')).toBe('1600');
  });

  it('emits an open-ended range as the single bound it is', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { areaMinSqft: 1200 },
    });
    expect(params.get('areaMinSqft')).toBe('1200');
    expect(params.has('areaMaxSqft')).toBe(false);
  });

  it('emits nothing when unset — "Any size" must not send a bound', () => {
    const params = buildDiscoverSearchParams({ city: 'bangalore', filters: {} });
    expect(params.has('areaMinSqft')).toBe(false);
    expect(params.has('areaMaxSqft')).toBe(false);
  });

  it('emits a zero lower bound rather than treating 0 as absent', () => {
    const params = buildDiscoverSearchParams({ city: 'bangalore', filters: { areaMinSqft: 0 } });
    expect(params.get('areaMinSqft')).toBe('0');
  });

  it('emits identically for the listings and markers call shapes — one builder, one range', () => {
    // The two endpoints share ONE server-side validator (AreaBoundsParam.validate), so they
    // cannot accept different ranges. This asserts the client cannot ASK them to: the same
    // filters produce the same two params regardless of the caller-specific options around them.
    const filters = { areaMinSqft: 800, areaMaxSqft: 1600 };
    const listings = buildDiscoverSearchParams({
      city: 'bangalore', filters, page: 0, size: 24, includeAggregates: true,
    });
    const markers = buildDiscoverSearchParams({
      city: 'bangalore', filters, snapped: [12.8, 77.4, 13.2, 77.8],
    });
    expect(markers.get('areaMinSqft')).toBe(listings.get('areaMinSqft'));
    expect(markers.get('areaMaxSqft')).toBe(listings.get('areaMaxSqft'));
    expect(listings.get('areaMinSqft')).toBe('800');
  });
});
