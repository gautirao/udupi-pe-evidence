import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// Issue #1531 — additive PANEL_OPEN telemetry wiring (fire-and-forget; no existing behaviour changed).
import { useDiscoverTelemetry } from '@/hooks/useDiscoverTelemetry';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Route,
  Sprout,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { AgriListingPanel } from './panels/AgriListingPanel';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { IntentSelector } from './IntentSelector';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { CorridorGroupData, CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { PanelHeader } from './PanelHeader';
import { GuidedEntryPanel } from './panels/GuidedEntryPanel';
import { AreaSelectionPanel } from './panels/AreaSelectionPanel';
import { AreaGroupsLandingPanel } from './panels/AreaGroupsLandingPanel';
import { AreaGroupResultsPanel } from './panels/AreaGroupResultsPanel';
import { AreaSelectedPanel } from './panels/AreaSelectedPanel';
import { AgriGroupSelectedPanel } from './panels/AgriGroupSelectedPanel';
import { AgriGroupListingPeek } from './panels/AgriGroupListingPeek';
import { AgriGroupLocalityPanel } from './panels/AgriGroupLocalityPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { AgriFilterValues } from './panels/AgriFiltersPanel';
import { formatMemberAreaSummary, buildAreaNameIndex } from '@/utils/areaNameSummary';
import { prettifyZoneSlug } from '@/components/discover/SchoolRadiusMapOverlay';

// ─── CorridorLandingPanel — corridor-first two-level UX (Issue #1429) ─────────

// Directional cues are derived purely from the corridor's directionCode (already
// in the data) — no new fields are introduced. The cardinal letter is the cue;
// the four primary directions also get a subtle edge arrow on the compass badge.
const CARDINAL_ARROW: Record<
  string,
  { Arrow: typeof ArrowUp; pos: string }
> = {
  N: { Arrow: ArrowUp, pos: 'top-1 left-1/2 -translate-x-1/2' },
  E: { Arrow: ArrowRight, pos: 'right-1 top-1/2 -translate-y-1/2' },
  S: { Arrow: ArrowDown, pos: 'bottom-1 left-1/2 -translate-x-1/2' },
  W: { Arrow: ArrowLeft, pos: 'left-1 top-1/2 -translate-y-1/2' },
};

const BEARING_LABELS: Record<string, string> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
  NE: 'North-east',
  NW: 'North-west',
  SE: 'South-east',
  SW: 'South-west',
};

/** Compass-style badge: the corridor's cardinal letter on a solid evergreen disc
 *  (mock parity, Issue #1771), with a subtle edge arrow for the four primary
 *  directions. Decorative — labelled by the card's aria-label. */
function DirectionBadge({ code }: { code: string }) {
  const arrow = CARDINAL_ARROW[code];
  const Arrow = arrow?.Arrow;
  return (
    <div
      aria-hidden="true"
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-evergreen text-white shadow-sm transition-transform group-hover:scale-105"
    >
      {Arrow && arrow && (
        <Arrow className={cn('absolute h-3 w-3 text-white/60', arrow.pos)} />
      )}
      <span className="font-mono text-lg font-bold tracking-tight">
        {code}
      </span>
    </div>
  );
}

interface CorridorLandingPanelProps {
  corridorGroups: CorridorGroupData[];
  isLoading: boolean;
  /** True when the regional-area-groups fetch errored. Renders error+retry UI. */
  isError?: boolean;
  /** Called when the user clicks Retry in the error state. */
  onRetry?: () => void;
  selectedRegion: string | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  /** Called when a corridor card is clicked — sets both region and default maxKm in one PUSH. */
  onSetRegionWithMaxKm: (dir: string, km?: number) => void;
  onSetMaxKm: (km: 10 | 25 | 50 | 100) => void;
  onClearRegionAndMaxKm: () => void;
  discoverAreas?: DiscoverArea[];
  onSelectAreaKey?: (areaKey: string) => void;
  cityLabel?: string;
}

interface AgriLandingIntroProps {
  corridorCount: number;
  parcelCount: number;
  cityLabel?: string;
}

function AgriLandingIntro({
  corridorCount,
  parcelCount,
  cityLabel,
}: AgriLandingIntroProps) {
  const displayCity = cityLabel && cityLabel !== 'this city' ? cityLabel : 'Udupi';

  return (
    <div
      className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white"
      data-testid="agri-landing-intro"
    >
      {/* Breadcrumb / Eyebrow */}
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
        <span>Discover {displayCity}</span>
        <span className="text-slate-600">›</span>
        <span className="text-evergreen uppercase tracking-wider">Agricultural land</span>
      </div>

      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-evergreen-tint text-evergreen">
          <Sprout className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
            Agricultural land near {displayCity}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            Farmland is searched by corridor, direction and distance from town — not by residential neighbourhood.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 border-t border-slate-800 pt-4">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-white">
            {corridorCount}
          </span>
          <span className="mt-1.5 text-xs text-slate-400">{corridorCount === 1 ? 'corridor' : 'corridors'}</span>
        </div>
        <div className="flex min-w-0 flex-col border-l border-slate-800 pl-4">
          <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-evergreen">
            {parcelCount}
          </span>
          <span className="mt-1.5 text-xs text-slate-400">{parcelCount === 1 ? 'parcel' : 'parcels'}</span>
        </div>
      </div>
    </div>
  );
}

