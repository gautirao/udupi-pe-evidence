import { useState, useEffect, useCallback, useRef } from 'react';
import { PropertyFilters, clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { SchoolResult } from '@/hooks/useSchoolSearch';
// Issue #1953 AC12 — `import type`, same defect as useDiscoverMapData.ts. This is the
// SECOND leaflet-reaching site, found by sweeping the WHOLE eager graph rather than
// fixing only the one that had been reported.
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import { resolveEffectiveCity } from '@/features/discover/selectors/effectiveDiscoverContext';
import type { CommittedResultScope } from '@/features/discover/state/resultScope';
import {
  IDLE_POLYGON_DRAFT,
  resolvePolygonDraftPhase,
  type PolygonDraftBlock,
  type PolygonDraftPhase,
  type PolygonDraftState,
} from '@/features/discover/state/polygonDraftPhase';
import type { PolygonRejection } from '@/features/discover/state/polygonRejection';
import { validatePolygonScope } from '@/features/discover/state/validatePolygonScope';
import {
  mergeUrlFiltersIntoLocal,
  projectUrlFilters,
  urlFilterSignature,
} from '@/features/discover/selectors/urlFiltersProjection';

export interface UseDiscoverPageStateParams {
  urlState: DiscoverUrlState;
  urlActions: DiscoverUrlActions;
  /**
   * Issue #2419 (PR-1) — whether the shopper is signed in, threaded from the
   * page composition (which already reads it) rather than pulled from
   * `useAuth()` here: this hook renders in several test fixtures with no
   * AuthProvider, and a context dependency would break them for no benefit.
   *
   * Optional, and only an explicit `false` blocks a POLYGON commit, so an
   * unwired caller can never silently lock out a signed-in shopper. The real
   * composition call site always supplies it.
   *
   * WHY OPTIONAL IS SAFE, when an optional security-ish parameter is normally
   * a smell: this gate is an honesty and UX improvement layered ON TOP of a
   * defence that does not depend on it. A caller that omits the value falls
   * through to the pre-commit probe, which is itself fail-closed — the
   * listings endpoint is authenticated, so an anonymous request returns 401,
   * `validatePolygonScope` reports `unverified`, and nothing is committed.
   * There is no fail-open path. The worst an unwired caller can do is make
   * one pointless request and then say "we couldn't check this search area"
   * instead of the more useful "this needs an account".
   *
   * The wiring is still guarded mechanically, because losing it degrades a
   * message rather than announcing itself — see
   * features/discover/composition/__tests__/authThreading.guard.test.ts.
   */
  isAuthenticated?: boolean;
}

export interface UseDiscoverPageStateResult {
  // State
  filters: PropertyFilters;
  selectedArea: AreaPoint | null;
  panToArea: AreaPoint | null;
  mapZoom: number;
  mapReady: boolean;
  showLoader: boolean;
  selectedSchool: SchoolResult | null;
  schoolBoardFilter: string[];
  city: string;
  fitTick: number;
  resetMapTick: number;

  // Refs exposed for orchestration use in Index.tsx
  pendingAreaKeyRef: React.MutableRefObject<string | null>;
  initialViewportRef: React.MutableRefObject<DiscoverUrlState['viewport']>;
  /**
   * Issue #1821 — true only when the mount-time URL was a bare area-only deep link
   * (areaKey present, no groupId/scope). initialViewportRef should only be trusted
   * to suppress the area-specific fit when this is true; a groupId/scope present at
   * mount means any inherited viewport is presumptively the group's/region's own
   * fit (e.g. from a region -> group -> area drill-down), not a genuinely restored
   * area-specific viewport, so the area fit must always fire fresh in that case.
   */
  initialViewportWasBareAreaRef: React.MutableRefObject<boolean>;
  resolveSignal: number;

  // Setters needed by Index.tsx (deferred areaKey hydration and school restore live there)
  setSelectedArea: React.Dispatch<React.SetStateAction<AreaPoint | null>>;
  setPanToArea: React.Dispatch<React.SetStateAction<AreaPoint | null>>;
  setMapReady: React.Dispatch<React.SetStateAction<boolean>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number>>;
  setFitTick: React.Dispatch<React.SetStateAction<number>>;
  setShowLoader: React.Dispatch<React.SetStateAction<boolean>>;
  setSchoolBoardFilter: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedSchool: React.Dispatch<React.SetStateAction<SchoolResult | null>>;
  setFilters: React.Dispatch<React.SetStateAction<PropertyFilters>>;

  // Callbacks
  handleCityChange: (newCity: string) => void;
  handleSchoolSelect: (school: SchoolResult | null) => void;
  handleFiltersChange: (next: PropertyFilters) => void;
  handlePolygonDrawn: (polygon: [number, number][]) => void;
  handlePolygonCleared: () => void;
  handleAreaClick: (area: AreaPoint) => void;
  handleAreaSelect: (area: AreaPoint) => void;
  handleAreaBack: () => void;

  // Pagination
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;

  // Issue #2016 — result-scope state
  /** The committed ResultScope (AREA_SET | POLYGON | VIEWPORT | null) + the scope it replaced. */
  resultScope: CommittedResultScope;
  /**
   * A just-drawn polygon awaiting either a direct commit (no scope was
   * previously committed) or J3.3 replace-confirmation (a scope WAS already
   * committed). Null once resolved (confirmed or cancelled). Never written
   * to the URL or PropertyFilters while pending — see handlePolygonDrawn.
   */
  draftPolygon: [number, number][] | null;
  /** True while the J3.3 "Replace selected areas with this boundary?" dialog should be shown. */
  isReplaceScopeConfirmOpen: boolean;
  /** J3.3 primary action ("Replace and search") — commits draftPolygon as the new POLYGON scope. */
  handleConfirmReplaceScope: () => void;
  /** J3.3 secondary action ("Keep selected areas") — discards the draft; the prior committed scope is untouched. */
  handleCancelReplaceScope: () => void;

  // Issue #2419 (PR-1) — explicit polygon draft phase.
  /**
   * The single, explicit phase the polygon UI renders from:
   * IDLE | DRAWING | REVIEWING | INVALID | COMMITTED. `draftPolygon` and
   * `isReplaceScopeConfirmOpen` above are now DERIVED projections of this
   * value, kept on the result so existing consumers (DiscoverMapCanvas's
   * ReplaceResultScopeDialog wiring) compile and behave unchanged.
   */
  polygonDraftPhase: PolygonDraftPhase;
  /**
   * Why the current INVALID draft was not committed — a #2420 policy verdict
   * or an unobtainable one — or null in every other phase.
   */
  polygonDraftBlock: PolygonDraftBlock | null;
  /**
   * The #2420 verdict specifically, or null in every other phase AND whenever
   * the draft was merely unverifiable. Narrower than `polygonDraftBlock` on
   * purpose: a consumer rendering "draw a smaller area" must never be handed
   * a block that only means "we could not check".
   */
  polygonRejection: PolygonRejection | null;
  /** Discards a blocked draft and returns to IDLE. The committed scope is never touched. */
  handleDismissPolygonRejection: () => void;
  /**
   * Re-runs validation for a draft that could not be checked. No-op unless the
   * block is a RETRYABLE `unverified` one — a policy rejection needs a
   * different shape, and a 401 needs a signed-in shopper.
   */
  handleRetryPolygonValidation: () => void;
  /**
   * "Redraw" — discards any draft and moves to DRAWING, arming the map's draw
   * tool. PR-1 defined the transition; PR-2 makes it act.
   *
   * Issue #2419 (PR-3) — `undefined` when `isAuthenticated === false`. Draw
   * entry (not just commit) is a signed-in capability, and every consumer of
   * this seam already treats an absent handler as "render no control" — see
   * ActiveScopeChip's `onRedraw &&` guard. `undefined` while auth is still
   * loading is NOT gated here; only an explicit `false` blocks, so a
   * signed-in shopper never sees the control blink out.
   */
  handleRedrawPolygon: (() => void) | undefined;

  // Issue #2419 (PR-2) — the product-native draw-mode seam. The nonces are
  // consumed by `DrawControl`; this hook stays the single decider of WHEN
  // drawing starts, stops, or loses a vertex.
  /**
   * "Draw search area" — enters DRAWING and arms the map's draw tool.
   *
   * Issue #2419 (PR-3) — `undefined` when `isAuthenticated === false`, same
   * rationale as `handleRedrawPolygon` above: every consumer down to
   * `DrawSearchAreaEntry` already treats an absent `onDrawSearchArea` as
   * "no draw control wired" (`onDrawSearchArea?.()`, `isDrawModeWired`).
   */
  handleStartDrawPolygon: (() => void) | undefined;
  /** Cancels point placement, discarding the in-progress shape. Commits nothing. */
  handleCancelDrawPolygon: () => void;
  /** Removes the most recent vertex. Never ends draw mode. */
  handleUndoDrawVertex: () => void;
  /** Map callback — placement ended without a completed shape. */
  handleDrawModeExit: () => void;
  /** Map callback — how many vertices are placed so far. */
  handleDrawVertexCountChange: (count: number) => void;
  /** Vertices placed so far; gates the overlay's Undo affordance. */
  drawVertexCount: number;
  /** Increment-to-act signals consumed by `DrawControl`. */
  startDrawNonce: number;
  cancelDrawNonce: number;
  undoVertexNonce: number;
}

export function useDiscoverPageState({
  urlState,
  urlActions,
  isAuthenticated,
}: UseDiscoverPageStateParams): UseDiscoverPageStateResult {
  // Issue #2528 — the field-by-field projection moved to
  // selectors/urlFiltersProjection.ts and is now SHARED with
  // useDiscoverPageContext's `urlDiscoverFilters`, which had derived the same
  // list independently. Cold-load seeding is unchanged; what changed is that the
  // seed is no longer the only time the URL is read — see the POP sync below.
  const urlProjectedFilters = projectUrlFilters(urlState.filters);
  const [filters, setFilters] = useState<PropertyFilters>(() => urlProjectedFilters);
  const [selectedArea, setSelectedArea] = useState<AreaPoint | null>(null);
  const [panToArea, setPanToArea] = useState<AreaPoint | null>(null);
  const [page, setPage] = useState(0);

  // Initialize mapZoom from URL viewport when present so the correct zoom band
  // (area markers vs listing markers) is applied from the very first render.
  // Issue #2353 — the fallback rule lives in resolveEffectiveCity, not inlined here.
  const [mapZoom, setMapZoom] = useState<number>(
    urlState.viewport?.zoom ?? CITY_CONFIG[resolveEffectiveCity(urlState.city)]?.zoom ?? 11,
  );

  // Map readiness: set to true once Leaflet's MapContainer has initialised.
  const [mapReady, setMapReady] = useState(false);

  // Delayed-show: only render the full-screen spinner if the load takes > 200 ms.
  const [showLoader, setShowLoader] = useState(false);

  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
  // schoolBoardFilter: ephemeral UI state for the school-board chip strip in MapFilters.
  // This is NOT the same as filters.boardFilters (DiscoverUrlFilters), which is URL-backed
  // and persists across navigation for the school journey. schoolBoardFilter is reset to []
  // on page load and is managed entirely by MapFilters/SchoolBoardFilter UI components.
  // Do not consolidate these: the chip strip has its own transient active-state that must
  // survive filter-panel re-renders without polluting URL history.
  const [schoolBoardFilter, setSchoolBoardFilter] = useState<string[]>([]);

  // City state — lazy initializer reads from useDiscoverUrlState (which reads URL on first render).
  // Issue #2353 — the fallback rule lives in resolveEffectiveCity, not inlined here.
  const [city, setCity] = useState(() => resolveEffectiveCity(urlState.city));

  // Tick counter to force map refit when "Fit to selected areas" is clicked
  const [fitTick, setFitTick] = useState(0);

  // Tick counter to trigger map zoom reset on area deselection
  const [resetMapTick, setResetMapTick] = useState(0);

  // pendingAreaKey: holds the areaKey from URL until discoverAreasData has loaded.
  const pendingAreaKeyRef = useRef<string | null>(urlState.areaKey);
  // Incremented whenever pendingAreaKeyRef is re-armed (Forward/popstate nav) so the
  // Index.tsx resolution effect re-fires without putting urlState.areaKey in its deps
  // (which would cause a race: effect fires before the new city's discoverAreas loads).
  const [resolveSignal, setResolveSignal] = useState(0);

  // Capture the initial viewport at mount time. Used in the deferred areaKey hydration
  // effect in Index.tsx to decide whether to pan the map — avoiding adding mutable
  // urlState to that effect's dep array.
  const initialViewportRef = useRef(urlState.viewport);
  // Issue #1821 — companion signal captured at the SAME mount instant: was the
  // mount-time URL a bare area-only deep link (areaKey, no groupId/scope)? This is
  // the actual shape of the #1160/#1069 restoration flow initialViewportRef was
  // built for. When groupId/scope is also present at mount (region -> group -> area
  // drill-down, reloaded/bookmarked/shared), any inherited viewport is presumptively
  // the group's/region's own fit, not a genuinely restored area-specific one.
  const initialViewportWasBareAreaRef = useRef(
    !urlState.groupId && !urlState.scope && !!urlState.areaKey,
  );

  // ── Effects ──────────────────────────────────────────────────────────────

  // Sync local city state with URL city on browser Back/Forward navigation.
  // handleCityChange keeps them in sync on user-driven changes; this covers popstate
  // so that useDiscoverMapData re-fetches for the correct city after history traversal.
  //
  // Trigger key: [urlCity] — extracted from urlState.city so this only re-fires when the
  // URL's city actually changes. `city` (local state) is read as an in-body guard only;
  // `setCity`/`setMapZoom`/`setFilters` are stable setters; `CITY_CONFIG` is a module const.
  const urlCity = urlState.city;
  useEffect(() => {
    // Issue #2353 — the fallback rule lives in resolveEffectiveCity, not inlined here.
    const resolvedUrlCity = resolveEffectiveCity(urlCity);
    if (resolvedUrlCity !== city) {
      setCity(resolvedUrlCity);
      setMapZoom(CITY_CONFIG[resolvedUrlCity]?.zoom ?? 11);
      // localities is kept for backward compat (backend still accepts it; old URLs may contain it).
      // LocalityChipsBar was removed in #969; this field is no longer user-editable from the
      // Discover UI, but is still forwarded to backend listing queries and must be cleared on city change.
      setFilters((prev) => ({ ...prev, localities: undefined }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see trigger-key note above
  }, [urlCity]);

  // Issue #2528 — sync the visible filter state with the URL on browser Back/Forward.
  //
  // This is the filter-set counterpart of the `city` / `viewport.zoom` / `areaKey` /
  // `resultScope` syncs that already bracket it. Without it, `filters` was seeded at
  // mount and never re-read, so after a history traversal the URL said one thing
  // while BOTH the visible controls and the listings/markers request predicate
  // (`useDiscoverMapDataController` feeds this same object to `useDiscoverMapData`)
  // still said another.
  //
  // ONE-WAY, not a binding. The URL is the single owner of the axes it can express;
  // the reverse direction happens only on an explicit user commit via
  // `handleFiltersChange`. `mergeUrlFiltersIntoLocal` returns `prev` unchanged when
  // the URL-owned axes already agree, so the user-commit round trip (local write ->
  // debounced URL write -> this effect) settles on the first pass rather than
  // ping-ponging between two owners.
  //
  // Local-only axes are deliberately untouched: `schoolLat`/`schoolLon`/
  // `schoolRadiusKm` (owned by the school journey), `polygon` (a derived projection
  // of the committed ResultScope, maintained by its own effect below), and
  // `localities` (legacy, only ever cleared).
  //
  // Trigger key: the VALUE signature of the URL-owned axes, not `urlState.filters`'
  // identity — the URL domain re-parses `type=`/`beds=`/`seller=` into brand-new
  // arrays every render, so keying on identity would re-fire forever.
  //
  // NOT a draft clobber: while a live edit is in flight the 300 ms `setFiltersLive`
  // debounce means the URL has not moved yet, so the signature is unchanged and this
  // effect does not run. When the write lands, the URL matches local state and the
  // merge is a no-op.
  const urlFiltersKey = urlFilterSignature(urlProjectedFilters);
  useEffect(() => {
    setFilters((prev) => mergeUrlFiltersIntoLocal(prev, urlProjectedFilters));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see trigger-key note above
  }, [urlFiltersKey]);

  // Sync mapZoom with URL viewport.zoom when it changes (e.g., after initial hydration).
  // This handles the case where viewport hasn't hydrated by mount time, so mapZoom defaults
  // to city zoom (11), then later viewport.zoom becomes available and must update mapZoom.
  //
  // Trigger key: [urlZoom] — zoom-only by design; pan/lat/lon are deliberately NOT tracked
  // here (they don't drive mapZoom).
  const urlZoom = urlState.viewport?.zoom;
  useEffect(() => {
    if (urlZoom != null) {
      setMapZoom(urlZoom);
    }
  }, [urlZoom]);

  // Sync selectedArea with URL areaKey for browser Back/Forward navigation.
  // Back (areaKey removed): clear selectedArea. Forward (areaKey restored): re-arm
  // pendingAreaKeyRef so the Index.tsx resolution effect can re-match it against areas data.
  //
  // Trigger key: [urlAreaKey]. `selectedArea` is read as an in-body guard only (compared
  // against the fresh urlAreaKey); `setSelectedArea`/`setPanToArea`/`setResolveSignal` are
  // stable setters; `pendingAreaKeyRef` is a ref.
  const urlAreaKey = urlState.areaKey;
  useEffect(() => {
    if (!urlAreaKey) {
      if (selectedArea !== null) {
        setSelectedArea(null);
        setPanToArea(null);
      }
      pendingAreaKeyRef.current = null;
    } else if (urlAreaKey !== selectedArea?.areaKey) {
      pendingAreaKeyRef.current = urlAreaKey;
      setResolveSignal((s) => s + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see trigger-key note above
  }, [urlAreaKey]);

  // Reset page to 0 whenever filter set, city, or selected area changes so
  // paginated results always start from the beginning after a filter change.
  useEffect(() => { setPage(0); }, [filters, city, selectedArea]);

  // On cold-load, when selectedSchool is restored from URL but filters haven't been updated yet,
  // sync schoolLat, schoolLon, and schoolRadiusKm into the filters so the "Near school" chip renders.
  useEffect(() => {
    if (selectedSchool && filters.schoolLat === undefined) {
      const radiusKm = clampSchoolRadiusKm(filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM);
      setFilters((prev) => ({
        ...prev,
        schoolLat: selectedSchool.latitude,
        schoolLon: selectedSchool.longitude,
        schoolRadiusKm: radiusKm,
      }));
    }
  }, [selectedSchool, filters.schoolLat]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleCityChange = useCallback(
    (newCity: string) => {
      setCity(newCity);
      // localities is kept for backward compat; no longer user-editable after #969.
      setFilters((prev) => ({ ...prev, localities: undefined }));
      setMapZoom(CITY_CONFIG[newCity]?.zoom ?? 11);
      setSelectedArea(null);
      setPanToArea(null);
      // changeCity is atomic: single PUSH, clears journey/groupId/areaKey/viewport.
      urlActions.changeCity(newCity);
    },
    [urlActions],
  );

  const handleSchoolSelect = useCallback(
    (school: SchoolResult | null) => {
      setSelectedSchool(school);
      if (school) {
        const radiusKm = clampSchoolRadiusKm(filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM);
        setFilters((prev) => ({
          ...prev,
          schoolLat: school.latitude,
          schoolLon: school.longitude,
          schoolRadiusKm: radiusKm,
        }));
        urlActions.setSchoolJourney({
          schoolId: school.id,
          radiusKm,
          lat: school.latitude,
          lon: school.longitude,
          zoom: mapZoom,
          areaKey: school.areaKey,
        });
      } else {
        setFilters((prev) => {
          const { schoolLat: _a, schoolLon: _b, schoolRadiusKm: _c, ...rest } = prev;
          return rest;
        });
        urlActions.setSchoolParams(null);
      }
    },
    [filters.schoolRadiusKm, mapZoom, urlActions],
  );

  const handleFiltersChange = useCallback(
    (next: PropertyFilters) => {
      setFilters(next);
      if (next.schoolRadiusKm != null && selectedSchool) {
        urlActions.setSchoolParams({ schoolId: selectedSchool.id, radiusKm: next.schoolRadiusKm });
      }
      urlActions.setFiltersLive({
        propertyTypes: next.propertyTypes,
        // Issue #2431 — written alongside propertyTypes so the two always move together.
        // PropertyTypeFilter clears this when the buyer leaves the generic Commercial family,
        // and that cleared value must reach the URL in the SAME write, or the URL would retain
        // a subtype the visible controls no longer express.
        commercialSubtypes: next.commercialSubtypes,
        bedrooms: next.bedrooms,
        priceMin: next.priceMin,
        priceMax: next.priceMax,
        // Issue #2459 — write-back half of AC7. Without it the bound would live only in React
        // state: a reload or a Back step would silently drop the predicate while the results
        // stayed on screen.
        areaMinSqft: next.areaMinSqft,
        areaMaxSqft: next.areaMaxSqft,
        sellerTypes: next.sellerTypes,
        boardFilters: next.boardFilters,
        categoryFilters: next.categoryFilters,
        backOnMarket: next.backOnMarket,
        newToMarket: next.newToMarket,
        reraRegistered: next.reraRegistered,
        readyToMove: next.readyToMove,
        dateFrom: next.dateFrom ? next.dateFrom.toISOString().slice(0, 10) : undefined,
        dateTo: next.dateTo ? next.dateTo.toISOString().slice(0, 10) : undefined,
      });
    },
    [selectedSchool, urlActions],
  );

  // Issue #2016 — result-scope state. `draftPolygon` is DRAFT-ONLY local
  // state for a just-drawn polygon that has not been committed yet; it is
  // never written to PropertyFilters or the URL (J3.2: delta.history "no
  // entry"). `filters.polygon` below stays a DERIVED, read-only projection
  // of the COMMITTED resultScope (populated by the effect further down) so
  // existing consumers of PropertyFilters.polygon (map draw-shape display,
  // stats bar, filter-clear affordance) keep working unchanged — only the
  // SOURCE of that value moves from ad-hoc draw state to the canonical
  // ResultScope, per the approved plan.
  // Issue #2419 (PR-1) — the two ad-hoc booleans this replaced
  // (`draftPolygon != null`, `isReplaceScopeConfirmOpen`) could not express
  // "the draft was rejected" at all, and could represent nonsense states such
  // as "confirmation open with no draft". Both are still EXPOSED below, as
  // derived projections, so no consumer had to change.
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraftState>(IDLE_POLYGON_DRAFT);
  // Monotonic id for the in-flight #2420 probe. A shopper who finishes a
  // second polygon while the first is still being validated must not have the
  // FIRST probe's verdict applied to the SECOND draft — each probe records the
  // id it was started with and discards its own result if a newer draft has
  // since superseded it.
  const polygonProbeSeqRef = useRef(0);

  // Issue #2419 (PR-2) — the map-side draw seam. Nonces, not booleans:
  // "start drawing" is an event, and a boolean cannot express a second press
  // after a cancel because it never changes value. `drawVertexCount` is
  // reported back BY the map (leaflet-draw owns the vertices) purely so the
  // overlay's Undo can be disabled at zero points rather than offering to
  // undo something that does not exist.
  const [startDrawNonce, setStartDrawNonce] = useState(0);
  const [cancelDrawNonce, setCancelDrawNonce] = useState(0);
  const [undoVertexNonce, setUndoVertexNonce] = useState(0);
  const [drawVertexCount, setDrawVertexCount] = useState(0);

  const resultScope: CommittedResultScope = urlState.resultScope ?? { active: null, previous: null };

  /**
   * The CURRENT committed scope, readable from an async continuation.
   *
   * NOT a second copy of ResultScope — it is re-pointed at the URL-derived
   * value on every render and is never written by anything else, so the URL
   * remains the single owner (#2016). It exists only because the #2420 probe
   * is asynchronous: `handlePolygonDrawn`'s continuation would otherwise
   * decide "replace or commit directly?" from the scope as it stood when the
   * shopper finished drawing, which can be seconds stale.
   *
   * PR review at head aa5ab9e8 named the two failures that causes. If the
   * scope was null at draw time and a Back/Forward or restore brings an
   * AREA_SET back before the probe resolves, the stale-null branch commits
   * POLYGON directly and skips #2016's replacement confirmation entirely. In
   * the mirror case, a scope cleared mid-probe leaves the stale non-null
   * branch opening a replace dialog for a scope that no longer exists.
   */
  const committedScopeRef = useRef(resultScope.active);
  committedScopeRef.current = resultScope.active;

  // Keep the DERIVED filters.polygon in sync with the committed resultScope
  // (URL restore on refresh, Back/Forward, and confirm/replace commits all
  // flow through here) — never written directly by handlePolygonDrawn.
  //
  // LOAD-BEARING: the `prev.polygon === resultScope.active.coordinates`
  // identity check below (and this effect's `[resultScope.active]` dep) only
  // terminate correctly because state/url/resultScope.ts's
  // useResultScopeUrlDomain memoizes `active` BY VALUE (on the raw rscope/
  // rareas/rpoly/rvp param strings), not by re-decoding urlParams fresh every
  // render. Issue #2016 code-review Finding 4: re-decoding without that
  // memoization gives `active`/`active.coordinates` a NEW identity every
  // render even when the URL is unchanged, so this identity check would
  // never short-circuit — setFilters fires, triggers a re-render, produces a
  // new `active` again — an infinite loop. Do not "simplify" the URL domain
  // back to a plain per-render decode without re-verifying this effect still
  // terminates.
  useEffect(() => {
    setFilters((prev) => {
      if (resultScope.active?.kind === 'POLYGON') {
        return prev.polygon === resultScope.active.coordinates
          ? prev
          : { ...prev, polygon: resultScope.active.coordinates };
      }
      if (prev.polygon === undefined) return prev;
      const { polygon: _drop, ...rest } = prev;
      return rest;
    });
  }, [resultScope.active]);

  const handlePolygonDrawn = useCallback(
    (polygon: [number, number][]) => {
      // The map's draw tool (PropertyMap's DrawControl) fires this once, on
      // completion, with the finished shape — there is no separate
      // intermediate "still drawing" callback today, so completion is
      // treated as J3.2's "Use this boundary".
      //
      // Issue #2419 (PR-1) — the completed draft is now validated against
      // #2420 BEFORE anything is committed. Nothing here writes to the URL,
      // history or PropertyFilters: see validatePolygonScope.ts for why a
      // commit-then-roll-back ordering could not satisfy #2419's "an invalid
      // draft creates no committed result-scope history entry".
      // Issue #2419 (PR-1) — anonymous shoppers are refused HERE, before any
      // request is made. Drawn-area search is a signed-in capability: the
      // anonymous results path (`useDiscoverCityListings`) never sends
      // `polygon`, so an anonymous commit would show a "Drawn area" chip over
      // results that were never scoped to the drawn area.
      //
      // The ordering is load-bearing. Probing first would send a request for a
      // capability this shopper cannot use, and its 401 would be classified as
      // a transport failure — reporting "we couldn't check this area" when the
      // real answer is "this needs an account". Only an explicit `false`
      // blocks, so a caller with no auth signal is unaffected.
      if (isAuthenticated === false) {
        polygonProbeSeqRef.current++;
        setPolygonDraft({ status: 'INVALID', polygon, block: { kind: 'signed_in_required' } });
        return;
      }

      const seq = ++polygonProbeSeqRef.current;
      setPolygonDraft({
        status: 'REVIEWING',
        polygon,
        isValidating: true,
        awaitingReplaceConfirm: false,
      });

      void validatePolygonScope(city, polygon).then((validation) => {
        // A newer draft superseded this one while the probe was in flight —
        // its verdict is about a shape the shopper has already replaced.
        if (polygonProbeSeqRef.current !== seq) return;

        if (validation.outcome === 'rejected') {
          // The previous committed scope, its cards and its markers all stay
          // exactly as they were — the URL was never written.
          setPolygonDraft({
            status: 'INVALID',
            polygon,
            block: { kind: 'policy', rejection: validation.rejection },
          });
          return;
        }

        if (validation.outcome === 'unverified') {
          // FAIL CLOSED. An earlier revision proceeded here, reasoning that
          // the server would still catch a bad polygon on the real query. But
          // the probe endpoint is authenticated, so this branch is the NORMAL
          // path for an anonymous shopper rather than an edge case, and
          // proceeding put an unvalidated POLYGON into the URL and history —
          // the exact ordering the probe exists to prevent (PR review at head
          // 9f061dcc). Nothing is committed, and the block is deliberately
          // NOT reported as a #2420 rejection: the drawing may be perfectly
          // fine and the app simply could not get a verdict.
          setPolygonDraft({
            status: 'INVALID',
            polygon,
            block: { kind: 'unverified', retryable: validation.retryable },
          });
          return;
        }

        // Read the scope as it is NOW, not as it was when drawing finished —
        // see committedScopeRef's doc for the two races a stale snapshot
        // causes (PR review at head aa5ab9e8).
        if (committedScopeRef.current != null) {
          // A scope (AREA_SET or another POLYGON) is already committed —
          // surface the J3.3 replace-confirmation instead of committing
          // immediately. Filters/URL are untouched until the user confirms.
          setPolygonDraft({
            status: 'REVIEWING',
            polygon,
            isValidating: false,
            awaitingReplaceConfirm: true,
          });
        } else {
          // Nothing committed yet — going from "nothing" to POLYGON is not a
          // replacement, so commit directly without confirmation.
          urlActions.commitResultScope({ kind: 'POLYGON', coordinates: polygon });
          setPolygonDraft(IDLE_POLYGON_DRAFT);
        }
      });
    },
    [city, isAuthenticated, urlActions],
  );

  const handlePolygonCleared = useCallback(() => {
    // Abandon any in-flight probe — its verdict must not resurrect a draft
    // the shopper has just cleared.
    polygonProbeSeqRef.current++;
    setPolygonDraft(IDLE_POLYGON_DRAFT);
    // Only clear the committed scope when it is actually the POLYGON this
    // clear button applies to — never an unrelated committed AREA_SET.
    if (resultScope.active?.kind === 'POLYGON') {
      urlActions.commitResultScope(null);
    }
  }, [resultScope.active, urlActions]);

  const handleConfirmReplaceScope = useCallback(() => {
    // Guarded on `awaitingReplaceConfirm` rather than merely "a draft
    // exists": the dialog is only ever open in that sub-state, and a stray
    // confirm must never commit a draft that is still being validated or has
    // already been rejected.
    if (polygonDraft.status === 'REVIEWING' && polygonDraft.awaitingReplaceConfirm) {
      urlActions.commitResultScope({ kind: 'POLYGON', coordinates: polygonDraft.polygon });
    }
    setPolygonDraft(IDLE_POLYGON_DRAFT);
  }, [polygonDraft, urlActions]);

  const handleCancelReplaceScope = useCallback(() => {
    // Discard the draft only — the prior committed scope is never touched.
    polygonProbeSeqRef.current++;
    setPolygonDraft(IDLE_POLYGON_DRAFT);
  }, []);

  const handleDismissPolygonRejection = useCallback(() => {
    setPolygonDraft(IDLE_POLYGON_DRAFT);
  }, []);

  /**
   * Re-runs the #2420 probe for a draft that could not be checked, without
   * making the shopper redraw a shape that was never found to be wrong. Only
   * meaningful while the draft is blocked on a RETRYABLE `unverified` block —
   * a 401 will not change until the shopper signs in, and a policy rejection
   * needs a different shape, not another attempt.
   */
  const handleRetryPolygonValidation = useCallback(() => {
    if (polygonDraft.status !== 'INVALID') return;
    if (polygonDraft.block.kind !== 'unverified' || !polygonDraft.block.retryable) return;
    handlePolygonDrawn(polygonDraft.polygon);
  }, [polygonDraft, handlePolygonDrawn]);

  const handleRedrawPolygon = useCallback(() => {
    // Abandon any in-flight probe, then hand the shopper back to point
    // placement. The committed scope (if any) keeps producing results until a
    // new polygon is drawn AND accepted — Redraw alone commits nothing.
    polygonProbeSeqRef.current++;
    setPolygonDraft({ status: 'DRAWING' });
    // Issue #2419 (PR-2) — arm the map's draw tool. PR-1 could set the
    // DRAWING phase but nothing acted on it; this nonce is what makes the
    // phase real. Incremented here rather than in the map so the page state
    // stays the single decider of WHEN drawing starts.
    setStartDrawNonce((n) => n + 1);
  }, []);

  /**
   * Issue #2419 (PR-2) — "Draw search area". Same transition as Redraw; named
   * separately because the two are different product actions with different
   * entry points, and collapsing them would make the call sites lie about
   * which one the shopper took.
   */
  const handleStartDrawPolygon = useCallback(() => {
    polygonProbeSeqRef.current++;
    setPolygonDraft({ status: 'DRAWING' });
    setStartDrawNonce((n) => n + 1);
  }, []);

  /** Cancels point placement. Discards the in-progress shape; commits nothing. */
  const handleCancelDrawPolygon = useCallback(() => {
    setPolygonDraft(IDLE_POLYGON_DRAFT);
    setDrawVertexCount(0);
    setCancelDrawNonce((n) => n + 1);
  }, []);

  /** Removes the most recent vertex. Never ends draw mode, even at zero points. */
  const handleUndoDrawVertex = useCallback(() => {
    setUndoVertexNonce((n) => n + 1);
  }, []);

  /**
   * The map reporting that point placement ended without a shape — the plugin
   * aborted, or the shopper finished some other way. Returns to IDLE only if
   * we still believe we are DRAWING, so a completed polygon (which switches
   * the phase to REVIEWING first) is never clobbered by the trailing event.
   */
  const handleDrawModeExit = useCallback(() => {
    setDrawVertexCount(0);
    setPolygonDraft((prev) => (prev.status === 'DRAWING' ? IDLE_POLYGON_DRAFT : prev));
  }, []);

  const handleDrawVertexCountChange = useCallback((count: number) => {
    setDrawVertexCount(count);
  }, []);

  const handleAreaClick = useCallback(
    (area: AreaPoint) => {
      // AreaMarkerLayer owns fitBounds on marker click — do NOT set panToArea here.
      // Clear localities only — area selection subsumes locality. Preserve price/beds/type/seller/status/dates
      // so the user's refinements survive area changes.
      setFilters((prev) => {
        const { localities: _drop, ...rest } = prev;
        return rest;
      });
      setSelectedArea(area);
      // Issue #2016 — wire the existing single-area commit path into
      // ResultScope. Multi-area chip add/remove ("Edit areas") is out of
      // scope; only a size-1 AREA_SET is committed here. Ordinary area
      // navigation is not a "replace" gesture (unlike drawing a polygon
      // over an already-committed scope), so this commits directly.
      //
      // Issue #2016 code-review Finding 5 — the scope delta is passed as
      // selectArea's SECOND argument so it lands in the SAME setUrlParams
      // write/history entry as the areaKey PUSH, never as a second,
      // independent commitResultScope() call (which would race on
      // react-router-dom's functional-updater `prev` and can silently drop
      // one of the two deltas — see state/url/resultScope.ts's
      // applyResultScopeCommit doc).
      urlActions.selectArea(area.areaKey, { kind: 'AREA_SET', areaKeys: [area.areaKey] });
    },
    [urlActions],
  );

  const handleAreaSelect = useCallback(
    (area: AreaPoint) => {
      // Clear localities only — area selection subsumes locality. Preserve price/beds/type/seller/status/dates
      // so the user's refinements survive area changes.
      setFilters((prev) => {
        const { localities: _drop, ...rest } = prev;
        return rest;
      });
      setSelectedArea(area);
      setPanToArea(area);
      // Issue #2016 — see handleAreaClick's comment above.
      urlActions.selectArea(area.areaKey, { kind: 'AREA_SET', areaKeys: [area.areaKey] });
    },
    [urlActions],
  );

  const handleAreaBack = useCallback(() => {
    setSelectedArea(null);
    setPanToArea(null);
    setResetMapTick((t) => t + 1);
    // Issue #2016 — deselecting the area clears the AREA_SET scope it
    // committed. Guarded to AREA_SET only so backing out of an area
    // selection can never clobber an unrelated committed POLYGON scope.
    // Issue #2016 code-review Finding 5 — folded into deselectArea's SAME
    // REPLACE write (not a second, independent commitResultScope(null)
    // call), so Browser Back needs exactly one press, not two.
    urlActions.deselectArea(resultScope.active?.kind === 'AREA_SET' ? null : undefined);
  }, [urlActions, resultScope.active]);

  // Issue #2419 (PR-1) — derived projections. `polygonDraft` is the single
  // owner; these three are read-only views of it, kept on the result so every
  // pre-existing consumer keeps compiling and behaving identically.
  const polygonDraftPhase: PolygonDraftPhase = resolvePolygonDraftPhase(
    polygonDraft,
    resultScope.active?.kind === 'POLYGON',
  );
  const draftPolygon: [number, number][] | null =
    polygonDraft.status === 'REVIEWING' || polygonDraft.status === 'INVALID'
      ? polygonDraft.polygon
      : null;
  const isReplaceScopeConfirmOpen =
    polygonDraft.status === 'REVIEWING' && polygonDraft.awaitingReplaceConfirm;
  const polygonDraftBlock = polygonDraft.status === 'INVALID' ? polygonDraft.block : null;
  // #2420-only view, so a consumer that renders "redraw a smaller area" can
  // never be handed an unverified block and say the wrong thing.
  const polygonRejection =
    polygonDraftBlock?.kind === 'policy' ? polygonDraftBlock.rejection : null;

  return {
    filters,
    selectedArea,
    panToArea,
    mapZoom,
    mapReady,
    showLoader,
    selectedSchool,
    schoolBoardFilter,
    city,
    fitTick,
    resetMapTick,
    pendingAreaKeyRef,
    initialViewportRef,
    initialViewportWasBareAreaRef,
    resolveSignal,
    setFilters,
    setSelectedArea,
    setPanToArea,
    setMapReady,
    setMapZoom,
    setFitTick,
    setShowLoader,
    setSchoolBoardFilter,
    setSelectedSchool,
    handleCityChange,
    handleSchoolSelect,
    handleFiltersChange,
    handlePolygonDrawn,
    handlePolygonCleared,
    handleAreaClick,
    handleAreaSelect,
    handleAreaBack,
    page,
    setPage,
    resultScope,
    draftPolygon,
    isReplaceScopeConfirmOpen,
    handleConfirmReplaceScope,
    handleCancelReplaceScope,
    polygonDraftPhase,
    polygonDraftBlock,
    polygonRejection,
    handleDismissPolygonRejection,
    handleRetryPolygonValidation,
    // Issue #2419 (PR-3) — draw ENTRY (not just commit) is gated on auth.
    // Only an explicit `false` blocks; `undefined` (auth still loading) stays
    // permissive so a signed-in shopper never sees the control blink out.
    handleRedrawPolygon: isAuthenticated === false ? undefined : handleRedrawPolygon,
    handleStartDrawPolygon: isAuthenticated === false ? undefined : handleStartDrawPolygon,
    handleCancelDrawPolygon,
    handleUndoDrawVertex,
    handleDrawModeExit,
    handleDrawVertexCountChange,
    drawVertexCount,
    startDrawNonce,
    cancelDrawNonce,
    undoVertexNonce,
  };
}
