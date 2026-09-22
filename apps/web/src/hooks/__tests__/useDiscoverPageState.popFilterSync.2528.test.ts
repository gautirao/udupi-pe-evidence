/**
 * Issue #2528 — browser Back/Forward must leave the VISIBLE filter controls, the URL,
 * and the request predicate all telling the same story.
 *
 * ## What was actually broken (and why the issue's own repro cannot reproduce it)
 *
 * `useDiscoverPageState` seeded `filters` from `urlState.filters` in a `useState`
 * LAZY INITIALIZER — i.e. exactly once, at mount. Every other URL-derived value in
 * that hook already had a POP sync effect (`city` <- `urlState.city`, `mapZoom` <-
 * `urlState.viewport.zoom`, `selectedArea` <- `urlState.areaKey`, `filters.polygon`
 * <- `urlState.resultScope.active`). The general filter set had none, so after any
 * history traversal the hook kept serving the pre-POP filters.
 *
 * That matters more than "the controls look wrong", because this same `filters`
 * object is ALSO what `useDiscoverMapDataController` feeds to `useDiscoverMapData`
 * as the listings/markers predicate. So a POP left the URL saying one thing while
 * the controls AND the request both still said another.
 *
 * The issue text proposes reproducing this with "3 beds -> 2 beds -> Back". That
 * sequence cannot reproduce it: every visible filter control routes through
 * `handleFiltersChange` -> `urlActions.setFiltersLive`, which writes the URL with
 * `{ replace: true }` (`features/discover/state/url/filters.ts`). A REPLACE creates
 * NO history entry, so there is no Back step between two filter states to take.
 *
 * The defect is real, but it surfaces across a PUSH boundary — `selectArea`,
 * `changeCity`, node navigation — which is what these tests model: the URL's
 * filters change underneath the hook (exactly what a POP does to `nav.filters`,
 * which is re-derived from the live search params on every render) and the hook
 * must follow.
 *
 * ## The one axis where the URL's silence is NOT an assertion
 *
 * `serializeFilters` DELETES `beds=` whenever `shouldSubmitBedrooms()` is false
 * (a plot-only or commercial-only selection), while deliberately KEEPING the value
 * in this hook's React state — see `features/discover/filters/bedroomApplicability.ts`,
 * which states that in terms ("Nothing here deletes `bedrooms`. The value stays
 * exactly where it already lived — in the PropertyFilters React state owned by
 * `useDiscoverPageState`"). A naive "URL owns bedrooms outright" sync would wipe
 * the remembered value the moment the buyer picks Commercial, breaking #2459 AC2's
 * documented restore-on-switch-back. `suppressed_bedrooms_are_retained_not_wiped`
 * below is the regression guard for that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import type { DiscoverUrlState, DiscoverUrlActions } from '../useDiscoverUrlState';

import { useDiscoverPageState } from '../useDiscoverPageState';

function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    ...overrides,
  };
}

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    setRegion: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    setIntent: vi.fn(),
    commitResultScope: vi.fn(),
    ...overrides,
  } as DiscoverUrlActions;
}

/**
 * Renders the hook with a swappable `urlState`, which is the faithful model of a
 * POP at this hook's boundary: on a real history traversal react-router updates the
 * search params, `useDiscoverUrlState` re-derives `filters` from them, and this hook
 * re-renders with a new `urlState.filters`. Nothing else about a POP reaches here.
 */
