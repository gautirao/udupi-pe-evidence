/**
 * Issue #2459 AC2 (submit half). The rule has TWO sentences and this file covers BOTH:
 *
 *   > "Plots never show or submit a Bedroom filter."
 *   > "Commercial never shows or submits Bedrooms."
 *
 * ⚠️ This file previously had NO Commercial arm at all. Sixteen tests were green while Shop,
 * Office, Commercial Building and Warehouse all kept emitting `beds=` to the wire — a predicate
 * that eliminates every commercial row (they carry `bedrooms` NULL), producing a silent zero-result
 * HTTP 200. The tests did not miss a subtle case; they never selected a Commercial shape. Do not
 * delete the Commercial block below to "reduce duplication" with the plot block: they assert two
 * different sentences of the rule, and the duplication is the point.
 *
 * Three things have to hold together, and a test covering only one of them scores a pass on a
 * broken feature:
 *
 *   1. The WIRE. A plot-only selection must emit no `bedrooms` param to `/api/discover/listings`
 *      or `/api/discover/markers` — the two endpoints `buildDiscoverSearchParams` serves.
 *   2. The URL. A plot-only selection must not serialise `beds=`, so a reload of that link cannot
 *      resurrect a constraint the buyer can neither see nor clear.
 *   3. The buyer's state SURVIVES. Suppression is about what is SUBMITTED. Returning to a
 *      dwelling type must re-emit the previous bedroom selection, which is only possible because
 *      nothing on the way out destroyed it.
 *
 * (3) is why the URL half is exercised through the REAL `useDiscoverUrlState` facade over a
 * MemoryRouter rather than by calling a serializer directly: the round trip is what proves the
 * value came BACK, not merely that a function was called with it.
 *
 * ## WHAT THIS FILE EXERCISES, AND WHAT IT DOES NOT
 *
 * A describe-block name is a claim about coverage, and a reader three months from now cannot audit
 * it without re-deriving the harness. So, explicitly:
 *
 * EXERCISED
 *  - Pure predicate resolution (`isPlotOnlySelection`, `isCommercialOnlySelection`), including the
 *    mixed / empty / UNRESOLVED edges of each.
 *  - The two-click buyer path that reaches production: Residential 3 BHK, then switch to a
 *    Commercial shape — asserted on the wire, the URL and the navigation counts.
 *  - Request serialization, for both `/api/discover/listings` and `/api/discover/markers` (one
 *    builder) and for navigation counts.
 *  - URL emission, including ACTIVE REMOVAL of a `beds=` inherited from a dwelling selection.
 *  - URL restoration on a COLD MOUNT, including a hand-authored URL carrying both a plot-only type
 *    and `beds=`.
 *  - A GENUINE history traversal — MemoryRouter's in-memory stack driven by `useNavigate(-1)` and
 *    `useNavigate(+1)` against an ALREADY-MOUNTED tree. This is not approximated with two cold
 *    mounts, and the test does not ask you to take that on trust: it asserts `navigationType`
 *    flips PUSH→POP and that `location.key` returns to the SAME entry key pushed earlier, which a
 *    remount cannot reproduce because it would mint a new key.
 *
 * NOT EXERCISED — do not read a pass here as covering these
 *  - A real browser `popstate`, `window.history`, or BFCache restore. MemoryRouter holds its stack
 *    in memory; there is no document, no serialized history state, and no page reload. What is
 *    proven is that the guard re-evaluates from CURRENT state on a POP transition — not that the
 *    browser's own history plumbing behaves the same way. That belongs in E2E.
 *  - What the live page RENDERS after Back. `useDiscoverPageState` seeds its `PropertyFilters`
 *    React state from the URL only in its lazy initializer, so it does NOT re-sync on a POP. This
 *    file asserts the URL and everything derived FROM the URL; the React-state half of a real
 *    back-navigation is a pre-existing characteristic of that hook and is out of scope here.
 *  - Whether the bedroom CONTROL is rendered at all — owned by #2450.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState, type DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { buildNavigationCountsFilters } from '@/features/discover/adapters/navigationCountsFilters';
import {
  isCommercialOnlySelection,
  isPlotOnlySelection,
  shouldSubmitBedrooms,
} from '@/features/discover/filters/bedroomApplicability';

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
      navigate: useNavigate(),
      navigationType: useNavigationType(),
    }),
    { wrapper: wrapper(initialUrl) },
  );
}

/**
 * The query params the wire would carry for a filter set RESTORED from the URL.
 *
 * `DiscoverUrlFilters` types `propertyTypes`/`commercialSubtypes` as plain strings because URL
 * input is untrusted; `PropertyFilters` narrows them to the allowlisted unions. That narrowing is
 * the URL domain's job (it already ran on the way out of `useDiscoverUrlState`) and is orthogonal
 * to the bedroom guard, so it is asserted here exactly as `useDiscoverPageState` asserts it on the
 * real cold-load path rather than widening either type for a test.
 */
