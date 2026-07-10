import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import {
  computeAreaMarkers,
  computeClusterChipPlacements,
  type RankableArea,
  type AreaCluster as BucketedAreaCluster,
  type ClusterChipPlacement,
} from '@/lib/map/areaMarkerBucketing';
import { AREA_LAYER_MAX_ZOOM, clusterCanSplit, hasSpatialSpread } from '@/lib/map/areaClusterSplit';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

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
   * Issue #1801 — fired ONLY from the full labelled-pin click handlers (legacy
   * areas loop AND the degraded-representatives loop) — never from the dots or
   * cluster handlers, matching exactly which markers used to move the camera
   * imperatively before this issue. The parent (MapDiscovery, via
   * useDiscoverMapData.publishCameraIntent) is the SOLE camera owner; this
   * layer no longer touches the map instance directly on area-pin click.
   */
  onAreaCameraIntent?: (area: AreaPoint) => void;
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

  // ── Issue #1798 PR-B — dense-group area-marker degradation ────────────────
  // All of the following default to OFF/undefined, preserving today's
  // render-every-area behaviour exactly for any caller that omits them
  // (school-first non-dense, agri-first, and any other existing call site).

  /**
   * When true, degrades dense area sets (design-spec-area-marker-ux.md) into
   * a spatially-representative subset + navigation area-clusters instead of
   * plotting every area's labelled pin. When false/undefined, renders exactly
   * as before this issue (no behaviour change).
   */
  enableDegradation?: boolean;
  /** The currently-selected area's key — always forced to a full labelled pin. */
  selectedAreaKey?: string | null;
  /** Areas matching the active panel search — always forced to full labelled pins. */
  searchMatchKeys?: string[];
  /** The area currently hovered/focused in the panel — always forced to a full labelled pin. */
  hoveredAreaKey?: string | null;
  /**
   * Fired when an area-cluster chip is clicked. The layer itself flies into
   * the cluster's member bounds (fly-to-split, never drilling to listings);
   * this callback additionally lets the parent filter/scroll/highlight the
   * matching panel rows (design-spec §4/§6).
   */
  onAreaClusterClick?: (cluster: AreaMarkerClusterInfo) => void;
  /**
   * Issue #1806 (FIX-4) — fired ONLY when a cluster click is splittable
   * (clusterCanSplit === true), with the cluster's union bounds and center.
   * This layer never calls map.fitBounds/flyTo/setView itself; the parent
   * (MapDiscovery, via useDiscoverMapData.publishClusterCameraIntent) is the
   * SOLE camera owner, mirroring onAreaCameraIntent's contract exactly.
   */
  onAreaClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  /**
   * Fired after each bucketing recompute with (shown, total) area counts, so
   * the parent can render the "Showing X of N areas on the map" panel note.
   */
  onMarkersComputed?: (shownCount: number, totalCount: number) => void;
}

