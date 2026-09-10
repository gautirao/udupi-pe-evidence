import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
// Issue #2017 (max-3 visual parity, PR #2424) — the single source-of-truth
// cap constant, same one useAreaSetDraft.ts derives `atLimit` from. Used
// here only for the disabled-candidate card's aria-label copy ("Maximum of
// N areas reached") so the number can never drift from the real cap.
import { AREA_SET_MAX_AREAS } from '@/features/discover/state/useAreaSetDraft';
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
  clusterAreaMembers,
  clusterVisibleAreaMembers,
  boundsOfMembers,
  isUsableCentroid,
  AREA_CARD_FOOTPRINT_WIDTH_PX,
  type AreaClusterCell,
  type ClusterableAreaMember,
  type ClusterableDestination,
  type ProjectFn as AreaClusterProjectFn,
} from '@/features/discover/navigation/areaClustering';
import {
  presentClusterRepresentatives,
  presentDestinationClusterRepresentatives,
} from '@/features/discover/navigation/representativeNames';
import { estimateDestinationCardFootprint } from '@/features/discover/navigation/destinationCardFootprint';
import {
  PAPER,
  COPPER_500,
  COPPER_600,
  PLUM_600,
  GREY_700,
  FONT_SANS,
  FONT_MONO,
  RADIUS_LG,
  RADIUS_FULL,
  DESTINATION_PILL_BG,
  DESTINATION_TEXT_SOFT,
  DESTINATION_TEXT_SOFT_DIM,
  DESTINATION_TEXT_MUTED,
} from './markerTokens';
import {
  markerInteractiveAttrs,
  markerShellHtml,
  compassGlyphSvg,
  zoomGlyphSvg,
  homeGlyphSvg,
  VISUAL_CLUSTER_CARD_WIDTH_PX,
  VISUAL_CLUSTER_CARD_HEIGHT_PX,
  MARKER_SHELL_STYLE,
} from './markerPrimitives';

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
  /**
   * Issue #2017 — areaKeys that should render as the actionable AREA_SET
   * candidate callout (name / listing count / "View homes ›") instead of
   * their normal marker. Used while the multi-area draft panel is open, for
   * both current draft members and nearby-suggestion candidates. Optional;
   * when omitted, every area renders exactly as before.
   */
  areaSetCandidateKeys?: string[];
  /**
   * Issue #2018 slice 3 — FILTER-AWARE listing count per candidate areaKey.
   *
   * Without this the callout fell back to `area.listingCount`, the area's raw
   * per-area total from `useDiscoverAreas`, which ignores the shopper's active
   * filters. The recovery panel's nearby row shows `eligibleListingCount` from
   * the nearby contract, which does not. So under any active filter the SAME
   * candidate showed two different numbers on map and panel, against #2018's
   * rule: "Map and panel show the same preview counts and candidate
   * identities."
   *
   * Optional. A key absent from this map falls back to `area.listingCount`
   * exactly as before, so callers predating it are unaffected.
   */
  areaSetCandidateCounts?: Record<string, number>;
  // Issue #2456 (owner ruling) — there is deliberately NO
  // `onAreaSetCandidateSelect` companion any more. The earlier
  // click/Enter/Space → add-to-draft path (#2017, kept interactive on
  // PR #2424 / #2453 owner feedback) is superseded: the map never mutates
  // the AREA_SET scope; adding an area happens only through the panel.
  /**
   * Issue #2017 (max-3 visual parity, PR #2424) — true when the AREA_SET
   * draft is at its cap (same `atLimit` source of truth `AreaSetChips.tsx`
   * uses for its own candidate-button disabled styling — see
   * `useAreaSetDraft.ts`). When true, every AREA_SET candidate callout that
   * is NOT already selected/committed (`area.isSelected`) renders a muted,
   * non-interactive variant and no-ops on click/Enter/Space. Already-selected
   * candidate cards are never dimmed and stay fully interactive. Optional;
   * defaults to false (no visual change) so every existing caller/test
   * fixture keeps compiling/behaving identically.
   */
  areaSetAtMax?: boolean;
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
// FIX cycle 2 (real-browser QA, post-N3) — mirrors index.css:465's
// `.area-visual-cluster-marker-icon [data-testid="area-visual-cluster-marker"]
// :focus-within .rc-shell { box-shadow: ... !important; }` lift-shadow value
// EXACTLY. That stylesheet rule is `!important` and targets `.rc-shell`
// directly, so once N3 moved the keyboard-focus ring's inline box-shadow
// onto `.rc-shell` too, this author rule started OUTRANKING the ring's plain
// (non-`!important`) inline value the moment the browser actually applied
// the real stylesheet — invisible in jsdom (index.css is never loaded
// there), only surfaced by real-browser QA. No importable JS symbol exists
// for this CSS literal (it lives only in index.css, never exported), so it
// is re-typed here with this comment pointing at the source of truth — the
// same documented, deliberate exception this file already takes for
// C_NAVY/C_PAPER/etc, which also have no shared token module.
const RC_SHELL_FOCUS_LIFT_SHADOW = '0 14px 28px rgba(18, 24, 38, 0.38)';
const MONO = `'Geist Mono', ui-monospace, 'SF Mono', monospace`;
const PILL_SHADOW = '0 4px 10px rgba(17,24,39,0.10), 0 2px 4px rgba(17,24,39,0.05)';
// Issue #2088 item 2b — markerTokens.ts's FONT_SANS/FONT_MONO are byte-parity-tested
// against typography.css, which double-quotes its font names (`"Plus Jakarta Sans"`,
// `"Geist Mono"`, ...) — unlike this file's own single-quoted `MONO` literal above.
// Embedded RAW into one of this file's double-quoted `style="..."` divIcon HTML
// attributes, that inner `"` terminates the attribute early (the browser parses
// `style="font-family:"` and silently drops every declaration after it — the exact
// defect that made the item 2b destination-card rebuild render with no font/color/
// size at all on first browser verification). Pre-escaped ONCE here via the same
// `escapeHtml` every other interpolated value in this file already goes through,
// never re-typed as a re-quoted duplicate of the markerTokens.ts source of truth.
const FONT_SANS_ATTR = escapeHtml(FONT_SANS);
const FONT_MONO_ATTR = escapeHtml(FONT_MONO);

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

/**
 * Issue #2330 (D1/AC2) — Explore/Zoom shell width scales with inventory
 * (`VISUAL_RULES.md` §"Map action-marker system", `ExpMap.jsx`'s
 * `destCardHTML`/`clusterChipHTML`: `Math.round(132 + Math.min(1, n/240)*38)`,
 * clamped to `[150,206]` for the combined/cluster card). `divisor` mirrors
 * this file's existing schools-vs-residential count-font-size ramp
 * (`makeDestinationCard`'s `countFontSizePx`, which normalises the schools
 * count over 20 rather than the mock's flat 240) so a single marker's width
 * and its own hero-digit size scale off the SAME "how full is this count"
 * fraction — never two independently-drifting ramps for one card.
 */
