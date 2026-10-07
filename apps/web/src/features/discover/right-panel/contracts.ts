/**
 * Issue #2657 — the right panel's per-journey `{view, commands}` component
 * contracts (architect plan §2). Code-review Finding 2 (R2) — field types are
 * now indexed off the AUTHORITATIVE runtime model instead of the deleted
 * flat prop bag:
 *
 *   - A direct passthrough field (the vast majority) is typed off
 *     `DiscoverPanelSurfaceView`/`DiscoverPanelSurfaceCommands`
 *     (surfaces/buildPanelSurfaceModel.ts) — the SAME controller-derived
 *     model `buildRightPanelView`/`buildRightPanelCommands`
 *     (surfaces/panel/rightPanelContract.ts) read to build this exact field,
 *     confirmed against that file's return statement field-by-field.
 *   - A field DERIVED by a selector (regionName, the area results slice,
 *     the region-guide helper text) is typed off that selector's
 *     `ReturnType`, imported `import type` so the reference is erased at
 *     compile time and cannot drift silently — a selector signature change
 *     is a compile error here.
 *   - A field built by an inline closure/object literal with NO faithful
 *     1:1 controller/selector source (a fixed-argument wrapper, an
 *     id→URL transform, the agri price-strip security gate) gets a small
 *     named function/primitive type in this file, each with an inline
 *     justification comment — see the list below.
 *   - `AgriFilterValues` and `SchoolQueryState<SchoolResult[] | undefined>`
 *     are used directly (not re-derived) since they are already the
 *     correct, narrow, owner-defined shapes for those two fields.
 *
 * Every nested group holds AT MOST 6 fields (rightPanelContractBudget.guard
 * enforces this from this file's own source, covering every group it finds —
 * not a sample). This is the binding #2657 directive: success is not
 * "replace 148 props with one mega `view`" — the largest nested group must
 * stay narrow too.
 *
 * DRP still builds these slices from its own flat props (C4–C7); the public
 * contract only flips to `{view, commands}` at C8. R2 removes the LAST
 * dependency on the deleted flat shape: `LegacyFlatRightPanelProps` now
 * lives ONLY in `right-panel/testing/flatPropsRightPanel.ts` (the test-only
 * adapter for the pre-C8-shaped `DiscoverRightPanel.*.test.tsx` fixtures);
 * this file, and every production journey-panel file, no longer imports
 * `@/components/discover/DiscoverRightPanel` at all — enforced by
 * `__tests__/legacyFlatPropsConfinement.guard.test.ts`.
 */
import type { ReactNode } from 'react';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from '../surfaces/buildPanelSurfaceModel';
import type { RightPanelViewExtras } from '../surfaces/panel/rightPanelContract';
import type { resolveAreaRegionName } from '../selectors/areaRegionName';
import type { resolveAreaSelectedResults } from '../selectors/areaSelectedResults';
import type { buildRegionGuideHelperText } from '../selectors/regionGuideHelperText';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';
import type { SchoolQueryState } from '@/components/discover/panels/schools/shared/schoolJourneyContracts';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { AnonViewportListingItem } from '@/lib/anonViewportListing';

type SurfaceView = DiscoverPanelSurfaceView;
type SurfaceCommands = DiscoverPanelSurfaceCommands;
type NavView = SurfaceView['pageContext']['nav'];
type Actions = SurfaceCommands['pageContext']['actions'];

