import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Circle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { PropertyListing, PropertyType, PropertyImage } from '@/hooks/usePropertyListings';
import { DrawControl } from '@/components/map/DrawControl';
import { AreaMarkerLayer, AreaPoint } from '@/components/map/AreaMarkerLayer';
import { ScaleHud } from '@/dev/ScaleHud';
import { Card } from '@/components/ui/card';

// Extended listing with images for map display
export interface PropertyListingWithImages extends PropertyListing {
  images?: PropertyImage[];
}

// Fix default marker icons in Leaflet
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Udupi district center
const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];
const DEFAULT_ZOOM = 11;

// Property type configuration
const propertyConfig: Record<PropertyType, { color: string; label: string; bgClass: string }> = {
  land: { color: '#22c55e', label: 'Land', bgClass: 'bg-green-500' },
  house: { color: '#ea580c', label: 'House', bgClass: 'bg-orange-500' },
  apartment: { color: '#8b5cf6', label: 'Apartment', bgClass: 'bg-violet-500' },
  commercial: { color: '#3b82f6', label: 'Commercial', bgClass: 'bg-blue-500' },
  commercial_building: { color: '#2563eb', label: 'Comm. Building', bgClass: 'bg-blue-600' },
  warehouse: { color: '#d97706', label: 'Warehouse', bgClass: 'bg-amber-600' },
  commercial_land: { color: '#0d9488', label: 'Comm. Land', bgClass: 'bg-teal-600' },
  other: { color: '#6b7280', label: 'Other', bgClass: 'bg-gray-500' },
};

// Module-level icon cache — avoids creating a new DivIcon object on every render.
const iconCache = new Map<PropertyType, L.DivIcon>();

const createMarkerIcon = (propertyType: PropertyType): L.DivIcon => {
  const cached = iconCache.get(propertyType);
  if (cached) return cached;
  const { color } = propertyConfig[propertyType];
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background-color: ${color};
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          transform: rotate(45deg);
          color: white;
          font-size: 12px;
          font-weight: bold;
        ">${escapeHtml(propertyType[0].toUpperCase())}</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
  iconCache.set(propertyType, icon);
  return icon;
};

export interface SchoolCircle {
  lat: number;
  lon: number;
  radiusKm: number;
  name: string;
}

interface PropertyMapProps {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  focusBounds?: [[number, number], [number, number]] | null;
  /** Current polygon coordinates from draw-on-map. Passed to DrawControl for overlay rendering. */
  polygon?: [number, number][] | null;
  /** Called when the user finishes drawing a polygon on the map. */
  onPolygonDrawn?: (polygon: [number, number][]) => void;
  /** Called when the user clears the drawn polygon. */
  onPolygonCleared?: () => void;
  /** When set, displays a circle around the selected school on the map. */
  schoolCircle?: SchoolCircle;
  /** Override map center when city changes */
  cityCenter?: [number, number];
  /** Override map zoom when city changes */
  cityZoom?: number;
  /** Area markers from the areas table (geo_center_lat/lon for placement, bbox for fitBounds). */
  areas?: AreaPoint[];
  /** Called when an area marker is clicked (in addition to the built-in bbox fitBounds). */
  onAreaClick?: (area: AreaPoint) => void;
  /** Called on every zoomend with the new zoom level. Used by zoom-band switching logic. */
  onZoomChange?: (zoom: number) => void;
  /**
   * Called after every map moveend/zoomend with the current center + zoom.
   * Intended for debounced URL viewport writes — the caller is responsible for debouncing.
   * Reports { lat, lon, zoom } rounded to map precision (not pre-rounded here).
   */
  onViewportChange?: (viewport: { lat: number; lon: number; zoom: number }) => void;
  /** When set, pans/fits the map to this area. Driven by right-panel card clicks only — never set by marker clicks. */
  panToArea?: AreaPoint | null;
  /** Incrementing tick that triggers a zoom reset to cityCenter/cityZoom. Incremented by handleAreaBack. */
  resetMapTick?: number;
  /** Called once when the Leaflet map instance has finished initialising. Use to gate data-readiness checks. */
  onReady?: () => void;
}

/**
 * Fires `onReady` once when the Leaflet map has mounted and is ready.
 * Must be rendered inside a MapContainer so useMap() resolves.
 */
function MapReadySignal({ onReady }: { onReady?: () => void }) {
  useMap(); // ensures we're inside MapContainer — the hook itself resolves the instance
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.();
  }, []); // empty deps: fire once on mount; ref always holds the current callback
  return null;
}

function ZoomWatcher({ onZoomChange }: { onZoomChange?: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onZoomChange) return;
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
}

/**
 * Fires onViewportChange after every moveend or zoomend.
 * The callback receives raw center + zoom; the caller (Index) debounces before writing to URL.
 */
function ViewportWatcher({
  onViewportChange,
}: {
  onViewportChange?: (vp: { lat: number; lon: number; zoom: number }) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!onViewportChange) return;
    const handler = () => {
      const center = map.getCenter();
      onViewportChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
    };
    // Note: pinch-zoom and programmatic zoom fire BOTH zoomend and moveend in sequence
    // (zoomend first, then moveend as Leaflet recenters), so the handler runs twice for
    // those gestures. Scroll-wheel zoom only fires zoomend (no moveend), so it fires once.
    // The caller's debounce (reportViewport → 300 ms) collapses any double-fire into one
    // URL write, so the extra call has no visible effect.
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onViewportChange]);
  return null;
}