function renderWithUrl(initial: DiscoverUrlState, actions = makeUrlActions()) {
  return renderHook(({ urlState }) => useDiscoverPageState({ urlState, urlActions: actions }), {
    initialProps: { urlState: initial },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverPageState — Issue #2528 Back/Forward filter sync', () => {
  /**
   * PRECONDITION, asserted rather than assumed. The bedroom-retention rule below
   * is only correct if `shouldSubmitBedrooms` really is what makes `beds=` vanish
   * from the URL for these two shapes. If this ever stops holding, the retention
   * branch is aimed at the wrong thing and the two tests after it would pass for
   * the wrong reason — so it is checked here, against the real predicate.
   */
  it('precondition_bedroom_suppression_applies_to_the_shapes_this_fix_relies_on', () => {
    expect(shouldSubmitBedrooms({ propertyTypes: ['apartment'] })).toBe(true);
    expect(shouldSubmitBedrooms({ propertyTypes: ['commercial'] })).toBe(false);
    expect(shouldSubmitBedrooms({ propertyTypes: ['residential_plot'] })).toBe(false);
  });

  it('pop_restores_property_type_into_visible_filters', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['villa'] } }),
    );
    expect(result.current.filters.propertyTypes).toEqual(['villa']);

    // Back to an entry whose URL carried a different type.
    rerender({ urlState: makeUrlState({ filters: { propertyTypes: ['apartment'] } }) });

    expect(result.current.filters.propertyTypes).toEqual(['apartment']);
  });

  it('pop_restores_bedrooms', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [2] } }),
    );
    expect(result.current.filters.bedrooms).toEqual([2]);

    rerender({
      urlState: makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [3] } }),
    });

    expect(result.current.filters.bedrooms).toEqual([3]);
  });

  it('pop_restores_price_bounds', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { priceMin: 2_000_000, priceMax: 9_000_000 } }),
    );

    rerender({ urlState: makeUrlState({ filters: { priceMin: 500_000 } }) });

    expect(result.current.filters.priceMin).toBe(500_000);
    expect(result.current.filters.priceMax).toBeUndefined();
  });

  it('pop_restores_commercial_subtypes', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({
        filters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP', 'OFFICE'] },
      }),
    );
    expect(result.current.filters.commercialSubtypes).toEqual(['SHOP', 'OFFICE']);

    rerender({
      urlState: makeUrlState({
        filters: { propertyTypes: ['commercial'], commercialSubtypes: ['WAREHOUSE'] },
      }),
    });

    expect(result.current.filters.commercialSubtypes).toEqual(['WAREHOUSE']);
  });

  it('pop_restores_area_bounds', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { areaMinSqft: 1200, areaMaxSqft: 5000 } }),
    );

    rerender({ urlState: makeUrlState({ filters: { areaMinSqft: 2500 } }) });

    expect(result.current.filters.areaMinSqft).toBe(2500);
    expect(result.current.filters.areaMaxSqft).toBeUndefined();
  });

  it('forward_after_back_restores_the_later_state', () => {
    const stateA = makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [2] } });
    const stateB = makeUrlState({ filters: { propertyTypes: ['villa'], bedrooms: [3] } });

    const { result, rerender } = renderWithUrl(stateA);

    // Navigate forward to B (a PUSH), then Back to A, then Forward to B again.
    rerender({ urlState: stateB });
    expect(result.current.filters.propertyTypes).toEqual(['villa']);

    rerender({ urlState: stateA });
    expect(result.current.filters.propertyTypes).toEqual(['apartment']);
    expect(result.current.filters.bedrooms).toEqual([2]);

    rerender({ urlState: stateB });
    expect(result.current.filters.propertyTypes).toEqual(['villa']);
    expect(result.current.filters.bedrooms).toEqual([3]);
  });

  it('cold_load_still_seeds_from_url', () => {
    const { result } = renderWithUrl(
      makeUrlState({
        filters: {
          propertyTypes: ['commercial'],
          commercialSubtypes: ['SHOP'],
          priceMin: 1_000_000,
          areaMinSqft: 800,
          sellerTypes: ['owner'],
          readyToMove: true,
        },
      }),
    );

    expect(result.current.filters.propertyTypes).toEqual(['commercial']);
    expect(result.current.filters.commercialSubtypes).toEqual(['SHOP']);
    expect(result.current.filters.priceMin).toBe(1_000_000);
    expect(result.current.filters.areaMinSqft).toBe(800);
    expect(result.current.filters.sellerTypes).toEqual(['owner']);
    expect(result.current.filters.readyToMove).toBe(true);
  });

  /**
   * #2459 AC2 regression guard. `serializeFilters` deletes `beds=` for a
   * commercial-only selection while the value deliberately lives on in this
   * hook's state, so switching back to a dwelling re-emits it with no restore
   * machinery. A sync that treated the URL's silence as "bedrooms cleared"
   * would destroy that.
   */
  it('suppressed_bedrooms_are_retained_not_wiped', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [3] } }),
    );
    expect(result.current.filters.bedrooms).toEqual([3]);

    // Buyer switches to Commercial: serializeFilters drops `beds=` from the URL
    // even though the buyer never cleared it.
    rerender({
      urlState: makeUrlState({ filters: { propertyTypes: ['commercial'] } }),
    });
    expect(result.current.filters.bedrooms).toEqual([3]);

    // Switching back to a dwelling must re-offer the remembered value.
    rerender({
      urlState: makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [3] } }),
    });
    expect(result.current.filters.bedrooms).toEqual([3]);
  });

  /**
   * A plot-only selection suppresses `beds=` the same way. Same retention rule.
   */
  it('suppressed_bedrooms_are_retained_for_plot_only_selection', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [4] } }),
    );

    rerender({
      urlState: makeUrlState({ filters: { propertyTypes: ['residential_plot'] } }),
    });

    expect(result.current.filters.bedrooms).toEqual([4]);
  });

  /**
   * The URL projection owns only the axes the URL can express. School coordinates
   * and the derived committed polygon live in this hook's state and must survive a
   * filters POP untouched.
   */
  it('pop_does_not_clobber_local_only_axes', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'] } }),
    );

    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        schoolLat: 13.34,
        schoolLon: 74.74,
        schoolRadiusKm: 5,
      }));
    });
    expect(result.current.filters.schoolLat).toBe(13.34);

    rerender({ urlState: makeUrlState({ filters: { propertyTypes: ['villa'] } }) });

    expect(result.current.filters.propertyTypes).toEqual(['villa']);
    expect(result.current.filters.schoolLat).toBe(13.34);
    expect(result.current.filters.schoolLon).toBe(74.74);
    expect(result.current.filters.schoolRadiusKm).toBe(5);
  });

  /**
   * The committed POLYGON reaches `filters.polygon` through the resultScope effect,
   * NOT through the URL-filters projection. A filters POP must leave it alone.
   */
  it('pop_preserves_committed_polygon_projection', () => {
    const coordinates: [number, number][] = [
      [13.3, 74.7],
      [13.3, 74.8],
      [13.4, 74.8],
      [13.3, 74.7],
    ];
    const scope = { active: { kind: 'POLYGON' as const, coordinates }, previous: null };

    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'] }, resultScope: scope }),
    );
    expect(result.current.filters.polygon).toBe(coordinates);

    rerender({
      urlState: makeUrlState({ filters: { propertyTypes: ['villa'] }, resultScope: scope }),
    });

    expect(result.current.filters.propertyTypes).toEqual(['villa']);
    expect(result.current.filters.polygon).toBe(coordinates);
  });

  /**
   * Termination guard. `filters` is a dep of the page-reset effect
   * (`useEffect(() => setPage(0), [filters, city, selectedArea])`), so a sync that
   * produced a fresh object on every render would reset pagination continuously and
   * risk an update loop. An unchanged URL must leave the object identity alone even
   * when `urlState` itself is a brand-new object.
   */
  it('equal_url_filters_do_not_change_filters_identity', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'], bedrooms: [3], priceMin: 100 } }),
    );

    const before = result.current.filters;

    rerender({
      urlState: makeUrlState({
        filters: { propertyTypes: ['apartment'], bedrooms: [3], priceMin: 100 },
      }),
    });

    expect(result.current.filters).toBe(before);
  });

  /**
   * Pagination must reset when a POP genuinely changes the predicate — a restored
   * page 4 over a different filter set would show the wrong slice.
   */
  it('pop_resets_pagination_when_the_predicate_changes', () => {
    const { result, rerender } = renderWithUrl(
      makeUrlState({ filters: { propertyTypes: ['apartment'] } }),
    );

    act(() => {
      result.current.setPage(4);
    });
    expect(result.current.page).toBe(4);

    rerender({ urlState: makeUrlState({ filters: { propertyTypes: ['villa'] } }) });

    expect(result.current.page).toBe(0);
  });
});