// ── Fields with no faithful 1:1 controller/selector source (justified) ─────
//
// Every one of these builds its value with a fixed argument, a lookup, or a
// transform the target controller/action does not itself perform — so
// indexing off a single `Surface*['group']['field']` would either not exist
// or would misdescribe the runtime signature. Traced against
// surfaces/panel/rightPanelContract.ts's `buildRightPanelView`/
// `buildRightPanelCommands` bodies field-by-field.
/** frame.counts.areasCount — `discoverAreas.filter(...).length`, a plain computed count. */
type AreasCount = number;
/** shared.cards.hoveredListingId — always the literal `null` pre-C8 too; matches AreaSelectedPanel.tsx's own `hoveredListingId?: string | null` leaf prop. */
type HoveredListingId = string | null;
/** shared.cards.select — deliberately unwired (map marker drives selection, not the card); matches AreaSelectedPanel.tsx / DiscoverRightPanel.tsx's own `onSelectResultListing?: (id: string) => void` leaf prop. */
type SelectResultListing = ((id: string) => void) | undefined;
/** agri.groupListings.truncated — `agriMapListingsData?.truncated ?? false`, a defaulted boolean. */
type GroupListingsTruncated = boolean;
/** shared.chrome.back — ternary between the school-first journeyView's onBack and the area-first geography command; a real union of two authoritative sources, not a single field. */
type ChromeBack = SurfaceView['navigation']['journeyView']['schoolFirstOnBack'] | SurfaceCommands['geography']['handleAreaFirstBack'];
/** area.navigation.crumbCity — `() => urlActions.selectGroup(null)`: fixed-argument wrapper around `actions.selectGroup`, not a faithful passthrough of its `(groupId: string | null) => void` signature. */
type CrumbCity = () => void;
/** area.navigation.crumbRegion — `onBackToRegion`: looks up the target scope key by label against `summaryRegions` before writing; not a passthrough of any single action. */
type CrumbRegion = (regionLabel: string) => void;
/** school.zones.selectAreaKey / agri.corridors.selectAreaKey — `onSelectAreaKey`: SAME shared closure (tries `handleAreaSelect` by areaKey, falls back to `goToNodeAndClearSchoolSelection` by resolving a node), not a passthrough of either alone. */
type SelectAreaKey = (areaKey: string) => void;
/** school.zones.clearScope — `() => urlActions.setScope(null)`: fixed-argument wrapper around `actions.setScope`'s `(scope: string | null) => void` signature. */
type ClearScope = () => void;
/** entry.landing.armRegionSelect — `() => commands.geography.armRegionSelect('panel')`: fixed-argument wrapper (panel-origin literal) around the surface command. */
type ArmRegionSelectFromPanel = () => void;
/** agri.groupListings.select / agri.peek.viewDetails — id→URL navigation transform (`navigate(\`/listing/${id}\`)`), not a passthrough of `routing.navigate`. */
type NavigateToListing = (id: string) => void;
/** agri.filters.apply — `AgriFilterValues` → `setFiltersCommitted` with the anon agri-price SECURITY gate (Issue #1458, defense-in-depth alongside AgriFiltersPanel.tsx:126-127) folded in; not a faithful passthrough. */
type ApplyAgriFilters = (filterValues: AgriFilterValues) => void;
/**
 * school.schoolsInArea.retry / agri.groupListings.retry — the surface field
 * is a RAW TanStack Query `refetch` (`(options?) => Promise<QueryObserverResult<T>>`),
 * but every leaf that consumes it (SchoolsInAreaPanelCommands['schools']['retry'],
 * AgriGroupSelectedPanel's `onRetry`) declares its own prop as a plain
 * `() => void` — the return value is never read. Typing the contract field
 * off the raw refetch signature is technically faithful to the surface but
 * OVER-constrains it relative to what any consumer needs, and (found during
 * this retyping) breaks the test adapter's simpler `() => void` fixtures,
 * which is a real signal the field was mistyped, not a papering-over cast.
 */
type RetryCallback = () => void;
/**
 * `resolveAreaSelectedResults` (selectors/areaSelectedResults.ts) is generic
 * over `<TAreaListing, TAnonListing, TRetry>`; `ReturnType<typeof fn>` with no
 * type arguments resolves every generic to `unknown`. Instantiated here with
 * the SAME concrete types `buildRightPanelView`/`buildRightPanelCommands`
 * actually pass at the call site (`DiscoverPanelSurfaceView['geography']`'s
 * `areaListings: DiscoverCityListingItem[]` / `anonViewportListings:
 * AnonViewportListingItem[]`) and the plain `() => void` retry shape
 * `AreaSelectedPanel`'s own `listings.retry?: () => void` leaf prop expects.
 */
type AreaSelectedResults = ReturnType<
  typeof resolveAreaSelectedResults<DiscoverCityListingItem, AnonViewportListingItem, RetryCallback>
