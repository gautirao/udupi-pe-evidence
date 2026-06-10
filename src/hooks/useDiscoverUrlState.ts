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
 *   region     – agri-first corridor direction (e.g. "N", "NW"); absent when none selected
 *   maxKm      – selected cumulative distance tier (10|25|50|100); absent until user picks
 *
 * DEPRECATED (OD-1 Option A):
 *   group      – legacy "DIRECTION:BAND" format; cold-loaded URLs are migrated to region=DIR
 *                (band is dropped, maxKm is NOT inferred) via history.replace on first render
 *
 * Journey params:
 *   journey    – active journey type: "area-first" | "school-first" | "agri-first" (absent = no journey)
 *   groupId    – area-group slug selected for area-first journey (absent when no group)
 *
 * Filter params:
 *   type       – comma-joined property types (e.g. "land,house")
 *   beds       – comma-joined bedroom counts (e.g. "2,3")
 *   priceMin   – rupees
 *   priceMax   – rupees
 *   seller     – comma-joined seller types (e.g. "owner,broker"); legacy singular value also accepted
 *   board      – school board filters as REPEATED params (e.g. "?board=CBSE&board=ICSE")
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
import { useQueryClient } from '@tanstack/react-query';
import type { DiscoverAreasResponse } from '@/hooks/useDiscoverAreas';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Journey type — mutually exclusive modes for the right panel. Absent = no active journey. */
export type DiscoverJourney = 'area-first' | 'school-first' | 'agri-first';

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
  /**
   * School board filters. Serialised in URL as REPEATED `board` params
   * (e.g. `?board=CBSE&board=ICSE`). School-journey only.
   */
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
  /**
   * Transient marker for the area-first "add a school in this area" sub-step (Issue #1157).
   * When true (URL `schoolPicking=1`), the area-first journey shows the schools-in-area panel
   * WITHOUT flipping journey to school-first, so browser/in-app Back returns to area-selected.
   * Matches the bom/ntm/rera/rtm presence-flag read style (`=== '1' ? true : undefined`).
   */
  schoolPicking?: boolean;
  /**
   * Selected agri-first corridor direction (Issue #1429).
   * Parsed from URL `region` param (e.g. "NW"). Null when absent or invalid.
   * Optional to allow partial construction in tests/callers.
   */
  selectedRegion?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null;
  /**
   * Selected cumulative distance tier in km (Issue #1429).
   * Parsed from URL `maxKm` param. Null when absent or invalid.
   * Only meaningful when selectedRegion is also set.
   * Optional to allow partial construction in tests/callers.
   */
  selectedMaxKm?: 10 | 25 | 50 | 100 | null;
  /**
   * @deprecated Use selectedRegion + selectedMaxKm instead.
   * Kept for backward compatibility with discoverPanelState + panels that
   * still reference the old `group` param shape.
   * Will be removed once all consumers migrate to selectedRegion/selectedMaxKm.
   */
  selectedGroup: { directionKey: string; distanceBandKey: string } | null;
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
   * Write school params (schoolId + radiusKm) to URL.
   * Default: PUSH — each user-initiated school selection creates a history entry so
   * browser Back works as a step-back within the school-first journey (AC7 / Issue #1143).
   * Pass `options.replace = true` for housekeeping writes (e.g. cold-load backfill) that
   * must not create a phantom history entry (Issue #1146 cycle-2 blocking fix).
   * Pass null to remove both params. Single path so Index.tsx needs no bare
   * useSearchParams instance for school writes.
   */
  setSchoolParams: (
    params: { schoolId: string; radiusKm: number } | null,
    options?: { replace?: boolean },
  ) => void;
  /**
   * In-page Back from Level 2 (school selected) — clears schoolId + radiusKm.
   * Preserves journey, areaKey, city, board/category filters, property filters,
   * and viewport. Single REPLACE — returns to Level 1 (schools-in-area).
   * Issue #1143 AC2.
   */
  clearSchoolSelection: () => void;
  /**
   * In-page Back from Level 1 (area selected, no school) — clears areaKey only.
   * Preserves journey, city, property filters, and viewport.
   * Single REPLACE — returns to Level 0 (school-browse).
   * Issue #1143 AC3.
   */
  clearAreaSelection: () => void;
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
   * Clear school context — removes schoolId and radiusKm in a single REPLACE.
   * Preserves areaKey, journey, groupId, board, category, property filters, and viewport.
   * Returns user to filtered schools-in-area context after dismissing a school selection.
   */
  clearSchoolContext: () => void;
  /** Start over — clears ALL URL state except city. Journey, groupId, areaKey, schoolId, radiusKm, board, category, q, viewport, and all property filters (type/beds/priceMin/priceMax/seller/bom/ntm/rera/rtm/from/to) are dropped. Single REPLACE navigation. */
  startOver: () => void;
  /**
   * Enter the area-first school-picking sub-step (Issue #1157).
   * Sets `schoolPicking=1` while keeping journey=area-first, areaKey, filters, and viewport.
   * Single PUSH — a deliberate destination so browser Back returns to area-selected.
   */
  enterSchoolPicking: () => void;
  /**
   * Leave the area-first school-picking sub-step (Issue #1157).
   * Deletes `schoolPicking`, keeping areaKey/journey/filters/viewport.
   * Single REPLACE — symmetric with clearAreaSelection/clearSchoolSelection.
   */
  clearSchoolPicking: () => void;
  /**
   * Back from area-school-combined to the schools-in-area sub-step (Issue #1157
   * rev-5 DEFECT B). Deletes schoolId + radiusKm and sets schoolPicking=1 in a
   * single REPLACE. Preserves journey (area-first), areaKey, property/board/category
   * filters, and viewport. Models enterSchoolPicking/clearSchoolPicking. Local school
   * state (selectedSchool + filters.schoolLat/Lon/RadiusKm) is cleared by the caller.
   */
  backToSchoolPicking: () => void;
  /**
   * Select or clear the agri-first regional group (Issue #1409).
   * Writes `group=DIRECTION:BAND` to URL (e.g. "N:10_25"). Null removes the param.
   * Does NOT delete areaKey — B2 allows group selection independently of area selection.
   * PUSH — group selection is a navigational choice.
   * @deprecated Use setRegion + setMaxKm instead (Issue #1429 corridor-first model).
   */
  selectRegionalGroup: (group: { directionKey: string; distanceBandKey: string } | null) => void;
  /**
   * Set the agri-first corridor direction (Issue #1429).
   * Writes `region=DIR` to URL (e.g. "region=NW"). PUSH.
   * Does NOT set maxKm — the user must pick a distance tier separately.
   */
  setRegion: (dir: string) => void;
  /**
   * Set the cumulative distance tier (Issue #1429).
   * Writes `maxKm=N` to URL. PUSH. Region must already be set.
   */
  setMaxKm: (km: 10 | 25 | 50 | 100) => void;
  /**
   * Clear both region + maxKm atomically (Issue #1429).
   * Removes both params in a single PUSH. Returns to agri-landing.
   */
  clearRegionAndMaxKm: () => void;
  /**
   * Atomic school-first journey start — sets journey='school-first', school params (schoolId,
   * radiusKm, lat, lon, zoom), and areaKey in a single PUSH. Ensures all params reach the URL
   * together for correct panel routing. Only used when transitioning to school-first journey
   * with a selected school.
   *
   * areaKey resolution order (Issue #1160 Option Y):
   *   1. school.areaKey (truthy) — use directly (backend-provided, most precise).
   *   2. Bbox containment fallback — walk the already-loaded discover-areas cache for the
   *      current city. Find the first area whose bbox contains school.lat/lon. No extra fetch.
   *   3. Neither source yields areaKey — omit the param and warn-log once.
   */
  setSchoolJourney: (params: {
    schoolId: string;
    radiusKm: number;
    lat: number;
    lon: number;
    zoom: number;
    areaKey?: string | null;
  }) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const LAT_LON_PRECISION = 5;

const VALID_DIRECTIONS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
const VALID_MAX_KM = new Set([10, 25, 50, 100]);

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
  return params;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDiscoverUrlState(): [DiscoverUrlState, DiscoverUrlActions] {
  const [urlParams, setUrlParams] = useSearchParams();
  const queryClient = useQueryClient();

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
  };

  const schoolId = urlParams.get('schoolId');
  const radiusKmRaw = urlParams.get('radiusKm');
  const radiusKm = radiusKmRaw ? parseInt(radiusKmRaw, 10) : null;

  const q = urlParams.get('q') ?? '';

  // journey: validate against allowed values; unknown values are treated as null
  const rawJourney = urlParams.get('journey');
  const journey: DiscoverJourney | null =
    rawJourney === 'area-first' || rawJourney === 'school-first' || rawJourney === 'agri-first'
      ? rawJourney
      : null;

  const groupId = urlParams.get('groupId');

  // Issue #1429 — corridor-first cumulative model. New URL params: region=DIR, maxKm=N.
  type DirectionCode = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  const rawRegion = urlParams.get('region');
  // `as DirectionCode` is safe: VALID_DIRECTIONS contains exactly the 8 direction literals.
  const selectedRegion: DirectionCode | null =
    rawRegion && VALID_DIRECTIONS.has(rawRegion) ? (rawRegion as DirectionCode) : null;

  const rawMaxKm = urlParams.get('maxKm');
  const parsedMaxKm = rawMaxKm ? parseInt(rawMaxKm, 10) : null;
  const selectedMaxKm: 10 | 25 | 50 | 100 | null =
    parsedMaxKm !== null && VALID_MAX_KM.has(parsedMaxKm)
      ? (parsedMaxKm as 10 | 25 | 50 | 100)
      : null;

  // OD-1 OPTION A — legacy cold-load migration: group=DIR:BAND → region=DIR (band dropped).
  // Runs synchronously on mount whenever the `group` param is present in the URL.
  // Uses useEffect to fire after render — replaces history entry (no push) and strips
  // the `group` param. maxKm is intentionally NOT inferred (Option B is forbidden).
  const rawGroupLegacy = urlParams.get('group');
  const GROUP_REGEX = /^(N|NE|E|SE|S|SW|W|NW):(0_10|10_25|25_50|50_up)$/;

  // Synchronous-read: derive selectedGroup from the legacy `group` param for
  // backward-compat with discoverPanelState and any existing panels.
  const selectedGroup =
    rawGroupLegacy && GROUP_REGEX.test(rawGroupLegacy)
      ? {
          directionKey: rawGroupLegacy.split(':')[0],
          distanceBandKey: rawGroupLegacy.split(':')[1],
        }
      : null;

  // Issue #1157 — transient area-first school-picking marker. Same presence-flag
  // read style as the bom/ntm/rera/rtm filter flags above.
  const schoolPicking = urlParams.get('schoolPicking') === '1' ? true : undefined;

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
    schoolPicking,
    selectedGroup,
    selectedRegion,
    selectedMaxKm,
  };

  // ─── OD-1 Option A: Legacy group=DIR:BAND cold-load migration ────────────────
  // On initial URL parse: if the `group` param is present, replace history with
  // region=DIR only (band is dropped, maxKm is NOT inferred — Option B is forbidden).
  // console.warn is intentional to aid debugging of stale shared URLs.
  useEffect(() => {
    const groupParam = urlParams.get('group');
    if (!groupParam) return;

    const parts = groupParam.split(':');
    const directionCode = parts[0];

    if (VALID_DIRECTIONS.has(directionCode)) {
      console.warn(
        '[DEPRECATED] group=DIR:BAND URL param is deprecated. Use region=DIR&maxKm=N instead. Migrating to region=%s (band dropped, maxKm not inferred).',
        directionCode,
      );
    }

    // Always remove `group` on migration regardless of whether the direction is valid
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('group');
        if (VALID_DIRECTIONS.has(directionCode)) {
          next.set('region', directionCode);
          // maxKm intentionally NOT set (OD-1 Option A — band → maxKm mapping is forbidden)
        }
        return next;
      },
      { replace: true }, // REPLACE — migration must not create a phantom history entry
    );
    // Only run on mount (urlParams identity changes each render, so dep array is empty).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    (
      params: { schoolId: string; radiusKm: number } | null,
      options?: { replace?: boolean },
    ) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (params) {
            next.set('schoolId', params.schoolId);
            next.set('radiusKm', String(Math.round(params.radiusKm)));
            // Issue #1157 — selecting a school ends the area-first school-picking
            // sub-step. Drop the transient marker so the URL stays clean (the panel
            // now routes to area-school-combined via schoolId precedence regardless).
            next.delete('schoolPicking');
          } else {
            next.delete('schoolId');
            next.delete('radiusKm');
          }
          return next;
        },
        // Issue #1143 AC7 — default PUSH so browser Back works as a step-back within
        // the school-first journey. Callers may pass replace:true for housekeeping
        // writes (e.g. cold-load backfill) that must not create a phantom history entry
        // (Issue #1146 cycle-2 blocking fix).
        { replace: options?.replace ?? false },
      );
    },
    [setUrlParams],
  );

  const clearSchoolSelection = useCallback(() => {
    // Issue #1143 AC2 — in-page Back from Level 2.
    // Removes schoolId + radiusKm only. Preserves journey, areaKey, city,
    // board/category filters, property filters, and viewport. Single REPLACE.
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('schoolId');
        next.delete('radiusKm');
        return next;
      },
      { replace: true }, // REPLACE — not a new navigation destination
    );
  }, [setUrlParams]);

  const clearAreaSelection = useCallback(() => {
    // Issue #1143 AC3 — in-page Back from Level 1.
    // Removes areaKey only. Preserves journey, city, property filters, and viewport.
    // Single REPLACE — returns to Level 0 (school-browse).
    // Does NOT cancel viewportTimer — viewport stays valid (contrast with deselectArea).
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('areaKey');
        return next;
      },
      { replace: true }, // REPLACE — not a new navigation destination
    );
  }, [setUrlParams]);

  const setSearchQuery = useCallback(
    (newQ: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = null;
      // Clearing (empty string) is applied immediately — no debounce — so that a
      // concurrent reportViewport timer (also 300 ms) cannot fire between the clear
      // intent and the actual URL write and thereby restore the stale `q=` value via
      // its `(prev) => new URLSearchParams(prev)` functional updater.
      const delay = newQ ? DEBOUNCE_MS : 0;
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
      }, delay);
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
          next.delete('group'); // Issue #1409 — clear agri-first regional group on city switch
          next.delete('region'); // Issue #1429 — clear corridor on city switch
          next.delete('maxKm'); // Issue #1429 — clear distance tier on city switch
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

  const setSchoolJourney = useCallback(
    (params: {
      schoolId: string;
      radiusKm: number;
      lat: number;
      lon: number;
      zoom: number;
      areaKey?: string | null;
    }) => {
      // ── areaKey resolution (Issue #1160 Option Y) ──────────────────────────
      // Priority 1: backend-provided areaKey (truthy non-empty string).
      // Priority 2: bbox containment fallback using already-loaded discover-areas cache.
      //   Walk areas; use the first whose [min_lat, max_lat] × [min_lon, max_lon] bbox
      //   contains the school's lat/lon. Skip areas with any null bbox field.
      //   No extra API call — /api/discover/areas is loaded on initial page render.
      // Priority 3: omit areaKey and warn once.
      let resolvedAreaKey: string | null = null;

      if (params.areaKey) {
        resolvedAreaKey = params.areaKey;
      } else {
        // Try bbox fallback from cache. Key must match useDiscoverAreas query key.
        const areasCache = queryClient.getQueryData<DiscoverAreasResponse>(['discover-areas', city]);
        if (areasCache) {
          const match = areasCache.areas.find((area) => {
            if (
              area.minLat == null ||
              area.maxLat == null ||
              area.minLon == null ||
              area.maxLon == null
            ) {
              return false;
            }
            return (
              params.lat >= area.minLat &&
              params.lat <= area.maxLat &&
              params.lon >= area.minLon &&
              params.lon <= area.maxLon
            );
          });
          if (match) {
            resolvedAreaKey = match.areaKey;
          }
        }
        if (!resolvedAreaKey) {
          console.warn(
            '[setSchoolJourney] Could not resolve areaKey for school',
            params.schoolId,
            '— listings fetch will not fire (school outside all known area bboxes)',
          );
        }
      }

      // Single atomic URL write — one history push, one React-Query evaluation cycle.
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('journey', 'school-first');
          next.set('schoolId', params.schoolId);
          next.set('radiusKm', String(Math.round(params.radiusKm)));
          next.set('lat', String(round(params.lat, LAT_LON_PRECISION)));
          next.set('lon', String(round(params.lon, LAT_LON_PRECISION)));
          next.set('zoom', String(Math.round(params.zoom)));
          if (resolvedAreaKey) {
            next.set('areaKey', resolvedAreaKey);
          }
          // Issue #1157 — flipping to school-first ends the area-first school-picking
          // sub-step. Drop the transient marker so it cannot linger in the URL after
          // the journey changes (the marker is also inert once journey != area-first).
          next.delete('schoolPicking');
          return next;
        },
        { replace: false }, // PUSH — school-first journey is a major navigation destination
      );
    },
    // city is a plain render-time variable captured each render via the closure.
    // queryClient is stable for the lifetime of the QueryClientProvider.
    [setUrlParams, queryClient, city],
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

  const selectRegionalGroup = useCallback(
    (group: { directionKey: string; distanceBandKey: string } | null) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (group) {
            next.set('group', `${group.directionKey}:${group.distanceBandKey}`);
          } else {
            next.delete('group');
          }
          // Do NOT delete areaKey — B2 allows group selection independently of area selection.
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

  const clearSchoolContext = useCallback(() => {
    // Do NOT cancel viewportTimer — the viewport stays valid when clearing school context.
    // Removes schoolId and radiusKm only. Preserves areaKey, journey, groupId,
    // board/category filters, property filters, and viewport. Single REPLACE.
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('schoolId');
        next.delete('radiusKm');
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
        // Preserve city only — all property filters, journey context, area/school
        // selection, and viewport are cleared. Preserving filters while the chip
        // strip is invisible (guided-entry has no ActiveContextChips) would silently
        // pre-filter results for the next area the user selects (Issue #1153).
        const next = new URLSearchParams();
        const cityVal = prev.get('city');
        if (cityVal) next.set('city', cityVal);
        // Journey, groupId, group, areaKey, schoolId, radiusKm, board, category, q, viewport,
        // and all property filters (type/beds/priceMin/priceMax/seller/bom/ntm/rera/
        // rtm/from/to) are intentionally omitted — nothing survives Start Over except city.
        return next;
      },
      { replace: true }, // REPLACE — start over is not a navigation destination
    );
  }, [setUrlParams]);

  const enterSchoolPicking = useCallback(() => {
    // Issue #1157 — area-first "add a school in this area" sub-step.
    // Set schoolPicking=1 while preserving journey (area-first), areaKey, filters,
    // and viewport. PUSH so browser Back returns to the area-selected panel.
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('schoolPicking', '1');
        return next;
      },
      { replace: false }, // PUSH — deliberate destination; Back returns to area-selected
    );
  }, [setUrlParams]);

  const clearSchoolPicking = useCallback(() => {
    // Issue #1157 — leave the area-first school-picking sub-step.
    // Remove schoolPicking only; preserve areaKey, journey, filters, and viewport.
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('schoolPicking');
        return next;
      },
      { replace: true }, // REPLACE — symmetric with clearAreaSelection/clearSchoolSelection
    );
  }, [setUrlParams]);

  // ─── Issue #1429: Corridor-first cumulative model ────────────────────────────

  const setRegion = useCallback(
    (dir: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (VALID_DIRECTIONS.has(dir)) {
            next.set('region', dir);
          } else {
            // Silently discard invalid directions
            next.delete('region');
          }
          // Clear maxKm when changing corridor
          next.delete('maxKm');
          return next;
        },
        { replace: false }, // PUSH — corridor selection is a navigational choice
      );
    },
    [setUrlParams],
  );

  const setMaxKm = useCallback(
    (km: 10 | 25 | 50 | 100) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (VALID_MAX_KM.has(km)) {
            next.set('maxKm', String(km));
          } else {
            // Silently discard unknown values
            next.delete('maxKm');
          }
          return next;
        },
        { replace: false }, // PUSH — distance tier is a navigational choice
      );
    },
    [setUrlParams],
  );

  const clearRegionAndMaxKm = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('region');
        next.delete('maxKm');
        return next;
      },
      { replace: false }, // PUSH — clearing is a navigational step (Back restores)
    );
  }, [setUrlParams]);

  const backToSchoolPicking = useCallback(() => {
    // Issue #1157 rev-5 DEFECT B — Back from area-school-combined to schools-in-area.
    // Drop the selected school (schoolId + radiusKm) and re-arm the schoolPicking
    // sub-step marker so the panel routes back to schools-in-area without flipping
    // journey. Single REPLACE — symmetric with enterSchoolPicking/clearSchoolPicking.
    // journey, areaKey, and all filters/viewport are preserved (only the school
    // selection is undone).
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('schoolId');
        next.delete('radiusKm');
        next.set('schoolPicking', '1');
        return next;
      },
      { replace: true }, // REPLACE — not a new navigation destination
    );
  }, [setUrlParams]);

  const actions: DiscoverUrlActions = {
    changeCity,
    setCity,
    selectArea,
    deselectArea,
    clearAreaContext,
    clearSchoolContext,
    reportViewport,
    setFiltersLive,
    setFiltersCommitted,
    setSchoolParams,
    setSearchQuery,
    setJourney,
    setSchoolJourney,
    selectGroup,
    selectRegionalGroup,
    setBoardFilters,
    setCategoryFilters,
    startOver,
    clearSchoolSelection,
    clearAreaSelection,
    enterSchoolPicking,
    clearSchoolPicking,
    backToSchoolPicking,
    setRegion,
    setMaxKm,
    clearRegionAndMaxKm,
  };

  return [state, actions];
}
