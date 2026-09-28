import React from 'react';
import { DiscoverRightPanel as RealDiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';
import type { AnonViewportListingItem } from '@/lib/anonViewportListing';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { ScopeNamespaces } from '@/features/discover/presentation/resolveScope';
import { prettifyZoneSlug } from '@/components/discover/SchoolRadiusMapOverlay';
import { resolveAreaRegionName } from '@/features/discover/selectors/areaRegionName';
import { resolveAreaSelectedResults } from '@/features/discover/selectors/areaSelectedResults';
import { buildRegionGuideHelperText } from '@/features/discover/selectors/regionGuideHelperText';
import type { RightPanelView, RightPanelCommands } from '@/features/discover/right-panel/contracts';

/**
 * Issue #2657 C8 — TEST-ONLY adapter. The ~12 `DiscoverRightPanel.*.test.tsx`
 * suites that render `<DiscoverRightPanel .../>` directly with pre-C8 FLAT
 * props keep their fixtures completely unchanged; only their import of
 * `DiscoverRightPanel` moves to this module, which re-exports a component of
 * the SAME name and the SAME flat prop shape, backed by the real
 * `{view, commands}` component. Precedent: #2660's `areas-journey/testing/`
 * adapter.
 *
 * Reuses the SAME pure selectors `surfaces/panel/rightPanelContract.ts` calls
 * in production — `resolveAreaRegionName`, `resolveAreaSelectedResults`,
 * `buildRegionGuideHelperText` — rather than re-deriving their logic, so this
 * adapter cannot drift from what `DiscoverRightPanel` itself computed from
 * these exact flat inputs pre-C8 (both call sites read from the SAME flat
 * `scope`/`summaryRegions`/`activeGroup`/viewport-substitution inputs; only
 * the caller moved). It does NOT call `buildRightPanelView`/
 * `buildRightPanelCommands` — those take `DiscoverPanelSurfaceView`/
 * `Commands` (the bridge's controller-shaped model: TanStack Query result
 * objects, the full `useDiscoverUrlState` facade, etc.), a shape these flat
 * test fixtures were never built to satisfy even pre-C8. Every OTHER field
 * below is copied straight out of `DiscoverRightPanel.tsx`'s own pre-C8 slice
 * construction (the `schoolsInArea.select` journey gate — Issue #1157/G9 —
 * lived IN `DiscoverRightPanel` itself, not the bridge; `onBack`/
 * `onSelectAreaKey`/`onBackToRegion`/`onApplyAgriFilters` arrived
 * PRE-RESOLVED from the bridge and are forwarded here unchanged, exactly as
 * `DiscoverRightPanel` itself always did).
 *
 * Issue #2657 R2 (code-review Finding 2 fix) — `LegacyFlatRightPanelProps` is
 * now DEFINED here (moved verbatim from `DiscoverRightPanel.tsx`), not
 * imported from it. This is the ONLY legitimate consumer of the pre-C8 flat
 * shape; production code (`contracts.ts` and the journey-panel files) no
 * longer references it at all — enforced by
 * `__tests__/legacyFlatPropsConfinement.guard.test.ts`.
 */

/**
 * The pre-C8 flat prop surface, kept ONLY as this test adapter's own input
 * shape. `DiscoverRightPanel` itself no longer accepts these props — see
 * `DiscoverRightPanelProps` in `@/components/discover/DiscoverRightPanel`.
 *
 * The ~24 props no production caller ever read (architect plan §1: `areas`/
 * `onAreaSelect`, `onClearGroup`, `onClearArea`, `isMobileMapOpen`,
 * `regionScopedGroups` + its loading/error/retry, `scopeNamespaces`,
 * `onSetRegion`, the 6 `groupResults*`/`onEnterGroupResults`/
 * `onRetryGroupResults`/`onClearGroupResults` fields, `onAreaSearchQueryChange`,
 * `shownAreaCount`, `totalAreaMarkerCount`, `onAreaHover`,
 * `highlightedAreaKeys`, `isLoadingAreaGroups`) are DROPPED here — they are
 * not part of `contracts.ts`'s field picks, so nothing downstream references
 * them any more.
 */
export interface LegacyFlatRightPanelProps {
  panelContent: DiscoverPanelContent;
  /** City identifier — passed to SchoolBrowsePanel to avoid a redundant useDiscoverUrlState call inside the panel. */
  city?: string;
  /**
   * Issue #1595 — human-readable city label (e.g. "Udupi"). Forwarded to the area-first
   * selected-group drill-down for its breadcrumb + "Choose an area in {city}" heading.
   * Falls back to `city` when omitted.
   */
  cityLabel?: string;
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  /**
   * Issue #1817 (code-review follow-up) — the area-selected result-summary copy,
   * precomputed by MapDiscovery via the SAME formatDiscoverBadgeCopy(discoverBadge, ...)
   * call that drives the map badge pill, so AreaSelectedPanel's stat and the map badge
   * can never diverge (design §6 "Area selected + filters" → `M of N match in {scope}`).
   * Forwarded to AreaSelectedPanel; null/undefined falls back to that panel's own
   * lightweight default (used by callers/tests that don't wire the full selector).
   */
  areaResultSummaryText?: string | null;
  /**
   * Issue #2018 requirement A — true when the AREA_SET listings request
   * FAILED, as opposed to succeeding with zero rows. Forwarded to
   * `AreaSelectedPanel`, which owns the two-branch error treatment (see its
   * `isListingsError` doc). Before this, a failed request reached this panel
   * indistinguishable from an empty one and rendered as "no listings here" —
   * the exact error-vs-empty conflation #2018 and #1793's SR-024 forbid.
   * Defaults false, so callers that do not wire it behave as before.
   */
  isListingsError?: boolean;
  /** Re-issues the failed AREA_SET listings request. */
  onRetryListings?: () => void;
  onBack?: () => void;
  onStartOver: () => void;
  onSelectJourney: (journey: DiscoverJourney) => void;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
  footerContent?: React.ReactNode;
  /** True while a filter-change refetch is in-flight (isFetching && !isLoading). */
  isFetching?: boolean;
  /** True during the initial full-screen load — disables the opacity overlay so the skeleton shows normally. */
  isInitialLoading?: boolean;
  /** Current free-text search query. Empty string when no search is active. */
  searchQuery?: string;
  /** Called when the user changes the search query. */
  onSearchChange?: (q: string) => void;
  /** Active journey (passed through from URL state for panel headers). */
  journey?: DiscoverJourney | null;
  /**
   * Area groups. Used by the area-selected group-name lookup and the
   * school-first zone panels — NOT solely by the deleted AreaGroupsLandingPanel.
   */
  areaGroups?: AreaGroup[];
  /**
   * Issue #2108 (shell fix) — the SAME real `isMobileShell` flag
   * (useDiscoverShell's 820px matchMedia) MapDiscovery.tsx gates its own
   * mobile-only control-bar row on. Drives whether this component mounts its
   * OWN desktop copy of DiscoverControlBar (city + Buy/Rent + area search)
   * above JourneySwitcher — never both, never neither, complementary to that
   * row. Defaults to `true` (i.e. do NOT mount DiscoverControlBar) rather
   * than following the `isMobileMapOpen`-style "false is desktop-safe"
   * convention: DiscoverControlBar reaches directly into the Discover
   * facade context (useDiscoverNav/useDiscoverActions/useDiscoverAreas),
   * which the many existing isolated DiscoverRightPanel.*.test.tsx files
   * (agri/schools states) do not provision — defaulting to "skip it" keeps
   * every one of those call sites compiling and passing unchanged. The real
   * production caller (DiscoverRightPanelContainer) always passes the live
   * value explicitly, so this default only ever applies to test callers
   * that don't care about the control bar.
   */
  isMobileShell?: boolean;
  /**
   * Issue #2017 (owner-directed desktop rework) — the same cross-tree
   * `isAreaSetDraftOpen` level AreaSetChips's mobile popover reads (see
   * DiscoverShellContextValue's doc). Threaded as a prop, mirroring
   * `isMobileShell` above, for the same reason: this component's many
   * isolated DiscoverRightPanel.*.test.tsx callers don't provision the
   * Discover shell context, so reading it via a hook here would break them.
   * Defaults to `false` (never show the desktop in-panel draft view) so
   * every existing caller/test is unaffected; the real production caller
   * (LegacyRightPanelBridge.tsx) always passes the live value.
   */
  isAreaSetDraftOpen?: boolean;
  /** Called when the user selects a group from the landing panel. Still used by the school-first zone panels. */
  onSelectGroup?: (groupId: string) => void;
  /**
   * Issue #1178 — the active groupId from the URL. Used by the area-selected
   * group-name lookup and the school-first zone panels.
   */
  groupId?: string | null;
  /** Issue #1745 — active residential macro region scope from URL. */
  scope?: string | null;
  /** Issue #1745 — callback to clear the active scope. */
  onClearScope?: () => void;
  /** Issue #1745 — callback when navigating back to a macro region from Level-2 or breadcrumb. */
  onBackToRegion?: (regionLabel: string) => void;
  /**
   * Issue #1808 — true only when the region-overview state is active (scope
   * set, journey/groupId/areaKey/schoolId all null), not dismissed, AND the
   * pick came from an actual map/panel click (never deep-link/refresh).
   * Forwarded to GuidedEntryPanel (the panel actually mounted at this state
   * — derivePanelContent does not read `scope`, so AreaGroupsLandingPanel is
   * not reachable here) to show the marker-accurate aria-live helper + the
   * one-shot ring around its existing JourneySwitcher ("choose how to
   * continue") section.
   */
  regionGuideRingActive?: boolean;
  /** Issue #1808 q1 — marker-accurate zones/areas variant for the helper copy. */
  regionGuideMarkerKind?: RegionOverviewMarkerKind;
  /** Issue #1808 — bumped per fresh region selection; keys the one-shot ring so it replays only on a new pick. */
  regionGuideNonce?: number;
  /** Issue #1808 §8 — suppresses the ring pulse/arrow nudge, replaced by a static ring. */
  prefersReducedMotion?: boolean;
  /** Issue #1808 — fired when a region card is selected (not deselected) in GuidedEntryPanel, arming the one-shot pulse with source='panel'. */
  onRegionSelectFromPanel?: () => void;
  /** Issue #1745 — summary regions from /api/discover/summary for safe matching. */
  summaryRegions?: import('@/utils/macroRegionResolver').SummaryRegionRef[];
  /**
   * Issue #1485 — true while areaGroups is loading. Forwarded to SchoolBrowsePanel
   * so zone cards show skeleton state on cold load.
   */
  isLoadingAreaGroupsForSchool?: boolean;
  /** All areas in the city — used as Browse-all fallback when groups is empty. */
  discoverAreas?: DiscoverArea[];
  /** Called when the user selects an area from Browse-all fallback. */
  onSelectAreaKey?: (areaKey: string) => void;
  /**
   * Issue #1429 — corridor groups for the agri-landing panel (cumulative model).
   * Replaces the old flat regionalGroups[] (discrete distanceBandKey model).
   */
  corridorGroups?: CorridorGroupData[];
  /** True while corridor groups are loading. */
  isLoadingRegionalGroups?: boolean;
  /** Issue #1453 — true when the corridor groups fetch errored. */
  isRegionalGroupsError?: boolean;
  /**
   * #2151 Track 3 landing-panel gap fix — true when the active source is a PREVIEW revision
   * that has zero sandbox Agri rows (backend 503 AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION).
   * Distinct from `isRegionalGroupsError`: renders its own non-retryable state instead of the
   * generic "Could not load corridors" error.
   */
  isRegionalGroupsNotGeneratedForRevision?: boolean;
  /** Issue #1453 — retry callback (the regional-area-groups query's refetch). */
  onRetryRegionalGroups?: () => void;
  /** Selected corridor direction (from URL region= param). Null when none. */
  selectedRegion?: string | null;
  /** Selected cumulative distance tier (from URL maxKm= param). Null when none. */
  selectedMaxKm?: 10 | 25 | 50 | 100 | null;
  /**
   * Called when the user clicks a corridor card — sets both region and default maxKm atomically.
   * Replaces the two-step setRegion + pick-distance flow (Issue #1445).
   */
  onSetRegionWithMaxKm?: (dir: string, km?: number) => void;
  /** Called when the user selects a cumulative distance tier. */
  onSetMaxKm?: (km: 10 | 25 | 50 | 100) => void;
  /** Called when the user clears both corridor + distance selection. */
  onClearRegionAndMaxKm?: () => void;
  /** Called when the user selects a school from the school-browse panel. */
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Called when the user clicks "Add a school in this area" in the area-selected panel
   * (Issue #1157). Enters the area-first school-picking sub-step without flipping the journey.
   */
  onAddSchool?: () => void;
  /**
   * Active context chips (area, school, type, BHK, price) passed to PanelHeader
   * for the area-selected state. Omitted for read-only panels.
   */
  activeContextChips?: React.ReactNode;
  /** Current property filters for quick-filter chips. */
  filters?: PropertyFilters;
  /** Called when property filters change via quick chips or clear action. */
  onFiltersChange?: (filters: PropertyFilters) => void;
  // ── Schools-in-area panel ─────────────────────────────────────────────────
  /** Pre-fetched school list from MapDiscovery — forwarded to SchoolsInAreaPanel to avoid duplicate API calls. */
  schools?: SchoolResult[];
  /** Whether the parent-owned schools query is loading. */
  schoolsLoading?: boolean;
  /**
   * Issue #1198 — whether the parent-owned schools-in-area query errored.
   * Forwarded to SchoolsInAreaPanel so its #1144 error/retry state renders in prop-owned mode.
   */
  schoolsError?: boolean;
  /** Issue #1198 — retry callback (the schools query's refetch) for the schools-in-area error state. */
  onSchoolsRetry?: () => void;
  /**
   * Issue #1198 — whether the schools-in-area query is refetching. Drives the #1170 Retry
   * loading feedback (disabled + "Retrying…" + aria-busy) on the schools-in-area error state.
   * Distinct from `isFetching`, which is the area-listings refetch flag.
   */
  schoolsFetching?: boolean;
  // ── School-selected panel ────────────────────────────────────────────────
  /** The school currently selected — drives SchoolSelectedPanel header. */
  selectedSchool?: SchoolResult | null;
  /** Listings inside the selected school's commute polygon. */
  schoolListings?: DiscoverCityListingItem[];
  /** True while school polygon listings are loading. */
  schoolListingsLoading?: boolean;
  /** Selected commute distance tier in km (e.g. 5, 10, 15, 20). */
  radiusKm?: number | null;
  /** Called when the user picks a new radius in SchoolSelectedPanel. */
  onRadiusChange?: (radiusKm: number) => void;
  // ── Area-school-combined panel ───────────────────────────────────────────────────
  /**
   * Called when the user dismisses the school chip in AreaSchoolCombinedPanel.
   * Atomically removes schoolId + radiusKm; preserves areaKey + board/category filters.
   */
  onClearSchool?: () => void;
  /**
   * Issue #1115 — bounded-search CTA callback for SchoolSelectedPanel.
   * When provided, the panel renders an explicit CTA before the /api/discover/markers
   * fetch is allowed. Undefined for anon users (no-op CTA is confusing there).
   */
  onBoundedSearch?: () => void;
  /**
   * Issue #1115 — true once the user has clicked the bounded-search CTA.
   * Switches SchoolSelectedPanel from "Search" CTA to results-count helper copy.
   */
  boundedSearchTriggered?: boolean;
  /**
   * Issue #1064 AC3 — true while `useDiscoverAreas` is still hydrating.
   * When `urlAreaKey` is present but `selectedArea` is null we use this to
   * distinguish "still loading → show skeleton" from "loaded → areaKey not found".
   */
  isLoadingAreas?: boolean;
  /**
   * Issue #1064 AC3 — the raw areaKey from the URL. Needed so the panel can tell
   * "URL has an areaKey but selectedArea is null" apart from the no-selection state.
   */
  urlAreaKey?: string | null;
  /**
   * Issue #1371 — agri-scoped area summaries from the separate
   * ?propertyType=agricultural_land call. When present and journey='agri-first',
   * the agri-selected panel looks up the selected area's entry to show the
   * agri-only listingCount and optional agriAcreage.
   * Undefined for all non-agri journeys (query is idle — zero overhead).
   */
  agriAreasData?: DiscoverArea[];
  /** True while the agri-scoped areas query is loading. */
  isLoadingAgriAreas?: boolean;
  /**
   * Issue #1374 — the agri polygon listing currently selected on the map.
   * Carried from MapDiscovery.selectedMarkerListing. Only meaningful when
   * panelContent === 'agri-detail'; undefined/null otherwise.
   */
  selectedMarkerListing?: PropertyListingWithImages | null;
  /**
   * Issue #1374 — clears the selected agri polygon listing to return to the
   * agri-selected area panel. Must NOT mutate URL state (areaKey/journey intact).
   */
  onClearAgriSelection?: () => void;
  // ── Agri-group-selected panel (Issue #1425) ────────────────────────────────
  /** Listings fetched for the selected agri regional group's area keys. */
  agriGroupListings?: AgriMapListingItem[] | null;
  /** Issue #1460 — true when the agri map listings response was capped by the backend. */
  agriGroupTruncated?: boolean;
  /** Issue #1460 — the cap limit from the backend (e.g. 250). */
  agriGroupListingsLimit?: number;
  /** True while agri group listings are loading. */
  isLoadingAgriGroupListings?: boolean;
  /** True when the agri group listings fetch errored. */
  isAgriGroupListingsError?: boolean;
  /** Human-readable label for the selected regional group (e.g. "North · 10–25 km"). */
  agriGroupLabel?: string | null;
  /** Retry callback — calls the agri map listings query's refetch. */
  onRetryAgriGroupListings?: () => void;
  /** Clears the selected regional group (sets it to null in URL state). */
  onClearRegionalGroup?: () => void;
  // ── Agri-group-peek panel (Issue #1430) ──────────────────────────────────
  /**
   * The AgriMapListingItem for the currently selected listing in the agri-group context.
   * Provides synchronous first-paint data (locality, landArea, pricePaise) without
   * waiting for the detail fetch. Only meaningful when panelContent === 'agri-group-peek'.
   */
  selectedGroupListingItem?: AgriMapListingItem | null;
  /**
   * Called when the user closes the agri-group listing peek panel.
   * Should call urlActions.clearSelectedListing() (REPLACE semantics).
   */
  onCloseGroupPeek?: () => void;
  /**
   * Called when the user clicks "View full details" in the peek panel.
   * Should navigate to /listing/:id.
   */
  onViewGroupListingDetails?: (id: string) => void;
  /**
   * Called when the user selects a listing from AgriGroupSelectedPanel.
   * Issue #1430: replaces the previous navigate('/listing/:id') with setSelectedListing(id)
   * so a URL-driven peek opens instead of a full-page navigation.
   * Falls back to no-op when undefined (safe for tests / storybook usage).
   */
  onSelectAgriGroupListing?: (id: string) => void;
  // ── Agri-group-locality panel (Issue #1464) ────────────────────────────────
  /**
   * Currently selected locality name for the drill-down panel.
   * Null when no locality is active.
   */
  selectedLocality?: string | null;
  /**
   * Called when the user clicks a locality group row in AgriGroupSelectedPanel.
   * Should call urlActions.setLocality(locality) (PUSH semantics).
   */
  onSetLocality?: (locality: string) => void;
  /**
   * Called when the user closes the agri-group-locality panel.
   * Should call urlActions.clearLocality() (REPLACE semantics).
   */
  onClearLocality?: () => void;
  // ── Card↔marker shared selection (Issue #1547) ─────────────────────────────
  /**
   * Id of the currently selected listing (URL/parent-derived, from the `listing` URL
   * param). Drives the copper selected card frame + scroll-into-view in the
   * narrowed-results panels. Selection is never card-local state.
   */
  selectedListingId?: string | null;
  /**
   * Ephemeral hover/focus id driven from map marker side to highlight corresponding card.
   */
  hoveredListingId?: string | null;
  /**
   * Called when a residential result card is activated, so the parent can sync the
   * selected map marker. Optional — when absent the card simply navigates.
   */
  onSelectResultListing?: (id: string) => void;
  /**
   * Issue #1547 — ephemeral hover/focus signal from card → map marker.
   * Called with the listing id on card mouseenter/focus, null on mouseleave/blur.
   * NOT persisted to URL — lives in ephemeral useState in MapDiscovery.
   * Only wired for area-first residential; school-first stays unwired (RISK-3:
   * school markers come from 3 desynced tier sources, making id-to-marker mapping unsafe).
   */
  onHoverResultListing?: (id: string | null) => void;
  // ── Agri filters (Issue #1457) ─────────────────────────────────────────────
  /** Currently active acreage min filter (from URL). */
  agriAcresMin?: number;
  /** Currently active acreage max filter (from URL). */
  agriAcresMax?: number;
  /** Currently active price min filter in rupees (from URL). */
  agriPriceMin?: number;
  /** Currently active price max filter in rupees (from URL). */
  agriPriceMax?: number;
  /** Called when user clicks Apply Filters in AgriFiltersPanel. */
  onApplyAgriFilters?: (filters: AgriFilterValues) => void;
  /** Called when user clicks Clear Filters in AgriFiltersPanel. */
  onClearAgriFilters?: () => void;
  /** Issue #1458 — active land category filter from URL. */
  agriLandCategory?: string | null;
  /** Issue #1458 — active farmhouse available tri-state filter from URL. */
  agriFarmhouseAvailable?: boolean | null;
  /** Issue #1458 — active fencing done tri-state filter from URL. */
  agriFencingDone?: boolean | null;
  /** Issue #1458 — active water source filter from URL. */
  agriWaterSource?: string | null;
  /** Issue #1494 — current buy/rent intent for filtering. Default 'buy'. */
  intent?: DiscoverIntent;
  /** Issue #1494 — called when user changes buy/rent intent. */
  onIntentChange?: (intent: DiscoverIntent) => void;
  // ── Public landing controls (Issue #1588) ─────────────────────────────────
  /** Called when the user changes city from the landing controls card. */
  onCityChange?: (city: string) => void;
  /** City-wide live property total — drives the landing's area-card "properties" chip + hero context. */
  totalProperties?: number;
  /** Number of areas with at least one listing — drives the landing's area-card "areas" chip. */
  areasCount?: number;
  /**
   * Issue #1588 follow-up — true when the selected city has loaded with zero
   * live properties. Threaded to GuidedEntryPanel for the city-aware empty-state notice.
   */
  isCityEmpty?: boolean;
  // ── Anon "Search this area" viewport results (Issue #2015) ────────────────
  /**
   * Issue #2015 — true for an anonymous caller with a committed VIEWPORT
   * `resultScope` ("Search this area"). Mirrors useDiscoverMapData's own
   * `isAnonViewport`; gates the anon-viewport card-list branch inside the
   * 'guided-entry' switch case (no new scope-detection logic here).
   */
  isAnonViewport?: boolean;
  /**
   * Issue #2015 — the anon "Search this area" reconciled listing set (band-only
   * fields, sourced from the PUBLIC bbox-only endpoint — never exact prices).
   * Rendered via PropertyCard, which already falls back to priceBand /
   * monthlyRentBand whenever pricePaise / monthlyRentRupees are absent.
   */
  anonViewportListings?: AnonViewportListingItem[];
  /** True while the anon-viewport listings fetch is in-flight. */
  anonViewportListingsLoading?: boolean;
  /**
   * Issue #2015 review fix (5087672619) — true once the anon-viewport query has
   * settled with an error. `anonViewportListings` is NOT cleared when this is true
   * (see useDiscoverMapData's isErrorAnonViewport doc), so this only gates whether
   * an inline error + Retry affordance is shown alongside the retained cards.
   */
  isErrorAnonViewport?: boolean;
  /**
   * Issue #2015 review fix (5087672619) — retries the SAME anon-viewport query.
   * Wired to useDiscoverMapData's refetchAnonViewport by the caller.
   */
  onRetryAnonViewport?: () => void;
  // ── Authenticated "Search this area" viewport results (Issue #2015) ──────
  /**
   * Issue #2015 — true for an AUTHENTICATED caller with a committed VIEWPORT
   * `resultScope`. Mirrors `isAnonViewport` for the
   * authenticated path; gates the auth-viewport card-list branch inside the
   * 'area-selected' switch case (no new scope-detection logic here).
   */
  isAuthViewport?: boolean;
  /**
   * Issue #2015 — the authenticated "Search this area" reconciled listing set.
   * Sourced from the SAME already resultScope-aware `discoverListingsPage`
   * query used elsewhere in the map data hook (exact prices, not band-only).
   */
  authViewportListings?: DiscoverCityListingItem[];
  /** True while the authenticated-viewport listings query is in-flight. */
  authViewportListingsLoading?: boolean;
  /**
   * Issue #2015 — true once the authenticated-viewport listings query has
   * settled with an error.
   */
  isErrorAuthViewport?: boolean;
  /**
   * Issue #2018 slice 3 — re-issues the failed AUTHENTICATED viewport
   * request. Omitted renders the error state WITHOUT a Retry button
   * rather than a dead one, the same honesty rule `onRetryListings` and
   * `isReadyToMoveSupported` already follow on this surface.
   */
  onRetryAuthViewport?: () => void;
  // ── Committed POLYGON (drawn search area) results (Issue #2461) ───────────
  /**
   * Issue #2461 — true for an AUTHENTICATED caller with a committed POLYGON
   * `resultScope`. Sourced from useDiscoverMapData's `isPolygonScope`; gates
   * the polygon card-list substitution inside the 'area-selected' switch case
   * the same way `isAuthViewport` gates VIEWPORT. Polygon search is
   * signed-in-only for MVP, so there is no anonymous twin.
   */
  isPolygonScope?: boolean;
  /**
   * Issue #2461 — the committed-POLYGON reconciled listing set, i.e. the SAME
   * resultScope-aware `discoverListingsPage` (`/api/discover/listings?polygon=`)
   * the map's markers already share, remapped for `AreaSelectedPanel`.
   */
  polygonListings?: DiscoverCityListingItem[];
  /** True while the committed-POLYGON listings query is in-flight. */
  polygonListingsLoading?: boolean;
  /** True once the committed-POLYGON listings query has settled with an error. */
  isErrorPolygonListings?: boolean;
  /** Re-issues the failed committed-POLYGON request; omitted renders no Retry button. */
  onRetryPolygonListings?: () => void;
  // ── Area-first selected-area results redesign (Issue #1606) ────────────────
  /**
   * Display name of the area-first selected group (e.g. "University Belt"), resolved
   * from areaGroups by the parent with a prettified-slug fallback. Null when the area
   * was reached without a group context — the breadcrumb omits the group crumb.
   */
  selectedGroupName?: string | null;
  /**
   * Navigate to the city's area-first landing (clears group + area, keeps journey).
   * Drives the area-first results breadcrumb's city crumb.
   */
  onNavigateAreaLanding?: () => void;
}

// The ~24 props no production caller reads any more (architect plan §1) still
// need to TYPE-CHECK on the existing fixture files that pass them
// (`areas={[]}` etc., inherited from before this component's own props were
// pruned in `LegacyFlatRightPanelProps`) — this adapter accepts and silently
// drops every one of them.
export interface FlatRightPanelTestFixture extends LegacyFlatRightPanelProps {
  areas?: AreaPoint[];
  onAreaSelect?: (area: AreaPoint) => void;
  onClearGroup?: () => void;
  onClearArea?: () => void;
  isMobileMapOpen?: boolean;
  regionScopedGroups?: RegionScopedAreaGroup[];
  isLoadingRegionScopedGroups?: boolean;
  isRegionScopedGroupsError?: boolean;
  onRetryRegionScopedGroups?: () => void;
  scopeNamespaces?: ScopeNamespaces;
  onSetRegion?: (dir: string) => void;
  onEnterGroupResults?: () => void;
  groupResultsListings?: import('@/hooks/useDiscoverListings').DiscoverListingItem[];
  isLoadingGroupResults?: boolean;
  isGroupResultsError?: boolean;
  groupResultsTotalElements?: number;
  onRetryGroupResults?: () => void;
  onClearGroupResults?: () => void;
  onAreaSearchQueryChange?: (query: string) => void;
  shownAreaCount?: number;
  totalAreaMarkerCount?: number;
  onAreaHover?: (areaKey: string | null) => void;
  highlightedAreaKeys?: string[];
  isLoadingAreaGroups?: boolean;
}

export function flatPropsToRightPanel(flat: FlatRightPanelTestFixture): {
  view: RightPanelView;
  commands: RightPanelCommands;
} {
  const areaGroupsList = flat.areaGroups ?? [];
  const activeGroup = areaGroupsList.find((g) => g.id === (flat.groupId ?? null));
  const regionName = resolveAreaRegionName(
    { scope: flat.scope ?? null, summaryRegions: flat.summaryRegions ?? [], activeGroup },
    prettifyZoneSlug,
  );
  const areaSelectedResults = resolveAreaSelectedResults({
    isAnonViewport: flat.isAnonViewport ?? false,
    isAuthViewport: flat.isAuthViewport ?? false,
    isPolygonScope: flat.isPolygonScope ?? false,
    anonViewportListings: flat.anonViewportListings,
    authViewportListings: flat.authViewportListings,
    polygonListings: flat.polygonListings,
    anonViewportListingsLoading: flat.anonViewportListingsLoading,
    authViewportListingsLoading: flat.authViewportListingsLoading,
    polygonListingsLoading: flat.polygonListingsLoading,
    areaListings: flat.areaListings ?? [],
    isLoadingListings: flat.isLoadingListings,
    areaResultSummaryText: flat.areaResultSummaryText,
    isListingsError: flat.isListingsError ?? false,
    isErrorAuthViewport: flat.isErrorAuthViewport,
    isErrorPolygonListings: flat.isErrorPolygonListings,
    onRetryListings: flat.onRetryListings,
    onRetryAuthViewport: flat.onRetryAuthViewport,
    // Issue #2657 C8 M8 — deliberately `onRetryPolygonListings`, not
    // `onRetryListings` again. Swapping this to `flat.onRetryListings` is the
    // M8 mutation: it silently drops the polygon retry wiring and the
    // "polygon" retry test (DiscoverRightPanel.test.tsx) goes RED — see the
    // C8 report's M8 evidence.
    onRetryPolygonListings: flat.onRetryPolygonListings,
  });

  const view: RightPanelView = {
    frame: {
      layout: { panelContent: flat.panelContent, isMobileShell: flat.isMobileShell ?? true, footer: flat.footerContent },
      counts: { totalProperties: flat.totalProperties ?? 0, areasCount: flat.areasCount ?? 0 },
      regionGuide: {
        ringActive: flat.regionGuideRingActive ?? false,
        markerKind: flat.regionGuideMarkerKind ?? null,
        nonce: flat.regionGuideNonce ?? 0,
        prefersReducedMotion: flat.prefersReducedMotion ?? false,
        helperText: buildRegionGuideHelperText({
          summaryRegions: flat.summaryRegions ?? [],
          scope: flat.scope ?? null,
          markerKind: flat.regionGuideMarkerKind ?? null,
        }),
      },
    },
    shared: {
      context: {
        city: flat.city ?? '',
        cityLabel: flat.cityLabel,
        journey: flat.journey,
        intent: flat.intent ?? 'buy',
        isAuthenticated: flat.isAuthenticated ?? false,
      },
      chrome: { activeContextChips: flat.activeContextChips, filtersContent: flat.filtersContent },
      area: { point: flat.selectedArea ?? null, urlAreaKey: flat.urlAreaKey ?? null, isLoading: flat.isLoadingAreas ?? false },
      cards: { selectedListingId: flat.selectedListingId ?? null, hoveredListingId: flat.hoveredListingId ?? null },
      refresh: { isFetching: flat.isFetching ?? false, isInitialLoading: flat.isInitialLoading ?? false },
    },
    entry: {
      landing: { isCityEmpty: flat.isCityEmpty ?? false },
      anonViewport: {
        active: flat.isAnonViewport ?? false,
        listings: flat.anonViewportListings ?? [],
        loading: flat.anonViewportListingsLoading ?? false,
        error: flat.isErrorAnonViewport ?? false,
      },
    },
    area: {
      selection: { groupName: flat.selectedGroupName ?? null, regionName, isDraftOpen: flat.isAreaSetDraftOpen ?? false },
      results: {
        listings: areaSelectedResults.listings,
        summaryText: areaSelectedResults.summaryText,
        isLoading: areaSelectedResults.isLoading,
        isError: areaSelectedResults.isError,
        isViewportScope: areaSelectedResults.isViewportScope,
      },
      filters: { filters: flat.filters ?? {}, searchQuery: flat.searchQuery ?? '', trendsHref: flat.trendsHref },
    },
    school: {
      zones: {
        groups: areaGroupsList,
        loading: flat.isLoadingAreaGroupsForSchool ?? false,
        discoverAreas: flat.discoverAreas ?? [],
        groupId: flat.groupId ?? null,
      },
      // Issue #2657 R2 — `contracts.ts`'s `SchoolScopeView.summaryRegions` is
      // now typed off `DiscoverPanelSurfaceView['geography']['summaryRegions']`
      // (`DiscoverSummaryRegion[]`, which additionally carries `listingCount`),
      // WIDER than this fixture's `SummaryRegionRef[]` (regionKey/regionLabel
      // only — the narrow shape `resolveAreaRegionName`/`buildRegionGuideHelperText`
      // actually read, used unchanged just below). Defaulted here rather than
      // widening the fixture type across the ~12 flat-prop test suites.
      scope: {
        key: flat.scope ?? null,
        summaryRegions: (flat.summaryRegions ?? []).map((region) => ({ ...region, listingCount: 0 })),
      },
      schoolsInArea: { data: flat.schools, loading: flat.schoolsLoading, fetching: flat.schoolsFetching, error: flat.schoolsError },
      homes: { data: flat.areaListings ?? [], loading: flat.isLoadingListings },
      selected: {
        school: flat.selectedSchool ?? null,
        radiusKm: flat.radiusKm,
        listings: flat.schoolListings,
        listingsLoading: flat.schoolListingsLoading,
        boundedSearchTriggered: flat.boundedSearchTriggered ?? false,
      },
      propertyFilters: { value: flat.filters ?? {} },
    },
    agri: {
      corridors: {
        groups: flat.corridorGroups ?? [],
        loading: flat.isLoadingRegionalGroups ?? false,
        error: flat.isRegionalGroupsError ?? false,
        notGenerated: flat.isRegionalGroupsNotGeneratedForRevision ?? false,
        discoverAreas: flat.discoverAreas ?? [],
      },
      selection: {
        region: flat.selectedRegion ?? null,
        maxKm: flat.selectedMaxKm ?? null,
        locality: flat.selectedLocality ?? null,
        groupLabel: flat.agriGroupLabel ?? null,
      },
      groupListings: {
        data: flat.agriGroupListings ?? null,
        loading: flat.isLoadingAgriGroupListings ?? false,
        error: flat.isAgriGroupListingsError ?? false,
        truncated: flat.agriGroupTruncated,
        limit: flat.agriGroupListingsLimit,
      },
      areaSummary: {
        data: flat.agriAreasData,
        loading: flat.isLoadingAgriAreas ?? false,
        listings: flat.areaListings ?? [],
        listingsLoading: flat.isLoadingListings,
      },
      filters: {
        values: {
          agriAcresMin: flat.agriAcresMin,
          agriAcresMax: flat.agriAcresMax,
          agriPriceMin: flat.agriPriceMin,
          agriPriceMax: flat.agriPriceMax,
          agriLandCategory: flat.agriLandCategory ?? null,
          agriFarmhouseAvailable: flat.agriFarmhouseAvailable ?? null,
          agriFencingDone: flat.agriFencingDone ?? null,
          agriWaterSource: flat.agriWaterSource ?? null,
        },
      },
      peek: { item: flat.selectedGroupListingItem ?? null, markerListing: flat.selectedMarkerListing ?? null },
    },
  };

  const commands: RightPanelCommands = {
    shared: {
      chrome: { startOver: flat.onStartOver, back: flat.onBack, selectJourney: flat.onSelectJourney },
      cards: { select: flat.onSelectResultListing, hover: flat.onHoverResultListing },
      market: { changeCity: flat.onCityChange, changeIntent: flat.onIntentChange },
    },
    entry: {
      landing: { armRegionSelect: flat.onRegionSelectFromPanel },
      anonViewport: { retry: flat.onRetryAnonViewport },
    },
    area: {
      navigation: { addSchool: flat.onAddSchool, crumbCity: flat.onNavigateAreaLanding, crumbRegion: flat.onBackToRegion },
      filters: { change: flat.onFiltersChange, changeSearch: flat.onSearchChange },
      results: { retry: areaSelectedResults.retry },
    },
    school: {
      zones: { selectGroup: flat.onSelectGroup, selectAreaKey: flat.onSelectAreaKey, clearScope: flat.onClearScope },
      schoolsInArea: {
        retry: flat.onSchoolsRetry,
        // Issue #1157/G9 — this gate lived IN DiscoverRightPanel pre-C8 (not
        // the bridge); reproduced verbatim.
        select: flat.journey === 'area-first' ? flat.onSelectSchool : undefined,
      },
      selected: { changeRadius: flat.onRadiusChange, clearSchool: flat.onClearSchool, boundedSearch: flat.onBoundedSearch },
      propertyFilters: { replace: flat.onFiltersChange },
    },
    agri: {
      corridors: {
        retry: flat.onRetryRegionalGroups,
        setRegionWithMaxKm: flat.onSetRegionWithMaxKm,
        setMaxKm: flat.onSetMaxKm,
        clearRegionAndMaxKm: flat.onClearRegionAndMaxKm,
        selectAreaKey: flat.onSelectAreaKey,
      },
      groupListings: { retry: flat.onRetryAgriGroupListings, select: flat.onSelectAgriGroupListing, clearGroup: flat.onClearRegionalGroup },
      locality: { set: flat.onSetLocality, clear: flat.onClearLocality },
      filters: { apply: flat.onApplyAgriFilters, clear: flat.onClearAgriFilters },
      peek: { close: flat.onCloseGroupPeek, viewDetails: flat.onViewGroupListingDetails, clearMarkerSelection: flat.onClearAgriSelection },
    },
  };

  return { view, commands };
}

/**
 * Drop-in replacement for `DiscoverRightPanel` in the ~12 direct-render test
 * suites — same name, same flat prop shape, so existing `import` lines are
 * the ONLY edit those files need.
 */
export function DiscoverRightPanel(flat: FlatRightPanelTestFixture) {
  const { view, commands } = flatPropsToRightPanel(flat);
  return React.createElement(RealDiscoverRightPanel, { view, commands });
}
