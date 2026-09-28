import { useCallback, useMemo } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { resolveAreasCity } from '../selectors/areaCityResolution';
import { resolveReturnLabel } from '../selectors/previousScopeReturn';
import { resolveResultScopeKind, type ResultScopeKind } from '../selectors/resultScopeKind';

export interface UseResultScopeControllerArgs {
  city: string | undefined;
  isViewportScope: boolean;
}

/**
 * Issue #2658 (C2) — the committed result-scope reads (Issues #2016, #2017,
 * #2018 slice 3, #2478 step 1, #2480) extracted from AreaSelectedPanel.
 * Wraps the C2 pure selectors (resultScopeKind.ts, previousScopeReturn.ts,
 * areaCityResolution.ts) plus the one stateful piece that cannot be pure:
 * the `useDiscoverAreas` lookup that resolves a committed AREA_SET
 * `previous` scope's areaKeys into displayable AreaPoints, and the
 * `handleReturnToPreviousScope` / `clearAreas` commands.
 *
 * `handleClearAreas` (renamed `clearAreas` here) is folded into this
 * controller rather than into `useAreaSetScopeCommands`: it commits `null`
 * to the SAME `resultScope` this controller already owns, and putting it
 * next to `returnToPrevious` keeps every result-scope-committing action in
 * one place.
 *
 * See `AreaSelectedPanel`'s prior inline implementation (git history) for
 * the full #2480 "one-shot camera restore request, not a synchronous call"
 * reasoning this preserves verbatim — the CAMERA-RESTORE TIMING here is
 * copied byte-for-byte from that logic, not re-derived, because the
 * `useDiscoverMapDataController` post-commit effect it hands off to depends
 * on the exact shape of the request.
 */
export function useResultScopeController({ city, isViewportScope }: UseResultScopeControllerArgs) {
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const shell = useDiscoverShell();

  const activeScope = nav.resultScope?.active ?? null;
  const multiAreaKeys =
    activeScope?.kind === 'AREA_SET' && activeScope.areaKeys.length > 1 ? activeScope.areaKeys : null;

  const resultScopeKind: ResultScopeKind = resolveResultScopeKind(isViewportScope, activeScope?.kind ?? null);

  const resolvedAreasCity = resolveAreasCity(city, nav.city, DEFAULT_CITY);
  const { data: discoverAreasData } = useDiscoverAreas(resolvedAreasCity);
  const previousResultScope = nav.resultScope?.previous ?? null;

  // Memoized (not just a plain derivation) so `returnToPrevious`'s
  // useCallback deps below have a stable identity across renders that don't
  // actually change the resolved previous-area set — otherwise every render
  // would re-create the handler (react-hooks/exhaustive-deps flags this).
  const previousAreas: AreaPoint[] = useMemo(
    () =>
      previousResultScope?.kind === 'AREA_SET'
        ? previousResultScope.areaKeys
            .map((key) => discoverAreasData?.areas.find((area) => area.areaKey === key))
            .filter((area): area is NonNullable<typeof area> => area != null)
            .map((area) => ({
              areaKey: area.areaKey,
              areaLabel: area.name,
              geo_center_lat: area.geoCenterLat,
              geo_center_lon: area.geoCenterLon,
              bbox:
                area.minLat != null && area.minLon != null && area.maxLat != null && area.maxLon != null
                  ? ([
                      [area.minLat, area.minLon],
                      [area.maxLat, area.maxLon],
                    ] as [[number, number], [number, number]])
                  : null,
              listingCount: area.listingCount,
            }))
        : [],
    [previousResultScope, discoverAreasData],
  );

  const returnLabel = resolveReturnLabel(
    previousResultScope,
    previousAreas.map((area) => area.areaLabel),
  );

  const returnToPrevious = useCallback(() => {
    // Per #2015 AC7, a scope-boundary restore is a PUSH transition (browser
    // back stays undoable) — intentionally no `{ history: 'replace' }`.
    actions.commitResultScope(previousResultScope);
    // Issue #2480 — single-area (N=1) AREA_SET camera restore. Cannot call
    // `shell.focusAreaSetMember`/`shell.fitAreaSet` synchronously here: those
    // stable delegates close over whatever `AreaSetCameraActions` was
    // registered as of the LAST render before the commit above, i.e. they
    // still read the PRE-commit `resultScope`, so a synchronous call would
    // silently no-op against stale state. Instead, record a one-shot restore
    // request that the post-commit effect in `useDiscoverMapDataController`
    // consumes once the commit has actually landed.
    //
    // The target is resolved HERE, from `previousAreas` (already loaded by
    // this controller for the Return label above), not left for the
    // consuming effect to recompute later — see
    // `AreaSetCameraRestoreRequest`'s doc in context/types.ts for why that
    // matters (deferred #2017 double-fire). If the single area doesn't
    // actually resolve in `previousAreas` (e.g. areas data not loaded here
    // either), issue no request at all — an honest degradation, since the
    // Return label already falls back to the generic "Return to previous
    // area" in that case too.
    if (
      previousResultScope?.kind === 'AREA_SET' &&
      previousResultScope.areaKeys.length === 1 &&
      previousAreas.length === 1
    ) {
      shell.setAreaSetCameraRestoreRequest({
        areaKey: previousAreas[0].areaKey,
        bounds: previousAreas[0].bbox,
        center: [previousAreas[0].geo_center_lat, previousAreas[0].geo_center_lon],
      });
    }
  }, [actions, previousAreas, previousResultScope, shell]);

  const clearAreas = useCallback(() => {
    actions.commitResultScope(null);
  }, [actions]);

  return {
    activeScope,
    resultScopeKind,
    previousAreas,
    returnLabel,
    multiAreaKeys,
    commands: {
      returnToPrevious,
      clearAreas,
    },
  };
}

export type ResultScopeController = ReturnType<typeof useResultScopeController>;
