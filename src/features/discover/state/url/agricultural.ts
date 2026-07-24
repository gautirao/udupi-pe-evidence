/**
 * Agricultural URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: `region`/`maxKm` corridor-first model (#1429/#1445), the deprecated
 * `group` legacy read + writer (#1409, superseded by region/maxKm), the
 * agri-group listing peek (#1430), and the agri-group-locality drill-down
 * (#1464). Also OWNS the two cold-load mount effects — the OD-1 legacy
 * group=DIR:BAND migration and the region-without-maxKm canonicalisation —
 * which MUST stay co-located here because they share coldLoadDoneRef and
 * form a single state machine (qa-fast R2). See useDiscoverUrlState.ts's
 * module doc for the full param contract.
 */
import { useCallback, useEffect, useRef } from 'react';
import { VALID_DIRECTIONS, extractLegacyGroupDirection } from '@/hooks/discoverUrlNormalize';
import {
  applyLayerSelectionToParams,
  clearRegionScopeForAgri,
  paramsToLayerInput,
} from '@/utils/discoverLayerRegistry';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

const PARAM_LOCALITY = 'locality';
const VALID_MAX_KM = new Set([10, 25, 50, 100]);
/**
 * Byte-identical re-export target — useDiscoverUrlState.ts does
 * `export { DEFAULT_MAX_KM } from '.../agricultural'` so
 * `import { DEFAULT_MAX_KM } from '@/hooks/useDiscoverUrlState'` keeps
 * resolving unchanged for every existing consumer.
 */
export const DEFAULT_MAX_KM = 25;

type DirectionCode = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

type AgriculturalState = Pick<
  DiscoverUrlState,
  'selectedRegion' | 'selectedMaxKm' | 'selectedGroup' | 'selectedListing' | 'selectedLocality'
>;
type AgriculturalActions = Pick<
  DiscoverUrlActions,
  | 'setRegion'
  | 'setRegionWithMaxKm'
  | 'setMaxKm'
  | 'clearRegionAndMaxKm'
  | 'setSelectedListing'
  | 'clearSelectedListing'
  | 'setLocality'
  | 'clearLocality'
  | 'selectRegionalGroup'
>;

