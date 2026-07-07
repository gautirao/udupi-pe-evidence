import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Circle, Marker, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import { formatPrice } from '@/lib/formatters';
import { getPropertyTypeVisual, GLYPH_SVG_PATHS } from '@/lib/propertyTypeConfig';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { PropertyListing, PropertyType, PropertyImage } from '@/hooks/usePropertyListings';
import { DrawControl } from '@/components/map/DrawControl';
import { AreaMarkerLayer, AreaPoint, type AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import { SchoolMarkerLayer } from '@/components/map/SchoolMarkerLayer';
import { SchoolZoneLabelLayer, type ZoneLabelPoint } from '@/components/map/SchoolZoneLabelLayer';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import { SectorOverlay } from '@/components/map/SectorOverlay';

/**
 * Maximum zoom at which the area-overview marker layer remains visible.
 *
 * Mirrors the canonical `AREA_LAYER_MAX_ZOOM` in `src/pages/MapDiscovery.tsx`
 * (importing from MapDiscovery would create a circular module dependency,
 * since MapDiscovery imports PropertyMap). A drift-guard test in
 * `PropertyMap.areaPanner.test.tsx` asserts both constants stay in sync.
 *
 * Used by AreaPanner: when fitBounds receives a synthetic group-bounds
 * AreaPoint (areaKey === GROUP_BOUNDS_SYNTHETIC_KEY), clamping maxZoom to
 * this value keeps narrow groups (e.g. University Belt) within the zoom
 * band where the area-overview markers are still rendered (issue #1069).
 */
export const AREA_PANNER_GROUP_MAX_ZOOM = 12;

/**
 * Max zoom for SchoolMarkerFocusPanner fitBounds (issue #1240).
 *
 * Why 13: a 5 km radius circle (10 km diameter) only fits the viewport at
 * zoom ≤ 13. When markers cluster tightly near the school, the
 * markerBounds ∩ radiusBounds intersection collapses to markerBounds and an
 * uncapped fitBounds zooms to ~15-17, pushing the radius circle off-screen.
 * 13 matches the anonymous URL zoom so the signed-in and anonymous
 * experiences stay consistent. 13 > AREA_LAYER_MAX_ZOOM (12) so capping here
 * does NOT retrigger the area-ring layer.
 *
 * Only SchoolMarkerFocusPanner is capped here — SchoolFocusPanner (Phase 1)
 * is intentionally left uncapped (qa-fast latent-debt note, issue #1240).
 */
export const SCHOOL_MARKER_FOCUS_MAX_ZOOM = 13;

// Extended listing with images for map display
export interface PropertyListingWithImages extends PropertyListing {
  images?: PropertyImage[];
  /** Issue #1373 — GeoJSON Polygon string for agri listings, forwarded from DiscoverFilteredMarker via filteredMarkerToPropertyListing. */
  boundary_geojson?: string | null;
}

// Fix default marker icons in Leaflet
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Udupi district center
const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];
const DEFAULT_ZOOM = 11;

// Property type configuration is now sourced from getPropertyTypeVisual (propertyTypeConfig.ts).
// agricultural_land is treated as a fallback 'other' visual by getPropertyTypeVisual since it
// is not in PROPERTY_TYPE_VISUAL_MAP (agri markers render in agri-first journey, not area-first).

// Module-level icon cache — avoids creating a new DivIcon object on every render.
// R-A R1 fix: keyed by `${propertyType}|${colour}|${priceLabel}|${selected}` so:
//   - two types with the same formatted price get different icons (colour differs)
//   - selected variant is cached separately from default
//   - null/zero price always renders a '—' fallback (never ₹null / ₹NaN)
const iconCache = new Map<string, L.DivIcon>();

/**
 * Derive the price text shown inside the marker pill.
 * Returns `{ label, isPricePill }` where `isPricePill` is true ONLY when a real
 * price is present (price != null && price > 0). The discriminant is kept identical
 * to the price-availability condition so a hypothetical 1-char formatted price would
 * never be misclassified as a no-price marker.
 *
 * NULL/zero price → neutral '—' (type disc + glyph still render for distinguishability).
 */
function deriveMarkerLabel(
  propertyType: string,
  price: number | null | undefined,
): { label: string; isPricePill: boolean } {
  if (price != null && price > 0) {
    return { label: formatPrice(price, 'INR'), isPricePill: true };
  }
  // Preserve the isPricePill discriminant — used by callers that need to distinguish
  // a real formatted price from a null/zero fallback without inspecting label content.
  return { label: '—', isPricePill: false };
}

/**
 * Build the inline SVG markup for a glyph disc.
 * Renders a 22×22 circle in `discColour` with a 12×12 white SVG path centred inside.
 */
function buildDiscSvg(glyphPath: string, discColour: string): string {
  return `<div style="
    width:22px;height:22px;border-radius:50%;background:${escapeHtml(discColour)};
    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
         stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <path d="${escapeHtml(glyphPath)}"/>
    </svg>
  </div>`;
}

/**
 * R-A — White rounded pill marker icon.
 * Shape: bg-white rounded-full pill, left type-coloured disc + glyph, right price text.
 * NULL/zero price: shows '—'; pill is still TYPE-distinguishable via disc colour + glyph.
 *
 * Cache key includes type colour so two different types with the same formatted price
 * are never cache-collided (R1 invariant).
 */
