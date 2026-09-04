import { useEffect, useMemo } from 'react';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { toSelectedListingPreviewFromMarkerListing } from '@/features/discover/navigation/selectedListingPreview';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';
import type {
  DiscoverPanelSurfaceView,
  DiscoverPanelSurfaceCommands,
} from '../buildPanelSurfaceModel';

export interface LegacyRightPanelBridgeProps {
  view: DiscoverPanelSurfaceView;
  commands: DiscoverPanelSurfaceCommands;
}

/**
 * Issue #2142 SOLID follow-up (commit 2) — the LEGACY `DiscoverRightPanel`
 * branch, moved VERBATIM out of `DiscoverPanelSurface.tsx`. Every one of the
 * ~90 props, the ~25 inline closures, the footer pager and the cityLabel/onBack
 * expressions below are byte-identical to that file; only the destructuring
 * prelude in front of them is new (it reconstructs the exact same local names
 * the moved JSX already referenced).
 *
 * Unlike its two canonical siblings this bridge legitimately consumes nearly
 * the whole `view`/`commands` contract — `DiscoverRightPanel` is a
 * multi-journey leaf with its own flat prop interface — so it is typed against
 * the full contract rather than a `Pick`ed subset. That is the
 * reviewer-acknowledged exception to the narrow-Pick rule, and it applies to
 * the `pageContext` group too: this bridge takes the whole `nav`/`actions`/
 * shell group rather than enumerating the ~30 members it touches.
 *
 * PLAN REVIEW correction 3 — `useDiscoverNav()`/`useDiscoverActions()`/
 * `useDiscoverShell()` are no longer called here; all four values arrive
 * through `view.pageContext` / `commands.pageContext`.
 */
