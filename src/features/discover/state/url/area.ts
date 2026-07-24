/**
 * Area URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: `areaKey`, `journey`, `groupId`, `groupResults` (#1597) reads + area
 * selection / journey / group / startOver writes. See useDiscoverUrlState.ts's
 * module doc for the full param contract.
 */
import { useCallback } from 'react';
import { normalizeDiscoverSearchParams } from '@/hooks/discoverUrlNormalize';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type {
  DiscoverJourney,
  DiscoverUrlActions,
  DiscoverUrlState,
} from '@/hooks/useDiscoverUrlState';

type AreaState = Pick<DiscoverUrlState, 'areaKey' | 'journey' | 'groupId' | 'groupResults'>;
type AreaActions = Pick<
  DiscoverUrlActions,
  | 'selectArea'
  | 'deselectArea'
  | 'clearAreaContext'
  | 'clearAreaSelection'
  | 'selectGroup'
  | 'enterGroupResults'
  | 'clearGroupResults'
  | 'setJourney'
  | 'startOver'
>;

export function useAreaUrlDomain(ctx: UrlDomainCtx): UrlDomainModule<AreaState, AreaActions> {
  const { urlParams, setUrlParams, timers } = ctx;

  const areaKey = urlParams.get('areaKey');
  const groupId = urlParams.get('groupId');

  // Issue #1597 — area-group results presence flag. Same style as schoolPicking (school.ts).
  const groupResults = urlParams.get('groupResults') === '1' ? true : undefined;

  // Issue #1745 P0 — read boundary routed through the normalization shim: resolves
  // journey short-name aliases (area/school/agri → *-first) before validation. The
  // shim never rewrites the URL itself — canonical long forms and unknown/invalid
  // values pass through unchanged, so the fallback-to-null behaviour below is
  // unaffected for anything the shim doesn't recognise as an alias.
  const rawJourney = normalizeDiscoverSearchParams(urlParams).get('journey');
  const journey: DiscoverJourney | null =
    rawJourney === 'area-first' || rawJourney === 'school-first' || rawJourney === 'agri-first'
      ? rawJourney
      : null;

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
    if (timers.viewport.current) {
      clearTimeout(timers.viewport.current);
      timers.viewport.current = null;
    }
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('areaKey');
        // Clear zoomed-in viewport coords atomically — see useDiscoverUrlState.ts
        // module doc "History semantics" for why this must happen atomically with
        // the areaKey delete rather than waiting for ViewportWatcher's onMoveEnd.
        next.delete('lat');
        next.delete('lon');
        next.delete('zoom');
        return next;
      },
      { replace: true }, // REPLACE — not a new destination; restores "no area" state
    );
  }, [setUrlParams, timers]);

  const clearAreaContext = useCallback(() => {
    // Do NOT cancel the viewport timer — the viewport stays valid when clearing area
    // context. This distinguishes clearAreaContext from deselectArea (which clears it).
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

  const clearAreaSelection = useCallback(() => {
    // Issue #1143 AC3 — in-page Back from Level 1.
    // Removes areaKey only. Preserves journey, city, property filters, and viewport.
    // Single REPLACE — returns to Level 0 (school-browse).
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('areaKey');
        return next;
      },
      { replace: true }, // REPLACE — not a new navigation destination
    );
  }, [setUrlParams]);

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

  const enterGroupResults = useCallback(() => {
    // Issue #1597 — PUSH, shareable destination; Back returns to the group drill-down.
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('groupResults', '1');
        // areaKey must not be present in group-results state (results are group-wide).
        // selectArea preserves groupId; here we defensively drop areaKey if somehow present.
        next.delete('areaKey');
        return next;
      },
      { replace: false },
    );
  }, [setUrlParams]);

  const clearGroupResults = useCallback(() => {
    // Issue #1597 — REPLACE, symmetric with clearSchoolPicking; closing is not a new destination.
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('groupResults');
        return next;
      },
      { replace: true },
    );
  }, [setUrlParams]);

  const startOver = useCallback(() => {
    // Cancel pending viewport debounce — it must not restore stale coords after reset.
    if (timers.viewport.current) {
      clearTimeout(timers.viewport.current);
      timers.viewport.current = null;
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
        // Issue #1494 — intent is a global user preference (buy vs rent), NOT journey
        // state. It must survive startOver so the user does not lose their choice.
        // 'buy' is the default — omit it from the URL (shorter, canonical form).
        const intentVal = prev.get('intent');
        if (intentVal === 'rent') next.set('intent', 'rent');
        // Journey, groupId, group, areaKey, schoolId, radiusKm, board, category, q, viewport,
        // scope (Issue #1745 P2), and all property filters (type/beds/priceMin/priceMax/
        // seller/bom/ntm/rera/rtm/from/to) are intentionally omitted — nothing survives
        // Start Over except city. `scope` is already cleared here by construction (this
        // builds a brand-new URLSearchParams containing only city/intent), so no explicit
        // next.delete('scope') is needed.
        return next;
      },
      { replace: true }, // REPLACE — start over is not a navigation destination
    );
  }, [setUrlParams, timers]);

  return {
    state: { areaKey, journey, groupId, groupResults },
    actions: {
      selectArea,
      deselectArea,
      clearAreaContext,
      clearAreaSelection,
      selectGroup,
      enterGroupResults,
      clearGroupResults,
      setJourney,
      startOver,
    },
  };
}