>;
/**
 * agri.selection.region — the surface field
 * (`DiscoverPanelSurfaceView['agri']['selectedRegion']`) is the real bearing
 * literal union (`'N' | 'NE' | ... | null`), but CorridorLandingPanel.tsx's
 * own `selectedRegion: string | null` prop (and AgriGroupSelectedPanel's
 * `directionCode`) deliberately accept ANY string — they render a graceful
 * fallback for an unrecognised code rather than narrowing at the leaf, and
 * several `DiscoverRightPanel.*.test.tsx` fixtures exercise exactly that
 * (invalid codes like `"XX"`/`"NORTH"`). Typed off the leaf's own looser
 * prop, per the finding's guidance, instead of the surface's narrower field.
 */
type AgriSelectedRegion = string | null;

// ── Frame (no commands group — the frame only renders, it never writes) ─────

export interface RightPanelFrameLayoutView {
  panelContent: SurfaceView['navigation']['resolvedPanelContent'];
  isMobileShell: SurfaceView['pageContext']['isMobileShell'];
  /** Single computed source (useDiscoverPageContext) — never re-derived per consumer, so header/panel never transiently disagree mid-resize. */
  hostsHeaderControls: SurfaceView['pageContext']['hostsHeaderControls'];
  /** Single computed source (useDiscoverPageContext) — whether the header actually RENDERS journey tabs (`hostsHeaderControls` minus an unresolved admin preview). Gates the panel's JourneySwitcher/JourneySummaryStrip so exactly one journey selector always exists. */
  headerHostsJourneyTabs: SurfaceView['pageContext']['headerHostsJourneyTabs'];
  footer: RightPanelViewExtras['footer'];
}

export interface RightPanelFrameCountsView {
  totalProperties: SurfaceView['routing']['cityTotal'];
  areasCount: AreasCount;
}

export interface RightPanelFrameRegionGuideView {
  ringActive: SurfaceView['regionGuide']['regionGuideRingActive'];
  markerKind: SurfaceView['regionGuide']['regionOverviewMarkerKind'];
  nonce: SurfaceView['regionGuide']['regionSelectNonce'];
  prefersReducedMotion: SurfaceView['interaction']['prefersReducedMotion'];
  helperText: ReturnType<typeof buildRegionGuideHelperText>;
}

export interface RightPanelFrameView {
  layout: RightPanelFrameLayoutView;
  counts: RightPanelFrameCountsView;
  regionGuide: RightPanelFrameRegionGuideView;
}

// ── Shared (context/chrome/area/cards/refresh read across every journey) ────

export interface SharedContextView {
  city: SurfaceView['routing']['city'];
  cityLabel: RightPanelViewExtras['cityLabel'];
  journey: NavView['journey'];
  intent: NavView['intent'];
  isAuthenticated: SurfaceView['interaction']['isAuthenticated'];
}

export interface SharedChromeView {
  activeContextChips: SurfaceView['interaction']['activeContextChips'];
  filtersContent: SurfaceView['filters']['filtersContent'];
}

export interface SharedAreaView {
  point: SurfaceView['geography']['selectedArea'];
  urlAreaKey: NavView['areaKey'];
  isLoading: SurfaceView['geography']['areasLoading'];
}

export interface SharedCardsView {
  selectedListingId: NavView['selectedListing'];
  hoveredListingId: HoveredListingId;
}

export interface SharedRefreshView {
  isFetching: SurfaceView['results']['isFetching'];
  /**
   * Issue #1793 PR-C — the school-radius card source's own "settled" signal (loaded, not failed, not a
   * keepPreviousData placeholder; NOT `isFetching`, which is also true for a same-key background
   * refetch) and the anonymous page-cap flag. They live here rather than on `SchoolSelectedView`,
   * which is already at the per-group ceiling (rightPanelContractBudget.guard.test.ts). Optional
   * (additive): absent reads as "not settled", so the "Request a property" card never shows without them.
   */
  schoolRadiusSettled?: SurfaceView['schools']['schoolRadiusPanelSettled'];
  schoolRadiusHasMore?: SurfaceView['schools']['schoolRadiusHasMore'];
  isInitialLoading: SurfaceView['results']['isLoading'];
}

export interface RightPanelSharedView {
  context: SharedContextView;
  chrome: SharedChromeView;
  area: SharedAreaView;
  cards: SharedCardsView;
  refresh: SharedRefreshView;
}

export interface SharedChromeCommands {
  startOver: SurfaceCommands['navigation']['journeyCommands']['startOver'];
  back: ChromeBack;
  selectJourney: SurfaceCommands['navigation']['selectJourney'];
}

