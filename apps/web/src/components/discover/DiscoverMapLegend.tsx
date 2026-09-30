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
 *    variant at its own `bottom-10` (mobile; desktop School/Agri use
 *    DOCK_CLEARANCE_LEGEND_ANCHOR, see below) offset, UNLESS
 *    the variant is one of the three Areas-journey ones AND we're on
 *    desktop (`journey==='area-first' && !isMobileMapOverlay`) — then it
 *    renders NOTHING for that variant, because the slot call below owns it.
 *  - DiscoverMapSurface's slot call (`renderMode="desktopAreaFirstSlot"`)
 *    renders ONLY those Areas-journey-desktop variants, as plain (non-
 *    absolute) flex children — positioning is the wrapping flex column's
 *    job now, not this component's.
 * Every other journey/mobile is unaffected either way.
 *
 * Issue #2762 PR-D — PR-C (above) only broadened WHERE the legend renders (the
 * `desktopDockSlotOwnsLegend` gate, now covering School/Agri's Map Info Dock too);
 * it deliberately left WHICH legend content renders untouched. This pass fixes the
 * one real content gap that broadening exposed: `journey === 'school-first'` used
 * to show NOTHING from this switch once a school was selected and its homes were
 * on the map (`schoolRadiusOverlay`, suppressed on purpose to avoid duplicating the
 * separate SchoolRadiusLegend chrome's Schools/Homes/radius swatches) — but the
 * issue's own requirement is that stage shows the SAME property-type legend as the
 * Areas journey (derived from the actual rendered markers, `currentMapMarkerListings`),
 * with the selected school kept distinct via the untouched chrome. See the new block
 * below. The Agri branch is unchanged: `MapAgriLegend`'s existing stage derivation
 * (landing/corridor from `selectedRegion`, locality from `selectedLocality`) already
 * satisfies "corridor-context legend while browsing, Land-type legend once parcel
 * results are shown" — it never falls back to the generic property-type legend, so
 * there was nothing to fix there.
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
     * DESKTOP-ONLY split point (mobile keeps its own `bottom-10` bottom-left
     * footprint; #2762: the school-selected property legend sits beside the radius chrome): without this
     * the Areas-journey legend would try to move into the (nonexistent, on
     * mobile) dock slot too.
     */
    isMobileMapOverlay: boolean;
    /**
     * Issue #2762 PR-D — the SAME listings actually rendered as map markers
     * (`<PropertyMap listings={currentMapMarkerListings} .../>` in
     * DiscoverMapCanvas.tsx), used to derive the school-selected property-type
     * legend below. Deliberately NOT `areaMarkerListings` (that's the
     * Areas-journey area-marker set, a different query) — "the actual item
     * rendered, not the journey" (issue #2762's own wording) means this must
     * be the school-radius result set, which is what `currentMapMarkerListings`
     * already is for the school-first journey (see PropertyMap's `listings` prop
     * in DiscoverMapCanvas.tsx).
     */
    currentMapMarkerListings: Array<{ property_type: string }>;
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
 * Issue #2762 (visual-review fix, post PR-D) — PR-C broadened `desktopDockSlotOwnsLegend` so
 * the Map Info Dock now renders for the School/Agri journeys too (not just Areas), but the
 * School/Agri legend variant blocks below stayed `!slot`-only — i.e. they never moved into the
 * dock's flex column and kept their historical fixed `bottom-10` offset regardless of whether a
 * dock is now ALSO rendered at `bottom-[14px]` right below them. For the two branches where the
 * legend content is tall enough to reach that low (school-selected-with-homes' property-type
 * MapMarkerLegend, and agri's locality-stage MapAgriLegend), the two fixed-position boxes
 * geometrically overlap on desktop (confirmed via live `getBoundingClientRect()`, 1440x900).
 *
 * Fix: reuse the SAME worst-case dock-height clearance this codebase already computed and
 * documented for this exact dock (round 4's `bottom-[264px]`, DiscoverMapSurface.tsx's own doc
 * comment) instead of deriving a new number — desktop-only (`!isMobileMapOverlay`); mobile's
 * dock sits at a different anchor (`bottom-[150px]`, centered) and its own legend positioning is
 * untouched, per the existing "Mobile is unchanged" contract already documented on this file.
 *
 * Independent code-review (post-merge, HIGH severity) — `!isMobileMapOverlay` is true not only
 * at full desktop widths but also across the 821–1023px "narrow desktop shell" band (the same
 * band DiscoverMapSurface.tsx's own `max-h-[calc(100%-14px)] lg:max-h-none` dock clamp exists
 * for — see that file's "round 6/7" doc comment: the map container can shrink to as little as
 * ~78–106px tall there). Live-measured (`getBoundingClientRect()`, both confirmed real, not
 * theoretical):
 *  - School-selected-with-homes, 900×700 (bangalore, Koramangala, an actual seeded school+homes):
 *    legend top -190.85 / bottom -108.85 (container top 57, height ~78–84) — entirely above the
 *    map container and the viewport, never visible.
 *  - Agri locality/parcel-results, 900×700 (bangalore, SW corridor → RR Nagar, real seeded
 *    parcels): legend top -174.80 / bottom -136.80 — same failure mode.
 *  - Both confirmed FIXED at 1024×768 (the `lg` floor): school top 245/bottom 327, agri top
 *    289/bottom 327 — fully on-canvas, no clamp needed there.
 * A `max-height` clamp alone does NOT fix this: the box is positioned via `bottom-[264px]` with
 * no `top`, so its top edge is `containerHeight - 264 - height` — shrinking `height` still leaves
 * the box (or, once height hits 0, its anchor point) hundreds of px above a ~80px container;
 * only REPOSITIONING (not just resizing) the box would keep it on-canvas, and repositioning
 * without a fixed reference is exactly what DiscoverMapSurface's flex-column mechanism gives the
 * Areas-journey legend — but that mechanism isn't available here without extra plumbing
 * (`DiscoverMapSurfaceView.navigation` has no `selectedLocality` field yet; see that file's own
 * "KNOWN GAP (disclosed...)" comment next to its `variants` prop — re-keying the slot for Agri
 * today would silently render the wrong (non-locality) legend stage, a content regression worse
 * than a position one). So instead of inventing new positioning math here, this hides the
 * decorative legend content below `lg` and restores the exact, already-correct `bottom-[264px]`
 * anchor at `lg` and above — the same OUTCOME the Areas-journey legend already has in this band
 * (DiscoverMapSurface.tsx: `min-h-0 overflow-hidden` shrinks it to 0px when there's truly no
 * room), just reached without a flex ancestor to shrink against. Mobile (`isMobileMapOverlay`)
 * is untouched, per the ternaries this constant feeds into.
 */
const DOCK_CLEARANCE_LEGEND_ANCHOR = 'hidden lg:block lg:absolute lg:bottom-[264px] lg:left-4 lg:z-[1000]';
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

  // Issue #2762 PR-C — broadened from `variants?.journey === 'area-first'` to any resolved
  // journey: the Map Info Dock (mapInfoDockContent.ts) now covers all three journeys, not just
  // Areas, and DiscoverMapSurface.tsx only ever supplies `variants` for a call at all when its
  // own `mapInfoDockContent` is non-null — so "a journey is present" here already means "the dock
  // is rendering for it". Re-gating only the DOCK (mapInfoDockContent.ts) and leaving THIS split
  // at 'area-first' would leave School/Agri's existing legend rendering at its old inline
  // position while the new dock renders on top of it — the exact overlap this re-gate exists to
  // prevent. The variant-SELECTION switch below this point is unchanged (PR-D's remit, not
  // this PR's) — only which call site (inline vs. slot) owns the render moves.
  const desktopDockSlotOwnsLegend = variants != null && !variants.isMobileMapOverlay;
  const renderAreaFirstVariantsHere = variants && (slot ? desktopDockSlotOwnsLegend : !desktopDockSlotOwnsLegend);

  return (
    <>
      {/* Radius legend — bottom-left, raised above the Leaflet zoom control (bottomleft).
          Only the selected-school radius state; swatches match the real map markers/ring.
          Issue #2762 (visual-review fix) — this INLINE (`!slot`) branch only ever renders when
          `chromeOwnedByDesktopSlot` is false, i.e. desktop + a non-area-first journey (school-
          first) or mobile (any journey). On desktop that's now exactly a journey the Map Info
          Dock ALSO renders for (PR-C broadened the dock to all three journeys), so this chrome's
          historical `bottom-24` collides with the dock at `bottom-[14px]` the same way the
          MapMarkerLegend/MapAgriLegend variant blocks below did — confirmed live via
          `getBoundingClientRect()` (school-selected-with-homes, 1440x900: chrome y:601-683 vs.
          dock y:662-765, a real 21px overlap). Mobile's dock sits at a different anchor
          (`bottom-[150px]`); this chrome's mobile position is `bottom-10` (moved from
          `bottom-24`, which reached into the mobile dock — see the mobile branch below). */}
      {renderSchoolRadiusChromeHere && schoolRadiusChrome && (
        <div
          data-testid="discover-map-legend"
          className={
            slot
              ? SLOT_LEGEND_ITEM
              : schoolRadiusChrome.isMobileMapOverlay
                ? // #2762: `bottom-10` (was `bottom-24`, which reached into the mobile dock at
                  // `bottom-[150px]`); the school-selected property-type legend sits beside it.
                  'absolute bottom-10 left-4 z-[1000]'
                : DOCK_CLEARANCE_LEGEND_ANCHOR
          }
        >
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
            <div
              data-testid="discover-map-legend"
              className={
                // Issue #2762 (visual-review fix) — live `getBoundingClientRect()` measurement
                // (1440x900, desktop) found ALL THREE agri stages colliding with the Map Info
                // Dock at the historical `bottom-10` offset once the dock started rendering for
                // this journey too (PR-C), not only the originally-reported locality/parcel-
                // results stage — landing (y:701-739 vs. dock y:723-765, 16px overlap) and
                // corridor (y:679-739 vs. dock y:723-765, 16px overlap) collide just as much as
                // locality did. Applying the same DOCK_CLEARANCE_LEGEND_ANCHOR to every stage
                // (desktop only) closes the whole bug class in this one block rather than
                // leaving two of its three stages still broken. Mobile unchanged, as elsewhere.
                variants.isMobileMapOverlay ? 'absolute bottom-10 left-4 z-[1000]' : DOCK_CLEARANCE_LEGEND_ANCHOR
              }
            >
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
            <div
              data-testid="discover-map-legend"
              className={
                // Issue #2762 (visual-review fix) — same root cause and same live-measured
                // collision as the agri block above (landing stage: legend y:701-739 vs. dock
                // y:687-765, 38px overlap) — the dock now renders for this journey too (PR-C)
                // while this legend kept its historical fixed offset. See
                // DOCK_CLEARANCE_LEGEND_ANCHOR's doc comment for the shared fix.
                variants.isMobileMapOverlay ? 'absolute bottom-10 left-4 z-[1000]' : DOCK_CLEARANCE_LEGEND_ANCHOR
              }
            >
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

          {/* Issue #2762 PR-D — school-first, a school IS selected and its homes-within-radius
              are on the map (`schoolRadiusOverlay`): the markers on the map at this stage are
              real property listings (`currentMapMarkerListings`, the SAME array passed to
              `<PropertyMap listings=.../>`), not school pins — the issue's own requirement is
              "property-type legend/markers (same grammar as By-area)" here, not the Schools-only
              MapSchoolLegend above (which is correctly suppressed for this stage) and not a
              redundant re-statement of the school/radius swatches SchoolRadiusLegend (the
              `schoolRadiusChrome` call, above) already renders — that chrome is what keeps the
              selected school visibly distinct from the property markers; this block only adds
              the per-type breakdown of the homes themselves, mirroring the Areas-journey
              MapMarkerLegend block below byte-for-byte (same component, same empty-array no-op
              via MapMarkerLegend's own `rows.length === 0` guard). Never part of the desktop
              slot split, matching every other school/agri branch in this switch. */}
          {variants.journey === 'school-first' && variants.schoolRadiusOverlay && !slot && (
            <div
              data-testid="discover-map-legend"
              className={
                // Issue #2762 (visual-review fix) — see DOCK_CLEARANCE_LEGEND_ANCHOR's doc
                // comment above: the dock now also renders for this journey/stage, and this
                // property-type legend is tall enough to reach its footprint at bottom-10.
                // Mobile (#2762): sit beside the ~107px radius chrome (`left-[8.5rem]`), capped
                // (100px tall, clear of the zoom control) so it never reaches the dock (150px).
                variants.isMobileMapOverlay
                  ? 'absolute bottom-10 left-[8.5rem] z-[1000] max-h-[6.25rem] max-w-[calc(100%-12rem)] overflow-y-auto'
                  : DOCK_CLEARANCE_LEGEND_ANCHOR
              }
            >
              <MapMarkerLegend listings={variants.currentMapMarkerListings} />
            </div>
          )}
        </>
      )}
    </>
  );
}