function AreaPanner({ panToArea }: { panToArea?: AreaPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (!panToArea) return;
    if (panToArea.bbox) {
      map.fitBounds(panToArea.bbox, { padding: [40, 40], maxZoom: 16 });
    } else {
      map.flyTo([panToArea.geo_center_lat, panToArea.geo_center_lon], 13);
    }
  }, [panToArea, map]);
  return null;
}

function MapController({
  selectedListing,
  focusBounds,
  cityCenter,
  cityZoom,
  resetMapTick,
}: {
  selectedListing?: PropertyListing | null;
  focusBounds?: [[number, number], [number, number]] | null;
  cityCenter?: [number, number];
  cityZoom?: number;
  resetMapTick?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedListing?.latitude && selectedListing?.longitude) {
      map.flyTo([selectedListing.latitude, selectedListing.longitude], 15, {
        duration: 1,
      });
    }
  }, [selectedListing, map]);

  useEffect(() => {
    if (!focusBounds) return;
    const [[s, w], [n, e]] = focusBounds;
    if (s === n && w === e) {
      // Single point — fitBounds on a zero-area bounds is degenerate; use flyTo
      map.flyTo([s, w], 15, { duration: 1 });
    } else {
      map.fitBounds(focusBounds, { padding: [50, 50] });
    }
  }, [focusBounds, map]);

  useEffect(() => {
    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
  }, [cityCenter, cityZoom, map]);

  // Reset zoom to city overview when area is deselected (Back button).
  // handledTickRef tracks the last tick value we acted on so that a city change
  // (which also updates cityCenter/cityZoom deps) does not re-fire when the tick
  // has not changed. Only fires when tick strictly exceeds the last handled value.
  const handledTickRef = useRef(0);
  useEffect(() => {
    const tick = resetMapTick ?? 0;
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;
    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
  }, [resetMapTick, map, cityCenter, cityZoom]);

  return null;
}

// Marker cluster layer component
function MarkerClusterLayer({
  listings,
  onSelectListing,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50,
      disableClusteringAtZoom: 16,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size: 'small' | 'medium' | 'large' = 'small';
        let sizeNum = 36;

        if (count > 50) {
          size = 'large';
          sizeNum = 52;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 44;
        }

        return L.divIcon({
          html: `<div class="custom-marker-cluster custom-marker-cluster-${size}">${count}</div>`,
          className: '',
          iconSize: L.point(sizeNum, sizeNum),
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    validListings.forEach((listing) => {
      const marker = L.marker([listing.latitude!, listing.longitude!], {
        icon: createMarkerIcon(listing.property_type),
      });

      marker.on('click', () => {
        onSelectListing?.(listing);
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [listings, map, onSelectListing]);

  return null;
}

const schoolMarkerIcon = L.divIcon({
  className: 'school-marker',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background-color: #2563eb;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
    ">🎓</div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export function PropertyMap({
  listings,
  selectedListing,
  onSelectListing,
  focusBounds,
  polygon,
  onPolygonDrawn,
  onPolygonCleared,
  schoolCircle,
  cityCenter,
  cityZoom,
  areas = [],
  onAreaClick,
  onZoomChange,
  onViewportChange,
  panToArea,
  resetMapTick,
  onReady,
}: PropertyMapProps) {
  const listingsWithCoords = useMemo(() => {
    return listings.filter((listing) => listing.latitude && listing.longitude);
  }, [listings]);

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={cityCenter ?? UDUPI_CENTER}
        zoom={cityZoom ?? DEFAULT_ZOOM}
        className="w-full h-full rounded-lg z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapReadySignal onReady={onReady} />
        <MapController
          selectedListing={selectedListing}
          focusBounds={focusBounds}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          resetMapTick={resetMapTick}
        />
        <ZoomWatcher onZoomChange={onZoomChange} />
        <ViewportWatcher onViewportChange={onViewportChange} />
        <AreaPanner panToArea={panToArea} />
        <MarkerClusterLayer listings={listings} onSelectListing={onSelectListing} />
        {areas.length > 0 && (
          <AreaMarkerLayer areas={areas} onAreaClick={onAreaClick} />
        )}
        <ScaleHud />
        {onPolygonDrawn && onPolygonCleared && (
          <DrawControl
            polygon={polygon}
            onPolygonDrawn={onPolygonDrawn}
            onPolygonCleared={onPolygonCleared}
          />
        )}
        {schoolCircle && (
          <>
            <Circle
              center={[schoolCircle.lat, schoolCircle.lon]}
              radius={schoolCircle.radiusKm * 1000}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#2563eb',
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '6 4',
              }}
            />
            <Marker
              position={[schoolCircle.lat, schoolCircle.lon]}
              icon={schoolMarkerIcon}
            >
              <Tooltip permanent direction="top" offset={[0, -20]}>
                <span className="font-medium">{escapeHtml(schoolCircle.name)}</span>
              </Tooltip>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 left-4 z-[1000] p-3 bg-card/95 backdrop-blur">
        <p className="text-xs font-medium mb-2 text-muted-foreground">Property Types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(propertyConfig).map(([type, { label, bgClass }]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${bgClass}`} />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
        {listingsWithCoords.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
            {listingsWithCoords.length} properties on map
          </p>
        )}
      </Card>
    </div>
  );
}
