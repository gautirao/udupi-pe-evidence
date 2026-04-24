import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';

/**
 * One area marker point.
 * geo_center_lat/lon MUST come from the `areas` table — NEVER from area_overview_stats.centroid_*.
 * bbox from `areas` drives fitBounds on click.
 */
export interface AreaPoint {
  areaKey: string;
  areaLabel: string;
  /** From areas.geo_center_lat — placement source of truth. */
  geo_center_lat: number;
  /** From areas.geo_center_lon — placement source of truth. */
  geo_center_lon: number;
  /** From areas.bbox — used for fitBounds on click. */
  bbox: [[number, number], [number, number]] | null;
  listingCount?: number | null;
  trendDirection?: 'rising' | 'falling' | 'stable' | null;
}

interface AreaMarkerLayerProps {
  areas: AreaPoint[];
  onAreaClick?: (area: AreaPoint) => void;
}

const TREND_COLORS: Record<string, string> = {
  rising: '#16a34a',
  falling: '#dc2626',
  stable: '#2563eb',
};

function makeAreaIcon(trendDirection?: 'rising' | 'falling' | 'stable' | null): L.DivIcon {
  const color = TREND_COLORS[trendDirection ?? ''] ?? '#6b7280';
  return L.divIcon({
    className: 'area-marker',
    html: `<div style="
      width:36px;height:36px;
      background-color:${color};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:11px;font-weight:700;
    ">▲</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22],
  });
}

export function AreaMarkerLayer({ areas, onAreaClick }: AreaMarkerLayerProps) {
  const map = useMap();

  useEffect(() => {
    const markers: L.Marker[] = [];

    for (const area of areas) {
      const marker = L.marker(
        [area.geo_center_lat, area.geo_center_lon],
        { icon: makeAreaIcon(area.trendDirection) }
      );

      const countLine =
        area.listingCount != null
          ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${area.listingCount} listing${area.listingCount !== 1 ? 's' : ''}</div>`
          : '';
      marker.bindPopup(
        `<div style="min-width:110px;"><div style="font-weight:600;font-size:13px;">${escapeHtml(area.areaLabel)}</div>${countLine}</div>`,
        { maxWidth: 220, closeButton: false }
      );

      marker.on('click', () => {
        onAreaClick?.(area);
        if (area.bbox) {
          map.fitBounds(area.bbox, { padding: [40, 40] });
        }
      });

      marker.addTo(map);
      markers.push(marker);
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [areas, map, onAreaClick]);

  return null;
}