function wireParamsFor(filters: DiscoverUrlFilters): URLSearchParams {
  return buildDiscoverSearchParams({
    city: 'bangalore',
    filters: {
      propertyTypes: filters.propertyTypes as PropertyFilters['propertyTypes'],
      commercialSubtypes: filters.commercialSubtypes as PropertyFilters['commercialSubtypes'],
      bedrooms: filters.bedrooms,
    },
  });
}

describe('#2459 AC2 — which selections are plot-only', () => {
  it('a single residential plot type is plot-only', () => {
    expect(isPlotOnlySelection({ propertyTypes: ['residential_plot'] })).toBe(true);
  });

  it('every plot-meaning type counts, not just the residential one', () => {
    // Derived from the #2458 primary-area mapping rather than a literal list here, so a new
    // plot-ish type cannot quietly keep submitting bedrooms.
    expect(isPlotOnlySelection({ propertyTypes: ['land'] })).toBe(true);
    expect(isPlotOnlySelection({ propertyTypes: ['agricultural_land'] })).toBe(true);
    expect(isPlotOnlySelection({ propertyTypes: ['commercial_land'] })).toBe(true);
    expect(isPlotOnlySelection({ propertyTypes: ['residential_plot', 'land'] })).toBe(true);
  });

  it('a dwelling type is NOT plot-only', () => {
    expect(isPlotOnlySelection({ propertyTypes: ['apartment'] })).toBe(false);
    expect(isPlotOnlySelection({ propertyTypes: ['villa'] })).toBe(false);
    expect(isPlotOnlySelection({ propertyTypes: ['house'] })).toBe(false);
  });

  it('a MIXED dwelling+plot selection is NOT plot-only — AC2 covers plot-ONLY', () => {
    expect(isPlotOnlySelection({ propertyTypes: ['apartment', 'residential_plot'] })).toBe(false);
  });

  it('NO type selection is not plot-only — "no narrowing" means every type, dwellings included', () => {
    expect(isPlotOnlySelection({})).toBe(false);
    expect(isPlotOnlySelection({ propertyTypes: [] })).toBe(false);
    expect(isPlotOnlySelection({ propertyTypes: null })).toBe(false);
  });

  it('an UNRESOLVED type is not plot-only — a shrug must not suppress a real constraint', () => {
    expect(isPlotOnlySelection({ propertyTypes: ['other'] })).toBe(false);
    expect(isPlotOnlySelection({ propertyTypes: ['residential_plot', 'other'] })).toBe(false);
  });

  it('a commercial subtype narrowing to LAND is plot-only; SHOP/OFFICE are not', () => {
    expect(
      isPlotOnlySelection({ propertyTypes: ['commercial'], commercialSubtypes: ['LAND'] }),
    ).toBe(true);
    expect(
      isPlotOnlySelection({ propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] }),
    ).toBe(false);
    expect(
      isPlotOnlySelection({ propertyTypes: ['commercial'], commercialSubtypes: ['LAND', 'SHOP'] }),
    ).toBe(false);
  });

  it('shouldSubmitBedrooms answers BOTH sentences, so no call site has to spell either out', () => {
    expect(shouldSubmitBedrooms({ propertyTypes: ['residential_plot'] })).toBe(false);
    expect(shouldSubmitBedrooms({ propertyTypes: ['commercial'] })).toBe(false);
    expect(shouldSubmitBedrooms({ propertyTypes: ['apartment'] })).toBe(true);
  });
});

