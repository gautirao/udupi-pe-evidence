import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { getPageNavigationType, isRestoreAuthoritative, type AreaPanReason } from '@/shared/map/zoomPolicy';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { AgriMapListingsResponse } from '@/hooks/useAgriMapListings';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { getSectorBounds } from '@/lib/geo';
import { labelToSlug } from '@/utils/macroRegionResolver';
import { resolveScope, type ScopeNamespaces } from '@/features/discover/presentation/resolveScope';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { NavigationBounds } from '@/features/discover/navigation/types';

/**
 * Issue #1824 Slice S7 — camera panner/tick orchestration (R9) extracted
 * VERBATIM out of MapDiscovery: the two camera ticks (schoolFocusTick,
 * schoolMarkerFocusTick) + their one-shot writer effects, and the three
 * fitBounds effects (group / macro-region scope / agri-group).
 *
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s7-design.md
 * for the full camera-owner invariant table (#1801/#1806/#1118/#1547/#1815/#1821).
 *
 * The hook does NOT import useDiscoverUrlState, useDiscoverPageState, or
 * useDiscoverJourneyTransitions — every value it needs from those hooks is
 * injected via params (inject-not-import, S5/S6/S7 rule). FLAT return (no
 * atomic multi-field transition exists here — reject ControllerResult, per
 * S2a/S4 precedent).
 *
 * DEVIATION (discovered during implementation, mirrors S6's Deviation 2 for
 * boundedSearchTriggered — see useDiscoverJourneyTransitions.ts's file
 * header): the plan's move-list also named `mapBbox` + `bboxTimerRef` +
 * `handleBoundsChange` + their cleanup effect + the city-change bbox-reset
 * effect. Moving those into THIS hook creates an unresolvable circular
 * dependency: `mapBbox` is read as a plain in-scope JS variable by
 * `useDiscoverMapData({ bbox: mapBbox, ... })` in the page, which must be
 * called BEFORE this hook (this hook needs useDiscoverMapData's OUTPUTS —
 * discoverAreas/areasLoading/isLoadingAreaGroups/isLoadingAreaListings — and
 * the page-derived schoolListings/focusedGroup that are only computable
 * after that call). A JS variable cannot be read before the function call
 * that produces it, so `mapBbox` cannot live inside a hook that is itself
 * called after `useDiscoverMapData`. Resolving this by duplicating
 * useDiscoverMapData's internal `useDiscoverAreas` fetch+mapping earlier in
 * the page (to unblock calling this hook first) would be a genuine new
 * behaviour, not a verbatim move — out of scope per the plan's
 * OUT_OF_SCOPE_FUNCTIONAL_FIX stop condition. `mapBbox`/`bboxTimerRef`/
 * `handleBoundsChange`/the cleanup effect/the city-change reset effect
 * therefore stay declared in MapDiscovery.tsx, UNCHANGED, at their original
 * position (before useDiscoverPageState/useDiscoverMapData) — zero
 * behavioural change, same state, same setter identity, same call sites.
 * Every OTHER camera effect (schoolFocusTick, the #1547 schoolMarkerFocusTick
 * fit-once, group/scope/agri fitBounds) has no such ordering constraint and
 * moves into this hook exactly as planned.
 *
 * Every moved effect/guard/dep-array/ref-advance below is preserved
 * BYTE-FOR-BYTE relative to MapDiscovery.tsx @c4d6ee2d — this is the
 * camera-owner surface; a statement-order or dep-array drift here can
 * reintroduce a camera snap-back/jitter/loop regression (#1547/#1815).
 */

