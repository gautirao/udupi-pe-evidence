import { CITY_CONFIG } from '@/lib/localityUtils';
import { DiscoverAreasJourneyPanel } from '@/features/discover/views/DiscoverAreasJourneyPanel';
import { toAreaLeafScopeSource } from '@/features/discover/areas-journey/results/areaLeafResultSources';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { DiscoverJourneyPanelShell } from './DiscoverJourneyPanelShell';
import type {
  DiscoverPanelSurfaceView,
  DiscoverPanelSurfaceCommands,
} from '../buildPanelSurfaceModel';
import type {
  DiscoverActionsContextValue,
  DiscoverNavContextValue,
} from '@/features/discover/context/types';

/**
 * ISP — this renderer declares only the groups/fields it actually reads,
 * down to the individual `nav`/`actions` members it touches (PLAN REVIEW
 * correction 3: no ambient `useDiscoverNav()`/`useDiscoverActions()` read
 * survives in this file — every value arrives as a prop, so the type signature
 * is the whole truth about what this renderer depends on). The full
 * `view`/`commands` objects satisfy this structurally, so the surface still
 * passes references rather than transcribing fields.
 */
export interface AreaFirstJourneyPanelView {
  pageContext: {
    nav: Pick<DiscoverNavContextValue, 'nodeListings' | 'radiusKm'>;
    /** Gates the shell's desktop-only DiscoverControlBar mount (Issue #2108). */
    isMobileShell: boolean;
    /** Single computed source (useDiscoverPageContext) — see DiscoverJourneyPanelShellProps. */
    hostsHeaderControls: boolean;
    /** Single computed source (useDiscoverPageContext) — see DiscoverJourneyPanelShellProps. */
    headerHostsJourneyTabs: boolean;
  };
  routing: Pick<DiscoverPanelSurfaceView['routing'], 'city'>;
  navigation: Pick<
    DiscoverPanelSurfaceView['navigation'],
    'areasNavigationJourney' | 'hoveredNavigationNodeKey' | 'focusedClusterMemberAreaKeys'
  >;
  /**
   * Issue #2353 — the map's ALREADY-FETCHED area-listings (`useDiscoverMapData`,
   * keyed on the SAME `effectiveSelectedArea` bridge this journey's own AREA
   * leaf resolves to), threaded down so `DiscoverAreasJourneyPanel`'s
   * `AreaLeafListingsSurface` can consume it instead of issuing a second,
   * identically-scoped `useDiscoverCityListings` query. See that component's
   * own doc comment for the fallback contract. `selectedArea` is threaded
   * alongside so the surface can verify `areaListings` is actually keyed to
   * the SAME area it resolved (code-review fix — `resolveEffectiveSelectedArea`
   * can diverge from the node-resolved leaf when a URL carries both a legacy
   * `areaKey=` and `node=`; without this check the surface would silently
   * render one area's listings under another area's heading).
   */
  geography: Pick<
    DiscoverPanelSurfaceView['geography'],
    | 'areaListings'
    | 'isLoadingAreaListings'
    | 'isErrorAreaListings'
    | 'selectedArea'
    // Issue #2353 (code-review fix) — the SAME query's isFetching, so the
    // surface can distinguish "showing stale keepPreviousData while a
    // refetch is in flight" from "fully settled" on the prop path.
    | 'isFetchingAreaListings'
    // Issue #2015 — the committed VIEWPORT-scope ("Search this area")
    // listings, mirroring the legacy `DiscoverRightPanel` bridge's own
    // `isAnonViewport`/`isAuthViewport`/`*ViewportListings*` fields (see
    // that component's `isViewportScope` derivation). Without these, this
    // canonical area-first journey has no way to know a VIEWPORT scope is
    // active at all — `mapAreaListings` below stays keyed to the stale
    // AREA_SET leaf even after "Search this area" is clicked.
    | 'isAnonViewport'
    | 'anonViewportListings'
    | 'anonViewportListingsLoading'
    | 'isAuthViewport'
    | 'authViewportListings'
    | 'authViewportListingsLoading'
    // Issue #2461 — the committed-POLYGON (drawn search area) equivalent.
    | 'isPolygonScope'
    | 'polygonListings'
    | 'polygonListingsLoading'
    | 'isErrorPolygonListings'
    | 'refetchPolygonListings'
  >;
  filters: Pick<DiscoverPanelSurfaceView['filters'], 'filters'>;
  schools: DiscoverPanelSurfaceView['schools'];
  results: Pick<DiscoverPanelSurfaceView['results'], 'listingDataLoading'>;
  interaction: Pick<DiscoverPanelSurfaceView['interaction'], 'prefersReducedMotion'>;
}