const createMarkerIcon = (propertyType: string, price: number | null | undefined): L.DivIcon => {
  const { label } = deriveMarkerLabel(propertyType, price);
  const visual = getPropertyTypeVisual(propertyType);
  // R1: key on colour (not just type) so that types sharing the same label get distinct icons.
  const cacheKey = `${propertyType}|${visual.colour}|${label}|default`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const glyphPath = GLYPH_SVG_PATHS[visual.glyph];
  const discSvg = buildDiscSvg(glyphPath, visual.colour);
  const safeLabel = escapeHtml(label);

  // Pill dimensions: disc (22px) + gap (7px) + text (~60px max) + h-padding (5+12=17px)
  // Width estimated; Leaflet will clip if too narrow — use auto width via transform.
  const pillHtml = `
    <div data-testid="property-marker" style="
      background:#FFFFFF;
      border:1px solid rgba(0,0,0,0.12);
      border-radius:9999px;
      box-shadow:0 4px 10px rgba(17,24,39,0.07),0 2px 4px rgba(17,24,39,0.05);
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:5px 12px 5px 5px;
      white-space:nowrap;
      pointer-events:auto;
    ">
      ${discSvg}
      <span style="
        font-family:ui-monospace,'Geist Mono','SF Mono',monospace;
        font-size:12.5px;
        font-weight:700;
        letter-spacing:-0.01em;
        color:hsl(221 39% 11%);
        line-height:1;
      ">${safeLabel}</span>
    </div>`;

  // Wrap in a translate so the pill bottom-edge sits at the listing coordinates.
  const html = `<div style="transform:translate(-50%,-100%);display:inline-block;">${pillHtml}</div>`;

  // Issue #1074 — 'property-marker' class + data-testid for E2E selectors.
  const icon = L.divIcon({
    className: 'custom-marker property-marker',
    html,
    // iconAnchor [0,0] because we use CSS translate(-50%,-100%) on the wrapper.
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

// Preserve: copper ring on selected marker (Issue #1547).
// Value grounded in design source: HSL 18 51% 46% → #B05C3A.
const COPPER_COLOR = '#B05C3A';

/**
 * Issue #1547 — selected-state marker icon.
 * R-A: navy pill background (#1B2A45), white price text, semi-transparent white disc
 * containing a white glyph. Outer box-shadow adds the #1547 copper ring (35% opacity).
 * Scale(1.09) applied via CSS transform on the wrapper for the slight size-up effect.
 *
 * R1 cache: keyed by `${propertyType}|${colour}|${label}|selected` — distinct from
 * the default variant AND from any other type that might share the same formatted price.
 */
const createSelectedMarkerIcon = (propertyType: string, price: number | null | undefined): L.DivIcon => {
  const { label } = deriveMarkerLabel(propertyType, price);
  const visual = getPropertyTypeVisual(propertyType);
  // R1: include colour in key so types sharing the same price label are not collided.
  const cacheKey = `${propertyType}|${visual.colour}|${label}|selected`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const glyphPath = GLYPH_SVG_PATHS[visual.glyph];
  // SELECTED: disc = semi-transparent white on the navy pill background
  const discSvg = buildDiscSvg(glyphPath, 'rgba(255,255,255,0.18)');
  const safeLabel = escapeHtml(label);

  // Navy pill — #1B2A45 = hsl(219 44% 19%) = --primary
  const pillHtml = `
    <div data-testid="property-marker" data-selected="true" style="
      background:#1B2A45;
      border:1px solid rgba(0,0,0,0.15);
      border-radius:9999px;
      box-shadow:0 0 0 3px rgba(176,92,58,0.35),0 4px 10px rgba(17,24,39,0.12),0 2px 4px rgba(17,24,39,0.08);
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:5px 12px 5px 5px;
      white-space:nowrap;
      pointer-events:auto;
    ">
      ${discSvg}
      <span style="
        font-family:ui-monospace,'Geist Mono','SF Mono',monospace;
        font-size:12.5px;
        font-weight:700;
        letter-spacing:-0.01em;
        color:#FFFFFF;
        line-height:1;
      ">${safeLabel}</span>
    </div>`;

  // scale(1.09) gives the slight size-up; translate(-50%,-100%) anchors pill bottom to coords.
  const html = `<div style="transform:translate(-50%,-100%) scale(1.09);transform-origin:50% 100%;display:inline-block;">${pillHtml}</div>`;

  const icon = L.divIcon({
    className: 'custom-marker property-marker property-marker--selected',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

export interface SchoolCircle {
  lat: number;
  lon: number;
  radiusKm: number;
  name: string;
}

interface PropertyMapProps {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  focusBounds?: [[number, number], [number, number]] | null;
  /** Current polygon coordinates from draw-on-map. Passed to DrawControl for overlay rendering. */
  polygon?: [number, number][] | null;
  /** Called when the user finishes drawing a polygon on the map. */
  onPolygonDrawn?: (polygon: [number, number][]) => void;
  /** Called when the user clears the drawn polygon. */
  onPolygonCleared?: () => void;
  /** When set, displays a circle around the selected school on the map. */
  schoolCircle?: SchoolCircle;
  /**
   * Initial map center from URL (?lat=/?lon=). Used as the MapContainer's one-time
   * `center` prop to restore a bookmarked viewport. Distinct from `cityCenter`, which
   * drives post-mount flyTo on city change. When present, takes precedence over cityCenter
   * for the initial render.
   */
  initialCenter?: [number, number];
  /** Initial map zoom from URL (?zoom=). Paired with initialCenter. */
  initialZoom?: number;
  /** Override map center when city changes */
  cityCenter?: [number, number];
  /** Override map zoom when city changes */
  cityZoom?: number;
  /** Area markers from the areas table (geo_center_lat/lon for placement, bbox for fitBounds). */
  areas?: AreaPoint[];
  /** Called when an area marker is clicked (in addition to the built-in bbox fitBounds). */
  onAreaClick?: (area: AreaPoint) => void;
  /**
   * When set, area markers NOT in this array are rendered at 0.3 opacity (dimmed).
   * Markers in the array remain at full opacity. Absent = all markers full opacity.
   * Passed through to AreaMarkerLayer unchanged.
   */
  focusedGroupAreas?: string[];
  /**
   * Issue #1798 PR-B — area-marker density degradation for dense area groups.
   * All passed through to AreaMarkerLayer unchanged; every one defaults to
   * undefined so existing callers are byte-for-byte unaffected.
   */
  enableAreaMarkerDegradation?: boolean;
  /** The currently-selected area's key. Passed through to AreaMarkerLayer. */
  selectedAreaKey?: string | null;
  /** Areas matching the active panel search. Passed through to AreaMarkerLayer. */
  areaSearchMatchKeys?: string[];
  /** The area currently hovered/focused in the panel. Passed through to AreaMarkerLayer. */
  hoveredAreaKey?: string | null;
  /** Fired when an area-cluster chip is clicked. Passed through to AreaMarkerLayer. */
  onAreaClusterClick?: (cluster: AreaMarkerClusterInfo) => void;
  /** Fired after each area-marker bucketing recompute with (shown, total). */
  onAreaMarkersComputed?: (shownCount: number, totalCount: number) => void;
  /** Called on every zoomend with the new zoom level. Used by zoom-band switching logic. */
  onZoomChange?: (zoom: number) => void;
  /**
   * Called after every map moveend/zoomend with the current center + zoom.
   * Intended for debounced URL viewport writes — the caller is responsible for debouncing.
   * Reports { lat, lon, zoom } rounded to map precision (not pre-rounded here).
   */
  onViewportChange?: (viewport: { lat: number; lon: number; zoom: number }) => void;
  /** When set, pans/fits the map to this area. Driven by right-panel card clicks only — never set by marker clicks. */
  panToArea?: AreaPoint | null;
  /** Incrementing tick that triggers a zoom reset to cityCenter/cityZoom. Incremented by handleAreaBack. */
  resetMapTick?: number;
  /** Called once when the Leaflet map instance has finished initialising. Use to gate data-readiness checks. */
  onReady?: () => void;
  /**
   * Called after every map moveend/zoomend (after the first mount event is skipped)
   * with the current bounding box as [south, west, north, east].
   * The caller is responsible for debouncing before triggering API refetches.
   * NaN/Infinity bboxes from hidden containers are suppressed before this fires.
   */
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  /**
   * Active journey type. Passed through to AreaMarkerLayer to drive the school-count
   * badge variant when journey='school-first' and no school is selected.
   */
  journey?: DiscoverJourney | null;
  /**
   * Currently selected school. Passed through to AreaMarkerLayer. When set,
   * the school-first badge reverts to property count (school already chosen).
   */
  selectedSchool?: SchoolResult | null;
  /**
   * Schools to display as markers on the map. Supplied by MapDiscovery from
   * useSchoolsByArea. Whether they actually render is gated by `showSchoolMarkers`.
   */
  schools?: SchoolResult[];
  /**
   * Issue #1157 rev-5 DEFECT A — master gate for mounting SchoolMarkerLayer.
   * MapDiscovery computes it as
   * `journey === 'school-first' || schoolPicking || (journey === 'area-first' && areaKey && schoolId)`
   * so school markers appear in the area-first school-picking sub-step and the
   * area-school-combined state. school-first's value is unchanged (the OR's first
   * term), so school-first marker rendering is byte-for-byte identical.
   */
  showSchoolMarkers?: boolean;
  /**
   * Called when a school marker is clicked. Should update URL with schoolId + radiusKm.
   */
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Loading state from useSchoolsByArea. Passed to SchoolMarkerLayer for diagnostic UI.
   */
  schoolsIsLoading?: boolean;
  /**
   * Error state from useSchoolsByArea. Passed to SchoolMarkerLayer for diagnostic UI.
   */
  schoolsIsError?: boolean;
  /**
   * Error object from useSchoolsByArea. Passed to SchoolMarkerLayer for error message display.
   */
  schoolsError?: Error | null;
  /**
   * Incrementing tick that triggers a school-focus fitBounds/flyTo.
   * Incremented once per school-id change and once per radiusKm change in the
   * school-first journey. Uses the same handledTickRef guard as resetMapTick so
   * the fit fires exactly once per tick and never re-fires on viewport events.
   * Must only be non-zero when journey === 'school-first' and the school is hydrated.
   */
  schoolFocusTick?: number;
  /** School centre latitude for SchoolFocusPanner — companion to schoolFocusTick. */
  schoolFocusLat?: number;
  /** School centre longitude for SchoolFocusPanner — companion to schoolFocusTick. */
  schoolFocusLon?: number;
  /** School radius in km for SchoolFocusPanner — companion to schoolFocusTick. Falls back to flyTo zoom=14 when 0 or absent. */
  schoolFocusRadiusKm?: number;
  /**
   * Issue #1160 GAP 1 — Incrementing tick that triggers SchoolMarkerFocusPanner to fitBounds
   * over the school centre + marker positions. Fires after listings have settled (non-empty).
   * Phase-2 fit complements Phase-1 (SchoolFocusPanner) by tightening to actual marker extent.
   * Only fires when schoolMarkerPositions is non-empty. Uses handledTickRef guard.
   */
  schoolMarkerFocusTick?: number;
  /** Marker positions (lat/lon) for SchoolMarkerFocusPanner bounds computation. */
  schoolMarkerPositions?: Array<{ lat: number; lon: number }>;
  /**
   * Issue #1160 GAP 2 — Incrementing tick that triggers AreaRestorePanner to fly/fit to the
   * area context after Back is pressed from school-selected (level 2 → 1). Uses handledTickRef.
   */
  areaRestoreTick?: number;
  /** Area geo-centre latitude for AreaRestorePanner fallback flyTo. */
  areaRestoreLat?: number;
  /** Area geo-centre longitude for AreaRestorePanner fallback flyTo. */
  areaRestoreLon?: number;
  /** Area bbox [[s,w],[n,e]] for AreaRestorePanner fitBounds. Takes precedence over lat/lon flyTo. */
  areaRestoreBbox?: [[number, number], [number, number]];
  /**
   * Issue #1160 GAP 2 — Incrementing tick that triggers CityRestorePanner to fly to city
   * center after Back is pressed from schools-in-area (level 1 → 0). Uses handledTickRef.
   */
  cityRestoreTick?: number;
  /** City center [lat, lon] for CityRestorePanner flyTo. */
  cityRestoreCenter?: [number, number];
  /** City zoom for CityRestorePanner flyTo. */
  cityRestoreZoom?: number;
  /**
   * Issue #1372 — when true (journey=agri-first), renders agriculture markers in a
   * separate AgriMarkerClusterLayer with agri-specific cluster icons. The residential
   * MarkerClusterLayer is NOT rendered in agri mode.
   */
  isAgriMode?: boolean;
  /**
   * Issue #1373 — current map zoom level, forwarded from MapDiscovery.
   * Used by AgriPolygonLayer to gate polygon rendering at zoom >= 16
   * (same threshold as disableClusteringAtZoom in AgriMarkerClusterLayer).
   */
  mapZoom?: number;
  /**
   * Issue #1373 — selected agri polygon listing. Passed only to AgriPolygonLayer
   * (not MapController) to avoid unintended flyTo panning on polygon click.
   */
  selectedPolygonListing?: PropertyListingWithImages | null;
  /**
   * Issue #1410 — group-filtered agri listings from the public endpoint.
   * When non-null, overrides `listings` for AgriMarkerClusterLayer + AgriPolygonLayer.
   * When null/undefined, falls back to the existing `listings` prop (no regression).
   */
  agriGroupListings?: AgriMapListingItem[] | null;
  /**
   * Issue #1547 — ID of the currently selected listing (from the `listing` URL param).
   * When set, the corresponding residential marker renders with the copper selected-state
   * icon. Does NOT trigger any camera movement (MapController is not involved).
   * Only wired to MarkerClusterLayer (residential); agri and school markers unaffected.
   */
  selectedListingId?: string | null;
  /**
   * Issue #1547 — ephemeral hover/focus id for card→marker highlight.
   * When set, the matching residential marker renders with the copper selected-state icon.
   * Distinct from selectedListingId (URL-persisted): this is transient React state that
   * resets to null on card mouseleave/blur and never survives a journey switch.
   * Like selectedListingId, flows ONLY to MarkerClusterLayer visual — never to
   * MapController, so no flyTo / zoom / pan occurs on hover.
   */
  hoveredListingId?: string | null;
  /**
   * Issue #1429 — corridor sector overlay for agri corridor-first discovery.
   * When set, renders a non-interactive wedge polygon anchored at cityCenter
   * showing the selected corridor + distance tier.
   * Only shown for agricultural_land property type (caller must gate on this).
   */
  sectorOverlay?: {
    directionCode: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
    maxKm: 10 | 25 | 50 | 100;
  } | null;
  /**
   * School-first only — dark zone/group label pills for the overview map.
   * Supplied by MapDiscovery (gated to the browse/landing state at overview zoom);
   * positions are truthful (group focus point or member-area bounds-centre).
   * Empty/undefined → no zone labels render. Never set for area-first / agri-first.
   */
  schoolZoneLabels?: ZoneLabelPoint[];
  /** Called when a zone label pill is clicked — selects that group (sets groupId). */
  onSelectZone?: (groupId: string) => void;
  /**
   * a3 — Optional callback fired on residential marker click with the pixel position
   * of the click relative to the map container element. Used by MarkerPopoverCard in
   * MapDiscovery to auto-position the popover near the clicked pin. Only wired to
   * MarkerClusterLayer (residential); agri and school markers are unaffected.
   */
  onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
}

/**
 * Issue #1410 — adapter from the lean public AgriMapListingItem shape to the full
 * PropertyListingWithImages shape required by AgriMarkerClusterLayer + AgriPolygonLayer.
 * Items missing lat/lon are filtered out to prevent Leaflet errors.
 * All non-agri fields that are not available from the public endpoint are set to null.
 */
function adaptAgriMapListingsToMarkers(
  items: AgriMapListingItem[],
): PropertyListingWithImages[] {
  return items
    .filter(item => item.latitude != null && item.longitude != null)
    .map(
      (item): PropertyListingWithImages => ({
        // Required PropertyListing fields
        id: item.id,
        // PropertyType cast: the public endpoint returns 'agricultural_land' string
        property_type: item.propertyType as PropertyType,
        title: item.title ?? null,
        locality: item.locality ?? null,
        price: item.pricePaise != null ? item.pricePaise / 100 : null,
        price_unit: null,
        land_area: item.landArea ?? null,
        land_area_unit: item.landAreaUnit ?? null,
        built_area: null,
        built_area_unit: null,
        bedrooms: null,
        bathrooms: null,
        contact_info: null,
        contact_phone: null,
        description: null,
        latitude: item.latitude,
        longitude: item.longitude,
        confidence_score: null,
        language_detected: null,
        price_per_cent_paise: null,
        is_valid: true,
        // status/is_duplicate are not in AgriMapListingItem (server excludes them).
        // Set to expected LIVE/false so downstream consumers that inspect these fields
        // don't misbehave. The endpoint guarantees LIVE-only rows; is_duplicate=false
        // is likewise guaranteed by the service WHERE clause.
        is_duplicate: false,
        status: 'LIVE',
        // These are required string fields on PropertyListing — public endpoint does not
        // supply them; empty string satisfies the type without fabricating data.
        created_at: '',
        updated_at: '',
        raw_post_id: null,
        listing_purpose: 'sale',
        // Optional extended fields
        areaKey: item.areaKey,
        // PropertyListingWithImages extension
        images: [],
        boundary_geojson: item.boundaryGeoJson ?? null,
      }),
    );
}

/**
 * Fires `onReady` once when the Leaflet map has mounted and is ready.
 * Must be rendered inside a MapContainer so useMap() resolves.
 */
function MapReadySignal({ onReady }: { onReady?: () => void }) {
  useMap(); // ensures we're inside MapContainer — the hook itself resolves the instance
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.();
  }, []); // empty deps: fire once on mount; ref always holds the current callback
  return null;
}

function ZoomWatcher({ onZoomChange }: { onZoomChange?: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onZoomChange) return;
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
}

/**
 * Fires onViewportChange after every moveend or zoomend.
 * The callback receives raw center + zoom; the caller (Index) debounces before writing to URL.
 */
function ViewportWatcher({
  onViewportChange,
}: {
  onViewportChange?: (vp: { lat: number; lon: number; zoom: number }) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!onViewportChange) return;
    const handler = () => {
      const center = map.getCenter();
      onViewportChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
    };
    // Note: pinch-zoom and programmatic zoom fire BOTH zoomend and moveend in sequence
    // (zoomend first, then moveend as Leaflet recenters), so the handler runs twice for
    // those gestures. Scroll-wheel zoom only fires zoomend (no moveend), so it fires once.
    // The caller's debounce (reportViewport → 300 ms) collapses any double-fire into one
    // URL write, so the extra call has no visible effect.
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onViewportChange]);
  return null;
}

/**
 * Fires onBoundsChange with the current map bbox [south, west, north, east] after
 * every moveend or zoomend. The initial mount fire is suppressed (hasMountedRef guard)
 * so that URL-restored viewports don't trigger an immediate API refetch before the
 * user has interacted. The caller is responsible for debouncing if needed.
 *
 * Coalescing: Leaflet fires zoomend then moveend in rapid succession on pinch/scroll
 * zoom. The caller's debounce window (≥300 ms) collapses these into a single refetch.
 */
function BoundsWatcher({
  onBoundsChange,
}: {
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
}) {
  const map = useMap();
  // Skip the first fire on mount — the initial viewport is already captured from
  // URL params; we only want to trigger refetches on genuine user pan/zoom.
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!onBoundsChange) return;
    const handler = () => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }
      const b = map.getBounds();
      const s = b.getSouth();
      const w = b.getWest();
      const n = b.getNorth();
      const e = b.getEast();
      // Guard against degenerate bounds (NaN or Infinity) from hidden/unmounted containers.
      if ([s, w, n, e].every(Number.isFinite)) {
        onBoundsChange([s, w, n, e]);
      }
    };
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onBoundsChange]);
  return null;
}