export interface UseDiscoverCameraOrchestrationParams {
  /**
   * DiscoverUrlState fields the camera effects actually read. Injected
   * read-only — the hook never calls a urlActions writer.
   */
  urlState: Pick<
    DiscoverUrlState,
    | 'journey'
    | 'radiusKm'
    | 'groupId'
    | 'areaKey'
    | 'scope'
    | 'selectedLocality'
    | 'viewport'
    | 'historyAction'
  >;
  /** useDiscoverPageState — injected values/setters (SCOPE-LOCKED hook, never moved). */
  selectedSchool: SchoolResult | null;
  /**
   * Issue #1823 — widened to accept an optional `seq`/`reason` on top of the
   * plain `AreaPoint` shape the setter's OWN state type declares. This is
   * type-safe without touching that declaration site (MapDiscovery.tsx/
   * useDiscoverPageState.ts, out of scope here): `(AreaPoint & { seq?,
   * reason? }) | null` is structurally assignable to `AreaPoint | null`
   * (the extra fields are optional), so a setter typed to accept plain
   * `AreaPoint | null` values already safely accepts these widened ones —
   * the extra fields simply flow through at runtime for AreaPanner
   * (PropertyMap.tsx) to read off the same object it already receives.
   *
   * `consumedSeqRef` (fix cycle 3) is the SAME reasoning applied to
   * `consumedPanToAreaSeqRef` below — an extra optional field carrying a
   * live ref object through unaffected by this setter's own type.
   */
  setPanToArea: React.Dispatch<
    React.SetStateAction<
      (AreaPoint & { seq?: number; reason?: AreaPanReason; consumedSeqRef?: React.MutableRefObject<number> }) | null
    >
  >;
  /** useDiscoverMapData outputs — injected. */
  isLoadingAreaListings: boolean;
  discoverAreas: AreaPoint[];
  areasLoading: boolean;
  areaGroupsData: { groups: AreaGroup[] } | undefined;
  isLoadingAreaGroups: boolean;
  agriMapListingsData: AgriMapListingsResponse | undefined;
  cityCenter: [number, number] | undefined;
  /**
   * Issue #1824 S7 OQ2 — the page's OWN focusedGroup/summaryRegions useMemo
   * references, injected as-is (NOT recomputed here). The group-fit and
   * scope-fit dep arrays below rely on these being the SAME stable
   * reference across renders that don't actually change the resolved
   * group/regions — recomputing a fresh object here would give the
   * one-shot effects a new identity every render and re-fire spuriously.
   */
  focusedGroup: AreaGroup | null;
  summaryRegions: DiscoverSummaryRegion[];
  /** Page-derived scalars (urlState.selectedRegion/selectedMaxKm ?? null). */
  selectedRegion: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  /** Page-derived — #1547 fit-once keys off selectedSchoolId + this array's length. */
  schoolListings: DiscoverCityListingItem[];
  /**
   * Issue #1910 (PR2 fix-up, Finding 2) — the SAME shared region/group
   * namespaces MapDiscovery.tsx builds for `useDiscoverMapPresentation`
   * (single source of truth for `resolveScope` classification — see that
   * hook's `scopeNamespaces` JSDoc). Optional — when omitted, this hook
   * derives an equivalent namespace internally from `summaryRegions`/
   * `areaGroupsData` so the existing (pre-#1910) test fixture, which does
   * not supply this prop, keeps working unchanged.
   */
  scopeNamespaces?: ScopeNamespaces;
  /**
   * Issue #1910 (PR2 fix-up, Finding 2) — the region-scoped area-group
   * projection for the CURRENTLY resolved region scope (from
   * `useRegionScopedAreaGroups`), the SAME data `useDiscoverMapPresentation`
   * already consumes. Undefined/not-yet-loaded falls back to the legacy
   * `region_key`-filtered member set (Resolution A) rather than panning to
   * nothing.
   */
  regionScopedGroups?: RegionScopedAreaGroup[];
  /**
   * Issue #1910 (PR2, code-review fix-up) — whether `regionScopedGroups`'s
   * underlying `useRegionScopedAreaGroups` query is still in flight. This is
   * an INDEPENDENT async fetch from `areasLoading`/`isLoadingAreaGroups` (it
   * is not coordinated with them) — on a deep link that lands with a region
   * scope already in the URL, `areasLoading`/`isLoadingAreaGroups` can settle
   * to false before this query resolves. The scope-fit effect below gates on
   * this flag (mirroring the existing areasLoading/isLoadingAreaGroups gate)
   * so it waits for the Resolution-B projection instead of firing once on
   * the Resolution-A fallback and then never re-firing (see the effect's
   * prevScopeRef comment for why a stale one-shot advance would defeat the
   * whole migration). Optional — omitted callers behave as before (undefined
   * is falsy, so the gate never blocks unless there's a caller that opts in).
   */
  isLoadingRegionScopedGroups?: boolean;
  /**
   * Issue #1956 PR 2 (Slice 3, AC3.10/T2) — the canonical Areas navigation
   * node's OWN key and bounds, from the SAME `useAreasNavigationJourney`
   * instance the panel renders (never re-fetched here). `null` when the
   * journey is not mounted, still loading, or the resolved node has no
   * bounds. See the fit-once effect below for why this is keyed on the
   * TRANSITION rather than a `${nodeKey}:${revisionId}` destination identity.
   */
  navigationNodeKey?: string | null;
  navigationNodeBounds?: NavigationBounds | null;
}