export interface SharedCardsCommands {
  select: SelectResultListing;
  hover: SurfaceCommands['interaction']['interactionCommands']['hoverListing'];
}

export interface SharedMarketCommands {
  changeCity: SurfaceCommands['routing']['handleCityChange'];
  changeIntent: Actions['setIntent'];
}

export interface RightPanelSharedCommands {
  chrome: SharedChromeCommands;
  cards: SharedCardsCommands;
  market: SharedMarketCommands;
}

// ── Entry (guided-entry landing + anon "Search this area" viewport list) ────

export interface EntryLandingView {
  isCityEmpty: SurfaceView['routing']['cityHasNoListings'];
}

export interface EntryAnonViewportView {
  active: SurfaceView['geography']['isAnonViewport'];
  listings: SurfaceView['geography']['anonViewportListings'];
  loading: SurfaceView['geography']['anonViewportListingsLoading'];
  error: SurfaceView['geography']['isErrorAnonViewport'];
}

export interface RightPanelEntryView {
  landing: EntryLandingView;
  anonViewport: EntryAnonViewportView;
}

export interface EntryLandingCommands {
  armRegionSelect: ArmRegionSelectFromPanel;
}

export interface EntryAnonViewportCommands {
  retry: SurfaceCommands['geography']['refetchAnonViewport'];
}

export interface RightPanelEntryCommands {
  landing: EntryLandingCommands;
  anonViewport: EntryAnonViewportCommands;
}

// ── Area (area-selected + hydration states) ──────────────────────────────────

export interface AreaSelectionView {
  groupName: SurfaceView['geography']['selectedGroupName'];
  /** Display-only region label (order: scope → summaryRegions → prettified slug). Not a raw prop — see selectors/areaRegionName.ts (C1). */
  regionName: ReturnType<typeof resolveAreaRegionName>;
  isDraftOpen: SurfaceView['pageContext']['isAreaSetDraftOpen'];
}

export interface AreaResultsView {
  listings: AreaSelectedResults['listings'];
  summaryText: AreaSelectedResults['summaryText'];
  isLoading: AreaSelectedResults['isLoading'];
  isError: AreaSelectedResults['isError'];
  /** True when the committed result source is an anon/auth VIEWPORT or a POLYGON scope, not the AREA_SET default. */
  isViewportScope: AreaSelectedResults['isViewportScope'];
  /**
   * Issue #2795 — the active scope's own query settled (loaded, not failed, not a keepPreviousData
   * placeholder). Optional (additive): absent reads as "not settled", so the legacy `?areaKey=` route
   * fails closed (no "Request a property" card) for any producer that does not supply it.
   */
  settled?: AreaSelectedResults['settled'];
}

export interface AreaFiltersView {
  filters: SurfaceView['filters']['filters'];
  searchQuery: SurfaceView['filters']['searchQuery'];
  trendsHref: SurfaceView['routing']['trendsHref'];
}

export interface RightPanelAreaView {
  selection: AreaSelectionView;
  results: AreaResultsView;
  filters: AreaFiltersView;
}

export interface AreaNavigationCommands {
  addSchool: Actions['enterSchoolPicking'];
  /**
   * Issue #2657 R2 — post-C8, `crumbCity` is built by `buildRightPanelCommands`
   * as `() => urlActions.selectGroup(null)` (surfaces/panel/rightPanelContract.ts),
   * not a passthrough of a DiscoverRightPanel prop any more — see `CrumbCity`.
   */
  crumbCity: CrumbCity;
  crumbRegion: CrumbRegion;
}

export interface AreaFiltersCommands {
  change: SurfaceCommands['filters']['handleFiltersChange'];
  changeSearch: SurfaceCommands['filters']['handleSearchChange'];
}

export interface AreaResultsCommands {
  retry: AreaSelectedResults['retry'];
}

export interface RightPanelAreaCommands {
  navigation: AreaNavigationCommands;
  filters: AreaFiltersCommands;
  results: AreaResultsCommands;
}

// ── School (#2742 leaves stay; this is only the routing-level slice) ────────

export interface SchoolZonesView {
  groups: NonNullable<SurfaceView['geography']['areaGroupsData']>['groups'];
  loading: SurfaceView['geography']['isLoadingAreaGroups'];
  discoverAreas: SurfaceView['geography']['discoverAreasForPanel'];
  groupId: NavView['groupId'] | null;
}