function inventoryScaledWidthPx(primaryCountNum: number, isSchools: boolean, isCombined: boolean): number {
  const divisor = isSchools ? 20 : 240;
  const raw = Math.round(132 + Math.min(1, primaryCountNum / divisor) * 38);
  return isCombined ? Math.min(206, Math.max(150, raw)) : raw;
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

/**
 * Issue #2017 — actionable AREA_SET candidate callout, used for both current
 * multi-area draft members and nearby-suggestion candidates while the
 * multi-area draft panel is open. Dark rounded card mirroring the visual
 * composition of makeDestinationCard/makeSingleAreaChildCard (name / hero
 * count / accent action line), built from this file's own local pill-marker
 * constants rather than the markerShellHtml/markerTokens system.
 */
function makeAreaSetCandidateCard(
  area: AreaPoint,
  opacity: number,
  disabled: boolean,
  /**
   * Issue #2018 slice 3 — the filter-aware count for this candidate.
   * Undefined falls back to the area's own raw total, preserving
   * pre-#2018 behaviour for callers that do not supply the map.
   */
  eligibleCount?: number,
): L.DivIcon {
  const { text: repText, full: repFull } = truncateAreaLabel(area.areaLabel, true);
  const repLabel = escapeHtml(repText);
  const titleAttr = repFull ? ` title="${escapeHtml(repFull)}"` : '';
  const count = eligibleCount ?? area.listingCount ?? 0;
  const countText = count.toLocaleString();
  const noun = count === 1 ? 'LISTING' : 'LISTINGS';

  // Issue #2017 (repo-owner feedback on PR #2424) — this callout renders
  // both an already-committed draft member and a nearby, not-yet-added
  // suggestion (see docstring above), but previously used one undifferentiated
  // dark card for both. `area.isSelected` (already present on AreaPoint, no
  // new prop wiring) now drives two visual variants matching the panel's
  // navy/copper language: a solid copper "committed" card for draft members,
  // and a lighter outlined/muted paper card for candidates.
  const isCommitted = area.isSelected ?? false;
  // Issue #2017 (max-3 visual parity, PR #2424) — `disabled` (driven by the
  // shared `atLimit` source of truth, see AreaMarkerLayerProps.areaSetAtMax)
  // ONLY ever mutes a not-yet-selected candidate; an already-committed card
  // must never be dimmed or made non-interactive by the cap.
  const isMaxDisabled = disabled && !isCommitted;
  const ariaLabel = escapeHtml(
    isMaxDisabled
      ? `${area.areaLabel}, ${countText} ${count === 1 ? 'listing' : 'listings'}. Maximum of ${AREA_SET_MAX_AREAS} areas reached.`
      : `${area.areaLabel}, ${countText} ${count === 1 ? 'listing' : 'listings'}. View homes.`,
  );
  const cardBg = isCommitted ? C_COPPER : isMaxDisabled ? C_STONE_400 : C_PAPER;
  const cardBorder = isCommitted
    ? `1px solid ${C_COPPER_HOVER}`
    : isMaxDisabled
      ? `1px solid ${C_GREY_400}`
      : `1px solid ${C_COPPER}`;
  const pinColor = isCommitted ? C_PAPER : isMaxDisabled ? C_GREY_400 : C_COPPER;
  const labelColor = isCommitted ? C_PAPER : isMaxDisabled ? C_MUTED : C_NAVY;
  const countColor = isCommitted ? 'rgba(255,255,255,0.78)' : C_MUTED;
  const footerBg = isCommitted ? C_NAVY : isMaxDisabled ? C_GREY_400 : C_COPPER_TINT;
  const footerColor = isCommitted ? C_PAPER : isMaxDisabled ? C_PAPER : C_COPPER;
  const footerLabel = isMaxDisabled ? 'Max reached' : 'View homes <span style="font-size:13px;line-height:1;">&#8250;</span>';
  const checkBadge = isCommitted
    ? `<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:13px;height:13px;border-radius:50%;background:${C_NAVY};margin-right:1px;"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="${C_PAPER}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>`
    : '';

  const html = `<div data-testid="area-set-candidate-marker" data-area-set-committed="${isCommitted}" data-area-set-max-disabled="${isMaxDisabled}" tabindex="0" role="button" aria-label="${ariaLabel}" aria-pressed="${isCommitted}" aria-disabled="${isMaxDisabled}" style="transform:translate(-50%,-118%);font-family:inherit;opacity:${isMaxDisabled ? 0.6 : opacity};pointer-events:auto;cursor:${isMaxDisabled ? 'default' : 'pointer'};">
    <div class="area-set-candidate-card"${titleAttr} style="display:flex;flex-direction:column;min-width:118px;max-width:176px;border-radius:12px;overflow:hidden;background:${cardBg};box-shadow:${PILL_SHADOW};border:${cardBorder};">
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:9px 11px 8px;">
        <span style="display:flex;align-items:center;gap:6px;max-width:100%;">${checkBadge}${pinSvg(pinColor)}<span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;color:${labelColor};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${repLabel}</span></span>
        <span style="font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${countColor};">${countText} ${noun}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 11px;background:${footerBg};font-size:11.5px;font-weight:700;color:${footerColor};">${footerLabel}</div>
    </div>
    <div style="width:8px;height:8px;background:${footerBg};transform:rotate(45deg);margin:-5px auto 0;box-shadow:${PILL_SHADOW};"></div>
  </div>`;

  return L.divIcon({
    className: 'area-set-candidate-marker',
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
 * §1), emitted only for a non-zero offset by its caller (the legacy
 * AreaMarkerLayer cluster-chip layout below). This divIcon is anchored at
 * the TRUE centroid lat/lon (never offset); the SVG line is drawn locally
 * from the anchor point to (dx, dy) so it visually terminates exactly under
 * the offset chip without needing a second lat/lon. Non-interactive
 * (pointer-events:none) so it never steals a click meant for a neighbour.
 */
function makeLeaderIcon(offset: { dx: number; dy: number }, color: string): L.DivIcon {
  const { dx, dy } = offset;
  const minX = Math.min(0, dx);
  const minY = Math.min(0, dy);
  const x1 = 0 - minX;
  const y1 = 0 - minY;
  const x2 = dx - minX;
  const y2 = dy - minY;
  // A purely-vertical (dx=0) or purely-horizontal (dy=0) offset makes the
  // RAW bounding width/height exactly 0.
  // An SVG element with an explicit `width="0"` or `height="0"` attribute
  // gets no rendering box at all — its content never paints, even with
  // `overflow:visible` — so the leader line silently disappeared for every
  // STACK-mode row. `Math.max(..., 1)` keeps the LINE's own coordinates
  // (x1/y1/x2/y2, computed from the real offset) exact; only the SVG
  // element's own declared width/height gets a 1px floor.
  const w = Math.max(0, dx) - minX || 1;
  const h = Math.max(0, dy) - minY || 1;
  const html = `<div data-testid="area-cluster-leader" style="position:relative;transform:translate(${minX}px, ${minY}px);pointer-events:none;">
    <svg width="${w}" height="${h}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none;" aria-hidden="true">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" stroke-opacity="0.7" />
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
   * Issue #1943 (singleton auto-advance, PR #2368 owner ruling 2026-08-28) —
   * REPLACE-mode counterpart to `onSelect`, reserved for the automatic
   * hierarchy transition fired when the current rendered state resolves to
   * exactly one real child marker that itself has further children. Never
   * called by a user click — a click always goes through `onSelect` (PUSH).
   */
  autoAdvanceSelectNode?: (nodeKey: string) => void;
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

/**
 * Issue #1956 AC6.9 — the live backend emits BOTH abbreviated (`d:w`, `d:s`)
 * and full-word (`d:southeast`, `d:northeast`, `d:southwest`) DIRECTION
 * node-key suffixes. `regionCompassLayout.ts`'s `CompassDirectionKey`
 * vocabulary only ever recognised the 8 abbreviations, so an uppercased
 * full word like "SOUTHEAST" silently missed the table and fell back to the
 * exact same layout centre as every other unmatched code — collapsing
 * South-East, North-East and South-West onto one identical, invisible point
 * (root cause of the reported 3-way marker collision). This table maps the
 * full-word spelling of each of the 8 CompassDirectionKey values onto its
 * abbreviation; already-abbreviated suffixes pass through unchanged.
 *
 * Issue #1956 macro-region sibling ruling (2026-08-03) — the SAME
 * full-word/abbreviation input-contract defect exists at this component's
 * OTHER `compassPointFor` caller: the legacy `isMacroRegion` city-landing
 * bubble path below, keyed on the backend's bare `region_key` (no `d:`
 * prefix). That caller is routed through this same table via
 * `normalizeCompassRegionCode` rather than a second, independently
 * maintained mapping.
 */
const DIRECTION_FULL_WORD_TO_COMPASS_CODE: Readonly<Record<string, string>> = {
  NORTH: 'N',
  NORTHEAST: 'NE',
  EAST: 'E',
  SOUTHEAST: 'SE',
  SOUTH: 'S',
  SOUTHWEST: 'SW',
  WEST: 'W',
  NORTHWEST: 'NW',
};

/**
 * Reads (never constructs) the compass/region code embedded in EITHER a
 * server-given DIRECTION nodeKey (`d:<code>`, the canonical Direction-marker
 * caller) OR a bare macro-region `region_key` (the legacy `isMacroRegion`
 * city-landing bubble caller — see the block comment at that call site),
 * normalises it to the abbreviated `CompassDirectionKey` vocabulary
 * `regionCompassLayout.ts` understands (see
 * `DIRECTION_FULL_WORD_TO_COMPASS_CODE` above), then picks a presentation
 * slot on the compass circle. A code that is neither a known full word nor a
 * known abbreviation (nor the `CENTRAL` sentinel, which also passes through
 * unchanged) is returned as-is — `compassPointFor`'s own unrecognised-code
 * handling (a deterministic off-centre fallback + dev diagnostic, never a
 * silent centre collapse) takes over from there, so this function itself
 * never throws. Both `compassPointFor` call sites in this component MUST
 * route through this single normaliser — a second, parallel implementation
 * would be able to drift from this one and reintroduce the same class of
 * defect at only one of the two sites.
 */
function normalizeCompassRegionCode(rawCode: string): string {
  const suffix = rawCode.startsWith('d:') ? rawCode.slice(2) : rawCode;
  const upper = suffix.toUpperCase();
  return DIRECTION_FULL_WORD_TO_COMPASS_CODE[upper] ?? upper;
}

function makeDestinationCard(
  child: AreasNavigationChild,
  isSelected: boolean,
  isHovered: boolean,
  eligibilityJourney: 'schools' | 'areas',
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
  const presentation = child.matchingAreaCount == null || eligibilityJourney === 'schools'
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
  const ariaLabelParts = [ariaLabelName, areasLabel, listingsLabel, schoolLabel].filter(
    (part): part is string => part != null,
  );
  const ariaLabel = ariaLabelParts.join(', ');
  // Issue #2088 (commit 2) — ported to the shared markerPrimitives fragments
  // + markerTokens constants. markerInteractiveAttrs emits the SAME
  // attribute set/order the original literal did.
  const destinationShellAttrs = markerInteractiveAttrs({
    testId: 'area-destination-marker',
    nodeKey: escapeHtml(child.nodeKey),
    selected: isSelected,
    ariaLabel,
  });
  // Issue #2330 — Explore now renders via the shared `markerShellHtml`
  // connected-card shell (dark navy identity + solid accent footer),
  // replacing the pre-#2330 floating "Tap to zoom"-style pill. Content
  // (name/count/pill derivation above) is UNCHANGED — only the shell/palette
  // this content is painted inside changes. `isHovered` no longer drives a
  // JS-baked border swap: hover/keyboard-focus lift is a CSS concern now
  // (index.css, keyed on `data-marker-shell`/`data-journey`/`data-action-kind`
  // per AC16), matching every other variant of this shared shell.
  const isSchools = eligibilityJourney === 'schools';

  const listingsCountText = listingsLabel != null ? child.listingCount.toLocaleString('en-IN') : null;
  const schoolCountText = child.schoolCount != null ? child.schoolCount.toLocaleString('en-IN') : null;
  const primaryCountNum = isSchools ? (child.schoolCount ?? 0) : child.listingCount;
  const primaryCountText = isSchools ? schoolCountText : listingsCountText;
  const primaryCountLabel = isSchools ? 'schools' : 'listings';
  const secondaryLabel = isSchools ? listingsLabel : schoolLabel;
  // Issue #2346 — mirrors makeSingleAreaChildCard's primaryCountKnown gate:
  // a KNOWN zero schoolCount renders the hardcoded "0 schools" hero metric,
  // but an unresolved (null) schoolCount must omit the hero metric entirely
  // rather than being treated as if it were zero.
  const isKnownZeroSchools = isSchools && child.schoolCount === 0;

  const countFontSizePx = Math.round(22 + Math.min(1, primaryCountNum / (isSchools ? 20 : 240)) * 9);
  const widthPx = inventoryScaledWidthPx(primaryCountNum, isSchools, false);
  const nameMaxWidthPx = widthPx - 28;

  const identityHtml =
    `<span style="font-family:${FONT_SANS_ATTR};font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${nameMaxWidthPx}px;">${label}</span>` +
    (primaryCountText != null && (!isSchools || child.schoolCount! > 0)
      ? `<span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
        <span style="font-family:${FONT_MONO_ATTR};font-size:${countFontSizePx}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${primaryCountText}</span>
        <span style="font-family:${FONT_SANS_ATTR};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${DESTINATION_TEXT_MUTED};">${primaryCountLabel}</span>
      </span>`
      : isKnownZeroSchools
        ? `<span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
        <span style="font-family:${FONT_MONO_ATTR};font-size:16px;font-weight:800;line-height:1;letter-spacing:-0.02em;color:${DESTINATION_TEXT_MUTED};">0</span>
        <span style="font-family:${FONT_SANS_ATTR};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${DESTINATION_TEXT_MUTED};">schools</span>
      </span>`
        : '') +
    (areasLabel != null
      ? `<span style="font-family:${FONT_SANS_ATTR};margin-top:${primaryCountText != null ? 3 : 4}px;padding:1px 9px;border-radius:${RADIUS_FULL};background:${DESTINATION_PILL_BG};font-size:10px;font-weight:600;color:${primaryCountText != null ? DESTINATION_TEXT_SOFT : DESTINATION_TEXT_SOFT_DIM};white-space:nowrap;">${areasLabel}</span>`
      : '') +
    (secondaryLabel != null && !isKnownZeroSchools
      ? `<span style="font-family:${FONT_SANS_ATTR};font-size:10.5px;font-weight:600;color:${DESTINATION_TEXT_MUTED};white-space:nowrap;">${secondaryLabel}</span>`
      : '');

  const html = markerShellHtml({
    shellAttrs: destinationShellAttrs,
    titleAttr,
    actionKind: 'explore',
    journey: isSchools ? 'schools' : 'areas',
    widthPx,
    isSelected,
    journeyAttr: isSchools ? 'data-journey="schools"' : '',
    fontSansAttr: FONT_SANS_ATTR,
    identityHtml,
    footerIconHtml: compassGlyphSvg(PAPER),
    footerLabelText: 'Explore',
  });
  return L.divIcon({ className: 'area-destination-marker-icon', html, iconSize: undefined, iconAnchor: [0, 0] });
}

/**
 * Case (b) of the three-case school-count rule (locked): a single-AREA
 * marker shows that area's EXACT server-provided schoolCount — never omitted
 * when available, never summed/derived. No "+N" line (this is a real node,
 * not a client-side grouping) — "Tap to view homes" instead of "Tap to
 * zoom", since selecting an AREA leaf goes straight to listings.
 */
export function makeSingleAreaChildCard(
  child: AreasNavigationChild,
  isSelected: boolean,
  isHovered: boolean,
  eligibilityJourney: 'schools' | 'areas',
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
  const isSchools = eligibilityJourney === 'schools';

  // Issue #2330 (AC5/AC11) — the leaf's exact count is now the HERO METRIC
  // inside the identity section (mono digit + uppercase unit), never a small
  // label beside the pin — matching `VISUAL_RULES.md`'s "View homes / View
  // schools" row exactly. `primaryCountNum` preserves the EXACT three-case
  // school-count rule this file has always used: a KNOWN zero renders as an
  // explicit "0" hero metric, while an unavailable (null/undefined) count
  // omits the hero metric (digit + unit + aria phrase) entirely rather than
  // fabricating a "0" — `listingCount` is always server-known and is never
  // subject to this distinction. Only the visual split (hero digit vs. plain
  // secondary line) changes vs. the legacy rendering.
  const primaryCountNum: number | null = isSchools ? child.schoolCount ?? null : child.listingCount;
  const primaryCountKnown = primaryCountNum != null;
  const heroNoun = primaryCountKnown
    ? isSchools
      ? primaryCountNum === 1 ? 'SCHOOL' : 'SCHOOLS'
      : primaryCountNum === 1 ? 'LISTING' : 'LISTINGS'
    : null;
  const heroCountText = primaryCountKnown ? escapeHtml(primaryCountNum.toLocaleString('en-IN')) : null;
  const primaryCountLabel =
    primaryCountKnown && heroNoun != null
      ? escapeHtml(`${primaryCountNum} ${heroNoun.toLowerCase()}`)
      : null;

  const secondaryCountNum = isSchools ? child.listingCount : child.schoolCount;
  const secondaryKnown = isSchools ? true : child.schoolCount != null;
  const secondaryNoun = isSchools
    ? secondaryCountNum === 1 ? 'listing' : 'listings'
    : secondaryCountNum === 1 ? 'school' : 'schools';
  const secondaryCountLabel =
    secondaryKnown && secondaryCountNum != null
      ? escapeHtml(`${secondaryCountNum} ${secondaryNoun}`)
      : null;

  const primaryAccent = isSchools ? C_PLUM : DESTINATION_ACCENT;
  const ariaLabel = [ariaLabelName, primaryCountLabel, secondaryCountLabel].filter((p): p is string => p != null).join(', ');
  const cardWidthPx = AREA_CARD_FOOTPRINT_WIDTH_PX;
  const nameMaxWidthPx = cardWidthPx - 24 /* padding */ - 11 /* icon */ - 6 /* gap */ - 2 /* border */;
  // Issue #2088 (commit 2) — ported to the shared markerPrimitives fragments
  // + markerTokens constants; byte-identical output (see makeDestinationCard's
  // equivalent comment above).
  const singleAreaShellAttrs = markerInteractiveAttrs({
    testId: 'area-single-marker',
    nodeKey: escapeHtml(child.nodeKey),
    selected: isSelected,
    ariaLabel,
  });

  const identityIcon = isSchools ? gradCapSvg(primaryAccent) : pinSvg(primaryAccent);
  const identityHtml =
    `<span style="display:flex;align-items:center;gap:6px;max-width:100%;">` +
    identityIcon +
    `<span style="font-size:13.5px;font-weight:800;letter-spacing:-0.01em;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${nameMaxWidthPx}px;">${label}</span>` +
    `</span>` +
    (heroCountText != null && heroNoun != null
      ? `<span style="display:flex;align-items:baseline;gap:5px;margin-top:6px;">` +
        `<span style="font-family:${MONO};font-size:22px;font-weight:800;letter-spacing:-0.02em;line-height:1;">${heroCountText}</span>` +
        `<span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C_MUTED};">${heroNoun}</span>` +
        `</span>`
      : '') +
    (secondaryCountLabel != null
      ? `<span style="margin-top:3px;font-size:11px;font-weight:600;color:${C_MUTED};">${secondaryCountLabel}</span>`
      : '');

  const html = markerShellHtml({
    shellAttrs: singleAreaShellAttrs,
    titleAttr,
    actionKind: isSchools ? 'view-schools' : 'view-homes',
    journey: isSchools ? 'schools' : 'areas',
    widthPx: cardWidthPx,
    isSelected,
    journeyAttr: isSchools ? 'data-journey="schools"' : '',
    fontSansAttr: FONT_SANS_ATTR,
    identityHtml,
    footerIconHtml: isSchools ? gradCapSvg(PAPER) : homeGlyphSvg(PAPER),
    footerLabelText: isSchools ? 'View schools' : 'View homes',
  });
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
  /**
   * Issue #2088 (commit 3) — a stable DOM identity for this ad-hoc,
   * client-side visual cluster, so it is no longer the one marker type on
   * this map with NO `data-node-key`-shaped attribute (every other marker
   * type carries `tabindex=0 role=button aria-label` + `data-node-key`).
   * Deliberately prefixed `visual-cluster:` — this is NEVER a real hierarchy
   * node key (it is not accepted by `isWritableNodeKey`, never appears in a
   * `node=` URL write, and is not one of this app's `a:`/`c:`/`d:` server
   * key families) — the prefix keeps it structurally unmistakable for a real
   * one even by a naive string check. The caller passes the SAME
   * `membershipKey` (member `areaKey`s joined) already used as this marker's
   * own registry key, so the attribute is stable across re-renders with
   * unchanged membership.
   */
  membershipKey: string,
  /**
   * Issue #2305 STAGE 2 (P3) — whether this cluster is the caller's current
   * focused/selected cluster (`focusedMembers != null` at the 'areas' call
   * site; always `false` at the 'clusters'/'directions' call site, which has
   * no equivalent focus concept). Threaded straight into
   * `visualClusterCardHtml`'s double-ring treatment AND into
   * `markerInteractiveAttrs`'s `data-selected` (only when true — omitted
   * otherwise, matching every other marker's "omit when not applicable"
   * contract, same as before this stage).
   */
  isFocusedSelected: boolean,
  /**
   * Issue #2305 STAGE 2 — pre-assembled `data-journey="schools"` (or `''`
   * for residential), mirroring how `accent` is already precomputed by the
   * caller rather than re-derived from journey inside this builder.
   */
  journeyAttr: string,
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
  // No leading space here — `markerShellHtml` prepends its own separating
  // space when placing this on `.rc-shell` (see its own doc).
  const titleAttr = anyNameTruncated ? `title="${fullNamesLabel}"` : '';
  const listingsLabel = escapeHtml(formatListingCount(totalListingCount));
  const countLabelHtml = escapeHtml(countLabel);

  // Issue #2330 — Zoom in now renders via the shared `markerShellHtml` shell
  // (light cream/lavender identity + white footer in accent text), replacing
  // the pre-#2330 Option-B navy-body treatment. `isSchools` is read off the
  // ALREADY-assembled `journeyAttr` (both call sites derive it from the same
  // journey flag `accent` was derived from) rather than adding a second
  // journey parameter to this function's signature.
  const isSchools = journeyAttr !== '';
  // Issue #2345 — `ariaLabel` fed the same unconditional residential
  // listings phrase into the marker's accessible name regardless of journey,
  // a second (screen-reader-facing) leak of the stale-content bug alongside
  // `heroRow`. Schools-journey cards omit it here too, matching `heroRow`'s
  // `isSchools` gate.
  const ariaLabel = isSchools
    ? `${fullNamesLabel}, ${countLabelHtml}`
    : `${fullNamesLabel}, ${countLabelHtml}, ${listingsLabel}`;
  // `accent` (COPPER_500/PLUM_600) is the caller's pre-resolved journey
  // accent, kept for signature compatibility with both call sites; the
  // shared shell resolves its OWN footer text/icon colour (COPPER_600/
  // PLUM_600, one shade darker for the residential journey — see
  // `resolveMarkerPalette`'s `accentText`) so the footer icon below matches
  // that resolved colour exactly, never the caller's slightly different
  // `accent` shade.
  const footerAccentText = isSchools ? PLUM_600 : COPPER_600;
  // Width now scales with inventory (D1/AC2), same formula as Explore,
  // clamped to the combined-card range (150-206px) — `totalListingCount` is
  // the metric actually shown as the hero number in both journeys (a
  // pre-existing, out-of-scope gap: this card has never had a schools-count
  // hero — see the module doc above), so the scaling always uses the
  // residential divisor.
  const widthPx = inventoryScaledWidthPx(totalListingCount, false, true);
  const nameMaxWidthPx = widthPx - 28;

  // Issue #2305 STAGE 2 (P1, Gate F) — the hero number/unit split and the
  // zero-count guard phrase are the two NEWLY-DERIVED fields Option B needs
  // that have no existing escaped line to copy from (every other field above
  // already went through `escapeHtml` before this stage). Escaped
  // individually here, matching the discipline every other field on this
  // card follows — the zero-phrase reuses the already-escaped `listingsLabel`
  // rather than re-typing the locked 'No listings yet' string a second time
  // (formatListingCount owns that string; never duplicated here).
  const heroNumberHtml =
    totalListingCount > 0 ? escapeHtml(totalListingCount.toLocaleString('en-IN')) : undefined;
  const heroUnitHtml =
    totalListingCount > 0 ? escapeHtml(totalListingCount === 1 ? 'listing' : 'listings') : undefined;
  const zeroPhraseHtml = totalListingCount > 0 ? undefined : listingsLabel;

  // Issue #2345 — the residential listings hero (count/unit line, and the
  // 'No listings yet' zero-phrase) is OMITTED entirely in the schools
  // journey. This card never shows a school-count metric either (see the
  // locked module doc above: summing member `schoolCount`s would
  // double-count across areas), so a schools-journey card correctly shows
  // NO hero metric at all — identity name + the existing "+N areas"
  // count-label badge + footer only. Before this fix, `heroRow` had no
  // journey branch, so a residential listings number stayed visible after
  // switching to the schools journey (the marker's `setIcon` DID fire on
  // journey switch — journeyAttr/accent differ — but the swapped-in HTML
  // still carried the stale residential metric).
  const heroRow = isSchools
    ? ''
    : zeroPhraseHtml != null
      ? `<span style="font-family:${FONT_SANS_ATTR};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C_MUTED};margin-top:2px;">${zeroPhraseHtml}</span>`
      : `<span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">` +
        `<span style="font-family:${FONT_MONO_ATTR};font-size:20px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${heroNumberHtml}</span>` +
        `<span style="font-family:${FONT_SANS_ATTR};font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C_MUTED};">${heroUnitHtml}</span>` +
        `</span>`;

  const identityHtml =
    `<span style="font-family:${FONT_SANS_ATTR};font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${nameMaxWidthPx}px;">${namesLabel}</span>` +
    heroRow +
    `<span style="font-family:${FONT_SANS_ATTR};margin-top:${isSchools || zeroPhraseHtml != null ? 4 : 3}px;padding:1px 9px;border-radius:${RADIUS_FULL};background:rgba(27,42,69,0.08);font-size:10px;font-weight:600;color:${GREY_700};white-space:nowrap;">${countLabelHtml}</span>`;

  // Issue #2088 (commits 2+3) — ported to the shared markerPrimitives
  // fragments + markerTokens constants (byte-identical for every attribute
  // that existed before this issue), PLUS the new `data-node-key` (commit 3
  // — see this function's parameter doc above for why it is prefixed and
  // safe). `selected` is only set when this cluster is actually focused —
  // omitted otherwise, matching every other marker's contract (omitted when
  // not applicable).
  const clusterShellAttrs = markerInteractiveAttrs({
    testId: 'area-visual-cluster-marker',
    nodeKey: `visual-cluster:${escapeHtml(membershipKey)}`,
    selected: isFocusedSelected || undefined,
    ariaLabel,
  });
  const html = markerShellHtml({
    shellAttrs: clusterShellAttrs,
    titleAttr,
    actionKind: 'zoom',
    journey: isSchools ? 'schools' : 'areas',
    widthPx,
    isSelected: isFocusedSelected,
    journeyAttr,
    fontSansAttr: FONT_SANS_ATTR,
    identityHtml,
    footerIconHtml: zoomGlyphSvg(footerAccentText),
    footerLabelText: 'Zoom in',
  });
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
  autoAdvanceSelectNode,
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

  // ── AREA / Local-Destination real geography (Issue #1956 PR 3, Slice 4) ──
  // Recompute grouping on zoom only (grid clustering is a pure function of
  // projected pixel position at a given zoom) — the same pan-invariant
  // trigger convention as the legacy degraded path below in AreaMarkerLayer.
  //
  // Issue #1943 (Slice B+C merge) — 'clusters'/'directions' now ALSO route
  // through footprint-aware clustering (see the main effect below), so they
  // need the same zoom-driven recompute 'areas' already had.
  const [areasZoomTick, setAreasZoomTick] = useState(() => map.getZoom());
  // Issue #1943 (no-redundant-singleton amendment) — a SETTLED-zoom signal,
  // separate from `areasZoomTick` above. Leaflet's `zoomend` fires at EVERY
  // intermediate stop of an animated multi-level flyTo/fitBounds, not only
  // once the camera has actually finished moving — a live-verification pass
  // (real dev stack, not the unit-test mocks) found that the singleton
  // auto-advance below reacting to every one of those intermediate frames
  // could expose a still-settling child as its own clickable marker several
  // frames BEFORE the camera actually stopped, racing a fast (automated or
  // real) click against a presentation that was about to change again a
  // moment later. The owner's binding invariant is explicitly about
  // the STEADY-STATE presentation ("...the steady-state map must not show
  // one synthetic marker...", PLAN_REVIEW packet 010's owner ruling) — this
  // debounce is what makes "steady-state" a real, checkable condition rather
  // than "whatever the most recent intermediate animation frame happened to
  // compute". `areasZoomTick` itself stays UNDEBOUNCED (unchanged behaviour
  // for the plain, non-escalated clustering path, which this amendment must
  // not alter) — only the escalation gate below reads `hasSettledZoom`.
  const SETTLE_DEBOUNCE_MS = 650;
  const [settledZoomGeneration, setSettledZoomGeneration] = useState(0);
  const lastZoomEndAtRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (levelKind !== 'areas' && levelKind !== 'clusters' && levelKind !== 'directions') return;
    // Issue #1943 — a real node's projected screen position was found to
    // differ by tens of pixels between two consecutive re-renders even
    // though its lat/lon was unchanged: the camera was still GENUINELY
    // MOVING (a pan, not just a zoom) between them. The original debounce
    // below only ever subscribed to `zoomend`, so a pure pan (no zoom-level
    // change) never reset it. `moveend` is Leaflet's own "camera is now at
    // rest, whether from a pan OR a zoom" event — both are now watched, so
    // `hasSettledZoom` (see below) genuinely means settled, not merely "no
    // zoom change recently".
    const onCameraSettling = () => {
      setAreasZoomTick(map.getZoom());
      lastZoomEndAtRef.current = Date.now();
      if (settleTimerRef.current != null) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        setSettledZoomGeneration((g) => g + 1);
      }, SETTLE_DEBOUNCE_MS);
    };
    map.on('zoomend', onCameraSettling);
    map.on('moveend', onCameraSettling);
    return () => {
      map.off('zoomend', onCameraSettling);
      map.off('moveend', onCameraSettling);
      if (settleTimerRef.current != null) clearTimeout(settleTimerRef.current);
    };
  }, [map, levelKind]);
  const hasSettledZoom = Date.now() - lastZoomEndAtRef.current >= SETTLE_DEBOUNCE_MS;

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

  // Issue #1943 (singleton auto-advance, PR #2368 owner ruling 2026-08-28) —
  // idempotence guard for a REAL-CHILD auto-advance (goToNodeReplacingCurrent).
  // Firing it changes `node` itself on the next render (a genuinely new
  // nodeKey), so a plain nodeKey-keyed guard is correct and sufficient here —
  // a semantic-state guard, never a wall-clock debounce.
  const autoAdvancedNodeKeyRef = useRef<string | null>(null);
  // Issue #1943 (PR #2368 exact-head review, BLOCKING fix) — a SEPARATE guard
  // for the client-only visual-cluster (camera-only) auto-advance. That
  // branch deliberately leaves `node=` unchanged (see the branch below), so
  // keying idempotence off `node.nodeKey` alone (the previous, buggy
  // behaviour) permanently blocked a SECOND legitimate auto-advance at the
  // same node — even when a closer settled camera still resolves to exactly
  // one synthetic catch-all (recursive declutter, which this file's own
  // contract explicitly allows), leaving the user with a redundant click.
  // Keyed on (node, membership, actual settled zoom) instead — see the
  // camera branch below for why this is both a correct idempotence guard
  // AND a no-op ceiling guard against ever looping on an unchanged camera.
  const autoAdvancedCameraSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const registry = areaMarkerRegistryRef.current;
    if (!node || (levelKind !== 'areas' && levelKind !== 'clusters' && levelKind !== 'directions')) {
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
      {
        latlng: [number, number];
        icon: L.DivIcon;
        html: string;
        onClick: () => void;
        hoverKey: string | null;
      }
    >();
    // Shared by 'areas' AND (Issue #1943 Slice B+C merge) 'clusters'/
    // 'directions' — the map's own lat/lon -> container-pixel projection,
    // never hand-rolled.
    const project: AreaClusterProjectFn = (lat, lon) => {
      const pt = map.latLngToContainerPoint([lat, lon]);
      return { x: pt.x, y: pt.y };
    };

    if (levelKind === 'clusters' || levelKind === 'directions') {
      // Issue #1943 (Slice B+C merge) — 'clusters' ("Local Destination")
      // and 'directions' (compass Direction) children BOTH now route through
      // the SAME footprint-aware `clusterAreaMembers` the 'areas' level
      // already uses (identityKey generalisation, areaClustering.ts), rather
      // than the naive 80px point-repulsion loop this replaces. This is a
      // FUNCTIONAL change, not a refactor: 'directions' cards are now
      // positioned by rectangle-aware clustering, matching AC3 of the
      // approved plan. Neither level applies journey-aware visibility here
      // (they are STRUCTURAL levels — journeyVisibility.ts's module doc:
      // never eligibility-hidden), exactly matching this branch's
      // pre-existing behaviour (neither the old 'clusters' loop nor the old
      // 'directions' repulsion loop filtered by eligibility either).
      const destinationMembers: (ClusterableDestination & { nodeKey: string })[] = [];
      for (const child of children) {
        const raw = rawByNodeKey.get(child.nodeKey);
        if (!raw || !isUsableCentroid(raw.centreLat, raw.centreLon)) continue;
        destinationMembers.push({
          nodeKey: child.nodeKey,
          identityKey: child.nodeKey,
          displayLabel: child.displayLabel,
          lat: raw.centreLat as number,
          lon: raw.centreLon as number,
          listingCount: child.listingCount,
          displayOrder: child.displayOrder,
          schoolCount: child.schoolCount,
        });
      }

      // FOOTPRINT SOURCE (approved plan) — dimensions come from
      // destinationCardFootprint.ts's calibrated estimator, NEVER from
      // areaClustering.ts's own AREA_CARD_FOOTPRINT_* constants. A single,
      // conservative (over-estimating, per that module's safe-direction
      // invariant) footprint is used for the whole batch: the MAX width/
      // height across every child's own estimate, so the merge pass never
      // under-estimates any individual card.
      let footprintWidthPx = 0;
      let footprintHeightPx = 0;
      for (const child of children) {
        const estimate = estimateDestinationCardFootprint({
          displayLabel: child.displayLabel,
          listingCount: child.listingCount,
          schoolCount: child.schoolCount,
          journey: eligibilityJourney,
        });
        footprintWidthPx = Math.max(footprintWidthPx, estimate.widthPx);
        footprintHeightPx = Math.max(footprintHeightPx, estimate.heightPx);
      }

      // FIX B1 (main-agent-ruling-b1-footprint-floor.toml) — P1's rewrite of
      // `makeAreaVisualClusterCard` into the shared Option-B builder means
      // THIS 'clusters'/'directions' path can now also paint the fixed
      // 172x140 Option-B card (see the call below), while the estimate loop
      // above still sizes the batch footprint from
      // `estimateDestinationCardFootprint`, which can return as little as
      // `BASE_HEIGHT_PX` (120) when every child's schoolCount is null/0 — 20px
      // UNDER the 140px a real Option-B card can paint. An under-estimate is
      // the one direction that breaks the no-overlap invariant
      // (areaClustering.ts:177-179: an over-estimate merely causes an extra,
      // accepted merge). Floor the batch footprint with the SAME Option-B
      // constants already imported above for the 'areas' site (never a
      // re-typed literal) so this batch bound always covers the card it can
      // actually emit.
      footprintWidthPx = Math.max(footprintWidthPx, VISUAL_CLUSTER_CARD_WIDTH_PX);
      footprintHeightPx = Math.max(footprintHeightPx, VISUAL_CLUSTER_CARD_HEIGHT_PX);

      // Issue #2305 STAGE 2 (P2, main-agent-ruling-accent-scope.toml) — this
      // 'clusters'/'directions' visual-cluster accent must flip to COPPER_500
      // in lockstep with the 'areas' site below: P1 rewrote BOTH call sites'
      // shared builder onto the same Option B markup, so leaving only one
      // site flipped would ship a copper-vs-navy divergence between levels
      // that does not exist on main today. Supersedes the #2088-AC8 comment
      // that used to justify C_NAVY here — that rationale predates Option B
      // and no longer governs this call site.
      const destinationAccent = journey === 'school-first' ? PLUM_600 : COPPER_500;
      const destinationJourneyAttr = journey === 'school-first' ? 'data-journey="schools"' : '';
      const clusterResult = clusterAreaMembers(destinationMembers, project, areasZoomTick, {
        footprintWidthPx,
        footprintHeightPx,
      });

      type DestinationCell = (typeof clusterResult.clusters)[number];

      // Issue #1943 (singleton auto-advance, PR #2368 owner ruling
      // 2026-08-05) — when the current rendered state resolves to exactly
      // ONE interactive cell — a genuine single real child
      // (`destinationMembers.length === 1`) or every real child collapsing
      // onto one screen point (a client-only visual-cluster catch-all) —
      // this fires the SAME transition a manual click on that lone marker
      // already performs, automatically, rather than fabricating a new
      // spatial arrangement: `effectiveClusters` is always the plain,
      // non-escalated `clusterResult.clusters` — a navigation/camera
      // transition, never a new layout. `hasSettledZoom` gates this on the
      // STEADY-STATE camera only (see the debounce's own doc comment above)
      // — a still-animating intermediate frame renders the plain singleton
      // for that one frame, exactly as it always has.
      const effectiveClusters: readonly DestinationCell[] = clusterResult.clusters;
      const singletonCell =
        hasSettledZoom && clusterResult.clusters.length === 1 ? clusterResult.clusters[0] : null;

      if (singletonCell && node) {
        if (singletonCell.members.length === 1) {
          // A genuine single real child. Auto-advance ONLY when it has
          // further children of its own to reveal — never an AREA leaf
          // (`isLeafArea`), whose selection is a genuine terminal
          // reachability action (a listings destination), not an
          // unnecessary intermediate click through more markers.
          const onlyChild = singletonCell.members[0];
          // `isLeafArea` lives on the TYPED `AreasNavigationChild` (`children`
          // prop), never on the raw `NavigationChildSummary` (`node.children`
          // / `rawByNodeKey`) — that raw wire shape carries no such field.
          const typedChild = children.find((c) => c.nodeKey === onlyChild.nodeKey);
          if (typedChild && !typedChild.isLeafArea && autoAdvancedNodeKeyRef.current !== node.nodeKey) {
            autoAdvancedNodeKeyRef.current = node.nodeKey;
            autoAdvanceSelectNode?.(onlyChild.nodeKey);
          }
        } else {
          // A client-only visual cluster spanning every reachable child —
          // reuse the EXISTING camera/focus transition a manual click on
          // this same cluster already fires below (the `cell.members.length
          // > 1` branch in the emission loop), never `onSelect`/
          // `autoAdvanceSelectNode` — this is not a real node and must never
          // write `node=`.
          //
          // Idempotence here CANNOT be keyed on `node.nodeKey` alone (unlike
          // the real-child branch above): this branch deliberately never
          // changes `node`, so a plain nodeKey guard would permanently block
          // every subsequent auto-advance at this node — including a second,
          // LEGITIMATE one, if a closer settled camera still resolves to
          // exactly one synthetic catch-all (recursive declutter is
          // explicitly in-design; see the emission loop's own comment on the
          // multi-member cluster-card click below). The signature below keys
          // on the actual settled zoom (`areasZoomTick`, updated only once
          // per real camera settle) plus this cell's own membership — so the
          // SAME presentation at the SAME camera fires at most once (the
          // no-op ceiling guard: if the camera genuinely cannot advance
          // further, `areasZoomTick` cannot change either, so the signature
          // repeats and this never loops), while a genuinely closer settled
          // camera that is STILL a singleton produces a new signature and is
          // free to advance again.
          const membershipKey = singletonCell.members
            .map((m) => m.identityKey)
            .sort()
            .join('|');
          const cameraSignature = `${node.nodeKey}:${membershipKey}:${areasZoomTick}`;
          if (autoAdvancedCameraSignatureRef.current !== cameraSignature) {
            const bounds = boundsOfMembers(singletonCell.members);
            if (bounds) {
              autoAdvancedCameraSignatureRef.current = cameraSignature;
              onAreaVisualClusterCameraIntent?.(
                [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
                [singletonCell.anchor.lat, singletonCell.anchor.lon],
              );
            }
          }
        }
      }

      {
        // clusterAreaMembers's OWN output order is identityKey-sorted (a
        // deterministic TOTAL order — see areaClustering.ts's module doc), not
        // the server's `children` sibling order. Emission below iterates
        // `children` in their ORIGINAL order instead — several existing
        // marker-creation-order-dependent tests (and, more importantly,
        // consistent map behaviour across re-renders) rely on that stable
        // ordering, and nothing about the clustering DECISION itself depends
        // on emission order. A multi-member cell is emitted exactly ONCE, at
        // `cell.anchor` — the members' centroid, a position no raw member
        // occupies. Only which member's `children`-order position is
        // encountered FIRST (`emittedClusterKeys` below) is what that
        // iteration order controls — the emitted card's own position is
        // always the centroid, never any one member's.
        const cellByNodeKey = new Map<string, DestinationCell>();
        for (const cell of effectiveClusters) {
          for (const member of cell.members) {
            cellByNodeKey.set(member.nodeKey, cell);
          }
        }
        const emittedClusterKeys = new Set<string>();

        for (const child of children) {
          const cell = cellByNodeKey.get(child.nodeKey);
          if (!cell) continue; // omitted (unusable centroid) — never rendered, never fabricated.

          if (cell.members.length === 1) {
            // REACHABILITY INVARIANT (AC5) — a single-member cell renders the
            // existing makeDestinationCard and calls onSelect(nodeKey) exactly
            // as today.
            const member = cell.members[0];
            const isSelected = selectedNodeKey === child.nodeKey;
            const isHovered = hoveredNodeKey === child.nodeKey;
            const icon = makeDestinationCard(child, isSelected, isHovered, eligibilityJourney);
            desired.set(child.nodeKey, {
              latlng: [member.lat, member.lon],
              icon,
              html: String(icon.options.html),
              onClick: () => onSelect(child.nodeKey),
              hoverKey: child.nodeKey,
            });
            continue;
          }

          // REACHABILITY INVARIANT (AC5) — a multi-member cluster card must
          // NOT call onSelect and must NOT touch `node=`; it publishes the
          // camera intent + focused members, mirroring the existing 'areas'
          // visual-cluster precedent in this file verbatim. Recursive
          // declutter is IN-DESIGN: drilling into this camera intent may
          // itself land on a still-decluttered state at the closer zoom — it
          // terminates because each drill-in strictly reduces the rendered
          // child set (this cell's own membership).
          // Membership-only registry key (never anything else derived from
          // presentation state) — so a re-render with the same membership
          // set is always an ordinary icon/position update to the diff below
          // (existing.html/existing.latlng), never a teardown/rebuild that
          // could race a real click against the marker mid-recreation.
          const membershipKey = cell.members.map((m) => m.identityKey).join('|');
          const registryKey = `cluster:${membershipKey}`;
          if (emittedClusterKeys.has(registryKey)) continue;
          emittedClusterKeys.add(registryKey);

          const { representativeNames, countResult } = presentDestinationClusterRepresentatives(
            cell.members,
            eligibilityJourney,
          );
          const totalListingCount = cell.members.reduce((sum, m) => sum + m.listingCount, 0);
          const baseIcon = makeAreaVisualClusterCard(
            representativeNames,
            countResult.label,
            totalListingCount,
            destinationAccent,
            membershipKey,
            // No focus concept exists for a 'clusters'/'directions' visual
            // cluster (unlike the 'areas' site below) — never focused.
            false,
            destinationJourneyAttr,
          );
          desired.set(registryKey, {
            latlng: [cell.anchor.lat, cell.anchor.lon],
            icon: baseIcon,
            html: String(baseIcon.options.html),
            onClick: () => {
              const bounds = boundsOfMembers(cell.members);
              if (bounds) {
                onAreaVisualClusterCameraIntent?.(
                  [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
                  [cell.anchor.lat, cell.anchor.lon],
                );
              }
              // A visual cluster is client-side only — never calls onSelect,
              // never changes node=, never touches history.
            },
            // Not a real node — no hover-highlight state to report.
            hoverKey: null,
          });
        }
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
          // Issue #1943 (Slice B+C merge) — the AREA path's adapter
          // convention: identityKey = areaKey, so every cellKey, sort order
          // and merge order stays byte-identical to before the identityKey
          // generalisation (see areaClustering.ts's module doc and the
          // pre-rename golden characterisation test).
          identityKey: raw.areaKey,
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
        // Issue #2124/#2125 blocker — mixed-eligibility cluster never opens.
        // `clusterVisibleAreaMembers` (below, and used for the actual
        // grouping) already treats every clusterable member as visible for
        // the 'schools' journey — a zero-school AREA is still valid
        // canonical geography, not eligibility-hidden (see its own inline
        // `journey === 'schools' ? true : isMemberEligible(...)` special
        // case). This reconciliation check must use the SAME visibility
        // rule: `partitionMembersByJourney`'s raw eligibility (schoolCount >
        // 0) is a different, narrower notion used elsewhere (panel counts/
        // +N arithmetic) and must not leak in here. Without this, tapping a
        // real mixed cluster (e.g. one member schoolCount=0, another >0) set
        // focus and then this effect immediately cleared it on the very same
        // render, because `stillAllVisible` saw the zero-school member as
        // "not visible" — the whole cluster silently became unclickable.
        // The 'areas' (listings) journey is untouched: it still hides a
        // zero-listing member here exactly as before.
        const visibleAreaKeys =
          eligibilityJourney === 'schools'
            ? new Set(clusterable.map((m) => m.areaKey))
            : new Set(
                partitionMembersByJourney(
                  clusterable.map((m) => ({
                    areaKey: m.areaKey,
                    displayLabel: m.displayLabel,
                    eligibleListingCount: m.listingCount,
                    eligibleSchoolCount: m.schoolCount ?? 0,
                    displayOrder: m.displayOrder,
                  })),
                  eligibilityJourney,
                ).visible.map((m) => m.areaKey),
              );
        const stillAllVisible = focusedMembers.every((k) => visibleAreaKeys.has(k));
        if (!stillAllVisible) {
          setFocusedMembers(null);
          return;
        }
      }

      // `project` is now declared once, above, shared with the
      // 'clusters'/'directions' branch (Issue #1943 Slice B+C merge).
      const scoped = focusedMembers
        ? clusterable.filter((m) => focusedMembers.includes(m.areaKey))
        : clusterable;

      // Issue #2305 STAGE 2 (P5) — the Option B card's fixed footprint,
      // never a locally re-typed literal (areaClustering.ts:172's drift
      // warning): the SAME `VISUAL_CLUSTER_CARD_WIDTH_PX`/`_HEIGHT_PX`
      // exported from markerPrimitives.ts is passed into
      // `clusterVisibleAreaMembers` below as the COLLISION-footprint override
      // ONLY (per AMEND-A). It no longer feeds the card's own PAINTED width —
      // that is now computed independently by `inventoryScaledWidthPx` (see
      // its call sites above, ~:757/:980), which AMEND-A explicitly decoupled
      // from this collision geometry. Do NOT reinstate an "also feeds painted
      // width" claim here — that is the exact drift this note exists to
      // prevent.
      //
      // CORRECTED (fix N2, main-agent-ruling-b1-footprint-floor.toml) — the
      // comment that used to stand here claimed `AREA_CARD_FOOTPRINT_WIDTH_PX`/
      // `_HEIGHT_PX` (110/100) "still govern makeSingleAreaChildCard's
      // single-member cells via this same clusterResult — only the
      // multi-member merge geometry changes". That was FALSE:
      // `areaClustering.ts:358-359` resolves the footprint override ONCE for
      // the whole clustering pass, so every cell in `clusterResult` — single-
      // member cells included — is reasoned about at 172x140 during grouping,
      // even though a single-member cell still PAINTS at the smaller
      // 110x100 `AREA_CARD_FOOTPRINT_*` size via `makeSingleAreaChildCard`
      // below. Net effect: two single areas that would have stayed separate
      // under the old 110x100 grouping footprint can now merge into one
      // visual cluster instead. This is a real density change, not a no-op —
      // accepted as the safe/conservative direction (an extra merge, never a
      // missed one, per areaClustering.ts:177-179), same disposition as B1's
      // fix at the 'clusters'/'directions' call site above.
      const clusterResult = clusterVisibleAreaMembers(scoped, eligibilityJourney, project, areasZoomTick, {
        footprintWidthPx: VISUAL_CLUSTER_CARD_WIDTH_PX,
        footprintHeightPx: VISUAL_CLUSTER_CARD_HEIGHT_PX,
      });
      // Issue #2305 STAGE 2 (P2, main-agent-ruling-accent-scope.toml) —
      // supersedes the #2088-AC8 comment that used to justify C_NAVY here.
      // Item 2 (AC8) originally made the residential dashed visual-cluster
      // card navy instead of copper; Option B (this issue) replaces that
      // dashed-card markup entirely, and the user ruled that BOTH
      // `makeAreaVisualClusterCard` call sites (this one and the
      // 'clusters'/'directions' site above) flip to COPPER_500 together —
      // P1's shared-builder rewrite means leaving only one flipped would
      // ship a copper-vs-navy divergence between levels that doesn't exist
      // on main today. The legacy dense-degradation AreaMarkerLayer's
      // separate `accent` (used by makeDotIcon/makeClusterIcon further
      // below) remains deliberately untouched — not the mock-governed AC8
      // grammar this item ever targeted, per Issue #2088 item 3.
      const accent = journey === 'school-first' ? PLUM_600 : COPPER_500;
      const journeyAttr = journey === 'school-first' ? 'data-journey="schools"' : '';

      for (const cell of clusterResult.clusters) {
        if (cell.members.length === 1) {
          const member = cell.members[0];
          const childCounts = children.find((c) => c.nodeKey === member.nodeKey);
          if (!childCounts) continue;
          const isSelected = selectedNodeKey === member.nodeKey;
          const isHovered = hoveredNodeKey === member.nodeKey;
          const icon = makeSingleAreaChildCard(childCounts, isSelected, isHovered, eligibilityJourney);
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
          const icon = makeAreaVisualClusterCard(
            representativeNames,
            countResult.label,
            totalListingCount,
            accent,
            membershipKey,
            // Issue #2305 STAGE 2 (P3) — this cluster is the current
            // focused/selected one exactly when a controlled focus is set at
            // all: a focused render's `scoped`/clusterResult only ever
            // contains the focused members, so every cell rendered here IS
            // the focused cluster whenever `focusedMembers` is non-null.
            focusedMembers != null,
            journeyAttr,
          );
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
      }
      // D2 (Issue #2330, R2) — the keyboard focus-ring painter is gated on
      // WHETHER THE EMITTED MARKUP CONTAINS `.rc-shell`, never on
      // `hoverKey == null`. Before #2330 only the visual cluster
      // (`hoverKey: null`) ever emitted `.rc-shell`; the shared
      // `markerShellHtml` primitive now means Explore/Zoom/View-homes/
      // View-schools ALL emit it too, including real nodes with a non-null
      // `hoverKey`. Gating on `hoverKey == null` (the pre-#2330 branch this
      // replaces) would leave those real-node markers with index.css's
      // `!important` hover/focus "lift" rule firing (it now keys on
      // `.rc-shell` generically) but NO ring ever painted — a hover-looking
      // lift with no focus indicator at all, strictly worse than today. This
      // check runs INDEPENDENTLY of the hover-report block above, so a real
      // node's marker gets both the hover-report listeners AND the ring
      // listeners below.
      if (marker.getElement()?.querySelector<HTMLElement>('.rc-shell')) {
        // UD-2 (fix-cycle-4) — the outer div (`el`, the `role="button"`
        // element `shellAttrs` carries) sets `outline:none` INLINE. A
        // class-based rule can never beat that: an inline style
        // declaration outranks any selector-based author declaration
        // regardless of layers/specificity, so a stylesheet class (the
        // previous `.area-marker-kbd-focus` approach, since reverted from
        // index.css) never painted anything. Set the focus indicator as an
        // INLINE style instead — the only thing guaranteed to win — mirroring
        // every other visual property on this divIcon (literal values, no CSS
        // pipeline). Uses a navy ring (C_NAVY, same token as this file's
        // leader-line/anchor-dot color). It is a SOLID box-shadow ring offset
        // outward by a 2px white gap, never a color repaint of the shell's
        // own border — the white-gap ring reads as "focus", not "a slightly
        // different border", for either accent. Cleared to '' on blur (never
        // toggled via a class) so activation (Enter/Space, bound above) is
        // unaffected either way.
        //
        // FIX N3 (main-agent-ruling-b1-footprint-floor.toml bundle) — the
        // ring is applied to `ringEl` (the `.rc-shell` element, which carries
        // the card's actual border-radius), NOT to `el` (the outer
        // `role="button"` wrapper `shellAttrs` sits on — see
        // `markerPrimitives.ts`'s `visualClusterCardHtml`: the outer div gets
        // `shellAttrs`, the INNER `.rc-shell` div gets the border-radius).
        // Querying `el` for the ring (the previous behaviour) painted a
        // rounded rectangle around `.rc-shell` PLUS the 7px `.rc-tail`
        // triangle below it, leaving a visible gap around the tail — this
        // resolves `ringEl` fresh from the marker's current DOM every call
        // (same "never a captured reference" discipline as `el` above) and
        // falls back to `el` itself for any marker type that has no
        // `.rc-shell` (i.e. every marker OTHER than the Option-B visual-
        // cluster card), preserving today's ring behaviour there unchanged.
        // `el` itself STILL owns the keydown/focus/blur LISTENERS (event
        // delegation would be needlessly indirect) — only the ring's
        // borderRadius/boxShadow move to `ringEl`.
        //
        // This also resolves the double-ring stack the old `el`-targeted ring
        // caused on a focused+selected Option-B cluster: `.rc-shell` already
        // carries its OWN static navy double-ring `box-shadow` (see
        // `visualClusterCardHtml`'s `shellBoxShadow` when `isFocusedSelected`)
        // set as part of its HTML `style="..."` attribute. Because the ring
        // below now writes `ringEl.style.boxShadow` on that SAME element
        // (rather than a second, different element), the JS-applied value
        // REPLACES that inline declaration on focus (never stacks two rings
        // on two boxes).
        //
        // RESTORE-ON-BLUR — unlike the fallback `el` (which never carries a
        // border-radius/box-shadow of its own in its HTML, so clearing those
        // inline properties to `''` on blur is always safe), `.rc-shell`
        // ALWAYS has a real, non-empty `border-radius`/`box-shadow` baked
        // into its HTML `style="..."` attribute (RADIUS_LG unconditionally;
        // either the plain `SHADOW_LG` drop shadow or the static
        // `isFocusedSelected` double-ring, from `visualClusterCardHtml`).
        // Clearing those to `''` on blur (the naive port of the old `el`
        // logic) would strip that legitimate styling entirely instead of
        // restoring it. The `.rc-shell` branch below therefore never touches
        // `borderRadius` at all (it is already correct at every state) and
        // captures the pre-focus `boxShadow` value once (via a `dataset`
        // marker, so a re-focus before the first blur doesn't overwrite the
        // captured original with the ring value) and restores that exact
        // captured value on blur — reverting to `SHADOW_LG` OR the static
        // double-ring, whichever the HTML actually set, never to blank.
        //
        // Issue #2305 STAGE 2 (P4) — borderRadius uses RADIUS_LG (12px, a
        // REAL 2px change from the prior '14px' literal) so this JS-applied
        // ring matches the radius `visualClusterCardHtml` actually sets on
        // `.rc-shell` itself, rather than coincidentally referencing the
        // same value via two independent literals.
        // FIX CYCLE 2 (real-browser QA, post-N3) — index.css:462-466's
        // `:focus-within .rc-shell { box-shadow: ...!important; }` rule
        // (Stage 1, dormant until N3 activated it by moving the ring onto
        // `.rc-shell`) OUTRANKS a plain inline `box-shadow`: an `!important`
        // author-stylesheet declaration beats a NON-`!important` inline
        // style, so the ring below was being fully overridden by that rule's
        // hover/focus "lift" shadow the instant this actually ran against
        // the real stylesheet (invisible in jsdom, which never loads
        // index.css — the prior jsdom-only proof was a false green for THIS
        // class of defect). Per the CSS cascade, an `!important` declaration
        // in a style ATTRIBUTE beats an `!important` author-stylesheet
        // declaration, so this now uses `setProperty(..., 'important')`
        // instead of a plain assignment on the `.rc-shell` branch — the `el`
        // fallback branch is untouched by this fix (no `!important` author
        // rule targets the outer wrapper).
        //
        // COMPOSED, not replaced — the stylesheet rule exists to give
        // hover/focus a raised-card "lift" emphasis (the same rule also
        // fires on `:hover`), and simply overriding its box-shadow with the
        // ring alone would silently drop that lift for keyboard focus while
        // leaving it intact for mouse hover — an inconsistent, worse
        // regression than the one this fixes. The focus value below is the
        // ring PLUS `RC_SHELL_FOCUS_LIFT_SHADOW` (index.css:465's exact
        // value) as extra box-shadow layers in the SAME declaration, so a
        // focused shell shows both.
        el?.addEventListener('focus', () => {
          const shellEl = marker.getElement()?.querySelector<HTMLElement>('.rc-shell');
          const ringEl = shellEl ?? el;
          if (shellEl) {
            if (ringEl.dataset.rcRingOrigShadow === undefined) {
              ringEl.dataset.rcRingOrigShadow = ringEl.style.boxShadow;
            }
            ringEl.style.setProperty(
              'box-shadow',
              `0 0 0 2px ${C_PAPER}, 0 0 0 4px ${C_NAVY}, ${RC_SHELL_FOCUS_LIFT_SHADOW}`,
              'important',
            );
            // border-radius is NOT contested by any `!important` author rule
            // (index.css:462-479's hover/focus-within block only ever sets
            // `transform`/`box-shadow`/`background`) — verified before
            // adding this, per the "check first, do not add it blindly"
            // instruction, so it is deliberately left untouched here; the
            // shell's own inline RADIUS_LG (baked into the HTML by
            // `visualClusterCardHtml`) already wins unconditionally.
          } else {
            ringEl.style.borderRadius = RADIUS_LG;
            ringEl.style.boxShadow = `0 0 0 2px ${C_PAPER}, 0 0 0 4px ${C_NAVY}`;
          }
        });
        el?.addEventListener('blur', () => {
          const shellEl = marker.getElement()?.querySelector<HTMLElement>('.rc-shell');
          const ringEl = shellEl ?? el;
          if (shellEl) {
            // Plain property assignment (never `setProperty(..., 'important')`
            // here) — assigning `style.boxShadow` clears any previously-set
            // `!important` priority on that property as part of resetting it,
            // so this correctly un-does the focus branch's `setProperty(...,
            // 'important')` rather than leaving a stale `!important` flag
            // permanently pinning the ring after blur (that would be a worse
            // bug than the one this fixes — the shell would stay ringed
            // forever, immune to hover's lift shadow too).
            ringEl.style.boxShadow = ringEl.dataset.rcRingOrigShadow ?? '';
            delete ringEl.dataset.rcRingOrigShadow;
          } else {
            ringEl.style.borderRadius = '';
            ringEl.style.boxShadow = '';
          }
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
    layoutTick,
    focusedMembers,
    onAreaVisualClusterCameraIntent,
    // Issue #1943 (no-redundant-singleton amendment) — re-run once the
    // settle-debounce above fires, so escalation gets a real chance to run
    // against the FINAL camera state even when `areasZoomTick` itself
    // stopped changing a moment earlier (the debounce's timer, not a new
    // zoomend, is what flips `hasSettledZoom` back to true).
    settledZoomGeneration,
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
  areaSetCandidateKeys,
  areaSetCandidateCounts,
  areaSetAtMax = false,
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
      //
      // Issue #1956 macro-region sibling ruling (2026-08-03) — region_key is
      // NOT guaranteed to already be in the CompassDirectionKey abbreviation
      // vocabulary; like the canonical Direction markers above, the backend
      // can emit full-word codes (e.g. "southeast"). area.areaKey is routed
      // through the SAME normalizeCompassRegionCode() normaliser used for
      // the Direction markers before reaching compassPointFor, so an
      // unrecognised/unnormalised code can never silently collapse onto the
      // layout centre here either.
      const [markerLat, markerLon] = area.isMacroRegion
        ? (() => {
            const point = compassPointFor(normalizeCompassRegionCode(area.areaKey), compassLayout);
            const latLng = map.containerPointToLatLng([point.x, point.y]);
            return [latLng.lat, latLng.lng] as const;
          })()
        : ([area.geo_center_lat, area.geo_center_lon] as const);

      // Issue #2017 — while the multi-area AREA_SET draft panel is open, a
      // caller-designated subset of areas (current draft members + nearby
      // suggestions) render as the actionable candidate callout instead of
      // their normal marker.
      const isAreaSetCandidate = areaSetCandidateKeys?.includes(area.areaKey) ?? false;

      const marker = L.marker(
        [markerLat, markerLon],
        {
          icon: isAreaSetCandidate
            ? makeAreaSetCandidateCard(area, 1.0, areaSetAtMax, areaSetCandidateCounts?.[area.areaKey])
            : makeAreaCard(area, 1.0, journey, selectedSchool),
        }
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
        if (isAreaSetCandidate) {
          // Issue #2456 (owner ruling) — an AREA_SET draft-member card is
          // inert while the editor is open: it neither adds to the draft
          // (the panel is the only Add path) nor navigates away from the
          // draft via onAreaClick/onAreaCameraIntent.
          return;
        }
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

      // Issue #2456 (owner ruling) — no Enter/Space → click bridge for the
      // AREA_SET draft-member card any more: its click is inert (above), so
      // there is deliberately no keyboard path either.
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
  }, [areas, map, onAreaClick, onAreaCameraIntent, focusedGroupAreas, journey, selectedSchool, enableDegradation, regionLayoutTick, areaSetCandidateKeys, areaSetCandidateCounts, areaSetAtMax]);

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
      // Issue #2017 — same candidate-callout override as the legacy loop above.
      const isAreaSetCandidate = areaSetCandidateKeys?.includes(area.areaKey) ?? false;
      const marker = L.marker([area.geo_center_lat, area.geo_center_lon], {
        icon: isAreaSetCandidate
          ? makeAreaSetCandidateCard(area, 1.0, areaSetAtMax, areaSetCandidateCounts?.[area.areaKey])
          : makeAreaCard(area, 1.0, journey, selectedSchool, !isForced),
      });
      // Issue #1801 — same click contract as the legacy loop above: no direct
      // camera call here. onAreaCameraIntent publishes the optimistic intent;
      // MapController is the sole camera owner.
      marker.on('click', () => {
        if (isAreaSetCandidate) {
          // Issue #2456 (owner ruling) — same inert contract as the legacy
          // loop above: a draft-member card never mutates or leaves the draft.
          return;
        }
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

      // Issue #2456 (owner ruling) — same as the legacy loop: no keyboard
      // bridge for the inert AREA_SET draft-member card.
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
    areaSetCandidateKeys,
    areaSetCandidateCounts,
    areaSetAtMax,
  ]);

  return null;
}