export interface AreaFirstJourneyPanelCommands {
  pageContext: {
    actions: Pick<
      DiscoverActionsContextValue,
      'clearNodeListings' | 'enterNodeListings' | 'buildNodeHref' | 'enterSchoolPicking'
    >;
  };
  navigation: Pick<
    DiscoverPanelSurfaceCommands['navigation'],
    | 'onNavigationNodeHoverChange'
    | 'onClusterFocusChange'
    | 'onSelectedListingPreviewChange'
    | 'journeyCommands'
    | 'selectJourney'
  >;
  filters: Pick<DiscoverPanelSurfaceCommands['filters'], 'handleFiltersChange'>;
  geography: Pick<
    DiscoverPanelSurfaceCommands['geography'],
    // Issue #2353 (code-review fix) — the SAME query `mapAreaListings` came
    // from, so a Retry click on the prop path is a real refetch, not a no-op.
    'handleAreaFirstBack' | 'refetchAreaListings' | 'handleRedrawPolygon'
  >;
}

export interface AreaFirstJourneyPanelProps {
  view: AreaFirstJourneyPanelView;
  commands: AreaFirstJourneyPanelCommands;
}

/**
 * Issue #2142 SOLID follow-up (commit 2) — the canonical AREA-first journey
 * branch, moved VERBATIM out of `DiscoverPanelSurface.tsx` (every prop
 * expression and doc comment below is the original). The only change is that
 * the shell/switcher markup that used to be inline here now comes from the
 * shared `DiscoverJourneyPanelShell`.
 *
 * Issue #1956 PR 6 (final cutover, RULED A1 MINIMAL, restored by the
 * [rulings.oq_a_v2] rework after the superseded Option A guard) — the
 * canonical Areas journey is the default whenever the user is in the
 * area-first journey, unconditionally; the preview-capability + areasPreview
 * dual gate is removed and no legacy-routing exception survives here.
 * journey-less URLs are NOT additionally defaulted to canonical — that is out
 * of scope (follow-up #2059).
 *
 * A shopper arriving at `journey=area-first` with a stale `groupId`/`areaKey`
 * still in the URL (a hand-edited/bookmarked link, never an in-app click — the
 * click path converts BEFORE ever writing `journey=area-first`) mounts
 * canonical at the city root and ignores the stale params, exactly as A1
 * MINIMAL always specified; see `useDiscoverJourneySwitchController` for the
 * ONLY place `hasLegacyAreaContext` is still consulted.
 */
