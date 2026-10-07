/**
 * Issue #1956 PR-4 (AC4.1/AC4.2/AC4.7/AC4.9) — lights up the EXISTING
 * listing surface (`AreaSelectedPanel`: cards, quick filters, within-area
 * search, favourites via `PropertyCard`, trust badges, anonymous price
 * coarsening, Browse All) at a canonical AREA leaf, WITHOUT reaching through
 * the legacy `DiscoverRightPanel` — this component derives what it needs from
 * the DiscoverProvider facade (`useDiscoverNav`/`useDiscoverActions`), falling
 * back to that facade's URL-only filter write only when the caller supplies no
 * `commands.results.changeFilters`. Production routes an AREA-leaf chip
 * toggle through the SAME page-local filters state `useDiscoverMapData`'s
 * `effectiveFilters` feeds the map's query with (#1956 PR-4 FIX CYCLE 3 Fix B)
 * — one filter identity, not two stores.
 *
 * DELIBERATELY a separate component, mounted ONLY from
 * `DiscoverAreasJourneyPanel`'s area-leaf branch: every hook it calls needs its
 * own provider (AuthProvider/DiscoverProvider/QueryClientProvider), so every
 * other Areas journey branch stays provider-free.
 *
 * Issue #2660 (C4) — moved out of `DiscoverAreasJourneyPanel.tsx` with its
 * body unchanged; its 41 flat props became a `{view, commands}` contract
 * (`contracts.ts`) whose `results.source` is the ONE discriminated result-
 * source model. Mount identity is unchanged: it is still the single element
 * the area-leaf branch returns, so `nav.schoolId`/`nav.schoolPicking` flips
 * re-render it in place and its own search-text state survives (T12).
 */
import { useEffect, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { SchoolsInAreaPanel, AreaSchoolCombinedPanel } from '@/components/discover/panels/SchoolJourneyPanels';
import { RequestCardSettledContext } from './requestCardSettledContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaSetDraftPanel } from '@/features/discover/components/AreaSetDraftPanel';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useDiscoverHeaderHostsControls } from '@/features/discover/state/useDiscoverHeaderHostsControls';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { toSelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import {
  resolveEffectiveCity,
  resolveEffectiveAreaLeafFilters,
  toCommittedUrlFilters,
} from '@/features/discover/selectors/effectiveDiscoverContext';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import { useAreaLeafResultSource } from './useAreaLeafResultSource';
import type { AreaLeafListingsSurfaceCommands, AreaLeafListingsSurfaceView } from '../contracts';

export interface AreaLeafListingsSurfaceProps {
  view: AreaLeafListingsSurfaceView;
  commands: AreaLeafListingsSurfaceCommands;
}

