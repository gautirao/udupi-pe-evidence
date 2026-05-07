/**
 * useDiscoverUrlState
 *
 * Owns ALL URL read/write for the /discover page.
 *
 * Canonical params:
 *   city       – city slug (validated externally by Index)
 *   areaKey    – selected area key (single value)
 *   lat        – map center latitude  (5 dp, debounced replace)
 *   lon        – map center longitude (5 dp, debounced replace)
 *   zoom       – integer zoom level   (debounced replace)
 *
 * Journey params:
 *   journey    – active journey type: "area-first" | "school-first" (absent = no journey)
 *   groupId    – area-group slug selected for area-first journey (absent when no group)
 *
 * Filter params:
 *   type       – comma-joined property types (e.g. "land,house")
 *   beds       – comma-joined bedroom counts (e.g. "2,3")
 *   priceMin   – rupees
 *   priceMax   – rupees
 *   seller     – comma-joined seller types (e.g. "owner,broker"); legacy singular value also accepted
 *   board      – comma-joined school board filters (e.g. "cbse,icse")
 *   category   – comma-joined school category filters (e.g. "primary,secondary")
 *   bom        – "1" when backOnMarket=true
 *   ntm        – "1" when newToMarket=true
 *   rera       – "1" when reraRegistered=true
 *   rtm        – "1" when readyToMove=true
 *   from       – ISO date YYYY-MM-DD for dateFrom
 *   to         – ISO date YYYY-MM-DD for dateTo
 *   schoolId   – school id (already in use; threaded through for completeness)
 *   radiusKm   – school radius (already in use; threaded through for completeness)
 *
 * Search params:
 *   q          – free-text search query (empty string when no search)
 *
 * History semantics (per issue #910 spec):
 *   City change          → push (atomic: clears journey, groupId, areaKey, viewport)
 *   Journey change       → push
 *   Group selection      → push
 *   Area selection       → push
 *   Area deselection     → replace (remove areaKey)
 *   Map pan/zoom         → replace (debounced 300 ms)
 *   Live filter change   → replace (debounced 300 ms)
 *   Committed filter     → push
 *   School board/cat     → replace
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Journey type — mutually exclusive modes for the right panel. Absent = no active journey. */
export type DiscoverJourney = 'area-first' | 'school-first';

export interface DiscoverViewport {
  lat: number;
  lon: number;
  zoom: number;
}

export interface DiscoverUrlFilters {
  propertyTypes?: string[];
  bedrooms?: number[];
  priceMin?: number;
  priceMax?: number;
  /** Comma-separated seller types in the URL; replaces the former singular sellerType. */
  sellerTypes?: string[];
  /** Comma-separated school board filters (e.g. "cbse,icse"). School-journey only. */
  boardFilters?: string[];
  /** Comma-separated school category filters (e.g. "primary,secondary"). School-journey only. */
  categoryFilters?: string[];
  backOnMarket?: boolean;
  newToMarket?: boolean;
  reraRegistered?: boolean;
  readyToMove?: boolean;
  /** ISO date string YYYY-MM-DD — URL representation of dateFrom */
  dateFrom?: string;
  /** ISO date string YYYY-MM-DD — URL representation of dateTo */
  dateTo?: string;
}

export interface DiscoverUrlState {
  city: string;
  areaKey: string | null;
  viewport: DiscoverViewport | null;
  filters: DiscoverUrlFilters;
  /** School params — read-only here; school writes handled by existing handleSchoolSelect in Index */
  schoolId: string | null;
  radiusKm: number | null;
  /** Free-text search query. Empty string when no search is active. */
  q: string;
  /** Active journey type. Null when no journey is active. */
  journey: DiscoverJourney | null;
  /** Selected area-group slug for area-first journey. Null when no group is selected. */
  groupId: string | null;
}