function AreaPanner({ panToArea }: { panToArea?: AreaPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (!panToArea) return;
    if (panToArea.bbox) {
      // Issue #1069: a synthetic group-bounds AreaPoint (from computeGroupBounds)
      // can fit at a zoom level above AREA_PANNER_GROUP_MAX_ZOOM for narrow groups,
      // which then trips MapDiscovery's zoom-band gate and hides the area markers
      // the user was meant to see. Clamp group fits to the area-layer threshold.
      const isGroupBounds = panToArea.areaKey === GROUP_BOUNDS_SYNTHETIC_KEY;
      map.fitBounds(panToArea.bbox, {
        padding: [40, 40],
        maxZoom: isGroupBounds ? AREA_PANNER_GROUP_MAX_ZOOM : 16,
      });
    } else {
      map.flyTo([panToArea.geo_center_lat, panToArea.geo_center_lon], 13);
    }
  }, [panToArea, map]);
  return null;
}

/**
 * SchoolFocusPanner — Issue #1160
 *
 * Fires fitBounds (or flyTo when radius is zero) to frame the selected school
 * and its radius circle in the viewport. Triggered by schoolFocusTick, which
 * is incremented once per school-id change and once per radiusKm change in
 * MapDiscovery. The handledTickRef guard ensures the effect fires exactly once
 * per tick increment and never re-triggers on viewport events (no feedback loop
 * with ViewportWatcher → reportViewport).
 *
 * Degrees-per-km approximation: 1 km ≈ 1/111 degrees latitude; longitude is
 * adjusted by cos(lat). The resulting bounding box is passed to fitBounds with
 * 40 px padding so the radius circle sits comfortably within the viewport.
 *
 * Reuse note: adapted from AreaPanner (same file, ~line 301) and the
 * handledTickRef guard from MapController.resetMapTick (~line 442).
 *
 * Issue #1173 — radius-change zoom stability:
 * The same schoolFocusTick fires for both an initial school-focus (school-id
 * change) AND a radius change for the already-focused school. On a *radius
 * change only* (same school centre), we no longer unconditionally refit: if the
 * new radius circle still fits inside the current viewport we PRESERVE the
 * user's zoom/center (zero map mutation — which structurally breaks any fit
 * loop), and we REFIT (the original fitBounds) only when the new circle would be
 * clipped / mostly outside the current viewport. The initial focus and the
 * radius=0 flyTo path are UNCHANGED. The fits/clipped decision is keyed on the
 * radius-value change and reads the viewport imperatively via map.getBounds()
 * at decision time — viewport state is intentionally NOT in the dep array and no
 * moveend/zoomend listener is attached, so a fit-triggered move cannot re-trigger.
 */