function CorridorLandingPanel({
  corridorGroups,
  isLoading,
  isError = false,
  onRetry = () => {},
  selectedRegion,
  selectedMaxKm,
  onSetRegionWithMaxKm,
  onSetMaxKm,
  onClearRegionAndMaxKm,
  discoverAreas = [],
  cityLabel,
}: CorridorLandingPanelProps) {
  // Issue #1659 — build area-name index once per discoverAreas change.
  const corridorAreaNameIndex = React.useMemo(
    () => buildAreaNameIndex(discoverAreas),
    [discoverAreas],
  );

  const totalParcels = React.useMemo(() => {
    return corridorGroups.reduce((sum, c) => {
      let maxCount = 0;
      for (const t of c.availableMaxDistances || []) {
        if (t.listingCount > maxCount) maxCount = t.listingCount;
      }
      return sum + maxCount;
    }, 0);
  }, [corridorGroups]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div
        data-testid="corridor-landing-loading"
        className="flex flex-col gap-3 p-4"
        aria-busy="true"
        aria-label="Loading corridor groups"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Loading corridors…</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border p-4"
          >
            <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error state (Issue #1453) ──
  // Must appear BEFORE selectedRegion and empty-state checks so a failed fetch
  // never silently falls through to "No corridors found".
  if (isError) {
    return (
      <div
        data-testid="corridor-landing-error"
        className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Could not load corridors. Check your connection and try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="corridor-landing-retry-btn"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  // ── Level 2: corridor selected — show distance chips ──
  if (selectedRegion !== null) {
    const corridor = corridorGroups.find((g) => g.directionCode === selectedRegion);
    const tiers: CumulativeDistanceTier[] = corridor?.availableMaxDistances ?? [];
    // Sort by maxKm ascending
    const sortedTiers = [...tiers].sort((a, b) => a.maxKm - b.maxKm);

    return (
      <div data-testid="corridor-distance-chips" className="flex flex-col gap-3 p-4">
        {/* Back / clear button */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-0 text-muted-foreground hover:text-foreground"
            onClick={onClearRegionAndMaxKm}
            aria-label="Back to corridor list"
            data-testid="corridor-back-btn"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">{corridor?.groupName ?? selectedRegion}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Select a distance range:</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Distance tiers">
          {sortedTiers.map((tier) => {
            const isSelected = selectedMaxKm === tier.maxKm;
            return (
              <button
                key={tier.maxKm}
                type="button"
                data-testid={`distance-chip-${tier.maxKm}`}
                onClick={() => onSetMaxKm(tier.maxKm)}
                aria-pressed={isSelected}
                className={[
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-evergreen bg-evergreen text-evergreen-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:border-evergreen/40 hover:bg-evergreen-tint/40',
                ].join(' ')}
              >
                {tier.distanceLabel}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Includes parcels at closer distances too.
        </p>
        {tiers.length === 0 && (
          <p className="text-sm text-muted-foreground">No distance tiers available for this corridor.</p>
        )}
      </div>
    );
  }

  // ── Level 1: no corridor selected — show corridor cards ──
  if (corridorGroups.length === 0) {
    return (
      <div
        data-testid="corridor-landing-empty"
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-evergreen/20 bg-evergreen-tint">
          <Sprout className="h-6 w-6 text-evergreen" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-foreground mb-1">No corridors found</p>
        <p className="text-xs text-muted-foreground">Try selecting a different city.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="corridor-landing-list"
      className="flex flex-col gap-4 p-4"
      aria-label="Agricultural corridors"
    >
      {/* ReTrends hero-card style: breadcrumb + stats row */}
      <AgriLandingIntro
        corridorCount={corridorGroups.length}
        parcelCount={totalParcels}
        cityLabel={cityLabel}
      />

      {/* Dedicated agricultural model informational banner */}
      <div
        role="note"
        className="rounded-xl border border-evergreen/30 bg-evergreen-tint/30 p-4 text-sm text-foreground shadow-sm flex items-start gap-3"
      >
        <Sprout className="h-5 w-5 text-evergreen shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Dedicated agricultural model</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Agricultural land is a separate model — parcels, corridors and distances, kept apart from residential counts and neighbourhoods.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Route className="h-3.5 w-3.5 text-evergreen" aria-hidden="true" />
          Direction / Corridor
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {corridorGroups.length} corridor{corridorGroups.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Four directional corridor cards (mock parity, Issue #1771). */}
      <div className="flex flex-col gap-4">
        {corridorGroups.map((corridor) => {
          const maxTier = corridor.availableMaxDistances.reduce(
            (max, t) => (t.maxKm > (max?.maxKm ?? 0) ? t : max),
            corridor.availableMaxDistances[0],
          );
          const maxKm = maxTier?.maxKm ?? 0;

          // Issue #1659 — union of area keys across all tiers for this corridor.
          // The largest tier (maxKm) includes all closer-tier areas cumulatively,
          // so we take the union (de-duplicated) to avoid overcounting.
          const corridorAreaKeys = Array.from(
            new Set(corridor.availableMaxDistances.flatMap((t) => t.areaKeys)),
          );
          // Resolve individual town names for the chips row (dedup by name).
          const townNames = Array.from(
            new Set(
              corridorAreaKeys
                .map((k) => corridorAreaNameIndex.get(k))
                .filter((n): n is string => !!n),
            ),
          );

          return (
            <button
              key={corridor.directionCode}
              type="button"
              data-testid="corridor-card"
              onClick={() => onSetRegionWithMaxKm(corridor.directionCode)}
              className="group relative w-full overflow-hidden rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-evergreen/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Select corridor ${corridor.groupName}`}
            >
              {/* Header row: direction disc + title/subtitle + parcel badge top-right */}
              <div className="flex items-start gap-3.5">
                <DirectionBadge code={corridor.directionCode} />
                <div className="min-w-0 flex-1">
                  <span
                    data-testid="corridor-group-name"
                    className="block truncate text-[16px] font-bold tracking-tight text-foreground"
                  >
                    {corridor.groupName}
                  </span>
                  {maxKm > 0 && (
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">
                      Up to {maxKm} km from the city
                    </span>
                  )}
                </div>
                {maxTier && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-evergreen-tint px-2.5 py-1 text-xs font-semibold text-evergreen">
                    {maxTier.listingCount} parcel{maxTier.listingCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {/* Pale green stat bands: town count + acreage (mock parity) */}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <span className="inline-flex items-center gap-2 rounded-lg bg-evergreen-tint/70 px-3 py-2.5">
                  <MapPin className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    <strong className="font-mono font-bold tabular-nums">{corridorAreaKeys.length}</strong>{' '}
                    town{corridorAreaKeys.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg bg-evergreen-tint/70 px-3 py-2.5">
                  <Sprout className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    {maxTier?.agriAcreage != null ? (
                      <>
                        <strong className="font-mono font-bold tabular-nums">{maxTier.agriAcreage}</strong> acres
                      </>
                    ) : (
                      <>
                        <strong className="font-mono font-bold tabular-nums">{maxTier?.listingCount ?? 0}</strong>{' '}
                        parcel{(maxTier?.listingCount ?? 0) === 1 ? '' : 's'}
                      </>
                    )}
                  </span>
                </span>
              </div>

              {/* Town chips row (Issue #1659 names, chip presentation per mock) */}
              {townNames.length > 0 && (
                <div
                  className="mt-3.5 flex flex-wrap items-center gap-1.5"
                  data-testid="corridor-card-area-names"
                >
                  <span className="mr-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Towns
                  </span>
                  {townNames.slice(0, 4).map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      {name}
                    </span>
                  ))}
                  {townNames.length > 4 && (
                    <span className="text-xs text-muted-foreground">
                      + {townNames.length - 4} more
                    </span>
                  )}
                </div>
              )}

              {/* Explore CTA — bottom-right (mock parity) */}
              <div className="mt-4 flex justify-end border-t border-border/60 pt-3">
                <span
                  aria-hidden="true"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-evergreen transition-transform group-hover:translate-x-0.5"
                >
                  Explore direction
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
import {
  SchoolBrowsePanel,
  SchoolsInAreaPanel,
  SchoolSelectedPanel,
  AreaSchoolCombinedPanel,
} from './panels/SchoolJourneyPanels';
import { SchoolGroupAreasPanel } from './panels/SchoolGroupAreasPanel';

export interface DiscoverRightPanelProps {
  panelContent: DiscoverPanelContent;
  /** City identifier — passed to SchoolBrowsePanel to avoid a redundant useDiscoverUrlState call inside the panel. */
  city?: string;
  /**
   * Issue #1595 — human-readable city label (e.g. "Udupi"). Forwarded to the area-first
   * selected-group drill-down for its breadcrumb + "Choose an area in {city}" heading.
   * Falls back to `city` when omitted.
   */
  cityLabel?: string;
  areas: AreaPoint[];
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onAreaSelect?: (area: AreaPoint) => void;
  /**
   * Issue #1817 (code-review follow-up) — the area-selected result-summary copy,
   * precomputed by MapDiscovery via the SAME formatDiscoverBadgeCopy(discoverBadge, ...)
   * call that drives the map badge pill, so AreaSelectedPanel's stat and the map badge
   * can never diverge (design §6 "Area selected + filters" → `M of N match in {scope}`).
   * Forwarded to AreaSelectedPanel; null/undefined falls back to that panel's own
   * lightweight default (used by callers/tests that don't wire the full selector).
   */
  areaResultSummaryText?: string | null;
  onBack?: () => void;
  onStartOver: () => void;
  onSelectJourney: (journey: DiscoverJourney) => void;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
  footerContent?: React.ReactNode;
  /** True while a filter-change refetch is in-flight (isFetching && !isLoading). */
  isFetching?: boolean;
  /** True during the initial full-screen load — disables the opacity overlay so the skeleton shows normally. */
  isInitialLoading?: boolean;
  /** Current free-text search query. Empty string when no search is active. */
  searchQuery?: string;
  /** Called when the user changes the search query. */
  onSearchChange?: (q: string) => void;
  /** Active journey (passed through from URL state for panel headers). */
  journey?: DiscoverJourney | null;
  /** Area groups for the area-groups-landing panel. */
  areaGroups?: AreaGroup[];
  /** True while area groups are loading. */
  isLoadingAreaGroups?: boolean;
  /** Called when the user selects a group from the landing panel. */
  onSelectGroup?: (groupId: string) => void;
  /**
   * Issue #1178 — the active groupId from the URL. Forwarded to
   * AreaGroupsLandingPanel so the matching group card is highlighted on deep-link,
   * and an unmatched groupId shows a non-alarming notice.
   */
  groupId?: string | null;
  /**
   * Issue #1483 — clears the active groupId, returning from Level-2 area list
   * back to the Level-1 group-card list. Threaded to AreaGroupsLandingPanel's
   * onClearGroup prop.
   * Issue #1485 — also used in school-first: clears groupId returning from
   * school-group-areas (Level 2) to school-browse (Level 1).
   */
  onClearGroup?: () => void;
  /** Issue #1745 — active residential macro region scope from URL. */
  scope?: string | null;
  /** Issue #1745 — callback to clear the active scope. */
  onClearScope?: () => void;
  /** Issue #1745 — callback when navigating back to a macro region from Level-2 or breadcrumb. */
  onBackToRegion?: (regionLabel: string) => void;
  /**
   * Issue #1808 — true only when the region-overview state is active (scope
   * set, journey/groupId/areaKey/schoolId all null), not dismissed, AND the
   * pick came from an actual map/panel click (never deep-link/refresh).
   * Forwarded to GuidedEntryPanel (the panel actually mounted at this state
   * — derivePanelContent does not read `scope`, so AreaGroupsLandingPanel is
   * not reachable here) to show the marker-accurate aria-live helper + the
   * one-shot ring around its existing JourneySwitcher ("choose how to
   * continue") section.
   */
  regionGuideRingActive?: boolean;
  /** Issue #1808 q1 — marker-accurate zones/areas variant for the helper copy. */
  regionGuideMarkerKind?: RegionOverviewMarkerKind;
  /** Issue #1808 — bumped per fresh region selection; keys the one-shot ring so it replays only on a new pick. */
  regionGuideNonce?: number;
  /** Issue #1808 §8 — suppresses the ring pulse/arrow nudge, replaced by a static ring. */
  prefersReducedMotion?: boolean;
  /** Issue #1808 — fired when a region card is selected (not deselected) in GuidedEntryPanel, arming the one-shot pulse with source='panel'. */
  onRegionSelectFromPanel?: () => void;
  /** Issue #1745 — summary regions from /api/discover/summary for safe matching. */
  summaryRegions?: import('@/utils/macroRegionResolver').SummaryRegionRef[];
  /**
   * Issue #1485 — true while areaGroups is loading. Forwarded to SchoolBrowsePanel
   * so zone cards show skeleton state on cold load.
   */
  isLoadingAreaGroupsForSchool?: boolean;
  /** All areas in the city — used as Browse-all fallback when groups is empty. */
  discoverAreas?: DiscoverArea[];
  /** Called when the user selects an area from Browse-all fallback. */
  onSelectAreaKey?: (areaKey: string) => void;
  /**
   * Issue #1429 — corridor groups for the agri-landing panel (cumulative model).
   * Replaces the old flat regionalGroups[] (discrete distanceBandKey model).
   */
  corridorGroups?: CorridorGroupData[];
  /** True while corridor groups are loading. */
  isLoadingRegionalGroups?: boolean;
  /** Issue #1453 — true when the corridor groups fetch errored. */
  isRegionalGroupsError?: boolean;
  /** Issue #1453 — retry callback (the regional-area-groups query's refetch). */
  onRetryRegionalGroups?: () => void;
  /** Selected corridor direction (from URL region= param). Null when none. */
  selectedRegion?: string | null;
  /** Selected cumulative distance tier (from URL maxKm= param). Null when none. */
  selectedMaxKm?: 10 | 25 | 50 | 100 | null;
  /** Called when the user selects a corridor direction. */
  onSetRegion?: (dir: string) => void;
  /**
   * Called when the user clicks a corridor card — sets both region and default maxKm atomically.
   * Replaces the two-step setRegion + pick-distance flow (Issue #1445).
   */
  onSetRegionWithMaxKm?: (dir: string, km?: number) => void;
  /** Called when the user selects a cumulative distance tier. */
  onSetMaxKm?: (km: 10 | 25 | 50 | 100) => void;
  /** Called when the user clears both corridor + distance selection. */
  onClearRegionAndMaxKm?: () => void;
  /** Called when the user selects a school from the school-browse panel. */
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Called when the user clicks "Add a school in this area" in the area-selected panel
   * (Issue #1157). Enters the area-first school-picking sub-step without flipping the journey.
   */
  onAddSchool?: () => void;
  /**
   * Active context chips (area, school, type, BHK, price) passed to PanelHeader
   * for the area-selected state. Omitted for read-only panels.
   */
  activeContextChips?: React.ReactNode;
  /** Current property filters for quick-filter chips. */
  filters?: PropertyFilters;
  /** Called when property filters change via quick chips or clear action. */
  onFiltersChange?: (filters: PropertyFilters) => void;
  // ── Schools-in-area panel ─────────────────────────────────────────────────
  /** Pre-fetched school list from MapDiscovery — forwarded to SchoolsInAreaPanel to avoid duplicate API calls. */
  schools?: SchoolResult[];
  /** Whether the parent-owned schools query is loading. */
  schoolsLoading?: boolean;
  /**
   * Issue #1198 — whether the parent-owned schools-in-area query errored.
   * Forwarded to SchoolsInAreaPanel so its #1144 error/retry state renders in prop-owned mode.
   */
  schoolsError?: boolean;
  /** Issue #1198 — retry callback (the schools query's refetch) for the schools-in-area error state. */
  onSchoolsRetry?: () => void;
  /**
   * Issue #1198 — whether the schools-in-area query is refetching. Drives the #1170 Retry
   * loading feedback (disabled + "Retrying…" + aria-busy) on the schools-in-area error state.
   * Distinct from `isFetching`, which is the area-listings refetch flag.
   */
  schoolsFetching?: boolean;
  // ── School-selected panel ────────────────────────────────────────────────
  /** The school currently selected — drives SchoolSelectedPanel header. */
  selectedSchool?: SchoolResult | null;
  /** Listings inside the selected school's commute polygon. */
  schoolListings?: DiscoverCityListingItem[];
  /** True while school polygon listings are loading. */
  schoolListingsLoading?: boolean;
  /** Selected commute distance tier in km (e.g. 5, 10, 15, 20). */
  radiusKm?: number | null;
  /** Called when the user picks a new radius in SchoolSelectedPanel. */
  onRadiusChange?: (radiusKm: number) => void;
  // ── Area-school-combined panel ───────────────────────────────────────────────────
  /**
   * Called when the user dismisses the school chip in AreaSchoolCombinedPanel.
   * Atomically removes schoolId + radiusKm; preserves areaKey + board/category filters.
   */
  onClearSchool?: () => void;
  /**
   * Called when the user dismisses the area chip in AreaSchoolCombinedPanel.
   * Atomically removes areaKey; preserves schoolId + radiusKm + board/category + property filters.
   */
  onClearArea?: () => void;
  /**
   * Issue #1115 — bounded-search CTA callback for SchoolSelectedPanel.
   * When provided, the panel renders an explicit CTA before the /api/discover/markers
   * fetch is allowed. Undefined for anon users (no-op CTA is confusing there).
   */
  onBoundedSearch?: () => void;
  /**
   * Issue #1115 — true once the user has clicked the bounded-search CTA.
   * Switches SchoolSelectedPanel from "Search" CTA to results-count helper copy.
   */
  boundedSearchTriggered?: boolean;
  /**
   * Issue #1064 AC3 — true while `useDiscoverAreas` is still hydrating.
   * When `urlAreaKey` is present but `selectedArea` is null we use this to
   * distinguish "still loading → show skeleton" from "loaded → areaKey not found".
   */
  isLoadingAreas?: boolean;
  /**
   * Issue #1064 AC3 — the raw areaKey from the URL. Needed so the panel can tell
   * "URL has an areaKey but selectedArea is null" apart from the no-selection state.
   */
  urlAreaKey?: string | null;
  /**
   * Issue #1371 — agri-scoped area summaries from the separate
   * ?propertyType=agricultural_land call. When present and journey='agri-first',
   * the agri-selected panel looks up the selected area's entry to show the
   * agri-only listingCount and optional agriAcreage.
   * Undefined for all non-agri journeys (query is idle — zero overhead).
   */
  agriAreasData?: DiscoverArea[];
  /** True while the agri-scoped areas query is loading. */
  isLoadingAgriAreas?: boolean;
  /**
   * Issue #1374 — the agri polygon listing currently selected on the map.
   * Carried from MapDiscovery.selectedMarkerListing. Only meaningful when
   * panelContent === 'agri-detail'; undefined/null otherwise.
   */
  selectedMarkerListing?: PropertyListingWithImages | null;
  /**
   * Issue #1374 — clears the selected agri polygon listing to return to the
   * agri-selected area panel. Must NOT mutate URL state (areaKey/journey intact).
   */
  onClearAgriSelection?: () => void;
  // ── Agri-group-selected panel (Issue #1425) ────────────────────────────────
  /** Listings fetched for the selected agri regional group's area keys. */
  agriGroupListings?: AgriMapListingItem[] | null;
  /** Issue #1460 — true when the agri map listings response was capped by the backend. */
  agriGroupTruncated?: boolean;
  /** Issue #1460 — the cap limit from the backend (e.g. 250). */
  agriGroupListingsLimit?: number;
  /** True while agri group listings are loading. */
  isLoadingAgriGroupListings?: boolean;
  /** True when the agri group listings fetch errored. */
  isAgriGroupListingsError?: boolean;
  /** Human-readable label for the selected regional group (e.g. "North · 10–25 km"). */
  agriGroupLabel?: string | null;
  /** Retry callback — calls the agri map listings query's refetch. */
  onRetryAgriGroupListings?: () => void;
  /** Clears the selected regional group (sets it to null in URL state). */
  onClearRegionalGroup?: () => void;
  // ── Agri-group-peek panel (Issue #1430) ──────────────────────────────────
  /**
   * The AgriMapListingItem for the currently selected listing in the agri-group context.
   * Provides synchronous first-paint data (locality, landArea, pricePaise) without
   * waiting for the detail fetch. Only meaningful when panelContent === 'agri-group-peek'.
   */
  selectedGroupListingItem?: AgriMapListingItem | null;
  /**
   * Called when the user closes the agri-group listing peek panel.
   * Should call urlActions.clearSelectedListing() (REPLACE semantics).
   */
  onCloseGroupPeek?: () => void;
  /**
   * Called when the user clicks "View full details" in the peek panel.
   * Should navigate to /listing/:id.
   */
  onViewGroupListingDetails?: (id: string) => void;
  /**
   * Called when the user selects a listing from AgriGroupSelectedPanel.
   * Issue #1430: replaces the previous navigate('/listing/:id') with setSelectedListing(id)
   * so a URL-driven peek opens instead of a full-page navigation.
   * Falls back to no-op when undefined (safe for tests / storybook usage).
   */
  onSelectAgriGroupListing?: (id: string) => void;
  // ── Agri-group-locality panel (Issue #1464) ────────────────────────────────
  /**
   * Currently selected locality name for the drill-down panel.
   * Null when no locality is active.
   */
  selectedLocality?: string | null;
  /**
   * Called when the user clicks a locality group row in AgriGroupSelectedPanel.
   * Should call urlActions.setLocality(locality) (PUSH semantics).
   */
  onSetLocality?: (locality: string) => void;
  /**
   * Called when the user closes the agri-group-locality panel.
   * Should call urlActions.clearLocality() (REPLACE semantics).
   */
  onClearLocality?: () => void;
  // ── Card↔marker shared selection (Issue #1547) ─────────────────────────────
  /**
   * Id of the currently selected listing (URL/parent-derived, from the `listing` URL
   * param). Drives the copper selected card frame + scroll-into-view in the
   * narrowed-results panels. Selection is never card-local state.
   */
  selectedListingId?: string | null;
  /**
   * Called when a residential result card is activated, so the parent can sync the
   * selected map marker. Optional — when absent the card simply navigates.
   */
  onSelectResultListing?: (id: string) => void;
  /**
   * Issue #1547 — ephemeral hover/focus signal from card → map marker.
   * Called with the listing id on card mouseenter/focus, null on mouseleave/blur.
   * NOT persisted to URL — lives in ephemeral useState in MapDiscovery.
   * Only wired for area-first residential; school-first stays unwired (RISK-3:
   * school markers come from 3 desynced tier sources, making id-to-marker mapping unsafe).
   */
  onHoverResultListing?: (id: string | null) => void;
  // ── Agri filters (Issue #1457) ─────────────────────────────────────────────
  /** Currently active acreage min filter (from URL). */
  agriAcresMin?: number;
  /** Currently active acreage max filter (from URL). */
  agriAcresMax?: number;
  /** Currently active price min filter in rupees (from URL). */
  agriPriceMin?: number;
  /** Currently active price max filter in rupees (from URL). */
  agriPriceMax?: number;
  /** Called when user clicks Apply Filters in AgriFiltersPanel. */
  onApplyAgriFilters?: (filters: AgriFilterValues) => void;
  /** Called when user clicks Clear Filters in AgriFiltersPanel. */
  onClearAgriFilters?: () => void;
  /** Issue #1458 — active land category filter from URL. */
  agriLandCategory?: string | null;
  /** Issue #1458 — active farmhouse available tri-state filter from URL. */
  agriFarmhouseAvailable?: boolean | null;
  /** Issue #1458 — active fencing done tri-state filter from URL. */
  agriFencingDone?: boolean | null;
  /** Issue #1458 — active water source filter from URL. */
  agriWaterSource?: string | null;
  /** Issue #1494 — current buy/rent intent for filtering. Default 'buy'. */
  intent?: DiscoverIntent;
  /** Issue #1494 — called when user changes buy/rent intent. */
  onIntentChange?: (intent: DiscoverIntent) => void;
  // ── Public landing controls (Issue #1588) ─────────────────────────────────
  /** Called when the user changes city from the landing controls card. */
  onCityChange?: (city: string) => void;
  /** City-wide live property total — drives the landing's area-card "properties" chip + hero context. */
  totalProperties?: number;
  /** Number of areas with at least one listing — drives the landing's area-card "areas" chip. */
  areasCount?: number;
  /**
   * Issue #1588 follow-up — true when the selected city has loaded with zero live
   * properties. Threaded to GuidedEntryPanel for the city-aware empty-state notice.
   */
  isCityEmpty?: boolean;
  // ── Area-group-results panel (Issue #1597) ────────────────────────────────
  /** Called when the user clicks "View all" in AreaGroupSelectedPanel — enters group-results state. */
  onEnterGroupResults?: () => void;
  /** Listings for the group-results panel (server-filtered by group's area_keys). */
  groupResultsListings?: import('@/hooks/useDiscoverListings').DiscoverListingItem[];
  /** True while the group-results listings fetch is in-flight. */
  isLoadingGroupResults?: boolean;
  /** True when the group-results listings fetch errored. */
  isGroupResultsError?: boolean;
  /** Total listing count from the paginated group-results response. */
  groupResultsTotalElements?: number;
  /** Retry callback for the group-results error state. */
  onRetryGroupResults?: () => void;
  /** Back from group-results → return to group drill-down (clears groupResults flag). */
  onClearGroupResults?: () => void;
  // ── Area-first selected-area results redesign (Issue #1606) ────────────────
  /**
   * Display name of the area-first selected group (e.g. "University Belt"), resolved
   * from areaGroups by the parent with a prettified-slug fallback. Null when the area
   * was reached without a group context — the breadcrumb omits the group crumb.
   */
  selectedGroupName?: string | null;
  /**
   * Navigate to the city's area-first landing (clears group + area, keeps journey).
   * Drives the area-first results breadcrumb's city crumb.
   */
  onNavigateAreaLanding?: () => void;
  // ── Issue #1798 PR-B — panel↔map area-marker plumbing (Units D/F) ───────────
  /**
   * Fired with the live search query as the user types in ScopedSearch (area mode
   * only). Pass-through to AreaGroupsLandingPanel → ScopedSearch (Level-1 and
   * Level-2). Lets MapDiscovery promote matching area markers on the map without
   * moving the camera.
   */
  onAreaSearchQueryChange?: (query: string) => void;
  /**
   * "Showing X of N areas on the map" counts from the map's area-marker bucketing
   * (AreaMarkerLayer.onMarkersComputed). Pass-through to the Level-2
   * AreaGroupSelectedPanel note only.
   */
  shownAreaCount?: number;
  totalAreaMarkerCount?: number;
  /**
   * Fired with the hovered/unhovered area's key from the Level-2 locality list, so
   * the map can emphasise the matching marker. Never triggers camera movement.
   */
  onAreaHover?: (areaKey: string | null) => void;
  /**
   * Issue #1806 (FIX-5e) — member-area keys to highlight in the Level-2
   * AreaGroupSelectedPanel (reached via the area-groups-landing case below),
   * fired by a non-splittable area-cluster chip click on the map.
   */
  highlightedAreaKeys?: string[];
}

export function DiscoverRightPanel({
  panelContent,
  city = '',
  cityLabel,
  areas: _areas,
  selectedArea,
  areaResultSummaryText,
  areaListings = [],
  isLoadingListings,
  isAuthenticated = false,
  onBack,
  onStartOver,
  onSelectJourney,
  filtersContent,
  trendsHref,
  footerContent,
  isFetching = false,
  isInitialLoading = false,
  searchQuery = '',
  onSearchChange,
  journey,
  areaGroups = [],
  isLoadingAreaGroups = false,
  onSelectGroup,
  groupId = null,
  onClearGroup,
  scope = null,
  onClearScope,
  onBackToRegion,
  regionGuideRingActive = false,
  regionGuideMarkerKind = null,
  regionGuideNonce = 0,
  prefersReducedMotion = false,
  onRegionSelectFromPanel,
  summaryRegions = [],
  discoverAreas = [],
  onSelectAreaKey,
  corridorGroups = [],
  isLoadingRegionalGroups = false,
  isRegionalGroupsError = false,
  onRetryRegionalGroups,
  selectedRegion = null,
  selectedMaxKm = null,
  onSetRegion,
  onSetRegionWithMaxKm,
  onSetMaxKm,
  onClearRegionAndMaxKm,
  onSelectSchool,
  onAddSchool,
  activeContextChips,
  filters = {},
  onFiltersChange,
  schools,
  schoolsLoading,
  schoolsError,
  onSchoolsRetry,
  schoolsFetching,
  selectedSchool,
  schoolListings,
  schoolListingsLoading,
  radiusKm,
  onRadiusChange,
  onClearSchool,
  onClearArea,
  onBoundedSearch,
  boundedSearchTriggered = false,
  isLoadingAreas = false,
  urlAreaKey = null,
  agriAreasData,
  isLoadingAgriAreas = false,
  selectedMarkerListing = null,
  onClearAgriSelection,
  agriGroupListings = null,
  agriGroupTruncated,
  agriGroupListingsLimit,
  isLoadingAgriGroupListings = false,
  isAgriGroupListingsError = false,
  agriGroupLabel = null,
  onRetryAgriGroupListings,
  onClearRegionalGroup,
  selectedGroupListingItem = null,
  onCloseGroupPeek,
  onViewGroupListingDetails,
  onSelectAgriGroupListing,
  selectedLocality = null,
  onSetLocality,
  onClearLocality,
  selectedListingId = null,
  onSelectResultListing,
  onHoverResultListing,
  isLoadingAreaGroupsForSchool = false,
  agriAcresMin,
  agriAcresMax,
  agriPriceMin,
  agriPriceMax,
  onApplyAgriFilters,
  onClearAgriFilters,
  agriLandCategory = null,
  agriFarmhouseAvailable = null,
  agriFencingDone = null,
  agriWaterSource = null,
  intent = 'buy',
  onIntentChange,
  onCityChange,
  totalProperties = 0,
  areasCount = 0,
  isCityEmpty = false,
  onEnterGroupResults,
  groupResultsListings = [],
  isLoadingGroupResults = false,
  isGroupResultsError = false,
  groupResultsTotalElements,
  onRetryGroupResults,
  onClearGroupResults,
  selectedGroupName = null,
  onNavigateAreaLanding,
  onAreaSearchQueryChange,
  shownAreaCount,
  totalAreaMarkerCount,
  onAreaHover,
  highlightedAreaKeys,
}: DiscoverRightPanelProps) {
  const navigate = useNavigate();

  // Issue #1588 — shared props for the public landing (guided-entry) panel + its
  // two no-areaKey fallbacks. City + intent are the existing URL-state controls.
  const guidedEntryProps = {
    onSelectJourney,
    city,
    onCityChange: onCityChange ?? (() => undefined),
    intent,
    onIntentChange: onIntentChange ?? (() => undefined),
    totalProperties,
    areasCount,
    isCityEmpty,
    // Issue #1808 — region-overview guidance signal (see prop docs above).
    regionGuideRingActive,
    regionGuideMarkerKind,
    regionGuideNonce,
    prefersReducedMotion,
    onRegionSelectFromPanel,
  };

  // Issue #1531 — PANEL_OPEN telemetry on mount (additive; fire-and-forget; never throws).
  // Only coarse, non-PII fields. Runs once when the panel first renders.
  const { emitPanelOpen } = useDiscoverTelemetry();
  useEffect(() => {
    emitPanelOpen();
    // Intentionally empty deps: emit only on initial mount, not on prop updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Issue #1064 AC3 — explicit hydration/not-found UIs replace the silent
  // GuidedEntryPanel fall-back when the URL claims an areaKey but `selectedArea`
  // has not (yet) resolved. We render two small inline JSX blocks shared by the
  // area-selected and schools-in-area branches.
  const renderAreaHydrating = (): React.ReactNode => (
    <div
      data-testid="discover-area-hydrating"
      className="m-5 flex flex-1 items-center justify-center rounded-xl border border-border bg-muted/20 p-8 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Loading area details…</p>
        <p className="text-xs text-muted-foreground">Fetching locality listings and boundaries.</p>
      </div>
    </div>
  );
  const renderAreaNotFound = (areaKey: string): React.ReactNode => (
    <div
      data-testid="discover-area-not-found"
      className="m-5 flex flex-1 items-center justify-center rounded-xl border border-border bg-muted/20 p-8 shadow-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">Area not found</h2>
        <p className="text-sm text-muted-foreground break-all">
          We could not find an area for <span className="font-mono">{areaKey}</span>.
        </p>
        <Button variant="outline" size="sm" onClick={onStartOver}>
          Back to Discover
        </Button>
      </div>
    </div>
  );
  function renderPanel(): React.ReactNode {
    switch (panelContent) {
      case 'guided-entry':
        return <GuidedEntryPanel {...guidedEntryProps} />;

      case 'agri-landing':
        // Issue #1429 — corridor-first two-level UX.
        // Level 1 (no region selected): show corridor cards (groupName as primary label).
        // Level 2 (region set, no maxKm): show cumulative distance chips for that corridor.
        // The panel never renders raw DIR:BAND codes as primary text.
        return (
          <>
            <PanelHeader
              title="Agricultural land"
              journey="agri-first"
              onStartOver={onStartOver}
            />
            <CorridorLandingPanel
              corridorGroups={corridorGroups}
              isLoading={isLoadingRegionalGroups}
              isError={isRegionalGroupsError}
              onRetry={onRetryRegionalGroups ?? (() => {})}
              selectedRegion={selectedRegion}
              selectedMaxKm={selectedMaxKm}
              onSetRegionWithMaxKm={onSetRegionWithMaxKm ?? (() => {})}
              onSetMaxKm={onSetMaxKm ?? (() => {})}
              onClearRegionAndMaxKm={onClearRegionAndMaxKm ?? (() => {})}
              discoverAreas={discoverAreas}
              onSelectAreaKey={onSelectAreaKey}
              cityLabel={cityLabel ?? city}
            />
          </>
        );

      case 'agri-selected': {
        // Issue #1371 — agri-first journey with an area selected.
        // agriAreaSummary is the authoritative backend row for this area from the
        // separate ?propertyType=agricultural_land call. Its listingCount is the real
        // agri total (not capped by limitPerArea). It is available once isLoadingAgriAreas
        // resolves; while loading we show a loading indicator rather than a stale count.
        // areaListings (the area-click fetch result) is agri-only (AC6) and drives the
        // card list, but its .length must NOT be used as the resolved count source —
        // it is capped at limitPerArea=50 and can differ from the backend total.
        const agriAreaSummary = agriAreasData?.find(
          (a) => a.areaKey === selectedArea?.areaKey,
        );
        // Authoritative post-resolve count: only read from agriAreaSummary.listingCount.
        // Falls back to 0 when the summary is absent (agriAreasData not yet loaded or
        // area not found) — the loading branch above hides the count element in that case.
        const agriCount = agriAreaSummary?.listingCount ?? 0;
        const agriAcreage = agriAreaSummary?.agriAcreage;

        return (
          <>
            <PanelHeader
              title={selectedArea?.areaLabel ?? 'Agricultural land'}
              journey="agri-first"
              onStartOver={onStartOver}
            />

            {/* Agri summary strip: count + optional acreage */}
            <div
              data-testid="agri-selected-summary"
              className="flex items-center gap-4 px-4 py-2 border-b border-border bg-green-500/5 shrink-0"
            >
              <div className="flex items-center gap-1.5">
                <Sprout
                  className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0"
                  aria-hidden="true"
                />
                {isLoadingListings || isLoadingAgriAreas ? (
                  <span
                    className="text-sm text-muted-foreground"
                    data-testid="agri-count-loading"
                  >
                    Loading…
                  </span>
                ) : (
                  <span
                    className="text-sm font-medium text-foreground"
                    data-testid="agri-count"
                  >
                    {agriCount} agricultural{' '}
                    {agriCount === 1 ? 'listing' : 'listings'}
                  </span>
                )}
              </div>
              {agriAcreage != null && (
                <span
                  className="text-sm text-muted-foreground"
                  data-testid="agri-acreage"
                >
                  ~{agriAcreage.toFixed(1)} acres available
                </span>
              )}
            </div>

            {/* Listings body */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingListings || isLoadingAgriAreas ? (
                // Show skeletons while either the listings or the authoritative
                // agri-count query is still in-flight.
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      data-testid="agri-listing-skeleton"
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="w-full h-40 rounded-lg mb-3 bg-muted animate-pulse" />
                      <div className="h-4 w-2/3 mb-2 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-1/3 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : agriCount === 0 ? (
                // AC8 — empty state keyed on the AUTHORITATIVE agriCount (from the
                // agri-scoped /areas summary), NOT on areaListings.length. This prevents
                // the count>0 + empty-state contradiction that occurred when
                // areaListings.length was used as the guard (Phase 7A browser bug).
                <div
                  data-testid="agri-empty-state"
                  className="flex flex-col items-center justify-center h-full p-4"
                >
                  <Sprout
                    className="h-8 w-8 text-muted-foreground/40 mb-2"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground text-center">
                    No agricultural listings in this area yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={onStartOver}
                    data-testid="agri-empty-start-over"
                  >
                    Choose a different area
                  </Button>
                </div>
              ) : (
                <div
                  data-testid="agri-listings-list"
                  className="divide-y divide-border"
                >
                  {areaListings.map((listing) => (
                    <div
                      key={listing.id}
                      data-testid="agri-listing-card"
                      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/listing/${listing.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/listing/${listing.id}`);
                        }
                      }}
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {listing.title ?? listing.locality ?? listing.id}
                      </p>
                      {listing.locality && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {listing.locality}
                        </p>
                      )}
                      {listing.landArea != null && listing.landAreaUnit && (
                        <p
                          className="text-xs text-green-700 dark:text-green-400 mt-0.5"
                          data-testid="agri-land-area"
                        >
                          {listing.landArea} {listing.landAreaUnit}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );
      }

      case 'agri-group-peek':
        // Issue #1430 — Level-2 listing peek within the agri-group context.
        // selectedGroupListingItem provides synchronous first-paint data (no spinner).
        // Full detail (images, description) is lazy-loaded inside AgriGroupListingPeek.
        if (!selectedGroupListingItem) return null;
        return (
          <AgriGroupListingPeek
            listingId={selectedGroupListingItem.id}
            firstPaintData={selectedGroupListingItem}
            onClose={onCloseGroupPeek ?? (() => {})}
            onViewDetails={onViewGroupListingDetails ?? (() => {})}
          />
        );

      case 'agri-group-locality': {
        // Issue #1464 — drill-down showing listings for a single locality within
        // the selected agri regional group. Activated when locality= is set in URL.
        const localityListings = (agriGroupListings ?? []).filter(
          (l) => (l.locality ?? l.areaKey) === selectedLocality,
        );
        return (
          <>
            <PanelHeader
              title="Agricultural land"
              journey="agri-first"
              onStartOver={onStartOver}
            />
            <AgriGroupLocalityPanel
              localityName={selectedLocality ?? ''}
              listings={localityListings}
              isLoading={isLoadingAgriGroupListings ?? false}
              isError={isAgriGroupListingsError ?? false}
              onRetry={onRetryAgriGroupListings ?? (() => {})}
              onSelectListing={onSelectAgriGroupListing ?? ((id) => navigate(`/listing/${id}`))}
              onClose={onClearLocality ?? (() => {})}
              intent={intent}
              isAuthenticated={isAuthenticated}
              selectedListingId={selectedListingId}
              // Issue #1771: navy hero breadcrumb + back-link context (mock parity)
              cityLabel={cityLabel ?? city}
              regionLabel={
                selectedRegion ? (BEARING_LABELS[selectedRegion] ?? selectedRegion) : null
              }
            />
          </>
        );
      }

      case 'agri-group-selected':
        // Issue #1425 — agri-first journey with a regional group selected but no
        // specific areaKey yet. Shows agri map listings for all areas in the group.
        return (
          <>
            <PanelHeader
              title="Agricultural land"
              journey="agri-first"
              onStartOver={onStartOver}
            />
            <AgriGroupSelectedPanel
              groupLabel={agriGroupLabel ?? 'Agricultural land'}
              listings={agriGroupListings}
              listingCount={agriGroupListings?.length ?? 0}
              isLoading={isLoadingAgriGroupListings}
              isError={isAgriGroupListingsError}
              onRetry={onRetryAgriGroupListings ?? (() => {})}
              onClear={onClearRegionalGroup ?? (() => {})}
              // Issue #1430: listing selection opens the URL-driven peek panel (not
              // a full-page navigation). onSelectAgriGroupListing falls back to navigate
              // for compatibility when the prop is not provided (e.g. older tests).
              onSelectListing={onSelectAgriGroupListing ?? ((id) => navigate(`/listing/${id}`))}
              // Issue #1445: thread distance chip props so the selected panel
              // renders the chip row with the correct selected tier visible.
              selectedMaxKm={selectedMaxKm ?? null}
              availableMaxDistances={corridorGroups?.find((c) => c.directionCode === selectedRegion)?.availableMaxDistances}
              onSetMaxKm={onSetMaxKm ?? (() => {})}
              // Issue #1464: locality drill-down
              onSelectLocality={onSetLocality}
              // Issue #1457: agri filter props
              isAuthenticated={isAuthenticated}
              agriAcresMin={agriAcresMin}
              agriAcresMax={agriAcresMax}
              agriPriceMin={agriPriceMin}
              agriPriceMax={agriPriceMax}
              onApplyFilters={onApplyAgriFilters ?? (() => {})}
              onClearFilters={onClearAgriFilters ?? (() => {})}
              // Issue #1458: categorical/boolean filter props
              agriLandCategory={agriLandCategory}
              agriFarmhouseAvailable={agriFarmhouseAvailable}
              agriFencingDone={agriFencingDone}
              agriWaterSource={agriWaterSource}
              intent={intent}
              // Issue #1460: truncation notice
              truncated={agriGroupTruncated}
              limit={agriGroupListingsLimit}
              // Issue #1771: navy hero breadcrumb + title (mock parity)
              cityLabel={cityLabel ?? city}
              corridorName={corridorGroups?.find((c) => c.directionCode === selectedRegion)?.groupName ?? null}
              directionCode={selectedRegion}
            />
          </>
        );

      case 'area-groups-landing':
        // Satisfy the discriminated union without a conditional spread (which TypeScript
        // cannot narrow when combined with other fixed sibling props like onClearGroup).
        // Issue #1483: fallbackAreas/onSelectArea also power the Level-2 area list — same prop
        // threading, no additional wiring needed.
        // Issue #1597: thread onEnterGroupResults → AreaGroupsLandingPanel → AreaGroupSelectedPanel.
        if (onSelectAreaKey) {
          return (
            <AreaGroupsLandingPanel
              groups={areaGroups}
              isLoading={isLoadingAreaGroups}
              onSelectGroup={onSelectGroup ?? (() => undefined)}
              onStartOver={onStartOver}
              groupId={groupId}
              onClearGroup={onClearGroup}
              scope={scope}
              onClearScope={onClearScope}
              summaryRegions={summaryRegions}
              onBackToRegion={onBackToRegion}
              cityLabel={cityLabel ?? city}
              city={city}
              onCityChange={onCityChange}
              intent={intent}
              onIntentChange={onIntentChange}
              fallbackAreas={discoverAreas}
              onSelectArea={onSelectAreaKey}
              onViewAllResults={onEnterGroupResults}
              onSelectJourney={onSelectJourney}
              onSelectSchool={onSelectSchool}
              onSearchQueryChange={onAreaSearchQueryChange}
              shownAreaCount={shownAreaCount}
              totalAreaMarkerCount={totalAreaMarkerCount}
              onAreaHover={onAreaHover}
              highlightedAreaKeys={highlightedAreaKeys}
            />
          );
        }
        return (
          <AreaGroupsLandingPanel
            groups={areaGroups}
            isLoading={isLoadingAreaGroups}
            onSelectGroup={onSelectGroup ?? (() => undefined)}
            onStartOver={onStartOver}
            groupId={groupId}
            onClearGroup={onClearGroup}
            scope={scope}
            onClearScope={onClearScope}
            summaryRegions={summaryRegions}
            onBackToRegion={onBackToRegion}
            cityLabel={cityLabel ?? city}
            city={city}
            onCityChange={onCityChange}
            intent={intent}
            onIntentChange={onIntentChange}
            onViewAllResults={onEnterGroupResults}
            onSelectJourney={onSelectJourney}
            onSelectSchool={onSelectSchool}
            onSearchQueryChange={onAreaSearchQueryChange}
            shownAreaCount={shownAreaCount}
            totalAreaMarkerCount={totalAreaMarkerCount}
            onAreaHover={onAreaHover}
            highlightedAreaKeys={highlightedAreaKeys}
          />
        );

      case 'area-group-results': {
        // Issue #1597 — group-results state: server-filtered listings across all child areas.
        // groupId is guaranteed non-blank by derivePanelContent. Resolve the group from the
        // loaded areaGroups list; fall back gracefully to the landing when not yet resolved.
        const resolvedGroupForResults = areaGroups.find((g) => g.id === groupId);
        if (!resolvedGroupForResults) {
          // Group not yet loaded or invalid — show the landing while loading.
          if (onSelectAreaKey) {
            return (
              <AreaGroupsLandingPanel
                groups={areaGroups}
                isLoading={isLoadingAreaGroups}
                onSelectGroup={onSelectGroup ?? (() => undefined)}
                onStartOver={onStartOver}
                groupId={groupId}
                onClearGroup={onClearGroup}
                scope={scope}
                onClearScope={onClearScope}
                summaryRegions={summaryRegions}
                onBackToRegion={onBackToRegion}
                cityLabel={cityLabel ?? city}
                intent={intent}
                onIntentChange={onIntentChange}
                fallbackAreas={discoverAreas}
                onSelectArea={onSelectAreaKey}
                onSelectJourney={onSelectJourney}
                onSelectSchool={onSelectSchool}
                onSearchQueryChange={onAreaSearchQueryChange}
                shownAreaCount={shownAreaCount}
                totalAreaMarkerCount={totalAreaMarkerCount}
                onAreaHover={onAreaHover}
              />
            );
          }
          return (
            <AreaGroupsLandingPanel
              groups={areaGroups}
              isLoading={isLoadingAreaGroups}
              onSelectGroup={onSelectGroup ?? (() => undefined)}
              onStartOver={onStartOver}
              groupId={groupId}
              onClearGroup={onClearGroup}
              scope={scope}
              onClearScope={onClearScope}
              summaryRegions={summaryRegions}
              onBackToRegion={onBackToRegion}
              cityLabel={cityLabel ?? city}
              intent={intent}
              onIntentChange={onIntentChange}
              onSelectJourney={onSelectJourney}
              onSelectSchool={onSelectSchool}
              onSearchQueryChange={onAreaSearchQueryChange}
              shownAreaCount={shownAreaCount}
              totalAreaMarkerCount={totalAreaMarkerCount}
              onAreaHover={onAreaHover}
            />
          );
        }
        // Issue #1597 — compute the full group listing count from the already-loaded
        // discoverAreas data. This is the same sum as the "View all {N}" CTA in
        // AreaGroupSelectedPanel (areas.reduce listingCount sum). Used for the anon
        // preview banner to show the real total vs the ≤20/area teaser.
        const totalGroupCount = resolvedGroupForResults.area_keys.reduce((sum, key) => {
          const area = discoverAreas.find((a) => a.areaKey === key);
          return sum + (area?.listingCount ?? 0);
        }, 0);
        return (
          <AreaGroupResultsPanel
            group={resolvedGroupForResults}
            cityLabel={cityLabel ?? city}
            listings={groupResultsListings}
            isLoading={isLoadingGroupResults}
            isError={isGroupResultsError}
            totalElements={groupResultsTotalElements}
            onRetry={onRetryGroupResults}
            onBack={onClearGroupResults}
            onStartOver={onStartOver}
            intent={intent}
            selectedListingId={selectedListingId}
            onSelectListing={onSelectResultListing}
            onHoverListing={onHoverResultListing}
            isAuthenticated={isAuthenticated}
            totalGroupCount={totalGroupCount}
          />
        );
      }

      case 'area-selection':
        return <AreaSelectionPanel onStartOver={onStartOver} />;

      case 'area-selected': {
        if (!selectedArea) {
          // Issue #1064 AC3/AC4 — explicit hydration vs not-found states.
          // (a) URL has areaKey, areas still loading → skeleton/spinner
          // (b) URL has areaKey, areas loaded → "Area not found" error
          // (c) URL has no areaKey → defensive fallback to guided entry
          if (urlAreaKey) {
            return isLoadingAreas ? renderAreaHydrating() : renderAreaNotFound(urlAreaKey);
          }
          return <GuidedEntryPanel {...guidedEntryProps} />;
        }
        const activeGroup = areaGroups.find((g) => g.id === groupId);
        const regionName =
          scope
            ? summaryRegions?.find((r) => r.regionKey.toLowerCase() === scope.toLowerCase())?.regionLabel ?? prettifyZoneSlug(scope)
            : activeGroup?.region_label ?? null;
        return (
          <AreaSelectedPanel
            selectedArea={selectedArea}
            areaListings={areaListings}
            areaResultSummaryText={areaResultSummaryText}
            isLoadingListings={isLoadingListings}
            isAuthenticated={isAuthenticated}
            onBack={onBack}
            onStartOver={onStartOver}
            journey={journey}
            filtersContent={filtersContent}
            trendsHref={trendsHref}
            isFetching={isFetching}
            isInitialLoading={isInitialLoading}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            activeContextChips={activeContextChips}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onSelectJourney={onSelectJourney}
            onAddSchool={onAddSchool}
            intent={intent}
            selectedListingId={selectedListingId}
            onSelectListing={onSelectResultListing}
            onHoverListing={onHoverResultListing}
            // Issue #1606 / Issue #1798 PR-B1 — area-first results redesign: breadcrumb + in-panel controls.
            cityLabel={cityLabel ?? city}
            regionName={regionName}
            groupName={selectedGroupName}
            city={city}
            onCityChange={onCityChange}
            onIntentChange={onIntentChange}
            onCrumbHome={onStartOver}
            onCrumbCity={onNavigateAreaLanding}
            onCrumbRegion={regionName && onBackToRegion ? () => onBackToRegion(regionName) : undefined}
            onCrumbGroup={onBack}
          />
        );
      }

      case 'school-browse':
        return (
          <SchoolBrowsePanel
            onStartOver={onStartOver}
            journey={journey}
            city={city}
            cityLabel={cityLabel}
            onSelectSchool={onSelectSchool ?? (() => undefined)}
            onSelectAreaKey={onSelectAreaKey ?? (() => undefined)}
            // Issue #1485 — zone cards (Level 1 grouped hierarchy)
            areaGroups={areaGroups}
            isLoadingAreaGroups={isLoadingAreaGroupsForSchool}
            onSelectGroup={onSelectGroup}
            discoverAreas={discoverAreas}
            scope={scope}
            onClearScope={onClearScope}
            summaryRegions={summaryRegions}
            // Visual-parity polish (cycle 2) — Area/School toggle reuses the same
            // journey-switch setter JourneySwitcher calls at guided-entry.
            onSelectJourney={onSelectJourney}
          />
        );

      case 'school-group-areas': {
        // Issue #1485 — Level 2: selected group's areas.
        // groupId is guaranteed non-blank by derivePanelContent (trim guard).
        // Resolve the group from the areaGroups list; fall back to school-browse
        // if the group is not yet loaded or the groupId is invalid (AC8).
        const resolvedGroup = areaGroups.find((g) => g.id === groupId);
        if (!resolvedGroup) {
          // Either still loading or invalid groupId — show loading skeletons when
          // isLoadingAreaGroups, otherwise gracefully degrade to school-browse.
          if (isLoadingAreaGroupsForSchool) {
            return (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="px-4 pt-4 pb-2 space-y-3" data-testid="school-group-areas-loading-fallback">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border border-border p-4">
                      <div className="h-4 w-2/3 bg-muted animate-pulse rounded mb-2" />
                      <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          // Invalid/stale groupId — AC8 safe fallback: render school-browse.
          return (
            <SchoolBrowsePanel
              onStartOver={onStartOver}
              journey={journey}
              city={city}
              cityLabel={cityLabel}
              onSelectSchool={onSelectSchool ?? (() => undefined)}
              onSelectAreaKey={onSelectAreaKey ?? (() => undefined)}
              areaGroups={areaGroups}
              isLoadingAreaGroups={isLoadingAreaGroupsForSchool}
              onSelectGroup={onSelectGroup}
              discoverAreas={discoverAreas}
              scope={scope}
              onClearScope={onClearScope}
              summaryRegions={summaryRegions}
            />
          );
        }
        return (
          <SchoolGroupAreasPanel
            group={resolvedGroup}
            discoverAreas={discoverAreas}
            isLoading={isLoadingAreaGroupsForSchool}
            onBack={onClearGroup ?? (() => undefined)}
            onSelectAreaKey={onSelectAreaKey ?? (() => undefined)}
            onStartOver={onStartOver}
            journey={journey}
            cityLabel={cityLabel ?? city}
          />
        );
      }

      case 'schools-in-area':
        if (!selectedArea) {
          // Issue #1064 AC3 — same three-branch logic as area-selected.
          if (urlAreaKey) {
            return isLoadingAreas ? renderAreaHydrating() : renderAreaNotFound(urlAreaKey);
          }
          return <GuidedEntryPanel {...guidedEntryProps} />;
        }
        return (
          <SchoolsInAreaPanel
            selectedArea={selectedArea}
            onStartOver={onStartOver}
            onBack={onBack}
            journey={journey}
            schools={schools}
            schoolsLoading={schoolsLoading}
            // Issue #1198 — thread the schools-in-area query's error/retry/fetching
            // signals so the (already-built) #1144 error state + #1170 retry feedback
            // are live in prop-owned mode, not only standalone.
            schoolsError={schoolsError}
            onSchoolsRetry={onSchoolsRetry}
            schoolsFetching={schoolsFetching}
            // Journey gate (Issue #1157): only the area-first journey delegates
            // school selection to the parent (handleSelectSchoolById → area-school-combined).
            // For school-first, `derivePanelContent` also yields 'schools-in-area', but the
            // panel MUST keep its internal setSchoolJourney path — so pass undefined there.
            onSelectSchool={journey === 'area-first' ? onSelectSchool : undefined}
            areaListings={areaListings}
            isLoadingAreaListings={isLoadingListings}
            isFetching={isFetching}
            isAuthenticated={isAuthenticated}
            activeContextChips={activeContextChips}
            intent={intent}
            // Card↔marker shared state for the school-first homes grid (parity with
            // AreaSelectedPanel). Hover highlights the matching home-marker; a home-marker
            // click drives selectedListingId → copper card frame + scroll-into-view.
            selectedListingId={selectedListingId}
            onSelectListing={onSelectResultListing}
            onHoverListing={onHoverResultListing}
          />
        );

      case 'school-selected':
        return (
          <SchoolSelectedPanel
            school={selectedSchool ?? null}
            listings={schoolListings ?? []}
            isLoadingListings={schoolListingsLoading ?? false}
            isFetching={isFetching}
            radiusKm={radiusKm ?? null}
            onRadiusChange={onRadiusChange ?? (() => undefined)}
            filters={filters}
            onFiltersChange={onFiltersChange}
            isAuthenticated={isAuthenticated}
            onStartOver={onStartOver}
            onBack={onBack}
            journey={journey}
            filtersContent={filtersContent}
            activeContextChips={activeContextChips}
            onBoundedSearch={onBoundedSearch}
            boundedSearchTriggered={boundedSearchTriggered}
            intent={intent}
            selectedListingId={selectedListingId}
            onHoverListing={onHoverResultListing}
          />
        );

      case 'area-school-combined':
        return (
          <AreaSchoolCombinedPanel
            selectedArea={selectedArea ?? null}
            selectedSchool={selectedSchool ?? null}
            listings={schoolListings ?? []}
            isLoadingListings={schoolListingsLoading ?? false}
            isFetching={isFetching}
            radiusKm={radiusKm ?? null}
            onRadiusChange={onRadiusChange ?? (() => undefined)}
            onClearSchool={onClearSchool ?? (() => undefined)}
            onClearArea={onClearArea ?? (() => undefined)}
            filters={filters}
            onFiltersChange={onFiltersChange}
            isAuthenticated={isAuthenticated}
            onStartOver={onStartOver}
            onBack={onBack}
            journey={journey}
            filtersContent={filtersContent}
            activeContextChips={activeContextChips}
            intent={intent}
            selectedListingId={selectedListingId}
            onSelectListing={onSelectResultListing}
            onHoverListing={onHoverResultListing}
          />
        );

      case 'agri-detail':
        // Issue #1374 (demoted to peek in #1405) — lightweight peek for a selected agri polygon.
        // selectedMarkerListing carries the marker (id, loc, boundary);
        // AgriListingPanel fetches compact DTO by id from the public endpoint.
        // onNavigate pushes to /listing/:id for full detail (AgriSpecRows + boundary map).
        // Back from /listing/:id restores /discover URL; transient polygon highlight
        // not restored (acceptable — React state not URL state).
        return selectedMarkerListing?.id ? (
          <AgriListingPanel
            listingId={selectedMarkerListing.id}
            onBack={onClearAgriSelection ?? (() => undefined)}
            onNavigate={() => navigate(`/listing/${selectedMarkerListing.id}`)}
            intent={intent}
          />
        ) : null;

      default: {
        // Exhaustiveness net (R6): the switch had no default, so a future
        // DiscoverPanelContent member with no case would silently render nothing
        // with NO tsc error. This compile-time guard forces every member to be
        // handled — if a new member is added without a case, `panelContent` is no
        // longer `never` here and tsc fails.
        const _exhaustive: never = panelContent;
        return _exhaustive;
      }
    }
  }

  // Panel states that already pass `activeContextChips` to their own PanelHeader.
  // For every OTHER state, we render a top chip strip so seller/date/boolean chips
  // are visible even when no area or school is selected (Issue #1151 AC5).
  const PANELS_WITH_INLINE_CHIPS = new Set<DiscoverPanelContent>([
    'area-selected',
    'agri-selected',
    'agri-group-selected',
    'agri-group-peek',
    'agri-group-locality',
    'agri-detail',
    'school-browse',
    'school-group-areas',
    'schools-in-area',
    'school-selected',
    'area-school-combined',
  ]);
  const showTopChipStrip =
    activeContextChips != null &&
    !PANELS_WITH_INLINE_CHIPS.has(panelContent);

  // Issue #1607 — the area-first CITY-LEVEL landing (group cards, no resolved group)
  // carries its own city + Buy/Rent controls card inside the panel (mock parity), so
  // the floating top-strip Buy/Rent is suppressed there to avoid a duplicate control.
  // The selected-group drill-down (Level 2) keeps the top-strip control unchanged.
  const isAreaFirstLandingControls =
    panelContent === 'area-groups-landing' &&
    !(groupId?.trim() && areaGroups.some((g) => g.id === groupId.trim()));

  return (
    <div
      className="flex flex-col lg:w-1/2 border-l border-border bg-background overflow-hidden order-2 lg:order-2"
      data-testid="discover-right-panel"
    >
      {/* Issue #1494 — Buy/Rent intent selector, visible at the top of the right panel.
          Left-aligned (Figma) so it sits on the content side, above the journey cards.
          Issue #1588 — suppressed on the public landing (guided-entry), where Buy/Rent
          lives inside the hero controls card instead (avoids a duplicate control).
          Issue #1607 — also suppressed on the area-first CITY-LEVEL landing, where the
          Buy/Rent control lives inside the in-panel controls card (no duplicate).
          Issue #1606 — also suppressed on area-selected, where Buy/Rent moves into the
          in-panel City + Looking-to controls card (mock parity, no duplicate control). */}
      {onIntentChange && panelContent !== 'guided-entry' && panelContent !== 'area-selected' && !isAreaFirstLandingControls && (
        <div className="flex items-center justify-start gap-3 px-4 py-3 border-b border-border/50 shrink-0 bg-background">
          <IntentSelector intent={intent} onIntentChange={onIntentChange} />
        </div>
      )}
      {showTopChipStrip && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border shrink-0">
          {activeContextChips}
        </div>
      )}
      {renderPanel()}
      {footerContent}
    </div>
  );
}
