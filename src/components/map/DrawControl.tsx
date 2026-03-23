import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

interface DrawControlProps {
  onPolygonDrawn: (polygon: [number, number][]) => void;
  onPolygonCleared: () => void;
  /** When truthy, the draw control renders a visible polygon overlay. */
  polygon?: [number, number][] | null;
}

/**
 * Integrates leaflet-draw polygon drawing into the existing Leaflet map.
 * Only polygon drawing is enabled — all other tools (marker, circle, polyline, rectangle) are disabled.
 *
 * Uses `useMap()` to access the map instance from the parent `<MapContainer>`.
 */
export function DrawControl({ onPolygonDrawn, onPolygonCleared, polygon }: DrawControlProps) {
  const map = useMap();
  const drawnLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  // Mount the draw control once
  useEffect(() => {
    const drawnItems = drawnLayerRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: 'hsl(16, 65%, 45%)',
            weight: 2,
            fillOpacity: 0.15,
          },
        },
        polyline: false,
        circle: false,
        rectangle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        // Disable edit/delete toolbar — we use our own "Clear" button
        edit: false,
        remove: false,
      },
    });

    drawControlRef.current = drawControl;
    map.addControl(drawControl);

    // Listen for polygon creation
    const onCreated = (e: L.DrawEvents.Created) => {
      // Clear previous polygon before adding the new one
      drawnItems.clearLayers();
      const layer = e.layer as L.Polygon;
      drawnItems.addLayer(layer);

      const latLngs = (layer.getLatLngs()[0] as L.LatLng[]);
      const coords: [number, number][] = latLngs.map((ll) => [
        Math.round(ll.lat * 10000) / 10000,
        Math.round(ll.lng * 10000) / 10000,
      ]);
      onPolygonDrawn(coords);
    };

    map.on(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
    // Only run once on mount — callbacks are captured via refs in the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Sync external polygon state to the drawn layer (e.g., from URL params or clear)
  useEffect(() => {
    const drawnItems = drawnLayerRef.current;

    if (!polygon || polygon.length < 3) {
      drawnItems.clearLayers();
      return;
    }

    // Only update the layer if it doesn't already have the polygon
    // (prevents infinite loop when user draws → state updates → re-render)
    if (drawnItems.getLayers().length > 0) return;

    const latLngs = polygon.map(([lat, lng]) => L.latLng(lat, lng));
    const poly = L.polygon(latLngs, {
      color: 'hsl(16, 65%, 45%)',
      weight: 2,
      fillOpacity: 0.15,
    });
    drawnItems.addLayer(poly);
  }, [polygon]);

  // Clear handler — invoked by parent via the onPolygonCleared prop
  // The parent's "Clear polygon" button calls onPolygonCleared which sets polygon to null,
  // and the useEffect above clears the drawn layer.

  return null;
}