function SchoolFocusPanner({
  schoolFocusTick,
  lat,
  lon,
  radiusKm,
}: {
  schoolFocusTick?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
}) {
  const map = useMap();
  const handledTickRef = useRef(0);
  // Centre we last performed a fit/flyTo for. Lets us tell an initial focus
  // (centre changed / first fit) apart from a radius change for the same school.
  const focusedCenterRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    // Issue #1173 (clear → re-select-same-school regression): when the selected
    // school is cleared, lat/lon become null but schoolFocusTick does NOT
    // increment (MapDiscovery's tick effect early-returns before incrementing
    // when lat/lon are null), so the tick guard below would short-circuit before
    // we ever observe the clear. We therefore reset the persisted focus centre
    // HERE — before the tick guard — keyed only on the lat/lon-null prop change.
    // This makes a subsequent re-selection of the SAME school read as an INITIAL
    // focus (prevCentre == null → isRadiusChange false → refit), instead of being
    // mis-classified as a radius change that PRESERVES the zoomed-out city view.
    // Pure ref write: zero map mutation, no listener, no new viewport dep — the
    // fit-loop safeguard is unaffected. The AreaRestorePanner/CityRestorePanner
    // restore on clear is untouched (this only resets SchoolFocusPanner's own ref).
    if (lat == null || lon == null) {
      focusedCenterRef.current = null;
      return;
    }

    const tick = schoolFocusTick ?? 0;
    // Fire only when tick strictly exceeds the last handled value.
    // This prevents re-firing on every render and eliminates any feedback loop
    // where a fit-triggered moveend (→ ViewportWatcher → reportViewport) would
    // increment tick and cause another fit.
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    const radius = radiusKm ?? 0;
    if (radius > 0) {
      // Derive a bounding box from centre ± radiusKm in degrees.
      // 1 degree lat ≈ 111.32 km; 1 degree lon ≈ 111.32 * cos(lat) km.
      const deltaLat = radius / 111.32;
      const deltaLon = radius / (111.32 * Math.cos((lat * Math.PI) / 180));
      const south = lat - deltaLat;
      const west = lon - deltaLon;
      const north = lat + deltaLat;
      const east = lon + deltaLon;
      const bounds: [[number, number], [number, number]] = [
        [south, west],
        [north, east],
      ];

      // A radius CHANGE = same school centre as the last fit. A centre change
      // (new school selected) is an initial focus and must always fit (AC5).
      const prevCentre = focusedCenterRef.current;
      const isRadiusChange =
        prevCentre != null && prevCentre.lat === lat && prevCentre.lon === lon;

      if (isRadiusChange) {
        // Read the current viewport imperatively at decision time. Viewport
        // state is deliberately NOT in the dep array and no map event listener
        // is attached, so this decision cannot feed back into itself
        // (Issue #1173 fit-loop safeguard).
        const viewport = map.getBounds?.();
        const fitsInViewport =
          viewport != null &&
          viewport.getSouth() <= south &&
          viewport.getWest() <= west &&
          viewport.getNorth() >= north &&
          viewport.getEast() >= east;
        if (fitsInViewport) {
          // PRESERVE branch (AC1): the new radius circle still fits — keep the
          // user's current zoom/center. ZERO map mutation by design.
          return;
        }
        // else fall through to REFIT (AC2): the circle would be clipped.
      }

      // Initial focus, or a radius change whose circle would be clipped: refit.
      focusedCenterRef.current = { lat, lon };
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      // Zero or absent radius: fly to school centre at a fixed zoom suitable for
      // a neighbourhood view so the school marker is clearly visible.
      focusedCenterRef.current = { lat, lon };
      map.flyTo([lat, lon], 14, { duration: 1 });
    }
  }, [schoolFocusTick, lat, lon, radiusKm, map]);

  return null;
}

