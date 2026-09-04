/**
 * Area URL domain — Issue #2001 Slice 2 PR2.
 *
 * Owns: `areaKey`, `journey`, `groupId`, `groupResults` (#1597) reads + area
 * selection / journey / group / startOver writes. See useDiscoverUrlState.ts's
 * module doc for the full param contract.
 */
import { useCallback, useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { normalizeDiscoverSearchParams } from '@/hooks/discoverUrlNormalize';
import { api, ApiError } from '@/lib/api';
import { normalizeNavigationResolveResponse } from '@/features/discover/navigation/normalize';
import {
  ROOT_NODE_KEY,
  type NavigationResolveResponse,
  type NavigationResolveResponseWire,
} from '@/features/discover/navigation/types';
import { AREAS_NAVIGATION_RESOLVE_QUERY_KEY_BASE } from '@/features/discover/navigation/useAreasNavigationJourney';
import { clearClusterFocusParam } from './clusterFocus';
import { applyResultScopeCommit } from './resultScope';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type {
  DiscoverJourney,
  DiscoverUrlActions,
  DiscoverUrlState,
} from '@/hooks/useDiscoverUrlState';
import type { ResultScope } from '@/features/discover/state/resultScope';

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
  | 'commitAreaSet'
>;

export function useAreaUrlDomain(ctx: UrlDomainCtx): UrlDomainModule<AreaState, AreaActions> {
  const { urlParams, setUrlParams, timers, queryClient, reads } = ctx;
  const city = reads.city;

  const areaKey = urlParams.get('areaKey');
  const groupId = urlParams.get('groupId');

  // Issue #1597 — area-group results presence flag. Same style as schoolPicking (school.ts).
  const groupResults = urlParams.get('groupResults') === '1' ? true : undefined;

  // Issue #1745 P0 — read boundary routed through the normalization shim: resolves
  // journey short-name aliases (area/school/agri → *-first) before validation. The
  // shim never rewrites the URL itself — canonical long forms and unknown/invalid
  // values pass through unchanged, so the fallback behaviour below is unaffected
  // for anything the shim doesn't recognise as an alias.
  const rawJourney = normalizeDiscoverSearchParams(urlParams).get('journey');
  const explicitJourney: DiscoverJourney | null =
    rawJourney === 'area-first' || rawJourney === 'school-first' || rawJourney === 'agri-first'
      ? rawJourney
      : null;
  // Issue #2088 item 3 — owner-directed default entry state: a bare /discover
  // with NO `journey` param now resolves to 'area-first' instead of the old
  // no-journey landing, so a first-time visitor lands directly in the
  // canonical node hierarchy without an extra "Explore by area" click.
  //
  // Applied ONCE, HERE, at the single URL-read layer — never per-component —
  // per the qa-fast structural warning: every consumer reads `journey` off
  // this SAME composed state (see useDiscoverUrlState.ts, `journey:
  // areaDomain.state.journey`), so a component-level `journey ?? 'area-first'`
  // fallback anywhere else would be a duplicate, independently-driftable
  // application of this same rule (the exact map/panel-disagreement bug class
  // this codebase has hit before) and must not be added.
  //
  // VIRTUAL default: the URL itself is never rewritten/redirected to add
  // `journey=area-first` — only this read resolves the absence. A bare
  // /discover keeps working as a bookmark/share target that always resolves
  // to today's default (rather than freezing in a literal `journey=
  // area-first` written at click time), browser Back to a bare /discover
  // still lands here without an extra history entry, and existing/new E2E
  // specs navigating to a bare /discover exercise the SAME code path a real
  // user does. A materialised (redirect/replace) default was rejected: it
  // would add a history entry and a visible URL rewrite for a default that
  // carries no information the user chose — a real user-visible change for
  // no benefit over the virtual form.
  //
  // SUPPRESSION: an explicit `scope=` param (Issue #1745 P2 — owned by
  // compatibility.ts, which is out of this item's edit scope, so its
  // presence is read directly off the shared `urlParams` here rather than
  // through that module) means the caller deliberately deep-linked into the
  // LEGACY AreaMarkerLayer/setScope landing, which item 3 keeps reachable
  // rather than deleting. Presence alone suppresses the default (an invalid
  // `scope` value still means "the caller asked for the legacy landing,
  // not area-first" — compatibility.ts's own `isValidScope` gating of what
  // that legacy landing then does with the value is unaffected by this read).
  const hasExplicitScope = urlParams.has('scope');

  // Issue #2088 QA-FIX (regression: bare /discover?city=udupi hard-erroring) —
  // the unconditional 'area-first' default above assumed EVERY city has an
  // active canonical node hierarchy. Bangalore does; Udupi (the launch wedge
  // city) does not — its resolve call 404s ("City has no active navigation
  // hierarchy"), and every consumer of `journey` (MapDiscovery.tsx,
  // DiscoverRightPanelContainer.tsx, DiscoverMapCanvas.tsx — three identical
  // `nav.journey === 'area-first'` gate sites) then tries to mount the
  // canonical Areas surface, which has nothing to resolve and renders the
  // hard error/retry panel instead of the legacy landing.
  //
  // Those three gate sites all read the SAME `journey` field — but NOT
  // directly off this hook's return value at render time. They go through
  // `DiscoverContext.tsx`'s `nav` value, which is `useMemo`'d with a
  // DELIBERATE, load-bearing, comment-documented dependency array of
  // `[searchParamsKey]` alone (`useMemo<DiscoverNavContextValue>(() => {...},
  // [searchParamsKey])` — a scalar derived from `urlParams.toString()`,
  // viewport params excluded) — an existing, out-of-scope optimization that
  // avoids re-rendering the whole Discover subtree on every debounced pan.
  // That memo's whole premise is "urlState is a pure function of the URL
  // string", which is exactly what the async part of this fix breaks: a
  // purely in-memory correction (local component state, a ref latch, or a
  // query-driven re-render with the URL untouched) computes the right
  // `journey` value inside `useAreaUrlDomain`, but `searchParamsKey` never
  // changes, so `nav` never recomputes, so all three gate sites keep reading
  // the STALE optimistic 'area-first' forever — confirmed live in-browser:
  // three separate purely-local designs (a plain boolean, a `useEffect`
  // latch, a `useRef` latch) all computed the correct `journey` value
  // internally to this hook while every rendered gate site stayed stuck.
  //
  // The fix: once hierarchy-unavailable is CONFIRMED (see the probe below),
  // this hook performs ONE explicit `{ replace: true }` write of `scope=''`
  // — the empty string, not deleted — the SAME already-existing sentinel
  // `discover-map-hierarchy.spec.ts`'s own `landingUrl()` helper uses ("An
  // EMPTY scope value fails isValidScope... presence alone suppresses the
  // default"). This is a deliberate, narrow, EXPLAINED exception to the
  // "VIRTUAL, no URL rewrite" rule stated for the plain default above: that
  // rule covers the ORDINARY case, where nothing beyond the URL itself is
  // needed to answer "what does an absent journey mean" and a rewrite would
  // be pure noise. This is different — the correct answer for THIS URL
  // depends on a fact (does this city have a hierarchy) that cannot be known
  // from the URL alone and can only be learned asynchronously; once learned,
  // it is genuinely new information about what this URL should mean, and
  // persisting it is the ONLY way to reach `nav`'s memo without touching
  // `DiscoverContext.tsx` (out of this item's edit scope) or duplicating the
  // default rule at each of the three (two of them also out-of-scope) gate
  // sites — the exact divergence class this hook's own default-computation
  // doc comment (above) already forbids. The write is idempotent (a repeat
  // visit to the corrected URL needs no round trip at all — `hasExplicitScope`
  // is already true) and a REPLACE (no new history entry, no back-button
  // surprise); `hasExplicitScope`/`explicitJourney` still win over it
  // unconditionally since this only fires when neither is already set.
  //
  // A synchronous, request-free check is not possible here (no city-level
  // "has a hierarchy" flag exists anywhere in the API surface — confirmed by
  // inspection of the areas/area-groups/regions responses), so this probes
  // the SAME root-resolve endpoint `useAreasNavigationJourney` itself calls.
  //
  // DELIBERATELY its OWN query key (`...BASE, city, ROOT_NODE_KEY,
  // 'defaultJourneyProbe'`), NOT the identical key `useAreasNavigationJourney`
  // uses for its own resolveQuery, even though that would let TanStack Query
  // dedupe the two into one network request. Sharing the key was an earlier
  // attempt here and produced a live, reproduced oscillation bug: the moment
  // this probe's result flipped the LOCAL `journey` value, `showAreasNavigationJourney`
  // (three gate sites) would go false and `useAreasNavigationJourney`'s OWN
  // observer for that shared key would unmount — cancelling/resetting the
  // in-flight query for both observers, clearing the very error this probe
  // needs, flipping the local value back to 'area-first' optimistically,
  // re-mounting that observer, re-fetching, 404ing again, flipping again...
  // an infinite mount/unmount loop, confirmed live in-browser via a temporary
  // debug trace before this fix. A separate key makes this probe's query
  // lifecycle independent of whether the "real" hook is currently mounted, so
  // it fetches once and settles once — the one extra GET this costs (vs. a
  // would-be dedupe) is a small, worthwhile trade for a probe that actually
  // stops flapping (the `scope=` write above then makes it moot anyway after
  // the first correction, since the probe is `enabled` only pre-correction).
  //
  // Default resolution while the probe is loading/unknown, or on any error
  // OTHER than a 404, stays optimistic ('area-first') — unchanged behaviour
  // for the common case (hierarchy exists, or a transient failure that the
  // existing retry/error UI should still surface honestly, not silently
  // mask). Only a CONFIRMED 404 ("no active navigation hierarchy for this
  // city") triggers the `scope=''` correction above.
  //
  // `ctx.queryClient` is typed as a required `QueryClient`, but
  // navigationCommandMatrix.test.ts's harness — MUST stay byte-unmodified
  // per this issue's own scope contract, see that file's header — passes a
  // `null as unknown as QueryClient` stand-in on the documented assumption
  // that "no domain under test touches the query client" as a live
  // subscription. `useQuery` itself has no optional form, so a `null` second
  // argument would still crash resolving the ambient context. This lazily
  // creates a throwaway per-instance fallback ONLY to keep that call
  // well-typed and non-crashing; `enabled` below is ALSO gated on
  // `Boolean(queryClient)`, so the fallback client's query never actually
  // fetches — that harness keeps exercising the pre-existing optimistic
  // 'area-first' default untouched, exactly as before this fix.
  const [fallbackQueryClient] = useState(() => new QueryClient());
  const hierarchyProbe = useQuery<NavigationResolveResponse, ApiError>(
    {
      queryKey: [
        ...AREAS_NAVIGATION_RESOLVE_QUERY_KEY_BASE,
        city,
        ROOT_NODE_KEY,
        'defaultJourneyProbe',
      ] as const,
      queryFn: async ({ signal }) => {
        const path = `/api/discover/cities/${encodeURIComponent(city)}/navigation/resolve?node=${encodeURIComponent(ROOT_NODE_KEY)}`;
        const wire = await api.get<NavigationResolveResponseWire>(path, { signal });
        return normalizeNavigationResolveResponse(wire);
      },
      // Only needed to resolve the DEFAULT (no explicit journey, no explicit
      // scope) — an explicit journey= or scope= already fully determines
      // `journey` below without this probe, so skip the extra request there.
      // Also requires a REAL queryClient (see fallback note above).
      enabled: Boolean(queryClient) && Boolean(city) && explicitJourney == null && !hasExplicitScope,
      // A structural, one-shot "does this city have a hierarchy" check —
      // never needs to re-fire on window refocus/reconnect/remount once
      // settled (a live-browser trace during development showed this
      // toggling `journey` between 'area-first' and null on every refocus
      // without these disabled, since a fresh in-flight fetch transiently
      // clears `isError` before the repeat 404 lands).
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
    queryClient ?? fallbackQueryClient,
  );
  const hierarchyConfirmedUnavailable =
    hierarchyProbe.isError && hierarchyProbe.error instanceof ApiError && hierarchyProbe.error.status === 404;

  // The persisted correction described above. Guarded identically to the
  // probe's own `enabled` (no explicit journey, no explicit scope already) so
  // this never overwrites a caller's real choice, and fires at most once per
  // confirmed-unavailable transition — after the write, `hasExplicitScope`
  // is true on the next render, so `hierarchyConfirmedUnavailable` itself no
  // longer matters (the probe also stops re-firing, `enabled` follows suit).
  useEffect(() => {
    if (hierarchyConfirmedUnavailable && explicitJourney == null && !hasExplicitScope) {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('scope', '');
          return next;
        },
        { replace: true },
      );
    }
  }, [hierarchyConfirmedUnavailable, explicitJourney, hasExplicitScope, setUrlParams]);

  const journey: DiscoverJourney | null =
    explicitJourney != null
      ? explicitJourney
      : hasExplicitScope
        ? null
        : hierarchyConfirmedUnavailable
          ? null
          : 'area-first';

  const selectArea = useCallback(
    (newAreaKey: string, resultScope?: ResultScope) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('areaKey', newAreaKey);
          // Issue #2016 code-review Finding 5 — fold the result-scope commit into
          // THIS SAME write when the caller passes one, so areaKey and rscope/rareas
          // land in one setUrlParams call / one history entry, never two racing writes.
          if (resultScope !== undefined) {
            applyResultScopeCommit(next, resultScope);
          }
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

  // Issue #2017 — commit a multi-area AREA_SET selection (the "commit search"
  // action finalizing a draft chip set into URL/history). Mirrors selectArea's
  // atomic-fold pattern exactly: areaKey + the rscope/rareas payload land in
  // ONE setUrlParams call / one history entry, never two racing writes.
  //
  // areaKey is set to `primaryAreaKey` — by #2017's architecture decision, this
  // is the FIRST key in the committed set (draft insertion order at commit
  // time). areaKey remains the single-area panel/camera anchor for any UI not
  // yet multi-area-aware; `rareas` (via applyResultScopeCommit) carries the
  // full committed set and is authoritative for querying/filtering.
  //
  // For a single-key commit (areaKeys.length === 1, primaryAreaKey === that
  // key), this produces a byte-for-byte identical URL write to selectArea's
  // AREA_SET commit today — satisfying the no-regression acceptance criterion
  // by construction.
  const commitAreaSet = useCallback(
    (areaKeys: string[], { primaryAreaKey }: { primaryAreaKey: string }) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('areaKey', primaryAreaKey);
          applyResultScopeCommit(next, { kind: 'AREA_SET', areaKeys });
          return next;
        },
        { replace: false }, // PUSH — deliberate "commit search" navigation
      );
    },
    [setUrlParams],
  );

  const deselectArea = useCallback((resultScope?: ResultScope) => {
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
        // Issue #2016 code-review Finding 5 — see selectArea's comment above.
        // Folded into this REPLACE (not a second, independent PUSH) so backing
        // out of an area selection never costs Browser Back two presses.
        if (resultScope !== undefined) {
          applyResultScopeCommit(next, resultScope);
        }
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
          // Issue #2186 (AC5) — school-first context (schoolId/radiusKm) and any stale
          // area-cluster focus never apply to agri-first (no school or hierarchy-cluster
          // concept there). Strip all three on any switch INTO agri-first so a prior
          // school-first/area-first selection can't leak into the agri panel/map.
          if (newJourney === 'agri-first') {
            next.delete('schoolId');
            next.delete('radiusKm');
            clearClusterFocusParam(next);
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
      commitAreaSet,
    },
  };
}
