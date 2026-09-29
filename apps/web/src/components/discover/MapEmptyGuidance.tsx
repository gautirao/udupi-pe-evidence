import { Link } from 'react-router-dom';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { CITY_CONFIG } from '@/lib/localityUtils';

interface MapEmptyGuidanceProps {
  cityTotal: number;
  filters: PropertyFilters;
  city: string;
  isLoading: boolean;
  /**
   * Anonymous-zoom-past-area guidance (#1156). All optional so legacy callers
   * that omit them leave the new branch dormant. The branch fires ONLY for
   * anonymous users who have zoomed past the area-overview band without an
   * area selected — the state where area rings hide and anon pins are gated,
   * leaving the map otherwise blank.
   */
  isAuthenticated?: boolean;
  mapZoom?: number;
  hasAreaSelected?: boolean;
  /** Area-layer zoom threshold; passed in to keep this component pure. */
  areaLayerMaxZoom?: number;
  /**
   * Issue #2169 Bug 2 — `cityTotal` here is the RESIDENTIAL city-wide sum
   * (same tainted value DiscoverMapCountBadge was fixed to stop showing in
   * the Agri journey, see #2169). The Agri journey's own empty/sparse state
   * is owned entirely by the right panel's corridor/parcel copy, so a
   * residential-count message here would contradict it. Optional so legacy
   * callers that omit it leave this guard dormant.
   */
  isAgriJourney?: boolean;
  /**
   * Issue #2724 — true only on the full-screen mobile Map (same discriminator
   * DiscoverMapCanvas/DiscoverMapStatusHints already use). There the right-hand
   * column holds "Recenter on <city>" (~100–130px) and "Recenter on <area>"
   * (~144–182px) from the bottom; this panel's default `bottom-20` centred
   * position sat in the same band and, on narrow viewports, its `max-w-sm`
   * width reached into that column too. Mobile lifts it above the whole
   * column, mirroring DiscoverMapStatusHints' `bottom-[192px]` school-radius
   * hint. Defaults to false, so any legacy caller is unaffected.
   */
  isMobileMapOverlay?: boolean;
  /**
   * Issue #2748 — the anonymous zoom-past-area prompt below is superseded, for the Areas
   * journey only, by the Map Info Dock's own guidance row (DiscoverMapSurface.tsx), which
   * uses a broader trigger (anon + not yet listing-capable, not just zoomed-past-threshold —
   * see mapInfoDockContent.ts). The `cityTotal === 0` messages above are a DIFFERENT concern
   * (not one of the dock's three messages) and are never suppressed by this flag. Defaults to
   * false so every other journey (and any legacy caller) is unaffected.
   */
  suppressAnonZoomPrompt?: boolean;
}

/**
 * Floating guidance message shown at the bottom-center of the map when
 * the visible listing count is zero or very sparse, for authenticated users
 * after the initial load has completed.
 */