describe('#2459 AC2 — which selections are commercial-only ("Commercial never submits Bedrooms")', () => {
  it('EVERY commercial type is commercial-only, not just the subtype-bearing one', () => {
    // The four that were shipping `beds=`. Derived from `resolvePrimaryAreaFamily`, so a new
    // commercial type cannot quietly start submitting bedrooms again.
    expect(isCommercialOnlySelection({ propertyTypes: ['commercial'] })).toBe(true);
    expect(isCommercialOnlySelection({ propertyTypes: ['commercial_building'] })).toBe(true);
    expect(isCommercialOnlySelection({ propertyTypes: ['warehouse'] })).toBe(true);
    expect(isCommercialOnlySelection({ propertyTypes: ['commercial_land'] })).toBe(true);
    expect(isCommercialOnlySelection({ propertyTypes: ['commercial', 'warehouse'] })).toBe(true);
  });

  it('holds for EVERY buyer subtype, including the three with a BUILT_UP meaning', () => {
    // The plot rule cannot reach these: SHOP/OFFICE/BUILDING resolve to BUILT_UP and WAREHOUSE to
    // WAREHOUSE, so `isPlotOnlySelection` is false for all four — which is exactly why they kept
    // emitting `beds=`. Commercial rows carry `bedrooms` NULL regardless of subtype.
    for (const subtype of ['SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE', 'LAND']) {
      const selection = { propertyTypes: ['commercial'], commercialSubtypes: [subtype] };
      expect(isCommercialOnlySelection(selection)).toBe(true);
      expect(shouldSubmitBedrooms(selection)).toBe(false);
    }
    // …and the control arm: the plot rule alone would have let four of the five through.
    expect(isPlotOnlySelection({ propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] })).toBe(false);
    expect(isPlotOnlySelection({ propertyTypes: ['commercial'], commercialSubtypes: ['WAREHOUSE'] })).toBe(false);
  });

  it('a residential or agricultural type is NOT commercial-only', () => {
    expect(isCommercialOnlySelection({ propertyTypes: ['apartment'] })).toBe(false);
    expect(isCommercialOnlySelection({ propertyTypes: ['residential_plot'] })).toBe(false);
    expect(isCommercialOnlySelection({ propertyTypes: ['agricultural_land'] })).toBe(false);
  });

  it('a MIXED dwelling+commercial selection is NOT commercial-only — the dwelling half still has bedrooms', () => {
    expect(isCommercialOnlySelection({ propertyTypes: ['apartment', 'warehouse'] })).toBe(false);
    expect(shouldSubmitBedrooms({ propertyTypes: ['apartment', 'warehouse'] })).toBe(true);
  });

  it('NO type selection is not commercial-only, and an unfamilied type is not commercial', () => {
    expect(isCommercialOnlySelection({})).toBe(false);
    expect(isCommercialOnlySelection({ propertyTypes: [] })).toBe(false);
    expect(isCommercialOnlySelection({ propertyTypes: ['other'] })).toBe(false);
    expect(isCommercialOnlySelection({ propertyTypes: ['warehouse', 'other'] })).toBe(false);
  });

  /**
   * Issue #2531 — the ONE-AXIS shape, which this predicate could not previously see.
   *
   * A Commercial subtype selection rides `commercialSubtypes` alone and sets no family token, so
   * `propertyTypes` is empty and a family-only rule returns false. Until #2531 that was inert: the
   * subtype never reached the wire, so it could not combine with a bedroom bound. Forwarding the
   * axis made `?subtype=OFFICE&beds=3` expressible — and a commercial row carries `bedrooms` NULL,
   * so that pair is HTTP 200 with zero rows and no reason the buyer can see.
   */
  it('a subtype-only selection IS commercial-only, with no family token present', () => {
    for (const subtype of ['SHOP', 'OFFICE', 'BUILDING', 'WAREHOUSE', 'LAND']) {
      expect(isCommercialOnlySelection({ commercialSubtypes: [subtype] })).toBe(true);
      expect(shouldSubmitBedrooms({ commercialSubtypes: [subtype] })).toBe(false);
    }
  });

  /**
   * The control that keeps the fix narrow. Only a NON-EMPTY subtype list may flip the empty-types
   * branch: treating empty `propertyTypes` as commercial outright would suppress the bedroom
   * predicate for the DEFAULT unfiltered view, which is the opposite of AC2. Without this arm,
   * `return true` in that branch would pass the test above.
   */
  it('the no-selection edge is unchanged — empty still means every type, dwellings included', () => {
    expect(isCommercialOnlySelection({ commercialSubtypes: [] })).toBe(false);
    expect(shouldSubmitBedrooms({})).toBe(true);
    expect(shouldSubmitBedrooms({ commercialSubtypes: [] })).toBe(true);
  });

  /**
   * End to end through the REAL facade: a composed `?subtype=OFFICE&beds=3` link is the shape that
   * is buyer-reachable TODAY, while `isCommercialSubtypeSupported` is still false and there is no
   * clickable Commercial chip. The buyer's bedroom value must survive in state (suppression is
   * about SUBMISSION, per this module's header) while never reaching the wire.
   *
   * SCOPE — read the assertion, not the title. `wireParamsFor` builds
   * `buildDiscoverSearchParams`, i.e. the AUTHENTICATED listings/markers wire, which is one of
   * the FOUR boundaries that gate on `shouldSubmitBedrooms`. This arm does not reach the ANON
   * city-listings boundary; that one has its own arms in
   * `hooks/__tests__/useDiscoverCityListings.test.ts`.
   *
   * **An earlier revision of this block was falsified by the very commit that carried it**, and
   * is corrected here rather than deleted. It claimed the anon path "is not among the censused
   * boundaries", that "this same link still carries `bedrooms` there", and that #2531's FINDING
   * 1b was "deliberately NOT claimed closed by this arm". All three were already false when it
   * shipped: that same change added the fourth census entry AND the gate, closing 1b. A
   * confident, specific, plausible comment describing code that does not exist is this repo's
   * signature defect; leaving it would have been worse than no comment at all.
   *
   * What remains true: `buildCityListingsQueryParams` does still return `bedrooms`
   * unconditionally, by design, because the gate lives one layer down in the hook — the single
   * point all six production call sites pass through.
   */
  it('a composed ?subtype=OFFICE&beds=3 link puts NO bedrooms on the AUTHENTICATED wire', () => {
    const { result } = renderFacade('/discover?city=bangalore&subtype=OFFICE&beds=3');
    const restored = result.current.urlState[0].filters;
    expect(restored.commercialSubtypes).toEqual(['OFFICE']);
    // Retained, not deleted — switching back to a dwelling must re-emit it.
    expect(restored.bedrooms).toEqual([3]);
    expect(wireParamsFor(restored).getAll('bedrooms')).toEqual([]);
    // Same-shape control: the subtype itself still reaches the wire, so the empty bedrooms above
    // is suppression rather than an unbuilt param set.
    expect(wireParamsFor(restored).getAll('commercialSubtypes')).toEqual(['OFFICE']);
  });

  /**
   * The WRITE leg of the same predicate — a live behaviour change that shipped with #2531
   * unasserted, which is how intentional behaviour becomes tomorrow's mystery regression.
   *
   * `shouldSubmitBedrooms` is shared, so extending it to the one-axis shape also reaches
   * `serializeFilters` (`state/url/filters.ts`): a subtype-only selection carrying a bedroom
   * value now drops `beds=` on the next URL write, and the else-branch actively deletes an
   * inherited one. That is the contract this module's header already adopts for plot-only — "a
   * plot-only URL could be reloaded or shared with `beds=3` still on it: invisible, unremovable,
   * and silently reapplied by whatever reads it next" — extended to a shape that could not
   * previously exist, because before #2531 a subtype could not stand alone on the wire.
   *
   * Correct and deliberate; this arm is what makes it *provably* deliberate. The buyer's value
   * is not destroyed — it stays in PropertyFilters state, which is why switching back to a
   * dwelling re-emits it.
   */
  it('a committed subtype-only selection drops beds= from the URL on write', () => {
    const { result } = renderFacade('/discover?city=bangalore&type=apartment&beds=3');
    expect(result.current.urlState[0].filters.bedrooms).toEqual([3]);

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        commercialSubtypes: ['OFFICE'],
        bedrooms: [3],
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('beds')).toBe(false);
    // Same-shape control: the subtype IS written, so the missing `beds=` is suppression rather
    // than a params object that was never built.
    expect(params.get('subtype')).toBe('OFFICE');
  });
});

