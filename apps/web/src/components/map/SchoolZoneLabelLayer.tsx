import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';

/**
 * One school-zone (area-group) label point.
 *
 * Positions are NEVER fabricated: lat/lon come either from the backend group
 * focus point (AreaGroup.focus_lat/lon) or from the bounds-centre of the group's
 * member-area coordinates (see src/lib/schoolZoneLabels.ts). Groups with no
 * resolvable position are dropped upstream and never reach this layer.
 */
export interface ZoneLabelPoint {
  groupId: string;
  label: string;
  lat: number;
  lon: number;
  /** Σ schools across the group's resolved member areas. Null when unknown. */
  schoolCount?: number | null;
}

interface SchoolZoneLabelLayerProps {
  zones: ZoneLabelPoint[];
  /** Called when a zone pill is clicked — should select the group (set groupId). */
  onZoneClick?: (groupId: string) => void;
}

/**
 * Produces a dark, high-contrast pill divIcon centred on the zone point.
 *
 * Anchoring mirrors AreaMarkerLayer: iconAnchor=[0,0] pins the container's
 * top-left at the lat/lon, and the inner div's translate(-50%,-50%) re-centres
 * the visible pill on the point regardless of its width.
 *
 * A GraduationCap glyph + optional "· N schools" subtitle keep it on-theme with
 * the school-first journey; the count is shown only when known (never faked).
 */
function makeZonePill(zone: ZoneLabelPoint): L.DivIcon {
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
  const countHtml =
    zone.schoolCount != null
      ? `<span style="opacity:0.72;font-weight:600;margin-left:2px;">· ${escapeHtml(
          zone.schoolCount === 1 ? '1 school' : `${zone.schoolCount.toLocaleString()} schools`,
        )}</span>`
      : '';

  return L.divIcon({
    className: 'school-zone-label',
    html: `<div class="upt-zone-pill" data-testid="school-zone-label" style="
      display:inline-flex;
      align-items:center;
      gap:6px;
      transform:translate(-50%,-50%);
      background:#0e1626;
      color:#ffffff;
      border-radius:999px;
      padding:7px 13px;
      box-shadow:0 4px 16px rgba(14,22,38,0.32);
      white-space:nowrap;
      cursor:pointer;
      user-select:none;
      font-family:inherit;
      font-weight:700;
      font-size:13.5px;
      letter-spacing:-0.01em;
      pointer-events:auto;
      transition:transform 120ms cubic-bezier(.4,0,.2,1), box-shadow 120ms cubic-bezier(.4,0,.2,1);
    ">${iconSvg}<span>${escapeHtml(zone.label)}</span>${countHtml}</div>`,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });
}

/**
 * SchoolZoneLabelLayer — dark zone/group labels for the school-first overview map.
 *
 * Rendered ONLY in the school-first browse/landing state (no group/area/school
 * selected) — MapDiscovery gates this. Mirrors AreaMarkerLayer's lifecycle:
 * markers are created in an effect and torn down on cleanup.
 */
export function SchoolZoneLabelLayer({ zones, onZoneClick }: SchoolZoneLabelLayerProps) {
  const map = useMap();

  useEffect(() => {
    const markers: L.Marker[] = [];

    for (const zone of zones) {
      const marker = L.marker([zone.lat, zone.lon], {
        icon: makeZonePill(zone),
        // Keep zone labels above area cards so they read clearly.
        zIndexOffset: 1000,
      });
      marker.on('click', () => onZoneClick?.(zone.groupId));
      marker.addTo(map);
      markers.push(marker);
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [zones, map, onZoneClick]);

  return null;
}
