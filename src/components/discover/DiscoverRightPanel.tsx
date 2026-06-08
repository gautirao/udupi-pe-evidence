import React from 'react';
import { AlertCircle, Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import { AgriListingPanel } from './panels/AgriListingPanel';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { PanelHeader } from './PanelHeader';
import { GuidedEntryPanel } from './panels/GuidedEntryPanel';
import { AreaSelectionPanel } from './panels/AreaSelectionPanel';
import { AreaGroupsLandingPanel } from './panels/AreaGroupsLandingPanel';
import { AreaSelectedPanel } from './panels/AreaSelectedPanel';
import {
  SchoolBrowsePanel,
  SchoolsInAreaPanel,
  SchoolSelectedPanel,
  AreaSchoolCombinedPanel,
} from './panels/SchoolJourneyPanels';

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
  /** All areas in the city — used as Browse-all fallback when groups is empty. */
  discoverAreas?: DiscoverArea[];
  /** Called when the user selects an area from Browse-all fallback. */
  onSelectAreaKey?: (areaKey: string) => void;
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
  discoverAreas = [],
  onSelectAreaKey,
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
}: DiscoverRightPanelProps) {
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
        // MVP2 — static no-area landing for the agricultural-land journey. Renders a
        // placeholder prompting the user to pick an area. Intentionally has NO data props
        // and triggers NO listings/markers/counts fetch (those arrive in #1371–#1374).
        return (
          <>
            <PanelHeader
              title="Agricultural land"
              journey="agri-first"
              onStartOver={onStartOver}
            />
            <div
              data-testid="agri-landing-panel"
              className="flex flex-1 items-center justify-center p-8"
            >
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-green-500/10 dark:bg-green-400/10 p-3">
                  <Sprout
                    className="h-8 w-8 text-green-600 dark:text-green-400"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="text-base font-semibold">Search agricultural land</h2>
                <p className="text-sm text-muted-foreground">
                  Select an area on the map to explore farmland and agricultural plots.
                </p>
              </div>
            </div>
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
                      className="p-4"
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

      case 'area-groups-landing':
        return (
          <AreaGroupsLandingPanel
            groups={areaGroups}
            isLoading={isLoadingAreaGroups}
            onSelectGroup={onSelectGroup ?? (() => undefined)}
            onStartOver={onStartOver}
            groupId={groupId}
            // Satisfy the discriminated union: only spread fallbackAreas + onSelectArea
            // when onSelectAreaKey is defined, so Browse-all buttons are never silent no-ops.
            {...(onSelectAreaKey
              ? { fallbackAreas: discoverAreas, onSelectArea: onSelectAreaKey }
              : {})}
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
          />
        );

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
          />
        );

      case 'agri-detail':
        // Issue #1374 — full detail panel for a selected agri polygon listing.
        // selectedMarkerListing carries the lightweight marker (id, loc, boundary);
        // AgriListingPanel fetches the full DTO by id from the public endpoint.
        return selectedMarkerListing?.id ? (
          <AgriListingPanel
            listingId={selectedMarkerListing.id}
            onBack={onClearAgriSelection ?? (() => undefined)}
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
    'agri-detail',
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
