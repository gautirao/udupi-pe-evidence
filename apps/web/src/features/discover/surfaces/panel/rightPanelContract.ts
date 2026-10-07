import type { ReactNode } from 'react';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';
import { prettifyZoneSlug } from '@/components/discover/SchoolRadiusMapOverlay';
import { resolveAreaRegionName } from '@/features/discover/selectors/areaRegionName';
import { resolveAreaSelectedResults } from '@/features/discover/selectors/areaSelectedResults';
import { buildRegionGuideHelperText } from '@/features/discover/selectors/regionGuideHelperText';
import type { RightPanelView, RightPanelCommands } from '@/features/discover/right-panel/contracts';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from '../buildPanelSurfaceModel';

/**
 * Issue #2657 C8 — the pure `{view, commands}` builders for
 * `DiscoverRightPanel`'s new public contract. `LegacyRightPanelBridge` calls
 * these instead of flattening `DiscoverPanelSurfaceView`/`Commands` into
 * ~145 individual JSX attributes; `DiscoverRightPanel` receives the built
 * `RightPanelView`/`RightPanelCommands` directly (architect plan §2/§3 C8).
 *
 * Every closure here is moved VERBATIM (same condition, same call, same
 * argument order) from `LegacyRightPanelBridge.tsx`'s pre-C8 JSX — this file
 * only changes WHERE the closures are constructed, never what they do. Pure
 * functions: no hooks, no React state. The bridge's own `useEffect`/`useMemo`
 * (the school-first marker listing preview) stays in the bridge — it is not
 * part of the `{view, commands}` contract.
 */

/** Values the bridge computes itself (cityLabel from CITY_CONFIG, the footer pager JSX) and threads through unchanged — see architect plan §2 "Whole objects still passed: ReactNode slots". */
export interface RightPanelViewExtras {
  cityLabel: string;
  footer: ReactNode;
}

