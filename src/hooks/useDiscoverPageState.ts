import { useState, useEffect, useCallback, useRef } from 'react';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { SchoolResult } from '@/hooks/useSchoolSearch';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
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
  const [filters, setFilters] = useState<PropertyFilters>({});
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
      setFilters((prev) => ({ ...prev, localities: undefined }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.city]);

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

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleCityChange = useCallback(
    (newCity: string) => {
      setCity(newCity);
      setFilters((prev) => ({ ...prev, localities: undefined }));
      setMapZoom(CITY_CONFIG[newCity]?.zoom ?? 11);
      setSelectedArea(null);
      setPanToArea(null);
      urlActions.setCity(newCity);
    },
    [urlActions],
  );

  const handleSchoolSelect = useCallback(
    (school: SchoolResult | null) => {
      setSelectedSchool(school);
      if (school) {
        const radiusKm = filters.schoolRadiusKm ?? 2;
        setFilters((prev) => ({
          ...prev,
          schoolLat: school.latitude,
          schoolLon: school.longitude,
          schoolRadiusKm: radiusKm,
        }));
        urlActions.setSchoolParams({ schoolId: school.id, radiusKm });
      } else {
        setFilters((prev) => {
          const { schoolLat: _a, schoolLon: _b, schoolRadiusKm: _c, ...rest } = prev;
          return rest;
        });
        urlActions.setSchoolParams(null);
      }
    },
    [filters.schoolRadiusKm, urlActions],
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
        sellerType: next.sellerTypes?.length === 1 ? next.sellerTypes[0] : undefined,
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