export function AreaFirstJourneyPanel({ view, commands }: AreaFirstJourneyPanelProps) {
  const { city } = view.routing;
  const { areasNavigationJourney, hoveredNavigationNodeKey, focusedClusterMemberAreaKeys } =
    view.navigation;
  const { areaListings, isLoadingAreaListings, isErrorAreaListings, selectedArea, isFetchingAreaListings } =
    view.geography;
  const { filters } = view.filters;
  const { selectedSchool, schools, schoolsQuery, schoolListings } = view.schools;
  const { listingDataLoading } = view.results;
  const { prefersReducedMotion } = view.interaction;
  const {
    onNavigationNodeHoverChange,
    onClusterFocusChange,
    onSelectedListingPreviewChange,
    journeyCommands,
    selectJourney,
  } = commands.navigation;
  const { handleFiltersChange } = commands.filters;
  const { handleAreaFirstBack, refetchAreaListings, handleRedrawPolygon } = commands.geography;
  // Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — these
  // two were `useDiscoverNav()`/`useDiscoverActions()` calls (the #1953
  // ambient-facade deviation) until this commit. Same objects, same values,
  // now supplied by the assembly layer through `view`/`commands` so this
  // renderer no longer reaches into the Discover context as a service locator.
  const { nav: urlState, isMobileShell, hostsHeaderControls, headerHostsJourneyTabs } = view.pageContext;
  const { actions: urlActions } = commands.pageContext;

  const isAreaFirstCityRoot = areasNavigationJourney.node?.nodeKey === ROOT_NODE_KEY;
  const areaFirstCityLabel = CITY_CONFIG[city]?.label ?? city;
  return (
    <DiscoverJourneyPanelShell
      testId="discover-areas-journey-panel-shell"
      isMobileShell={isMobileShell}
      hostsHeaderControls={hostsHeaderControls}
      headerHostsJourneyTabs={headerHostsJourneyTabs}
      // CQ2 — FULL cards ONLY at the area-first CITY ROOT (the
      // guided-entry analogue); COMPACT tab-strip at every deeper node
      // (Direction/Local-Destination/Area), so the switcher never
      // consumes ~a third of panel height above a listing surface.
      compact={!isAreaFirstCityRoot}
      activeJourney="area-first"
      onSelectJourney={selectJourney}
      cityLabel={areaFirstCityLabel}
      // Issue #2084 ruling 3 / clarification rev 2 — these counts are
      // sourced ONLY from #2083's scoped/canonical
      // `areasNavigationJourney.nodeCount` (server-computed,
      // filter-aware), never the legacy city-wide `cityTotal` /
      // `discoverAreas` fallback the sibling legacy journey's call site
      // still uses. `matchingAreaCount` is filter-aware where the legacy
      // area count was not — with filters active the displayed area count
      // now tracks them.
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
    >
      <DiscoverAreasJourneyPanel
        // Issue #2660 — {view, commands} capability groups (areas-journey/
        // contracts.ts) replacing the former 48 flat props. Every value below
        // is the same reference the flat call passed; only the grouping changed.
        view={{
          hierarchy: {
            // The ONE journey result the map also reads (#2142) — passed by
            // reference; the panel's contract only reads a Pick of it.
            journey: areasNavigationJourney,
            hoveredNodeKey: hoveredNavigationNodeKey,
            isNodeListingsActive: urlState.nodeListings === true,
          },
          cluster: { focusedMemberAreaKeys: focusedClusterMemberAreaKeys },
          results: {
            // Issue #1956 PR-4 FIX CYCLE 3 (blocking Fix B) — the SAME page-local
            // `filters` the map's query reads (not a parallel URL-only copy).
            filters,
            source: {
              // Issue #2353 — the map's already-fetched area listings, used as
              // the leaf's primary data source (no duplicate query). The areaKey
              // they are keyed to lets the leaf verify they belong to the leaf it
              // resolved; `retry` makes its error Retry a real refetch;
              // `fetching` is the keepPreviousData refresh-in-flight signal.
              areaBase: {
                listings: areaListings,
                areaKey: selectedArea?.areaKey ?? null,
                loading: isLoadingAreaListings,
                fetching: isFetchingAreaListings,
                error: isErrorAreaListings,
                retry: refetchAreaListings,
              },
              // Issue #2015 / #2461 — the committed VIEWPORT ("Search this
              // area") / POLYGON scope, converged into one discriminated scope
              // by the typed adapter (anon > auth > polygon, T10).
              scope: toAreaLeafScopeSource(view.geography),
            },
          },
          // Issue #2124 (fix-cycle) — the SAME schools/selectedSchool/
          // schoolListings/radiusKm the legacy `DiscoverRightPanel` bridge
          // receives, never re-fetched, so the two surfaces cannot disagree.
          schools: {
            inArea: {
              data: schools,
              loading: schoolsQuery.isLoading,
              fetching: schoolsQuery.isFetching,
              error: schoolsQuery.isError,
            },
            selected: selectedSchool,
            selectedListings: { data: schoolListings, loading: listingDataLoading },
            radiusKm: urlState.radiusKm,
          },
          city: { label: areaFirstCityLabel },
        }}
        commands={{
          hierarchy: {
            selectNode: areasNavigationJourney.selectNode,
            retry: areasNavigationJourney.refetch,
            hoverNode: onNavigationNodeHoverChange,
          },
          cluster: { changeFocus: onClusterFocusChange },
          results: {
            changeFilters: handleFiltersChange,
            reportSelectedListingPreview: onSelectedListingPreviewChange,
            // Issue #2018 slice 3 — 'Adjust boundary' seam for the POLYGON
            // zero-result row; commits nothing itself.
            redrawPolygon: handleRedrawPolygon,
          },
          schools: {
            // Issue #1956 PR-4 FINAL FIX PASS — the SAME
            // `urlActions.enterSchoolPicking` the legacy bridge wires to its
            // "Add a school in this area" CTA, so the area-first school-picking
            // sub-step (#1157) keeps `journey=area-first` and Back restores the
            // selected area instead of deleting it.
            enterPicking: urlActions.enterSchoolPicking,
            select: journeyCommands.selectSchoolById,
            clear: journeyCommands.clearSchool,
            retry: schoolsQuery.refetch,
            changeRadius: journeyCommands.changeRadius,
            // Issue #2124 — `handleAreaFirstBack`'s 3-rung ladder (schoolId ->
            // backToSchoolPicking; schoolPicking -> clearSchoolPicking; else ->
            // area back), driven purely by URL state.
            back: handleAreaFirstBack,
          },
          navigation: {
            // Issue #1956 PR 2 (Slice 5) — the pure href builder the in-app
            // HierarchyBackButton uses to resolve the canonical parent.
            buildNodeHref: urlActions.buildNodeHref,
            browseListings: urlActions.enterNodeListings,
            clearNodeListings: urlActions.clearNodeListings,
            startOver: journeyCommands.startOver,
          },
        }}
      />
    </DiscoverJourneyPanelShell>
  );
}