describe('#2459 AC2 — the bedroom predicate never reaches the wire for a commercial selection', () => {
  it.each([
    ['commercial', undefined],
    ['commercial_building', undefined],
    ['warehouse', undefined],
    ['commercial_land', undefined],
    ['commercial', ['SHOP']],
    ['commercial', ['OFFICE']],
    ['commercial', ['BUILDING']],
    ['commercial', ['WAREHOUSE']],
  ] as const)('emits NO bedrooms param for %s / %s', (type, subtypes) => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: {
        propertyTypes: [type] as PropertyFilters['propertyTypes'],
        commercialSubtypes: subtypes as PropertyFilters['commercialSubtypes'],
        bedrooms: [3],
      },
    });
    expect(params.getAll('bedrooms')).toEqual([]);
    // The selection itself must still be submitted — suppression is bedroom-only, and #2530's
    // type emission must survive it untouched.
    expect(params.getAll('propertyTypes')).toEqual([type]);
  });

  it('still emits bedrooms for a MIXED dwelling+commercial selection — the control arm', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { propertyTypes: ['apartment', 'warehouse'], bedrooms: [3] },
    });
    expect(params.getAll('bedrooms')).toEqual(['3']);
  });

  it('listings and markers suppress IDENTICALLY for commercial too', () => {
    const filters = { propertyTypes: ['warehouse' as const], bedrooms: [3] };
    const listings = buildDiscoverSearchParams({
      city: 'bangalore', filters, page: 0, size: 24, includeAggregates: true,
    });
    const markers = buildDiscoverSearchParams({
      city: 'bangalore', filters, snapped: [12.8, 77.4, 13.2, 77.8],
    });
    expect(listings.getAll('bedrooms')).toEqual([]);
    expect(markers.getAll('bedrooms')).toEqual(listings.getAll('bedrooms'));
  });
});

