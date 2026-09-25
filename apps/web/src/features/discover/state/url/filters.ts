/**
 * Filters URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: the WHOLE DiscoverUrlFilters shape (type/beds/price/seller/board/
 * category/booleans/dates/agri*) + the free-text search query `q`. See
 * useDiscoverUrlState.ts's module doc for the full param contract.
 */
import { useCallback } from 'react';
import { isDiscoverCommercialSubtype } from '@/lib/listing-constants';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import {
  isInvertedAreaRange,
  readAreaBoundsFromParams,
} from '@/features/discover/filters/areaBounds';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type {
  DiscoverUrlActions,
  DiscoverUrlFilters,
  DiscoverUrlState,
} from '@/hooks/useDiscoverUrlState';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

const DEBOUNCE_MS = 300;

type FiltersState = Pick<DiscoverUrlState, 'filters' | 'q'>;
type FiltersActions = Pick<
  DiscoverUrlActions,
  | 'setFiltersLive'
  | 'setFiltersCommitted'
  | 'setSearchQuery'
  | 'clearAllFiltersAndSearch'
  | 'setBoardFilters'
  | 'setCategoryFilters'
  | 'clearAgriFilters'
>;

function parseCommaInts(value: string | null): number[] | undefined {
  if (!value) return undefined;
  const parsed = value
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return parsed.length > 0 ? parsed : undefined;
}

function parseCommaStrings(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parsed = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Issue #2711 — exported (was module-private) so `city.ts`'s `setIntent` can serialize a
 * caller-supplied FULL filters override into the SAME `setUrlParams` call as the intent write
 * itself, instead of MapFilterSheet's Apply needing a second, separately-scheduled write (which
 * silently discarded whatever `setIntent` had just written — see `setIntent`'s own doc comment
 * in city.ts). No behavior change to this function itself.
 */
