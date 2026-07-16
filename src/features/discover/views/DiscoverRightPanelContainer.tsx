import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { AgriMapListingItem, AgriMapListingsResponse } from '@/hooks/useAgriMapListings';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { DiscoverListingItem } from '@/hooks/useDiscoverListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { DiscoverInteractionCommands } from '@/features/discover/state/useDiscoverInteractionState';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { ScopeNamespaces } from '@/features/discover/presentation/resolveScope';

/**
 * Issue #1824 Slice S11c — the DiscoverRightPanel call-site region, lifted
 * VERBATIM out of MapDiscovery.tsx (@ 7e598574 L1684-1908), incl. every
 * DiscoverRightPanel prop + the ~25 inline closures (onSelectAreaKey,
 * onApplyAgriFilters, onBackToRegion, etc.) + the inline footer pager JSX
 * (footerContent) + the cityLabel/onBack expressions. Every value the moved
 * JSX/closures/footer read is received as a PROP — no derived-const/handler/
 * hook/badge-helper moves (see
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11c-implementation.md).
 *
 * S8 BADGE-FORK GUARD (preserved) — this component receives the precomputed
 * copy (areaResultSummaryText, etc.) as PROPS ONLY. It never imports
 * formatDiscoverBadgeCopy / deriveSchoolRadiusPillNoun / hasActiveAnonPropertyFilter.
 *
 * The inline-computed prop expressions below (cityLabel, onBack, the ~25
 * closures, footerContent) recompute from the raw props on every render —
 * IDENTICAL to their pre-extraction behaviour inline in MapDiscovery — this
 * component is NOT React.memo'd (render-neutral, mirrors the S11a
 * DiscoverMapCanvas pattern).
 */
export interface DiscoverRightPanelContainerProps {
  resolvedPanelContent: DiscoverPanelContent;
  selectedMarkerListing: PropertyListingWithImages | null;
  clearSelectedMarkerListing: () => void;
  city: string;
  urlState: DiscoverUrlState;
  urlActions: DiscoverUrlActions;
  activeContextChips: ReactNode;
  discoverAreas: AreaPoint[];
  selectedArea: AreaPoint | null;
  areaListings: DiscoverCityListingItem[];
  isLoadingAreaListings: boolean;
  isAuthenticated: boolean;
  handleAreaSelect: (area: AreaPoint) => void;
  areaResultSummaryText: string | null;
  journeyView: DiscoverJourneyTransitionsView;
  handleAreaFirstBack: () => void;
  journeyCommands: DiscoverJourneyTransitionsCommands;
  areasLoading: boolean;
  agriAreasData: DiscoverArea[] | undefined;
  isLoadingAgriAreas: boolean;
  /** AreaGroupsResponse's shape ({ groups: AreaGroup[] }) — that response type itself is not exported by useAreaGroups.ts. */
  areaGroupsData: { groups: AreaGroup[] } | undefined;
  isLoadingAreaGroups: boolean;
  /** Issue #1910 (PR2) — region-scoped area-group projection for the currently active region scope. */
  regionScopedGroups: RegionScopedAreaGroup[] | undefined;
  isLoadingRegionScopedGroups: boolean;
  /**
   * Issue #1910 (PR2 review fix, Finding 3) — true when the region-scoped
   * projection fetch failed. Forwarded to AreaGroupsLandingPanel so a real
   * backend failure renders an honest error+retry state instead of being
   * indistinguishable from "this region legitimately has zero groups".
   */
  isRegionScopedGroupsError: boolean;
  refetchRegionScopedGroups: () => void;
  /**
   * Issue #1910 (PR2 review fix, Finding 2) — the single source-of-truth,
   * alias-aware scope namespaces built once in MapDiscovery (includes
   * groupNameSlugs), forwarded so AreaGroupsLandingPanel's own resolveScope
   * call classifies the active scope identically to every other call site
   * instead of rebuilding a reduced local namespace.
   */
  scopeNamespaces: ScopeNamespaces;
  armRegionSelect: (source: 'map' | 'panel') => void;
  regionGuideRingActive: boolean;
  regionOverviewMarkerKind: RegionOverviewMarkerKind;
  regionSelectNonce: number;
  prefersReducedMotion: boolean;
  summaryRegions: SummaryRegionRef[];
  selectedGroupName: string | null;
  corridorGroups: CorridorGroupData[];
  isLoadingRegionalAreaGroups: boolean;
  isRegionalAreaGroupsError: boolean;
  refetchRegionalAreaGroups: () => void;
  selectedRegion: string | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  filteredAgriListings: AgriMapListingItem[] | null;
  agriMapListingsData: AgriMapListingsResponse | undefined;
  isLoadingAgriGroupListings: boolean;
  isAgriGroupListingsError: boolean;
  agriGroupLabel: string | null;
  refetchAgriGroupListings: () => void;
  discoverAreasForPanel: DiscoverArea[];
  filtersContent: ReactNode;
  trendsHref: string;
  isFetching: boolean;
  isLoading: boolean;
  searchQuery: string;
  handleSearchChange: (q: string) => void;
  filters: PropertyFilters;
  handleFiltersChange: (next: PropertyFilters) => void;
  selectedSchool: SchoolResult | null;
  schools: SchoolResult[];
  schoolsQuery: UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>;
  schoolListings: DiscoverCityListingItem[];
  listingDataLoading: boolean;
  handleBoundedSearch: () => void;
  interactionCommands: DiscoverInteractionCommands;
  setAreaSearchQuery: Dispatch<SetStateAction<string>>;
  areaMarkerCounts: { shown: number; total: number };
  highlightedAreaKeys: string[];
  selectedGroupListingItem: AgriMapListingItem | null;
  navigate: (path: string) => void;
  cityTotal: number;
  cityHasNoListings: boolean;
  handleCityChange: (newCity: string) => void;
  groupResultsListings: DiscoverListingItem[];
  isLoadingGroupResults: boolean;
  isGroupResultsError: boolean;
  groupResultsTotalElements: number | undefined;
  refetchGroupResults: () => void;
  page: number;
  totalPages: number;
  totalElements: number;
  setPage: Dispatch<SetStateAction<number>>;
}

