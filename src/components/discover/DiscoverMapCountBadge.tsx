import { MapPin } from 'lucide-react';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { DiscoverBadgeResult } from '@/pages/MapDiscovery';

/**
 * Issue #1824 Slice S8 — the drill-down count pill (~L3100-3211) + the
 * public-landing summary pill (~L3213-3229), unified as one component (both
 * emit `data-testid="discover-badge"`, never rendered together).
 *
 * *** COPY-FORK GUARD (AC4) *** — the area-first selected-area branch renders
 * `areaResultSummaryText` VERBATIM (the SAME computed string the
 * DiscoverRightPanel/AreaSelectedPanel stat renders). It is passed in by the
 * page, never recomputed here. The group-selected and generic-fallback
 * branches' copy is ALSO precomputed by the page (formatDiscoverBadgeCopy is
 * a page-owned pure helper — see slice-s8-design.md FLAG-B) and passed as
 * `groupSelectedBadgeCopy` / `fallbackBadgeCopy`, so this component never
 * imports or calls formatDiscoverBadgeCopy itself and stays fully decoupled
 * from '@/pages/MapDiscovery' at runtime (only a type-only import remains).
 */
export interface DiscoverMapCountBadgeProps {
  resolvedPanelContent: DiscoverPanelContent;
  isAreaFirstCityLanding: boolean;
  discoverBadge: DiscoverBadgeResult;
  isSelectedGroupState: boolean;
  isAreaFirstSelectedAreaState: boolean;
  selectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  /** AC4 — verbatim copy for the area-first selected-area branch. */
  areaResultSummaryText: string | null;
  /** Page-computed formatDiscoverBadgeCopy() for the area-groups-landing branch. */
  groupSelectedBadgeCopy: string;
  /** Page-computed formatDiscoverBadgeCopy() for the generic fallback branch. */
  fallbackBadgeCopy: string;
  journey: DiscoverJourney | null;
  schoolRadiusActive: boolean;
  /** Page-computed deriveSchoolRadiusPillNoun(urlState.intent). */
  schoolRadiusPillNoun: 'homes' | 'rentals';
  schoolFirstAreaSchoolCount: number | null;
  schoolFirstZoneSchoolCount: number | null;
  schoolFirstLandingSchoolCount: number | null;
  cityTotal: number;
  city: string;
}

