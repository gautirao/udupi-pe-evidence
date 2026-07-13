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
 */
export interface DiscoverMapLegendProps {
  /** Radius legend chrome (~L2957-2963). Omit to render nothing for this call. */
  schoolRadiusChrome?: { schoolRadiusKm: number | undefined } | null;
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
  } | null;
}

export function DiscoverMapLegend({
  schoolRadiusChrome = null,
  variants = null,
}: DiscoverMapLegendProps) {
  return (
    <>
      {/* Radius legend — bottom-left, raised above the Leaflet zoom control (bottomleft).
          Only the selected-school radius state; swatches match the real map markers/ring. */}
      {schoolRadiusChrome && (
        <div className="absolute bottom-24 left-4 z-[1000]">
          <SchoolRadiusLegend
            radiusKm={clampSchoolRadiusKm(schoolRadiusChrome.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM)}
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
              (scope=null) rendering here is otherwise unchanged. */}
          {variants.resolvedPanelContent === 'guided-entry' && !variants.schoolRadiusOverlay && variants.overviewAreas.length > 0 && !variants.isRegionOverview && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1808 — region-aware legend variant, region-overview only.
              Gated on regionGuideVisible (not the raw isRegionOverview) so the
              legend note clears together with the card + ring on dismiss (AC6). */}
          {variants.regionGuideVisible && !variants.schoolRadiusOverlay && variants.regionOverviewShortLabel && (
            <div className="absolute bottom-10 left-4 z-[1000]">
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
          {variants.isAreaFirstSelectedAreaState && !variants.schoolRadiusOverlay && variants.areaMarkerListings.length > 0 && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapMarkerLegend listings={variants.areaMarkerListings} />
            </div>
          )}

          {/* Issue #1595 — the area-first selected-group drill-down shows the same
              "Areas" legend, since its map surfaces member-area markers with counts. */}
          {variants.isSelectedGroupState && !variants.schoolRadiusOverlay && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1607 — the area-first city landing shows only areas WITH properties
              (zero-listing areas are hidden, mirroring the guided-entry landing), so the
              legend carries just the "Areas with properties" row. */}
          {variants.isAreaFirstCityLanding && !variants.schoolRadiusOverlay && variants.overviewAreas.length > 0 && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1771 — Agri-first journey map legend, contextual per drill-down stage:
              landing → Corridors; corridor selected → Corridors + Village clusters;
              locality selected → Parcels. */}
          {variants.journey === 'agri-first' && !variants.schoolRadiusOverlay && (
            <div className="absolute bottom-10 left-4 z-[1000]">
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
              !schoolRadiusOverlay to avoid a redundant/competing bottom-left legend. */}
          {variants.journey === 'school-first' && !variants.schoolRadiusOverlay && (
            <div className="absolute bottom-10 left-4 z-[1000]">
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