/** Area-cluster payload surfaced to onAreaClusterClick — original AreaPoints, not the lossy RankableArea projection. */
export interface AreaMarkerClusterInfo {
  cellKey: string;
  areas: AreaPoint[];
  dominantName: string;
  /** Member AREA count — never a property/listing count sum. */
  count: number;
  anchor: { lat: number; lon: number };
  /**
   * Issue #1806 (FIX-5) — true when the cluster's union bounds have real
   * spatial spread AND the capped target zoom exceeds the current zoom (see
   * clusterCanSplit in src/lib/map/areaClusterSplit.ts). false means the
   * camera did NOT move for this click — the parent should highlight the
   * member rows in the panel instead.
   */
  splittable: boolean;
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
// ReTrends school-journey accent (index.css --plum). Restrained plum/lavender —
// used ONLY for school-first area-cluster / dot chips (design-spec §11).
const C_PLUM = '#5E5286';
// Leader-line / anchor-dot navy (design-spec §1: "navy, white ring"; plum on school layers).
const C_NAVY = '#1B2A45';
const MONO = `'Geist Mono', ui-monospace, 'SF Mono', monospace`;
const PILL_SHADOW = '0 4px 10px rgba(17,24,39,0.10), 0 2px 4px rgba(17,24,39,0.05)';

const pinSvg = (color: string) =>
  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

const gradCapSvg = (color: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;

// Redundant suffixes dropped before falling back to ellipsis truncation
// (design-spec AREA_MARKER_UX.md §5). Longest-first so "Kempapura Village"
// only drops the trailing word, not both.
const REDUNDANT_LABEL_SUFFIXES = [' Village', ' Layout', ' Nagar', ' Kempapura'];
const TRUNCATE_MAX_CHARS = 18;

/**
 * Truncates a long representative/dot label (design-spec AREA_MARKER_UX.md §5).
 * Drops a redundant suffix first, then ellipsis-truncates if still too long.
 * Callers pass `truncate=false` for selected/searched/hovered areas (never
 * truncated) and for the legacy (non-degraded) path (unaffected by this issue).
 */
function truncateAreaLabel(label: string, truncate: boolean): { text: string; full: string | null } {
  if (!truncate || label.length <= TRUNCATE_MAX_CHARS) return { text: label, full: null };
  let short = label;
  for (const suffix of REDUNDANT_LABEL_SUFFIXES) {
    if (short.length > TRUNCATE_MAX_CHARS && short.endsWith(suffix)) {
      short = short.slice(0, -suffix.length).trim();
    }
  }
  if (short.length > TRUNCATE_MAX_CHARS) {
    short = `${short.slice(0, TRUNCATE_MAX_CHARS - 1).trim()}…`;
  }
  return short === label ? { text: label, full: null } : { text: short, full: label };
}

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
  /**
   * When true, a long label may be truncated (design-spec AREA_MARKER_UX.md
   * §5) with the full name recoverable via the `title` attribute on hover/
   * focus. Callers pass `false`/omit for selected/searched/hovered areas
   * (never truncated — design-spec §2 priority 1-3) and for the legacy
   * (non-degraded) path, preserving today's behaviour exactly there.
   */
  truncate = false,
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
    const { text: repText, full: repFull } = truncateAreaLabel(area.areaLabel, truncate);
    const repLabel = escapeHtml(repText);
    const titleAttr = repFull ? ` title="${escapeHtml(repFull)}"` : '';
    html = `<div data-testid="area-marker" style="transform:translate(-50%,-118%);font-family:inherit;opacity:${opacity};pointer-events:auto;cursor:pointer;">
      <div class="area-marker-card"${titleAttr} style="display:inline-flex;align-items:center;gap:7px;padding:6px 8px 6px 11px;border-radius:9999px;background:${C_PAPER};border:1px solid ${C_BORDER};box-shadow:${PILL_SHADOW};white-space:nowrap;transition:transform .15s cubic-bezier(.4,0,.2,1),box-shadow .15s;">
        ${pinSvg(C_COPPER)}
        <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;color:${C_INK};">${repLabel}</span>
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

const stackSvg = (color: string) =>
  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="m12 2 8.5 5-8.5 5-8.5-5L12 2Z"/><path d="m3.5 12 8.5 5 8.5-5"/><path d="m3.5 17 8.5 5 8.5-5"/></svg>`;

/**
 * A demoted, non-representative area — small hover-only dot (design-spec §5).
 * Not revealed/labelled: hover reveal is handled via native marker
 * mouseover/mouseout in the effect below (setIcon swap), since this divIcon
 * HTML has no CSS pipeline behind it.
 */
function makeDotIcon(area: AreaPoint, accent: string, revealed: boolean): L.DivIcon {
  // Dots are, by construction, never forced-always (applyForcedAlways in
  // areaMarkerBucketing.ts pulls selected/searched/hovered areas out of dots
  // into representatives) — always eligible for truncation when revealed.
  const { text: dotText, full: dotFull } = truncateAreaLabel(area.areaLabel, true);
  const label = escapeHtml(dotText);
  const titleAttr = dotFull ? ` title="${escapeHtml(dotFull)}"` : '';
  const html = revealed
    ? `<div data-testid="area-marker-dot" data-revealed="true"${titleAttr} style="transform:translate(-50%,-118%);font-family:inherit;pointer-events:auto;cursor:pointer;">
        <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:9999px;background:${C_PAPER};border:1px solid ${C_BORDER};box-shadow:${PILL_SHADOW};white-space:nowrap;">
          ${pinSvg(accent)}
          <span style="font-size:11.5px;font-weight:700;color:${C_INK};">${label}</span>
        </div>
      </div>`
    : `<div data-testid="area-marker-dot" data-revealed="false" style="transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;">
        <span style="display:block;width:7px;height:7px;border-radius:50%;background:${accent};border:1.5px solid ${C_PAPER};box-shadow:0 1px 3px rgba(17,24,39,0.25);"></span>
      </div>`;
  return L.divIcon({ className: 'area-marker-dot-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

/**
 * Navigation area-cluster chip — visually distinct from the filled/solid
 * listing cluster disc (design-spec §4): soft outline chip, areas glyph,
 * NEUTRAL "+N nearby areas · Tap to expand" label (Issue #1810 AC1/AC2/AC3 —
 * N = member AREA count, never a property sum, and never a named member
 * area on the chip face; a single named area is a full labelled pin, not a
 * chip, so N is always >=2 here and "areas" is always plural).
 *
 * `offset` is the presentation-only screen-space translate from
 * computeClusterChipPlacements — the marker itself stays anchored at the
 * cluster's true centroid; only this CSS transform moves visually.
 */
function makeClusterIcon(
  cluster: BucketedAreaCluster,
  accent: string,
  offset: { dx: number; dy: number },
): L.DivIcon {
  const html = `<div data-testid="area-cluster-marker" style="transform:translate(calc(-50% + ${offset.dx}px), calc(-50% + ${offset.dy}px));font-family:inherit;pointer-events:auto;cursor:pointer;">
    <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:9999px;background:${C_PAPER};border:1.5px solid ${accent};box-shadow:${PILL_SHADOW};white-space:nowrap;">
      ${stackSvg(accent)}
      <span style="font-family:${MONO};font-size:11px;font-weight:700;color:${accent};">+${cluster.count} nearby areas</span>
      <span style="font-size:10.5px;font-weight:600;color:${C_MUTED};">&middot; Tap to expand</span>
    </div>
  </div>`;
  return L.divIcon({ className: 'area-cluster-marker-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

/**
 * Leader line + 7px anchor dot back to a chip's true centroid (design-spec
 * §1), rendered only when the chip's offset is >=16px. This divIcon is
 * anchored at the TRUE centroid lat/lon (never offset); the SVG line is drawn
 * locally from the anchor point to (dx, dy) so it visually terminates exactly
 * under the offset chip without needing a second lat/lon. Non-interactive
 * (pointer-events:none) so it never steals a click meant for a neighbour.
 */
function makeLeaderIcon(offset: { dx: number; dy: number }, color: string): L.DivIcon {
  const { dx, dy } = offset;
  const minX = Math.min(0, dx);
  const minY = Math.min(0, dy);
  const w = Math.max(0, dx) - minX;
  const h = Math.max(0, dy) - minY;
  const x1 = 0 - minX;
  const y1 = 0 - minY;
  const x2 = dx - minX;
  const y2 = dy - minY;
  const html = `<div data-testid="area-cluster-leader" style="position:relative;transform:translate(${minX}px, ${minY}px);pointer-events:none;">
    <svg width="${w}" height="${h}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none;" aria-hidden="true">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.38" />
    </svg>
    <span style="position:absolute;left:${x1 - 3.5}px;top:${y1 - 3.5}px;width:7px;height:7px;border-radius:50%;background:${color};border:1.5px solid #fff;box-shadow:0 1px 3px rgba(17,24,39,0.25);"></span>
  </div>`;
  return L.divIcon({ className: 'area-cluster-leader-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

/** Union bbox of a set of AreaPoints, falling back to their geo centers when bbox is null. */
function unionBounds(areas: AreaPoint[]): L.LatLngBoundsExpression {
  const points: [number, number][] = [];
  for (const a of areas) {
    if (a.bbox) {
      points.push(a.bbox[0], a.bbox[1]);
    } else {
      points.push([a.geo_center_lat, a.geo_center_lon]);
    }
  }
  return points;
}

export function AreaMarkerLayer({
  areas,
  onAreaClick,
  onAreaCameraIntent,
  focusedGroupAreas,
  journey,
  selectedSchool,
  enableDegradation,
  selectedAreaKey,
  searchMatchKeys,
  hoveredAreaKey,
  onAreaClusterClick,
  onAreaClusterCameraIntent,
  onMarkersComputed,
}: AreaMarkerLayerProps) {
  const map = useMap();

  // ── Legacy path (default) — renders exactly as before this issue. Every
  // area passed in gets its own full labelled pin; no density degradation.
  useEffect(() => {
    if (enableDegradation) return;
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

      // Issue #1801 — this handler no longer touches the map camera directly.
      // AreaMarkerLayer used to fire its own fitBounds/flyTo (+ a chained
      // zoomend→setZoom(13) correction) here, uncoordinated with MapController's
      // focusBounds effect — the two independent camera calls landing at
      // different times produced the reported "goes somewhere, then pulled
      // back" jitter. The parent now owns the camera: onAreaCameraIntent
      // publishes an optimistic intent synchronously in this click tick, and
      // MapController (PropertyMap.tsx) is the sole component that calls
      // map.fitBounds/flyTo/setView for area navigation.
      marker.on('click', () => {
        onAreaClick?.(area);
        onAreaCameraIntent?.(area);
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
  }, [areas, map, onAreaClick, onAreaCameraIntent, focusedGroupAreas, journey, selectedSchool, enableDegradation]);

  // ── Degraded path (Issue #1798 PR-B, opt-in) ───────────────────────────────
  // Tracks the current zoom so bucketing recomputes on zoom only (pan-invariant,
  // design-spec §3 step 5, §8). Initialised eagerly so the first render (before
  // any zoomend fires) already has a value.
  const [zoomTick, setZoomTick] = useState(() => map.getZoom());
  useEffect(() => {
    if (!enableDegradation) return;
    const onZoomEnd = () => setZoomTick(map.getZoom());
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [map, enableDegradation]);

  const areaByKey = useMemo(() => new Map(areas.map((a) => [a.areaKey, a])), [areas]);

  const bucketing = useMemo(() => {
    if (!enableDegradation) return null;
    // Issue #1806 (FIX-3) — in-layer scope guard. Mirrors the legacy path's
    // focusedGroupAreas guard (line ~321): when a group is focused, only its
    // member areas are eligible to bucket/render at all — non-member areas
    // must never appear as representatives, dots, OR cluster members. Without
    // this, a caller that (unlike MapDiscovery today) passes an unfiltered
    // `areas` prop would silently leak non-member areas into the degraded
    // view. `overviewAreas` upstream already pre-filters for MapDiscovery's
    // own call site, so this is a runtime no-op there today — see the
    // dedicated regression test that passes an intentionally UNFILTERED
    // `areas` prop to prove the guard fires independently of the caller.
    const focusedSet = focusedGroupAreas ? new Set(focusedGroupAreas) : null;
    const scopedAreas = focusedSet ? areas.filter((a) => focusedSet.has(a.areaKey)) : areas;
    if (scopedAreas.length === 0) return null;
    const rankable: RankableArea[] = scopedAreas.map((a) => ({
      id: a.areaKey,
      name: a.areaLabel,
      count: a.listingCount ?? 0,
      lat: a.geo_center_lat,
      lon: a.geo_center_lon,
    }));
    const lats = scopedAreas.map((a) => a.geo_center_lat);
    const lons = scopedAreas.map((a) => a.geo_center_lon);
    const groupBounds = {
      minLat: Math.min(...lats),
      minLon: Math.min(...lons),
      maxLat: Math.max(...lats),
      maxLon: Math.max(...lons),
    };
    const searchMatchIds =
      searchMatchKeys && searchMatchKeys.length > 0 ? new Set(searchMatchKeys) : undefined;
    const size = map.getSize();
    const project = (lat: number, lon: number) => {
      const pt = map.latLngToContainerPoint([lat, lon]);
      return { x: pt.x, y: pt.y };
    };
    const result = computeAreaMarkers({
      areas: rankable,
      project,
      viewport: { width: size.x, height: size.y },
      zoom: zoomTick,
      forced: {
        selectedId: selectedAreaKey ?? null,
        searchMatchIds,
        hoveredOrFocusedId: hoveredAreaKey ?? null,
      },
      groupBounds,
    });
    // Issue #1810 (Stage 2A) — presentation-only chip-offset pass. ONLY
    // area-cluster CHIPS may be offset (never representatives/dots); recomputed
    // in the same zoom-only-triggered useMemo as the rest of the bucketing
    // pass, so it inherits the pan-invariant / hover-invariant stability
    // contract for free. chipResult.clusters replaces result.clusters 1:1
    // (post-merge) — true anchors are untouched.
    const chipResult = computeClusterChipPlacements(result.clusters, project);
    // totalAreas = the FILTERED count, so onMarkersComputed (and the panel's
    // "Showing X of N areas" note it feeds) reports an N the panel actually
    // lists — never the unfiltered `areas.length` (Risk R6).
    return {
      ...result,
      clusters: chipResult.clusters,
      chipPlacements: chipResult.placements,
      totalAreas: scopedAreas.length,
    };
    // map is stable per PropertyMap instance; zoomTick is the deliberate
    // zoom-only recompute trigger. Pan is intentionally NOT a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableDegradation, areas, focusedGroupAreas, zoomTick, selectedAreaKey, searchMatchKeys, hoveredAreaKey]);

  const lastNotifiedRef = useRef<{ shown: number; total: number } | null>(null);
  useEffect(() => {
    if (!enableDegradation || !bucketing || !onMarkersComputed) return;
    const shown = bucketing.representatives.length;
    const total = bucketing.totalAreas;
    if (lastNotifiedRef.current?.shown === shown && lastNotifiedRef.current?.total === total) return;
    lastNotifiedRef.current = { shown, total };
    onMarkersComputed(shown, total);
  }, [enableDegradation, bucketing, onMarkersComputed]);

  useEffect(() => {
    if (!enableDegradation || !bucketing) return;
    const markers: L.Marker[] = [];
    const accent = journey === 'school-first' ? C_PLUM : C_COPPER;

    // Representatives — same visual/click contract as the legacy full pin;
    // NEVER offset (design-spec §3) — only long labels may truncate, and only
    // when the area is not forced-always (selected/searched/hovered).
    for (const rankedArea of bucketing.representatives) {
      const area = areaByKey.get(rankedArea.id);
      if (!area) continue;
      const isForced =
        area.areaKey === selectedAreaKey ||
        area.areaKey === hoveredAreaKey ||
        (searchMatchKeys?.includes(area.areaKey) ?? false);
      const marker = L.marker([area.geo_center_lat, area.geo_center_lon], {
        icon: makeAreaCard(area, 1.0, journey, selectedSchool, !isForced),
      });
      // Issue #1801 — same click contract as the legacy loop above: no direct
      // camera call here. onAreaCameraIntent publishes the optimistic intent;
      // MapController is the sole camera owner.
      marker.on('click', () => {
        onAreaClick?.(area);
        onAreaCameraIntent?.(area);
      });
      marker.addTo(map);
      markers.push(marker);
    }

    // Dots — demoted low-priority areas. Hover/focus reveals the full label
    // via a native marker icon swap (this divIcon HTML has no CSS pipeline).
    for (const rankedArea of bucketing.dots) {
      const area = areaByKey.get(rankedArea.id);
      if (!area) continue;
      const marker = L.marker([area.geo_center_lat, area.geo_center_lon], {
        icon: makeDotIcon(area, accent, false),
      });
      marker.on('mouseover', () => marker.setIcon(makeDotIcon(area, accent, true)));
      marker.on('mouseout', () => marker.setIcon(makeDotIcon(area, accent, false)));
      marker.on('click', () => {
        marker.setIcon(makeDotIcon(area, accent, true));
        onAreaClick?.(area);
      });
      marker.addTo(map);
      markers.push(marker);
    }

    // Area clusters — navigation chips (design-spec §4). Click flies into the
    // member bounds to split, and NEVER drills to listings. The chip marker
    // itself stays anchored at the cluster's TRUE centroid — computeClusterChipPlacements
    // only supplies a presentation-only CSS offset (Issue #1810 Stage 2A); a
    // leader line + anchor dot render whenever that offset is >=16px.
    for (const cluster of bucketing.clusters) {
      const clusterAreas = cluster.areas
        .map((a) => areaByKey.get(a.id))
        .filter((a): a is AreaPoint => a != null);
      if (clusterAreas.length === 0) continue;
      const anchor: [number, number] = [cluster.anchor.lat, cluster.anchor.lon];
      const placement: ClusterChipPlacement = bucketing.chipPlacements[cluster.cellKey] ?? {
        offsetX: 0,
        offsetY: 0,
        showLeader: false,
      };
      const marker = L.marker(anchor, {
        icon: makeClusterIcon(cluster, accent, { dx: placement.offsetX, dy: placement.offsetY }),
      });
      marker.on('click', () => {
        // Issue #1806 (FIX-4/FIX-5) — this layer never touches the map camera
        // directly. The removed `map.fitBounds(..., { maxZoom: 16 })` call was
        // exactly what landed the user ABOVE AREA_LAYER_MAX_ZOOM, tearing down
        // this degradation layer, dropping focusedGroupAreas, and flipping
        // markersEnabled true — producing the reported empty map. Instead:
        // compute the same splittability MapController will actually apply
        // (getBoundsZoom mirrors MapController's own call, capped to the SAME
        // AREA_LAYER_MAX_ZOOM MapController's 'overview' branch uses), and
        // publish a CameraIntent ONLY when the cluster can meaningfully split.
        const bounds = L.latLngBounds(unionBounds(clusterAreas));
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const cappedTargetZoom = Math.min(
          AREA_LAYER_MAX_ZOOM,
          map.getBoundsZoom(bounds, false, L.point(40, 40)),
        );
        const splittable = clusterCanSplit(
          map.getZoom(),
          cappedTargetZoom,
          hasSpatialSpread([southWest.lat, southWest.lng], [northEast.lat, northEast.lng]),
        );
        if (splittable) {
          const center = bounds.getCenter();
          onAreaClusterCameraIntent?.(
            [[southWest.lat, southWest.lng], [northEast.lat, northEast.lng]],
            [center.lat, center.lng],
          );
        }
        // Fired unconditionally — splittable=true lets the parent know a
        // camera move is under way; splittable=false is the parent's signal
        // to hold the camera still and highlight + scroll the member rows
        // in the panel instead (the camera never moves in that case).
        onAreaClusterClick?.({
          cellKey: cluster.cellKey,
          areas: clusterAreas,
          dominantName: cluster.dominantName,
          count: cluster.count,
          anchor: cluster.anchor,
          splittable,
        });
      });
      marker.addTo(map);
      markers.push(marker);

      if (placement.showLeader) {
        const leaderColor = journey === 'school-first' ? C_PLUM : C_NAVY;
        const leaderMarker = L.marker(anchor, {
          icon: makeLeaderIcon({ dx: placement.offsetX, dy: placement.offsetY }, leaderColor),
          interactive: false,
          keyboard: false,
        });
        leaderMarker.addTo(map);
        markers.push(leaderMarker);
      }
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [
    enableDegradation,
    bucketing,
    areaByKey,
    map,
    onAreaClick,
    onAreaCameraIntent,
    onAreaClusterClick,
    onAreaClusterCameraIntent,
    journey,
    selectedSchool,
    selectedAreaKey,
    hoveredAreaKey,
    searchMatchKeys,
  ]);

  return null;
}
