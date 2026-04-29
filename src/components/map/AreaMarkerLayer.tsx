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

/**
 * Produces a floating white card divIcon centered exactly on the geo point.
 *
 * Anchoring: iconAnchor=[0,0] places the icon container's top-left at the lat/lon.
 * The inner div applies transform:translate(-50%,-50%) which shifts the visible card
 * so its center aligns with the geo point, regardless of card width or text length.
 */
function makeAreaCard(area: AreaPoint): L.DivIcon {
  const countHtml =
    area.listingCount != null
      ? `<div style="font-size:13px;color:#6b7280;margin-top:3px;">${area.listingCount.toLocaleString()} properties</div>`
      : '';

  return L.divIcon({
    className: 'area-marker',
    html: `<div data-testid="area-marker" style="
      display:inline-block;
      transform:translate(-50%,-50%);
      background:white;
      border-radius:12px;
      padding:10px 16px;
      box-shadow:0 2px 12px rgba(0,0,0,0.15);
      white-space:nowrap;
      cursor:pointer;
      user-select:none;
      font-family:inherit;
    ">
      <div style="font-weight:700;font-size:15px;color:#111827;line-height:1.2;">${escapeHtml(area.areaLabel)}</div>
      ${countHtml}
    </div>`,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });
}

export function AreaMarkerLayer({ areas, onAreaClick }: AreaMarkerLayerProps) {
  const map = useMap();

  useEffect(() => {
    const markers: L.Marker[] = [];

    for (const area of areas) {
      const marker = L.marker(
        [area.geo_center_lat, area.geo_center_lon],
        { icon: makeAreaCard(area) }
      );

      marker.on('click', () => {
        onAreaClick?.(area);
        if (area.bbox) {
          map.fitBounds(area.bbox, { padding: [40, 40], maxZoom: 16 });
        } else {
          map.flyTo([area.geo_center_lat, area.geo_center_lon], 13);
        }
        // If the bbox was too large to cross the area→listing zoom threshold (12),
        // bump to 13 once the animation settles so listing markers appear.
        map.once('zoomend', () => {
          if (map.getZoom() <= 12) map.setZoom(13, { animate: true });
        });
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