/**
 * SchoolMarkerFocusPanner — Issue #1160 GAP 1 (Phase 2)
 *
 * After listings settle (schoolMarkerFocusTick > 0), fitBounds to include both
 * the school centre and all marker positions. The bounds are further intersected
 * with the school's radius bounding box so a single far-outlier marker cannot
 * blow the viewport well outside the radius circle.
 *
 * Algorithm:
 *   1. Start from L.latLngBounds([school centre, ...marker positions]).
 *   2. Derive radiusBounds from school centre ± radiusKm in degrees.
 *   3. Intersect: clamp the bounds to radiusBounds so the fit never exceeds the
 *      radius circle's outer extent. Fall back to flyTo(school, 14) if bounds degenerate.
 *
 * Feedback-loop safety: same handledTickRef guard as SchoolFocusPanner. ViewportWatcher
 * writes only to URL params, never to schoolMarkerFocusTick.
 */
function SchoolMarkerFocusPanner({
  schoolMarkerFocusTick,
  lat,
  lon,
  radiusKm,
  markerPositions,
}: {
  schoolMarkerFocusTick?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  markerPositions?: Array<{ lat: number; lon: number }>;
}) {
  const map = useMap();
  const handledTickRef = useRef(0);

  useEffect(() => {
    const tick = schoolMarkerFocusTick ?? 0;
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    if (lat == null || lon == null) return;
    if (!markerPositions || markerPositions.length === 0) return;

    const radius = radiusKm ?? 0;

    // Build bounds from school centre + all marker positions
    const allPoints: [number, number][] = [
      [lat, lon],
      ...markerPositions.map((p) => [p.lat, p.lon] as [number, number]),
    ];
    const markerBounds = L.latLngBounds(allPoints);

    if (radius > 0) {
      // Clamp to radius bounding box so far outliers don't blow the viewport.
      const deltaLat = radius / 111.32;
      const deltaLon = radius / (111.32 * Math.cos((lat * Math.PI) / 180));
      const sw = L.latLng(lat - deltaLat, lon - deltaLon);
      const ne = L.latLng(lat + deltaLat, lon + deltaLon);
      const radiusBounds = L.latLngBounds(sw, ne);
      // Intersect: keep the tighter of the two bounds on each side.
      const south = Math.max(markerBounds.getSouth(), radiusBounds.getSouth());
      const west = Math.max(markerBounds.getWest(), radiusBounds.getWest());
      const north = Math.min(markerBounds.getNorth(), radiusBounds.getNorth());
      const east = Math.min(markerBounds.getEast(), radiusBounds.getEast());
      if (south < north && west < east) {
        map.fitBounds([[south, west], [north, east]], {
          padding: [40, 40],
          maxZoom: SCHOOL_MARKER_FOCUS_MAX_ZOOM,
        });
        return;
      }
    }

    // Fallback: fit to raw marker bounds if radius clamp produces degenerate result
    if (markerBounds.isValid()) {
      map.fitBounds(markerBounds, {
        padding: [40, 40],
        maxZoom: SCHOOL_MARKER_FOCUS_MAX_ZOOM,
      });
    } else {
      map.flyTo([lat, lon], SCHOOL_MARKER_FOCUS_MAX_ZOOM, { duration: 1 });
    }
  }, [schoolMarkerFocusTick, lat, lon, radiusKm, markerPositions, map]);

  return null;
}