export function serializeFilters(
  params: URLSearchParams,
  filters: DiscoverUrlFilters,
): URLSearchParams {
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    params.set('type', filters.propertyTypes.join(','));
  } else {
    params.delete('type');
  }
  // Issue #2431 — Commercial subtype. Comma-joined like `type`/`seller`, never repeated params.
  // Written and cleared in the SAME pass as every other filter key, so "Clear all" (which calls
  // serializeFilters with {}) drops it without needing to know it exists.
  if (filters.commercialSubtypes && filters.commercialSubtypes.length > 0) {
    params.set('subtype', filters.commercialSubtypes.join(','));
  } else {
    params.delete('subtype');
  }
  // Issue #2459 AC2 — a plot-only OR commercial-only selection serialises NO bedroom predicate
  // (BOTH sentences of the rule; see bedroomApplicability.ts), so such a URL cannot be reloaded,
  // bookmarked or shared carrying an invisible `beds=` constraint that whatever reads it next
  // would silently reapply. This is the URL half of the same suppression
  // `buildDiscoverSearchParams` applies to the wire; both read the one predicate in
  // features/discover/filters/bedroomApplicability.ts.
  //
  // The `else` branch DELETES, so the suppression is not merely "stop writing": an existing
  // `beds=` inherited from a dwelling selection is actively removed the moment the buyer narrows
  // to plots or to Commercial. `filters.bedrooms` itself is untouched — the value lives on in
  // PropertyFilters state, and is re-serialised unchanged as soon as a dwelling type is selected
  // again.
  if (filters.bedrooms && filters.bedrooms.length > 0 && shouldSubmitBedrooms(filters)) {
    params.set('beds', filters.bedrooms.join(','));
  } else {
    params.delete('beds');
  }
  if (filters.priceMin != null) {
    params.set('priceMin', String(filters.priceMin));
  } else {
    params.delete('priceMin');
  }
  if (filters.priceMax != null) {
    params.set('priceMax', String(filters.priceMax));
  } else {
    params.delete('priceMax');
  }
  // Issue #2459 — contextual area bounds (SQ FT). Written and cleared in the SAME pass as every
  // other filter key, so "Clear all" (which calls serializeFilters with {}) drops them without
  // needing to know they exist.
  //
  // An INVERTED pair is not written at all, and the `else` branches actively DELETE, so a URL
  // carrying one cannot be produced — and therefore cannot be shared, bookmarked or reloaded into
  // a 400. The control already clamps (`applyAreaBound`) so it cannot author one; this closes the
  // same hole at the write boundary for any other caller of `setFiltersCommitted`, symmetrically
  // with the read guard in `readAreaBoundsFromParams`.
  const areaBounds = isInvertedAreaRange(filters) ? {} : filters;
  if (areaBounds.areaMinSqft != null) {
    params.set('areaMinSqft', String(areaBounds.areaMinSqft));
  } else {
    params.delete('areaMinSqft');
  }
  if (areaBounds.areaMaxSqft != null) {
    params.set('areaMaxSqft', String(areaBounds.areaMaxSqft));
  } else {
    params.delete('areaMaxSqft');
  }
  if (filters.sellerTypes && filters.sellerTypes.length > 0) {
    params.set('seller', filters.sellerTypes.join(','));
  } else {
    params.delete('seller');
  }
  // `board` is emitted as repeated params (?board=CBSE&board=ICSE), NOT comma-joined.
  // This matches AC: each board is its own URL key/value pair.
  params.delete('board');
  if (filters.boardFilters && filters.boardFilters.length > 0) {
    for (const b of filters.boardFilters) {
      params.append('board', b);
    }
  }
  if (filters.categoryFilters && filters.categoryFilters.length > 0) {
    params.set('category', filters.categoryFilters.join(','));
  } else {
    params.delete('category');
  }
  if (filters.backOnMarket) {
    params.set('bom', '1');
  } else {
    params.delete('bom');
  }
  if (filters.newToMarket) {
    params.set('ntm', '1');
  } else {
    params.delete('ntm');
  }
  if (filters.reraRegistered) {
    params.set('rera', '1');
  } else {
    params.delete('rera');
  }
  if (filters.readyToMove) {
    params.set('rtm', '1');
  } else {
    params.delete('rtm');
  }
  if (filters.dateFrom) {
    params.set('from', filters.dateFrom);
  } else {
    params.delete('from');
  }
  if (filters.dateTo) {
    params.set('to', filters.dateTo);
  } else {
    params.delete('to');
  }
  // Issue #1457 — agri client-side filter params
  if (filters.agriAcresMin != null) {
    params.set('agriAcresMin', String(filters.agriAcresMin));
  } else {
    params.delete('agriAcresMin');
  }
  if (filters.agriAcresMax != null) {
    params.set('agriAcresMax', String(filters.agriAcresMax));
  } else {
    params.delete('agriAcresMax');
  }
  if (filters.agriPriceMin != null) {
    params.set('agriPriceMin', String(filters.agriPriceMin));
  } else {
    params.delete('agriPriceMin');
  }
  if (filters.agriPriceMax != null) {
    params.set('agriPriceMax', String(filters.agriPriceMax));
  } else {
    params.delete('agriPriceMax');
  }
  // Issue #1458 — agri categorical/boolean filter params
  if (filters.agriLandCategory != null) {
    params.set('agriLandCategory', filters.agriLandCategory);
  } else {
    params.delete('agriLandCategory');
  }
  if (filters.agriFarmhouseAvailable != null) {
    params.set('agriFarmhouseAvailable', String(filters.agriFarmhouseAvailable));
  } else {
    params.delete('agriFarmhouseAvailable');
  }
  if (filters.agriFencingDone != null) {
    params.set('agriFencingDone', String(filters.agriFencingDone));
  } else {
    params.delete('agriFencingDone');
  }
  if (filters.agriWaterSource != null) {
    params.set('agriWaterSource', filters.agriWaterSource);
  } else {
    params.delete('agriWaterSource');
  }
  return params;
}

