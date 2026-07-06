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
  isMacroRegion?: boolean;
  isGroup?: boolean;
  isSelected?: boolean;
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
// ReTrends palette (literal — divIcon HTML is not processed by Tailwind/CSS-vars).
const C_PAPER = '#FFFFFF';
const C_INK = '#111827';
const C_MUTED = '#6B7280';
const C_GREY_400 = '#9CA3AF';
const C_STONE_400 = '#D7D6D0';
const C_BORDER = 'rgba(17,24,39,0.09)';
const C_COPPER = '#B05C3A';
const C_COPPER_HOVER = '#934B2D';
const C_COPPER_TINT = '#F2E8E1';
const MONO = `'Geist Mono', ui-monospace, 'SF Mono', monospace`;
const PILL_SHADOW = '0 4px 10px rgba(17,24,39,0.10), 0 2px 4px rgba(17,24,39,0.05)';

const pinSvg = (color: string) =>
  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

const gradCapSvg = (color: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;

function getShortRegionLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.endsWith(' Bangalore')) return trimmed.replace(/ Bangalore$/i, '');
  if (trimmed.endsWith(' Udupi')) return trimmed.replace(/ Udupi$/i, '');
  if (trimmed.replace(/-/g, ' ').toLowerCase() === 'university belt') return 'Uni Belt';
  if (trimmed.replace(/-/g, ' ').toLowerCase() === 'coastal strip') return 'Coastal';
  if (trimmed.replace(/-/g, ' ').toLowerCase() === 'city centre') return 'Centre';
  return trimmed.split(' ')[0] || trimmed;
}

/**
 * Premium ReTrends locality marker (Issue #1588).
 *
 * Non-zero areas read as a strong warm-card pill (copper pin + name + copper count chip
 * + tail). Zero-count areas drop to a quiet muted dashed pill so the map never feels
 * broken. In school-first (no school picked) the count chip becomes a grey "{n} schools"
 * badge. Hover lift is handled by the `.area-marker-card:hover` CSS rule (index.css).
 *
 * `data-testid="area-marker"` and the count copy are preserved for existing tests.
 */
