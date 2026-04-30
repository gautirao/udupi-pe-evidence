import { useState, useEffect, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { CitySelect } from '@/components/discover/CitySelect';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { MapStatsBar } from '@/components/discover/MapStatsBar';
import { LocalityChipsBar } from '@/components/discover/LocalityChipsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

// Re-exported so existing test imports from '@/pages/MapDiscovery' continue to resolve.
export { isNew } from '@/lib/isNew';

/** Zoom-band threshold: area overview rings show at zoom ≤ this; individual listing clusters show above it. */
const AREA_LAYER_MAX_ZOOM = 12;

export default function MapDiscovery() {
  const { user, isLoading: authLoading } = useAuth();
  const [urlState, urlActions] = useDiscoverUrlState();
  const isAuthenticated = !authLoading && user !== null;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

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

  const isCityValid = city in CITY_CONFIG;

  const {
    areasLoading, listingDataLoading, markersLoading, isLoadingAreaListings,
    discoverAreas, listingsWithCoords, filteredListings,
    markerListings, areaListings, areaMarkerListings,
    topLocalities, activeFocusBounds, trendsAreaKeys,
    cityCenter, cityZoom, schoolSearchResults, error,
    totalElements, totalPages,
  } = useDiscoverMapData({
    city, selectedArea, filters, debouncedSearch,
    urlSchoolId: urlState.schoolId, isAuthenticated, fitTick,
    markersEnabled: isAuthenticated && mapZoom > AREA_LAYER_MAX_ZOOM,
    page,
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

  // School restore on mount — runs once schoolSearchResults resolves (from mapData).
  const urlSchoolId = urlState.schoolId;
  const urlRadiusKm = urlState.radiusKm;
  useEffect(() => {
    if (urlSchoolId && schoolSearchResults && schoolSearchResults.length > 0 && !selectedSchool) {
      const match = schoolSearchResults.find((s) => s.id === urlSchoolId);
      if (match) {
        const radius = urlRadiusKm ?? 2;
        setSelectedSchool(match);
        setFilters((prev) => ({ ...prev, schoolLat: match.latitude, schoolLon: match.longitude, schoolRadiusKm: radius }));
      }
    }
  }, [urlSchoolId, urlRadiusKm, schoolSearchResults, selectedSchool, setSelectedSchool, setFilters]);

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

  if (!isCityValid) return <CityNotSupported city={city} />;

  const trendsHref = selectedArea
    ? `/trends?city=${city}&areaKey=${encodeURIComponent(selectedArea.areaKey)}`
    : undefined;

  const filtersContent = (
    <MapFilters
      filters={filters} onFiltersChange={handleFiltersChange}
      searchQuery={searchQuery} onSearchChange={setSearchQuery}
      selectedSchool={selectedSchool} onSchoolSelect={handleSchoolSelect}
      schoolBoardFilter={schoolBoardFilter} onSchoolBoardFilterChange={setSchoolBoardFilter}
      city={city} onCityChange={handleCityChange}
      allListings={listingsWithCoords} trendsAreaKeys={trendsAreaKeys}
    />
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
              onZoomChange={setMapZoom}
              onViewportChange={urlActions.reportViewport}
              panToArea={panToArea}
              resetMapTick={resetMapTick}
              onReady={() => setMapReady(true)}
            />
          )}

          {/* City chip — top-left */}
          <div className="absolute top-4 left-4 z-[1000]">
            <div className="flex items-center gap-1.5 bg-card rounded-full px-3 py-2 shadow-sm border border-border text-sm font-medium select-none">
              <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
              <span>{CITY_CONFIG[city]?.label ?? city}</span>
            </div>
          </div>

          {/* City select — top-right */}
          <div className="absolute top-4 right-4 z-[1000] w-44">
            <CitySelect value={city} onChange={handleCityChange} className="bg-card shadow-sm" />
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

          {isAuthenticated && !isLoading && topLocalities.length > 0 && (
            <LocalityChipsBar
              filters={filters} topLocalities={topLocalities}
              onFiltersChange={handleFiltersChange}
              setFitTick={setFitTick}
              urlActions={urlActions}
            />
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
          areas={discoverAreas}
          selectedArea={selectedArea}
          areaListings={areaListings}
          isLoadingListings={isLoadingAreaListings}
          isAuthenticated={isAuthenticated}
          onAreaSelect={handleAreaSelect}
          onBack={handleAreaBack}
          filtersContent={filtersContent}
          trendsHref={trendsHref}
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
    </AppLayout>
  );
}
