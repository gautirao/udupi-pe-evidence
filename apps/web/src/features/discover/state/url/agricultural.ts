/**
 * Agricultural URL domain — Issue #2001 Slice 2 PR2 (updated #2002 Slice 2 PR3).
 *
 * Owns: `region`/`maxKm` corridor-first model (#1429/#1445), the agri-group
 * listing peek (#1430), and the agri-group-locality drill-down (#1464). Also
 * OWNS the two cold-load mount effects — the OD-1 legacy group=DIR:BAND
 * migration and the region-without-maxKm canonicalisation — which MUST stay
 * co-located here because they share coldLoadDoneRef and form a single state
 * machine (qa-fast R2). Still reads `rawGroupLegacy`/`hasLegacyGroupParam`
 * for that state machine, but the deprecated `selectedGroup` read and
 * `selectRegionalGroup` writer (#1409, superseded by region/maxKm) have been
 * lifted to compatibility.ts by #2002. See useDiscoverUrlState.ts's module
 * doc for the full param contract.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  VALID_DIRECTIONS,
  extractLegacyGroupDirection,
  normalizeDiscoverSearchParams,
} from '@/hooks/discoverUrlNormalize';
import {
  applyLayerSelectionToParams,
  clearRegionScopeForAgri,
  paramsToLayerInput,
} from '@/utils/discoverLayerRegistry';
import { CLUSTER_FOCUS_PARAM, clearClusterFocusParam } from './clusterFocus';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

/**
 * Exported (Issue #2203) so `state/url/navigation.ts`'s
 * `goToNodeAndClearAgriculturalLocality` can clear the SAME three params this
 * domain owns for `selectedLocality` (canonical `destKey` + the two legacy
 * aliases) in the SAME atomic node-navigation write, instead of hardcoding a
 * second copy of these literals in a different domain module.
 */
export const PARAM_LOCALITY = 'locality';
/**
 * Issue #2151 PR C (C-F1) — canonical destination-key URL param. Stores areas.area_key (a stable
 * identity), never display text. Legacy `locality=`/`town=` links (which stored free-text town
 * names, or occasionally an areaKey when the old client-side grouping fell back to it) are
 * migrated to this param exactly once on cold load — see the migration effect below.
 */
export const PARAM_DEST_KEY = 'destKey';
/**
 * Issue #2151 PR C — format guard for the legacy locality/town → destKey migration below.
 * Real area_key values follow `IN|KA|<District>|<Name>` (see src/lib/areaKey.ts's
 * buildAreaKey / AreaOverviewController contract) — at least 3 non-empty pipe-delimited
 * segments. No codebase-wide area_key validator exists to reuse (checked
 * discoverUrlNormalize.ts and areaKey.ts — neither exports one), so this is scoped locally.
 * Deliberately loose (segment count, not a hard-coded `IN|KA|` prefix) so it doesn't need to
 * change if the key format ever grows beyond India/Karnataka. A legacy value that does NOT
 * match this shape is free-text display text (e.g. "Manipal") and must never be promoted to
 * the canonical destKey param — see the migration effect below.
 */
