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
  /**
   * When provided, area markers whose areaKey is NOT in this set are rendered
   * at 0.3 opacity (dimmed). Markers IN the set are at full opacity.
   * When undefined (no group selected), all markers are at full opacity.
   * Dimmed markers remain fully clickable.
   */
  focusedGroupAreas?: string[];
}

/**
 * Produces a floating white card divIcon centered exactly on the geo point.
 *
 * Anchoring: iconAnchor=[0,0] places the icon container's top-left at the lat/lon.
 * The inner div applies transform:translate(-50%,-50%) which shifts the visible card
 * so its center aligns with the geo point, regardless of card width or text length.
 *
 * opacity: 1.0 for focused/unfocused markers; 0.3 for dimmed (non-group) markers.
 * pointer-events:auto is explicit so dimmed markers remain clickable.
 */
function makeAreaCard(area: AreaPoint, opacity: number): L.DivIcon {
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
      opacity:${opacity};
      pointer-events:auto;
    ">
      <div style="font-weight:700;font-size:15px;color:#111827;line-height:1.2;">${escapeHtml(area.areaLabel)}</div>
      ${countHtml}
    </div>`,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });
}

export function AreaMarkerLayer({ areas, onAreaClick, focusedGroupAreas }: AreaMarkerLayerProps) {
  const map = useMap();

  useEffect(() => {
    const markers: L.Marker[] = [];
    // Recompute inside the effect so the closure captures the current focusedGroupAreas.
    const effectFocusedSet = focusedGroupAreas ? new Set(focusedGroupAreas) : null;

    for (const area of areas) {
      const opacity = effectFocusedSet
        ? (effectFocusedSet.has(area.areaKey) ? 1.0 : 0.3)
        : 1.0;
      const marker = L.marker(
        [area.geo_center_lat, area.geo_center_lon],
        { icon: makeAreaCard(area, opacity) }
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
  // focusedGroupAreas is an array reference — it changes identity when the group
  // changes, which is correct: re-render recreates markers with new opacity values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, map, onAreaClick, focusedGroupAreas]);

  return null;
}
