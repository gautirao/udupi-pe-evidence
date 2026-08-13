import {
  useDiscoverActions,
  useDiscoverNav,
  useDiscoverShell,
} from '@/features/discover/context/useDiscoverContext';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';
import { DiscoverAreasJourneyPanel } from '@/features/discover/views/DiscoverAreasJourneyPanel';
import { JourneySwitcher } from '@/components/discover/JourneySwitcher';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { hasLegacyAreaContext } from '@/features/discover/navigation/legacyAreaContextGuard';
import { useDiscoverAreaNavigationPathResolver } from '@/features/discover/navigation/useDiscoverAreaNavigationPath';
import { useToast } from '@/hooks/use-toast';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import { SchoolsNavigationJourneyPanel } from '@/features/discover/views/SchoolsNavigationJourneyPanel';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from './buildPanelSurfaceModel';

/**
 * Issue #2142 Commit 4 — renamed from DiscoverRightPanelContainer.tsx (per the
 * approved plan's rollback file-set). Every closure/JSX line below (the ~25
 * inline closures, the footer pager, the cityLabel/onBack expressions, the
 * three-branch canonical/school/legacy panel selection) is preserved BYTE-
 * IDENTICAL to that file — see its own #1824 Slice S11c doc comment (git
 * history) for the full "moved VERBATIM, every value received as a PROP"
 * rationale, which still applies here. The ONLY change is the outer
 * function signature: instead of ~55 flat destructured props, this surface
 * accepts the grouped `{ view, commands }` contract and reconstructs the
 * exact same local variable names (including the same `= null` defaults for
 * the two optional fields) in one destructuring prelude below, so every line
 * after that prelude is untouched.
 */
export interface DiscoverPanelSurfaceProps {
  view: DiscoverPanelSurfaceView;
  commands: DiscoverPanelSurfaceCommands;
}

