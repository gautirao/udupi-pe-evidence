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
import { compassPointFor, computeCompassLayout } from '@/lib/map/regionCompassLayout';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import {
  formatListingCount,
  type AreasNavigationChild,
} from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { NodeLevelKind } from '@/features/discover/navigation/nodeLevelKind';
import {
  presentStructuralLevel,
  partitionMembersByJourney,
  type StructuralLevelIdentity,
  type DiscoverJourney as AreasEligibilityJourney,
} from '@/features/discover/navigation/journeyVisibility';
import {
  clusterVisibleAreaMembers,
  boundsOfMembers,
  isUsableCentroid,
  AREA_CARD_FOOTPRINT_WIDTH_PX,
  type ClusterableAreaMember,
  type ProjectFn as AreaClusterProjectFn,
} from '@/features/discover/navigation/areaClustering';
import { presentClusterRepresentatives } from '@/features/discover/navigation/representativeNames';

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
    const count = area.listingCount ?? 0;
    const countText = count.toLocaleString();
    const noun = count === 1 ? 'property' : 'properties';
    const shortLabel = getShortRegionLabel(area.areaLabel);
    const ariaLabel = escapeHtml(
      `${area.areaLabel}, ${countText} ${noun}. Activate to zoom into the region.`,
    );

    // Discover map marker redesign — circular region bubble (short name +
    // large mono count + properties label) with a "Tap to zoom in ›" pill
    // revealed on hover/keyboard-focus (index.css .dp-region rules). The
    // outer .dp-region wrapper is the anchor (translate(-50%,-50%), never
    // scaled); only .dp-region-core scales on hover/focus so the caption
    // below it never shifts. tabindex/role/aria-label make the bubble a
    // real keyboard-operable control — Leaflet's marker click listener is
    // bound to this element's subtree and bubbles normally.
    html = `<div data-testid="area-marker" class="macro-region-bubble dp-region" tabindex="0" role="button" aria-label="${ariaLabel}" style="position:relative;width:92px;height:92px;transform:translate(-50%,-50%);font-family:inherit;opacity:${opacity};pointer-events:auto;cursor:pointer;">
      <div class="dp-region-core" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:92px;height:92px;border-radius:9999px;background:${bg};color:#fff;box-shadow:0 10px 25px rgba(17,24,39,0.25);border:2px solid rgba(255,255,255,${sel ? '0.92' : '0.6'});transform:scale(${sel ? 1.06 : 1});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s cubic-bezier(.4,0,.2,1),border-color .18s;">
        <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;line-height:1.1;color:rgba(255,255,255,0.95);white-space:nowrap;max-width:76px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(shortLabel)}</span>
        <span style="font-family:${MONO};font-size:18px;font-weight:700;line-height:1;color:#fff;margin-top:1px;">${countText}</span>
        <span style="font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;opacity:.82;color:#fff;">${noun}</span>
      </div>
      <div class="dp-region-cap" aria-hidden="true" style="position:absolute;top:100%;left:50%;margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;background:${C_PAPER};box-shadow:${PILL_SHADOW};font-size:10.5px;font-weight:700;color:${C_COPPER_HOVER};white-space:nowrap;pointer-events:none;">Tap to zoom in <span style="font-size:12px;line-height:1;">&#8250;</span></div>
    </div>`;
  } else if (area.isGroup) {
    const sel = area.isSelected;
    const bg = sel ? '#0F172A' : 'rgba(27,42,69,0.95)';
    const count = area.listingCount ?? 0;
    const countText = count.toLocaleString();
    const noun = count === 1 ? 'property' : 'properties';
    const nounUpper = count === 1 ? 'PROPERTY' : 'PROPERTIES';
    const ariaLabel = escapeHtml(
      `${area.areaLabel}, ${countText} ${noun}. Activate to zoom into this area group.`,
    );

    // Discover map marker redesign — area-group "map card" (compact vertical
    // dark card: wrapped group name, prominent mono count) with a "Tap to
    // zoom in ›" pill revealed on hover/keyboard-focus, matching the
    // macro-region bubble's .dp-region-cap pattern exactly (index.css
    // .area-group-cap rules). .area-group-card is the anchor wrapper (base
    // transform: translate(-50%,-50%), never scaled — mirrors .dp-region for
    // macro regions above); hover/focus/selected emphasis applies to the
    // inner .area-group-card-core only, so the anchor point never shifts.
    // tabindex/role/aria-label make the card a real keyboard-operable
    // control — Leaflet's marker click listener is bound to this element's
    // subtree and bubbles normally.
    html = `<div data-testid="area-marker" class="area-group-card" tabindex="0" role="button" aria-label="${ariaLabel}" style="position:relative;transform:translate(-50%,-50%);font-family:inherit;opacity:${opacity};pointer-events:auto;cursor:pointer;">
      <div class="area-group-card-core" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:100px;max-width:140px;padding:10px 12px;border-radius:12px;background:${bg};color:#fff;box-shadow:0 8px 20px rgba(17,24,39,0.25);border:${sel ? '2px' : '1.5px'} solid rgba(255,255,255,${sel ? '0.92' : '0.6'});transform:scale(${sel ? 1.04 : 1});transition:transform .15s cubic-bezier(.4,0,.2,1),box-shadow .15s,border-color .15s;">
        <span style="font-size:13.5px;font-weight:700;line-height:1.25;text-align:center;color:rgba(255,255,255,0.97);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${label}</span>
        <span style="font-family:${MONO};font-size:16px;font-weight:700;line-height:1;color:#fff;margin-top:2px;">${countText}</span>
        <span style="font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,0.8);">${nounUpper}</span>
      </div>
      <div class="area-group-cap" aria-hidden="true" style="position:absolute;top:100%;left:50%;margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;background:${C_PAPER};box-shadow:${PILL_SHADOW};font-size:10.5px;font-weight:700;color:${C_COPPER_HOVER};white-space:nowrap;pointer-events:none;">Tap to zoom in <span style="font-size:12px;line-height:1;">&#8250;</span></div>
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
function unionBounds(areas: AreaPoint[]): L.LatLngExpression[] {
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

/**
 * ── Canonical Areas hierarchy — Direction destination markers ─────────────
 * Issue #1956 PR 2 (Slice 3, map half). Covers AC3.1/AC3.2/AC3.3, and the
 * map-click half of AC3.9.
 *
 * Renders the CURRENT node's direct DIRECTION children (`levelKind ===
 * 'directions'`, i.e. the city root) as positioned map destination cards —
 * the map-side counterpart to `NavigationChildCard` (panel).
 *
 * ── WHY ONLY 'directions' TODAY (documented data-gap, not an oversight) ──
 * `NavigationChildSummary` (`useAreasNavigationJourney.ts`) carries only
 * `nodeKey` / `nodeType` / `displayLabel` / `displayOrder` — no per-child
 * lat/lon or bbox exists anywhere in the resolve/counts payload. A DIRECTION
 * child's `nodeKey` is server-given in the `d:<code>` shape (e.g. `d:n`,
 * `d:se`, `d:central` — see `navigationCommandMatrix.test.ts` /
 * `normalize.ts`), so its presentation position CAN be derived exactly the
 * way the legacy macro-region markers in `AreaMarkerLayer` above already do:
 * read the code (never assemble one), map it through
 * `regionCompassLayout.ts`'s compass circle. CLUSTER ("Local Destination")
 * and AREA children carry no equivalent server-given position hint in this
 * payload, so this component deliberately renders nothing for those levels
 * rather than fabricating a coordinate. Wiring a real position source for
 * those (e.g. cross-referencing the existing area geo dataset by areaKey) is
 * follow-up work, not built here.
 *
 * ── IDENTITY (AC3.9 / T3) ──
 * `onSelect` is the caller's `useAreasNavigationJourney().selectNode`
 * reference, forwarded UNCHANGED — never wrapped in a new closure — so a map
 * marker's click and a panel card's `onSelect` prop are provably the same
 * function, not two call sites that merely look alike.
 *
 * ── COMPOSITION ──
 * Primary text = `displayLabel` (Task 3 / AC3.2 ruling: no richer per-child
 * name exists in-payload today — see module doc on `useAreasNavigationJourney`
 * — canonical `displayLabel` satisfies AC3.2 as literally written). Count
 * copy reuses `presentStructuralLevel` — the SAME locked-copy function
 * `NavigationChildCard` calls — so map and panel can never show two
 * different strings for the same node. No `+N` form; distinct card shape/
 * accent (copper pill) from the navy circular listing-cluster badge
 * (PropertyMap.tsx) and from the legacy plain `AreaPoint` pins above.
 */
export interface AreaDestinationMarkerLayerProps {
  /** The currently-resolved node, by reference — same object the panel consumes (T3). `null` while loading/disabled. */
  node: NavigationNodeResponse | null;
  /** node's next-level kind. Markers render only when this is 'directions' (see module doc). */
  levelKind: NodeLevelKind;
  /** node's direct children, already bounded/ordered by useAreasNavigationJourney — never re-derived here. */
  children: AreasNavigationChild[];
  /** The single selection action — same reference every render (AC3.9). */
  onSelect: (nodeKey: string) => void;
  /** The currently-selected destination's nodeKey, for the pressed/active visual state. */
  selectedNodeKey?: string | null;
  /** The currently hovered/focused destination's nodeKey — panel<->map sync by node_key. */
  hoveredNodeKey?: string | null;
  /** Fired on marker hover/focus enter (nodeKey) and leave (null). */
  onHoverChange?: (nodeKey: string | null) => void;

  // ── Issue #1956 PR 3 (Slice 4) — AREA / Local-Destination real geography ──
  // Everything below is additive and only consumed when `levelKind` is
  // `'areas'` or `'clusters'`; the 'directions' compass path above is
  // untouched by any of it.

  /** Active journey badge, mirroring `AreaMarkerLayer`'s own prop — school-first drives Schools-journey eligibility/ranking here too. */
  journey?: DiscoverJourney | null;
  /** Whether a school is currently selected (school-first journey only) — passed through for parity, unused by the eligibility dimension itself. */
  selectedSchool?: unknown;
  /**
   * Fired ONLY when a client-side VISUAL AREA CLUSTER (dense-AREA grouping,
   * never a real node) is clicked, with the bounding box of its member
   * centroids (already padded by the caller's own convention — this layer
   * hands back the raw union bounds) and its centre. Mirrors
   * `onAreaClusterCameraIntent`'s contract exactly: this layer never calls
   * `map.fitBounds`/`flyTo` itself. Clicking a visual cluster does NOT call
   * `onSelect` — it is not a real node, so it must never change `node=`.
   */
  onAreaVisualClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  /**
   * Controlled cluster-focus membership (the `areaKey`s of the currently
   * focused visual cluster's members), for a parent that lifts this state to
   * share it with the panel (AC4.12 — map and panel must expose IDENTICAL
   * visible sets). When omitted, the layer manages focus with its own
   * internal state instead — fully functional standalone, but with no
   * cross-component guarantee. `null` means no cluster is focused.
   */
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  /**
   * Fired whenever this layer's OWN focus decision changes — a cluster click
   * (sets the member `areaKey` list), an explicit clear (`null`), or an
   * automatic re-resolution clearing a focus whose members are no longer all
   * visible (see the module doc on the areas-effect below). A parent that
   * supplies `focusedClusterMemberAreaKeys` should feed this callback's value
   * back into that prop to keep the map and panel in lock-step.
   */
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
}

const DESTINATION_ACCENT = C_COPPER;
const DESTINATION_ACCENT_ACTIVE = C_COPPER_HOVER;

/**
 * Reads (never constructs) the compass code embedded in a server-given
 * DIRECTION nodeKey (`d:<code>`) purely to pick a presentation slot on the
 * compass circle — mirrors the exact rationale documented in
 * `regionCompassLayout.ts`. An unrecognised code falls back to the layout
 * centre via `compassPointFor`'s own fallback, never throws.
 */
function compassCodeFromDirectionNodeKey(nodeKey: string): string {
  const suffix = nodeKey.startsWith('d:') ? nodeKey.slice(2) : nodeKey;
  return suffix.toUpperCase();
}

function makeDestinationCard(
  child: AreasNavigationChild,
  isSelected: boolean,
  isHovered: boolean,
): L.DivIcon {
  // UD-3 (fix-cycle-3) — a real Bangalore/Udupi DIRECTION or CLUSTER label
  // can run well past this card's ~96px footprint with white-space:nowrap
  // and no max-width, expanding the card and compounding UD-1's overlap risk.
  // Reuse the existing `truncateAreaLabel` helper (never a second
  // implementation); the ACCESSIBLE name below always carries the full
  // untruncated label via `ariaLabelName`, even when the visible text and the
  // `title` tooltip are shortened.
  const { text: shortLabel, full: fullLabel } = truncateAreaLabel(child.displayLabel, true);
  const label = escapeHtml(shortLabel);
  const ariaLabelName = escapeHtml(child.displayLabel);
  const titleAttr = fullLabel ? ` title="${escapeHtml(fullLabel)}"` : '';
  const identity: StructuralLevelIdentity = {
    nodeKey: child.nodeKey,
    nodeType: child.nodeType,
    displayLabel: child.displayLabel,
    parentNodeKey: null,
    displayOrder: child.displayOrder,
  };
  // BLOCKING FIX (count_display_defect_2026_07_29) — mirrors NavigationChildCard
  // exactly, reading the SAME shared `child.matchingAreaCount` field (never
  // `child.listingCount`) for the areas-with-matches line, so map and panel
  // can never diverge or independently re-derive the number. `null` means the
  // exact count is not derivable from currently available data — omit the
  // areas line rather than mislabel the listing total as an area count.
  //
  // count_display_defect_2026_07_29 (pass 4 follow-up): the areas line being
  // unavailable must never suppress the journey-aware LISTING count too —
  // mirrors NavigationChildCard's showListingsLine/areasLabel/listingsLabel
  // split exactly (see that component's doc for the full rule), reading the
  // SAME `formatListingCount` helper so map and panel never diverge on
  // singular/plural copy either.
  const presentation = child.matchingAreaCount == null
    ? null
    : presentStructuralLevel(identity, child.matchingAreaCount);
  const areasLabel = presentation ? escapeHtml(presentation.countLabel) : null;
  const showListingsLine = !presentation?.isZeroContent;
  const listingsLabel = showListingsLine ? escapeHtml(formatListingCount(child.listingCount)) : null;
  // Case (c) of the three-case school-count rule (locked): a canonical
  // structural (DIRECTION/CLUSTER) marker shows the backend-provided child
  // schoolCount AS-IS — never summed, never re-derived. `null` means not yet
  // loaded; the line is simply omitted, mirroring NavigationChildCard exactly.
  const schoolLabel =
    child.schoolCount != null && child.schoolCount > 0
      ? escapeHtml(`${child.schoolCount} ${child.schoolCount === 1 ? 'school' : 'schools'}`)
      : null;
  const borderColor = isSelected ? DESTINATION_ACCENT_ACTIVE : C_BORDER;
  const borderWidth = isSelected || isHovered ? '2px' : '1px';
  const countColor = presentation?.isZeroContent ? C_GREY_400 : C_MUTED;
  const ariaLabelParts = [ariaLabelName, areasLabel, listingsLabel, schoolLabel].filter(
    (part): part is string => part != null,
  );
  const ariaLabel = ariaLabelParts.join(', ');
  const html = `<div data-testid="area-destination-marker" data-node-key="${escapeHtml(child.nodeKey)}" data-selected="${isSelected}" tabindex="0" role="button" aria-label="${ariaLabel}" style="transform:translate(-50%,-100%);font-family:inherit;pointer-events:auto;cursor:pointer;outline:none;">
    <div${titleAttr} style="display:flex;flex-direction:column;gap:2px;min-width:96px;padding:8px 12px;border-radius:12px;background:${C_PAPER};border:${borderWidth} solid ${borderColor};box-shadow:${PILL_SHADOW};">
      <div style="display:flex;align-items:center;gap:6px;">
        ${pinSvg(DESTINATION_ACCENT)}
        <span style="font-size:12.5px;font-weight:700;color:${C_INK};white-space:nowrap;">${label}</span>
      </div>
      ${areasLabel != null ? `<span style="font-size:10.5px;font-weight:600;color:${countColor};">${areasLabel}</span>` : ''}
      ${listingsLabel != null ? `<span style="font-size:10.5px;font-weight:600;color:${C_MUTED};">${listingsLabel}</span>` : ''}
      ${schoolLabel != null ? `<span style="font-size:10.5px;font-weight:600;color:${C_MUTED};">${schoolLabel}</span>` : ''}
      <span style="font-family:${MONO};font-size:9.5px;font-weight:600;color:${DESTINATION_ACCENT};">Tap to zoom &rsaquo;</span>
    </div>
  </div>`;
  return L.divIcon({ className: 'area-destination-marker-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

/**
 * Case (b) of the three-case school-count rule (locked): a single-AREA
 * marker shows that area's EXACT server-provided schoolCount — never omitted
 * when available, never summed/derived. No "+N" line (this is a real node,
 * not a client-side grouping) — "Tap to view homes" instead of "Tap to
 * zoom", since selecting an AREA leaf goes straight to listings.
 */
function makeSingleAreaChildCard(
  child: AreasNavigationChild,
  isSelected: boolean,
  isHovered: boolean,
): L.DivIcon {
  // UD-1/UD-3 (fix-cycle-3) — this card type is one of the two grid-clustered
  // builders (see areaClustering.ts's AREA_CARD_FOOTPRINT_WIDTH_PX doc): its
  // CSS width is fixed to that SAME shared constant (never a locally re-typed
  // number) so the no-overlap geometry and the pixels actually painted can
  // never drift apart. Truncation (existing `truncateAreaLabel` helper, never
  // reimplemented) plus a matching CSS max-width/ellipsis on the name span is
  // the belt-and-suspenders that keeps the rendered width from ever exceeding
  // that fixed footprint even for a long real label; the ACCESSIBLE name
  // below always carries the full untruncated label.
  const { text: shortLabel, full: fullLabel } = truncateAreaLabel(child.displayLabel, true);
  const label = escapeHtml(shortLabel);
  const ariaLabelName = escapeHtml(child.displayLabel);
  const titleAttr = fullLabel ? ` title="${escapeHtml(fullLabel)}"` : '';
  const listingsLabel = escapeHtml(formatListingCount(child.listingCount));
  const schoolLabel =
    child.schoolCount != null
      ? escapeHtml(`${child.schoolCount} ${child.schoolCount === 1 ? 'school' : 'schools'}`)
      : null;
  const borderColor = isSelected ? DESTINATION_ACCENT_ACTIVE : C_BORDER;
  const borderWidth = isSelected || isHovered ? '2px' : '1px';
  const ariaLabel = [ariaLabelName, listingsLabel, schoolLabel].filter((p): p is string => p != null).join(', ');
  const cardWidthPx = AREA_CARD_FOOTPRINT_WIDTH_PX;
  const nameMaxWidthPx = cardWidthPx - 24 /* padding */ - 11 /* icon */ - 6 /* gap */ - 2 /* border */;
  const html = `<div data-testid="area-single-marker" data-node-key="${escapeHtml(child.nodeKey)}" data-selected="${isSelected}" tabindex="0" role="button" aria-label="${ariaLabel}" style="transform:translate(-50%,-100%);font-family:inherit;pointer-events:auto;cursor:pointer;outline:none;">
    <div${titleAttr} style="box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:${cardWidthPx}px;padding:8px 12px;border-radius:12px;background:${C_PAPER};border:${borderWidth} solid ${borderColor};box-shadow:${PILL_SHADOW};">
      <div style="display:flex;align-items:center;gap:6px;">
        ${pinSvg(DESTINATION_ACCENT)}
        <span style="font-size:12.5px;font-weight:700;color:${C_INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameMaxWidthPx}px;">${label}</span>
      </div>
      <span style="font-size:10.5px;font-weight:600;color:${C_MUTED};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${listingsLabel}</span>
      ${schoolLabel != null ? `<span style="font-size:10.5px;font-weight:600;color:${C_MUTED};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${schoolLabel}</span>` : ''}
      <span style="font-family:${MONO};font-size:9.5px;font-weight:600;color:${DESTINATION_ACCENT};">Tap to view homes &rsaquo;</span>
    </div>
  </div>`;
  return L.divIcon({ className: 'area-single-marker-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

/**
 * Case (a) of the three-case school-count rule (locked): an AD-HOC
 * client-side visual AREA cluster OMITS the school number entirely — school
 * coverage is 1:N across areas, so summing member `schoolCount`s would
 * double-count; this marker never attempts it. Visually distinct from the
 * filled navy listing-cluster disc (`leaflet.markercluster`, PropertyMap.tsx)
 * and from the outline navigation chip used by the legacy dense-area
 * degradation path (`area-cluster-marker-icon`): a dashed-border card with
 * its own `area-visual-cluster-marker` class/testid.
 */
function makeAreaVisualClusterCard(
  representativeNames: string[],
  countLabel: string,
  totalListingCount: number,
  accent: string,
): L.DivIcon {
  // UD-1/UD-3 (fix-cycle-3) — this is the other grid-clustered card builder;
  // same fixed-width-to-the-shared-footprint-constant + truncation contract
  // as makeSingleAreaChildCard above (see that function's comment for the
  // full rationale — never a second truncation implementation, reuses
  // `truncateAreaLabel`). Each representative name is truncated individually
  // before joining (a combined 2-name string can be arbitrarily long even
  // when neither name alone is), never a second implementation; the
  // ACCESSIBLE name always carries the full untruncated names.
  const shortNames = representativeNames.map((name) => truncateAreaLabel(name, true).text);
  const namesLabel = escapeHtml(shortNames.join(', '));
  const fullNamesLabel = escapeHtml(representativeNames.join(', '));
  const anyNameTruncated = shortNames.some((short, i) => short !== representativeNames[i]);
  const titleAttr = anyNameTruncated ? ` title="${fullNamesLabel}"` : '';
  const listingsLabel = escapeHtml(formatListingCount(totalListingCount));
  const countLabelHtml = escapeHtml(countLabel);
  const ariaLabel = `${fullNamesLabel}, ${countLabelHtml}, ${listingsLabel}`;
  const cardWidthPx = AREA_CARD_FOOTPRINT_WIDTH_PX;
  const nameMaxWidthPx = cardWidthPx - 24 /* padding */ - 12 /* icon */ - 6 /* gap */ - 3 /* border */;
  const html = `<div data-testid="area-visual-cluster-marker" tabindex="0" role="button" aria-label="${ariaLabel}" style="transform:translate(-50%,-100%);font-family:inherit;pointer-events:auto;cursor:pointer;outline:none;">
    <div${titleAttr} style="box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:${cardWidthPx}px;padding:8px 12px;border-radius:14px;background:${C_PAPER};border:1.5px dashed ${accent};box-shadow:${PILL_SHADOW};">
      <div style="display:flex;align-items:center;gap:6px;">
        ${stackSvg(accent)}
        <span style="font-size:12.5px;font-weight:700;color:${C_INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameMaxWidthPx}px;">${namesLabel}</span>
      </div>
      <span style="font-size:10.5px;font-weight:600;color:${accent};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${countLabelHtml}</span>
      <span style="font-size:10.5px;font-weight:600;color:${C_MUTED};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${listingsLabel}</span>
      <span style="font-family:${MONO};font-size:9.5px;font-weight:600;color:${accent};">Tap to zoom &rsaquo;</span>
    </div>
  </div>`;
  return L.divIcon({ className: 'area-visual-cluster-marker-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

export function AreaDestinationMarkerLayer({
  node,
  levelKind,
  children,
  onSelect,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  journey = null,
  selectedSchool,
  onAreaVisualClusterCameraIntent,
  focusedClusterMemberAreaKeys,
  onClusterFocusChange,
}: AreaDestinationMarkerLayerProps) {
  const map = useMap();
  const [layoutTick, setLayoutTick] = useState(0);

  // Recompute the compass layout whenever the map container's pixel size
  // changes — same trigger set the legacy macro-region markers use above.
  useEffect(() => {
    const recompute = () => setLayoutTick((t) => t + 1);
    map.on('zoomend', recompute);
    map.on('resize', recompute);
    const container = map.getContainer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    ro?.observe(container);
    return () => {
      map.off('zoomend', recompute);
      map.off('resize', recompute);
      ro?.disconnect();
    };
  }, [map]);

  useEffect(() => {
    if (!node || levelKind !== 'directions' || children.length === 0) return;
    const markers: L.Marker[] = [];
    const mapSize = map.getSize();
    const compassLayout = computeCompassLayout(mapSize.x, mapSize.y);

    for (const child of children) {
      const code = compassCodeFromDirectionNodeKey(child.nodeKey);
      const point = compassPointFor(code, compassLayout);
      const latLng = map.containerPointToLatLng([point.x, point.y]);
      const isSelected = selectedNodeKey === child.nodeKey;
      const isHovered = hoveredNodeKey === child.nodeKey;

      const marker = L.marker([latLng.lat, latLng.lng], {
        icon: makeDestinationCard(child, isSelected, isHovered),
      });

      // AC3.9/T3 — dispatches the SAME selectNode reference the panel card
      // uses, unwrapped, with the server-given nodeKey only.
      marker.on('click', () => onSelect(child.nodeKey));
      marker.on('mouseover', () => onHoverChange?.(child.nodeKey));
      marker.on('mouseout', () => onHoverChange?.(null));
      marker.addTo(map);

      // Keyboard-operable, mirroring the existing macro-region/group marker
      // Enter/Space bridge above (a plain div has no native key->click).
      const el = marker.getElement()?.querySelector<HTMLElement>('[data-testid="area-destination-marker"]');
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
      el?.addEventListener('focus', () => onHoverChange?.(child.nodeKey));
      el?.addEventListener('blur', () => onHoverChange?.(null));

      markers.push(marker);
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [node, levelKind, children, map, onSelect, selectedNodeKey, hoveredNodeKey, onHoverChange, layoutTick]);

  // ── AREA / Local-Destination real geography (Issue #1956 PR 3, Slice 4) ──
  // Recompute grouping on zoom only (grid clustering is a pure function of
  // projected pixel position at a given zoom) — the same pan-invariant
  // trigger convention as the legacy degraded path below in AreaMarkerLayer.
  const [areasZoomTick, setAreasZoomTick] = useState(() => map.getZoom());
  useEffect(() => {
    if (levelKind !== 'areas') return;
    const onZoomEnd = () => setAreasZoomTick(map.getZoom());
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [map, levelKind]);

  // Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.18) — cluster focus is
  // now ALWAYS controlled by the caller (MapDiscovery owns the ONE
  // focused-cluster identity and threads it to both this layer and the right
  // panel's DiscoverAreasJourneyPanel — see MapDiscovery.tsx's
  // `focusedClusterMemberAreaKeys` state). No independent internal fallback
  // state is kept here: an uncontrolled useState mirror could silently
  // diverge from the parent's owned value the instant a real page mounted
  // both consumers, which is exactly the two-sources-of-truth bug AC4.12
  // exists to prevent. `focusedClusterMemberAreaKeys` defaults to `null`
  // (no cluster focused) for callers — tests included — that render this
  // layer standalone without wiring the prop.
  const focusedMembers = focusedClusterMemberAreaKeys ?? null;
  const setFocusedMembers = (keys: readonly string[] | null) => {
    onClusterFocusChange?.(keys);
  };

  // Non-recreating marker registry for THIS effect only — keyed by a stable
  // identity (a real node's nodeKey, or a visual cluster's membership hash)
  // so unchanged markers are repositioned/re-iconed in place (AC4.19) rather
  // than removed and recreated on every recompute. `html` is the exact divIcon
  // HTML last applied to this marker (change AC4.19 fix) — `setIcon`/
  // `setLatLng` are only called when the corresponding value actually
  // changed, so a zoom-only recompute with unchanged content never tears
  // down/rebuilds the marker's inner DOM (Leaflet's setIcon -> _initIcon
  // reassigns innerHTML wholesale, which would otherwise destroy the
  // data-testid child elements and drop keyboard focus on every zoom).
  const areaMarkerRegistryRef = useRef<
    Map<string, { marker: L.Marker; html: string; latlng: [number, number] }>
  >(new Map());

  useEffect(() => {
    const registry = areaMarkerRegistryRef.current;
    if (!node || (levelKind !== 'areas' && levelKind !== 'clusters')) {
      // F1 fix (fix-cycle-3) — this effect deliberately has NO cleanup
      // function of its own (see the dedicated true-unmount effect below,
      // and REQUIRED CHANGE 5's comment further down for why): the
      // stale-removal diff loop that normally tears down markers no longer
      // desired lives further down in this same effect body, AFTER this
      // guard. Without this, a level change OUT of areas/clusters — most
      // commonly clicking a single-AREA marker (levelKind -> 'listings'), or
      // a breadcrumb hop back to a DIRECTION node — hit this early return
      // BEFORE that diff loop ever ran, leaving the previous level's AREA/
      // cluster cards mounted indefinitely with live Leaflet click handlers
      // still closing over the OLD nodeKeys. Clear the registry explicitly
      // on every path out of the areas/clusters levels instead.
      for (const entry of registry.values()) {
        entry.marker.remove();
      }
      registry.clear();
      return;
    }
    const eligibilityJourney: AreasEligibilityJourney = journey === 'school-first' ? 'schools' : 'areas';
    const rawByNodeKey = new Map(node.children.map((c) => [c.nodeKey, c] as const));
    // `hoverKey` is the stable node identity to report via onHoverChange on
    // mouseover/mouseout/focus/blur — `null` for an ad-hoc visual cluster,
    // which is not a real node and has no hover-highlight state of its own.
    const desired = new Map<
      string,
      { latlng: [number, number]; icon: L.DivIcon; html: string; onClick: () => void; hoverKey: string | null }
    >();

    if (levelKind === 'clusters') {
      // CLUSTER ("Local Destination") children are real nodes — case (c) of
      // the school-count rule, structural copy, never "+N". Selecting one
      // drills down via the SAME onSelect reference as the directions path.
      for (const child of children) {
        const raw = rawByNodeKey.get(child.nodeKey);
        if (!raw || !isUsableCentroid(raw.centreLat, raw.centreLon)) continue;
        const isSelected = selectedNodeKey === child.nodeKey;
        const isHovered = hoveredNodeKey === child.nodeKey;
        const icon = makeDestinationCard(child, isSelected, isHovered);
        desired.set(child.nodeKey, {
          // Non-null guaranteed by isUsableCentroid above.
          latlng: [raw.centreLat as number, raw.centreLon as number],
          icon,
          html: String(icon.options.html),
          onClick: () => onSelect(child.nodeKey),
          hoverKey: child.nodeKey,
        });
      }
    } else {
      // 'areas' — dense AREA children. Visibility runs BEFORE clustering
      // (journeyVisibility, via clusterVisibleAreaMembers) so a zero-content
      // AREA can never reach a cluster or its "+N" count.
      const clusterable: ClusterableAreaMember[] = [];
      for (const child of children) {
        const raw = rawByNodeKey.get(child.nodeKey);
        // Minor fix-up (review) — the backend guarantees a non-null areaKey
        // for AREA children; a child missing one is SKIPPED rather than
        // borrowing its nodeKey as a stand-in areaKey (never mix the two key
        // spaces — mirrors the coordinate fail-safe just below, which omits
        // rather than fabricates).
        if (raw?.areaKey == null) continue;
        clusterable.push({
          nodeKey: child.nodeKey,
          areaKey: raw.areaKey,
          displayLabel: child.displayLabel,
          // Missing/invalid coordinates land on NaN, which isUsableCentroid
          // (inside the clusterer) rejects outright — never silently
          // defaulted to (0, 0) or any other fabricated position.
          lat: raw.centreLat ?? Number.NaN,
          lon: raw.centreLon ?? Number.NaN,
          listingCount: child.listingCount,
          displayOrder: child.displayOrder,
          schoolCount: child.schoolCount,
        });
      }

      // REQUIRED CHANGE 5 (AC4.18) — reconcile a controlled focus against the
      // VISIBLE (post-eligibility) member set, computed over the full UNSCOPED
      // `clusterable` — never the pre-visibility "still present in `children`"
      // check this used to run — so a filter that drops EVERY focused member
      // to zero-content (rather than removing it from `children` outright)
      // also clears focus. This runs BEFORE any scoping/clustering, and on a
      // clearing run the effect returns immediately with no cleanup of its
      // own: the previous (correct) render's markers stay exactly as they
      // are — never replaced by a stale or empty frame — until the
      // `setFocusedMembers(null)` state update this triggers reruns the
      // effect with a fresh, unscoped focusedMembers=null.
      if (focusedMembers) {
        const { visible } = partitionMembersByJourney(
          clusterable.map((m) => ({
            areaKey: m.areaKey,
            displayLabel: m.displayLabel,
            eligibleListingCount: m.listingCount,
            eligibleSchoolCount: m.schoolCount ?? 0,
            displayOrder: m.displayOrder,
          })),
          eligibilityJourney,
        );
        const visibleAreaKeys = new Set(visible.map((m) => m.areaKey));
        const stillAllVisible = focusedMembers.every((k) => visibleAreaKeys.has(k));
        if (!stillAllVisible) {
          setFocusedMembers(null);
          return;
        }
      }

      const project: AreaClusterProjectFn = (lat, lon) => {
        const pt = map.latLngToContainerPoint([lat, lon]);
        return { x: pt.x, y: pt.y };
      };

      const scoped = focusedMembers
        ? clusterable.filter((m) => focusedMembers.includes(m.areaKey))
        : clusterable;

      const clusterResult = clusterVisibleAreaMembers(scoped, eligibilityJourney, project, areasZoomTick);
      const accent = journey === 'school-first' ? C_PLUM : C_COPPER;

      for (const cell of clusterResult.clusters) {
        if (cell.members.length === 1) {
          const member = cell.members[0];
          const childCounts = children.find((c) => c.nodeKey === member.nodeKey);
          if (!childCounts) continue;
          const isSelected = selectedNodeKey === member.nodeKey;
          const isHovered = hoveredNodeKey === member.nodeKey;
          const icon = makeSingleAreaChildCard(childCounts, isSelected, isHovered);
          desired.set(member.nodeKey, {
            latlng: [member.lat, member.lon],
            icon,
            html: String(icon.options.html),
            onClick: () => onSelect(member.nodeKey),
            hoverKey: member.nodeKey,
          });
        } else {
          const membershipKey = cell.members.map((m) => m.areaKey).join('|');
          const { representativeNames, countResult } = presentClusterRepresentatives(
            cell.members,
            eligibilityJourney,
          );
          const totalListingCount = cell.members.reduce((sum, m) => sum + m.listingCount, 0);
          const icon = makeAreaVisualClusterCard(representativeNames, countResult.label, totalListingCount, accent);
          desired.set(`cluster:${membershipKey}`, {
            latlng: [cell.anchor.lat, cell.anchor.lon],
            icon,
            html: String(icon.options.html),
            onClick: () => {
              const bounds = boundsOfMembers(cell.members);
              if (bounds) {
                onAreaVisualClusterCameraIntent?.(
                  [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
                  [cell.anchor.lat, cell.anchor.lon],
                );
              }
              // A visual cluster is client-side only — never calls onSelect,
              // never changes node=, never touches history (spec item 5).
              setFocusedMembers(cell.members.map((m) => m.areaKey));
            },
            // Not a real node — no hover-highlight state to report.
            hoverKey: null,
          });
        }
      }
    }

    // REQUIRED CHANGE 4 (re-review fix) — reuses the exact keyboard/focus
    // bridge the directions loop above already applies: a plain div has no
    // native key->click translation, and role="button" with no working
    // activation is worse than no role at all for a screen-reader user.
    //
    // This must be (re)bound every time `setIcon` actually runs, not just on
    // first creation: `makeSingleAreaChildCard`/`makeAreaVisualClusterCard`
    // emit different HTML on hover/selection/count-copy changes (e.g. a
    // 1px->2px border), so REQUIRED CHANGE 3's dirty-check correctly calls
    // `setIcon` for those cases too — and Leaflet's `setIcon` ->
    // `_initIcon` -> `DivIcon.createIcon(oldIcon)` reassigns the marker's
    // outer div's innerHTML wholesale, which detaches the PREVIOUS inner
    // `[role="button"]` element (and, harmlessly, its now-dead listeners)
    // and creates a brand-new one. Always querying `marker.getElement()`
    // fresh — never reusing a captured reference — means this can never
    // double-bind: each call only ever attaches to whichever element is
    // current at that moment.
    const bindMarkerDom = (marker: L.Marker, hoverKey: string | null) => {
      const el = marker.getElement()?.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
      if (hoverKey != null) {
        el?.addEventListener('focus', () => onHoverChange?.(hoverKey));
        el?.addEventListener('blur', () => onHoverChange?.(null));
      } else {
        // UD-2 (fix-cycle-4) — a visual cluster (`hoverKey: null`; it is not a
        // real node, so it correctly has no hover-highlight state of its own
        // — see the module doc on `hoverKey` above) otherwise gets ZERO focus
        // feedback for a keyboard user, since its outer div sets
        // `outline:none` INLINE. A class-based rule can never beat that: an
        // inline style declaration outranks any selector-based author
        // declaration regardless of layers/specificity, so a stylesheet
        // class (the previous `.area-marker-kbd-focus` approach, since
        // reverted from index.css) never painted anything. Set the focus
        // indicator as an INLINE style instead — the only thing guaranteed
        // to win — mirroring every other visual property on this divIcon
        // (literal values, no CSS pipeline). Uses a navy ring (C_NAVY, same
        // token as this file's leader-line/anchor-dot color), not copper:
        // this card's resting state already has a permanent dashed COPPER
        // border, so a copper focus ring would read as "a slightly different
        // border", not "focus" (design-audit finding). Cleared to '' on blur
        // (never toggled via a class) so activation (Enter/Space, bound
        // above) is unaffected either way.
        el?.addEventListener('focus', () => {
          if (!el) return;
          el.style.borderRadius = '14px';
          el.style.boxShadow = `0 0 0 2px ${C_PAPER}, 0 0 0 4px ${C_NAVY}`;
        });
        el?.addEventListener('blur', () => {
          if (!el) return;
          el.style.borderRadius = '';
          el.style.boxShadow = '';
        });
      }
    };

    // Diff against the persistent registry: remove stale, add new, update
    // (reposition/re-icon) unchanged-identity markers IN PLACE (AC4.19).
    for (const [key, entry] of registry) {
      if (!desired.has(key)) {
        entry.marker.remove();
        registry.delete(key);
      }
    }
    for (const [key, spec] of desired) {
      const existing = registry.get(key);
      if (existing) {
        // REQUIRED CHANGE 3 (AC4.19) — only touch Leaflet's setIcon/setLatLng
        // when the value actually changed. setIcon -> _initIcon reassigns the
        // DivIcon's innerHTML wholesale even when the new HTML string is
        // identical, destroying the data-testid child elements (and any
        // keyboard focus on them) on every call — including a bare zoom
        // recompute where nothing about this marker actually changed.
        if (existing.html !== spec.html) {
          // Capture focus BEFORE setIcon detaches the current inner element,
          // so it can be restored on the freshly bound replacement below —
          // otherwise a keyboard user tabbed onto this marker loses focus to
          // document.body the moment its hover/selection state changes.
          const outerElBeforeSwap = existing.marker.getElement();
          const hadFocus = outerElBeforeSwap != null && outerElBeforeSwap.contains(document.activeElement);
          existing.marker.setIcon(spec.icon);
          existing.html = spec.html;
          bindMarkerDom(existing.marker, spec.hoverKey);
          if (hadFocus) {
            existing.marker
              .getElement()
              ?.querySelector<HTMLElement>('[role="button"][tabindex="0"]')
              ?.focus();
          }
        }
        if (existing.latlng[0] !== spec.latlng[0] || existing.latlng[1] !== spec.latlng[1]) {
          existing.marker.setLatLng(spec.latlng);
          existing.latlng = spec.latlng;
        }
        existing.marker.off('click');
        existing.marker.on('click', spec.onClick);
      } else {
        const marker = L.marker(spec.latlng, { icon: spec.icon });
        marker.on('click', spec.onClick);
        if (spec.hoverKey != null) {
          marker.on('mouseover', () => onHoverChange?.(spec.hoverKey));
          marker.on('mouseout', () => onHoverChange?.(null));
        }
        marker.addTo(map);
        registry.set(key, { marker, html: spec.html, latlng: spec.latlng });
        bindMarkerDom(marker, spec.hoverKey);
      }
    }
    // Minor fix-up (review) — no cleanup function here: a full teardown on
    // every run would defeat AC4.19's reuse contract (the stale-entry
    // removal loop just above already tears down markers whose identity no
    // longer exists on THIS run's diff). Unmount-only cleanup lives in the
    // dedicated effect immediately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    node,
    levelKind,
    children,
    map,
    onSelect,
    selectedNodeKey,
    hoveredNodeKey,
    onHoverChange,
    journey,
    selectedSchool,
    areasZoomTick,
    focusedMembers,
    onAreaVisualClusterCameraIntent,
  ]);

  // True unmount cleanup — removes every marker this layer instance ever
  // created, exactly once, when the component itself goes away.
  useEffect(() => {
    const registry = areaMarkerRegistryRef.current;
    return () => {
      for (const entry of registry.values()) {
        entry.marker.remove();
      }
      registry.clear();
    };
  }, []);

  return null;
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

  // ── Region compass-layout recompute trigger ────────────────────────────────
  // Macro-region markers (city landing) are positioned on a synthetic compass
  // circle (regionCompassLayout.ts), computed from the map container's pixel
  // size — this must be recalculated whenever that size or the zoom-driven
  // container-point projection changes (design requirement: resize, browser
  // width change, initial layout settle, overview zoom change). Scoped to a
  // no-op listener when no macro-region markers are present, so every other
  // (non-landing) call site is unaffected.
  const [regionLayoutTick, setRegionLayoutTick] = useState(0);
  const hasMacroRegions = areas.some((a) => a.isMacroRegion);
  useEffect(() => {
    if (!hasMacroRegions) return;
    const recompute = () => setRegionLayoutTick((t) => t + 1);
    map.on('zoomend', recompute);
    map.on('resize', recompute);
    // Leaflet's own 'resize' event only fires after map.invalidateSize() runs
    // (wired elsewhere via a ResizeObserver on the map container); observe the
    // container directly here too so a layout-only resize (no invalidateSize
    // call) still recomputes the compass circle.
    const container = map.getContainer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    ro?.observe(container);
    return () => {
      map.off('zoomend', recompute);
      map.off('resize', recompute);
      ro?.disconnect();
    };
  }, [map, hasMacroRegions]);

  // ── Legacy path (default) — renders exactly as before this issue. Every
  // area passed in gets its own full labelled pin; no density degradation.
  useEffect(() => {
    if (enableDegradation) return;
    const markers: L.Marker[] = [];
    // Recompute inside the effect so the closure captures the current focusedGroupAreas.
    const effectFocusedSet = focusedGroupAreas ? new Set(focusedGroupAreas) : null;

    // Shared compass-circle layout for macro-region markers only (city
    // landing). Computed once per effect run from the CURRENT container size,
    // not memoized outside the effect, since it must reflect the container's
    // pixel dimensions at the moment markers are (re)built.
    const mapSize = map.getSize();
    const compassLayout = computeCompassLayout(mapSize.x, mapSize.y);

    for (const area of areas) {
      // Issue #1595 — when a group is focused, render ONLY its member areas. Non-member
      // areas are hidden entirely (previously dimmed to 0.3), so the map stays focused on
      // the selected group's context with no confusing ghost/shadow markers for unrelated
      // areas. Members always render at full opacity.
      if (effectFocusedSet && !effectFocusedSet.has(area.areaKey)) continue;

      // Region cluster markers (city landing) are navigational compass
      // selectors, not geographic centroid pins — their DRAWN position comes
      // from the shared compass-circle layout (regionCompassLayout.ts),
      // keyed on the region's stable backend region_key (area.areaKey for
      // these entries — see useDiscoverMapPresentation.ts's
      // `areaKey: region.regionKey`), never from the aggregated/approximate
      // geo_center_lat/lon. The `area` object passed to onAreaClick/
      // onAreaCameraIntent below is untouched — its real geo_center_lat/lon
      // and bbox still drive click navigation and camera fitting.
      const [markerLat, markerLon] = area.isMacroRegion
        ? (() => {
            const point = compassPointFor(area.areaKey, compassLayout);
            const latLng = map.containerPointToLatLng([point.x, point.y]);
            return [latLng.lat, latLng.lng] as const;
          })()
        : ([area.geo_center_lat, area.geo_center_lon] as const);

      const marker = L.marker(
        [markerLat, markerLon],
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

      // Region cluster markers (city landing) carry tabindex/role="button" in
      // their divIcon HTML (makeAreaCard) so they're reachable via Tab, but a
      // plain div doesn't natively translate an Enter/Space keydown into a
      // click the way <button> does — bridge it here so the marker's own
      // 'click' handler above also fires from the keyboard.
      if (area.isMacroRegion) {
        const el = marker.getElement()?.querySelector<HTMLElement>('.dp-region');
        el?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
          }
        });
      }

      // Area-group "map card" markers carry the same tabindex/role="button"
      // keyboard-operable contract as the macro-region bubble above — bridge
      // Enter/Space into the marker's own 'click' handler here too.
      if (area.isGroup) {
        const el = marker.getElement()?.querySelector<HTMLElement>('.area-group-card');
        el?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
          }
        });
      }
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  // focusedGroupAreas is an array reference — it changes identity when the group
  // changes, which is correct: re-render recreates markers with new opacity values.
  // journey and selectedSchool change the badge content so must also be deps.
  // regionLayoutTick is the deliberate resize/zoom recompute trigger for the
  // macro-region compass layout — bumping it rebuilds every marker (cheap:
  // this path only ever renders a handful of navigation markers) with fresh
  // container-point projections.
  }, [areas, map, onAreaClick, onAreaCameraIntent, focusedGroupAreas, journey, selectedSchool, enableDegradation, regionLayoutTick]);

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

      // Same Enter/Space→click keyboard bridge as the legacy loop, for the
      // rare case an area-group marker is promoted into this degraded
      // representatives loop (e.g. via forced-always selection).
      if (area.isGroup) {
        const el = marker.getElement()?.querySelector<HTMLElement>('.area-group-card');
        el?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
          }
        });
      }
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