/**
 * AreaRestorePanner — Issue #1160 GAP 2
 *
 * Fires fitBounds (bbox) or flyTo (geo-centre) to restore the map to the area
 * context after Back is pressed from school-selected (level 2 → 1) in school-first
 * journey. Uses handledTickRef guard (same pattern as SchoolFocusPanner).
 *
 * Feedback-loop safety: areaRestoreTick is only incremented by handleSchoolFirstBackLevel2,
 * never by ViewportWatcher or any map-event handler.
 */
function AreaRestorePanner({
  areaRestoreTick,
  lat,
  lon,
  bbox,
}: {
  areaRestoreTick?: number;
  lat?: number;
  lon?: number;
  bbox?: [[number, number], [number, number]];
}) {
  const map = useMap();
  const handledTickRef = useRef(0);

  useEffect(() => {
    const tick = areaRestoreTick ?? 0;
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    if (bbox) {
      map.fitBounds(bbox, { padding: [40, 40] });
    } else if (lat != null && lon != null) {
      map.flyTo([lat, lon], 13, { duration: 1 });
    }
    // If both bbox and lat/lon are absent, skip gracefully (discoverAreas not loaded).
  }, [areaRestoreTick, lat, lon, bbox, map]);

  return null;
}

/**
 * CityRestorePanner — Issue #1160 GAP 2
 *
 * Fires flyTo(cityCenter, cityZoom) to restore the map to city overview after Back
 * is pressed from schools-in-area (level 1 → 0) in school-first journey.
 * Uses handledTickRef guard (same pattern as MapController.resetMapTick).
 *
 * Feedback-loop safety: cityRestoreTick is only incremented by handleSchoolFirstBackLevel1,
 * never by ViewportWatcher or any map-event handler.
 */
function CityRestorePanner({
  cityRestoreTick,
  cityCenter,
  cityZoom,
}: {
  cityRestoreTick?: number;
  cityCenter?: [number, number];
  cityZoom?: number;
}) {
  const map = useMap();
  const handledTickRef = useRef(0);

  useEffect(() => {
    const tick = cityRestoreTick ?? 0;
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
    // If cityCenter is absent (unlikely), skip gracefully.
  }, [cityRestoreTick, cityCenter, cityZoom, map]);

  return null;
}

function URLViewportController({
  initialCenter,
  initialZoom,
}: {
  initialCenter?: [number, number];
  initialZoom?: number;
}) {
  const map = useMap();
  const lastAppliedViewportRef = useRef<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    // Skip if no viewport is specified
    if (!initialCenter || initialZoom === undefined) return;

    const [requestedLat, requestedLon] = initialCenter;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    // Tight tolerance: 0.0001 degrees (~11 meters) for lat/lon, exact for zoom
    const LAT_LON_TOLERANCE = 0.0001;
    const latDiff = Math.abs(currentCenter.lat - requestedLat);
    const lonDiff = Math.abs(currentCenter.lng - requestedLon);
    const zoomMatches = Math.round(currentZoom) === initialZoom;

    // Skip if viewport is already correct (within tolerance)
    if (
      latDiff <= LAT_LON_TOLERANCE &&
      lonDiff <= LAT_LON_TOLERANCE &&
      zoomMatches
    ) {
      return;
    }

    // Skip if already applied (prevent feedback loop with reportViewport debounce)
    const lastViewport = lastAppliedViewportRef.current;
    if (
      lastViewport &&
      lastViewport.lat === requestedLat &&
      lastViewport.lon === requestedLon &&
      lastViewport.zoom === initialZoom
    ) {
      return;
    }

    // Apply viewport without animation to avoid intermediate moveend events
    map.setView([requestedLat, requestedLon], initialZoom);
    lastAppliedViewportRef.current = {
      lat: requestedLat,
      lon: requestedLon,
      zoom: initialZoom,
    };
  }, [initialCenter, initialZoom, map]);

  return null;
}

function MapController({
  selectedListing,
  focusBounds,
  cityCenter,
  cityZoom,
  resetMapTick,
}: {
  selectedListing?: PropertyListing | null;
  focusBounds?: [[number, number], [number, number]] | null;
  cityCenter?: [number, number];
  cityZoom?: number;
  resetMapTick?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedListing?.latitude && selectedListing?.longitude) {
      map.flyTo([selectedListing.latitude, selectedListing.longitude], 15, {
        duration: 1,
      });
    }
  }, [selectedListing, map]);

  useEffect(() => {
    if (!focusBounds) return;
    const [[s, w], [n, e]] = focusBounds;
    if (s === n && w === e) {
      // Single point — fitBounds on a zero-area bounds is degenerate; use flyTo
      map.flyTo([s, w], 15, { duration: 1 });
    } else {
      map.fitBounds(focusBounds, { padding: [50, 50] });
    }
  }, [focusBounds, map]);

  // hasMountedRef: skip the first effect run so we don't immediately fly to
  // cityCenter on mount and overwrite a URL-specified initial viewport.
  // Only fly when the user actively changes city (post-mount cityCenter change).
  //
  // Cross-component coupling: MapContainer (parent) already positions the map at
  // initialCenter/initialZoom on mount — these are the one-time Leaflet props driven
  // by the URL's ?lat/?lon/?zoom= params. MapController must NOT call flyTo(cityCenter)
  // on the initial render, otherwise it clobbers whatever viewport the URL specified.
  // hasMountedRef enforces this invariant without MapController needing to know about
  // initialCenter/initialZoom directly.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
  }, [cityCenter, cityZoom, map]);

  // Reset zoom to city overview when area is deselected (Back button).
  // handledTickRef tracks the last tick value we acted on so that a city change
  // (which also updates cityCenter/cityZoom deps) does not re-fire when the tick
  // has not changed. Only fires when tick strictly exceeds the last handled value.
  const handledTickRef = useRef(0);
  useEffect(() => {
    const tick = resetMapTick ?? 0;
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;
    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
  }, [resetMapTick, map, cityCenter, cityZoom]);

  return null;
}

