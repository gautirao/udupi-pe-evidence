import type { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import type { useDiscoverNavigationController } from '@/features/discover/controllers/useDiscoverNavigationController';
import type { useDiscoverAreaGroupsController } from '@/features/discover/controllers/useDiscoverAreaGroupsController';
import type { useDiscoverAgriController } from '@/features/discover/controllers/useDiscoverAgriController';
import type { useDiscoverResultsController } from '@/features/discover/controllers/useDiscoverResultsController';
import type { useDiscoverBoundedBrowseController } from '@/features/discover/controllers/useDiscoverBoundedBrowseController';
import type { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';
import type { useBoundedSearchTrigger } from '@/features/discover/controllers/useBoundedSearchTrigger';
import type { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import type { useDiscoverViewportTracker } from '@/features/discover/controllers/useDiscoverViewportTracker';
import type { useDiscoverViewportSearch } from '@/features/discover/controllers/useDiscoverViewportSearch';
import type { useDiscoverGeographyController } from '@/features/discover/controllers/useDiscoverGeographyController';
import type { useDiscoverMapDataController } from '@/features/discover/controllers/useDiscoverMapDataController';
import type { useDiscoverSchoolController } from '@/features/discover/controllers/useDiscoverSchoolController';
import type { useDiscoverBadgeController } from '@/features/discover/controllers/useDiscoverBadgeController';
import type { useDiscoverJourneyChromeController } from '@/features/discover/controllers/useDiscoverJourneyChromeController';
import type { useDiscoverFilterChromeController } from '@/features/discover/controllers/useDiscoverFilterChromeController';
import type { useDiscoverInteractionController } from '@/features/discover/controllers/useDiscoverInteractionController';
import type { useDiscoverCameraController } from '@/features/discover/controllers/useDiscoverCameraController';
import type { useDiscoverMapLayerController } from '@/features/discover/controllers/useDiscoverMapLayerController';
import type { useDiscoverRegionGuideController } from '@/features/discover/controllers/useDiscoverRegionGuideController';
import type { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';
import type { useDiscoverJourneySwitchController } from '@/features/discover/controllers/useDiscoverJourneySwitchController';
import type { useDiscoverMarkerPopoverController } from '@/features/discover/controllers/useDiscoverMarkerPopoverController';
import type { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';
import type { useNearSchoolSheetState } from '@/features/discover/controllers/useNearSchoolSheetState';
import { buildMapSurfaceModel, buildMapSurfaceCommands } from '@/features/discover/surfaces/buildMapSurfaceModel';
import { buildPanelSurfaceModel, buildPanelSurfaceCommands } from '@/features/discover/surfaces/buildPanelSurfaceModel';
import { buildOverlaySurfaceModel, buildOverlaySurfaceCommands } from '@/features/discover/surfaces/buildOverlaySurfaceModel';
import type { DiscoverMapSurfaceView, DiscoverMapSurfaceCommands } from '@/features/discover/surfaces/buildMapSurfaceModel';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from '@/features/discover/surfaces/buildPanelSurfaceModel';
import type { DiscoverOverlaySurfaceView, DiscoverOverlaySurfaceCommands } from '@/features/discover/surfaces/buildOverlaySurfaceModel';

/**
 * Issue #2142 SOLID follow-up (commit 3) — the composition hook's TAIL, lifted
 * out verbatim.
 *
 * `useDiscoverPageComposition` had two jobs bolted together: calling the ~23
 * capability controllers in dependency order (its actual reason to exist), and
 * then assembling the three `mapProps`/`panelProps`/`overlayProps` literals and
 * running the six surface builders over them. The second job is pure, hook-free
 * object assembly — it reads nothing but the controller results and returns the
 * six surface objects — so it does not belong in a React hook at all. It lives
 * here now, as a plain function over a typed registry.
 *
 * WHAT DID NOT CHANGE. Every field of the three prop literals below, and the
 * order the six builders run in, is byte-identical to what the composition hook
 * held. This is a move, not a rewrite: no product behaviour, URL write, or
 * rendered markup changes.
 */

/**
 * Every controller instance (plus the handful of page-context-derived locals
 * the three prop literals reference directly rather than via a controller) that
 * the surface assembly reads.
 *
 * The controller results are carried as WHOLE objects, exactly as the
 * composition hook passed them: the surface builders' own `Pick`-derived param
 * types are what narrow them, so this registry stays a straight restatement of
 * "which controllers feed the surfaces" and can never drift from their outputs.
 */
export interface DiscoverControllerRegistry {
  pageContextController: ReturnType<typeof useDiscoverPageContext>;
  navigationController: ReturnType<typeof useDiscoverNavigationController>;
  areaGroupsController: ReturnType<typeof useDiscoverAreaGroupsController>;
  agriController: ReturnType<typeof useDiscoverAgriController>;
  resultsController: ReturnType<typeof useDiscoverResultsController>;
  boundedBrowseController: ReturnType<typeof useDiscoverBoundedBrowseController>;
  nearSchoolSheetState: ReturnType<typeof useNearSchoolSheetState>;
  markerController: ReturnType<typeof useDiscoverMarkerController>;
  boundedSearchController: ReturnType<typeof useBoundedSearchTrigger>;
  pageStateController: ReturnType<typeof useDiscoverPageStateController>;
  viewportTrackerController: ReturnType<typeof useDiscoverViewportTracker>;
  /** Issue #2015 — "Search this area" CTA dirty-detection + activation (AC1/AC2). */
  viewportSearchController: ReturnType<typeof useDiscoverViewportSearch>;
  geographyController: ReturnType<typeof useDiscoverGeographyController>;
  mapDataController: ReturnType<typeof useDiscoverMapDataController>;
  schoolController: ReturnType<typeof useDiscoverSchoolController>;
  badgeController: ReturnType<typeof useDiscoverBadgeController>;
  journeyChromeController: ReturnType<typeof useDiscoverJourneyChromeController>;
  filterChromeController: ReturnType<typeof useDiscoverFilterChromeController>;
  interactionController: ReturnType<typeof useDiscoverInteractionController>;
  cameraController: ReturnType<typeof useDiscoverCameraController>;
  mapLayerController: ReturnType<typeof useDiscoverMapLayerController>;
  regionGuideController: ReturnType<typeof useDiscoverRegionGuideController>;
  overviewNavigationController: ReturnType<typeof useDiscoverOverviewNavigationController>;
  journeySwitchController: ReturnType<typeof useDiscoverJourneySwitchController>;
  markerPopoverController: ReturnType<typeof useDiscoverMarkerPopoverController>;
  mobilePresentationController: ReturnType<typeof useDiscoverMobilePresentationController>;
}

export interface DiscoverSurfaceProps {
  mapView: DiscoverMapSurfaceView;
  mapCommands: DiscoverMapSurfaceCommands;
  panelView: DiscoverPanelSurfaceView;
  panelCommands: DiscoverPanelSurfaceCommands;
  overlayView: DiscoverOverlaySurfaceView;
  overlayCommands: DiscoverOverlaySurfaceCommands;
}

export function assembleDiscoverSurfaceProps(
  registry: DiscoverControllerRegistry,
): DiscoverSurfaceProps {
  const {
    pageContextController,
    navigationController,
    areaGroupsController,
    agriController,
    resultsController,
    boundedBrowseController,
    nearSchoolSheetState,
    markerController,
    boundedSearchController,
    pageStateController,
    viewportTrackerController,
    viewportSearchController,
    geographyController,
    mapDataController,
    schoolController,
    badgeController,
    journeyChromeController,
    filterChromeController,
    interactionController,
    cameraController,
    mapLayerController,
    regionGuideController,
    overviewNavigationController,
    journeySwitchController,
    markerPopoverController,
    mobilePresentationController,
  } = registry;

  // The flat values the three literals below reference directly rather than
  // through a controller result object. Every one of them is a member of a
  // controller this registry already carries — destructured here for the same
  // reason the composition hook destructured them: the literals name them flat.
  const {
    nav,
    actions,
    isAgriJourney,
    mapContainerRef,
    mobileMapOpen,
    setMobileView,
  } = pageContextController;
  const { isGroupResultsState } = resultsController;
  const { isNodeListingsState } = boundedBrowseController;
  const { activeAreasNavigationJourney } = overviewNavigationController;
  const { publishClusterCameraIntent } = mapDataController;
  const { isMarkerPopoverEligible } = markerPopoverController;
  const { nearSchoolOpen, setNearSchoolOpen } = nearSchoolSheetState;
  const { journeyCommands, handleBoardFilterChange } = schoolController;
  const {
    filters,
    handleFiltersChange,
    schoolBoardFilter,
    selectedSchool,
    isCityValid,
    city,
  } = pageStateController;

  // The map surface's input is the CONTROLLERS' OWN result objects. Only
  // the genuinely surface-only values stay flat: the container ref, the
  // mobile-shell pair the surface's own derivations need, the two
  // bounded-Browse scope booleans it ORs together, the active journey, and
  // the two commands that are plain action references.
  const mapProps = {
    mapContainerRef,
    mobileMapOpen,
    setMobileView,
    isMarkerPopoverEligible,
    isGroupResultsState,
    isNodeListingsState,
    activeAreasNavigationJourney,
    navJourney: nav.journey,
    // Issue #2628 (code review follow-up) — the applied Buy/Rent intent.
    // `DiscoverMapCanvas`'s `intent` prop defaults to `'buy'` and nothing
    // supplied a real value here, so the mobile Map's results heading/
    // summary copy and `MapFilterSheet`'s own Buy/Rent selector silently
    // ignored a Rent navigation. `nav.intent` is the same source
    // `DiscoverControlBar.tsx`, `DiscoverAreasJourneyPanel.tsx`, and
    // `NodeListingsSurface.tsx` already use for this exact prop.
    intent: nav.intent,
    buildNavigationNodeHref: actions.buildNodeHref,
    onAreaVisualClusterCameraIntent: publishClusterCameraIntent,
    clearSelectedListing: actions.clearSelectedListing,
    // Issue #2628 — the ONE canonical filter-write command (buildMapSurfaceCommands'
    // own `handleFiltersChange` param doc: "Deliberately OPTIONAL and a flat top-level
    // param... Until the composition root passes it through, the Map 'Filters'
    // pill/sheet stay mounted but inert"). `handleFiltersChange` is already in scope
    // here (destructured from `pageStateController` above, the same value
    // `overlayProps` already forwards for the Filters Sheet) — this was the one
    // missing wire: without it, `DiscoverMapCanvas`'s `onFiltersChange` prop stayed
    // undefined and the mobile Map "Filters" pill never mounted, live-verified (DOM
    // query for `map-filters-pill` absent despite the mobile Map overlay itself being
    // genuinely open) even though every other link in the chain was correctly wired.
    handleFiltersChange,
    pageContextController,
    pageStateController,
    mapDataController,
    areaGroupsController,
    geographyController,
    badgeController,
    journeyChromeController,
    markerPopoverController,
    navigationController,
    agriController,
    schoolController,
    interactionController,
    cameraController,
    mapLayerController,
    regionGuideController,
    overviewNavigationController,
    mobilePresentationController,
    viewportTrackerController,
    viewportSearchController,
    markerController,
  };
  const mapView = buildMapSurfaceModel(mapProps);
  const mapCommands = buildMapSurfaceCommands(mapProps);

  // The panel surface's input is the CONTROLLERS' OWN result objects, not a
  // flat literal transcribed here and re-grouped by the builders. Renames
  // and derivations (effectiveSelectedArea -> selectedArea,
  // regionScopedGroupsData?.groups -> regionScopedGroups, the three
  // lifted-state setters -> their on* callback names) are the BUILDER's
  // job, so this stays reference-passing only.
  const panelProps = {
    pageContext: pageContextController,
    pageState: pageStateController,
    navigation: navigationController,
    journeySwitch: journeySwitchController,
    overviewNavigation: overviewNavigationController,
    areaGroups: areaGroupsController,
    geography: geographyController,
    mapData: mapDataController,
    agri: agriController,
    results: resultsController,
    school: schoolController,
    badge: badgeController,
    journeyChrome: journeyChromeController,
    filterChrome: filterChromeController,
    interaction: interactionController,
    regionGuide: regionGuideController,
    mapLayer: mapLayerController,
    boundedBrowse: boundedBrowseController,
    boundedSearch: boundedSearchController,
    marker: markerController,
    mobilePresentation: mobilePresentationController,
  };
  const panelView = buildPanelSurfaceModel(panelProps);
  const panelCommands = buildPanelSurfaceCommands(panelProps);

  const overlayProps = {
    isAgriJourney,
    nearSchoolOpen,
    setNearSchoolOpen,
    selectedSchool,
    journeyCommands,
    filters,
    handleFiltersChange,
    schoolBoardFilter,
    handleBoardFilterChange,
    isCityValid,
    city,
  };
  const overlayView = buildOverlaySurfaceModel(overlayProps);
  const overlayCommands = buildOverlaySurfaceCommands(overlayProps);

  return { mapView, mapCommands, panelView, panelCommands, overlayView, overlayCommands };
}