/**
 * Issue #2711 — extracted from `useDiscoverPageState.ts`'s `handleFiltersChange` (byte-identical
 * field mapping, moved here verbatim rather than duplicated) so BOTH that hook's own debounced
 * `setFiltersLive` write AND `city.ts`'s `setIntent` (for MapFilterSheet's Apply, which needs to
 * serialize a FULL staged draft atomically alongside an intent switch — see that function's own
 * doc comment) share ONE definition of "how a `PropertyFilters` becomes a `DiscoverUrlFilters`",
 * rather than two independently-maintained copies that could silently drift. Pure — no URL/React
 * state; the school-radius side effect `handleFiltersChange` also performs
 * (`urlActions.setSchoolParams`) is NOT part of this mapping and stays the caller's own concern.
 */
export function toDiscoverUrlFilters(filters: PropertyFilters): DiscoverUrlFilters {
  return {
    propertyTypes: filters.propertyTypes,
    // Issue #2431 — written alongside propertyTypes so the two always move together.
    commercialSubtypes: filters.commercialSubtypes,
    bedrooms: filters.bedrooms,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    // Issue #2459 — write-back half of AC7.
    areaMinSqft: filters.areaMinSqft,
    areaMaxSqft: filters.areaMaxSqft,
    sellerTypes: filters.sellerTypes,
    boardFilters: filters.boardFilters,
    categoryFilters: filters.categoryFilters,
    backOnMarket: filters.backOnMarket,
    newToMarket: filters.newToMarket,
    reraRegistered: filters.reraRegistered,
    readyToMove: filters.readyToMove,
    dateFrom: filters.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : undefined,
    dateTo: filters.dateTo ? filters.dateTo.toISOString().slice(0, 10) : undefined,
  };
}