const AREA_KEY_FORMAT = /^[^|]+(?:\|[^|]+){2,}$/;
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
  'selectedRegion' | 'selectedMaxKm' | 'selectedListing' | 'selectedLocality'
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

  // Issue #1430 — agri-group listing peek. UUID string from `listing` URL param.
  const rawListing = urlParams.get('listing');
  const selectedListing: string | null = rawListing && rawListing.length > 0 ? rawListing : null;

  // Issue #1464 — agri-group-locality drill-down. Issue #2151 PR C (C-F1) — the canonical source
  // is now `destKey` (a stable areas.area_key), not free-text `locality`/`town`. Legacy
  // `locality`/`town` values are read here ONLY as a render-scope fallback for the very first
  // tick before the migration effect below has had a chance to run (it fires on mount and
  // REPLACEs `destKey` in, so this fallback is never hit again after that first render).
  // useSearchParams.get() returns the already-decoded value (no manual decodeURIComponent needed).
  //
  // GitHub-reviewer-24-confirmed bug fix (#2151 PR C follow-up) — this is the READ side of the
  // same bug the migration effect below already fixed on the WRITE side: a legacy value can be
  // either a real areas.area_key OR free-text display text (e.g. "Manipal"). The migration effect
  // only ever persists an area_key-shaped legacy value into destKey, but this render-scope
  // fallback used to expose ANY non-empty legacy value as `selectedLocality` unconditionally —
  // including free text — on the very first render, before the migration effect has run. Any
  // downstream consumer treating a non-null selectedLocality as "ready to fetch" could scope a
  // request by an invalid areaKey (e.g. "Manipal") on that first render. Apply the same
  // AREA_KEY_FORMAT guard here: a legacy value that isn't area_key-shaped is treated as absent,
  // exactly like the migration effect already treats it on the write side.
  const rawDestKey = urlParams.get(PARAM_DEST_KEY);
  const rawLocalityLegacyCandidate = urlParams.get(PARAM_LOCALITY) || urlParams.get('town');
  const rawLocalityLegacy =
    rawLocalityLegacyCandidate && AREA_KEY_FORMAT.test(rawLocalityLegacyCandidate)
      ? rawLocalityLegacyCandidate
      : null;
  const selectedLocality: string | null =
    rawDestKey && rawDestKey.length > 0
      ? rawDestKey
      : rawLocalityLegacy && rawLocalityLegacy.length > 0
        ? rawLocalityLegacy
        : null;

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

  // ─── Issue #2151 PR C (C-F1): legacy locality/town → canonical destKey, EXACTLY ONCE ─────────
  // Mirrors the OD-1 group=DIR:BAND migration above: a ref-guarded mount effect that fires once,
  // deletes the legacy params, and REPLACEs so no phantom history entry is created. This is a
  // param-identity migration (rename), not a display-text→area_key content lookup — no such
  // lookup is available client-side. Callers going forward (AgriGroupSelectedPanel's
  // `onSelectLocality`) write the destination's real areas.area_key via `setLocality`; only
  // pre-existing shared links that still carry old `locality=`/`town=` values go through this
  // one-time migration.
  //
  // GitHub-reviewer-confirmed bug fix: pre-#2151 shared links could carry EITHER a real
  // areas.area_key OR free-text display text (e.g. "Manipal") in the legacy param — the old
  // client-side grouping sometimes fell back to the areaKey, sometimes used display text.
  // Blindly promoting whichever value is present would let free text pose as a stable identity
  // (the exact bug #2151 exists to eliminate) and could scope a downstream destination request
  // by an invalid key. So the legacy value is only promoted to destKey when it already matches
  // the area_key shape (AREA_KEY_FORMAT); otherwise it is dropped — the legacy params are still
  // removed, but destKey is left unset, and the app falls through to its normal "no destination
  // selected" state (group/corridor list). This is the safe, honest fallback: never fabricate an
  // identity from display text.
  //
  // Guarded independently of coldLoadDoneRef/groupMigrationDoneRef above — this domain (locality
  // drill-down identity) has no ordering dependency on the region/maxKm cold-load state machine,
  // so it does not need to participate in that ref chain.
  const localityMigrationDoneRef = useRef(false);
  useEffect(() => {
    if (localityMigrationDoneRef.current) return;
    localityMigrationDoneRef.current = true;

    const hasCanonical = urlParams.get(PARAM_DEST_KEY) !== null;
    if (hasCanonical) return; // already canonical — nothing to migrate

    const legacyValue = urlParams.get(PARAM_LOCALITY) || urlParams.get('town');
    if (!legacyValue) return; // no legacy param present — nothing to migrate

    const isAreaKeyShaped = AREA_KEY_FORMAT.test(legacyValue);

    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(PARAM_LOCALITY);
        next.delete('town');
        if (isAreaKeyShaped) {
          next.set(PARAM_DEST_KEY, legacyValue);
        }
        // else: free-text display value — drop it rather than fabricate an identity.
        return next;
      },
      { replace: true }, // REPLACE — migration must not create a phantom history entry
    );
    // No eslint-disable needed — mirrors the OD-1 effect above: real deps satisfy
    // react-hooks/exhaustive-deps, and the ref guard ensures the body still only runs once.
  }, [urlParams, setUrlParams]);

  // ─── Issue #2186 (AC6): cold-load stale-param strip ──────────────────────────
  // A shared/bookmarked agri-first URL may still carry a school-first schoolId/radiusKm
  // selection, or a stale clusterFocus left over from a prior area-hierarchy visit.
  // Neither concept applies to agri-first (no school, no area-cluster hierarchy there),
  // so strip all three once on mount via REPLACE — mirrors the OD-1/destKey migration
  // effects above (ref-guarded, fires exactly once, never a phantom history entry).
  // Guarded independently of coldLoadDoneRef/groupMigrationDoneRef/localityMigrationDoneRef
  // above: this check has no ordering dependency on the region/maxKm/destKey state
  // machines, so it does not need to participate in that ref chain.
  const staleParamStripDoneRef = useRef(false);
  useEffect(() => {
    if (staleParamStripDoneRef.current) return;
    staleParamStripDoneRef.current = true;

    const journey = normalizeDiscoverSearchParams(urlParams).get('journey');
    if (journey !== 'agri-first') return;

    const hasStaleParams =
      urlParams.get('schoolId') != null ||
      urlParams.get('radiusKm') != null ||
      urlParams.get(CLUSTER_FOCUS_PARAM) != null;
    if (!hasStaleParams) return;

    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('schoolId');
        next.delete('radiusKm');
        clearClusterFocusParam(next);
        return next;
      },
      { replace: true }, // REPLACE — normalization must not create a phantom history entry
    );
  }, [urlParams, setUrlParams]);

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

  // Issue #2151 PR C (C-F1) — `name` is now expected to be the destination's stable areas.area_key
  // (e.g. from AgriGroupSelectedPanel's server-supplied destination buckets), not free-text.
  // Written to the canonical PARAM_DEST_KEY; legacy PARAM_LOCALITY/`town` are always cleared so no
  // dual-canonical state can persist across a setLocality call.
  const setLocality = useCallback(
    (key: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key) {
            // setUrlParams (URLSearchParams.set) auto-encodes the value.
            // We pass the plain decoded string; it is percent-encoded on write
            // and decoded back by .get() on the next render.
            next.set(PARAM_DEST_KEY, key);
            next.delete(PARAM_LOCALITY);
            next.delete('town');
          } else {
            next.delete(PARAM_DEST_KEY);
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
        next.delete(PARAM_DEST_KEY);
        next.delete(PARAM_LOCALITY);
        next.delete('town');
        return next;
      },
      { replace: true }, // REPLACE — closing locality view is not a new destination
    );
  }, [setUrlParams]);

  return {
    state: { selectedRegion, selectedMaxKm, selectedListing, selectedLocality },
    actions: {
      setRegion,
      setRegionWithMaxKm,
      setMaxKm,
      clearRegionAndMaxKm,
      setSelectedListing,
      clearSelectedListing,
      setLocality,
      clearLocality,
    },
  };
}
