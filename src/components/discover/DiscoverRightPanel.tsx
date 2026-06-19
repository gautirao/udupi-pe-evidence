import React from 'react';
import { useNavigate } from 'react-router-dom';
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
import { AreaSelectedPanel } from './panels/AreaSelectedPanel';
import { AgriGroupSelectedPanel } from './panels/AgriGroupSelectedPanel';
import { AgriGroupListingPeek } from './panels/AgriGroupListingPeek';
import { AgriGroupLocalityPanel } from './panels/AgriGroupLocalityPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { AgriFilterValues } from './panels/AgriFiltersPanel';

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

/** Compass-style badge: the corridor's cardinal letter, with a subtle edge arrow
 *  for the four primary directions. Decorative — labelled by the card's aria-label. */
function DirectionBadge({ code }: { code: string }) {
  const arrow = CARDINAL_ARROW[code];
  const Arrow = arrow?.Arrow;
  return (
    <div
      aria-hidden="true"
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-evergreen/20 bg-evergreen-tint transition-colors group-hover:border-evergreen/40"
    >
      {Arrow && arrow && (
        <Arrow className={cn('absolute h-3 w-3 text-evergreen/70', arrow.pos)} />
      )}
      <span className="font-mono text-lg font-bold tracking-tight text-evergreen">
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
}: CorridorLandingPanelProps) {
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
          Includes properties at closer distances too.
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
      {/* Guided step — promotes the next action from a faint line to a clear instruction. */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-evergreen text-[11px] font-bold text-evergreen-foreground">
            1
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-evergreen">
            Choose a direction
          </span>
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Select a corridor to explore
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Each corridor groups agricultural land in one direction. Pick the one
          you want to explore — you can switch corridors anytime.
        </p>
      </div>

      {/* Four directional corridor cards. */}
      <div className="flex flex-col gap-3">
        {corridorGroups.map((corridor) => {
          const maxKm = corridor.availableMaxDistances.reduce(
            (max, t) => Math.max(max, t.maxKm),
            0,
          );
          const bearing =
            BEARING_LABELS[corridor.directionCode] ?? corridor.directionCode;
          return (
            <button
              key={corridor.directionCode}
              type="button"
              data-testid="corridor-card"
              onClick={() => onSetRegionWithMaxKm(corridor.directionCode)}
              className="group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-evergreen/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Select corridor ${corridor.groupName}`}
            >
              {/* Selection-affordance accent rail (appears on hover/focus). */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1 bg-evergreen opacity-0 transition-opacity group-hover:opacity-100"
              />
              <div className="flex items-center gap-4 p-4">
                <DirectionBadge code={corridor.directionCode} />
                <div className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {bearing}
                  </span>
                  <span
                    data-testid="corridor-group-name"
                    className="mt-0.5 block truncate text-[15px] font-semibold text-foreground"
                  >
                    {corridor.groupName}
                  </span>
                  {maxKm > 0 && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                      <Route
                        className="h-3.5 w-3.5 text-evergreen"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-foreground">
                        Up to {maxKm} km
                      </span>
                    </span>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-evergreen group-hover:text-evergreen-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Calm guidance footer — orients the user without inventing data. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-3.5 py-3">
        <MapPin
          className="mt-0.5 h-4 w-4 shrink-0 text-evergreen"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Choosing a corridor groups agricultural land along that direction on
          the map. You can switch corridors anytime.
        </p>
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
  areas: AreaPoint[];
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onAreaSelect?: (area: AreaPoint) => void;
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
  /** Listings filtered by school proximity — rendered in SchoolSelectedPanel card list. */
  schoolListings?: DiscoverCityListingItem[];
  /** True while school proximity listings are loading. */
  schoolListingsLoading?: boolean;
  /** Active radius in km — drives the radius selector active state. */
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
}

export function DiscoverRightPanel({
  panelContent,
  city = '',
  areas: _areas,
  selectedArea,
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
}: DiscoverRightPanelProps) {
  const navigate = useNavigate();

  // Issue #1064 AC3 — explicit hydration/not-found UIs replace the silent
  // GuidedEntryPanel fall-back when the URL claims an areaKey but `selectedArea`
  // has not (yet) resolved. We render two small inline JSX blocks shared by the
  // area-selected and schools-in-area branches.
  const renderAreaHydrating = (): React.ReactNode => (
    <div
      data-testid="discover-area-hydrating"
      className="flex flex-1 items-center justify-center p-8"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading area details…</p>
      </div>
    </div>
  );
  const renderAreaNotFound = (areaKey: string): React.ReactNode => (
    <div
      data-testid="discover-area-not-found"
      className="flex flex-1 items-center justify-center p-8"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 className="text-base font-semibold">Area not found</h2>
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
        return <GuidedEntryPanel onSelectJourney={onSelectJourney} />;

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
            />
          </>
        );

      case 'area-groups-landing':
        // Satisfy the discriminated union without a conditional spread (which TypeScript
        // cannot narrow when combined with other fixed sibling props like onClearGroup).
        // Issue #1483: fallbackAreas/onSelectArea also power the Level-2 area list — same prop
        // threading, no additional wiring needed.
        if (onSelectAreaKey) {
          return (
            <AreaGroupsLandingPanel
              groups={areaGroups}
              isLoading={isLoadingAreaGroups}
              onSelectGroup={onSelectGroup ?? (() => undefined)}
              onStartOver={onStartOver}
              groupId={groupId}
              onClearGroup={onClearGroup}
              fallbackAreas={discoverAreas}
              onSelectArea={onSelectAreaKey}
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
          />
        );

      case 'area-selection':
        return <AreaSelectionPanel onStartOver={onStartOver} />;

      case 'area-selected':
        if (!selectedArea) {
          // Issue #1064 AC3/AC4 — explicit hydration vs not-found states.
          // (a) URL has areaKey, areas still loading → skeleton/spinner
          // (b) URL has areaKey, areas loaded → "Area not found" error
          // (c) URL has no areaKey → defensive fallback to guided entry
          if (urlAreaKey) {
            return isLoadingAreas ? renderAreaHydrating() : renderAreaNotFound(urlAreaKey);
          }
          return <GuidedEntryPanel onSelectJourney={onSelectJourney} />;
        }
        return (
          <AreaSelectedPanel
            selectedArea={selectedArea}
            areaListings={areaListings}
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
          />
        );

      case 'school-browse':
        return (
          <SchoolBrowsePanel
            onStartOver={onStartOver}
            journey={journey}
            city={city}
            onSelectSchool={onSelectSchool ?? (() => undefined)}
            onSelectAreaKey={onSelectAreaKey ?? (() => undefined)}
            // Issue #1485 — zone cards (Level 1 grouped hierarchy)
            areaGroups={areaGroups}
            isLoadingAreaGroups={isLoadingAreaGroupsForSchool}
            onSelectGroup={onSelectGroup}
            discoverAreas={discoverAreas}
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
              onSelectSchool={onSelectSchool ?? (() => undefined)}
              onSelectAreaKey={onSelectAreaKey ?? (() => undefined)}
              areaGroups={areaGroups}
              isLoadingAreaGroups={isLoadingAreaGroupsForSchool}
              onSelectGroup={onSelectGroup}
              discoverAreas={discoverAreas}
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
          />
        );
      }

      case 'schools-in-area':
        if (!selectedArea) {
          // Issue #1064 AC3 — same three-branch logic as area-selected.
          if (urlAreaKey) {
            return isLoadingAreas ? renderAreaHydrating() : renderAreaNotFound(urlAreaKey);
          }
          return <GuidedEntryPanel onSelectJourney={onSelectJourney} />;
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

  return (
    <div
      className="flex flex-col lg:w-1/2 border-l border-border bg-card overflow-hidden order-2 lg:order-2"
      data-testid="discover-right-panel"
    >
      {/* Issue #1494 — Buy/Rent intent selector, always visible at the top of the right
          panel. Left-aligned (Figma) so it sits on the content side, above the journey cards. */}
      {onIntentChange && (
        <div className="flex items-center justify-start gap-3 px-4 py-3 border-b border-border shrink-0 bg-card">
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