export function LegacyRightPanelBridge({ view, commands }: LegacyRightPanelBridgeProps) {
  const { city, cityTotal, cityHasNoListings, trendsHref } = view.routing;
  const { handleCityChange, navigate } = commands.routing;
  const {
    discoverAreas,
    selectedArea,
    areaListings,
    isLoadingAreaListings,
    areaResultSummaryText,
    areasLoading,
    discoverAreasForPanel,
    areaMarkerCounts,
    highlightedAreaKeys,
    scopeNamespaces,
    regionScopedGroups,
    isLoadingRegionScopedGroups,
    isRegionScopedGroupsError,
    areaGroupsData,
    isLoadingAreaGroups,
    summaryRegions,
    selectedGroupName,
    // Issue #2015 — anon "Search this area" (VIEWPORT scope) reconciled cards.
    isAnonViewport,
    anonViewportListings,
    anonViewportListingsLoading,
    // Issue #2015 (caller-wiring follow-up) — error state for the anon-viewport
    // query, so the Retry-on-error UI can distinguish an errored fetch from
    // genuinely zero listings.
    isErrorAnonViewport,
    // Issue #2015 — authenticated "Search this area" (VIEWPORT scope)
    // reconciled cards, mirroring the anon-viewport fields above.
    isAuthViewport,
    authViewportListings,
    authViewportListingsLoading,
    isErrorAuthViewport,
  } = view.geography;
  // Issue #2142 SOLID follow-up (commit 3) — the #1808 region-guidance signals
  // moved out of `geography` into their own `regionGuide` view group. Same
  // three values, same producers, same JSX below; only the group path changed.
  const { regionGuideRingActive, regionOverviewMarkerKind, regionSelectNonce } = view.regionGuide;
  const {
    handleAreaSelect,
    handleAreaFirstBack,
    setAreaSearchQuery,
    refetchRegionScopedGroups,
    armRegionSelect,
    // Issue #2015 (caller-wiring follow-up) — pairs with `isErrorAnonViewport`
    // above to power the anon-viewport Retry-on-error control.
    refetchAnonViewport,
  } = commands.geography;
  const {
    groupResultsListings,
    isLoadingGroupResults,
    isGroupResultsError,
    groupResultsTotalElements,
    page,
    totalPages,
    totalElements,
    selectedGroupListingItem,
    isFetching,
    isLoading,
    listingDataLoading,
  } = view.results;
  const { refetchGroupResults, setPage, handleBoundedSearch } = commands.results;
  const {
    agriAreasData,
    isLoadingAgriAreas,
    filteredAgriListings,
    agriMapListingsData,
    isLoadingAgriGroupListings,
    isAgriGroupListingsError,
    agriGroupLabel,
    // Issue #2142 SOLID follow-up (commit 3) — the agri corridor fields, moved
    // here from `view.geography`. Same values, same producer
    // (useDiscoverAgriController), same JSX below.
    corridorGroups,
    isLoadingRegionalAreaGroups,
    isRegionalAreaGroupsError,
    isRegionalAreaGroupsNotGeneratedForRevision,
    selectedRegion,
    selectedMaxKm,
  } = view.agri;
  const { refetchAgriGroupListings, refetchRegionalAreaGroups } = commands.agri;
  const { selectedSchool, schools, schoolsQuery, schoolListings } = view.schools;
  const { filters, filtersContent, searchQuery } = view.filters;
  const { handleFiltersChange, handleSearchChange } = commands.filters;
  const { journeyView, resolvedPanelContent, areasNavigationJourney } = view.navigation;
  const { journeyCommands, selectJourney, onSelectedListingPreviewChange } = commands.navigation;
  const { selectedMarkerListing, activeContextChips, prefersReducedMotion, isAuthenticated } =
    view.interaction;
  const { clearSelectedMarkerListing, interactionCommands } = commands.interaction;
  // Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — these
  // four were direct `useDiscoverNav()`/`useDiscoverActions()`/
  // `useDiscoverShell()` facade reads (the #1953 build-step-2/4 deviation)
  // until this commit. They are the SAME objects, sourced from the SAME single
  // `useDiscoverUrlState()` the provider owns — `useDiscoverPageContext`
  // already read them for the page, so threading them here adds no second
  // subscription, it just makes the dependency explicit and type-checked.
  //
  // Issue #1956 PR-6 (final cutover, Step 3) — `mobileView`'s only production
  // consumer (AreaGroupsLandingPanel's scroll-preserving hook) is deleted;
  // still forwarded unchanged to DiscoverRightPanel below.
  const { nav: urlState, isMobileShell, mobileView, isAreaSetDraftOpen } = view.pageContext;
  const { actions: urlActions } = commands.pageContext;
  const isMobileMapOpen = isMobileShell && mobileView === 'MAP';
  const cityLabel = CITY_CONFIG[city]?.label ?? city;

  // Issue #2149 — school-first's counterpart to AreaLeafListingsSurface/
  // NodeListingsSurface's own `onSelectedListingPreviewChange` report-up
  // effect (see those files). Area-first can derive its preview from
  // `nav.selectedListing` because an area-first marker click writes the
  // `listing=` URL param; a pure school-first click deliberately does NOT
  // (issue #1547-deferred design, #1973 rev-2), so it only ever sets local
  // `selectedMarkerListing` (owned by useMarkerSelection, threaded here via
  // `view.interaction`). Deriving the preview from that local state instead
  // is what makes the mobile listing-preview sheet work for school-first at
  // all — without this, `useDiscoverMobilePresentationController`'s
  // `selectedListingPreview` never gets set, and both the desktop popover
  // (deliberately suppressed on mobile since #1956 PR-5) and the mobile sheet
  // stay empty on marker tap.
  //
  // Scoped to `journey === 'school-first' && schoolId != null` — the ONE
  // state this bridge renders where a marker click sets `selectedMarkerListing`
  // without also being covered by area-first's own reporting path
  // (`isAreaFirstJourneyActive` routes every `journey === 'area-first'` state
  // to `AreaFirstJourneyPanel` instead, per `useDiscoverNavigationController`,
  // so this bridge never doubles up with that surface's effect). Tapping a
  // second marker replaces the preview naturally: this effect is keyed on
  // `selectedMarkerListing` itself, not on any "already open" gate.
  const schoolFirstMarkerListingPreview = useMemo<SelectedListingPreview | null>(() => {
    if (urlState.journey !== 'school-first' || urlState.schoolId == null) return null;
    if (!selectedMarkerListing) return null;
    return toSelectedListingPreviewFromMarkerListing(selectedMarkerListing, {
      isAuthenticated,
      cityLabel,
    });
  }, [urlState.journey, urlState.schoolId, selectedMarkerListing, isAuthenticated, cityLabel]);

  useEffect(() => {
    onSelectedListingPreviewChange(schoolFirstMarkerListingPreview);
  }, [schoolFirstMarkerListingPreview, onSelectedListingPreviewChange]);

  return (
    <DiscoverRightPanel
      panelContent={resolvedPanelContent}
      isMobileMapOpen={isMobileMapOpen}
      // Issue #2108 (shell fix) — the SAME real `isMobileShell` flag
      // (useDiscoverShell's 820px matchMedia) MapDiscovery.tsx gates its own
      // mobile-only control-bar row on, so DiscoverRightPanel can mount its
      // desktop-only DiscoverControlBar copy on the exact complementary
      // condition — never both, never neither, and (unlike a CSS-only
      // breakpoint split) correct in jsdom too, where media queries do not
      // evaluate.
      isMobileShell={isMobileShell}
      // Issue #2017 (owner-directed desktop rework) — see
      // DiscoverRightPanelProps.isAreaSetDraftOpen's own doc.
      isAreaSetDraftOpen={isAreaSetDraftOpen}
      selectedMarkerListing={selectedMarkerListing}
      onClearAgriSelection={clearSelectedMarkerListing}
      city={city}
      cityLabel={cityLabel}
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
      onSelectJourney={selectJourney}
      areaGroups={areaGroupsData?.groups ?? []}
      isLoadingAreaGroups={isLoadingAreaGroups}
      // Issue #1910 (PR2) — region-scoped area-group projection. Its only
      // production consumer (AreaGroupsLandingPanel) is deleted (Issue #1956
      // PR-6); still forwarded unchanged.
      regionScopedGroups={regionScopedGroups}
      isLoadingRegionScopedGroups={isLoadingRegionScopedGroups}
      isRegionScopedGroupsError={isRegionScopedGroupsError}
      onRetryRegionScopedGroups={refetchRegionScopedGroups}
      scopeNamespaces={scopeNamespaces}
      // Issue #1178 — forward the active groupId; used by the area-selected
      // group-name lookup and the school-first zone panels. Prop wiring only.
      groupId={urlState.groupId ?? null}
      onSelectGroup={(groupId) => urlActions.selectGroup(groupId)}
      // Issue #1483/#1485 — its only production consumer (AreaGroupsLandingPanel)
      // is deleted (Issue #1956 PR-6); still forwarded unchanged.
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
      // Issue #2015 — anon "Search this area" (VIEWPORT scope) card slot.
      isAnonViewport={isAnonViewport}
      anonViewportListings={anonViewportListings}
      anonViewportListingsLoading={anonViewportListingsLoading}
      isErrorAnonViewport={isErrorAnonViewport}
      onRetryAnonViewport={refetchAnonViewport}
      // Issue #2015 — authenticated "Search this area" (VIEWPORT scope) card slot.
      isAuthViewport={isAuthViewport}
      authViewportListings={authViewportListings}
      authViewportListingsLoading={authViewportListingsLoading}
      isErrorAuthViewport={isErrorAuthViewport}
      // Issue #1485 — forward area-groups loading state separately for school-first zone cards
      // so school-browse can show skeletons without coupling to the area-first isLoadingAreaGroups.
      isLoadingAreaGroupsForSchool={isLoadingAreaGroups}
      // Issue #1429 — agri-first corridor groups (cumulative corridor model)
      corridorGroups={corridorGroups}
      isLoadingRegionalGroups={isLoadingRegionalAreaGroups}
      // Issue #1453 — surface fetch error so CorridorLandingPanel can show error+retry UI.
      isRegionalGroupsError={isRegionalAreaGroupsError}
      // #2151 Track 3 landing-panel gap fix — surface the distinct not-generated-for-revision
      // state so a preview revision with zero sandbox Agri rows doesn't fall into the generic
      // "Could not load corridors" error at the landing panel (mirrors the drill-down panel's
      // AgriGroupSelectedPanel isNotGeneratedForRevision carve-out).
      isRegionalGroupsNotGeneratedForRevision={isRegionalAreaGroupsNotGeneratedForRevision}
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
          // Issue #2216 — journey-preserving canonical write (mirrors #2203/#2211's
          // DiscoverControlBar fix and SchoolFirstJourneyPanel's identical branch).
          // Unconditional (no journey-branch): CorridorLandingPanel (agri-first
          // landing) never destructures/reads `onSelectAreaKey` in its body — it is
          // a dead prop there (confirmed via DiscoverRightPanel.tsx's CorridorLandingPanel
          // destructuring) — so school-first is the only journey this fallback is
          // exercised for in this PR's test coverage. `AreaGroupsLandingPanel`
          // (area-first) also forwards this prop but is believed dead per #1956
          // PR-6; not independently re-verified here — a mismatched nodeKey lookup
          // there would simply fall through to the no-op branch below (fail
          // closed, never re-emit legacy `areaKey=`).
          const nodeKey = areasNavigationJourney.node?.children.find(
            (c) => c.areaKey === areaKey,
          )?.nodeKey;
          if (nodeKey) {
            urlActions.goToNodeAndClearSchoolSelection(nodeKey);
          }
          // else: fail closed, no-op. This should be structurally
          // unreachable — areaKey originates from the same node tree this
          // lookup searches — but if the reverse lookup ever misses, the
          // click is silently swallowed rather than re-emitting the legacy
          // `areaKey=` write this issue (#2216) exists to eliminate.
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
      // Issue #1815 R3b/R6 exercises onAreaSearchQueryChange directly at the
      // mocked-prop level — it is NOT solely fed by the deleted AreaGroupsLandingPanel.
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
      // Issue #1597 — group-results state wiring. Its only production consumer
      // (AreaGroupResultsPanel) is deleted (Issue #1956 PR-6); still forwarded
      // unchanged.
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
