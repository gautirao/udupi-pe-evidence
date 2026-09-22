/**
 * Issue #2528 — the same fix as `useDiscoverPageState.popFilterSync.2528.test.ts`,
 * asserted one level up: against the REAL `useDiscoverUrlState` facade, driven by a
 * GENUINE traversal of MemoryRouter's history stack via `useNavigate(-1)/(+1)`.
 *
 * Not two cold mounts at different URLs wearing a stronger name. The distinction is
 * the point: a remount re-parses a URL and would stay green even if the sync were
 * latched at first render, whereas a traversal moves an ALREADY-MOUNTED tree between
 * existing entries, which is the thing that was broken. That claim is asserted
 * mechanically via `navigationType` and `location.key`, not left to the reader.
 *
 * ## The three layers this file holds together
 *
 * Issue #2528 asks for the URL, the visible controls and the request predicate to
 * agree after Back/Forward. Two of those three are checked here directly:
 *
 *   - the URL              — `location.search`
 *   - the request predicate — `buildDiscoverSearchParams(...)` over the SAME
 *                             `PropertyFilters` object `useDiscoverMapDataController`
 *                             hands to `useDiscoverMapData`
 *
 * The third (what the DOM renders) is out of reach in this file and is covered by
 * the E2E. `page.filters` IS the object the controls render from, so a divergence
 * between it and the URL is exactly the defect — but this file does not prove what
 * a control painted, and does not claim to.
 *
 * ## Why the sequence uses `selectArea` before touching filters
 *
 * `handleFiltersChange` writes the URL through `setFiltersLive`, which is
 * `{ replace: true }` and debounced 300 ms — it creates NO history entry. So there is
 * no Back step between two filter states to take, and the issue's stated repro
 * ("3 beds -> 2 beds -> Back") cannot reproduce anything. `selectArea` is a PUSH, so
 * it is what creates the boundary the defect actually shows up across.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { useDiscoverPageState } from '../useDiscoverPageState';

const LIVE_FILTER_DEBOUNCE_MS = 300;

function wrapper(initialUrl: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    );
}

/** The real facade AND the real page-state hook, wired exactly as the page wires them. */
function renderPage(initialUrl: string) {
  return renderHook(
    () => {
      const [urlState, urlActions] = useDiscoverUrlState();
      const page = useDiscoverPageState({ urlState, urlActions });
      return {
        urlState,
        urlActions,
        page,
        location: useLocation(),
        navigate: useNavigate(),
        navigationType: useNavigationType(),
      };
    },
    { wrapper: wrapper(initialUrl) },
  );
}

