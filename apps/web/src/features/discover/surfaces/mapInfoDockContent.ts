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
  /**
   * Issue #2762 PR-C — uniquely identifies the DEEPEST active scope for this journey. Consumed as
   * `key={scopeKey}` on `<MapInfoDock>` so a scope change forces a REMOUNT rather than a re-render
   * — the mechanism that makes a stale recenter target structurally impossible (not merely hidden
   * by conditional rendering).
   */
  scopeKey: string;
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

/**
 * Issue #2762 PR-C — dispatches to a per-journey deriver, each returning the SAME
 * `MapInfoDockContent` shape. Replaces the single Areas-only gate (`journey !== 'area-first' =>
 * null`) that previously made this file's content Areas-exclusive.
 */
export function deriveMapInfoDockContent(
  view: DiscoverMapSurfaceView,
  options: DeriveMapInfoDockContentOptions = {},
): MapInfoDockContent | null {
  switch (view.navigation.journey) {
    case 'area-first':
      return deriveAreasDock(view, options);
    case 'school-first':
      return deriveSchoolDock(view, options);
    case 'agri-first':
      return deriveAgriDock(view, options);
    default:
      return null;
  }
}

/** Verbatim body of the original (pre-PR-C) `deriveMapInfoDockContent` — no behavior change for
 * the Areas journey, only a `scopeKey` addition (see that field's own doc comment). */
function deriveAreasDock(
  view: DiscoverMapSurfaceView,
  options: DeriveMapInfoDockContentOptions,
): MapInfoDockContent {
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

  // Issue #2762 PR-C — deepest active scope: the resolved node's own identity when one exists
  // (a DIRECTION/AREA/GROUP node all carry a stable `id`), else the resolved panel content at
  // city-root level (ROOT node / no node yet).
  const scopeKey = node ? `areas:node:${node.id}` : `areas:root:${navigation.resolvedPanelContent}`;

  return { scopeKey, where, countText, listingCapable };
}

/**
 * Issue #2762 PR-C — Near-a-school. Browsing state (no school selected yet): "Showing N schools
 * across <context>" / recenter on that context. Selected-school state: "Showing N verified
 * properties near <school>" / recenter on the school. The selected-school listing count reuses
 * `schools.schoolListings` — the SAME array SchoolSelectedPanel's own listings body renders from
 * (`view.selected.listings` in that panel's contract, sourced from this same controller slice) —
 * no new query. The browsing-state count reuses whichever of `schoolFirst*SchoolCount` matches
 * the current depth — the SAME fields SchoolBrowsePanel/SchoolGroupAreasPanel's own headings use.
 */
function deriveSchoolDock(
  view: DiscoverMapSurfaceView,
  options: DeriveMapInfoDockContentOptions,
): MapInfoDockContent {
  const { navigation, schools, areas } = view;
  const cityLabel = CITY_CONFIG[navigation.city]?.label ?? navigation.city;

  if (schools.selectedSchool) {
    const where = schools.selectedSchool.name;
    const count = schools.schoolListings.length;
    let countText: string | null = null;
    if (!options.hideDuplicateCountBadge) {
      countText = `Showing ${count.toLocaleString()} verified ${count === 1 ? 'property' : 'properties'} near ${where}`;
    }
    return {
      scopeKey: `school:selected:${schools.selectedSchool.id}`,
      where,
      countText,
      listingCapable: true,
    };
  }

  // Browsing state — deepest breadcrumb segment (zone/area drilled into) stands in for the
  // current context; falls back to the city at the landing level. `schoolJourneySegments` is the
  // SAME breadcrumb array the school-first breadcrumb trail itself renders from.
  const deepestSegment = navigation.schoolJourneySegments[navigation.schoolJourneySegments.length - 1];
  const where = deepestSegment?.label ?? cityLabel;
  const count =
    schools.schoolFirstZoneSchoolCount ?? schools.schoolFirstAreaSchoolCount ?? schools.schoolFirstLandingSchoolCount;

  let countText: string | null = null;
  if (!options.hideDuplicateCountBadge && count != null) {
    countText = `Showing ${count.toLocaleString()} ${count === 1 ? 'school' : 'schools'} across ${where}`;
  }

  // Issue #2762 PR-C (review fix, MEDIUM) — `where` is the breadcrumb's own display LABEL
  // (`schoolJourneySegments` deepest entry), not enforced unique anywhere in this codebase; two
  // distinct real navigation states that happen to render the same label text would collide on
  // the same scopeKey and skip the remount `scopeKey` exists to force. `DiscoverMapCrumb.key`
  // (schoolJourneySegmentsRaw in useDiscoverMapPresentation.ts) is NOT a usable substitute — it is
  // a fixed per-DEPTH slot tag ('city'/'region'/'zone'/'area'/'school'), identical across every
  // state at that depth, so keying on it would be strictly less discriminating than the label.
  // The real stable identifiers for the two DEEPEST, most collision-prone levels (zone/area — the
  // levels immediately below the region breadcrumb, closest to the listing-capable leaf states
  // Fix 1 covers) are already on this same `view`, one hop away from the breadcrumb: a selected
  // AREA carries `areas.selectedArea.areaKey` and a selected zone/group carries
  // `navigation.focusedGroup.id` — both real backend keys, not display text. Preferring whichever
  // is set keys the two deepest browsing states on stable identity with NO new field/query.
  // RESIDUAL GAP (disclosed, not silently accepted): the 'region' and 'city' depths have no
  // stable id on this surface view today (only `resolvedRegionLabel`/`city`'s own already-stable
  // slug are exposed; the real `regionKey`/`urlState.scope` id lives in
  // useDiscoverMapPresentation.ts's `resolvedScopeKeyForHref`, not threaded onto
  // `DiscoverMapSurfaceView`). Threading it through would mean widening
  // `MapRegionGuideView`/`buildMapSurfaceModel.tsx` — a real (if small) view-model change outside
  // this fix's file allowlist, so it is left as a label-keyed fallback here. `city` itself is
  // effectively closed-vocabulary (CITY_CONFIG-backed slug) so its collision risk is negligible;
  // 'region' is the one genuinely-open-text depth left un-deduplicated by this fix.
  const stableSegmentId = areas?.selectedArea?.areaKey ?? navigation.focusedGroup?.id ?? null;

  return {
    scopeKey: `school:browsing:${navigation.resolvedPanelContent}:${stableSegmentId ?? where}`,
    where,
    countText,
    listingCapable: false,
  };
}