export function DiscoverPanelSurface({ view, commands }: DiscoverPanelSurfaceProps) {
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
    regionGuideRingActive,
    regionOverviewMarkerKind,
    regionSelectNonce,
    summaryRegions,
    selectedGroupName,
    corridorGroups,
    isLoadingRegionalAreaGroups,
    isRegionalAreaGroupsError,
    selectedRegion,
    selectedMaxKm,
  } = view.geography;
  const {
    handleAreaSelect,
    handleAreaFirstBack,
    setAreaSearchQuery,
    refetchRegionScopedGroups,
    armRegionSelect,
    refetchRegionalAreaGroups,
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
  } = view.agri;
  const { refetchAgriGroupListings } = commands.agri;
  const { selectedSchool, schools, schoolsQuery, schoolListings } = view.schools;
  const { filters, filtersContent, searchQuery } = view.filters;
  const { handleFiltersChange, handleSearchChange } = commands.filters;
  const {
    areasNavigationJourney,
    hoveredNavigationNodeKey = null,
    focusedClusterMemberAreaKeys = null,
    journeyView,
    resolvedPanelContent,
  } = view.navigation;
  const {
    onNavigationNodeHoverChange,
    onClusterFocusChange,
    journeyCommands,
    onSelectedListingPreviewChange,
  } = commands.navigation;
  const { selectedMarkerListing, activeContextChips, prefersReducedMotion, isAuthenticated } =
    view.interaction;
  const { clearSelectedMarkerListing, interactionCommands } = commands.interaction;
  // Issue #1953 (build step 2) — consumes the DiscoverProvider facade
  // directly rather than receiving urlState/urlActions as props (D2 prop
  // migration rule: these are the two facade-owned props dropped from the
  // MapDiscovery call site). This container never touches viewport, so only
  // nav + actions are needed.
  const urlState = useDiscoverNav();
  const urlActions = useDiscoverActions();
  // Issue #1953 (build step 4, AC28 gap fix) — the mobile shell slice, read
  // directly from the facade (same pattern as urlState/urlActions above)
  // rather than threaded down from MapDiscovery. Issue #1956 PR-6 (final
  // cutover, Step 3) — its only production consumer (AreaGroupsLandingPanel's
  // scroll-preserving hook) is deleted; still forwarded unchanged to
  // DiscoverRightPanel below.
  const { isMobileShell, mobileView } = useDiscoverShell();
  const isMobileMapOpen = isMobileShell && mobileView === 'MAP';
  // Issue #1956 PR 6 rework ([rulings.oq_a_v2]) — the areaKey -> node
  // conversion seam. Only ONE caller: `handleSelectJourney` below.
  const resolveAreaNavigationPath = useDiscoverAreaNavigationPathResolver();
  const { toast } = useToast();
  /**
   * The single production write path a JourneySwitcher click funnels through
   * (previously a bare `(j) => urlActions.setJourney(j)`).
   *
   * For every journey other than `area-first`, and for `area-first` with no
   * legacy `groupId`/`areaKey` context, this is behaviourally IDENTICAL to the
   * old one-liner — a plain `setJourney` PUSH.
   *
   * When switching TO `area-first` with legacy context present, this
   * converts FIRST and writes the URL exactly ONCE (via `enterAreasJourney`,
   * the existing atomic journey+node writer), per [rulings.oq_a_v2]:
   *   - `areaKey` present: resolve it through the sanctioned
   *     `.../navigation-path` server endpoint (never a client-constructed
   *     node key), then enter the canonical journey AT THAT NODE. The
   *     `groupId`/`areaKey` params are cleared as part of that SAME write
   *     (see `enterAreasJourney`'s PR-6 addition in `state/url/navigation.ts`).
   *     No premature `setJourney` — the URL is untouched, so the current
   *     (surviving) `AreaSelectedPanel` legacy render stays up throughout the
   *     round trip, with no flash of a wrong intermediate surface.
   *   - Unresolved/stale `areaKey` (404): retain the current legacy state —
   *     no navigation at all, so nothing is silently dropped — and surface an
   *     honest toast rather than a silent no-op.
   *   - `groupId` only (no `areaKey`): [orchestrator_judgement_groupid_only]
   *     — there is no resolved AREA to preserve and no `groupId` -> node
   *     resolution path exists, so this mounts canonical at the city root
   *     directly (no network round trip needed).
   */
  const handleSelectJourney = (journey: DiscoverJourney) => {
    const resolvedNode = areasNavigationJourney.node;
    if (
      journey === 'school-first' &&
      urlState.journey === 'area-first' &&
      !hasLegacyAreaContext(urlState) &&
      resolvedNode?.nodeType === 'AREA' &&
      resolvedNode.areaKey
    ) {
      // Server-owned identity only — never parse/derive from the URL's
      // node= encoding (#2124 ownership rule). The canonical resolved node
      // is the sole source for an AREA leaf's areaKey.
      urlActions.enterSchoolsJourneyAtArea(resolvedNode.areaKey);
      return;
    }

    if (journey !== 'area-first' || !hasLegacyAreaContext(urlState)) {
      urlActions.setJourney(journey);
      return;
    }
    if (urlState.areaKey) {
      if (resolveAreaNavigationPath.isPending) {
        // A conversion is already in flight for this same click intent —
        // never fire a second concurrent request/history write.
        return;
      }
      resolveAreaNavigationPath.mutate(
        { city: urlState.city || DEFAULT_CITY, areaKey: urlState.areaKey },
        {
          onSuccess: (path) => {
            urlActions.enterAreasJourney(path.nodeKey);
          },
          onError: () => {
            toast({
              variant: 'destructive',
              title: "Couldn't switch to area view",
              description: 'This area link looks out of date. Staying on your current view.',
            });
          },
        },
      );
      return;
    }
    // groupId-only, no areaKey.
    urlActions.enterAreasJourney(null);
  };
  // Issue #1956 PR 6 (final cutover, RULED A1 MINIMAL, restored by the
  // [rulings.oq_a_v2] rework after the superseded Option A guard) — the
  // canonical Areas journey is the default whenever the user is in the
  // area-first journey, unconditionally; the preview-capability +
  // areasPreview dual gate is removed and no legacy-routing exception
  // survives here. journey-less URLs are NOT additionally defaulted to
  // canonical — that is out of scope (follow-up #2059). This is one of THREE
  // identical gate sites (this file, DiscoverMapCanvas.tsx,
  // MapDiscovery.tsx) — see DiscoverMapCanvas.tsx's copy of this comment for
  // why the triplication is deliberate.
  //
  // A shopper arriving at `journey=area-first` with a stale `groupId`/
  // `areaKey` still in the URL (a hand-edited/bookmarked link, never an
  // in-app click — the click path below converts BEFORE ever writing
  // `journey=area-first`) mounts canonical at the city root and ignores the
  // stale params, exactly as A1 MINIMAL always specified; see `handleSelectJourney`
  // below for the ONLY place `hasLegacyAreaContext` is still consulted.
  //
  // Issue #1956 PR 2 (T1 — the panel-routing seam) — `resolvedPanelContent`
  // is computed upstream from `derivePanelContent`/`computeDiscoverLayer`
  // (src/features/discover/utils/discoverPanelState.ts and
  // discoverLayerRegistry.ts), NEITHER of which inspects `node=` and NEITHER
  // of which is in this PR's allowed scope to edit. Rather than extending
  // that discriminated union, the canonical Areas journey panel is mounted
  // by a SEPARATE, EARLIER branch that pre-empts the legacy `panelContent`
  // switch entirely when the user is in the area-first journey — it renders
  // instead of `DiscoverRightPanel`, never alongside it, so there is exactly
  // one panel mounted at a time.
  const showAreasNavigationJourney = urlState.journey === 'area-first';

  if (showAreasNavigationJourney) {
    // Issue #2084 — panel SHELL + persistent JourneySwitcher restore. Wrapped
    // ONCE around the whole `DiscoverAreasJourneyPanel` invocation (never
    // per-branch inside that panel), so the shell/switcher are
    // state-invariant across all four area-first panel states (AC1). Mirrors
    // the legacy `DiscoverRightPanel` root (DiscoverRightPanel.tsx:1713-1794)
    // — SAME desktop width class + switcher-then-content DOM order (R6) —
    // with TWO deliberate breakpoint-scoped divergences, per the handoff's R1
    // stop_condition and its code-review fix cycle 1: `lg:order-2` ONLY,
    // never a bare `order-2` (the legacy root carries both; at mobile widths
    // the bare one would apply and invert this journey's CURRENT, must-remain
    // list-before-map mobile ordering into map-before-list); and `lg:h-full`
    // ONLY (paired with the existing `lg:border-l`), never a bare `h-full` —
    // the legacy root has NO height class at any breakpoint, and a bare
    // `h-full` here would give this shell a mobile flex-basis equal to the
    // full mobile shell height, starving the `h-64` map of most of its space
    // under flex-shrink. `min-h-0` (unprefixed) is additionally new versus
    // the legacy root, but is safe at every breakpoint — it only clears the
    // default min-height:auto floor, it never forces a size — and is what
    // lets the desktop `lg:h-full` + `overflow-hidden` pairing actually
    // bound the inner `overflow-y-auto` wrapper below (R5).
    const isAreaFirstCityRoot = areasNavigationJourney.node?.nodeKey === ROOT_NODE_KEY;
    const areaFirstCityLabel = CITY_CONFIG[city]?.label ?? city;
    return (
      <div
        className="flex min-h-0 flex-col overflow-hidden bg-background lg:order-2 lg:h-full lg:w-1/2 lg:border-l lg:border-border"
        data-testid="discover-areas-journey-panel-shell"
      >
        {/* R6 — the switcher mounts FIRST, above panel content, matching the
            legacy shell's own tab order (DiscoverRightPanel.tsx:1723) so
            area-first inherits the identical keyboard focus order its
            sibling journeys already have. The border-b here is also AC7's
            divider rule separating the switcher block from the list below. */}
        <div className="flex flex-col gap-3 shrink-0 border-b border-border px-4 pb-2 pt-4">
          {/* Issue #2108 (shell fix) — this shell is the canonical area-first
              navigation journey's OWN copy of the "switcher mounts first"
              header (R6 above), parallel to the legacy `DiscoverRightPanel`
              root's identical block. It needs the SAME desktop-only
              DiscoverControlBar mount that block just got, for the same
              reason: the approved mock's `global-control-bar` sits above the
              mode-selector at every journey state, this canonical journey
              included. Gated on the same real `isMobileShell` flag already
              read into this component's scope above (not a new call), so it
              stays mutually exclusive with MapDiscovery.tsx's mobile-only
              `discover-control-bar-row` exactly like the legacy shell. */}
          {!isMobileShell && <DiscoverControlBar />}
          <JourneySwitcher
            // CQ2 — FULL cards ONLY at the area-first CITY ROOT (the
            // guided-entry analogue); COMPACT tab-strip at every deeper node
            // (Direction/Local-Destination/Area), so the switcher never
            // consumes ~a third of panel height above a listing surface.
            compact={!isAreaFirstCityRoot}
            activeJourney="area-first"
            onSelectJourney={handleSelectJourney}
            cityLabel={areaFirstCityLabel}
            // Issue #2084 ruling 3 / clarification rev 2 — these counts are
            // sourced ONLY from #2083's scoped/canonical
            // `areasNavigationJourney.nodeCount` (server-computed,
            // filter-aware), never the legacy city-wide `cityTotal` /
            // `discoverAreas` fallback the sibling journey's call site below
            // (~:719) still uses. `matchingAreaCount` is filter-aware where
            // the legacy area count was not — with filters active the
            // displayed area count now tracks them.
            //
            // `nodeCount` (and `matchingAreaCount` within it) is nullable
            // while counts are loading/resolving. A prior version of this
            // call site papered over that with `?? cityTotal` /
            // `?? legacy-area-count`, describing it in a comment as
            // "explicitly transient / loading-only" — that was factually
            // wrong: `matchingAreaCount` never resolved for the city ROOT at
            // all (the hook only computed it for DIRECTION/CLUSTER), so the
            // legacy fallback was live PERMANENTLY, not just during a brief
            // loading window. That gap is fixed at the source
            // (`useAreasNavigationJourney`'s ROOT branch), so `nodeCount` now
            // resolves at ROOT and no fallback is needed. `JourneySwitcher`
            // itself renders an explicit loading affordance for a null
            // value, so passing `null` straight through here is correct and
            // required — never coerce it to a legacy number.
            totalProperties={areasNavigationJourney.nodeCount?.listingCount ?? null}
            areasCount={areasNavigationJourney.nodeCount?.matchingAreaCount ?? null}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>
        {/* R5 — a bounded scroll container for the panel states whose own
            root is still a bare `p-4` div with no scroll ancestry of its own
            (loading/error/cluster-focus/empty/children-list). The AREA-leaf
            branch (`AreaLeafListingsSurface`) already owns its own
            `h-full ... overflow-hidden` root + internal `overflow-y-auto`
            scrolling (DiscoverAreasJourneyPanel.tsx) — nesting it inside this
            bounded flex item does not change that: its `h-full` resolves
            against this wrapper's bounded content-box and it remains the
            actual scroll owner, so this outer `overflow-y-auto` stays inert
            (no double scrollbar) for that branch.

            DESKTOP: boundedness comes from the shell root's `lg:h-full` +
            `overflow-hidden` above, so this wrapper scrolls against a real
            fixed height, exactly as intended.

            MOBILE (code-review fix cycle 1): the shell root no longer
            carries a bare `h-full`, so on mobile it has no explicit height
            of its own — identical to the pre-#2084 area-first panel root
            (a bare `p-4` div with no height class). This wrapper's
            `flex-1 overflow-y-auto` then resolves against whatever natural
            (content-driven) height the shell ends up with in the mobile
            column flex layout, same as before this shell existed — no new
            scroll dead-zone and no double scrollbar versus today. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DiscoverAreasJourneyPanel
            journey={areasNavigationJourney}
            cityLabel={areaFirstCityLabel}
            hoveredNodeKey={hoveredNavigationNodeKey}
            onHoverChange={onNavigationNodeHoverChange}
            focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
            onClusterFocusChange={onClusterFocusChange}
            isNodeListingsActive={urlState.nodeListings === true}
            onClearNodeListings={urlActions.clearNodeListings}
            onBrowseListings={urlActions.enterNodeListings}
            // Issue #1956 PR 2 (Slice 5) — the pure href builder the visible
            // in-app HierarchyBackButton uses to resolve the canonical parent.
            buildNodeHref={urlActions.buildNodeHref}
            // Issue #1956 PR-4 FIX CYCLE 3 (blocking Fix B) — forward the SAME
            // `filters`/`handleFiltersChange` this container already receives for
            // the legacy `DiscoverRightPanel` below (see that call site's own
            // `onFiltersChange={handleFiltersChange}`), so an AREA-leaf chip
            // toggle writes into the identical page-local filters state the
            // map's query reads, instead of a parallel URL-only write.
            areaLeafFilters={filters}
            onAreaLeafFiltersChange={handleFiltersChange}
            // Issue #1956 PR-4 FINAL FIX PASS (regression fix) — the canonical
            // AREA-leaf surface silently dropped the "Add a school in this
            // area" CTA because this call site never supplied `onAddSchool`
            // (the prop is optional on both `DiscoverAreasJourneyPanel` and
            // `AreaSelectedPanel`, so the omission compiled but the button just
            // never rendered). `urlActions` is already the SAME
            // `useDiscoverActions()` facade result the legacy `DiscoverRightPanel`
            // call site below uses for its own `onAddSchool={urlActions.enterSchoolPicking}`
            // — reusing it here (not a new handler) keeps the area-first
            // school-picking sub-step (Issue #1157) identical on both surfaces:
            // `journey` stays `area-first` so Back restores the selected area
            // instead of deleting it.
            onAddSchool={urlActions.enterSchoolPicking}
            onSelectedListingPreviewChange={onSelectedListingPreviewChange}
            // Issue #2124 (fix-cycle) — the canonical area-first "schools-in-area"
            // sub-step (schoolPicking=1) and its follow-on area+school combined view
            // (schoolId set). These are the SAME schools/selectedSchool/schoolListings/
            // radiusKm props (and journeyCommands actions) already threaded to the
            // legacy `DiscoverRightPanel` call site below for the identical panels —
            // reused here, never re-fetched, so the canonical and legacy surfaces can
            // never disagree on schools-in-area data.
            schools={schools}
            schoolsLoading={schoolsQuery.isLoading}
            schoolsError={schoolsQuery.isError}
            onSchoolsRetry={schoolsQuery.refetch}
            schoolsFetching={schoolsQuery.isFetching}
            selectedSchool={selectedSchool}
            schoolListings={schoolListings}
            schoolListingsLoading={listingDataLoading}
            radiusKm={urlState.radiusKm}
            onRadiusChange={journeyCommands.changeRadius}
            onClearSchool={journeyCommands.clearSchool}
            onSelectSchool={journeyCommands.selectSchoolById}
            onStartOver={journeyCommands.startOver}
            // Issue #2124 (fix-cycle) — `handleAreaFirstBack` already implements the
            // exact 3-rung ladder (schoolId -> backToSchoolPicking; schoolPicking ->
            // clearSchoolPicking; else -> area back) purely off `nav.schoolId`/
            // `nav.schoolPicking` (URL state, journey-agnostic) — it never reads the
            // legacy `areaKey` param, so it is already correct for the canonical
            // journey unchanged.
            onBackFromSchoolFlow={handleAreaFirstBack}
          />
        </div>
      </div>
    );
  }

  const isSchoolsNavNodeLevel = urlState.journey === 'school-first' && !urlState.areaKey && !urlState.schoolId;
  const showSchoolsNavigationJourney = isSchoolsNavNodeLevel;

  if (showSchoolsNavigationJourney) {
    const isSchoolsFirstCityRoot = areasNavigationJourney.node?.nodeKey === ROOT_NODE_KEY;
    const schoolsFirstCityLabel = CITY_CONFIG[city]?.label ?? city;
    return (
      <div
        className="flex min-h-0 flex-col overflow-hidden bg-background lg:order-2 lg:h-full lg:w-1/2 lg:border-l lg:border-border"
        data-testid="discover-schools-journey-panel-shell"
      >
        <div className="flex flex-col gap-3 shrink-0 border-b border-border px-4 pb-2 pt-4">
          {!isMobileShell && <DiscoverControlBar />}
          <JourneySwitcher
            compact={!isSchoolsFirstCityRoot}
            activeJourney="school-first"
            onSelectJourney={handleSelectJourney}
            cityLabel={schoolsFirstCityLabel}
            totalProperties={areasNavigationJourney.nodeCount?.listingCount ?? null}
            areasCount={areasNavigationJourney.nodeCount?.matchingAreaCount ?? null}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SchoolsNavigationJourneyPanel
            journey={areasNavigationJourney}
            onSelectAreaKey={(areaKey) => {
              // Same handling as Areas
              const match = discoverAreas.find((a) => a.areaKey === areaKey);
              if (match) {
                handleAreaSelect(match);
              } else {
                urlActions.selectArea(areaKey);
              }
            }}
            buildNodeHref={urlActions.buildNodeHref}
            hoveredNodeKey={hoveredNavigationNodeKey}
            onHoverChange={onNavigationNodeHoverChange}
            cityLabel={schoolsFirstCityLabel}
            focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
            onClusterFocusChange={onClusterFocusChange}
          />
        </div>
      </div>
    );
  }

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
      onSelectJourney={handleSelectJourney}
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
