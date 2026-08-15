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
  const showAnonZoomPrompt =
    isAuthenticated === false &&
    hasAreaSelected === false &&
    mapZoom != null &&
    areaLayerMaxZoom != null &&
    mapZoom > areaLayerMaxZoom &&
    cityTotal > 0;

  if (!message && !showAnonZoomPrompt) return null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] max-w-sm">
      <div className="bg-card/95 backdrop-blur rounded-lg border shadow-lg px-4 py-3 text-center">
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an area to see properties &mdash; or{' '}
            <Link to="/auth?returnTo=/discover" className="font-medium text-primary underline">
              sign in
            </Link>{' '}
            to explore the full map.
          </p>
        )}
      </div>
    </div>
  );
}