/**
 * Issue #2762 PR-C — Agricultural land. Corridor/village level (no locality drilled into yet):
 * no count row (matches this journey's own corridor-landing state, which shows town/parcel counts
 * per destination bucket, not one aggregate — see AgriGroupSelectedPanel's own summary band for
 * that per-bucket breakdown, which this dock deliberately does not duplicate at this level).
 * Parcel-result level: "Showing N verified agricultural parcels in <context>", counted from
 * `agri.filteredAgriListings` — the SAME filtered marker/listing array this journey's map layer
 * itself renders, so the dock's count can never disagree with what's actually on the map.
 *
 * Issue #2765 — Count source uses the server-computed destinations slice via `useDiscoverAgriController`,
 * guaranteeing perfect consistency with `AgriGroupSelectedPanel` and `AgriGroupLocalityPanel` without adding
 * duplicate query calls to the surface layer.
 */
const BEARING_LABELS: Record<string, string> = {
  n: 'North', N: 'North',
  e: 'East', E: 'East',
  s: 'South', S: 'South',
  w: 'West', W: 'West',
  NE: 'North-east',
  NW: 'North-west',
  SE: 'South-east',
  SW: 'South-west',
};

function deriveAgriDock(
  view: DiscoverMapSurfaceView,
  options: DeriveMapInfoDockContentOptions,
): MapInfoDockContent {
  const { navigation, agri } = view;
  const cityLabel = CITY_CONFIG[navigation.city]?.label ?? navigation.city;
  const regionLabel = agri.selectedRegion ? (BEARING_LABELS[agri.selectedRegion] ?? agri.selectedRegion) : null;
  const where = agri.selectedLocalityName ?? regionLabel ?? cityLabel;

  const isParcelLevel =
    navigation.resolvedPanelContent === 'agri-group-selected' ||
    navigation.resolvedPanelContent === 'agri-group-locality' ||
    navigation.resolvedPanelContent === 'agri-group-peek' ||
    navigation.resolvedPanelContent === 'agri-detail';

  if (!isParcelLevel) {
    return {
      scopeKey: `agri:corridor:${navigation.resolvedPanelContent}:${agri.selectedLocality ?? where}`,
      where,
      countText: null,
      listingCapable: false,
    };
  }

  const count = agri.selectedLocalityCount ?? agri.corridorTotalCount ?? null;
  let countText: string | null = null;
  if (!options.hideDuplicateCountBadge && count != null) {
    countText = `Showing ${count.toLocaleString()} verified agricultural ${count === 1 ? 'parcel' : 'parcels'} in ${where}`;
  }

  return {
    scopeKey: `agri:parcel:${navigation.resolvedPanelContent}:${agri.selectedLocality ?? where}`,
    where,
    countText,
    listingCapable: true,
  };
}