export function MapEmptyGuidance({
  cityTotal,
  filters,
  city,
  isLoading,
  isAuthenticated,
  mapZoom,
  hasAreaSelected,
  areaLayerMaxZoom,
  isAgriJourney,
  isMobileMapOverlay = false,
  suppressAnonZoomPrompt = false,
}: MapEmptyGuidanceProps) {
  if (isLoading) return null;

  // When a school radius filter is active the right panel (SchoolSelectedPanel)
  // owns the empty state entirely. Suppress any map-level guidance to avoid
  // contradicting or duplicating the school-scoped message. AC1 + AC2.
  const hasSchoolContext =
    filters.schoolRadiusKm != null &&
    filters.schoolLat != null &&
    filters.schoolLon != null;
  if (hasSchoolContext) return null;

  const cityLabel = CITY_CONFIG[city]?.label ?? city;
  const hasLocalities = (filters.localities?.length ?? 0) > 0;

  let message: string | null = null;

  // Issue #2169 Bug 2 — same rationale as DiscoverMapCountBadge's guard in
  // this fix: cityTotal is the residential total and has no agri-first
  // branch, so the messages below would show a residential "no properties"
  // claim while the right panel displays real agri corridor/parcel stats.
  // Suppressed entirely rather than given an agri-specific message, since
  // the right panel already owns the Agri empty/sparse state prominently.
  if (!isAgriJourney && cityTotal === 0 && hasLocalities) {
    message =
      'No properties found in the selected areas. Try removing a filter or selecting different localities.';
  } else if (!isAgriJourney && cityTotal === 0) {
    message = `No properties listed in ${cityLabel} yet. Try switching to a different city.`;
  }

  // Anonymous zoom-past-area prompt (#1156). Mutually exclusive with the
  // cityTotal === 0 messages above (gated cityTotal > 0). Explicit `=== false`
  // comparisons keep this dormant when callers omit the props (undefined).
  // The null-guards on the zoom values prevent undefined ever tripping `>`.
  // Issue #2169 (reviewer follow-up) — this branch's trigger condition reads
  // the residential cityTotal (`cityTotal > 0`), so it must stay suppressed
  // during the Agri journey too, same as the two messages above, even though
  // its rendered copy carries no explicit count/claim.
  const showAnonZoomPrompt =
    !suppressAnonZoomPrompt &&
    !isAgriJourney &&
    isAuthenticated === false &&
    hasAreaSelected === false &&
    mapZoom != null &&
    areaLayerMaxZoom != null &&
    mapZoom > areaLayerMaxZoom &&
    cityTotal > 0;

  if (!message && !showAnonZoomPrompt) return null;

  // Issue #2724 (owner design change) — the anon sign-in prompt (no `message`, the
  // `showAnonZoomPrompt` branch) no longer sits in the bottom-chrome stack this whole issue is
  // about: it now renders CENTERED on the map instead, entirely out of the recenter-button
  // band. The two `cityTotal === 0` messages above keep their original bottom placement (still
  // collision-avoiding the recenter button(s), per this component's `isMobileMapOverlay` doc).
  //
  // Regression found by the pre-push e2e gate (issue-2139-style visual-cluster click test,
  // "area-first anon: click through to a real AREA marker") — dead center of the map is exactly
  // where a cluster/area marker is likely to sit after a fitBounds camera move, and this card
  // previously carried `pointer-events-auto` on its WHOLE surface (needed only so the "sign in"
  // link is clickable), so it silently absorbed the marker's click instead of letting it reach
  // the map underneath: a real, deterministic interaction regression, not flakiness (reproduced
  // twice against this branch, passed twice against the commit before this fix). Fixed by
  // dropping `pointer-events-auto` from the card/background entirely and scoping it to ONLY the
  // "sign in" `<Link>` — the card is purely informational otherwise, so every other pixel of it
  // (including its opaque background) now lets clicks pass through to the map beneath, while the
  // link itself stays precisely clickable.
  if (!message) {
    return (
      <div
        className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none"
        data-testid="map-anon-zoom-prompt"
      >
        <div
          className="bg-card/95 backdrop-blur rounded-lg border shadow-lg px-4 py-3 text-center max-w-sm"
          data-testid="map-anon-zoom-prompt-card"
        >
          <p className="text-sm text-muted-foreground">
            Select an area to see properties &mdash; or{' '}
            <Link
              to="/auth?returnTo=/discover"
              className="pointer-events-auto font-medium text-primary underline"
            >
              sign in
            </Link>{' '}
            to explore the full map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        // Issue #2724 — `bottom-20 left-1/2` was the EXACT same rectangle the
        // desktop "Recenter on <area>" button (DiscoverMapSurface.tsx) uses, so
        // the two collided outright whenever both were visible at once. Lifted
        // above that button on desktop, and above the mobile Map's whole
        // right-column recenter stack (see the prop doc above) on mobile.
        isMobileMapOverlay
          ? 'absolute bottom-[192px] left-1/2 -translate-x-1/2 z-[1000] max-w-sm'
          : 'absolute bottom-36 left-1/2 -translate-x-1/2 z-[1000] max-w-sm'
      }
    >
      <div className="bg-card/95 backdrop-blur rounded-lg border shadow-lg px-4 py-3 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