export function useAgriculturalUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<AgriculturalState, AgriculturalActions> {
  const { urlParams, setUrlParams } = ctx;

  // Issue #1429 — corridor-first cumulative model. New URL params: region=DIR, maxKm=N.
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
  const rawGroupLegacy = urlParams.get('group');
  const GROUP_REGEX = /^(N|NE|E|SE|S|SW|W|NW):(0_10|10_25|25_50|50_up)$/;

  // Synchronous-read: derive selectedGroup from the legacy `group` param for
  // backward-compat with discoverPanelState and any existing panels.
  // COMPAT SEAM (#2002) — lifted into compatibility.ts by #2002.
  const selectedGroup =
    rawGroupLegacy && GROUP_REGEX.test(rawGroupLegacy)
      ? {
          directionKey: rawGroupLegacy.split(':')[0],
          distanceBandKey: rawGroupLegacy.split(':')[1],
        }
      : null;

  // Issue #1430 — agri-group listing peek. UUID string from `listing` URL param.
  const rawListing = urlParams.get('listing');
  const selectedListing: string | null = rawListing && rawListing.length > 0 ? rawListing : null;

  // Issue #1464 — agri-group-locality drill-down. Plain string from `locality` or `town` URL param.
  // useSearchParams.get() returns the already-decoded value (no manual decodeURIComponent needed).
  const rawLocality = urlParams.get(PARAM_LOCALITY) || urlParams.get('town');
  const selectedLocality: string | null = rawLocality && rawLocality.length > 0 ? rawLocality : null;

  // ─── OD-1 Option A: Legacy group=DIR:BAND cold-load migration ────────────────
  // On initial URL parse: if the `group` param is present, replace history with
  // region=DIR only (band is dropped, maxKm is NOT inferred — Option B is forbidden).
  // console.warn is intentional to aid debugging of stale shared URLs.
  //
  // Issue #1745 P0 — the direction-extraction logic is routed through the shared
  // extractLegacyGroupDirection helper (discoverUrlNormalize.ts) so this write-side
  // migration and the read-side normalizeDiscoverSearchParams shim can never diverge
  // on "which legacy group values are valid to migrate". Observable behaviour
  // (cold-load-only, history.replace, deprecation warning, band always dropped,
  // maxKm never inferred) is unchanged.
  //
  // Ref-guard pattern (Issue #2001 fix — mirrors the sibling cold-load effect
  // below instead of an exhaustive-deps suppression): groupMigrationDoneRef gates
  // the body to run exactly once; real deps [urlParams, setUrlParams] satisfy
  // eslint react-hooks/exhaustive-deps with zero suppressions.
  const groupMigrationDoneRef = useRef(false);
  useEffect(() => {
    if (groupMigrationDoneRef.current) return;
    groupMigrationDoneRef.current = true;

    const groupParam = urlParams.get('group');
    if (!groupParam) return;

    const migratedDirection = extractLegacyGroupDirection(groupParam);

    if (migratedDirection) {
      console.warn(
        '[DEPRECATED] group=DIR:BAND URL param is deprecated. Use region=DIR&maxKm=N instead. Migrating to region=%s (band dropped, maxKm not inferred).',
        migratedDirection,
      );
    }

    // Always remove `group` on migration regardless of whether the direction is valid
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('group');
        if (migratedDirection) {
          next.set('region', migratedDirection);
          // maxKm intentionally NOT set (OD-1 Option A — band → maxKm mapping is forbidden)
        }
        return next;
      },
      { replace: true }, // REPLACE — migration must not create a phantom history entry
    );
  }, [urlParams, setUrlParams]);

  // ─── Issue #1445: Cold-load canonicalisation: region=DIR without maxKm ───────
  // When a URL is loaded with region=DIR but no maxKm (e.g. a URL produced by the
  // old setRegion-only flow or the OD-1 migration), automatically backfill
  // maxKm=DEFAULT_MAX_KM via REPLACE so derivePanelContent returns 'agri-group-selected'.
  //
  // This runs only for cold-load URLs — NOT for in-session setRegion() calls (which
  // intentionally land on agri-landing so the user can pick a distance tier). We gate
  // via a ref that becomes true after the first fire so the effect never fires again on
  // subsequent state changes produced by user navigation actions.
  //
  // For OD-1 URLs (group=DIR:BAND): the OD-1 effect fires on mount and sets region=DIR.
  // hasLegacyGroupParam is true on that first render, so we reset the ref and return.
  // On the next render (after OD-1 REPLACE settles), hasLegacyGroupParam becomes false,
  // selectedRegion is now set, and the canonicalisation fires correctly.
  //
  // hasLegacyGroupParam is derived in render scope (not inside the effect) to avoid a
  // stale-closure bug — including it in deps ensures the effect sees the current value.
  const hasLegacyGroupParam = rawGroupLegacy !== null;
  const coldLoadDoneRef = useRef(false);
  useEffect(() => {
    if (coldLoadDoneRef.current) return; // Only fire once per cold-load sequence
    coldLoadDoneRef.current = true;
    if (hasLegacyGroupParam) {
      // OD-1 migration (group=DIR:BAND → region=DIR) is in-flight on this mount.
      // Reset ref so the effect can fire after OD-1 settles and exposes region=DIR.
      coldLoadDoneRef.current = false;
      return;
    }
    if (selectedRegion !== null && selectedMaxKm === null) {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('maxKm', String(DEFAULT_MAX_KM));
          return next;
        },
        { replace: true }, // REPLACE — canonicalisation must not create a phantom history entry
      );
    }
  }, [selectedRegion, selectedMaxKm, hasLegacyGroupParam, setUrlParams]);
  // No eslint-disable needed — all consumed values are in the deps array.

  // ─── Actions ─────────────────────────────────────────────────────────────

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

  const setRegionWithMaxKm = useCallback(
    (dir: string, km: number = DEFAULT_MAX_KM) => {
      // Silently no-op when either param is invalid
      if (!VALID_DIRECTIONS.has(dir)) return;
      if (!VALID_MAX_KM.has(km)) return;
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('region', dir);
          next.set('maxKm', String(km));
          return next;
        },
        { replace: false }, // PUSH — single history entry covering both region + maxKm
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
        // Issue #1745 P3 — delegates to discoverLayerRegistry's pure reducer
        // (clears region/maxKm/listing/locality, preserves scope + rest) rather
        // than re-listing the deletes inline here.
        applyLayerSelectionToParams(next, clearRegionScopeForAgri(paramsToLayerInput(prev)));
        return next;
      },
      { replace: false }, // PUSH — clearing is a navigational step (Back restores)
    );
  }, [setUrlParams]);

  const setSelectedListing = useCallback(
    (id: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set('listing', id);
          } else {
            next.delete('listing');
          }
          return next;
        },
        { replace: false }, // PUSH — peek is a navigational destination; browser Back closes it
      );
    },
    [setUrlParams],
  );

  const clearSelectedListing = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('listing');
        return next;
      },
      { replace: true }, // REPLACE — closing is not a new destination
    );
  }, [setUrlParams]);

  const setLocality = useCallback(
    (name: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (name) {
            // setUrlParams (URLSearchParams.set) auto-encodes the value.
            // We pass the plain decoded string; it is percent-encoded on write
            // and decoded back by .get() on the next render.
            next.set(PARAM_LOCALITY, name);
            next.delete('town');
          } else {
            next.delete(PARAM_LOCALITY);
            next.delete('town');
          }
          return next;
        },
        { replace: false }, // PUSH — locality drill-down is a navigational destination; Back returns to grouped view
      );
    },
    [setUrlParams],
  );

  const clearLocality = useCallback(() => {
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(PARAM_LOCALITY);
        next.delete('town');
        return next;
      },
      { replace: true }, // REPLACE — closing locality view is not a new destination
    );
  }, [setUrlParams]);

  /**
   * @deprecated Use setRegion + setMaxKm instead (Issue #1429 corridor-first model).
   * COMPAT SEAM (#2002) — writes the legacy `group=DIRECTION:BAND` param; lifted
   * into compatibility.ts by #2002.
   */
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

  return {
    state: { selectedRegion, selectedMaxKm, selectedGroup, selectedListing, selectedLocality },
    actions: {
      setRegion,
      setRegionWithMaxKm,
      setMaxKm,
      clearRegionAndMaxKm,
      setSelectedListing,
      clearSelectedListing,
      setLocality,
      clearLocality,
      selectRegionalGroup,
    },
  };
}