export interface UseDiscoverCameraOrchestrationResult {
  schoolFocusTick: number;
  schoolMarkerFocusTick: number;
  schoolFocusLat: number | undefined;
  schoolFocusLon: number | undefined;
  agriGroupFocusBounds: [[number, number], [number, number]] | null;
  /**
   * Issue #2083 (cycle 5) — E2E-assertability counter, incremented every time
   * the canonical-node fit-once effect below actually calls `setPanToArea`
   * (i.e. NOT when the POP-restoration guard skips it). Exposed so a Back
   * transition landing on a node with a persisted viewport can be asserted to
   * NOT re-trigger a second, uncoordinated `AreaPanner` bbox refit — see
   * MapDiscovery.tsx's `window.__debug.mapState.canonicalNodeFitCount` and
   * issue-2083-home-breadcrumb-back-camera-race.spec.ts.
   */
  canonicalNodeFitCount: number;
  /**
   * Issue #2143 (PR follow-up) — true when the CURRENT render cannot be a
   * genuine restore: no in-app PUSH/REPLACE observed yet this mounted
   * session, and the page's own Navigation Timing type isn't 'reload'/
   * 'back_forward'. Exposed so PropertyMap.tsx's URLViewportController (a
   * SEPARATE camera writer, gated only on `historyAction`/`isFirstRender`
   * today) can skip its own unconditional apply for a cold canonical-node
   * transition instead of racing this hook's fit-once effect — see that
   * component's own gate for the exact condition. Same signal `guardedSetPanToArea`
   * uses internally; never recompute a second one from this value's inputs.
   */
  isColdNavigate: boolean;
}

