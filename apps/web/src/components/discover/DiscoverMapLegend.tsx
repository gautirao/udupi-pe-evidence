import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { MapAreaLegend } from '@/components/discover/MapAreaLegend';
import { MapRegionOverviewLegend } from '@/components/discover/MapRegionOverviewLegend';
import { MapAgriLegend } from '@/components/discover/MapAgriLegend';
import { MapMarkerLegend } from '@/components/discover/MapMarkerLegend';
import { MapSchoolLegend, type SchoolLegendStage } from '@/components/discover/MapSchoolLegend';
import { SchoolRadiusLegend } from '@/components/discover/SchoolRadiusMapOverlay';
import { clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

/**
 * Issue #1824 Slice S8 — bottom-left map legend: the SchoolRadiusLegend chrome
 * (~L2957-2963) + the 7-variant legend switch (~L2999-3086) MapDiscovery
 * previously rendered inline. PURE presentation over already-derived gates.
 *
 * The chrome and the 7-variant switch sit at DIFFERENT positions in
 * MapDiscovery's render tree — CitySelect and RegionGuidanceCard (both
 * page-owned, not part of S8) are sandwiched between them — so this
 * component is called TWICE (mirrors the DiscoverMapStatusHints pattern) to
 * preserve the exact pre-extraction sibling order (AC2/AC10). Each prop
 * bundle is optional/undefined for the call that doesn't own that region.
 * See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s8-design.md.
 *
 * Issue #2748 (owner feedback, round 5) — a THIRD call site now exists:
 * DiscoverMapSurface.tsx renders this component again, with
 * `renderMode="desktopAreaFirstSlot"`, as a real flex sibling of the Map
 * Info Dock inside their shared bottom-left column. A fixed worst-case
 * legend offset (round 4's `bottom-[264px]`) reserved room for the TALLEST
 * possible dock, leaving a large dead gap above the dock in every SHORTER
 * state (e.g. ~172px in the common area-selected state, per the owner's
 * live measurement) — exactly the "unexplained gap" complaint. A real flex
 * column with `gap` adapts to the dock's ACTUAL rendered height with no
 * measurement/ResizeObserver, so the two calls now divide the work:
 *  - DiscoverMapCanvas's calls (`renderMode` omitted/'inline') render every
 *    variant at its own historical `bottom-10`/`bottom-24` offset, UNLESS
 *    the variant is one of the three Areas-journey ones AND we're on
 *    desktop (`journey==='area-first' && !isMobileMapOverlay`) — then it
 *    renders NOTHING for that variant, because the slot call below owns it.
 *  - DiscoverMapSurface's slot call (`renderMode="desktopAreaFirstSlot"`)
 *    renders ONLY those Areas-journey-desktop variants, as plain (non-
 *    absolute) flex children — positioning is the wrapping flex column's
 *    job now, not this component's.
 * Every other journey/mobile is unaffected either way.
 */
export interface DiscoverMapLegendProps {
  /** Radius legend chrome (~L2957-2963). Omit to render nothing for this call. */
  schoolRadiusChrome?: {
    schoolRadiusKm: number | undefined;
    /**
     * True only for the Areas journey's `area-school-combined` state
     * (`journey === 'area-first'`, areaKey + schoolId both set), the one
     * case where `schoolRadiusOverlay` can be true while the Map Info Dock
     * also renders (`deriveMapInfoDockContent` gates on the same check).
     * Combined with `renderMode`/`isMobileMapOverlay` below to decide
     * whether THIS call renders it (desktop slot) or skips it (inline call,
     * desktop) or renders it inline as always (mobile, every other journey).
     */
    isAreaFirstJourney: boolean;
    isMobileMapOverlay: boolean;
  } | null;
  /** The 7-variant legend switch (~L2999-3086). Omit to render nothing for this call. */
  variants?: {
    schoolRadiusOverlay: boolean;
    resolvedPanelContent: DiscoverPanelContent;
    overviewAreas: AreaPoint[];
    isRegionOverview: boolean;
    regionGuideVisible: boolean;
    regionOverviewShortLabel: string | null;
    regionOverviewMarkerKind: RegionOverviewMarkerKind;
    isAreaFirstSelectedAreaState: boolean;
    areaMarkerListings: Array<{ property_type: string }>;
    isSelectedGroupState: boolean;
    isAreaFirstCityLanding: boolean;
    journey: DiscoverJourney | null;
    selectedLocality: string | null;
    selectedRegion: string | null;
    /**
     * DESKTOP-ONLY split point (mobile keeps its own untouched `bottom-10`
     * footprint, per the owner's "Mobile is unchanged" note): without this
     * the Areas-journey legend would try to move into the (nonexistent, on
     * mobile) dock slot too.
     */
    isMobileMapOverlay: boolean;
  } | null;
  /**
   * 'inline' (default) — this call's own historical `bottom-10`/`bottom-24`
   * absolute positioning, used by DiscoverMapCanvas.
   * 'desktopAreaFirstSlot' — plain, non-positioned flex children, used only
   * by DiscoverMapSurface's slot call (see the component doc comment above).
   */
  renderMode?: 'inline' | 'desktopAreaFirstSlot';
}

const DEFAULT_LEGEND_ANCHOR = 'absolute bottom-10 left-4 z-[1000]';
/**
 * Owner feedback (round 6) — `desktopAreaFirstSlot` mode's wrapper divs used to carry NO
 * class at all, and DiscoverMapSurface wrapped `<DiscoverMapLegend>` in its own extra
 * `min-h-0 overflow-hidden` div to let the narrow 821–1023px band's flex column actually
 * shrink it. That worked for the WRAPPER (live-verified: computed height 0px when there's
 * no room) but not for THIS element inside it — CSS percentage heights (`max-height:100%`,
 * tried first) only resolve against an ancestor with an EXPLICIT height; a flex-shrunk
 * height doesn't count (CSS2.1 §10.5), so `max-h-full` silently resolved to `none` and
 * this element kept reporting its full natural height, floating outside its own 0px
 * parent — a real geometric overlap with the dock, not just a cosmetic one.
 *
 * Fixed by making THIS element the flex item directly (DiscoverMapSurface no longer wraps
 * it in a proxy div) — `min-h-0` overrides the flex default `min-height:auto` (which
 * refuses to shrink a flex item below its own content size) so the flex algorithm can
 * size THIS box down for real, and `overflow-hidden` clips whatever content doesn't fit
 * inside that real, shrunk box. `pointer-events-auto` (moved here from the old wrapper)
 * restores this element's ORIGINAL (unset/auto) pointer-events, since it now sits
 * directly inside the dock's `pointer-events-none` column.
 *
 * That alone shrunk THIS element correctly (live-verified: computed height 0px) but not
 * its OWN child (MapAreaLegend/MapMarkerLegend/SchoolRadiusLegend's root) — a plain block
 * child's natural height is unaffected by an ancestor's size unless the CHILD is itself a
 * flex item of a flex parent (nested flex-shrink DOES cascade correctly through multiple
 * levels — unlike the percentage-height case above, this is normal, well-supported CSS).
 * `flex flex-col` here turns this element into a (shrunk) flex container of its own single
 * child, and each legend component's own optional `className` prop (see MapAreaLegend's
 * doc comment) carries the matching `min-h-0 overflow-hidden` down one more level.
 */
const SLOT_LEGEND_ITEM = 'pointer-events-auto flex min-h-0 flex-col overflow-hidden';
/** Passed to the inner legend component's own `className` prop in slot mode — see above. */
const SLOT_LEGEND_CHILD = 'min-h-0 overflow-hidden';

export function DiscoverMapLegend({
  schoolRadiusChrome = null,
  variants = null,
  renderMode = 'inline',
}: DiscoverMapLegendProps) {
  const slot = renderMode === 'desktopAreaFirstSlot';

  // Desktop Areas-journey school-radius chrome: rendered by the SLOT call
  // only; the inline call (DiscoverMapCanvas) skips it there so it isn't
  // rendered twice.
  const chromeOwnedByDesktopSlot = !!schoolRadiusChrome?.isAreaFirstJourney && !schoolRadiusChrome?.isMobileMapOverlay;
  const renderSchoolRadiusChromeHere = schoolRadiusChrome && (slot ? chromeOwnedByDesktopSlot : !chromeOwnedByDesktopSlot);

  // Same split for the three Areas-journey variant branches below.
  const areaFirstDesktop = variants?.journey === 'area-first' && !variants.isMobileMapOverlay;
  const renderAreaFirstVariantsHere = variants && (slot ? areaFirstDesktop : !areaFirstDesktop);

  return (
    <>
      {/* Radius legend — bottom-left, raised above the Leaflet zoom control (bottomleft).
          Only the selected-school radius state; swatches match the real map markers/ring. */}
      {renderSchoolRadiusChromeHere && schoolRadiusChrome && (
        <div data-testid="discover-map-legend" className={slot ? SLOT_LEGEND_ITEM : 'absolute bottom-24 left-4 z-[1000]'}>
          <SchoolRadiusLegend
            radiusKm={clampSchoolRadiusKm(schoolRadiusChrome.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM)}
            className={slot ? SLOT_LEGEND_CHILD : undefined}
          />
        </div>
      )}

      {variants && (
        <>
          {/* Area-count legend — bottom-left, public landing only. Shown ONLY when there
              are actual area markers on the map (hidden entirely on empty cities), and
              never over the school-radius legend. All landing markers are areas with
              properties, so only the "Areas with properties" row is shown (Issue #1588).
              Issue #1808 — excluded at region-overview (scope set), which now shows the
              marker-accurate MapRegionOverviewLegend below instead; the city-landing
              (scope=null) rendering here is otherwise unchanged. Never part of the
              Areas-journey desktop slot split — `guided-entry` cannot co-occur with
              `journey==='area-first'` (see derivePanelContent). */}
          {variants.resolvedPanelContent === 'guided-entry' && !variants.schoolRadiusOverlay && variants.overviewAreas.length > 0 && !variants.isRegionOverview && !slot && (
            <div data-testid="discover-map-legend" className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1808 — region-aware legend variant, region-overview only. Same
              non-slot reasoning as above. */}
          {variants.regionGuideVisible && !variants.schoolRadiusOverlay && variants.regionOverviewShortLabel && !slot && (
            <div data-testid="discover-map-legend" className="absolute bottom-10 left-4 z-[1000]">
              <MapRegionOverviewLegend
                regionShortLabel={variants.regionOverviewShortLabel}
                markerKind={variants.regionOverviewMarkerKind}
              />
            </div>
          )}

          {/* a2 — Marker-meaning legend for the area-first selected-area results state.
              Shown only when there is at least one area marker and we are in area-selected.
              Does not render on guided-entry / selected-group (those keep MapAreaLegend).
              Does not clash with badge (bottom-16 right-4), zoom (bottom-right), or attribution. */}
          {variants.isAreaFirstSelectedAreaState && !variants.schoolRadiusOverlay && variants.areaMarkerListings.length > 0 && renderAreaFirstVariantsHere && (
            <div data-testid="discover-map-legend" className={slot ? SLOT_LEGEND_ITEM : DEFAULT_LEGEND_ANCHOR}>
              <MapMarkerLegend listings={variants.areaMarkerListings} className={slot ? SLOT_LEGEND_CHILD : undefined} />
            </div>
          )}

          {/* Issue #1595 — the area-first selected-group drill-down shows the same
              "Areas" legend, since its map surfaces member-area markers with counts. */}
          {variants.isSelectedGroupState && !variants.schoolRadiusOverlay && renderAreaFirstVariantsHere && (
            <div data-testid="discover-map-legend" className={slot ? SLOT_LEGEND_ITEM : DEFAULT_LEGEND_ANCHOR}>
              <MapAreaLegend showZeroRow={false} className={slot ? SLOT_LEGEND_CHILD : undefined} />
            </div>
          )}

          {/* Issue #1607 — the area-first city landing shows only areas WITH properties
              (zero-listing areas are hidden, mirroring the guided-entry landing), so the
              legend carries just the "Areas with properties" row. */}
          {variants.isAreaFirstCityLanding && !variants.schoolRadiusOverlay && variants.overviewAreas.length > 0 && renderAreaFirstVariantsHere && (
            <div data-testid="discover-map-legend" className={slot ? SLOT_LEGEND_ITEM : DEFAULT_LEGEND_ANCHOR}>
              <MapAreaLegend showZeroRow={false} className={slot ? SLOT_LEGEND_CHILD : undefined} />
            </div>
          )}

          {/* Issue #1771 — Agri-first journey map legend, contextual per drill-down stage:
              landing → Corridors; corridor selected → Corridors + Village clusters;
              locality selected → Parcels. Never part of the desktop slot split — cannot
              co-occur with `journey==='area-first'`. */}
          {variants.journey === 'agri-first' && !variants.schoolRadiusOverlay && !slot && (
            <div data-testid="discover-map-legend" className="absolute bottom-10 left-4 z-[1000]">
              <MapAgriLegend
                stage={
                  variants.selectedLocality
                    ? 'locality'
                    : variants.selectedRegion
                      ? 'corridor'
                      : 'landing'
                }
              />
            </div>
          )}

          {/* School-first journey map legend, contextual per drill-down stage (mirrors
              the #1771 MapAgriLegend pattern): school-browse → School zones;
              school-group-areas → Areas; schools-in-area → Schools. Once a specific
              school is selected the existing SchoolRadiusLegend (above) already covers
              the school marker + radius-circle swatches, so this legend is gated off via
              !schoolRadiusOverlay to avoid a redundant/competing bottom-left legend. Never
              part of the desktop slot split — cannot co-occur with `journey==='area-first'`. */}
          {variants.journey === 'school-first' && !variants.schoolRadiusOverlay && !slot && (
            <div data-testid="discover-map-legend" className="absolute bottom-10 left-4 z-[1000]">
              <MapSchoolLegend
                stage={
                  ((): SchoolLegendStage => {
                    if (variants.resolvedPanelContent === 'schools-in-area') return 'area';
                    if (variants.resolvedPanelContent === 'school-group-areas') return 'zone';
                    return 'landing';
                  })()
                }
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
