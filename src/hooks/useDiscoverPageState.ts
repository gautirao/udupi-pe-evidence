import { useState, useEffect, useCallback, useRef } from 'react';
import { PropertyFilters, clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { SchoolResult } from '@/hooks/useSchoolSearch';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';

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
  const [mapZoom, setMapZoom] = useState<number>(
    urlState.viewport?.zoom ?? CITY_CONFIG[urlState.city || DEFAULT_CITY]?.zoom ?? 11,
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

  // City state — lazy initializer reads from useDiscoverUrlState (which reads URL on first render)
  const [city, setCity] = useState(() => urlState.city || DEFAULT_CITY);

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

  // ── Effects ──────────────────────────────────────────────────────────────

  // Sync local city state with URL city on browser Back/Forward navigation.
  // handleCityChange keeps them in sync on user-driven changes; this covers popstate
  // so that useDiscoverMapData re-fetches for the correct city after history traversal.
  useEffect(() => {
    const urlCity = urlState.city || DEFAULT_CITY;
    if (urlCity !== city) {
      setCity(urlCity);
      setMapZoom(CITY_CONFIG[urlCity]?.zoom ?? 11);
      // localities is kept for backward compat (backend still accepts it; old URLs may contain it).
      // LocalityChipsBar was removed in #969; this field is no longer user-editable from the
      // Discover UI, but is still forwarded to backend listing queries and must be cleared on city change.
      setFilters((prev) => ({ ...prev, localities: undefined }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.city]);

  // Sync mapZoom with URL viewport.zoom when it changes (e.g., after initial hydration).
  // This handles the case where viewport hasn't hydrated by mount time, so mapZoom defaults
  // to city zoom (11), then later viewport.zoom becomes available and must update mapZoom.
  useEffect(() => {
    if (urlState.viewport?.zoom != null) {
      setMapZoom(urlState.viewport.zoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.viewport?.zoom]);

  // Sync selectedArea with URL areaKey for browser Back/Forward navigation.
  // Back (areaKey removed): clear selectedArea. Forward (areaKey restored): re-arm
  // pendingAreaKeyRef so the Index.tsx resolution effect can re-match it against areas data.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handlePolygonDrawn = useCallback((polygon: [number, number][]) => {
    setFilters((prev) => ({ ...prev, polygon }));
  }, []);

  const handlePolygonCleared = useCallback(() => {
    setFilters((prev) => {
      const { polygon: _removed, ...rest } = prev;
      return rest;
    });
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
      urlActions.selectArea(area.areaKey);
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
      urlActions.selectArea(area.areaKey);
    },
    [urlActions],
  );

  const handleAreaBack = useCallback(() => {
    setSelectedArea(null);
    setPanToArea(null);
    setResetMapTick((t) => t + 1);
    urlActions.deselectArea();
  }, [urlActions]);

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
  };
}