// Marker cluster layer component
function MarkerClusterLayer({
  listings,
  onSelectListing,
  selectedListingId,
  hoveredListingId,
  onMarkerClickWithPosition,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  /** Issue #1547 — ID of the currently selected listing (URL-derived). When set, that
   *  listing's marker renders with the copper selected-state icon; no camera movement. */
  selectedListingId?: string | null;
  /** Issue #1547 — ephemeral hover/focus id (React state, NOT URL). When set, the
   *  matching marker renders with the copper icon; clears on mouseleave/blur. */
  hoveredListingId?: string | null;
  /** a3 — fires with the pixel position of the marker click relative to the map container. */
  onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50,
      disableClusteringAtZoom: 16,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size: 'small' | 'medium' | 'large' = 'small';
        let sizeNum = 36;

        if (count > 50) {
          size = 'large';
          sizeNum = 52;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 44;
        }

        return L.divIcon({
          html: `<div class="custom-marker-cluster custom-marker-cluster-${size}">${count}</div>`,
          className: '',
          iconSize: L.point(sizeNum, sizeNum),
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    validListings.forEach((listing) => {
      // Issue #1547 — copper icon when id matches the URL-selected listing OR the
      // ephemeral hover/focus id. Both conditions use the same copper visual;
      // no flyTo / camera movement occurs for either path.
      const isHighlighted =
        listing.id === selectedListingId || listing.id === hoveredListingId;
      const icon = isHighlighted
        ? createSelectedMarkerIcon(listing.property_type, listing.price)
        : createMarkerIcon(listing.property_type, listing.price);
      const marker = L.marker([listing.latitude!, listing.longitude!], { icon });

      // Attach listing-id to the marker element for E2E selectors.
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.setAttribute('data-listing-id', listing.id);
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        onSelectListing?.(listing);
        // a3 — fire pixel position so MarkerPopoverCard can auto-position near the pin.
        // containerPoint is the pixel position relative to the map container element.
        if (onMarkerClickWithPosition && e.containerPoint) {
          onMarkerClickWithPosition({ x: e.containerPoint.x, y: e.containerPoint.y });
        }
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [listings, map, onSelectListing, selectedListingId, hoveredListingId, onMarkerClickWithPosition]);

  return null;
}

/**
 * Issue #1465 — Build a safe hover-tooltip label for an agri map marker.
 *
 * Priority: escaped title → locality + acreage fallback → acreage only →
 * generic. Never returns "undefined", "null", or an empty string.
 *
 * Exported for unit testing; not part of the public component API.
 */
export function buildAgriMarkerLabel(
  title: string | null | undefined,
  locality: string | null | undefined,
  landArea: number | null | undefined,
  landAreaUnit: string | null | undefined,
): string {
  // Title takes priority when non-blank.
  if (title != null && title.trim() !== '') {
    return escapeHtml(title.trim());
  }

  // Derive a human-readable acreage string when possible.
  const hasAcreage = landArea != null && landArea > 0;
  const unit = landAreaUnit ?? 'acres';
  const acreageStr = hasAcreage ? `${landArea} ${escapeHtml(unit)}` : null;

  const hasLocality = locality != null && locality.trim() !== '';
  const localityStr = hasLocality ? escapeHtml(locality!.trim()) : null;

  if (localityStr && acreageStr) return `${localityStr} · ${acreageStr}`;
  if (acreageStr) return acreageStr;
  if (localityStr) return localityStr;
  return 'Agricultural land';
}

// Issue #1372 — agriculture-specific cluster layer.
// Identical structure to MarkerClusterLayer but uses agri-themed cluster icons
// so agricultural land pins are visually distinct in the agri-first journey.
function AgriMarkerClusterLayer({
  listings,
  onSelectListing,
  selectedListingId,
  hoveredListingId,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  /** Issue #1547 — ID of the currently selected agri listing (URL-derived). Renders copper icon. */
  selectedListingId?: string | null;
  /** Issue #1547 — ephemeral hover/focus id for agri card→marker highlight. */
  hoveredListingId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50,
      disableClusteringAtZoom: 16,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size: 'small' | 'medium' | 'large' = 'small';
        let sizeNum = 36;

        if (count > 50) {
          size = 'large';
          sizeNum = 52;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 44;
        }

        return L.divIcon({
          html: `<div class="agri-cluster agri-cluster-${size}">🌾 ${count} ${count === 1 ? 'property' : 'properties'}</div>`,
          className: '',
          iconSize: undefined,
          iconAnchor: [0, 0],
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    validListings.forEach((listing) => {
      const isHighlighted =
        listing.id === selectedListingId || listing.id === hoveredListingId;
      const icon = isHighlighted
        ? createSelectedMarkerIcon(listing.property_type, listing.price)
        : createMarkerIcon(listing.property_type, listing.price);
      const marker = L.marker([listing.latitude!, listing.longitude!], { icon });

      // Attach listing-id to the marker element for E2E selectors.
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.setAttribute('data-listing-id', listing.id);
      });

      marker.on('click', () => {
        onSelectListing?.(listing);
      });

      // Issue #1465 — lightweight hover tooltip; orthogonal to click handler.
      const tooltipLabel = buildAgriMarkerLabel(
        listing.title,
        listing.locality,
        listing.land_area,
        listing.land_area_unit,
      );
      marker.bindTooltip(tooltipLabel, {
        permanent: false,
        direction: 'top',
        offset: [0, -20],
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [listings, map, onSelectListing, selectedListingId, hoveredListingId]);

  return null;
}

/**
 * Issue #1373 — renders saved agricultural plot boundaries as Leaflet Polygons.
 *
 * Only active when:
 *   - mapZoom >= 16 (same threshold as AgriMarkerClusterLayer.disableClusteringAtZoom)
 *   - listing.boundary_geojson is a non-null, non-empty string
 *
 * Coordinate transform: GeoJSON stores [longitude, latitude] pairs; Leaflet uses
 * [latitude, longitude]. This component converts on-the-fly when building positions.
 * The fails-without-fix unit test in PropertyMap.agriPolygon.test.tsx asserts this.
 *
 * Null-boundary agri listings fall back to AgriMarkerClusterLayer (no polygon here).
 * Non-agri listings are not passed to this layer (AgriPolygonLayer only mounts in isAgriMode).
 */
function AgriPolygonLayer({
  listings,
  selectedListing,
  onSelectListing,
  mapZoom,
}: {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  mapZoom?: number;
}) {
  // Gate: only render at zoom >= 16
  if (mapZoom == null || mapZoom < 16) return null;

  const agriListingsWithBoundary = listings.filter(
    (l) => l.property_type === 'agricultural_land' && l.boundary_geojson,
  );

  if (agriListingsWithBoundary.length === 0) return null;

  return (
    <>
      {agriListingsWithBoundary.map((listing) => {
        let positions: [number, number][] = [];
        try {
          // GeoJSON Polygon: { type: "Polygon", coordinates: [[[lng, lat], ...]] }
          // Leaflet Polygon positions: [[lat, lng], ...]
          // Transform: each [lng, lat] pair → [lat, lng]
          const geo = JSON.parse(listing.boundary_geojson!);
          // Guard: only handle GeoJSON Polygon type
          if (geo.type !== 'Polygon' || !Array.isArray(geo.coordinates?.[0])) return null;
          const ring: [number, number][] = geo.coordinates[0];
          positions = ring.map(([lng, lat]: [number, number]) => [lat, lng]);
        } catch {
          return null;
        }
        if (positions.length < 3) return null;

        const isSelected = selectedListing?.id === listing.id;

        return (
          <Polygon
            key={listing.id}
            positions={positions}
            pathOptions={{
              color: isSelected ? '#f97316' : '#65a30d',
              fillColor: isSelected ? '#f97316' : '#65a30d',
              fillOpacity: isSelected ? 0.35 : 0.2,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: () => onSelectListing?.(listing),
            }}
          />
        );
      })}
    </>
  );
}

const schoolMarkerIcon = L.divIcon({
  className: 'school-marker',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background-color: #2563eb;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
    ">🎓</div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export function PropertyMap({
  listings,
  selectedListing,
  onSelectListing,
  focusBounds,
  polygon,
  onPolygonDrawn,
  onPolygonCleared,
  schoolCircle,
  initialCenter,
  initialZoom,
  cityCenter,
  cityZoom,
  areas = [],
  onAreaClick,
  focusedGroupAreas,
  enableAreaMarkerDegradation,
  selectedAreaKey,
  areaSearchMatchKeys,
  hoveredAreaKey,
  onAreaClusterClick,
  onAreaMarkersComputed,
  onZoomChange,
  onViewportChange,
  onBoundsChange,
  panToArea,
  resetMapTick,
  onReady,
  journey,
  selectedSchool,
  schools = [],
  showSchoolMarkers = false,
  onSelectSchool,
  schoolsIsLoading = false,
  schoolsIsError = false,
  schoolsError = null,
  schoolFocusTick,
  schoolFocusLat,
  schoolFocusLon,
  schoolFocusRadiusKm,
  schoolMarkerFocusTick,
  schoolMarkerPositions,
  areaRestoreTick,
  areaRestoreLat,
  areaRestoreLon,
  areaRestoreBbox,
  cityRestoreTick,
  cityRestoreCenter,
  cityRestoreZoom,
  isAgriMode = false,
  mapZoom,
  selectedPolygonListing,
  agriGroupListings,
  sectorOverlay = null,
  selectedListingId,
  hoveredListingId,
  schoolZoneLabels,
  onSelectZone,
  onMarkerClickWithPosition,
}: PropertyMapProps) {
  // Issue #1410 — when agriGroupListings is provided (non-null), use the adapted items
  // for AgriMarkerClusterLayer and AgriPolygonLayer instead of the raw `listings` prop.
  // An empty array is intentional (0 markers for the selected group = correct behaviour).
  // When null/undefined (no group selected), falls back to `listings` (no regression).
  const agriLayerListings: PropertyListingWithImages[] = useMemo(
    () =>
      isAgriMode && agriGroupListings != null
        ? adaptAgriMapListingsToMarkers(agriGroupListings)
        : listings,
    [isAgriMode, agriGroupListings, listings],
  );

  // Derive the selected school ID for SchoolMarkerLayer focus mode.
  const selectedSchoolId = selectedSchool?.id ?? null;

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={initialCenter ?? cityCenter ?? UDUPI_CENTER}
        zoom={initialZoom ?? cityZoom ?? DEFAULT_ZOOM}
        className="w-full h-full rounded-lg z-0"
        scrollWheelZoom
        zoomControl={false}
      >
        {/* Zoom +/- sits bottom-right (matches the ReTrends mock) — clear of the
            top-left "Udupi" pill AND the bottom-left area-count legend (#1588). */}
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapReadySignal onReady={onReady} />
        <URLViewportController initialCenter={initialCenter} initialZoom={initialZoom} />
        <MapController
          selectedListing={selectedListing}
          focusBounds={focusBounds}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          resetMapTick={resetMapTick}
        />
        <ZoomWatcher onZoomChange={onZoomChange} />
        <ViewportWatcher onViewportChange={onViewportChange} />
        <BoundsWatcher onBoundsChange={onBoundsChange} />
        <AreaPanner panToArea={panToArea} />
        <SchoolFocusPanner
          schoolFocusTick={schoolFocusTick}
          lat={schoolFocusLat}
          lon={schoolFocusLon}
          radiusKm={schoolFocusRadiusKm}
        />
        <SchoolMarkerFocusPanner
          schoolMarkerFocusTick={schoolMarkerFocusTick}
          lat={schoolFocusLat}
          lon={schoolFocusLon}
          radiusKm={schoolFocusRadiusKm}
          markerPositions={schoolMarkerPositions}
        />
        <AreaRestorePanner
          areaRestoreTick={areaRestoreTick}
          lat={areaRestoreLat}
          lon={areaRestoreLon}
          bbox={areaRestoreBbox}
        />
        <CityRestorePanner
          cityRestoreTick={cityRestoreTick}
          cityCenter={cityRestoreCenter}
          cityZoom={cityRestoreZoom}
        />
        {isAgriMode ? (
          <>
            {/* Issue #1410: agriLayerListings = adaptAgriMapListingsToMarkers(agriGroupListings)
                when a regional group is selected; falls back to listings prop otherwise. */}
            <AgriMarkerClusterLayer
              listings={agriLayerListings}
              onSelectListing={onSelectListing}
              selectedListingId={selectedListingId}
              hoveredListingId={hoveredListingId}
            />
            <AgriPolygonLayer
              listings={agriLayerListings}
              selectedListing={selectedPolygonListing}
              onSelectListing={onSelectListing}
              mapZoom={mapZoom}
            />
          </>
        ) : (
          <MarkerClusterLayer
            listings={listings}
            onSelectListing={onSelectListing}
            selectedListingId={selectedListingId}
            hoveredListingId={hoveredListingId}
            onMarkerClickWithPosition={onMarkerClickWithPosition}
          />
        )}
        {areas.length > 0 && (
          <AreaMarkerLayer
            areas={areas}
            onAreaClick={onAreaClick}
            focusedGroupAreas={focusedGroupAreas}
            journey={journey}
            selectedSchool={selectedSchool}
            enableDegradation={enableAreaMarkerDegradation}
            selectedAreaKey={selectedAreaKey}
            searchMatchKeys={areaSearchMatchKeys}
            hoveredAreaKey={hoveredAreaKey}
            onAreaClusterClick={onAreaClusterClick}
            onMarkersComputed={onAreaMarkersComputed}
          />
        )}
        {schoolZoneLabels && schoolZoneLabels.length > 0 && (
          <SchoolZoneLabelLayer zones={schoolZoneLabels} onZoneClick={onSelectZone} />
        )}
        {showSchoolMarkers && (
          <SchoolMarkerLayer
            schools={schools}
            onSelectSchool={onSelectSchool}
            showSchoolMarkers={showSchoolMarkers}
            journey={journey}
            isLoading={schoolsIsLoading}
            isError={schoolsIsError}
            error={schoolsError}
            selectedSchoolId={selectedSchoolId}
          />
        )}
        {onPolygonDrawn && onPolygonCleared && (
          <DrawControl
            polygon={polygon}
            onPolygonDrawn={onPolygonDrawn}
            onPolygonCleared={onPolygonCleared}
          />
        )}
        {/* Issue #1429 — sector overlay for agri corridor-first discovery.
            Rendered before school circle (below markers in z-order via overlayPane). */}
        {sectorOverlay && (
          <SectorOverlay
            centerLat={cityCenter?.[0] ?? UDUPI_CENTER[0]}
            centerLon={cityCenter?.[1] ?? UDUPI_CENTER[1]}
            directionCode={sectorOverlay.directionCode}
            maxKm={sectorOverlay.maxKm}
          />
        )}
        {schoolCircle && (
          <>
            <Circle
              center={[schoolCircle.lat, schoolCircle.lon]}
              radius={schoolCircle.radiusKm * 1000}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#2563eb',
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '6 4',
              }}
            />
            {/* School location marker (🎓). The school name is intentionally NOT
                labelled on the map — the journey breadcrumb overlay already shows it,
                so a permanent tooltip here would just duplicate it. */}
            <Marker
              position={[schoolCircle.lat, schoolCircle.lon]}
              icon={schoolMarkerIcon}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