export interface SchoolScopeView {
  key: NavView['scope'] | null;
  summaryRegions: SurfaceView['geography']['summaryRegions'];
}

export interface SchoolHomesView {
  /**
   * Issue #2657 C5 correction: the "Homes in area" footer inside
   * SchoolsInAreaPanel reads the AREA listings feed (`areaListings` /
   * `isLoadingListings`), not the school-radius `schoolListings` feed used by
   * `selected.listings` below — confirmed against
   * SchoolsInAreaWithHomesPanel.tsx's own `homes` prop and the live DRP
   * `schools-in-area` render site.
   */
  data: SurfaceView['geography']['areaListings'];
  loading: SurfaceView['geography']['isLoadingAreaListings'];
}

export interface SchoolSelectedView {
  school: SurfaceView['schools']['selectedSchool'];
  radiusKm: NavView['radiusKm'];
  listings: SurfaceView['schools']['schoolListings'];
  listingsLoading: SurfaceView['results']['listingDataLoading'];
  /**
   * Issue #1793 SR-024 — the school-radius query's failure. Optional (additive): absent reads as
   * "no error". Set by buildRightPanelView from `view.schools.isErrorSchoolRadiusListings`.
   */
  listingsError?: SurfaceView['schools']['isErrorSchoolRadiusListings'];
  boundedSearchTriggered: SurfaceView['navigation']['journeyView']['boundedSearchTriggered'];
}

export interface SchoolPropertyFiltersView {
  value: SurfaceView['filters']['filters'];
}

export interface RightPanelSchoolView {
  zones: SchoolZonesView;
  scope: SchoolScopeView;
  /**
   * MapDiscovery-owned schools-in-area query — read directly, never
   * re-fetched here. `SchoolResult[] | undefined` (not defaulted to `[]`)
   * matches `DiscoverPanelSurfaceView['schools']['schools']`'s own
   * optionality exactly — confirmed against SchoolsInAreaWithHomesPanel.tsx's
   * `schools` field.
   */
  schoolsInArea: SchoolQueryState<SchoolResult[] | undefined>;
  homes: SchoolHomesView;
  selected: SchoolSelectedView;
  propertyFilters: SchoolPropertyFiltersView;
}

export interface SchoolZonesCommands {
  selectGroup: Actions['selectGroup'];
  selectAreaKey: SelectAreaKey;
  clearScope: ClearScope;
}

export interface SchoolsInAreaCommands {
  retry: RetryCallback;
  /** Journey-gated by the builder (only wired when journey === 'area-first'); see G9. */
  select: SurfaceCommands['navigation']['journeyCommands']['selectSchoolById'] | undefined;
}

export interface SchoolSelectedCommands {
  changeRadius: SurfaceCommands['navigation']['journeyCommands']['changeRadius'];
  clearSchool: SurfaceCommands['navigation']['journeyCommands']['clearSchool'];
  /**
   * Issue #1793 SR-024 — Retry for the school-radius failure block: the real query refetch.
   * Optional (additive); set by buildRightPanelCommands.
   */
  retryListings?: SurfaceCommands['geography']['refetchSchoolRadiusListings'];
  /** Only wired when authenticated (bridge:404); see G11. */
  boundedSearch?: SurfaceCommands['results']['handleBoundedSearch'];
}

export interface SchoolPropertyFiltersCommands {
  replace: SurfaceCommands['filters']['handleFiltersChange'];
}

export interface RightPanelSchoolCommands {
  zones: SchoolZonesCommands;
  schoolsInArea: SchoolsInAreaCommands;
  selected: SchoolSelectedCommands;
  propertyFilters: SchoolPropertyFiltersCommands;
}

// ── Agri (owns useAgriDestinations; C4) ──────────────────────────────────────

export interface AgriCorridorsView {
  groups: SurfaceView['agri']['corridorGroups'];
  loading: SurfaceView['agri']['isLoadingRegionalAreaGroups'];
  error: SurfaceView['agri']['isRegionalAreaGroupsError'];
  notGenerated: SurfaceView['agri']['isRegionalAreaGroupsNotGeneratedForRevision'];
  discoverAreas: SurfaceView['geography']['discoverAreasForPanel'];
}

