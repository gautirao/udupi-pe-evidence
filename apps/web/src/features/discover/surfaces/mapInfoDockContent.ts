import { CITY_CONFIG } from '@/lib/localityUtils';
import type { DiscoverMapSurfaceView } from '@/features/discover/surfaces/buildMapSurfaceModel';

/**
 * Issue #2748 — Map Info Dock content, derived for the Areas journey only
 * (design PR #2747's `ExpMapInfoDock` renders only when `view.journey ===
 * "areas"`).
 *
 * `where` mirrors the recenter label (`activeAreasNavigationJourney.node
 * ?.displayLabel`) rather than a separately-sourced city label: at the ROOT
 * (city landing) node that label IS the proper-cased city name the backend
 * returns (see buildMapSurfaceModel's `overlays.recenter` doc comment), so
 * using one label for both the count's "across <where>" and the recenter's
 * "Recenter on <where>" keeps them from ever reading two different casings of
 * the same place (the exact bug #2724 characterized).
 *
 * COUNT SOURCE (fixed after lane review, first pass) — `resolvedPanelContent`
 * stays `'area-groups-landing'` (and `isAreaFirstCityLanding` stays true) for
 * a DIRECTION/CLUSTER node the shopper has navigated to but not yet turned
 * into a group/area selection (e.g. `node=d:southeast`): navigating a
 * direction is a pure map-camera affordance in this journey, not a panel-
 * state change. The first pass of this file used that same
 * `isLandingCountBadgeVisible`/`isAreaFirstCityLanding` gate `
 * DiscoverMapCountBadge` uses, which therefore paired the CITY total with the
 * DIRECTION's own label at that node — a real, live-measured regression
 * (worse than main, which at least labelled the city total with the city).
 *
 * The fix branches on the resolved navigation NODE itself, never on panel
 * content: ROOT (or no node yet) uses the city total exactly as before;
 * AREA-selected and group-selected keep their own verbatim copy exactly as
 * before; a DIRECTION/CLUSTER node in between uses
 * `activeAreasNavigationJourney.nodeCount.listingCount` — the SAME
 * server-rolled-up per-node total `useAreasNavigationJourney.ts` computes for
 * "AC3.4 — the panel heading's count" (see that file's `nodeCount` doc) — so
 * the dock's count and the right panel's own heading count can never
 * disagree, and no new query or state owner is introduced.
 */
export interface MapInfoDockContent {
  where: string;
  /** Precomputed count copy, or null when no count is derivable yet (loading / not-yet-resolved). */
  countText: string | null;
  /** True once the current node is a real selected AREA — a listing-capable result scope (design PR #2747 `view.listingCapable`). */
  listingCapable: boolean;
}

export interface DeriveMapInfoDockContentOptions {
  /**
   * Issue #2698 — the SAME condition DiscoverMapCanvas's `hideDuplicateCountBadge`
   * uses (mobile Map overlay + area selected/school-radius, with the mobile Map
   * "Filters" seam wired up): the mobile Map's own results heading already states
   * the count, so the dock's count row would be a space-costing duplicate. Only
   * the count row is suppressed — guidance and recenter are unaffected, matching
   * the original flag's own scope (`hideDrillDownBadge` on the count pill only).
   */
  hideDuplicateCountBadge?: boolean;
}