export function DiscoverRightPanelContainer({
  resolvedPanelContent,
  selectedMarkerListing,
  clearSelectedMarkerListing,
  city,
  urlState,
  urlActions,
  activeContextChips,
  discoverAreas,
  selectedArea,
  areaListings,
  isLoadingAreaListings,
  isAuthenticated,
  handleAreaSelect,
  areaResultSummaryText,
  journeyView,
  handleAreaFirstBack,
  journeyCommands,
  areasLoading,
  agriAreasData,
  isLoadingAgriAreas,
  areaGroupsData,
  isLoadingAreaGroups,
  regionScopedGroups,
  isLoadingRegionScopedGroups,
  isRegionScopedGroupsError,
  refetchRegionScopedGroups,
  scopeNamespaces,
  armRegionSelect,
  regionGuideRingActive,
  regionOverviewMarkerKind,
  regionSelectNonce,
  prefersReducedMotion,
  summaryRegions,
  selectedGroupName,
  corridorGroups,
  isLoadingRegionalAreaGroups,
  isRegionalAreaGroupsError,
  refetchRegionalAreaGroups,
  selectedRegion,
  selectedMaxKm,
  filteredAgriListings,
  agriMapListingsData,
  isLoadingAgriGroupListings,
  isAgriGroupListingsError,
  agriGroupLabel,
  refetchAgriGroupListings,
  discoverAreasForPanel,
  filtersContent,
  trendsHref,
  isFetching,
  isLoading,
  searchQuery,
  handleSearchChange,
  filters,
  handleFiltersChange,
  selectedSchool,
  schools,
  schoolsQuery,
  schoolListings,
  listingDataLoading,
  handleBoundedSearch,
  interactionCommands,
  setAreaSearchQuery,
  areaMarkerCounts,
  highlightedAreaKeys,
  selectedGroupListingItem,
  navigate,
  cityTotal,
  cityHasNoListings,
  handleCityChange,
  groupResultsListings,
  isLoadingGroupResults,
  isGroupResultsError,
  groupResultsTotalElements,
  refetchGroupResults,
  page,
  totalPages,
  totalElements,
  setPage,
}: DiscoverRightPanelContainerProps) {
  return (
    <DiscoverRightPanel
      panelContent={resolvedPanelContent}
      selectedMarkerListing={selectedMarkerListing}
      onClearAgriSelection={clearSelectedMarkerListing}
      city={city}
      cityLabel={CITY_CONFIG[city]?.label ?? city}
      journey={urlState.journey}
      activeContextChips={activeContextChips}
      areas={discoverAreas}
      selectedArea={selectedArea}
      areaListings={areaListings}
      isLoadingListings={isLoadingAreaListings}
      isAuthenticated={isAuthenticated}
      onAreaSelect={handleAreaSelect}
      // Issue #1817 (code-review follow-up) — precomputed via the shared
      // formatDiscoverBadgeCopy(discoverBadge, ...) call above (areaResultSummaryText),
      // so AreaSelectedPanel's result-summary stat can never diverge from the map badge.
      areaResultSummaryText={areaResultSummaryText}
      // schoolFirstOnBack is undefined when panelContent is not 'school-browse' or
      // 'school-selected' (i.e. Level 0), so Back correctly hides at Level 0.
      // 'school-selected' panelContent is only reachable in the school-first journey.
      onBack={urlState.journey === 'school-first' ? journeyView.schoolFirstOnBack : handleAreaFirstBack}
      onStartOver={journeyCommands.startOver}
      isLoadingAreas={areasLoading}
      agriAreasData={agriAreasData}
      isLoadingAgriAreas={isLoadingAgriAreas}
      urlAreaKey={urlState.areaKey}
      onSelectJourney={(j) => urlActions.setJourney(j)}
      areaGroups={areaGroupsData?.groups ?? []}
      isLoadingAreaGroups={isLoadingAreaGroups}
      // Issue #1910 (PR2) — region-scoped area-group projection, forwarded to
      // every AreaGroupsLandingPanel render site in DiscoverRightPanel.
      regionScopedGroups={regionScopedGroups}
      isLoadingRegionScopedGroups={isLoadingRegionScopedGroups}
      // Issue #1910 (PR2 review fix, Findings 2 & 3) — real error state +
      // retry for the projection, plus the alias-aware scope namespaces.
      isRegionScopedGroupsError={isRegionScopedGroupsError}
      onRetryRegionScopedGroups={refetchRegionScopedGroups}
      scopeNamespaces={scopeNamespaces}
      // Issue #1178 — forward the active groupId so AreaGroupsLandingPanel can
      // highlight the deep-linked group card / show a non-alarming notice when
      // the groupId matches no loaded group. Prop wiring only — no routing change.
      groupId={urlState.groupId ?? null}
      onSelectGroup={(groupId) => urlActions.selectGroup(groupId)}
      // Issue #1483 — clear groupId to return from Level-2 area list to Level-1 group cards.
      // Issue #1485 — same callback also used by school-first: school-group-areas → school-browse.
      onClearGroup={() => urlActions.selectGroup(null)}
      // Issue #1745 — 4-level residential Discover hierarchy
      scope={urlState.scope ?? null}
      onClearScope={() => urlActions.setScope(null)}
      // Issue #1808 — region-overview guidance signal, threaded to
      // GuidedEntryPanel (case 'guided-entry') for the panel attention
      // ring + aria-live helper on the existing JourneySwitcher section.
      regionGuideRingActive={regionGuideRingActive}
      regionGuideMarkerKind={regionOverviewMarkerKind}
      regionGuideNonce={regionSelectNonce}
      prefersReducedMotion={prefersReducedMotion}
      onRegionSelectFromPanel={() => armRegionSelect('panel')}
      summaryRegions={summaryRegions}
      onBackToRegion={(regionLabel) => {
        // Issue #1882 (Track A PR2 Slice S2c) — resolve the target scope key
        // via an exact label lookup against the backend region-summary list
        // (REPLACES resolveScopeKeyFromLabel's slug/direction-prefix
        // heuristics). Only a label is available at this call site; when no
        // region matches, no scope change is made.
        const targetScope = summaryRegions.find((r) => r.regionLabel === regionLabel)?.regionKey ?? null;
        if (targetScope) {
          urlActions.setScope(targetScope);
        }
      }}
      // Issue #1606 — area-first results breadcrumb: resolved group name + city-crumb nav.
      // selectGroup(null) clears both groupId and areaKey in a single PUSH, returning to
      // the area-first landing (Level 1 group cards) while preserving journey=area-first.
      selectedGroupName={selectedGroupName}
      onNavigateAreaLanding={() => urlActions.selectGroup(null)}
      // Issue #1485 — forward area-groups loading state separately for school-first zone cards
      // so school-browse can show skeletons without coupling to the area-first isLoadingAreaGroups.
      isLoadingAreaGroupsForSchool={isLoadingAreaGroups}
      // Issue #1429 — agri-first corridor groups (cumulative corridor model)
      corridorGroups={corridorGroups}
      isLoadingRegionalGroups={isLoadingRegionalAreaGroups}
      // Issue #1453 — surface fetch error so CorridorLandingPanel can show error+retry UI.
      isRegionalGroupsError={isRegionalAreaGroupsError}
      onRetryRegionalGroups={refetchRegionalAreaGroups}
      selectedRegion={selectedRegion}
      selectedMaxKm={selectedMaxKm}
      onSetRegion={(dir) => urlActions.setRegion(dir)}
      onSetRegionWithMaxKm={(dir, km) => urlActions.setRegionWithMaxKm(dir, km)}
      onSetMaxKm={(km) => urlActions.setMaxKm(km)}
      onClearRegionAndMaxKm={() => urlActions.clearRegionAndMaxKm()}
      // Issue #1425 — agri-group-selected panel data
      // Issue #1457 — pass filteredAgriListings (client-side filtered) instead of raw
      agriGroupListings={filteredAgriListings}
      // Issue #1460 — thread truncated/limit from useAgriMapListings to surface the cap notice.
      agriGroupTruncated={agriMapListingsData?.truncated ?? false}
      agriGroupListingsLimit={agriMapListingsData?.limit}
      isLoadingAgriGroupListings={isLoadingAgriGroupListings}
      isAgriGroupListingsError={isAgriGroupListingsError}
      agriGroupLabel={agriGroupLabel}
      onRetryAgriGroupListings={refetchAgriGroupListings}
      onClearRegionalGroup={() => urlActions.clearRegionAndMaxKm()}
      discoverAreas={discoverAreasForPanel}
      onSelectAreaKey={(areaKey) => {
        // Issue #1067 R2 — right-panel area-card click must trigger map flyTo
        // in addition to updating the URL. The deferred-hydration effect at
        // lines 312-329 only fires on cold-load (initialViewportRef gate), so
        // in-session selections never panned without this branch. Routing
        // through handleAreaSelect reuses the canonical AreaPoint handler
        // (URL update + setPanToArea + filter reset) — single source of truth.
        // Issue #1489 — discoverAreas (AreaPoint[]) from useDiscoverMapData is
        // intentionally kept here (not discoverAreasForPanel) because
        // handleAreaSelect needs AreaPoint for setSelectedArea / setPanToArea
        // (geo fit-bounds). discoverAreasForPanel passes to the panel for display.
        const match = discoverAreas.find((a) => a.areaKey === areaKey);
        if (match) {
          handleAreaSelect(match);
        } else {
          urlActions.selectArea(areaKey);
        }
      }}
      onSelectSchool={journeyCommands.selectSchoolById}
      onAddSchool={urlActions.enterSchoolPicking}
      filtersContent={filtersContent}
      trendsHref={trendsHref}
      isFetching={isFetching}
      isInitialLoading={isLoading}
      searchQuery={searchQuery}
      onSearchChange={handleSearchChange}
      filters={filters}
      onFiltersChange={handleFiltersChange}
      selectedSchool={selectedSchool}
      schools={schools}
      schoolsLoading={schoolsQuery.isLoading}
      // Issue #1198 — wire the dormant #1144/#1170 schools-in-area error/retry channel.
      // These are the EXISTING useSchoolsByArea signals (same query that already feeds
      // PropertyMap's schoolsIsError/schoolsError); no new query/effect/config is added.
      schoolsError={schoolsQuery.isError}
      onSchoolsRetry={schoolsQuery.refetch}
      schoolsFetching={schoolsQuery.isFetching}
      schoolListings={schoolListings}
      schoolListingsLoading={listingDataLoading}
      radiusKm={urlState.radiusKm}
      onRadiusChange={journeyCommands.changeRadius}
      onClearSchool={journeyCommands.clearSchool}
      onClearArea={journeyCommands.clearArea}
      // Issue #1115 — bounded-search CTA wiring.
      onBoundedSearch={isAuthenticated ? handleBoundedSearch : undefined}
      boundedSearchTriggered={journeyView.boundedSearchTriggered}
      // Issue #1547 — shared card↔marker selection (URL/parent-derived via the
      // `listing` param). selectedListingId drives the copper selected card frame +
      // scroll-into-view. The selection DRIVER is the map marker (marker→URL, see
      // handleSelectMarkerListing); the residential card's primary action is
      // navigation, so onSelectResultListing is intentionally left unwired to avoid
      // a redundant history PUSH right before navigate.
      selectedListingId={urlState.selectedListing}
      // Issue #1547 — ephemeral hover/focus signal for card→marker highlight.
      // hoveredListingId is ephemeral useState (NOT URL); resets to null on mouseleave/blur
      // and naturally on journey switch. School-first NOT wired (RISK-3 unsafe tier sources).
      onHoverResultListing={interactionCommands.hoverListing}
      // Issue #1798 PR-B (Unit D/F) — panel↔map area-marker plumbing. Mirrors the
      // onHoverResultListing pattern above: purely ephemeral state, no camera move.
      onAreaSearchQueryChange={setAreaSearchQuery}
      onAreaHover={interactionCommands.hoverArea}
      shownAreaCount={areaMarkerCounts.shown}
      totalAreaMarkerCount={areaMarkerCounts.total}
      // Issue #1806 (FIX-5d) — non-splittable cluster click highlight signal.
      highlightedAreaKeys={highlightedAreaKeys}
      // Issue #1430 — agri-group listing peek wiring.
      onSelectAgriGroupListing={(id) => urlActions.setSelectedListing(id)}
      selectedGroupListingItem={selectedGroupListingItem}
      onCloseGroupPeek={() => urlActions.clearSelectedListing()}
      onViewGroupListingDetails={(id) => navigate(`/listing/${id}`)}
      // Issue #1464 — agri-group-locality drill-down wiring.
      selectedLocality={urlState.selectedLocality ?? null}
      onSetLocality={(locality) => urlActions.setLocality(locality)}
      onClearLocality={() => urlActions.clearLocality()}
      // Issue #1457 — agri filter props
      agriAcresMin={urlState.filters.agriAcresMin}
      agriAcresMax={urlState.filters.agriAcresMax}
      agriPriceMin={urlState.filters.agriPriceMin}
      agriPriceMax={urlState.filters.agriPriceMax}
      // Issue #1458 — agri categorical/boolean filter props
      agriLandCategory={urlState.filters.agriLandCategory ?? null}
      agriFarmhouseAvailable={urlState.filters.agriFarmhouseAvailable ?? null}
      agriFencingDone={urlState.filters.agriFencingDone ?? null}
      agriWaterSource={urlState.filters.agriWaterSource ?? null}
      onApplyAgriFilters={(filterValues: AgriFilterValues) =>
        urlActions.setFiltersCommitted({
          ...urlState.filters,
          ...filterValues,
          // Belt-and-suspenders: never write price params for anon users even if UI bypassed
          agriPriceMin: isAuthenticated ? filterValues.agriPriceMin : undefined,
          agriPriceMax: isAuthenticated ? filterValues.agriPriceMax : undefined,
          // Issue #1458 — categorical/boolean filters pass through as-is (no auth gate)
          agriLandCategory: filterValues.agriLandCategory ?? null,
          agriFarmhouseAvailable: filterValues.agriFarmhouseAvailable ?? null,
          agriFencingDone: filterValues.agriFencingDone ?? null,
          agriWaterSource: filterValues.agriWaterSource ?? null,
        })
      }
      onClearAgriFilters={() => urlActions.clearAgriFilters()}
      // Issue #1494 — buy/rent intent selector
      intent={urlState.intent}
      onIntentChange={(newIntent) => urlActions.setIntent(newIntent)}
      // Issue #1588 — public landing controls (city) + journey-card count chips.
      onCityChange={handleCityChange}
      totalProperties={cityTotal}
      areasCount={discoverAreas.filter((a) => (a.listingCount ?? 0) > 0).length}
      isCityEmpty={cityHasNoListings}
      // Issue #1597 — group-results state wiring
      onEnterGroupResults={urlActions.enterGroupResults}
      groupResultsListings={groupResultsListings}
      isLoadingGroupResults={isLoadingGroupResults}
      isGroupResultsError={isGroupResultsError}
      groupResultsTotalElements={groupResultsTotalElements}
      onRetryGroupResults={refetchGroupResults}
      onClearGroupResults={urlActions.clearGroupResults}
      footerContent={isAuthenticated && !selectedArea && totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-card shrink-0">
          <Button
            variant="outline" size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages} · {totalElements.toLocaleString()} listings
          </span>
          <Button
            variant="outline" size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : null}
    />
  );
}
