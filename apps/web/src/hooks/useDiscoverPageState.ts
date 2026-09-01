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

export interface UseDiscoverPageStateParams {
  urlState: DiscoverUrlState;
  urlActions: DiscoverUrlActions;
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
}

export function useDiscoverPageState({
  urlState,
  urlActions,
}: UseDiscoverPageStateParams): UseDiscoverPageStateResult {
  const [filters, setFilters] = useState<PropertyFilters>(() => {
    const f = urlState.filters;
    return {
      propertyTypes: f.propertyTypes as PropertyFilters['propertyTypes'],
      bedrooms: f.bedrooms,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      sellerTypes: f.sellerTypes,
      // Issue #1132 — boardFilters/categoryFilters must be seeded from URL on cold-load
      // so ActiveContextChips renders board/category chips when the page opens with
      // ?board= or ?category= params already in the URL.
      boardFilters: f.boardFilters,
      categoryFilters: f.categoryFilters,
      backOnMarket: f.backOnMarket,
      newToMarket: f.newToMarket,
      reraRegistered: f.reraRegistered,
      readyToMove: f.readyToMove,
      dateFrom: f.dateFrom ? new Date(f.dateFrom) : undefined,
      dateTo: f.dateTo ? new Date(f.dateTo) : undefined,
    };
  });
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
        bedrooms: next.bedrooms,
        priceMin: next.priceMin,
        priceMax: next.priceMax,
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
  const [draftPolygon, setDraftPolygon] = useState<[number, number][] | null>(null);
  const [isReplaceScopeConfirmOpen, setIsReplaceScopeConfirmOpen] = useState(false);

  const resultScope: CommittedResultScope = urlState.resultScope ?? { active: null, previous: null };

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
      setDraftPolygon(polygon);
      if (resultScope.active != null) {
        // A scope (AREA_SET or another POLYGON) is already committed —
        // surface the J3.3 replace-confirmation instead of committing
        // immediately. Filters/URL are untouched until the user confirms.
        setIsReplaceScopeConfirmOpen(true);
      } else {
        // Nothing committed yet — going from "nothing" to POLYGON is not a
        // replacement, so commit directly without confirmation.
        urlActions.commitResultScope({ kind: 'POLYGON', coordinates: polygon });
        setDraftPolygon(null);
      }
    },
    [resultScope.active, urlActions],
  );

  const handlePolygonCleared = useCallback(() => {
    setDraftPolygon(null);
    setIsReplaceScopeConfirmOpen(false);
    // Only clear the committed scope when it is actually the POLYGON this
    // clear button applies to — never an unrelated committed AREA_SET.
    if (resultScope.active?.kind === 'POLYGON') {
      urlActions.commitResultScope(null);
    }
  }, [resultScope.active, urlActions]);

  const handleConfirmReplaceScope = useCallback(() => {
    if (draftPolygon) {
      urlActions.commitResultScope({ kind: 'POLYGON', coordinates: draftPolygon });
    }
    setIsReplaceScopeConfirmOpen(false);
    setDraftPolygon(null);
  }, [draftPolygon, urlActions]);

  const handleCancelReplaceScope = useCallback(() => {
    // Discard the draft only — the prior committed scope is never touched.
    setIsReplaceScopeConfirmOpen(false);
    setDraftPolygon(null);
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
  };
}