export interface DiscoverUrlActions {
  /**
   * Atomic city switch — single PUSH, clears journey, groupId, areaKey, and viewport.
   * Property filters (type, beds, price, seller, booleans, dates) are preserved.
   * Replaces the old `setCity` for user-initiated city changes.
   */
  changeCity: (city: string) => void;
  /**
   * Low-level city setter — pushes a new history entry and clears areaKey.
   * Kept for backward compatibility; prefer `changeCity` for user-initiated changes.
   */
  setCity: (city: string) => void;
  /** Select an area — pushes a new history entry */
  selectArea: (areaKey: string) => void;
  /** Deselect the current area — replaces current entry (removes areaKey) */
  deselectArea: () => void;
  /** Report map viewport change — debounced replace (300 ms), does NOT push history */
  reportViewport: (vp: DiscoverViewport) => void;
  /** Set filters as a live/uncommitted change — debounced replace */
  setFiltersLive: (filters: DiscoverUrlFilters) => void;
  /** Set filters as a committed Apply action — pushes a new history entry */
  setFiltersCommitted: (filters: DiscoverUrlFilters) => void;
  /**
   * Write school params (schoolId + radiusKm) to URL — replace, not push.
   * Pass null to remove both params. Single path so Index.tsx needs no bare
   * useSearchParams instance for school writes.
   */
  setSchoolParams: (params: { schoolId: string; radiusKm: number } | null) => void;
  /** Set the free-text search query — debounced replace. Empty string removes the param. */
  setSearchQuery: (q: string) => void;
  /** Set the active journey — pushes a new history entry. Null removes the journey param. */
  setJourney: (journey: DiscoverJourney | null) => void;
  /** Select an area group — pushes a new history entry. Null removes the groupId param. */
  selectGroup: (groupId: string | null) => void;
  /**
   * Set school board filters — replace (not push). Comma-separated in URL as `board`.
   * Empty array removes the param.
   */
  setBoardFilters: (boards: string[]) => void;
  /**
   * Set school category filters — replace (not push). Comma-separated in URL as `category`.
   * Empty array removes the param.
   */
  setCategoryFilters: (categories: string[]) => void;
  /**
   * Clear area context — removes areaKey only. Preserves groupId, journey, schoolId,
   * radiusKm, filters, and viewport. Single REPLACE — does not push a history entry.
   * Does NOT cancel the viewport debounce timer (contrast with deselectArea which does).
   */
  clearAreaContext: () => void;
  /**
   * Start over — clears journey, groupId, areaKey, schoolId, radiusKm, board, category, q,
   * and viewport. Preserves city and property filters (type, beds, price, seller, booleans,
   * dates). Single REPLACE — does not push a history entry.
   */
  startOver: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const LAT_LON_PRECISION = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round(n: number, dp: number): number {
  const factor = Math.pow(10, dp);
  return Math.round(n * factor) / factor;
}

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
  if (filters.boardFilters && filters.boardFilters.length > 0) {
    params.set('board', filters.boardFilters.join(','));
  } else {
    params.delete('board');
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
  return params;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDiscoverUrlState(): [DiscoverUrlState, DiscoverUrlActions] {
  const [urlParams, setUrlParams] = useSearchParams();

  // Debounce timers
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersLiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      if (filtersLiveTimer.current) clearTimeout(filtersLiveTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ─── Read current URL state ──────────────────────────────────────────────

  const city = urlParams.get('city') ?? '';
  const areaKey = urlParams.get('areaKey');

  const rawLat = urlParams.get('lat');
  const rawLon = urlParams.get('lon');
  const rawZoom = urlParams.get('zoom');
  const lat = rawLat ? parseFloat(rawLat) : null;
  const lon = rawLon ? parseFloat(rawLon) : null;
  const zoom = rawZoom ? parseInt(rawZoom, 10) : null;
  const viewport: DiscoverViewport | null =
    lat != null && !isNaN(lat) && lon != null && !isNaN(lon) && zoom != null && !isNaN(zoom)
      ? { lat, lon, zoom }
      : null;

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
    boardFilters: parseCommaStrings(urlParams.get('board')),
    categoryFilters: parseCommaStrings(urlParams.get('category')),
    backOnMarket: urlParams.get('bom') === '1' ? true : undefined,
    newToMarket: urlParams.get('ntm') === '1' ? true : undefined,
    reraRegistered: urlParams.get('rera') === '1' ? true : undefined,
    readyToMove: urlParams.get('rtm') === '1' ? true : undefined,
    dateFrom: parseDateParam(urlParams.get('from')),
    dateTo: parseDateParam(urlParams.get('to')),
  };

  const schoolId = urlParams.get('schoolId');
  const radiusKmRaw = urlParams.get('radiusKm');
  const radiusKm = radiusKmRaw ? parseInt(radiusKmRaw, 10) : null;

  const q = urlParams.get('q') ?? '';

  // journey: validate against allowed values; unknown values are treated as null
  const rawJourney = urlParams.get('journey');
  const journey: DiscoverJourney | null =
    rawJourney === 'area-first' || rawJourney === 'school-first' ? rawJourney : null;

  const groupId = urlParams.get('groupId');

  const state: DiscoverUrlState = {
    city,
    areaKey,
    viewport,
    filters,
    schoolId,
    radiusKm,
    q,
    journey,
    groupId,
  };

  // ─── Actions ─────────────────────────────────────────────────────────────

  const setCity = useCallback(
    (newCity: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('city', newCity);
          // City change clears area selection and viewport (new city = new context)
          next.delete('areaKey');
          next.delete('lat');
          next.delete('lon');
          next.delete('zoom');
          return next;
        },
        { replace: false }, // PUSH — city is a major navigation destination
      );
    },
    [setUrlParams],
  );