export function AreaLeafListingsSurface({ view, commands }: AreaLeafListingsSurfaceProps) {
  const { areaPoint, node, historyAdjacencyLog } = view.leaf;
  const { filters: committedFilters, source } = view.results;
  const {
    inArea: schools,
    selected: selectedSchool,
    selectedListings: schoolListings,
    radiusKm,
  } = view.schools;
  const { selectNode } = commands.hierarchy;
  const { buildNodeHref, startOver: onStartOver } = commands.navigation;
  const {
    changeFilters: onCommittedFiltersChange,
    reportSelectedListingPreview: onSelectedListingPreviewChange,
    redrawPolygon: onRedrawPolygon,
    retrySchoolListings: onSchoolListingsRetry,
  } = commands.results;
  const {
    enterPicking: onAddSchool,
    select: onSelectSchool,
    clear: onClearSchool,
    retry: onSchoolsRetry,
    changeRadius: onRadiusChange,
    back: onBackFromSchoolFlow,
  } = commands.schools;

  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = !authLoading && user !== null;
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  // Issue #2017 (owner-directed desktop rework) — this is the REAL area-first
  // production render site for the canonical AREA leaf (AreaSelectedPanel
  // below). On desktop, an open AREA_SET draft renders IN-PANEL
  // (AreaSetDraftPanel) here too — see DiscoverShellContextValue.isAreaSetDraftOpen's doc.
  const { isAreaSetDraftOpen, isMobileShell } = useDiscoverShell();
  // Issue #2770 — the same desktop-reskin signal AreaSelectedPanel gates on (>=1366px). Drives
  // ONLY the compact selected-school context block; it is deliberately NOT passed as `isDesktop`
  // (that would also mount the CompactFilterBar, which this canonical path never had).
  const isDesktopReskin = useDiscoverHeaderHostsControls(isMobileShell);
  const intentListingPurpose = nav.intent === 'rent' ? 'rent' : 'sale';
  const { searchQuery, debouncedSearch, handleSearchChange } = useDiscoverSearchState({
    urlQ: nav.q,
    setUrlSearch: actions.setSearchQuery,
  });
  // Issue #1956 PR-4 FIX PASS 4 / Issue #2353 — `effectiveFilters` is the ONE
  // source both the listings query's filter args AND the chip-display
  // `filters` passed to AreaSelectedPanel read from: `committedFilters`
  // (MapDiscovery's page-local `filters` state, the same state the map's own
  // listing/marker query is built from) when the caller supplies it, else
  // `nav.filters` as a defensive fallback for isolated renders. Chips, query
  // args and (by construction) cards+count therefore always agree. The
  // projection itself lives in `resolveEffectiveAreaLeafFilters`; the memo
  // recomputes only when `committedFilters` or the projected nav.filters
  // fields change.
  const effectiveFilters: PropertyFilters = useMemo(
    () => resolveEffectiveAreaLeafFilters(committedFilters, nav.filters),
    [
      committedFilters,
      nav.filters.propertyTypes,
      // Issue #2553 — resolveEffectiveAreaLeafFilters now projects this axis, so
      // the memo must recompute when it changes or the panel would keep rendering
      // a stale subtype selection.
      nav.filters.commercialSubtypes,
      nav.filters.bedrooms,
      nav.filters.priceMin,
      nav.filters.priceMax,
      nav.filters.readyToMove,
    ],
  );
  // Issue #2660 — result-source resolution (map AREA_SET base / committed
  // VIEWPORT / committed POLYGON / this surface's own fallback query) lives in
  // `useAreaLeafResultSource` + `areaLeafResultSources.ts`. Every quirk pinned
  // by the characterization suite (T1/T5/T6) is preserved there.
  const resolvedResultSource = useAreaLeafResultSource({
    city: resolveEffectiveCity(nav.city),
    areaKey: areaPoint.areaKey,
    effectiveFilters,
    debouncedSearch,
    listingPurpose: intentListingPurpose,
    isAuthenticated,
    source,
  });
  const rawAreaListings = resolvedResultSource.listings;
  const isLoadingAreaListingsResolved = resolvedResultSource.loading;
  const isFetchingAreaListingsResolved = resolvedResultSource.fetching;
  const isErrorAreaListingsResolved = resolvedResultSource.error;
  const refetchAreaListings = resolvedResultSource.retry;
  const isViewportScope = resolvedResultSource.isViewportScope;
  const areaListingsForPanel = useMemo(() => {
    const listings = rawAreaListings;
    // Issue #1956 PR-4 FIX CYCLE 3 (SF4, defense-in-depth) — the anon
    // /api/discover/cities/{city}/listings response is not expected to carry
    // `pricePaise` for anon callers (backend-enforced), but this strips it
    // client-side too, belt-and-suspenders, so a future backend regression
    // can never leak an exact price into an anon render through this
    // surface (PropertyCard renders `pricePaise` verbatim when present —
    // Issue #1616 three-way price render — with no isAuthenticated gate of
    // its own).
    // Issue #2051 (R2) — `monthlyRentRupees` is the rent/lease analogue of
    // `pricePaise` (also authenticated-only, also rendered verbatim by
    // PropertyCard with no isAuthenticated gate of its own) and must be
    // stripped for the identical reason. Applies to EVERY result-source
    // origin (T3), since it runs on the resolved listings.
    return isAuthenticated
      ? listings
      : listings.map((l) => ({ ...l, pricePaise: undefined, monthlyRentRupees: undefined }));
  }, [rawAreaListings, isAuthenticated]);

  // Issue #1956 PR-5 (AC5.9 breadcrumb omission-class fix) — `node.ancestry`
  // is the SAME server-declared ancestry `HierarchyBackButton` already reads
  // (never re-derived client-side). For a canonical AREA leaf, ancestry[0] is
  // always the macro "Region" (DIRECTION) and, when present, ancestry[1] is
  // the "Group" (CLUSTER/Local Destination). Null when absent, so
  // AreaFirstBreadcrumb omits the crumb entirely rather than rendering a
  // falsy label.
  const regionAncestor = node.ancestry[0] ?? null;
  const groupAncestor = node.ancestry[1] ?? null;
  const regionName = regionAncestor?.displayLabel ?? null;
  const groupName = groupAncestor?.displayLabel ?? null;

  // Issue #1956 PR-5 (AC5.9) — every crumb dispatches through the SAME
  // canonical `selectNode` (AC3.9's ONE selection action) — never a raw
  // navigate or a second history mechanism. "Home" and "City" both resolve to
  // the city root: this node-based journey has no destination between the
  // city's Areas root and leaving Discover entirely.
  const onCrumbHome = () => selectNode(ROOT_NODE_KEY);
  const onCrumbCity = () => selectNode(ROOT_NODE_KEY);
  const onCrumbRegion = regionAncestor ? () => selectNode(regionAncestor.nodeKey) : undefined;
  const onCrumbGroup = groupAncestor ? () => selectNode(groupAncestor.nodeKey) : undefined;

  // Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — projects the URL-selected
  // listing against THIS surface's own already-resolved `areaListingsForPanel`
  // (never a second query, never the map's differently-shaped marker listing).
  // `null` whenever nothing is selected or the id fell out of this result set.
  const selectedListingPreview = useMemo<SelectedListingPreview | null>(() => {
    if (!nav.selectedListing) return null;
    const match = areaListingsForPanel.find((l) => l.id === nav.selectedListing);
    if (!match) return null;
    return toSelectedListingPreview(match, { isAuthenticated, areaLabel: areaPoint.areaLabel });
  }, [nav.selectedListing, areaListingsForPanel, isAuthenticated, areaPoint.areaLabel]);

  // Reports the derived preview UP to the caller (MapDiscovery), which mounts
  // the mobile Map-mode preview sheet from it. T4 — this effect must not
  // re-fire on an unrelated re-render (H1), which is why every memo above
  // depends on values, never on the caller's per-render view objects.
  useEffect(() => {
    onSelectedListingPreviewChange?.(selectedListingPreview);
  }, [selectedListingPreview, onSelectedListingPreviewChange]);

  // Issue #1956 PR-4 FIX PASS 4 / Issue #2018 requirement A — a FIRST-LOAD
  // failure (no last-good results to preserve) replaces the surface with the
  // error + Retry affordance (reusing the journey-error presentation, with its
  // own testid/copy/refetch target), instead of presenting a backend failure
  // as "0 verified properties". When results ARE retained (keepPreviousData),
  // execution falls through to AreaSelectedPanel, which keeps the cards and
  // shows an inline retry banner. Still ordered ahead of the schools branches.
  if (isErrorAreaListingsResolved && areaListingsForPanel.length === 0) {
    return (
      <div className="p-4" data-testid="areas-journey-panel-listings">
        <HierarchyBackButton
          node={node}
          buildHref={buildNodeHref}
          cityLabel={CITY_CONFIG[nav.city]?.label ?? nav.city}
          historyAdjacencyLog={historyAdjacencyLog}
          className="mb-3"
        />
        <div
          className="p-4 flex flex-col items-center text-center gap-2"
          data-testid="areas-journey-panel-listings-error"
        >
          <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            We couldn't load properties in {areaPoint.areaLabel}. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={refetchAreaListings}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Issue #2124 (fix-cycle) — canonical area-first "schools-in-area" sub-step
  // (Issue #1157). `schoolId` wins over `schoolPicking` (mirrors
  // discoverPanelState.ts's legacy precedence: a picked school always routes to
  // the combined view, never back to the picker). Selecting a school writes
  // `schoolId` WITHOUT touching `journey`/`node`, so this branch picks it up on
  // the very next render. Both branches reuse the SAME School panels + page-owned
  // schools/schoolListings data the legacy `DiscoverRightPanel` renders — no new
  // panel UI. Each is wrapped in the SAME bounded flex-column container
  // `AreaSelectedPanel` relies on below (both panels return a bare Fragment that
  // needs a real flex-column ancestor with a bounded height).
  if (nav.schoolId) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="areas-journey-panel-school-combined">
        <AreaSchoolCombinedPanel
          compactContext={isDesktopReskin}
          view={{
            chrome: { journey: 'area-first' },
            viewer: { intent: nav.intent, isAuthenticated },
            area: areaPoint,
            school: selectedSchool ?? null,
            radius: { km: radiusKm ?? null },
            listings: {
              data: schoolListings.data ?? [],
              loading: schoolListings.loading ?? false,
              // Issue #1793 SR-024 — the school-radius query's failure (request-failure block).
              error: schoolListings.error ?? false,
              // Issue #1793 PR-C — the school-radius card source's own settled signal + the anon
              // page-cap flag (a capped page filtered to empty is not a real zero).
              settled: schoolListings.settled,
              hasMore: schoolListings.hasMore,
              // T6 — pinned: the AREA-leaf listings' fetching signal, not a
              // school-listings one.
              fetching: isFetchingAreaListingsResolved,
              selectedId: nav.selectedListing,
            },
            propertyFilters: { value: effectiveFilters },
          }}
          commands={{
            chrome: { startOver: onStartOver, back: onBackFromSchoolFlow },
            radius: { change: onRadiusChange ?? (() => undefined) },
            listings: { select: (id) => actions.setSelectedListing(id), retry: onSchoolListingsRetry },
            propertyFilters: {
              replace: (next) => {
                // Issue #2553 — forward what the panel emitted instead of rebuilding
                // from a key allowlist. This pair was the WORST instance of the class:
                // it never received the Issue #2023 `readyToMove` fix that the AREA-leaf
                // pair below did, so it silently dropped TWO axes rather than one. That
                // is the whole argument against enumerating keys at a commit boundary —
                // a fix applied to one copy does not reach its siblings, and nothing
                // fails when it doesn't.
                if (onCommittedFiltersChange) {
                  onCommittedFiltersChange({ ...(committedFilters ?? {}), ...next });
                  return;
                }
                actions.setFiltersCommitted(toCommittedUrlFilters(nav.filters, next));
              },
            },
            school: { clear: onClearSchool ?? (() => undefined) },
          }}
        />
      </div>
    );
  }

  if (nav.schoolPicking) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="areas-journey-panel-schools-in-area">
        <SchoolsInAreaPanel
          view={{
            chrome: { journey: 'area-first' },
            viewer: { intent: nav.intent, isAuthenticated },
            area: areaPoint,
            schools: {
              data: schools.data ?? [],
              loading: schools.loading,
              fetching: schools.fetching,
              error: schools.error,
            },
            homes: {
              data: areaListingsForPanel,
              loading: isLoadingAreaListingsResolved,
              fetching: isFetchingAreaListingsResolved,
              selectedId: nav.selectedListing,
            },
          }}
          commands={{
            chrome: { startOver: onStartOver, back: onBackFromSchoolFlow },
            schools: { retry: onSchoolsRetry, select: onSelectSchool },
            homes: { select: (id) => actions.setSelectedListing(id) },
          }}
        />
      </div>
    );
  }

  // #2702 / #2581 — the "View Area Trends" CTA's href, derived from THIS
  // surface's own canonical leaf (`areaPoint`/`nav.city`) rather than the
  // legacy `effectiveSelectedArea` path this journey no longer reaches, so it
  // can never disagree with the breadcrumb or listings this render shows.
  // `slugifyFromAreaKey` is the same pure function the chrome controller's
  // `trendsHref` and `CompareNearbyAreas.tsx` already use for this URL shape.
  const trendsHref = `/trends/${nav.city}/areas/${slugifyFromAreaKey(areaPoint.areaKey)}`;

  return (
    // Issue #1956 PR-4 FIX CYCLE 4 (mobile reachability) — a real bounded flex
    // column (`flex-1 min-h-0`, `overflow-hidden`), the SAME pattern the legacy
    // `DiscoverRightPanel` root uses, so AreaSelectedPanel's own `flex-1
    // overflow-y-auto` root actually scrolls inside the panel instead of the
    // whole document growing past the mobile viewport. Desktop is unaffected.
    // Issue #2729 D5 — additive `min-[1366px]:` tightening only (every existing class stays, at
    // every width, for the mobile/tablet regression guard): real-browser verification at the
    // desktop-reskin floor found ~140px of vertical chrome (this back-link row, the sticky
    // breadcrumb, a standalone Trends row inside AreaSelectedPanel's Toolbar) ahead of "Properties
    // in …", failing the "first card row visible at 1366×768 without scrolling" requirement. This
    // wrapper's own `p-4` top inset and the back-button's `mb-3` bottom margin are reduced at that
    // floor; Trends itself moves into `CompactResultsHeader`'s right cluster (see
    // AreaSelectedPanel.tsx's `<Toolbar trendsHref={...}>` call — it now omits `trendsHref` at the
    // desktop-reskin floor so the link is not shown twice) rather than being deleted from
    // anywhere — every destination stays reachable, nothing is removed.
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 min-[1366px]:pt-1"
      data-testid="areas-journey-panel-listings"
    >
      {/* Issue #2729 V2b — hidden at the desktop-reskin floor (≥1366) only: its DESTINATION node
          is identical to the breadcrumb's own rightmost crumb below (both resolve from the same
          `node.ancestry[node.ancestry.length - 1]`, see `resolveHierarchyBackDestination`), but its
          NAVIGATION MECHANISM is not — this component's module doc (`HierarchyBackButton.tsx`,
          "FIX-VERIFY CYCLE" comments) establishes across 4 documented defect cycles that its
          guarded real-browser POP (vs a breadcrumb click's PUSH via `selectNode`) is load-bearing
          for Forward-restorability, so it is MOVED (compact, on the breadcrumb row below via
          `view.area.hierarchyBackButton`), never simply hidden/deleted. Below 1366 this standalone
          row is completely unchanged. */}
      <HierarchyBackButton
        node={node}
        buildHref={buildNodeHref}
        cityLabel={CITY_CONFIG[nav.city]?.label ?? nav.city}
        historyAdjacencyLog={historyAdjacencyLog}
        className="mb-3 shrink-0 min-[1366px]:hidden"
      />
      {isAreaSetDraftOpen ? (
        <AreaSetDraftPanel />
      ) : (
      // Issue #1793 PR-C — hands ListingsBody THIS scope's own "settled" signal (AreaSelectedPanel
      // between them forwards only a fixed prop set). See requestCardSettledContext.ts.
      <RequestCardSettledContext.Provider value={resolvedResultSource.settled}>
      <AreaSelectedPanel
        // Issue #2658 (C5) — {view, commands} contract. Every value/expression
        // below is carried over verbatim from the flat call it replaced.
        view={{
          area: {
            point: areaPoint,
            // FIX CYCLE 2 — the SAME `CITY_CONFIG[city]?.label ?? city` derivation
            // MapDiscovery.tsx and DiscoverMapContextOverlay.tsx use (T11: distinct
            // from the hierarchy branches' `cityLabel ?? 'the city'`).
            cityLabel: CITY_CONFIG[nav.city]?.label ?? nav.city,
            // Issue #1956 PR-5 (AC5.9) — breadcrumb region/group, see above.
            regionName,
            groupName,
            // Issue #2729 V2b — the SAME HierarchyBackButton/handler as the standalone row above
            // (same node/buildHref/cityLabel/historyAdjacencyLog, so the identical POP/REPLACE
            // guard applies), just rendered compact on the breadcrumb row at ≥1366. See the
            // standalone instance's comment above for why this is a move, not a duplication of
            // logic — `compact` only changes the rendered label/title, never the handler.
            hierarchyBackButton: (
              <HierarchyBackButton
                node={node}
                buildHref={buildNodeHref}
                cityLabel={CITY_CONFIG[nav.city]?.label ?? nav.city}
                historyAdjacencyLog={historyAdjacencyLog}
                compact
              />
            ),
          },
          results: {
            listings: areaListingsForPanel,
            isLoading: isLoadingAreaListingsResolved,
            // Issue #2018 requirement A — reaching this call site with an error
            // set means results WERE retained (the no-results case returned the
            // full-replace state above), so the panel keeps the cards and shows
            // an inline retry banner.
            isError: isErrorAreaListingsResolved,
            // Issue #2015 — switches AreaSelectedPanel's heading/copy once a
            // VIEWPORT scope ("Search this area") is committed; the listings
            // themselves are already viewport-scoped by the resolver.
            isViewportScope,
            // Issue #2353 — the keepPreviousData refresh-in-flight signal, so
            // stale cards are dimmed rather than presented as settled.
            isFetching: isFetchingAreaListingsResolved,
          },
          filters: {
            filters: effectiveFilters,
            intent: nav.intent,
            // Issue #2572 / #2596 — COMMERCIAL CAPABILITY ENABLEMENT. There are
            // several production render sites of AreaSelectedPanel; this one (the
            // area-first canonical leaf) must pass it too. If you add another,
            // pass it there as well.
            //
            // Issue #2023 — this surface's listings honour `readyToMove` for both
            // anon and authenticated callers, so the chip stays enabled
            // (isReadyToMoveSupported omitted, relying on the panel's `= true`).
            isCommercialSubtypeSupported: true,
          },
          search: { query: searchQuery },
          listingCards: { isAuthenticated, selectedListingId: nav.selectedListing },
          // #2702 — makes the "View Area Trends" CTA reachable from the real
          // journey=area-first Discover flow.
          links: { trendsHref },
        }}
        commands={{
          navigation: { onCrumbHome, onCrumbCity, onCrumbRegion, onCrumbGroup, onAddSchool },
          filters: {
            change: (next) => {
              // Issue #1956 PR-4 FIX CYCLE 3 (blocking Fix B) — route through the
              // SAME committed filters state/handler the map's query is built
              // from, so a chip toggle produces ONE filter identity across the
              // URL, this panel's cards/count, and the map's markers. Falls back
              // to the URL-only `setFiltersCommitted` write only when no caller
              // handler is present (defensive — production always supplies one).
              // Issue #2553 — forward what the panel emitted rather than rebuilding
              // the committed object from a key allowlist (which silently dropped
              // readyToMove, then commercialSubtypes). `next` is a full
              // PropertyFilters, so the spread carries every axis the panel can
              // emit while the base supplies whatever sits outside the projection.
              if (onCommittedFiltersChange) {
                onCommittedFiltersChange({ ...(committedFilters ?? {}), ...next });
                return;
              }
              actions.setFiltersCommitted(toCommittedUrlFilters(nav.filters, next));
            },
          },
          search: { change: handleSearchChange },
          listings: {
            select: (id) => actions.setSelectedListing(id),
            retry: refetchAreaListings,
          },
          scope: { redrawPolygon: onRedrawPolygon },
        }}
      />
      </RequestCardSettledContext.Provider>
      )}
    </div>
  );
}