export function useFiltersUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<FiltersState, FiltersActions> {
  const { urlParams, setUrlParams, timers } = ctx;

  // seller: accept both legacy singular "owner" and new comma-separated "owner,broker"
  const sellerRaw = urlParams.get('seller');
  const sellerTypes = sellerRaw
    ? sellerRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  // dateFrom / dateTo: stored as ISO date strings; validate before accepting
  const parseDateParam = (raw: string | null): string | undefined => {
    if (!raw) return undefined;
    const d = new Date(raw);
    return !isNaN(d.getTime()) ? raw : undefined;
  };

  // Issue #2431 — parse `subtype` with an ALLOWLIST rather than passing the raw strings through.
  // Every other filter here trusts the URL and lets the server decide, but this param is the one
  // the server answers with a 400 rather than an empty result, so an unrecognised value in a
  // hand-edited or stale link would break the whole page instead of just being ignored. Dropping
  // unknown values (and, when nothing survives, the param entirely) keeps a bad URL degrading to
  // "no subtype filter" in the UI, while a direct API call with the same bad value still gets its
  // honest 400.
  const commercialSubtypes = (() => {
    const parsed = parseCommaStrings(urlParams.get('subtype'))
      ?.map((s) => s.toUpperCase())
      .filter(isDiscoverCommercialSubtype);
    return parsed && parsed.length > 0 ? parsed : undefined;
  })();

  const filters: DiscoverUrlFilters = {
    propertyTypes: parseCommaStrings(urlParams.get('type')),
    commercialSubtypes,
    bedrooms: parseCommaInts(urlParams.get('beds')),
    priceMin: urlParams.get('priceMin') ? Number(urlParams.get('priceMin')) : undefined,
    priceMax: urlParams.get('priceMax') ? Number(urlParams.get('priceMax')) : undefined,
    // Issue #2459 — guarded far harder than the agri numerics, and read as a PAIR. These reach the
    // server as a validated range, so a link that cannot be honoured must degrade to "no filter"
    // here rather than becoming a 400 the buyer has no way to interpret. THREE ways a link fails,
    // all of them ending at the same honest degrade (see features/discover/filters/areaBounds.ts):
    //
    //   - junk (`abc`)          — was already handled;
    //   - a decimal (`1200.5`)  — was NOT. It parsed clean as a finite non-negative number and was
    //     forwarded verbatim, then 400'd on Spring's `Integer` REQUEST BINDING before
    //     `AreaBoundsParam.validate()` could run, so the server's designed message never fired.
    //     That made the sentence two lines below FALSE for every decimal;
    //   - an inverted pair (`min=2000&max=1000`) — was NOT. Each value is individually valid, so
    //     nothing that looked at one key at a time could ever see it; the server 400s it BY DESIGN
    //     (`AreaBoundsParam:48-51`) where "no results" is the honest answer.
    //
    // ...so a hand-edited link degrades to no area filter rather than to a bad request — which is
    // now a description of the code rather than a claim it contradicted.
    ...readAreaBoundsFromParams(
      urlParams.get('areaMinSqft'),
      urlParams.get('areaMaxSqft'),
    ),
    sellerTypes,
    boardFilters: (() => {
      // Read all repeated `board` params (?board=CBSE&board=ICSE).
      // Trim and drop empties; return undefined when none present.
      const all = urlParams.getAll('board').map((s) => s.trim()).filter(Boolean);
      return all.length > 0 ? all : undefined;
    })(),
    categoryFilters: parseCommaStrings(urlParams.get('category')),
    backOnMarket: urlParams.get('bom') === '1' ? true : undefined,
    newToMarket: urlParams.get('ntm') === '1' ? true : undefined,
    reraRegistered: urlParams.get('rera') === '1' ? true : undefined,
    readyToMove: urlParams.get('rtm') === '1' ? true : undefined,
    dateFrom: parseDateParam(urlParams.get('from')),
    dateTo: parseDateParam(urlParams.get('to')),
    // Issue #1457 — agri client-side filter params (NaN guard)
    agriAcresMin: (() => { const n = Number(urlParams.get('agriAcresMin')); return urlParams.get('agriAcresMin') && !Number.isNaN(n) ? n : undefined; })(),
    agriAcresMax: (() => { const n = Number(urlParams.get('agriAcresMax')); return urlParams.get('agriAcresMax') && !Number.isNaN(n) ? n : undefined; })(),
    agriPriceMin: (() => { const n = Number(urlParams.get('agriPriceMin')); return urlParams.get('agriPriceMin') && !Number.isNaN(n) ? n : undefined; })(),
    agriPriceMax: (() => { const n = Number(urlParams.get('agriPriceMax')); return urlParams.get('agriPriceMax') && !Number.isNaN(n) ? n : undefined; })(),
    // Issue #1458 — agri categorical/boolean filter params
    agriLandCategory: urlParams.get('agriLandCategory') ?? null,
    // Boolean URL params use tri-state parse: 'true'→true, 'false'→false, absent→null.
    // null means "no filter" (include all rows). Must NOT use presence-flag (==='1') since
    // false is a meaningful distinct filter value (show only non-farmhouse rows).
    agriFarmhouseAvailable: urlParams.get('agriFarmhouseAvailable') === 'true' ? true
      : urlParams.get('agriFarmhouseAvailable') === 'false' ? false : null,
    agriFencingDone: urlParams.get('agriFencingDone') === 'true' ? true
      : urlParams.get('agriFencingDone') === 'false' ? false : null,
    agriWaterSource: urlParams.get('agriWaterSource') ?? null,
  };

  const q = urlParams.get('q') ?? '';

  const setFiltersLive = useCallback(
    (newFilters: DiscoverUrlFilters) => {
      if (timers.filtersLive.current) clearTimeout(timers.filtersLive.current);
      timers.filtersLive.current = setTimeout(() => {
        setUrlParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            return serializeFilters(next, newFilters);
          },
          { replace: true }, // REPLACE — live/uncommitted edits should not pollute history
        );
      }, DEBOUNCE_MS);
    },
    [setUrlParams, timers],
  );

  const setFiltersCommitted = useCallback(
    (newFilters: DiscoverUrlFilters) => {
      // Cancel any pending live debounce so it doesn't overwrite the push
      if (timers.filtersLive.current) {
        clearTimeout(timers.filtersLive.current);
        timers.filtersLive.current = null;
      }
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          return serializeFilters(next, newFilters);
        },
        { replace: false }, // PUSH — committed filter choice is a history destination
      );
    },
    [setUrlParams, timers],
  );

  const setSearchQuery = useCallback(
    (newQ: string) => {
      if (timers.search.current) clearTimeout(timers.search.current);
      timers.search.current = null;
      // Clearing (empty string) is applied immediately — no debounce — so that a
      // concurrent reportViewport timer (also 300 ms) cannot fire between the clear
      // intent and the actual URL write and thereby restore the stale `q=` value via
      // its `(prev) => new URLSearchParams(prev)` functional updater.
      const delay = newQ ? DEBOUNCE_MS : 0;
      timers.search.current = setTimeout(() => {
        setUrlParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (newQ) {
              next.set('q', newQ);
            } else {
              next.delete('q');
            }
            return next;
          },
          { replace: true }, // REPLACE — search query is not a history destination
        );
      }, delay);
    },
    [setUrlParams, timers],
  );

  // Issue #1854 — "Clear all" must be ONE atomic URL write, not several racing debounced
  // ones. Cancelling all three pending timers (filters, search, viewport — the viewport
  // timer is cancelled too even though viewport.ts owns reportViewport, since a pending
  // reportViewport write closes over a pre-clear snapshot and would otherwise revive the
  // old q/filters ~300ms later) and writing filters + `q` in a single setUrlParams call
  // removes the race entirely. Regression-tested (243/243 passing) for all three timer
  // sources, including the viewport-debounce case added after initial review.
  const clearAllFiltersAndSearch = useCallback(() => {
    if (timers.filtersLive.current) {
      clearTimeout(timers.filtersLive.current);
      timers.filtersLive.current = null;
    }
    if (timers.search.current) {
      clearTimeout(timers.search.current);
      timers.search.current = null;
    }
    if (timers.viewport.current) {
      clearTimeout(timers.viewport.current);
      timers.viewport.current = null;
    }
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        serializeFilters(next, {});
        next.delete('q');
        return next;
      },
      { replace: true }, // REPLACE — clearing filters/search is not a history destination
    );
  }, [setUrlParams, timers]);

  const setBoardFilters = useCallback(
    (boards: string[]) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // REPLACE semantics: drop all existing `board` entries, then re-append the new set.
          // Emits as repeated params (?board=CBSE&board=ICSE), NOT comma-joined.
          next.delete('board');
          for (const b of boards) {
            next.append('board', b);
          }
          return next;
        },
        { replace: true }, // REPLACE — filter refinement, not a history destination
      );
    },
    [setUrlParams],
  );

  const setCategoryFilters = useCallback(
    (categories: string[]) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (categories.length > 0) {
            next.set('category', categories.join(','));
          } else {
            next.delete('category');
          }
          return next;
        },
        { replace: true }, // REPLACE — filter refinement, not a history destination
      );
    },
    [setUrlParams],
  );

  // Issue #1457, #1458 — clear all agri filter params atomically. Preserves all
  // other URL state. REPLACE (not PUSH).
  const clearAgriFilters = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('agriAcresMin');
        next.delete('agriAcresMax');
        next.delete('agriPriceMin');
        next.delete('agriPriceMax');
        next.delete('agriLandCategory');
        next.delete('agriFarmhouseAvailable');
        next.delete('agriFencingDone');
        next.delete('agriWaterSource');
        return next;
      },
      { replace: true }, // REPLACE — clearing filters doesn't add a Back step
    );
  }, [setUrlParams]);

  return {
    state: { filters, q },
    actions: {
      setFiltersLive,
      setFiltersCommitted,
      setSearchQuery,
      clearAllFiltersAndSearch,
      setBoardFilters,
      setCategoryFilters,
      clearAgriFilters,
    },
  };
}
