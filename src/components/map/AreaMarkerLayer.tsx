import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

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
  /** Number of schools in this area — from /api/discover/areas. Null/undefined means not yet loaded. */
  schoolCount?: number | null;
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
  /**
   * Active journey type. When 'school-first' and no school is selected,
   * the badge shows school count (with GraduationCap icon) instead of property count.
   */
  journey?: DiscoverJourney | null;
  /**
   * Whether a school is currently selected. When truthy in school-first journey,
   * falls back to property count badge (school has already been chosen).
   */
  selectedSchool?: unknown;
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
 *
 * Badge logic:
 *   - school-first journey + no school selected + schoolCount != null → school count badge
 *   - all other cases → property count badge (existing behaviour)
 *   - Zero counts are intentionally shown ("0 schools", "0 properties").
 */
function makeAreaCard(
  area: AreaPoint,
  opacity: number,
  journey?: DiscoverJourney | null,
  selectedSchool?: unknown,
): L.DivIcon {
  let countHtml: string;
  if (journey === 'school-first' && !selectedSchool && area.schoolCount != null) {
    const n = area.schoolCount;
    const label = n === 1 ? '1 school' : `${n.toLocaleString()} schools`;
    // GraduationCap SVG inline (24×24 stroke icon, matches lucide-react visual)
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:3px;flex-shrink:0;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    countHtml = `<div style="font-size:13px;color:#6b7280;margin-top:3px;display:flex;align-items:center;">${iconSvg}${escapeHtml(label)}</div>`;
  } else {
    countHtml =
      area.listingCount != null
        ? `<div style="font-size:13px;color:#6b7280;margin-top:3px;">${area.listingCount.toLocaleString()} ${area.listingCount === 1 ? 'property' : 'properties'}</div>`
        : '';
  }

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

export function AreaMarkerLayer({
  areas,
  onAreaClick,
  focusedGroupAreas,
  journey,
  selectedSchool,
}: AreaMarkerLayerProps) {
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
        { icon: makeAreaCard(area, opacity, journey, selectedSchool) }
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
  // journey and selectedSchool change the badge content so must also be deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, map, onAreaClick, focusedGroupAreas, journey, selectedSchool]);

  return null;
}
