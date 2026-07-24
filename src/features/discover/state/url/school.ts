/**
 * School URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: `schoolId`, `radiusKm`, `schoolPicking` (#1157) reads + all school
 * param writes, including the atomic school-first journey start
 * (setSchoolJourney). See useDiscoverUrlState.ts's module doc for the full
 * param contract.
 */
import { useCallback } from 'react';
import type { DiscoverAreasResponse } from '@/hooks/useDiscoverAreas';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

const LAT_LON_PRECISION = 5;

function round(n: number, dp: number): number {
  const factor = Math.pow(10, dp);
  return Math.round(n * factor) / factor;
}

type SchoolState = Pick<DiscoverUrlState, 'schoolId' | 'radiusKm' | 'schoolPicking'>;
type SchoolActions = Pick<
  DiscoverUrlActions,
  | 'setSchoolParams'
  | 'clearSchoolSelection'
  | 'clearSchoolContext'
  | 'enterSchoolPicking'
  | 'clearSchoolPicking'
  | 'backToSchoolPicking'
  | 'setSchoolJourney'
>;

export function useSchoolUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<SchoolState, SchoolActions> {
  const { urlParams, setUrlParams, queryClient, reads } = ctx;
  const city = reads.city;

  const schoolId = urlParams.get('schoolId');
  const radiusKmRaw = urlParams.get('radiusKm');
  const radiusKm = radiusKmRaw ? parseInt(radiusKmRaw, 10) : null;

  // Issue #1157 — transient area-first school-picking marker. Same presence-flag
  // read style as the bom/ntm/rera/rtm filter flags (filters.ts).
  const schoolPicking = urlParams.get('schoolPicking') === '1' ? true : undefined;

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

  const clearSchoolContext = useCallback(() => {
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

  const enterSchoolPicking = useCallback(() => {
    // Issue #1157 — area-first "add a school in this area" sub-step.
    // Sets schoolPicking=1 while preserving journey (area-first), areaKey, filters,
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

  const backToSchoolPicking = useCallback(() => {
    // Issue #1157 rev-5 DEFECT B — Back from area-school-combined to schools-in-area.
    // Drop the selected school (schoolId + radiusKm) and re-arm the schoolPicking
    // sub-step marker so the panel routes back to schools-in-area without flipping
    // journey. Single REPLACE — symmetric with enterSchoolPicking/clearSchoolPicking.
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

  /**
   * Atomic school-first journey start — sets journey='school-first', school params
   * (schoolId, radiusKm, lat, lon, zoom), and areaKey in a single PUSH.
   *
   * areaKey resolution order (Issue #1160 Option Y):
   *   1. school.areaKey (truthy) — use directly (backend-provided, most precise).
   *   2. Bbox containment fallback — walk the already-loaded discover-areas cache for the
   *      current city. Find the first area whose bbox contains school.lat/lon. No extra fetch.
   *   3. Neither source yields areaKey — omit the param and warn-log once.
   */
  const setSchoolJourney = useCallback(
    (params: {
      schoolId: string;
      radiusKm: number;
      lat: number;
      lon: number;
      zoom: number;
      areaKey?: string | null;
    }) => {
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
    // city is a plain render-time variable threaded via ctx.reads.city each render.
    // queryClient is stable for the lifetime of the QueryClientProvider.
    [setUrlParams, queryClient, city],
  );

  return {
    state: { schoolId, radiusKm, schoolPicking },
    actions: {
      setSchoolParams,
      clearSchoolSelection,
      clearSchoolContext,
      enterSchoolPicking,
      clearSchoolPicking,
      backToSchoolPicking,
      setSchoolJourney,
    },
  };
}