export interface AgriSelectionView {
  region: AgriSelectedRegion;
  maxKm: SurfaceView['agri']['selectedMaxKm'];
  locality: NavView['selectedLocality'] | null;
  groupLabel: SurfaceView['agri']['agriGroupLabel'];
}

export interface AgriGroupListingsView {
  data: SurfaceView['agri']['filteredAgriListings'];
  loading: SurfaceView['agri']['isLoadingAgriGroupListings'];
  error: SurfaceView['agri']['isAgriGroupListingsError'];
  truncated: GroupListingsTruncated;
  limit: NonNullable<SurfaceView['agri']['agriMapListingsData']>['limit'] | undefined;
}

export interface AgriAreaSummaryView {
  data: SurfaceView['agri']['agriAreasData'];
  loading: SurfaceView['agri']['isLoadingAgriAreas'];
  listings: SurfaceView['geography']['areaListings'];
  listingsLoading: SurfaceView['geography']['isLoadingAreaListings'];
}

export interface AgriFiltersView {
  /**
   * The whole domain filter object, not decomposed field-by-field — same
   * "Person person" precedent as #2660 (AgriFiltersPanel.tsx:27 already owns
   * these 8 fields as one cohesive value; splitting them here would just
   * re-flatten what AgriFiltersPanel already treats as one thing).
   */
  values: AgriFilterValues;
}

export interface AgriPeekView {
  item: SurfaceView['results']['selectedGroupListingItem'];
  markerListing: SurfaceView['interaction']['selectedMarkerListing'];
}

export interface AgriJourneyView {
  corridors: AgriCorridorsView;
  selection: AgriSelectionView;
  groupListings: AgriGroupListingsView;
  areaSummary: AgriAreaSummaryView;
  filters: AgriFiltersView;
  peek: AgriPeekView;
}

export interface AgriCorridorsCommands {
  retry: SurfaceCommands['agri']['refetchRegionalAreaGroups'];
  setRegionWithMaxKm: Actions['setRegionWithMaxKm'];
  setMaxKm: Actions['setMaxKm'];
  clearRegionAndMaxKm: Actions['clearRegionAndMaxKm'];
  /**
   * Corridor landing's Browse-all-areas fallback (CorridorLandingPanel.tsx's
   * own `onSelectAreaKey`). The architect plan's §2 field count for this
   * group omitted it (plan text is line-drifted, not binding); it is a LIVE
   * wire (DRP forwards its own `onSelectAreaKey` prop here — confirmed via
   * the pre-C4 renderPanel source), so dropping it would silently dead-end a
   * working control. Still 5 of 6 — within the ceiling.
   */
  selectAreaKey: SelectAreaKey;
}

export interface AgriGroupListingsCommands {
  retry: RetryCallback;
  select: Actions['setSelectedListing'];
  clearGroup: Actions['clearRegionAndMaxKm'];
}

export interface AgriLocalityCommands {
  set: Actions['setLocality'];
  clear: Actions['clearLocality'];
}

export interface AgriFiltersCommands {
  apply: ApplyAgriFilters;
  clear: Actions['clearAgriFilters'];
}

export interface AgriPeekCommands {
  close: Actions['clearSelectedListing'];
  viewDetails: NavigateToListing;
  /** Also doubles as agri-detail's onBack (G5) — both clear the same selected-marker state. */
  clearMarkerSelection: SurfaceCommands['interaction']['clearSelectedMarkerListing'];
}

export interface AgriJourneyCommands {
  corridors: AgriCorridorsCommands;
  groupListings: AgriGroupListingsCommands;
  locality: AgriLocalityCommands;
  filters: AgriFiltersCommands;
  peek: AgriPeekCommands;
}

// ── Public top-level contract (6 view groups, 5 command groups) ─────────────

export interface RightPanelView {
  frame: RightPanelFrameView;
  shared: RightPanelSharedView;
  entry: RightPanelEntryView;
  area: RightPanelAreaView;
  school: RightPanelSchoolView;
  agri: AgriJourneyView;
}

export interface RightPanelCommands {
  shared: RightPanelSharedCommands;
  entry: RightPanelEntryCommands;
  area: RightPanelAreaCommands;
  school: RightPanelSchoolCommands;
  agri: AgriJourneyCommands;
}