function makeAreaCard(
  area: AreaPoint,
  opacity: number,
  journey?: DiscoverJourney | null,
  selectedSchool?: unknown,
): L.DivIcon {
  const label = escapeHtml(area.areaLabel);
  const isSchoolMode =
    journey === 'school-first' && !selectedSchool && area.schoolCount != null;
  const isZero = !isSchoolMode && area.listingCount === 0;

  let html: string;

  if (area.isMacroRegion) {
    const sel = area.isSelected;
    const bg = sel ? '#0F172A' : 'rgba(27,42,69,0.95)';
    const count = (area.listingCount ?? 0).toLocaleString();
    const shortLabel = getShortRegionLabel(area.areaLabel);

    html = `<div data-testid="area-marker" class="macro-region-bubble" style="transform:translate(-50%,-50%);font-family:inherit;opacity:${opacity};pointer-events:auto;cursor:pointer;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:86px;height:86px;border-radius:9999px;background:${bg};color:#fff;box-shadow:0 10px 25px rgba(17,24,39,0.25);border:2px solid rgba(255,255,255,0.6);transform:scale(${sel ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
        <span style="font-family:${MONO};font-size:19px;font-weight:700;line-height:1;color:#fff;">${count}</span>
        <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.95);white-space:nowrap;max-width:74px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(shortLabel)}</span>
      </div>
    </div>`;
  } else if (area.isGroup) {
    const sel = area.isSelected;
    const bg = sel ? '#0F172A' : 'rgba(27,42,69,0.95)';
    const count = (area.listingCount ?? 0).toLocaleString();

    html = `<div data-testid="area-marker" class="group-pill-marker" style="transform:translate(-50%,-50%);font-family:inherit;opacity:${opacity};pointer-events:auto;cursor:pointer;">
      <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:9999px;background:${bg};color:#fff;box-shadow:0 8px 20px rgba(17,24,39,0.25);border:2px solid rgba(255,255,255,0.6);transform:scale(${sel ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);white-space:nowrap;">
        <span style="font-size:12.5px;font-weight:700;color:rgba(255,255,255,0.95);">${label}</span>
        <span style="font-family:${MONO};font-size:12px;font-weight:700;color:#fff;background:rgba(255,255,255,0.15);padding:1px 6px;border-radius:9999px;">${count}</span>
      </div>
    </div>`;
  } else if (isZero) {
    // Quiet muted variant — dashed ring, no tail, de-emphasised.
    html = `<div data-testid="area-marker" class="area-marker-zero" style="transform:translate(-50%,-50%);font-family:inherit;opacity:${opacity * 0.66};pointer-events:auto;cursor:pointer;">
      <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;background:rgba(255,255,255,0.9);border:1px dashed ${C_STONE_400};white-space:nowrap;">
        <span style="width:6px;height:6px;border-radius:50%;border:1.5px solid ${C_GREY_400};"></span>
        <span style="font-size:11.5px;font-weight:600;color:${C_MUTED};">${label}</span>
        <span style="font-family:${MONO};font-size:10.5px;color:${C_GREY_400};">0 properties</span>
      </div>
    </div>`;
  } else {
    let chipHtml: string;
    if (isSchoolMode) {
      const n = area.schoolCount as number;
      const txt = n === 1 ? '1 school' : `${n.toLocaleString()} schools`;
      chipHtml = `<span style="display:inline-flex;align-items:center;gap:4px;font-family:${MONO};font-size:11px;font-weight:600;padding:1.5px 7px;border-radius:9999px;background:#F3F4F6;color:${C_MUTED};">${gradCapSvg(C_MUTED)}${escapeHtml(txt)}</span>`;
    } else {
      const n = area.listingCount ?? 0;
      const txt = `${n.toLocaleString()} ${n === 1 ? 'property' : 'properties'}`;
      chipHtml = `<span style="font-family:${MONO};font-size:11px;font-weight:600;padding:1.5px 7px;border-radius:9999px;background:${C_COPPER_TINT};color:${C_COPPER_HOVER};">${escapeHtml(txt)}</span>`;
    }
    html = `<div data-testid="area-marker" style="transform:translate(-50%,-118%);font-family:inherit;opacity:${opacity};pointer-events:auto;cursor:pointer;">
      <div class="area-marker-card" style="display:inline-flex;align-items:center;gap:7px;padding:6px 8px 6px 11px;border-radius:9999px;background:${C_PAPER};border:1px solid ${C_BORDER};box-shadow:${PILL_SHADOW};white-space:nowrap;transition:transform .15s cubic-bezier(.4,0,.2,1),box-shadow .15s;">
        ${pinSvg(C_COPPER)}
        <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;color:${C_INK};">${label}</span>
        ${chipHtml}
      </div>
      <div style="width:8px;height:8px;background:${C_PAPER};border-right:1px solid ${C_BORDER};border-bottom:1px solid ${C_BORDER};transform:rotate(45deg);margin:-5px auto 0;box-shadow:${PILL_SHADOW};"></div>
    </div>`;
  }

  return L.divIcon({
    className: 'area-marker',
    html,
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
      // Issue #1595 — when a group is focused, render ONLY its member areas. Non-member
      // areas are hidden entirely (previously dimmed to 0.3), so the map stays focused on
      // the selected group's context with no confusing ghost/shadow markers for unrelated
      // areas. Members always render at full opacity.
      if (effectFocusedSet && !effectFocusedSet.has(area.areaKey)) continue;
      const marker = L.marker(
        [area.geo_center_lat, area.geo_center_lon],
        { icon: makeAreaCard(area, 1.0, journey, selectedSchool) }
      );

      marker.on('click', () => {
        onAreaClick?.(area);
        const isOverviewGroupOrRegion = area.isMacroRegion || area.isGroup;
        if (area.bbox) {
          map.fitBounds(area.bbox, { padding: [40, 40], maxZoom: isOverviewGroupOrRegion ? 12 : 16 });
        } else {
          map.flyTo([area.geo_center_lat, area.geo_center_lon], isOverviewGroupOrRegion ? 12 : 13);
        }
        if (!isOverviewGroupOrRegion) {
          // If the bbox was too large to cross the area→listing zoom threshold (12),
          // bump to 13 once the animation settles so listing markers appear.
          map.once('zoomend', () => {
            if (map.getZoom() <= 12) map.setZoom(13, { animate: true });
          });
        }
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
  }, [areas, map, onAreaClick, focusedGroupAreas, journey, selectedSchool]);

  return null;
}