/**
 * THE production path, end to end: "filter Residential 3 BHK, then switch to Commercial Shop" —
 * two clicks, reachable today. Asserted through the REAL `useDiscoverUrlState` facade rather than
 * by calling a serializer directly, because the defect was that an ALREADY-WRITTEN `beds=3`
 * survived the switch; only a round trip can show it being removed rather than merely not written.
 */
describe('#2459 AC2 — the two-click Residential → Commercial path', () => {
  it('REMOVES the inherited beds= and submits none, while the buyer\'s value survives', () => {
    const { result } = renderFacade('/discover?city=bangalore&type=apartment&beds=3');
    expect(result.current.urlState[0].filters.bedrooms).toEqual([3]);

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP'],
        bedrooms: [3],
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('beds')).toBe(false);
    expect(params.get('type')).toBe('commercial');
    expect(params.get('subtype')).toBe('SHOP');
    // The wire agrees with the URL…
    expect(wireParamsFor(result.current.urlState[0].filters).getAll('bedrooms')).toEqual([]);
    // …and so do the navigation counts, or a destination would advertise a count its own result
    // list cannot produce.
    expect(
      buildNavigationCountsFilters('sale', result.current.urlState[0].filters).bedrooms,
    ).toBeUndefined();

    // …and switching back to a dwelling re-emits the retained selection: suppression never wrote
    // to `bedrooms`, so there is nothing to restore.
    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['apartment'],
        bedrooms: [3],
      });
    });
    expect(new URLSearchParams(result.current.location.search).get('beds')).toBe('3');
  });

  it('a hand-authored commercial URL carrying beds= cannot apply it either', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&type=warehouse&beds=3',
    );
    const restored = result.current.urlState[0].filters;
    expect(wireParamsFor(restored).getAll('bedrooms')).toEqual([]);
    expect(buildNavigationCountsFilters('sale', restored).bedrooms).toBeUndefined();
  });
});