export function useDiscoverCameraOrchestration({
  urlState,
  selectedSchool,
  setPanToArea,
  isLoadingAreaListings,
  discoverAreas,
  areasLoading,
  areaGroupsData,
  isLoadingAreaGroups,
  agriMapListingsData,
  cityCenter,
  focusedGroup,
  summaryRegions,
  selectedRegion,
  selectedMaxKm,
  schoolListings,
  scopeNamespaces,
  regionScopedGroups,
  isLoadingRegionScopedGroups,
  navigationNodeKey = null,
  navigationNodeBounds = null,
}: UseDiscoverCameraOrchestrationParams): UseDiscoverCameraOrchestrationResult {
  // Issue #1910 (PR2 fix-up, Finding 2) — fall back to a locally-derived
  // namespace when the caller doesn't supply one (mirrors
  // useDiscoverMapPresentation's identical fallback). Includes the
  // groupNameSlugs alias map so a legacy/malformed scope value that matched
  // the pre-#1910 ad-hoc `g.name`/`labelToSlug(g.name)` clauses still
  // resolves the same way here as it does in useDiscoverMapPresentation.
  const resolvedScopeNamespaces: ScopeNamespaces = useMemo(() => {
    if (scopeNamespaces) return scopeNamespaces;
    const groups = areaGroupsData?.groups ?? [];
    const groupNameSlugs = new Map<string, string>();
    for (const g of groups) {
      groupNameSlugs.set(labelToSlug(g.name), g.id);
      groupNameSlugs.set(g.name.toLowerCase(), g.id);
    }
    return {
      regionKeys: new Set(summaryRegions.map((r) => r.regionKey)),
      groupSlugs: new Set(groups.map((g) => g.id)),
      groupNameSlugs,
    };
  }, [scopeNamespaces, summaryRegions, areaGroupsData]);

  // Issue #1160 — school-focus tick for SchoolFocusPanner in PropertyMap.
  // Incremented when the selected school changes (new school ID) or when radiusKm
  // changes while a school is selected in school-first journey. The tick pattern
  // mirrors resetMapTick/startOverTick so SchoolFocusPanner fires exactly once per
  // increment without creating a feedback loop with ViewportWatcher.
  const [schoolFocusTick, setSchoolFocusTick] = useState(0);

  // Issue #1160 GAP 1 — SchoolMarkerFocusPanner: fires fitBounds after listings settle.
  // schoolMarkerFocusTick is incremented when listings are ready (non-empty, query settled).
  // Feedback-loop safety: the tick is only incremented by the listingsReadyKey effect, which
  // gates on a primitive string (not array identity). schoolMarkerFocusTick itself is NOT in
  // the dep array. ViewportWatcher does not write to this tick.
  const [schoolMarkerFocusTick, setSchoolMarkerFocusTick] = useState(0);

  // Issue #1160 — increment schoolFocusTick when the selected school changes or when
  // radiusKm changes while a school is selected in the school-first journey.
  //
  // Guards:
  //   1. journey === 'school-first': area-first journey must not be affected.
  //   2. selectedSchool with lat/lon present: SchoolFocusPanner requires hydrated coords.
  //      This handles the hydration-race edge case — the tick is not incremented until
  //      the school object (with latitude/longitude) is actually available.
  //   3. Dependency array contains selectedSchool?.id and urlState.radiusKm so the
  //      effect fires once per school change and once per radius change — NOT on every
  //      map-move event. schoolFocusTick itself is NOT in the dep array (would loop).
  //
  // Feedback-loop safety: SchoolFocusPanner reads schoolFocusTick and uses a
  // handledTickRef guard to act at most once per increment. ViewportWatcher fires
  // reportViewport on moveend/zoomend, but that only updates URL viewport params —
  // it does NOT write to schoolFocusTick, so no loop can form.
  const selectedSchoolId = selectedSchool?.id;
  const selectedSchoolLat = selectedSchool?.latitude;
  const selectedSchoolLon = selectedSchool?.longitude;
  useEffect(() => {
    if (urlState.journey !== 'school-first') return;
    if (selectedSchoolLat == null || selectedSchoolLon == null) return;
    setSchoolFocusTick((t) => t + 1);
  }, [selectedSchoolId, urlState.radiusKm, urlState.journey, selectedSchoolLat, selectedSchoolLon]);

  // Issue #1160 GAP 1 — listingsReadyKey: a stable primitive string that changes only when
  // all three conditions are true simultaneously:
  //   1. a school is selected (selectedSchoolId non-null)
  //   2. the area listings query has settled (!isLoadingAreaListings — boolean, not array identity)
  //   3. at least one listing is within the school radius (schoolListings.length > 0 — a number)
  // When null, SchoolMarkerFocusPanner does not fire. schoolListings.length is a number
  // (primitive) so it does not cause spurious identity changes; only isLoadingAreaListings
  // is guarded to prevent the array-identity concern flagged in qa-fast risk (b).
  const listingsReadyKey = useMemo((): string | null => {
    if (selectedSchoolId == null) return null;
    if (isLoadingAreaListings) return null;
    if (schoolListings.length === 0) return null;
    return `${selectedSchoolId}_${urlState.radiusKm ?? 0}_ready`;
  }, [selectedSchoolId, isLoadingAreaListings, schoolListings.length, urlState.radiusKm]);

  // Increment schoolMarkerFocusTick when listingsReadyKey transitions to a NEW non-null value.
  // listingsReadyKey is null when listings are empty or query not settled → Phase-1 SchoolFocusPanner
  // still fires first (handles the school-center focus); this only fires when markers are present.
  //
  // Issue #1547 ITEM 6 FIX — bbox-refetch zoom-reset bug:
  // The original code incremented on every non-null dep-change. listingsReadyKey encodes
  // `${schoolId}_${radiusKm}_ready`, which is a CONSTANT for a given school+radius selection.
  // A user zoom-in triggers a bbox refetch → isLoadingAreaListings toggles true → false → the
  // listingsReadyKey transitions null→same-string again → the tick incremented → SchoolMarkerFocusPanner
  // re-fired fitBounds(maxZoom=13) and snapped the map back. Fix: track the last KEY that
  // caused an increment in a ref; only increment when the key is DIFFERENT from the last handled.
  // This means a new school selection (different schoolId or radiusKm → new key string) still
  // triggers a fresh fit, but a bbox-driven loading-toggle to the SAME key is a no-op.
  const lastFittedListingsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (listingsReadyKey == null) return;
    if (listingsReadyKey === lastFittedListingsKeyRef.current) return;
    lastFittedListingsKeyRef.current = listingsReadyKey;
    setSchoolMarkerFocusTick((t) => t + 1);
  }, [listingsReadyKey]);

  // ── Group-focused map behaviour (A3 #993) ────────────────────────────────────
  //
  // When a group is selected (groupId set), fitBounds to cover all member areas —
  // but ONLY when groupId changes and no areaKey is set. When areaKey is set, the
  // existing per-area fitBounds applies.
  //
  // fitBounds is triggered by calling setPanToArea with a synthetic AreaPoint whose
  // bbox is the union of all member areas' bboxes. This reuses PropertyMap's existing
  // AreaPanner effect (the F7 debounce) with zero new fitBounds machinery.
  // Issue #1823 (fix cycle 2 — scope correction) — `panToAreaSeqRef` is a
  // single monotonic counter shared across all three reasons (group/scope/
  // canonical-node) so AreaPanner (PropertyMap.tsx) can seq-guard itself the
  // same way MapController does for cameraIntent. `publishPanToArea` is the
  // UNGUARDED publisher used by group/scope below — #1823's own scope is
  // limited to the three canonical "listing-capable" states (Area, bounded
  // Browse, school-radius); group-focus/scope-focus fits are #2076 item 5's
  // presentation-only Area cluster focus, never chartered to carry the
  // #2083 restore-wins-on-POP guard. Cycle 1 widened the guard to all three
  // effects, which suppressed group/scope fits on any ordinary hard load
  // that happens to carry a persisted viewport (there is no in-scope way to
  // tell a genuine Back/Forward POP apart from that) — narrowed back to
  // only the canonical-node call site below, which already had this guard
  // correctly before this issue.
  const panToAreaSeqRef = useRef(0);
  // Issue #1823 (fix cycle 3 — PR #2128 review) — tracks the highest seq
  // AreaPanner (PropertyMap.tsx) has actually fired a fit for, owned HERE
  // rather than by AreaPanner's own local ref. This hook instance survives
  // both remounts that previously replayed an already-fired seq: a
  // PropertyMap-level `mapInstanceKey` bump (PropertyMap stays mounted, only
  // MapContainer/AreaPanner remount) AND the mobile Map dismiss/reopen,
  // which real-unmounts PropertyMap itself while MapDiscovery (this hook's
  // owner) stays mounted. Threaded through on the `panToArea` object itself
  // (not a new prop/callback) so AreaPanner can gate against consumption
  // that outlives its own remounts, while a seq published before AreaPanner's
  // very first-ever mount (the react-leaflet one-commit-later child-mount
  // race on a warm-cache navigation) still compares against this ref's
  // per-hook-lifetime initial value of 0 and fires normally.
  const consumedPanToAreaSeqRef = useRef(0);
  const publishPanToArea = useCallback(
    (area: AreaPoint, reason: AreaPanReason): boolean => {
      panToAreaSeqRef.current += 1;
      setPanToArea({
        ...area,
        seq: panToAreaSeqRef.current,
        reason,
        consumedSeqRef: consumedPanToAreaSeqRef,
      });
      return true;
    },
    [setPanToArea],
  );
  // Issue #2143 — companion signal to the restore-wins-on-POP guard below.
  // `historyAction === 'POP'` alone cannot tell a genuine in-app Back/
  // Forward (or a full-page reload/back_forward-cache restore of an
  // already-app-navigated URL) apart from a COLD hard load straight to
  // `node=<AREA>&lat=&lon=&zoom=` (typed URL, bookmark, new tab, external
  // link) — react-router's `useNavigationType()` reports 'POP' as the
  // INITIAL action on every hard page load regardless of how it was
  // reached. `hasObservedInAppTransitionRef` flips true the first time this
  // mounted session sees a REAL in-app history write (PUSH from goToNode,
  // or REPLACE from reportViewport's debounced pan writes) — a genuine POP
  // restoring an app-created entry can only happen AFTER such a write.
  // `pageNavigationTypeRef` covers the complementary first-render case: the
  // page's OWN Navigation Timing entry (captured once, it never changes for
  // the life of the document) tells 'reload'/'back_forward' apart from a
  // fresh 'navigate' even before any in-app transition has occurred.
  const hasObservedInAppTransitionRef = useRef(false);
  useEffect(() => {
    if (urlState.historyAction === 'PUSH' || urlState.historyAction === 'REPLACE') {
      hasObservedInAppTransitionRef.current = true;
    }
  }, [urlState.historyAction]);
  const pageNavigationTypeRef = useRef(getPageNavigationType());

  // Issue #2143 (PR follow-up) — hoisted OUT of guardedSetPanToArea so a
  // SECOND camera writer (PropertyMap.tsx's URLViewportController, which
  // unconditionally applies the raw URL viewport on every mount/remount —
  // notably including the mobile List<->Map toggle's real unmount/remount of
  // the whole map, NOT just the page's initial load) can consult the exact
  // same signal instead of recomputing a divergent one. Returned below in
  // UseDiscoverCameraOrchestrationResult; MapDiscovery.tsx threads it through
  // DiscoverMapMount -> DiscoverMapCanvas -> PropertyMap -> URLViewportController.
  // Only ONE of these two writers may ever apply a camera write for a given
  // cold canonical-node transition — AreaPanner (guarded below) owns it when
  // isColdNavigate is true and a node is in play; URLViewportController must
  // skip its own unconditional apply in exactly that case (see its own gate).
  const isColdNavigate =
    !hasObservedInAppTransitionRef.current &&
    pageNavigationTypeRef.current !== 'reload' &&
    pageNavigationTypeRef.current !== 'back_forward';

  // Issue #2083 (cycle 5) / #1823 — the restore-wins-on-POP guard, scoped to
  // ONLY the canonical-node fit (see rationale above). Returns whether the
  // write actually fired, so canonicalNodeFitCount below can gate on that.
  const guardedSetPanToArea = useCallback(
    (area: AreaPoint, reason: AreaPanReason): boolean => {
      if (
        isRestoreAuthoritative({
          historyAction: urlState.historyAction,
          viewport: urlState.viewport,
          isColdNavigate,
        })
      ) {
        return false;
      }
      return publishPanToArea(area, reason);
    },
    [publishPanToArea, urlState.historyAction, urlState.viewport, isColdNavigate],
  );

  const prevGroupIdRef = useRef<string | null>(null);
  const prevAreaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Guard: wait for area data AND group-membership data before computing
    // bounds. This must run BEFORE updating refs — on cold load with
    // ?groupId= the effect fires while areasLoading=true, and if refs were
    // updated here the transition check would see groupChanged=false on the
    // second fire (when data has loaded) and skip fitBounds.
    //
    // Issue #1815 live-e2e follow-up: areasLoading alone is not sufficient.
    // `discoverAreas` (gated by areasLoading) and `areaGroupsData` (gated by
    // isLoadingAreaGroups, used the same way by the scope-fit effect below)
    // are two INDEPENDENT async fetches. Gating on isLoadingAreaGroups too
    // ensures focusedGroup.area_keys is actually resolved before the refs
    // (and thus the one-shot signal) ever advance — see the #1815 test for
    // the full bimodal pill-count race this prevents.
    if (!urlState.groupId) return;
    if (areasLoading) return;
    if (isLoadingAreaGroups) return;

    // Now that data is ready, compare against the previous stable values and advance refs.
    const groupChanged = urlState.groupId !== prevGroupIdRef.current;
    const areaKeyCleared =
      prevAreaKeyRef.current !== null && urlState.areaKey === null;

    prevGroupIdRef.current = urlState.groupId;
    prevAreaKeyRef.current = urlState.areaKey;

    // Only act when no area is selected
    if (urlState.areaKey !== null) return;
    // Act on group change OR when areaKey was just cleared (back navigation)
    if (!groupChanged && !areaKeyCleared) return;

    // Resolve member areas — filter discoverAreas to the group's area_keys.
    // Areas not in discoverAreas (partial membership) are silently dropped.
    const groupAreaKeys = focusedGroup?.area_keys ?? [];
    const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
    const bounds = computeGroupBounds(memberAreas);
    if (bounds) {
      publishPanToArea(bounds, 'group');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.groupId, urlState.areaKey, areasLoading, isLoadingAreaGroups, discoverAreas, areaGroupsData]);

  // Issue #1745 Bug 2 — fitBounds to member areas when a macro-region scope is selected
  // so the user does not need to manually zoom out to see corridors in that macro region.
  //
  // prevScopeRef one-shot pattern — COORDINATION REQUIREMENT (Issue #1910 PR2
  // code-review fix-up): this effect only does its pan-to-bounds work when
  // urlState.scope has CHANGED since the last time it ran, then advances
  // prevScopeRef.current so it will not re-fire for the same scope value
  // again. That means EVERY async data source this effect depends on for its
  // bounds computation (discoverAreas/areaGroupsData today, regionScopedGroups
  // as of this fix) MUST be included in the "is it still loading" gate below
  // BEFORE prevScopeRef.current is advanced. If a future data source is added
  // to the bounds computation without also adding its loading flag to this
  // gate, the effect can advance prevScopeRef.current on stale/incomplete
  // data while that source is still in flight, and then permanently skip the
  // correct re-fire when the source resolves (urlState.scope itself never
  // changes again for that page load) — this is the exact bug class fixed
  // here for regionScopedGroups/isLoadingRegionScopedGroups.
  const prevScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!urlState.scope) return;
    if (areasLoading || isLoadingAreaGroups) return;

    // Issue #1910 (PR2 fix-up, Finding 2) — resolveScope-based classification
    // REPLACES the old ad-hoc id/name/slug/region_key OR-match, consistent
    // with the same migration already applied to useDiscoverMapPresentation's
    // two marker-bucketing sites. Previously this effect kept computing its
    // pan-to bounds from the OLD Resolution-A member set (groups filtered by
    // `region_key === scope`, i.e. only each group's PLURALITY region), even
    // after the panel/map markers moved to Resolution B — so a group spanning
    // two regions could show correctly on the map for its non-plurality
    // region while the camera still panned to the incomplete Resolution-A
    // bounds. Preferring `regionScopedGroups` (Resolution B) here fixes that.
    //
    // Resolved BEFORE the scopeChanged/prevScopeRef advance below (code
    // review fix-up) — `regionScopedGroups` is an INDEPENDENT async fetch
    // from areasLoading/isLoadingAreaGroups (not coordinated with them). On a
    // deep link with a region scope already in the URL, areasLoading/
    // isLoadingAreaGroups can settle to false before regionScopedGroups has
    // loaded; without this gate the effect would advance prevScopeRef.current
    // on the incomplete Resolution-A fallback and then bail at the
    // `!scopeChanged` guard forever once the projection actually arrives
    // (urlState.scope itself never changes again for that page load).
    //
    // Review fix (#1910 PR2) — gating on `isLoadingRegionScopedGroups` alone
    // covered the pending state but NOT a genuine fetch failure:
    // `isLoadingRegionScopedGroups` becomes false once the fetch errors
    // (React Query settles isLoading→false on error, not just success), so
    // the effect used to fall through, commit prevScopeRef.current on the
    // WRONG Resolution-A fallback bounds, and then never re-fire once a
    // user-triggered retry actually succeeded (`scopeChanged` is false for
    // the rest of that page load — the scope value itself never changes).
    // `regionScopedGroups` (the raw `data`) is `undefined` in BOTH the
    // pending AND error states of the query — React Query only ever
    // populates it on genuine success — so gating on that alone covers both
    // without needing a separate error flag, and guarantees the ref only
    // ever advances once real Resolution-B bounds are available to pan to.
    const resolved = resolveScope(urlState.scope, resolvedScopeNamespaces);
    if (resolved.kind === 'region' && regionScopedGroups === undefined) return;

    const scopeChanged = urlState.scope !== prevScopeRef.current;
    prevScopeRef.current = urlState.scope;

    if (urlState.groupId !== null || urlState.areaKey !== null) return;
    if (!scopeChanged) return;

    const groups = areaGroupsData?.groups ?? [];

    let memberAreas: typeof discoverAreas = [];
    if (resolved.kind === 'region') {
      // regionScopedGroups is guaranteed defined here — the gate above
      // returns early for both the pending and error states.
      const regionAreaKeys = (regionScopedGroups ?? []).flatMap((g) => g.areaKeys ?? []);
      memberAreas = discoverAreas.filter((a) => regionAreaKeys.includes(a.areaKey));
    } else if (resolved.kind === 'group') {
      const targetGroup = groups.find((g) => g.id === resolved.groupSlug);
      const groupAreaKeys = targetGroup?.area_keys ?? [];
      memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
    } else if (urlState.scope === 'other' || urlState.scope === 'unmapped') {
      const allGroupAreaKeys = new Set(groups.flatMap((g) => g.area_keys ?? []));
      memberAreas = discoverAreas.filter((a) => !allGroupAreaKeys.has(a.areaKey));
    }

    const bounds = computeGroupBounds(memberAreas);
    if (bounds) {
      publishPanToArea(bounds, 'scope');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.scope, urlState.groupId, urlState.areaKey, areasLoading, isLoadingAreaGroups, discoverAreas, areaGroupsData, summaryRegions, resolvedScopeNamespaces, regionScopedGroups, isLoadingRegionScopedGroups]);

  // Issue #1956 PR 2 (Slice 3, AC3.10) — fit-once per canonical Areas
  // navigation SELECTION, reusing the existing `setPanToArea` AreaPanner
  // fitBounds machinery (zero new fitBounds machinery, same recipe as the
  // group-focused effect above: a synthetic AreaPoint carrying the target
  // bbox).
  //
  // T2 — THE FIT-ONCE GUARD IS KEYED ON THE TRANSITION, NOT ON A
  // `${nodeKey}:${revisionId}` DESTINATION IDENTITY. qa-fast's pre-
  // implementation scan (MV-2) confirmed no such guard exists yet on this
  // branch, and flagged the exact trap a naive port would reintroduce: keying
  // on destination identity makes Direction -> Area -> Back-to-the-same-
  // Direction produce an IDENTICAL key on the second visit to that Direction,
  // so no fit would fire and the map would stay framed on the child while the
  // panel already shows the parent. Keying on "did `navigationNodeKey` change
  // since the last render this effect acted on" fires again on every genuine
  // transition, including a return to a previously-visited node, because the
  // ref is advanced to the INTERVENING key (the child's) in between.
  const prevNavigationNodeKeyRef = useRef<string | null>(null);
  // Issue #2083 (cycle 5) — see UseDiscoverCameraOrchestrationResult's doc.
  const [canonicalNodeFitCount, setCanonicalNodeFitCount] = useState(0);
  useEffect(() => {
    if (navigationNodeKey == null) {
      prevNavigationNodeKeyRef.current = null;
      return;
    }
    const transitioned = navigationNodeKey !== prevNavigationNodeKeyRef.current;
    prevNavigationNodeKeyRef.current = navigationNodeKey;
    if (!transitioned) return;

    const bounds = navigationNodeBounds;
    if (
      !bounds ||
      bounds.minLat == null ||
      bounds.minLon == null ||
      bounds.maxLat == null ||
      bounds.maxLon == null
    ) {
      return;
    }

    // Issue #2083 (cycle 5), Issue #1823 (guard consolidated) — a browser
    // Back/Forward (POP) landing on a node whose URL already carries a
    // restored `lat`/`lon`/`zoom` is NOT a fresh "selection" this AC3.10
    // fit-once effect needs to frame from the node's bbox — it is a history
    // RESTORATION, and PropertyMap's URLViewportController is the SOLE
    // authority for replaying a persisted camera (an exact, precise setView,
    // not a bbox+padding+aspect-ratio recomputation). Without suppressing
    // this write, this effect would ALSO fire a fit on the exact same POP
    // transition, driving AreaPanner's `map.fitBounds()` as a second,
    // uncoordinated camera writer. This is now `isRestoreAuthoritative`,
    // checked inside `guardedSetPanToArea`, scoped to ONLY this canonical-
    // node call site (fix cycle 2 — group/scope go through the unguarded
    // `publishPanToArea` instead; see the rationale where both are defined)
    // instead of duplicated inline here. A forward navigation (PUSH) or a
    // POP to a node with NO persisted viewport (city root / a Direction —
    // `goToNode` deliberately strips lat/lon/zoom for hierarchy nodes, see
    // navigation.ts) still fits from the bbox exactly as before — the guard
    // is scoped to precisely the case that already has a precise camera to
    // trust. `prevNavigationNodeKeyRef` above has ALREADY advanced by this
    // point regardless of whether this write is suppressed, so the next
    // genuine transition to a DIFFERENT node is still recognised.
    const fired = guardedSetPanToArea(
      {
        areaKey: navigationNodeKey,
        areaLabel: navigationNodeKey,
        geo_center_lat: bounds.centreLat ?? (bounds.minLat + bounds.maxLat) / 2,
        geo_center_lon: bounds.centreLon ?? (bounds.minLon + bounds.maxLon) / 2,
        bbox: [
          [bounds.minLat, bounds.minLon],
          [bounds.maxLat, bounds.maxLon],
        ],
      },
      'canonicalNode',
    );
    if (fired) {
      setCanonicalNodeFitCount((c) => c + 1);
    }
    // urlState.historyAction/urlState.viewport are not listed directly in
    // this effect's own dep array, but guardedSetPanToArea (which IS listed)
    // is a useCallback whose OWN deps include both — so its identity changes
    // whenever they do, and this effect re-runs on that cadence anyway
    // (urlState.viewport changes on every debounced camera write). That's
    // harmless: `transitioned` stays false whenever navigationNodeKey hasn't
    // changed, so the re-run just re-checks and no-ops without touching any
    // ref or publishing anything — it still does real work (a fit) only
    // ONCE per genuine node transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationNodeKey, navigationNodeBounds, guardedSetPanToArea]);

  // Issue #1410 (B3) — viewport-fit when agri group listings arrive.
  // Uses a state variable fed into PropertyMap's focusBounds so it's consistent with how
  // all other fitBounds effects work in this page (no direct mapRef access).
  const [agriGroupFocusBounds, setAgriGroupFocusBounds] = useState<[[number, number], [number, number]] | null>(null);

  useEffect(() => {
    // Issue #1429/#1447 — use selectedRegion + selectedMaxKm (corridor-first cumulative model)
    if (!selectedRegion || selectedMaxKm == null) {
      setAgriGroupFocusBounds(null);
      return;
    }

    // Issue #1480 — when a locality/town is selected, frame only that town's listings.
    // Locality branch takes priority over corridor framing; early-return prevents overwrite.
    const selectedLocality = urlState.selectedLocality ?? null;
    if (selectedLocality) {
      const localityListings = (agriMapListingsData?.listings ?? []).filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          (l.locality ?? l.areaKey) === selectedLocality,
      );
      if (localityListings.length > 0) {
        const lats = localityListings.map((l) => l.latitude as number);
        const lons = localityListings.map((l) => l.longitude as number);
        setAgriGroupFocusBounds([
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ]);
      } else {
        // Locality matched no listings with valid coords — fall back to sector framing.
        const sectorBounds = cityCenter
          ? getSectorBounds(cityCenter[0], cityCenter[1], selectedRegion, selectedMaxKm)
          : null;
        setAgriGroupFocusBounds(sectorBounds);
      }
      return;
    }

    // Issue #1447 — include sector geometry in map fit so the directional cone is
    // always fully framed, even when listings are sparse or clustered near the centroid.
    const sectorBounds = cityCenter
      ? getSectorBounds(cityCenter[0], cityCenter[1], selectedRegion, selectedMaxKm)
      : null;

    // Filter out listings with null/undefined lat/lon before spreading into Math.min/max.
    // AgriMapListingItem declares latitude/longitude as number, but the server can return null
    // when the DB column is null; Math.min/max(undefined) = NaN which corrupts Leaflet fitBounds.
    const validListings = (agriMapListingsData?.listings ?? []).filter(
      l => l.latitude != null && l.longitude != null
    );

    let listingBounds: [[number, number], [number, number]] | null = null;
    if (validListings.length) {
      const lats = validListings.map(l => l.latitude as number);
      const lons = validListings.map(l => l.longitude as number);
      listingBounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ];
    }

    if (!sectorBounds && !listingBounds) {
      setAgriGroupFocusBounds(null);
      return;
    }

    if (!sectorBounds) {
      // cityCenter unavailable (unknown city slug) — fall back to listing-only bounds
      setAgriGroupFocusBounds(listingBounds);
      return;
    }

    if (!listingBounds) {
      // No valid listings — frame the sector cone alone
      setAgriGroupFocusBounds(sectorBounds);
      return;
    }

    // Union: expand to contain both the sector geometry and visible listings
    setAgriGroupFocusBounds([
      [Math.min(sectorBounds[0][0], listingBounds[0][0]), Math.min(sectorBounds[0][1], listingBounds[0][1])],
      [Math.max(sectorBounds[1][0], listingBounds[1][0]), Math.max(sectorBounds[1][1], listingBounds[1][1])],
    ]);
  }, [selectedRegion, selectedMaxKm, agriMapListingsData, cityCenter, urlState.selectedLocality]);

  return {
    schoolFocusTick,
    schoolMarkerFocusTick,
    schoolFocusLat: selectedSchoolLat,
    schoolFocusLon: selectedSchoolLon,
    agriGroupFocusBounds,
    canonicalNodeFitCount,
    isColdNavigate,
  };
}
