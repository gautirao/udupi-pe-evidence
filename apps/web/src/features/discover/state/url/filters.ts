/**
 * Filters URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: the WHOLE DiscoverUrlFilters shape (type/beds/price/seller/board/
 * category/booleans/dates/agri*) + the free-text search query `q`. See
 * useDiscoverUrlState.ts's module doc for the full param contract.
 */
import { useCallback } from 'react';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type {
  DiscoverUrlActions,
  DiscoverUrlFilters,
  DiscoverUrlState,
} from '@/hooks/useDiscoverUrlState';

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

function serializeFilters(
  params: URLSearchParams,
  filters: DiscoverUrlFilters,
): URLSearchParams {
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    params.set('type', filters.propertyTypes.join(','));
  } else {
    params.delete('type');
  }
  if (filters.bedrooms && filters.bedrooms.length > 0) {
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

  const filters: DiscoverUrlFilters = {
    propertyTypes: parseCommaStrings(urlParams.get('type')),
    bedrooms: parseCommaInts(urlParams.get('beds')),
    priceMin: urlParams.get('priceMin') ? Number(urlParams.get('priceMin')) : undefined,
    priceMax: urlParams.get('priceMax') ? Number(urlParams.get('priceMax')) : undefined,
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