  const selectArea = useCallback(
    (newAreaKey: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('areaKey', newAreaKey);
          // groupId is preserved intentionally: when the user selects an area while
          // inside a group (area-groups-landing → area-selected), both ?groupId= and
          // ?areaKey= must be present so the back-navigation can return to the group.
          // groupId is NOT set here if it was absent — we only preserve, never add.
          return next;
        },
        { replace: false }, // PUSH — deliberate navigation into an area
      );
    },
    [setUrlParams],
  );

  const deselectArea = useCallback(() => {
    // Cancel any pending viewport debounce so it cannot re-write stale lat/lon/zoom
    // back into the URL after we clear them below (race: user was panning just before
    // clicking Back → timer fires ~300 ms later and undoes the clear).
    if (viewportTimer.current) {
      clearTimeout(viewportTimer.current);
      viewportTimer.current = null;
    }
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('areaKey');
        // Clear zoomed-in viewport coords atomically. ViewportWatcher's onMoveEnd
        // will fire ~300 ms later (when the map animation to city center completes)
        // and re-populate lat/lon/zoom with correct city-level values. Clearing here
        // ensures that any URL copied/shared immediately after Back is usable:
        // a shared URL with zoom=14 would be above the area-markers threshold and
        // would show no area rings on fresh load.
        next.delete('lat');
        next.delete('lon');
        next.delete('zoom');
        return next;
      },
      { replace: true }, // REPLACE — not a new destination; restores "no area" state
    );
  }, [setUrlParams]);

  const reportViewport = useCallback(
    (vp: DiscoverViewport) => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      viewportTimer.current = setTimeout(() => {
        setUrlParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('lat', round(vp.lat, LAT_LON_PRECISION).toFixed(LAT_LON_PRECISION));
            next.set('lon', round(vp.lon, LAT_LON_PRECISION).toFixed(LAT_LON_PRECISION));
            next.set('zoom', String(Math.round(vp.zoom)));
            return next;
          },
          { replace: true }, // REPLACE — viewport is bookmarkable but not a history destination
        );
      }, DEBOUNCE_MS);
    },
    [setUrlParams],
  );

  const setFiltersLive = useCallback(
    (newFilters: DiscoverUrlFilters) => {
      if (filtersLiveTimer.current) clearTimeout(filtersLiveTimer.current);
      filtersLiveTimer.current = setTimeout(() => {
        setUrlParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            return serializeFilters(next, newFilters);
          },
          { replace: true }, // REPLACE — live/uncommitted edits should not pollute history
        );
      }, DEBOUNCE_MS);
    },
    [setUrlParams],
  );

  const setFiltersCommitted = useCallback(
    (newFilters: DiscoverUrlFilters) => {
      // Cancel any pending live debounce so it doesn't overwrite the push
      if (filtersLiveTimer.current) {
        clearTimeout(filtersLiveTimer.current);
        filtersLiveTimer.current = null;
      }
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          return serializeFilters(next, newFilters);
        },
        { replace: false }, // PUSH — committed filter choice is a history destination
      );
    },
    [setUrlParams],
  );

  const setSchoolParams = useCallback(
    (params: { schoolId: string; radiusKm: number } | null) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (params) {
            next.set('schoolId', params.schoolId);
            next.set('radiusKm', String(Math.round(params.radiusKm)));
          } else {
            next.delete('schoolId');
            next.delete('radiusKm');
          }
          return next;
        },
        { replace: true }, // REPLACE — school selection is not a history destination
      );
    },
    [setUrlParams],
  );

  const setSearchQuery = useCallback(
    (newQ: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
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
      }, DEBOUNCE_MS);
    },
    [setUrlParams],
  );

  /**
   * Atomic city switch — single PUSH, clears journey, groupId, areaKey, and viewport.
   * Property filters (type, beds, price, seller, booleans, dates) are preserved.
   */
  const changeCity = useCallback(
    (newCity: string) => {
      // Cancel any pending viewport debounce so it cannot restore stale coords after the switch.
      if (viewportTimer.current) {
        clearTimeout(viewportTimer.current);
        viewportTimer.current = null;
      }
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('city', newCity);
          // Clear journey context — new city starts fresh
          next.delete('journey');
          next.delete('groupId');
          next.delete('areaKey');
          // Clear viewport — new city has its own default zoom/center
          next.delete('lat');
          next.delete('lon');
          next.delete('zoom');
          return next;
        },
        { replace: false }, // PUSH — city switch is a major navigation destination
      );
    },
    [setUrlParams],
  );

  const setJourney = useCallback(
    (newJourney: DiscoverJourney | null) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newJourney) {
            next.set('journey', newJourney);
          } else {
            next.delete('journey');
          }
          return next;
        },
        { replace: false }, // PUSH — journey type is a navigational choice
      );
    },
    [setUrlParams],
  );

  const selectGroup = useCallback(
    (newGroupId: string | null) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newGroupId) {
            next.set('groupId', newGroupId);
          } else {
            next.delete('groupId');
          }
          // Clear areaKey: a group selection resets area choice (can't have both simultaneously
          // in area-first journey — area-groups-landing and area-selected are mutually exclusive).
          next.delete('areaKey');
          return next;
        },
        { replace: false }, // PUSH — group selection is a navigational choice
      );
    },
    [setUrlParams],
  );

  const setBoardFilters = useCallback(
    (boards: string[]) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (boards.length > 0) {
            next.set('board', boards.join(','));
          } else {
            next.delete('board');
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

  const clearAreaContext = useCallback(() => {
    // Do NOT cancel viewportTimer — the viewport stays valid when clearing area context.
    // This distinguishes clearAreaContext from deselectArea (which clears viewport too).
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('areaKey');
        // groupId, journey, schoolId, radiusKm, filters, and viewport are all preserved.
        return next;
      },
      { replace: true }, // REPLACE — not a new navigation destination
    );
  }, [setUrlParams]);

  const startOver = useCallback(() => {
    // Cancel pending viewport debounce — it must not restore stale coords after reset.
    if (viewportTimer.current) {
      clearTimeout(viewportTimer.current);
      viewportTimer.current = null;
    }
    setUrlParams(
      (prev) => {
        // Preserve city and all property filter params; clear everything else.
        const next = new URLSearchParams();
        const cityVal = prev.get('city');
        if (cityVal) next.set('city', cityVal);
        // Preserve property filters
        const filterParams = ['type', 'beds', 'priceMin', 'priceMax', 'seller', 'bom', 'ntm', 'rera', 'rtm', 'from', 'to'] as const;
        for (const key of filterParams) {
          const val = prev.get(key);
          if (val) next.set(key, val);
        }
        // Journey, groupId, areaKey, schoolId, radiusKm, board, category, q, viewport are
        // intentionally omitted — they do not survive Start Over.
        return next;
      },
      { replace: true }, // REPLACE — start over is not a navigation destination
    );
  }, [setUrlParams]);

  const actions: DiscoverUrlActions = {
    changeCity,
    setCity,
    selectArea,
    deselectArea,
    clearAreaContext,
    reportViewport,
    setFiltersLive,
    setFiltersCommitted,
    setSchoolParams,
    setSearchQuery,
    setJourney,
    selectGroup,
    setBoardFilters,
    setCategoryFilters,
    startOver,
  };

  return [state, actions];
}
