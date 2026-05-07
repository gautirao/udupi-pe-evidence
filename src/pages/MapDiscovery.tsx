import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { AreaIndicatorOverlay } from '@/components/discover/AreaIndicatorOverlay';
import { ActiveContextChips } from '@/components/discover/ActiveContextChips';
import { derivePanelContent } from '@/utils/discoverPanelState';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { CitySelect } from '@/components/discover/CitySelect';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { MapStatsBar } from '@/components/discover/MapStatsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { useAreaGroups } from '@/hooks/useAreaGroups';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { ApiError } from '@/lib/api';
import { NearSchoolSheet } from '@/components/map/NearSchoolSheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Loader2, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

// Re-exported so existing test imports from '@/pages/MapDiscovery' continue to resolve.
export { isNew } from '@/lib/isNew';

/** Zoom-band threshold: area overview rings show at zoom ≤ this; individual listing clusters show above it. */
const AREA_LAYER_MAX_ZOOM = 12;

export default function MapDiscovery() {
  const { user, isLoading: authLoading } = useAuth();
  const [urlState, urlActions] = useDiscoverUrlState();
  const isAuthenticated = !authLoading && user !== null;

  const panelContent = derivePanelContent(urlState);

  // Fetch area groups for the current city.
  // The hook's enabled guard (city.length > 0) prevents fetching on empty city.
  // Passing urlState.city directly avoids a stale-data window that the conditional ''
  // approach would create when the panel briefly re-renders before city resolves.
  const {
    data: areaGroupsData,
    isLoading: isLoadingAreaGroups,
  } = useAreaGroups(urlState.city);

  const [searchQuery, setSearchQuery] = useState(() => urlState.q);
  const [debouncedSearch, setDebouncedSearch] = useState(() => urlState.q);
  const [nearSchoolOpen, setNearSchoolOpen] = useState(false);

  // Transient map bbox — not stored in URL. Updated on pan/zoom via onBoundsChange.
  // Stored as a ref for the debounce timer and as state to trigger re-renders/refetches.
  const [mapBbox, setMapBbox] = useState<[number, number, number, number] | null>(null);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBoundsChange = useCallback(
    (bbox: [number, number, number, number]) => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = setTimeout(() => {
        setMapBbox(bbox);
      }, 300);
    },
    [],
  );

  // Cleanup bbox timer on unmount
  useEffect(() => {
    return () => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
    };
  }, []);

  // Sync local searchQuery when the URL `q` param changes (e.g. browser back/forward).
  useEffect(() => {
    if (urlState.q !== searchQuery) {
      setSearchQuery(urlState.q);
    }
    // Only react to URL changes, not local state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.q]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      urlActions.setSearchQuery(q);
    },
    [urlActions],
  );

  const {
    filters, selectedArea, panToArea, mapZoom, mapReady, showLoader,
    selectedSchool, schoolBoardFilter, city, fitTick, resetMapTick,
    pendingAreaKeyRef, initialViewportRef, resolveSignal,
    setFilters, setSelectedArea, setPanToArea, setMapReady, setMapZoom,
    setFitTick, setShowLoader, setSchoolBoardFilter, setSelectedSchool,
    handleCityChange, handleSchoolSelect, handleFiltersChange,
    handlePolygonDrawn, handlePolygonCleared,
    handleAreaClick, handleAreaSelect, handleAreaBack,
    page, setPage,
  } = useDiscoverPageState({ urlState, urlActions });

  // Reset bbox when city changes — the previous city's viewport is out-of-bounds for the new city.
  useEffect(() => {
    setMapBbox(null);
  }, [city]);

  const isCityValid = city in CITY_CONFIG;

  const {
    areasLoading, listingDataLoading, markersLoading, isLoadingAreaListings,
    isFetching,
    discoverAreas, listingsWithCoords, filteredListings,
    markerListings, areaListings, areaMarkerListings,
    topLocalities, activeFocusBounds, trendsAreaKeys,
    cityCenter, cityZoom, schoolById, schoolByIdError, error,
    totalElements, totalPages,
  } = useDiscoverMapData({
    city, selectedArea, filters, debouncedSearch,
    urlSchoolId: urlState.schoolId, isAuthenticated, fitTick,
    markersEnabled: isAuthenticated && mapZoom > AREA_LAYER_MAX_ZOOM,
    page,
    bbox: mapBbox,
  });

  // isLoading depends on both hooks and useAuth — must be computed here (Rule 1).
  const isLoading =
    authLoading || !mapReady || areasLoading || listingDataLoading
    || (isAuthenticated && mapZoom > AREA_LAYER_MAX_ZOOM && markersLoading);

  // Discover count source of truth: /api/discover/areas (public, no auth).
  // cityTotal is the sum of per-area listingCount (live LIVE+not-archived+not-duplicate).
  // Do NOT use auth-gated Supabase arrays (listingsWithCoords / filteredListings)
  // for public Discover empty-state or city count display.
  const cityTotal = useMemo(
    () => discoverAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0),
    [discoverAreas],
  );

  // Delayed-show spinner: only show after 200 ms to prevent flicker on fast loads.
  useEffect(() => {
    if (!isLoading) { setShowLoader(false); return; }
    const t = setTimeout(() => setShowLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoading, setShowLoader]);

  // School restore on cold-load — runs once schoolById resolves (exact ID lookup, not substring search).
  const urlSchoolId = urlState.schoolId;
  const urlRadiusKm = urlState.radiusKm;

  // Keep urlActions in a ref so the cleanup effect below doesn't need it in its dep array,
  // avoiding a potential stale-closure/infinite-loop when the actions object identity changes.
  const urlActionsRef = useRef(urlActions);
  urlActionsRef.current = urlActions;

  useEffect(() => {
    if (urlSchoolId && schoolById && !selectedSchool) {
      const radius = urlRadiusKm ?? 2;
      setSelectedSchool(schoolById);
      setFilters((prev) => ({ ...prev, schoolLat: schoolById.latitude, schoolLon: schoolById.longitude, schoolRadiusKm: radius }));
    }
  }, [urlSchoolId, urlRadiusKm, schoolById, selectedSchool, setSelectedSchool, setFilters]);

  // 404 cleanup — if the school no longer exists, silently drop the URL param without error toast.
  useEffect(() => {
    if (!urlSchoolId || !schoolByIdError) return;
    if (schoolByIdError instanceof ApiError && schoolByIdError.status === 404) {
      urlActionsRef.current.setSchoolParams(null);
    }
  }, [urlSchoolId, schoolByIdError]);

  // Refs kept current every render so the resolution effect can read them without
  // adding unstable objects to its dep array.
  const cityRef = useRef(city);
  cityRef.current = city;
  const urlCityRef = useRef(urlState.city ?? city);
  urlCityRef.current = urlState.city ?? city;

  // Deferred areaKey hydration — resolve once area data loads (Rule 2).
  // Lives here because it references refs from useDiscoverPageState AND data from useDiscoverMapData.
  const { deselectArea } = urlActions;
  useEffect(() => {
    if (areasLoading) return;
    const pending = pendingAreaKeyRef.current;
    if (!pending) return;
    pendingAreaKeyRef.current = null;
    const match = discoverAreas.find((a) => a.areaKey === pending);
    if (match) {
      setSelectedArea(match);
      if (!initialViewportRef.current) setPanToArea(match);
    } else if (cityRef.current !== urlCityRef.current) {
      // Local city (drives the areas query) hasn't synced with the URL city yet —
      // discoverAreas may be stale. Re-arm and wait for the re-fetch to complete.
      pendingAreaKeyRef.current = pending;
    } else {
      deselectArea();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areasLoading, discoverAreas, deselectArea, resolveSignal]);

  // ── Group-focused map behaviour (A3 #993) ────────────────────────────────────
  //
  // When a group is selected (groupId set), two things must happen:
  //   1. Fade non-member area markers (focusedGroupAreas → AreaMarkerLayer via PropertyMap)
  //   2. fitBounds to cover all member areas — but ONLY when groupId changes and no
  //      areaKey is set. When areaKey is set, the existing per-area fitBounds applies.
  //
  // fitBounds is triggered by calling setPanToArea with a synthetic AreaPoint whose
  // bbox is the union of all member areas' bboxes. This reuses PropertyMap's existing
  // AreaPanner effect (the F7 debounce) with zero new fitBounds machinery.

  const focusedGroup = urlState.groupId
    ? (areaGroupsData?.groups ?? []).find((g) => g.id === urlState.groupId) ?? null
    : null;

  const focusedGroupAreas = useMemo(
    () => focusedGroup?.area_keys,
    // Re-derive only when the selected group or the groups dataset changes.
    // Prevents AreaMarkerLayer from tearing down all markers on every background refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urlState.groupId, areaGroupsData],
  );

  // Effect: when groupId changes and there is no areaKey, fitBounds to the group members.
  // When areaKey is set, the area-level fitBounds (existing logic) takes precedence.
  // When areaKey clears while groupId remains (user navigates back), re-trigger group bounds.
  const prevGroupIdRef = useRef<string | null>(null);
  const prevAreaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Guard: wait for area data before computing bounds.
    // This must run BEFORE updating refs — on cold load with ?groupId= the effect fires
    // while areasLoading=true, and if refs were updated here the transition check would
    // see groupChanged=false on the second fire (when data has loaded) and skip fitBounds.
    if (!urlState.groupId) return;
    if (areasLoading) return;

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
      setPanToArea(bounds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.groupId, urlState.areaKey, areasLoading, discoverAreas, areaGroupsData]);

  if (!isCityValid) return <CityNotSupported city={city} />;

  const trendsHref = selectedArea
    ? `/trends?city=${city}&areaKey=${encodeURIComponent(selectedArea.areaKey)}`
    : undefined;

  const filtersContent = (
    <MapFilters
      filters={filters} onFiltersChange={handleFiltersChange}
      selectedSchool={selectedSchool} onSchoolSelect={handleSchoolSelect}
      schoolBoardFilter={schoolBoardFilter} onSchoolBoardFilterChange={setSchoolBoardFilter}
      city={city}
      trendsAreaKeys={selectedArea ? [selectedArea.areaKey] : trendsAreaKeys}
      isFetching={isFetching}
    />
  );

  // activeContextChips is memoised so its identity only changes when a relevant
  // dimension actually changes — prevents unnecessary re-renders of DiscoverRightPanel.
  const activeContextChips = useMemo(
    () => (
      <ActiveContextChips
        selectedArea={selectedArea}
        selectedSchool={selectedSchool}
        radiusKm={urlState.radiusKm}
        filters={filters}
        onClearArea={handleAreaBack}
        onClearSchool={() => {
          // Atomic four-part clear: URL school params + journey board/category filters
          // + local selectedSchool state + local PropertyFilters proximity fields.
          urlActions.setSchoolParams(null);
          urlActions.setBoardFilters([]);
          urlActions.setCategoryFilters([]);
          setSelectedSchool(null);
          setFilters((prev) => {
            const next = { ...prev };
            delete next.schoolLat;
            delete next.schoolLon;
            delete next.schoolRadiusKm;
            return next;
          });
        }}
        onClearPropertyType={() =>
          handleFiltersChange({ ...filters, propertyTypes: undefined })
        }
        onClearBhk={() =>
          handleFiltersChange({ ...filters, bedrooms: undefined })
        }
        onClearPrice={() =>
          handleFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined })
        }
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedArea, selectedSchool, urlState.radiusKm, filters, urlActions, handleAreaBack],
  );

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row relative">
        <div className="lg:w-1/2 h-64 lg:h-full relative order-1 lg:order-1">
          {showLoader && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          )}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Card className="p-6 text-center max-w-sm">
                <p className="text-destructive font-medium">Failed to load listings</p>
                <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
              </Card>
            </div>
          ) : (
            <PropertyMap
              listings={mapZoom > AREA_LAYER_MAX_ZOOM
                ? (selectedArea
                    ? (isLoadingAreaListings ? [] : (areaMarkerListings.length > 0 ? areaMarkerListings : markerListings))
                    : (isAuthenticated ? markerListings : []))
                : []}
              focusBounds={activeFocusBounds}
              polygon={filters.polygon}
              onPolygonDrawn={handlePolygonDrawn}
              onPolygonCleared={handlePolygonCleared}
              schoolCircle={selectedSchool ? {
                lat: selectedSchool.latitude, lon: selectedSchool.longitude,
                radiusKm: filters.schoolRadiusKm ?? 2, name: selectedSchool.name,
              } : undefined}
              initialCenter={urlState.viewport ? [urlState.viewport.lat, urlState.viewport.lon] : undefined}
              initialZoom={urlState.viewport?.zoom}
              cityCenter={cityCenter}
              cityZoom={cityZoom}
              areas={mapZoom <= AREA_LAYER_MAX_ZOOM ? discoverAreas : []}
              onAreaClick={handleAreaClick}
              focusedGroupAreas={mapZoom <= AREA_LAYER_MAX_ZOOM ? focusedGroupAreas : undefined}
              onZoomChange={setMapZoom}
              onViewportChange={urlActions.reportViewport}
              onBoundsChange={handleBoundsChange}
              panToArea={panToArea}
              resetMapTick={resetMapTick}
              onReady={() => setMapReady(true)}
            />
          )}

          {/* Area indicator overlay — top-left. Shows area > group > city context. */}
          <div className="absolute top-4 left-4 z-[1000]">
            <AreaIndicatorOverlay
              cityLabel={CITY_CONFIG[city]?.label ?? city}
              focusedGroup={focusedGroup}
              selectedArea={selectedArea}
            />
          </div>

          {/* City select — top-right */}
          <div className="absolute top-4 right-4 z-[1000] w-44">
            <CitySelect value={city} onChange={handleCityChange} className="bg-card shadow-sm" />
          </div>

          {/* Near a school — below city select */}
          <div className="absolute top-16 right-4 z-[1000]">
            <Button
              size="sm"
              variant={selectedSchool ? 'default' : 'outline'}
              className={selectedSchool ? 'gap-1.5 shadow-sm' : 'gap-1.5 bg-card shadow-sm'}
              onClick={() => setNearSchoolOpen(true)}
              aria-pressed={selectedSchool !== null}
            >
              <GraduationCap className="h-4 w-4" />
              Near a school
            </Button>
          </div>

          {/* City listing count — bottom-right */}
          {discoverAreas.length > 0 && (
            <div className="absolute bottom-16 right-4 z-[1000]">
              <div className="bg-card/95 rounded-lg px-4 py-2 shadow-sm text-sm border border-border">
                Showing{' '}
                <strong>{cityTotal.toLocaleString()}</strong>
                {' '}properties
              </div>
            </div>
          )}

          {isAuthenticated && (filters.polygon || !!selectedSchool) && (
            <MapStatsBar
              filters={filters} selectedSchool={selectedSchool}
              onPolygonClear={handlePolygonCleared}
            />
          )}

          <MapEmptyGuidance
            cityTotal={cityTotal}
            filters={filters} city={city} isLoading={isLoading}
          />
        </div>

        <DiscoverRightPanel
          panelContent={panelContent}
          journey={urlState.journey}
          activeContextChips={activeContextChips}
          areas={discoverAreas}
          selectedArea={selectedArea}
          areaListings={areaListings}
          isLoadingListings={isLoadingAreaListings}
          isAuthenticated={isAuthenticated}
          onAreaSelect={handleAreaSelect}
          onBack={handleAreaBack}
          onStartOver={() => urlActions.startOver()}
          onSelectJourney={(j) => urlActions.setJourney(j)}
          areaGroups={areaGroupsData?.groups ?? []}
          isLoadingAreaGroups={isLoadingAreaGroups}
          onSelectGroup={(groupId) => urlActions.selectGroup(groupId)}
          discoverAreas={discoverAreas}
          onSelectAreaKey={(areaKey) => urlActions.selectArea(areaKey)}
          filtersContent={filtersContent}
          trendsHref={trendsHref}
          isFetching={isFetching}
          isInitialLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          footerContent={isAuthenticated && !selectedArea && totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-card shrink-0">
              <Button
                variant="outline" size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages} · {totalElements.toLocaleString()} listings
              </span>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : null}
        />
      </div>
      <NearSchoolSheet
        open={nearSchoolOpen}
        onOpenChange={setNearSchoolOpen}
        selectedSchool={selectedSchool}
        onSchoolSelect={handleSchoolSelect}
        radiusKm={filters.schoolRadiusKm ?? 2}
        onRadiusChange={(km) => handleFiltersChange({ ...filters, schoolRadiusKm: km })}
        boardFilter={schoolBoardFilter}
        onBoardFilterChange={setSchoolBoardFilter}
        city={isCityValid ? city : null}
      />
    </AppLayout>
  );
}