describe('#2459 AC2 — the bedroom predicate never reaches the wire for a plot-only selection', () => {
  it('emits NO bedrooms param for a plot-only selection', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { propertyTypes: ['residential_plot'], bedrooms: [2, 3] },
    });
    expect(params.getAll('bedrooms')).toEqual([]);
    // The selection itself must still be submitted — suppression is bedroom-only.
    expect(params.getAll('propertyTypes')).toEqual(['residential_plot']);
  });

  it('still emits bedrooms for a dwelling selection — the guard is not a blanket removal', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { propertyTypes: ['apartment'], bedrooms: [2, 3] },
    });
    expect(params.getAll('bedrooms')).toEqual(['2', '3']);
  });

  it('still emits bedrooms when NO property type is selected', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { bedrooms: [3] },
    });
    expect(params.getAll('bedrooms')).toEqual(['3']);
  });

  it('still emits bedrooms for a MIXED dwelling+plot selection', () => {
    const params = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { propertyTypes: ['apartment', 'residential_plot'], bedrooms: [3] },
    });
    expect(params.getAll('bedrooms')).toEqual(['3']);
  });

  it('listings and markers suppress IDENTICALLY — one builder, one answer', () => {
    // Cards and map markers must not disagree about whether a bedroom constraint was applied:
    // a divergence here shows as a map with pins the list does not contain.
    const filters = { propertyTypes: ['residential_plot' as const], bedrooms: [3] };
    const listings = buildDiscoverSearchParams({
      city: 'bangalore', filters, page: 0, size: 24, includeAggregates: true,
    });
    const markers = buildDiscoverSearchParams({
      city: 'bangalore', filters, snapped: [12.8, 77.4, 13.2, 77.8],
    });
    expect(listings.getAll('bedrooms')).toEqual([]);
    expect(markers.getAll('bedrooms')).toEqual(listings.getAll('bedrooms'));
  });
});

describe('#2459 AC2 — the bedroom predicate is not serialised into a plot-only URL', () => {
  it('writes no beds= when narrowing to plots', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['residential_plot'],
        bedrooms: [3],
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('beds')).toBe(false);
    expect(params.get('type')).toBe('residential_plot');
  });

  it('REMOVES an inherited beds= when the buyer narrows from a dwelling to plots', () => {
    // Not merely "stops writing": the param was already on the URL, and leaving it there is the
    // invisible-constraint failure AC2 exists to prevent.
    const { result } = renderFacade('/discover?city=bangalore&type=apartment&beds=3');
    expect(result.current.urlState[0].filters.bedrooms).toEqual([3]);

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['residential_plot'],
        bedrooms: [3],
      });
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('beds')).toBe(false);
  });

  it('a reload of a plot-only URL cannot resurrect a bedroom predicate', () => {
    // The URL produced by the previous test, re-entered cold. Even if someone hand-edits beds=
    // back on, the wire builder refuses it — so the constraint cannot be applied invisibly.
    const { result } = renderFacade('/discover?city=bangalore&type=residential_plot&beds=3');
    const restored = result.current.urlState[0].filters;
    expect(wireParamsFor(restored).getAll('bedrooms')).toEqual([]);
  });

  it('still writes beds= for a dwelling selection', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['apartment'],
        bedrooms: [3],
      });
    });

    expect(new URLSearchParams(result.current.location.search).get('beds')).toBe('3');
  });
});

/**
 * Forward navigation only — every case below drives the facade with PUSH writes from a single
 * cold mount. The Back/Forward TRAVERSAL cases live in their own block further down, named for
 * the mechanism they actually use, so neither block can be mistaken for the other.
 */
describe('#2459 AC2 — returning to a dwelling family re-emits the bedroom selection (no history traversal)', () => {
  it('re-emits the buyer\'s previous bedrooms to the URL after a plot detour', () => {
    // The round trip is the assertion: 3 BHK goes in, survives a plot-only step that refuses to
    // serialise it, and comes back out unchanged. Only possible because suppression never wrote
    // to `bedrooms` — a destructive clear would have needed somewhere else to remember it.
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['apartment'],
        bedrooms: [3],
      });
    });
    expect(new URLSearchParams(result.current.location.search).get('beds')).toBe('3');

    // …the buyer switches to plots. PropertyFilters state still carries bedrooms: [3]; the URL
    // must not.
    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['residential_plot'],
        bedrooms: [3],
      });
    });
    expect(new URLSearchParams(result.current.location.search).has('beds')).toBe(false);

    // …and back to a dwelling, carrying the SAME retained value.
    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['villa'],
        bedrooms: [3],
      });
    });
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('beds')).toBe('3');
    expect(params.get('type')).toBe('villa');
  });

  it('re-emits them to the wire too — a restored control with no predicate is still broken', () => {
    const retained = { bedrooms: [2, 4] };
    const whilePlots = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { ...retained, propertyTypes: ['residential_plot'] },
    });
    const afterReturn = buildDiscoverSearchParams({
      city: 'bangalore',
      filters: { ...retained, propertyTypes: ['house'] },
    });
    expect(whilePlots.getAll('bedrooms')).toEqual([]);
    expect(afterReturn.getAll('bedrooms')).toEqual(['2', '4']);
  });
});