export function buildRightPanelView(view: DiscoverPanelSurfaceView, extras: RightPanelViewExtras): RightPanelView {
  const { nav: urlState } = view.pageContext;
  const areaGroupsList = view.geography.areaGroupsData?.groups ?? [];
  const activeGroup = areaGroupsList.find((g) => g.id === (urlState.groupId ?? null));
  // Issue #2657 C1 — same selector DiscoverRightPanel called pre-C8 (moved
  // here, not reimplemented; a pure function's call site has no behavioural
  // effect — see AreaJourneyPanel.tsx's own doc comment).
  const regionName = resolveAreaRegionName(
    { scope: urlState.scope ?? null, summaryRegions: view.geography.summaryRegions, activeGroup },
    prettifyZoneSlug,
  );
  // Issue #2015 / #2461 / #2018 — VIEWPORT/POLYGON result-scope substitution
  // + matching isError/retry selection, same selector call as pre-C8.
  const areaSelectedResults = resolveAreaSelectedResults({
    isAnonViewport: view.geography.isAnonViewport,
    isAuthViewport: view.geography.isAuthViewport,
    isPolygonScope: view.geography.isPolygonScope,
    anonViewportListings: view.geography.anonViewportListings,
    authViewportListings: view.geography.authViewportListings,
    polygonListings: view.geography.polygonListings,
    anonViewportListingsLoading: view.geography.anonViewportListingsLoading,
    authViewportListingsLoading: view.geography.authViewportListingsLoading,
    polygonListingsLoading: view.geography.polygonListingsLoading,
    areaListings: view.geography.areaListings,
    isLoadingListings: view.geography.isLoadingAreaListings,
    areaResultSummaryText: view.geography.areaResultSummaryText,
    isListingsError: view.geography.isErrorAreaListings,
    isErrorAuthViewport: view.geography.isErrorAuthViewport,
    isErrorPolygonListings: view.geography.isErrorPolygonListings,
    // Issue #1793 SR-024 — the anon viewport's OWN error (previously hard-coded false).
    isErrorAnonViewport: view.geography.isErrorAnonViewport,
    // `retry` is a COMMANDS-side field (RightPanelAreaCommands.results.retry,
    // built separately in buildRightPanelCommands below) — this view builder
    // only reads the view-side outputs (listings/summaryText/isLoading/
    // isError/isViewportScope), so the retry inputs are irrelevant here.
    onRetryListings: undefined,
    onRetryAuthViewport: undefined,
    onRetryPolygonListings: undefined,
    onRetryAnonViewport: undefined,
  });

  return {
    frame: {
      layout: {
        panelContent: view.navigation.resolvedPanelContent,
        isMobileShell: view.pageContext.isMobileShell,
        hostsHeaderControls: view.pageContext.hostsHeaderControls,
        headerHostsJourneyTabs: view.pageContext.headerHostsJourneyTabs,
        footer: extras.footer,
      },
      counts: {
        totalProperties: view.routing.cityTotal,
        areasCount: view.geography.discoverAreas.filter((a) => (a.listingCount ?? 0) > 0).length,
      },
      regionGuide: {
        ringActive: view.regionGuide.regionGuideRingActive,
        markerKind: view.regionGuide.regionOverviewMarkerKind,
        nonce: view.regionGuide.regionSelectNonce,
        prefersReducedMotion: view.interaction.prefersReducedMotion,
        helperText: buildRegionGuideHelperText({
          summaryRegions: view.geography.summaryRegions,
          scope: urlState.scope ?? null,
          markerKind: view.regionGuide.regionOverviewMarkerKind,
        }),
      },
    },
    shared: {
      context: {
        city: view.routing.city,
        cityLabel: extras.cityLabel,
        journey: urlState.journey,
        intent: urlState.intent,
        isAuthenticated: view.interaction.isAuthenticated,
      },
      chrome: { activeContextChips: view.interaction.activeContextChips, filtersContent: view.filters.filtersContent },
      area: { point: view.geography.selectedArea, urlAreaKey: urlState.areaKey, isLoading: view.geography.areasLoading },
      cards: { selectedListingId: urlState.selectedListing, hoveredListingId: null },
      refresh: {
        isFetching: view.results.isFetching,
        isInitialLoading: view.results.isLoading,
        // Issue #1793 PR-C — the school-radius card source's own settled signal + the anon page-cap flag.
        schoolRadiusSettled: view.schools.schoolRadiusPanelSettled,
        schoolRadiusHasMore: view.schools.schoolRadiusHasMore,
      },
    },
    entry: {
      landing: { isCityEmpty: view.routing.cityHasNoListings },
      anonViewport: {
        active: view.geography.isAnonViewport,
        listings: view.geography.anonViewportListings,
        loading: view.geography.anonViewportListingsLoading,
        error: view.geography.isErrorAnonViewport,
      },
    },
    area: {
      selection: { groupName: view.geography.selectedGroupName, regionName, isDraftOpen: view.pageContext.isAreaSetDraftOpen },
      results: {
        listings: areaSelectedResults.listings,
        summaryText: areaSelectedResults.summaryText,
        isLoading: areaSelectedResults.isLoading,
        isError: areaSelectedResults.isError,
        isViewportScope: areaSelectedResults.isViewportScope,
      },
      filters: { filters: view.filters.filters, searchQuery: view.filters.searchQuery, trendsHref: view.routing.trendsHref },
    },
    school: {
      zones: {
        groups: areaGroupsList,
        loading: view.geography.isLoadingAreaGroups,
        discoverAreas: view.geography.discoverAreasForPanel,
        groupId: urlState.groupId ?? null,
      },
      scope: { key: urlState.scope ?? null, summaryRegions: view.geography.summaryRegions },
      schoolsInArea: {
        data: view.schools.schools,
        loading: view.schools.schoolsQuery.isLoading,
        fetching: view.schools.schoolsQuery.isFetching,
        error: view.schools.schoolsQuery.isError,
      },
      homes: { data: view.geography.areaListings, loading: view.geography.isLoadingAreaListings },
      selected: {
        school: view.schools.selectedSchool,
        radiusKm: urlState.radiusKm,
        listings: view.schools.schoolListings,
        // Issue #1793 SR-024 (PR-A review A1) — `listingDataLoading` is auth-only (false for anon);
        // the anon school-radius query's own in-flight signal covers its first load, automatic
        // retries and a data-less Retry, so the panel shows the skeleton instead of "No homes".
        listingsLoading: view.results.listingDataLoading || (view.schools.schoolRadiusPanelLoading ?? false),
        // Issue #1793 SR-024 — the school-radius query's failure (request-failure block).
        listingsError: view.schools.isErrorSchoolRadiusListings,
        boundedSearchTriggered: view.navigation.journeyView.boundedSearchTriggered,
      },
      propertyFilters: { value: view.filters.filters },
    },
    agri: {
      corridors: {
        groups: view.agri.corridorGroups,
        loading: view.agri.isLoadingRegionalAreaGroups,
        error: view.agri.isRegionalAreaGroupsError,
        notGenerated: view.agri.isRegionalAreaGroupsNotGeneratedForRevision,
        discoverAreas: view.geography.discoverAreasForPanel,
      },
      selection: {
        region: view.agri.selectedRegion,
        maxKm: view.agri.selectedMaxKm,
        locality: urlState.selectedLocality ?? null,
        groupLabel: view.agri.agriGroupLabel,
      },
      groupListings: {
        data: view.agri.filteredAgriListings,
        loading: view.agri.isLoadingAgriGroupListings,
        error: view.agri.isAgriGroupListingsError,
        truncated: view.agri.agriMapListingsData?.truncated ?? false,
        limit: view.agri.agriMapListingsData?.limit,
      },
      areaSummary: {
        data: view.agri.agriAreasData,
        loading: view.agri.isLoadingAgriAreas,
        listings: view.geography.areaListings,
        listingsLoading: view.geography.isLoadingAreaListings,
      },
      filters: {
        values: {
          agriAcresMin: urlState.filters.agriAcresMin,
          agriAcresMax: urlState.filters.agriAcresMax,
          agriPriceMin: urlState.filters.agriPriceMin,
          agriPriceMax: urlState.filters.agriPriceMax,
          agriLandCategory: urlState.filters.agriLandCategory ?? null,
          agriFarmhouseAvailable: urlState.filters.agriFarmhouseAvailable ?? null,
          agriFencingDone: urlState.filters.agriFencingDone ?? null,
          agriWaterSource: urlState.filters.agriWaterSource ?? null,
        },
      },
      peek: { item: view.results.selectedGroupListingItem, markerListing: view.interaction.selectedMarkerListing },
    },
  };
}

