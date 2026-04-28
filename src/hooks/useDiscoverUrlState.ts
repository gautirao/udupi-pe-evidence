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
 * Filter params:
 *   type       – comma-joined property types (e.g. "land,house")
 *   beds       – comma-joined bedroom counts (e.g. "2,3")
 *   priceMin   – rupees
 *   priceMax   – rupees
 *   seller     – seller type
 *   schoolId   – school id (already in use; threaded through for completeness)
 *   radiusKm   – school radius (already in use; threaded through for completeness)
 *
 * History semantics (per issue #910 spec):
 *   City change          → push
 *   Area selection       → push
 *   Area deselection     → replace (remove areaKey)
 *   Map pan/zoom         → replace (debounced 300 ms)
 *   Live filter change   → replace (debounced 300 ms)
 *   Committed filter     → push
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  sellerType?: string;
}

export interface DiscoverUrlState {
  city: string;
  areaKey: string | null;
  viewport: DiscoverViewport | null;
  filters: DiscoverUrlFilters;
  /** School params — read-only here; school writes handled by existing handleSchoolSelect in Index */
  schoolId: string | null;
  radiusKm: number | null;
}

export interface DiscoverUrlActions {
  /** Change city — pushes a new history entry and clears areaKey */
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
  if (filters.sellerType) {
    params.set('seller', filters.sellerType);
  } else {
    params.delete('seller');
  }
  return params;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDiscoverUrlState(): [DiscoverUrlState, DiscoverUrlActions] {
  const [urlParams, setUrlParams] = useSearchParams();

  // Debounce timers
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersLiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      if (filtersLiveTimer.current) clearTimeout(filtersLiveTimer.current);
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

  const filters: DiscoverUrlFilters = {
    propertyTypes: parseCommaStrings(urlParams.get('type')),
    bedrooms: parseCommaInts(urlParams.get('beds')),
    priceMin: urlParams.get('priceMin') ? Number(urlParams.get('priceMin')) : undefined,
    priceMax: urlParams.get('priceMax') ? Number(urlParams.get('priceMax')) : undefined,
    sellerType: urlParams.get('seller') ?? undefined,
  };

  const schoolId = urlParams.get('schoolId');
  const radiusKmRaw = urlParams.get('radiusKm');
  const radiusKm = radiusKmRaw ? parseInt(radiusKmRaw, 10) : null;

  const state: DiscoverUrlState = {
    city,
    areaKey,
    viewport,
    filters,
    schoolId,
    radiusKm,
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
          return next;
        },
        { replace: false }, // PUSH — deliberate navigation into an area
      );
    },
    [setUrlParams],
  );

  const deselectArea = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('areaKey');
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

  const actions: DiscoverUrlActions = {
    setCity,
    selectArea,
    deselectArea,
    reportViewport,
    setFiltersLive,
    setFiltersCommitted,
    setSchoolParams,
  };

  return [state, actions];
}