/**
 * History transitions — a GENUINE traversal of MemoryRouter's in-memory stack via
 * `useNavigate(-1)` / `useNavigate(+1)` against an already-mounted tree.
 *
 * NOT two cold mounts at different URLs wearing a stronger name. The distinction is the entire
 * point of the block: a remount re-parses a URL and would stay green even if the guard were
 * latched at first render, whereas a traversal moves an existing tree between existing entries and
 * so proves the guard is re-evaluated from CURRENT state at each transition.
 *
 * That claim is asserted mechanically rather than left to the reader — see the `navigationType`
 * and `location.key` expectations inside. What this does NOT cover is real browser `popstate` /
 * BFCache, and what the page RENDERS after Back; both are named in this file's header.
 */
describe('#2459 AC2 — the guard re-evaluates across Back/Forward history traversal', () => {
  it('suppresses, restores on BACK, and suppresses again on FORWARD', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    // 1. A dwelling selection with a bedroom value — emitted to URL, wire and nav counts.
    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['apartment'],
        bedrooms: [3],
      });
    });
    expect(result.current.navigationType).toBe('PUSH');
    const dwellingEntryKey = result.current.location.key;
    expect(new URLSearchParams(result.current.location.search).get('beds')).toBe('3');
    expect(wireParamsFor(result.current.urlState[0].filters).getAll('bedrooms')).toEqual(['3']);

    // 2. Narrow to plots — suppressed everywhere, while PropertyFilters state keeps the value.
    act(() => {
      result.current.urlState[1].setFiltersCommitted({
        propertyTypes: ['residential_plot'],
        bedrooms: [3],
      });
    });
    expect(result.current.navigationType).toBe('PUSH');
    const plotEntryKey = result.current.location.key;
    expect(plotEntryKey).not.toBe(dwellingEntryKey);
    expect(new URLSearchParams(result.current.location.search).has('beds')).toBe(false);
    expect(wireParamsFor(result.current.urlState[0].filters).getAll('bedrooms')).toEqual([]);
    expect(
      buildNavigationCountsFilters('sale', result.current.urlState[0].filters).bedrooms,
    ).toBeUndefined();

    // 3. BACK — the dwelling entry returns, and so does the bedroom predicate.
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.navigationType).toBe('POP');
    // The DECISIVE proof this is a traversal: React Router stamps each history entry with a stable
    // `key`, and Back landed on the very entry pushed in step 1 — not a fresh entry that merely
    // happens to carry the same URL. A remount cannot reproduce this; it would mint a new key.
    expect(result.current.location.key).toBe(dwellingEntryKey);
    const back = new URLSearchParams(result.current.location.search);
    expect(back.get('type')).toBe('apartment');
    expect(back.get('beds')).toBe('3');
    expect(result.current.urlState[0].filters.bedrooms).toEqual([3]);
    expect(wireParamsFor(result.current.urlState[0].filters).getAll('bedrooms')).toEqual(['3']);
    expect(buildNavigationCountsFilters('sale', result.current.urlState[0].filters).bedrooms).toEqual([3]);

    // 4. FORWARD — plot-only again, suppressed again. The guard did not latch on the way back.
    act(() => {
      result.current.navigate(1);
    });
    expect(result.current.navigationType).toBe('POP');
    expect(result.current.location.key).toBe(plotEntryKey);
    const fwd = new URLSearchParams(result.current.location.search);
    expect(fwd.get('type')).toBe('residential_plot');
    expect(fwd.has('beds')).toBe(false);
    expect(wireParamsFor(result.current.urlState[0].filters).getAll('bedrooms')).toEqual([]);
    expect(
      buildNavigationCountsFilters('sale', result.current.urlState[0].filters).bedrooms,
    ).toBeUndefined();
  });
});