/** The params the listings/markers request would actually carry for a filter set. */
function wireParamsFor(filters: Parameters<typeof buildDiscoverSearchParams>[0]['filters']) {
  return buildDiscoverSearchParams({ city: 'udupi', filters });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('#2528 — filter state follows a real Back/Forward traversal', () => {
  it('restores_url_predicate_and_filters_together_on_back_and_forward', () => {
    const { result } = renderPage('/discover?city=udupi');

    const entryA = result.current.location.key;
    expect(new URLSearchParams(result.current.location.search).has('type')).toBe(false);

    // 1. Select an area. This is a PUSH — the history boundary the defect shows up across.
    act(() => {
      result.current.urlActions.selectArea('IN|KA|Udupi|Katapadi', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Udupi|Katapadi'],
      });
    });
    expect(result.current.navigationType).toBe('PUSH');
    expect(result.current.location.key).not.toBe(entryA);

    // 2. Refine the filters. setFiltersLive is a debounced REPLACE, so this mutates the
    //    CURRENT entry rather than creating a new one.
    act(() => {
      result.current.page.handleFiltersChange({ propertyTypes: ['villa'], bedrooms: [3] });
    });
    act(() => {
      vi.advanceTimersByTime(LIVE_FILTER_DEBOUNCE_MS);
    });

    const afterRefine = new URLSearchParams(result.current.location.search);
    expect(afterRefine.get('type')).toBe('villa');
    expect(afterRefine.get('beds')).toBe('3');
    expect(afterRefine.get('areaKey')).toBe('IN|KA|Udupi|Katapadi');
    // All three layers agree before the traversal.
    expect(result.current.page.filters.propertyTypes).toEqual(['villa']);
    expect(wireParamsFor(result.current.page.filters).getAll('bedrooms')).toEqual(['3']);

    // 3. BACK — to the entry that predates BOTH the area selection and the refinement.
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.navigationType).toBe('POP');
    // The decisive proof this is a traversal and not a remount: React Router stamps each
    // entry with a stable key, and Back landed on the very entry we started from.
    expect(result.current.location.key).toBe(entryA);

    const back = new URLSearchParams(result.current.location.search);
    expect(back.has('type')).toBe(false);
    expect(back.has('beds')).toBe(false);
    expect(back.has('areaKey')).toBe(false);

    // THE DEFECT. Before this fix, both of these still said villa / 3 BHK while the URL
    // above said neither — the controls and the request disagreeing with the address bar.
    expect(result.current.page.filters.propertyTypes).toBeUndefined();
    expect(result.current.page.filters.bedrooms).toBeUndefined();

    // The request predicate reverted too, stated against an ORACLE rather than a
    // hand-written literal: the wire must now be byte-identical to what an unfiltered
    // search sends. Note `buildDiscoverSearchParams` EXPANDS an absent type filter into
    // the full residential set, so asserting "no propertyTypes params" would be wrong,
    // and asserting "does not contain villa" would be vacuous — villa is in the default
    // expansion. Equality against the unfiltered shape is what discriminates: pre-fix
    // this request carried exactly ['villa'] plus bedrooms=3.
    const unfiltered = wireParamsFor({});
    const afterBack = wireParamsFor(result.current.page.filters);
    expect(afterBack.toString()).toBe(unfiltered.toString());
    expect(afterBack.getAll('bedrooms')).toEqual([]);
    expect(afterBack.getAll('propertyTypes')).not.toEqual(['villa']);

    // 4. FORWARD — the refined entry returns, and so do the filters and the predicate.
    act(() => {
      result.current.navigate(1);
    });
    expect(result.current.navigationType).toBe('POP');

    const fwd = new URLSearchParams(result.current.location.search);
    expect(fwd.get('type')).toBe('villa');
    expect(fwd.get('beds')).toBe('3');
    expect(result.current.page.filters.propertyTypes).toEqual(['villa']);
    expect(result.current.page.filters.bedrooms).toEqual([3]);
    expect(wireParamsFor(result.current.page.filters).getAll('bedrooms')).toEqual(['3']);
  });

  it('restores_price_and_area_bounds_across_the_same_traversal', () => {
    const { result } = renderPage('/discover?city=udupi');
    const entryA = result.current.location.key;

    act(() => {
      result.current.urlActions.selectArea('IN|KA|Udupi|Katapadi', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Udupi|Katapadi'],
      });
    });
    act(() => {
      result.current.page.handleFiltersChange({
        priceMin: 2_500_000,
        priceMax: 9_000_000,
        areaMinSqft: 1200,
      });
    });
    act(() => {
      vi.advanceTimersByTime(LIVE_FILTER_DEBOUNCE_MS);
    });
    expect(result.current.page.filters.priceMin).toBe(2_500_000);

    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.key).toBe(entryA);
    expect(result.current.page.filters.priceMin).toBeUndefined();
    expect(result.current.page.filters.priceMax).toBeUndefined();
    expect(result.current.page.filters.areaMinSqft).toBeUndefined();

    act(() => {
      result.current.navigate(1);
    });
    expect(result.current.page.filters.priceMin).toBe(2_500_000);
    expect(result.current.page.filters.priceMax).toBe(9_000_000);
    expect(result.current.page.filters.areaMinSqft).toBe(1200);
  });

  /**
   * Result-scope non-regression. Back must restore the AREA_SET scope alongside the
   * filters, not clobber it — the two are written into the SAME history entry by
   * `selectArea`'s second argument.
   */
  it('back_and_forward_restore_the_committed_area_set_scope_with_the_filters', () => {
    const { result } = renderPage('/discover?city=udupi');

    act(() => {
      result.current.urlActions.selectArea('IN|KA|Udupi|Katapadi', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Udupi|Katapadi'],
      });
    });
    act(() => {
      result.current.page.handleFiltersChange({ propertyTypes: ['apartment'] });
    });
    act(() => {
      vi.advanceTimersByTime(LIVE_FILTER_DEBOUNCE_MS);
    });
    expect(result.current.page.resultScope.active).toEqual({
      kind: 'AREA_SET',
      areaKeys: ['IN|KA|Udupi|Katapadi'],
    });

    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.page.resultScope.active).toBeNull();
    expect(result.current.page.filters.propertyTypes).toBeUndefined();

    act(() => {
      result.current.navigate(1);
    });
    expect(result.current.page.resultScope.active).toEqual({
      kind: 'AREA_SET',
      areaKeys: ['IN|KA|Udupi|Katapadi'],
    });
    expect(result.current.page.filters.propertyTypes).toEqual(['apartment']);
  });

  /**
   * Commercial subtype non-regression (#2431/#2531). The subtype axis must make the
   * round trip in step with `type`, and must reach the wire — a restored chip over a
   * request that never carried the subtype is the exact shape #2531 was.
   */
  it('commercial_subtype_survives_back_and_forward_and_reaches_the_wire', () => {
    const { result } = renderPage('/discover?city=udupi');
    const entryA = result.current.location.key;

    act(() => {
      result.current.urlActions.selectArea('IN|KA|Udupi|Katapadi', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Udupi|Katapadi'],
      });
    });
    act(() => {
      result.current.page.handleFiltersChange({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
      });
    });
    act(() => {
      vi.advanceTimersByTime(LIVE_FILTER_DEBOUNCE_MS);
    });
    expect(new URLSearchParams(result.current.location.search).get('subtype')).toBe('SHOP');
    expect(result.current.page.filters.commercialSubtypes).toEqual(['SHOP']);

    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.key).toBe(entryA);
    expect(result.current.page.filters.commercialSubtypes).toBeUndefined();

    act(() => {
      result.current.navigate(1);
    });
    expect(result.current.page.filters.commercialSubtypes).toEqual(['SHOP']);
    expect(wireParamsFor(result.current.page.filters).getAll('commercialSubtypes')).toEqual([
      'SHOP',
    ]);
  });

  /**
   * A reload at the refined URL must land in the same place a Forward does. This is the
   * cold-load arm of the same contract, and it is what the mount-time seed already did
   * correctly — kept so a future change cannot fix the POP path by breaking this one.
   */
  it('reload_at_the_refined_url_restores_the_same_state_as_forward', () => {
    const { result } = renderPage(
      '/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CKatapadi&type=villa&beds=3&priceMin=2500000',
    );

    expect(result.current.page.filters.propertyTypes).toEqual(['villa']);
    expect(result.current.page.filters.bedrooms).toEqual([3]);
    expect(result.current.page.filters.priceMin).toBe(2_500_000);
    expect(wireParamsFor(result.current.page.filters).getAll('bedrooms')).toEqual(['3']);
  });
});