export function DiscoverMapCountBadge({
  resolvedPanelContent,
  isAreaFirstCityLanding,
  discoverBadge,
  isSelectedGroupState,
  isAreaFirstSelectedAreaState,
  selectedArea,
  focusedGroup,
  areaResultSummaryText,
  groupSelectedBadgeCopy,
  fallbackBadgeCopy,
  journey,
  schoolRadiusActive,
  schoolRadiusPillNoun,
  schoolFirstAreaSchoolCount,
  schoolFirstZoneSchoolCount,
  schoolFirstLandingSchoolCount,
  cityTotal,
  city,
}: DiscoverMapCountBadgeProps) {
  return (
    <>
      {/* City / area listing count — bottom-right (Issue #1152). Issue #1588 — on the
          public landing this is replaced by the centered city-wide summary pill below;
          kept bottom-right for contextual (area/school/group) drill-down counts. */}
      {resolvedPanelContent !== 'guided-entry' && !isAreaFirstCityLanding && discoverBadge.visible && (discoverBadge.count != null || discoverBadge.state === 'stale') && (
        <div
          className={
            // Issue #1595 — on the selected-group step the pill is centred at the bottom.
            // Issue #1606 — area-first selected-area step also centres the pill (bottom-8
            // for clearance above attribution; clear of zoom bottom-right + legend bottom-left).
            // Every other drill-down context keeps the compact bottom-right placement.
            isSelectedGroupState || isAreaFirstSelectedAreaState
              ? 'absolute bottom-8 left-1/2 z-[1000] -translate-x-1/2'
              : 'absolute bottom-16 right-4 z-[1000]'
          }
          data-testid="discover-badge"
        >
          <div
            className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm"
            aria-busy={discoverBadge.loading}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {/* Issue #1595 — in the selected-group drill-down the footer pill names the
                group and marks the count as verified ("Showing 8 verified properties in
                University Belt").
                Issue #1606 — in the area-first selected-area state the pill reads
                "Showing N verified properties in {areaLabel}". Every other context keeps
                the plain "N properties".
                Issue #1817 — the 'stale' state (count-contract unreliable, e.g. authed
                school-radius + filters) is checked FIRST, before any of the specific
                journey branches below, because those branches assume a non-null count. */}
            {discoverBadge.state === 'stale' ? (
              <span data-testid="discover-badge-stale">Filtered results</span>
            ) : resolvedPanelContent === 'area-groups-landing' && focusedGroup && !selectedArea ? (
              // Issue #1817 (code-review follow-up) — routed through the shared copy
              // contract so filters/search active here render `M of N match ... in
              // {Group}` (design §6 "Area group selected + filters") instead of always
              // showing the plain verified-properties form.
              <span>{groupSelectedBadgeCopy}</span>
            ) : isAreaFirstSelectedAreaState && selectedArea ? (
              // Issue #1817 (code-review follow-up) — same fix for the area-first
              // selected-area state (design §6 "Area selected + filters" → `5 of 18
              // match in Whitefield"). Reuses areaResultSummaryText — the SAME
              // computed string the AreaSelectedPanel stat renders — so the two
              // surfaces can never diverge.
              <span>{areaResultSummaryText}</span>
            ) : journey === 'school-first' && schoolRadiusActive ? (
              // School-first, school selected — the badge count IS the school-radius
              // listing count (schoolListingsCount, threaded above), so "homes"/"rentals"
              // is an honest label here (mock parity: "Showing X homes").
              <span>
                Showing{' '}
                <strong className="font-semibold tabular-nums text-foreground">
                  {discoverBadge.count.toLocaleString()}
                </strong>
                {' '}{schoolRadiusPillNoun}
              </span>
            ) : journey === 'school-first' && !schoolRadiusActive && selectedArea && schoolFirstAreaSchoolCount != null ? (
              // School-first, area selected, no school picked yet — mock parity:
              // "Showing X schools" using the same schoolCount the area-selected hero
              // displays (selectedArea.schoolCount), not the generic listings total.
              <span>
                Showing{' '}
                <strong className="font-semibold tabular-nums text-foreground">
                  {schoolFirstAreaSchoolCount.toLocaleString()}
                </strong>
                {' '}school{schoolFirstAreaSchoolCount === 1 ? '' : 's'}
              </span>
            ) : journey === 'school-first' && !schoolRadiusActive && !selectedArea && focusedGroup && schoolFirstZoneSchoolCount != null ? (
              // School-first, zone selected, no area picked yet — mock parity:
              // "Showing X schools" using the same member-area schoolCount sum the
              // zone-selected hero displays.
              <span>
                Showing{' '}
                <strong className="font-semibold tabular-nums text-foreground">
                  {schoolFirstZoneSchoolCount.toLocaleString()}
                </strong>
                {' '}school{schoolFirstZoneSchoolCount === 1 ? '' : 's'}
              </span>
            ) : journey === 'school-first' && !schoolRadiusActive && !selectedArea && !focusedGroup && schoolFirstLandingSchoolCount != null ? (
              // School-first landing (no zone/area/school selected yet) — mock parity:
              // "Showing X schools" across the city scope currently on the map.
              <span>
                Showing{' '}
                <strong className="font-semibold tabular-nums text-foreground">
                  {schoolFirstLandingSchoolCount.toLocaleString()}
                </strong>
                {' '}school{schoolFirstLandingSchoolCount === 1 ? '' : 's'}
              </span>
            ) : (
              // Issue #1817 — generic fallback (city / group / area outside the
              // special-cased journeys above): render via the shared copy contract
              // so this pill and the panel header stat can never diverge (AC4/AC5).
              <span>{fallbackBadgeCopy}</span>
            )}
          </div>
        </div>
      )}

      {/* Public-landing summary pill — bottom-center, city-wide verified total (Issue #1588).
          Issue #1607 — the area-first city landing reuses the same centred pill so the
          card "properties" stat, the map markers, and this pill all report one figure. */}
      {(resolvedPanelContent === 'guided-entry' || isAreaFirstCityLanding) && cityTotal > 0 && (
        <div className="absolute bottom-5 left-1/2 z-[1000] -translate-x-1/2" data-testid="discover-badge">
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground shadow-md">
            <MapPin className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
            <span>
              Showing{' '}
              <strong className="font-mono font-bold tabular-nums text-foreground">
                {cityTotal.toLocaleString()}
              </strong>
              {' '}verified properties across {CITY_CONFIG[city]?.label ?? city}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