export function deriveMapInfoDockContent(
  view: DiscoverMapSurfaceView,
  options: DeriveMapInfoDockContentOptions = {},
): MapInfoDockContent | null {
  if (view.navigation.journey !== 'area-first') return null;

  const { navigation, areas, status } = view;
  const cityLabel = CITY_CONFIG[navigation.city]?.label ?? navigation.city;
  const node = navigation.areasNavigationJourney?.node ?? null;
  const where = node?.displayLabel ?? cityLabel;
  // Lane review (pass 3) — `isAreaFirstSelectedAreaState` (DiscoverMapCountBadge's
  // own flag) covers BOTH `resolvedPanelContent === 'area-selected'` AND
  // `'area-groups-landing'` — the latter deliberately, per that flag's own doc
  // comment: a real area can be selected via the navigation-hierarchy `node=`
  // path while the PANEL content still reads `'area-groups-landing'` (a
  // narrower `resolvedPanelContent === 'area-selected'`-only check regressed
  // exactly this — the RR Nagar `node=` fixture state — measured live: the
  // guidance row stayed visible for a selected area). It does NOT cover
  // `area-school-combined` (areaKey AND schoolId both set, reached from the
  // area-selected panel's own "Schools in <area>" widget, which keeps the area
  // selected per its own label) — that state IS additionally reachable in this
  // journey, so it is added on top rather than replacing the original flag.
  const listingCapable =
    (navigation.isAreaFirstSelectedAreaState ||
      (!!areas.selectedArea && navigation.resolvedPanelContent === 'area-school-combined')) &&
    !!areas.selectedArea;

  // Lane review (pass 3) — the badge's own honesty gate: `visible` is false
  // whenever `deriveDiscoverBadge` cannot derive a trustworthy number for the
  // active scope/filters (e.g. cold load, no-area + filters active), and
  // `count == null` covers the still-loading window even when `visible` is
  // true. This is the SAME condition `isDrillDownCountBadgeVisible` checks
  // (`discoverBadge.visible && (discoverBadge.count != null || state ===
  // 'stale')`) — applied here to the stale/area-selected/group-selected
  // branches specifically, since those are the three that read `discoverBadge`
  // or a copy derived alongside it. The ROOT branch below deliberately does
  // NOT use this gate — it reads `cityTotal` directly (its own long-standing
  // `> 0` guard), the same signal `isLandingCountBadgeVisible` uses, never
  // `discoverBadge`. Without this gate, a cold city load whose `discoverBadge`
  // transiently reports `state: 'stale'` rendered "Filtered results", and an
  // area/group still loading its real count rendered a premature "0 verified
  // properties in …" from `areaResultSummaryText`/`groupSelectedBadgeCopy`
  // before either had a real number to report.
  const badge = status.discoverBadge;
  const badgeGateOk = badge.visible && (badge.count != null || badge.state === 'stale');
  // Lane review (pass 3) — `area-group-results` (groupId + the `groupResults=1`
  // "view all results in this zone" URL flag, no areaKey/schoolId — set via a
  // real UI action, discoverLayerRegistry/state/url/area.ts) is a SEPARATE
  // `resolvedPanelContent` from `area-groups-landing`, but both keep the SAME
  // `focusedGroup` (the results view is a drill-in on the same zone, not a
  // different one), so `groupSelectedBadgeCopy` — computed once, page-side, off
  // `focusedGroup` — is equally correct verbatim copy for both.
  const isGroupSelected =
    (navigation.resolvedPanelContent === 'area-groups-landing' ||
      navigation.resolvedPanelContent === 'area-group-results') &&
    !!navigation.focusedGroup &&
    !areas.selectedArea;

  let countText: string | null = null;

  if (badge.state === 'stale') {
    // A property filter narrowed the scope in a way the count contract can't
    // honestly resolve (e.g. authenticated school-radius + filters) — matches
    // DiscoverMapCountBadge's own FIRST check, ahead of every journey branch.
    if (badgeGateOk) countText = 'Filtered results';
  } else if (listingCapable) {
    // AC4 — verbatim, the SAME computed string AreaSelectedPanel's own stat renders.
    if (badgeGateOk) countText = status.areaResultSummaryText;
  } else if (isGroupSelected) {
    if (badgeGateOk) countText = status.groupSelectedBadgeCopy;
  } else if (!node || node.nodeType === 'ROOT') {
    if (status.cityTotal > 0) {
      countText = `Showing ${status.cityTotal.toLocaleString()} verified properties across ${where}`;
    }
  } else {
    // DIRECTION/CLUSTER node — the current node's OWN rolled-up total, not the
    // city's. `nodeCount` is null while counts are still loading; the count
    // row simply doesn't render yet in that case (no stale/city fallback).
    const nodeListingCount = navigation.areasNavigationJourney?.nodeCount?.listingCount;
    if (nodeListingCount != null) {
      countText = `Showing ${nodeListingCount.toLocaleString()} verified properties across ${where}`;
    }
  }

  if (options.hideDuplicateCountBadge) countText = null;

  return { where, countText, listingCapable };
}
