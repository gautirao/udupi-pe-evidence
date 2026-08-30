import { CITY_CONFIG } from '@/lib/localityUtils';
import { DiscoverAreasJourneyPanel } from '@/features/discover/views/DiscoverAreasJourneyPanel';
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
    'handleAreaFirstBack' | 'refetchAreaListings'
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
  const {
    areaListings,
    isLoadingAreaListings,
    isErrorAreaListings,
    selectedArea,
    isFetchingAreaListings,
  } = view.geography;
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
  const { handleAreaFirstBack, refetchAreaListings } = commands.geography;
  // Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — these
  // two were `useDiscoverNav()`/`useDiscoverActions()` calls (the #1953
  // ambient-facade deviation) until this commit. Same objects, same values,
  // now supplied by the assembly layer through `view`/`commands` so this
  // renderer no longer reaches into the Discover context as a service locator.
  const { nav: urlState, isMobileShell } = view.pageContext;
  const { actions: urlActions } = commands.pageContext;

  const isAreaFirstCityRoot = areasNavigationJourney.node?.nodeKey === ROOT_NODE_KEY;
  const areaFirstCityLabel = CITY_CONFIG[city]?.label ?? city;
  return (
    <DiscoverJourneyPanelShell
      testId="discover-areas-journey-panel-shell"
      isMobileShell={isMobileShell}
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
        // `filters`/`handleFiltersChange` the legacy `DiscoverRightPanel` bridge
        // receives, so an AREA-leaf chip toggle writes into the identical
        // page-local filters state the map's query reads, instead of a parallel
        // URL-only write.
        areaLeafFilters={filters}
        onAreaLeafFiltersChange={handleFiltersChange}
        // Issue #2353 — the map's already-fetched area listings (keyed on the
        // same effective AREA-leaf bridge), used as the primary data source by
        // AreaLeafListingsSurface so it no longer issues its own duplicate
        // useDiscoverCityListings query. `mapAreaListingsAreaKey` lets the
        // surface verify the listings are actually keyed to the leaf it
        // resolved (code-review fix) before trusting them; `mapAreaListingsRefetch`
        // makes the surface's error-state Retry button a real refetch.
        // `mapAreaListingsFetching` (code-review fix) — the SAME query's
        // isFetching, so the surface can surface a `keepPreviousData`
        // refresh-in-flight state (stale cards + new fetch pending, e.g. a
        // filter/search rekey) instead of presenting it as fully settled.
        mapAreaListings={areaListings}
        mapAreaListingsLoading={isLoadingAreaListings}
        mapAreaListingsError={isErrorAreaListings}
        mapAreaListingsFetching={isFetchingAreaListings}
        mapAreaListingsAreaKey={selectedArea?.areaKey ?? null}
        mapAreaListingsRefetch={refetchAreaListings}
        // Issue #1956 PR-4 FINAL FIX PASS (regression fix) — the canonical
        // AREA-leaf surface silently dropped the "Add a school in this
        // area" CTA because this call site never supplied `onAddSchool`
        // (the prop is optional on both `DiscoverAreasJourneyPanel` and
        // `AreaSelectedPanel`, so the omission compiled but the button just
        // never rendered). `urlActions` is already the SAME
        // `useDiscoverActions()` facade result the legacy `DiscoverRightPanel`
        // bridge uses for its own `onAddSchool={urlActions.enterSchoolPicking}`
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
        // legacy `DiscoverRightPanel` bridge for the identical panels —
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
    </DiscoverJourneyPanelShell>
  );
}