/**
 * Issue #2657 C8 — the bridge's own command factories/closures, moved
 * VERBATIM. `onSelectAreaKey` is built once and shared between
 * `commands.agri.corridors.selectAreaKey` and `commands.school.zones.selectAreaKey`
 * (the SAME single flat `onSelectAreaKey` prop DiscoverRightPanel forwarded
 * to both pre-C8).
 */
export function buildRightPanelCommands(
  commands: DiscoverPanelSurfaceCommands,
  view: DiscoverPanelSurfaceView,
): RightPanelCommands {
  const { nav: urlState } = view.pageContext;
  const { actions: urlActions } = commands.pageContext;

  // Issue #2657 C1 — same selector call as buildRightPanelView (pure; safe to
  // recompute here for `results.retry` without threading state between the
  // two builders).
  const areaSelectedResults = resolveAreaSelectedResults({
    isAnonViewport: view.geography.isAnonViewport,
    isAuthViewport: view.geography.isAuthViewport,
    isPolygonScope: view.geography.isPolygonScope,
    anonViewportListings: view.geography.anonViewportListings,
    authViewportListings: view.geography.authViewportListings,
    polygonListings: view.geography.polygonListings,
    anonViewportListingsLoading: view.geography.anonViewportListingsLoading,
    authViewportListingsLoading: view.geography.authViewportListingsLoading,
    polygonListingsLoading: view.geography.polygonListingsLoading,
    areaListings: view.geography.areaListings,
    isLoadingListings: view.geography.isLoadingAreaListings,
    areaResultSummaryText: view.geography.areaResultSummaryText,
    isListingsError: view.geography.isErrorAreaListings,
    isErrorAuthViewport: view.geography.isErrorAuthViewport,
    isErrorPolygonListings: view.geography.isErrorPolygonListings,
    onRetryListings: commands.geography.refetchAreaListings,
    // Issue #2015 — the bridge never wired an authenticated-viewport retry
    // (no `refetchAuthViewport` on the surface); preserved as `undefined`,
    // identical to pre-C8 behaviour.
    onRetryAuthViewport: undefined,
    onRetryPolygonListings: view.geography.refetchPolygonListings,
    // Issue #1793 SR-024 — the anon viewport's own error/retry (previously hard-coded
    // false/undefined): Retry is the REAL anon-viewport query refetch.
    isErrorAnonViewport: view.geography.isErrorAnonViewport,
    onRetryAnonViewport: commands.geography.refetchAnonViewport,
  });

  // Issue #2216 — journey-preserving canonical write (moved verbatim from
  // LegacyRightPanelBridge.tsx's pre-C8 `onSelectAreaKey`). Shared by the
  // agri corridor landing's Browse-all-areas fallback AND the school-first
  // zone panels' Browse-all fallback — the SAME single closure pre-C8.
  const onSelectAreaKey = (areaKey: string) => {
    const match = view.geography.discoverAreas.find((a) => a.areaKey === areaKey);
    if (match) {
      commands.geography.handleAreaSelect(match);
    } else {
      const nodeKey = view.navigation.areasNavigationJourney.node?.children.find(
        (c) => c.areaKey === areaKey,
      )?.nodeKey;
      if (nodeKey) {
        urlActions.goToNodeAndClearSchoolSelection(nodeKey);
      }
      // else: fail closed, no-op (see the bridge's pre-C8 comment on this branch).
    }
  };

  // Issue #1882 — resolve the target scope key via an exact label lookup
  // against the backend region-summary list; no write on a miss.
  const onBackToRegion = (regionLabel: string) => {
    const targetScope = view.geography.summaryRegions.find((r) => r.regionLabel === regionLabel)?.regionKey ?? null;
    if (targetScope) {
      urlActions.setScope(targetScope);
    }
  };

  // schoolFirstOnBack is undefined when panelContent is not 'school-browse'
  // or 'school-selected' (Level 0), so Back correctly hides there.
  const onBack =
    urlState.journey === 'school-first' ? view.navigation.journeyView.schoolFirstOnBack : commands.geography.handleAreaFirstBack;

  return {
    shared: {
      chrome: {
        startOver: commands.navigation.journeyCommands.startOver,
        back: onBack,
        selectJourney: commands.navigation.selectJourney,
      },
      cards: {
        // Issue #1547 — the residential card's primary action is navigation;
        // onSelectResultListing is intentionally left unwired (pre-C8 never
        // passed it either — the map marker is the selection driver).
        select: undefined,
        hover: commands.interaction.interactionCommands.hoverListing,
      },
      market: {
        changeCity: commands.routing.handleCityChange,
        changeIntent: (newIntent) => urlActions.setIntent(newIntent),
      },
    },
    entry: {
      landing: { armRegionSelect: () => commands.geography.armRegionSelect('panel') },
      anonViewport: { retry: commands.geography.refetchAnonViewport },
    },
    area: {
      navigation: {
        addSchool: urlActions.enterSchoolPicking,
        crumbCity: () => urlActions.selectGroup(null),
        crumbRegion: onBackToRegion,
      },
      filters: { change: commands.filters.handleFiltersChange, changeSearch: commands.filters.handleSearchChange },
      results: { retry: areaSelectedResults.retry },
    },
    school: {
      zones: {
        selectGroup: (groupId) => urlActions.selectGroup(groupId),
        selectAreaKey: onSelectAreaKey,
        clearScope: () => urlActions.setScope(null),
      },
      schoolsInArea: {
        retry: view.schools.schoolsQuery.refetch,
        // Journey gate (Issue #1157/G9): only area-first delegates school
        // selection to the parent; school-first keeps its internal path.
        select: urlState.journey === 'area-first' ? commands.navigation.journeyCommands.selectSchoolById : undefined,
      },
      selected: {
        changeRadius: commands.navigation.journeyCommands.changeRadius,
        clearSchool: commands.navigation.journeyCommands.clearSchool,
        // Issue #1793 SR-024 — the REAL school-radius query refetch (Retry of the failure block).
        retryListings: commands.geography.refetchSchoolRadiusListings,
        // Issue #1115/G11 — only wired when authenticated.
        boundedSearch: view.interaction.isAuthenticated ? commands.results.handleBoundedSearch : undefined,
      },
      propertyFilters: { replace: commands.filters.handleFiltersChange },
    },
    agri: {
      corridors: {
        retry: commands.agri.refetchRegionalAreaGroups,
        setRegionWithMaxKm: (dir, km) => urlActions.setRegionWithMaxKm(dir, km),
        setMaxKm: (km) => urlActions.setMaxKm(km),
        clearRegionAndMaxKm: () => urlActions.clearRegionAndMaxKm(),
        selectAreaKey: onSelectAreaKey,
      },
      groupListings: {
        retry: commands.agri.refetchAgriGroupListings,
        select: (id) => urlActions.setSelectedListing(id),
        clearGroup: () => urlActions.clearRegionAndMaxKm(),
      },
      locality: {
        set: (locality) => urlActions.setLocality(locality),
        clear: () => urlActions.clearLocality(),
      },
      filters: {
        // Issue #1458 — SECURITY: never write agri price params for anon
        // users even if the UI bypassed its own gate (defense-in-depth
        // alongside AgriFiltersPanel.tsx:126-127). Moved verbatim (G12/M7).
        apply: (filterValues: AgriFilterValues) =>
          urlActions.setFiltersCommitted({
            ...urlState.filters,
            ...filterValues,
            agriPriceMin: view.interaction.isAuthenticated ? filterValues.agriPriceMin : undefined,
            agriPriceMax: view.interaction.isAuthenticated ? filterValues.agriPriceMax : undefined,
            agriLandCategory: filterValues.agriLandCategory ?? null,
            agriFarmhouseAvailable: filterValues.agriFarmhouseAvailable ?? null,
            agriFencingDone: filterValues.agriFencingDone ?? null,
            agriWaterSource: filterValues.agriWaterSource ?? null,
          }),
        clear: () => urlActions.clearAgriFilters(),
      },
      peek: {
        close: () => urlActions.clearSelectedListing(),
        viewDetails: (id) => commands.routing.navigate(`/listing/${id}`),
        clearMarkerSelection: commands.interaction.clearSelectedMarkerListing,
      },
    },
  };
}
