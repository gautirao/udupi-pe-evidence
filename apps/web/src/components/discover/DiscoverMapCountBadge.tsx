import { MapPin } from 'lucide-react';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';

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
  /**
   * Issue #2698 — suppresses the drill-down count pill (not the public-landing
   * summary pill) where the caller already shows the same count elsewhere: the
   * mobile Map results heading. Defaults to false, so desktop is unchanged.
   */
  hideDrillDownBadge?: boolean;
  /**
   * Issue #2716 — the full-screen mobile Map overlay (same signal as
   * DiscoverMapCanvas's `isMobileMapOverlay`/DiscoverMapStatusHints's prop of
   * the same name) needs the public-landing summary pill raised clear of the
   * Leaflet zoom control's bottom-right footprint. Mirrors the `bottom-8`
   * value the sibling drill-down pill already uses at line ~106 for the same
   * centred-pill-clears-zoom-bottom-right-and-legend-bottom-left geometry.
   * Defaults to false, so desktop stays byte-identical (`bottom-5`).
   */
  isMobileMapOverlay?: boolean;
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
  hideDrillDownBadge = false,
  isMobileMapOverlay = false,
}: DiscoverMapCountBadgeProps) {
  return (
    <>
      {/* City / area listing count — bottom-right (Issue #1152). Issue #1588 — on the
          public landing this is replaced by the centered city-wide summary pill below;
          kept bottom-right for contextual (area/school/group) drill-down counts. */}
      {!hideDrillDownBadge && resolvedPanelContent !== 'guided-entry' && !isAreaFirstCityLanding &&
        // Issue #2169 Bug 2 — Agricultural land is a separate model (parcels,
        // corridors, distances — see DiscoverRightPanel's Agri intro copy),
        // kept apart from residential area counts. This badge's only count
        // source below `discoverBadge`/`fallbackBadgeCopy` is `cityTotal`,
        // the RESIDENTIAL city-wide sum (useDiscoverBadgeController), which
        // has no agri-first branch to special-case — so without this guard
        // every agri state fell through to the generic fallback and showed
        // the unrelated residential total (e.g. "15 properties in Udupi")
        // while the right panel showed agri corridor/parcel stats. Suppressed
        // entirely (mirrors the school-first pattern's journey-aware branch,
        // but the agri journey already surfaces its own corridor/parcel
        // counts prominently in the right panel, so a second aggregate here
        // would be redundant at best and a second value to keep in sync at
        // worst — see #2169 root-cause notes for the corridor-count derived
        // alternative that was rejected for that reason).
        journey !== 'agri-first' &&
        discoverBadge.visible && (discoverBadge.count != null || discoverBadge.state === 'stale') && (
        <div
          className={
            // Issue #1595 — on the selected-group step the pill is centred at the bottom.
            // Issue #1606 — area-first selected-area step also centres the pill (clear of zoom
            // bottom-right + legend bottom-left). Every other drill-down context keeps the
            // compact bottom-right placement.
            // Issue #2714 — both variants sat too low. The centred one was bottom-8: wide
            // long-copy variants ("Showing 8 verified properties in University Belt") reached the
            // bottom-left legend at 1024x768 even after capping their width (below), because
            // wrapping to 2 lines made the pill taller, not narrower, and the taller pill's top
            // edge still reached into the legend's tallest variant (live-measured top edge
            // 129px). The compact bottom-right one was bottom-16 (64px), which sat inside the
            // Leaflet zoom control's footprint (live-measured 28x27px overlap at 1440x900 in the
            // school-first landing state — this is the branch the school-radius "Showing X
            // homes/schools" copy below also uses) and also needs to clear DiscoverMapCanvas's
            // "Recenter on <city>" button (bottom-48, top edge 222px) and DiscoverMapStatusHints's
            // school-radius "more" hint (bottom-28, live-measured top edge 178px), both of which
            // can render alongside it in the anon school-radius "showing first N" state. Both
            // variants now share bottom-60 (240px), clearing every one of those neighbours (zoom's
            // top edge 91px, the legend's 129px, the hint's 178px, the city-recenter button's
            // 222px) with an 18px+ margin — confirmed via Playwright at 1024x768 and 1440x900.
            isSelectedGroupState || isAreaFirstSelectedAreaState
              ? 'absolute bottom-60 left-1/2 z-[1000] max-w-[220px] -translate-x-1/2'
              : 'absolute bottom-60 right-4 z-[1000]'
          }
          data-testid="discover-badge"
        >
          <div
            className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm"
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
      {/* Issue #2169 Bug 2 — defence-in-depth: this pill is keyed off
          isAreaFirstCityLanding (area-first only) and 'guided-entry' (the
          pre-journey chooser, before journey is set), so it should never be
          reachable once journey === 'agri-first'; the explicit guard keeps
          that invariant enforced even if isAreaFirstCityLanding's derivation
          ever changes. */}
      {(resolvedPanelContent === 'guided-entry' || isAreaFirstCityLanding) &&
        journey !== 'agri-first' && cityTotal > 0 && (
        <div
          className={
            // Issue #2716 — mobile Map: base bottom-5 pill overlapped the Leaflet
            // zoom control at 375/390/412px (measured, see measurements-before.json).
            // Only ~9px separates the #2713 recenter button from the zoom control at
            // 375x667, so no bottom-* offset alone clears it — fix is bottom-8 (same
            // clearance the sibling drill-down pill uses above the recenter button)
            // plus a width cap so the (unchanged) copy wraps and stays clear of the
            // zoom control's column horizontally too. Verified 0 intersections at all
            // 3 mobile widths (measurements-finalfix.json). Mobile placement (bottom-8) is
            // untouched here.
            // Issue #2714 — the desktop bottom-5 pill's width (up to ~257px unwrapped, centred)
            // reached the bottom-left legend column at 1024x768 (live-measured 98x18px overlap).
            // Capping its width to max-w-[220px] (same cap #2716 already uses for mobile above,
            // which stays on its own untouched w-[calc(100%-6rem)]/bottom-8 — AC4's
            // mobile-unchanged guarantee still holds) wrapped the copy to 2 lines instead of
            // reaching sideways, but the now-taller pill still reached the legend's tallest
            // variant (live-measured top edge 129px) at bottom-5. Raised to bottom-60 (240px),
            // matching the sibling drill-down centred badge above for the same reason (clears the
            // legend, the zoom control and the bottom-right recenter column with an 18px+
            // margin); confirmed 0 intersections at 1024x768 and 1440x900 via Playwright.
            isMobileMapOverlay
              ? 'absolute bottom-8 left-1/2 z-[1000] w-[calc(100%-6rem)] max-w-[220px] -translate-x-1/2'
              : 'absolute bottom-60 left-1/2 z-[1000] max-w-[220px] -translate-x-1/2'
          }
          data-testid="discover-badge"
        >
          <div
            className={
              isMobileMapOverlay
                ? 'flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground shadow-md'
                : 'flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground shadow-md'
            }
          >
            <MapPin className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
            <span className={isMobileMapOverlay ? 'text-center' : undefined}>
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
