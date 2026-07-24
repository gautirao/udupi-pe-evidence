/**
 * ListingDetailBoundaryMap — Issue #1406
 *
 * Renders a Leaflet mini-map on the agricultural listing detail page.
 *
 * Boundary present + valid GeoJSON Polygon (≥3 coords):
 *   → Polygon with dashed green stroke + semi-transparent fill, fitBounds.
 *
 * Boundary null/empty/unparseable OR non-Polygon:
 *   → Centre-marker fallback at [lat, lng], zoom 15.
 *
 * Does NOT use Discover's AgriPolygonLayer — standalone, self-contained.
 */

import { MapContainer, TileLayer, Polygon, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fromGeoJsonString } from '@/lib/geoJsonUtils';
import { useMountEffect } from '@/hooks/useMountEffect';

export interface ListingDetailBoundaryMapProps {
  boundary?: string | null;
  lat: number;
  lng: number;
}

// Polygon path style consistent with Discover agri polygon visual
const POLYGON_PATH_OPTIONS = {
  color: '#22c55e',
  weight: 2,
  dashArray: '6 4',
  fillColor: '#22c55e',
  fillOpacity: 0.15,
};

// ─────────────────────────────────────────────────────────────────────────────
// FitBoundsOnMount: calls map.fitBounds once the map is available
// ─────────────────────────────────────────────────────────────────────────────
function FitBoundsOnMount({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  // fitBounds once after mount, using the coords present at that moment —
  // after this the user controls the map. Fires once per page load.
  useMountEffect(() => {
    map.fitBounds(coords as L.LatLngBoundsExpression, { padding: [20, 20] });
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ListingDetailBoundaryMap
// ─────────────────────────────────────────────────────────────────────────────
export function ListingDetailBoundaryMap({
  boundary,
  lat,
  lng,
}: ListingDetailBoundaryMapProps) {
  const coords = boundary ? fromGeoJsonString(boundary) : [];
  const hasPolygon = coords.length >= 3;

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      style={{ height: '300px', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {hasPolygon ? (
        <>
          <Polygon
            positions={coords as [number, number][]}
            pathOptions={POLYGON_PATH_OPTIONS}
          />
          <FitBoundsOnMount coords={coords as [number, number][]} />
        </>
      ) : (
        <Marker position={[lat, lng]} />
      )}
    </MapContainer>
  );
}
