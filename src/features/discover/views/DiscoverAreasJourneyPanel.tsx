/**
 * DiscoverAreasJourneyPanel — Issue #1956 PR 2 (Slice 3, AC3.1-AC3.10).
 *
 * Hosts the canonical Areas hierarchy right-panel surface: the city-root
 * Direction surface and, once a Direction/Local Destination is selected, the
 * level below it. This component owns NONE of the navigation state itself —
 * it receives the ONE `useAreasNavigationJourney` result its caller resolved,
 * so the map (which reads the same hook instance) and this panel can never
 * diverge on node identity or counts (AC3.4/AC3.9/T3).
 *
 * Covers all four required UI states: loading (skeleton), error (message +
 * retry), empty (no children at this level — a real, designed state, not an
 * error), and success (`NavigationLevelPanel`).
 *
 * Invariant 8 — this panel renders NO result-scope controls (Edit areas /
 * Clear selected areas / Add nearby areas / Draw search area / Search this
 * area / Create alert); those belong to #2016/#2017/#2019.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationLevelPanel } from '@/components/discover/navigation/NavigationLevelPanel';
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import { formatListingCount } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { presentClusterRepresentatives } from '@/features/discover/navigation/representativeNames';
import type { ClusterableAreaMember } from '@/features/discover/navigation/areaClustering';
import { isMemberEligible } from '@/features/discover/navigation/journeyVisibility';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverActions, useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { NodeListingsSurface } from './NodeListingsSurface';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { SchoolsInAreaPanel, AreaSchoolCombinedPanel } from '@/components/discover/panels/SchoolJourneyPanels';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import {
  resolveEffectiveCity,
  resolveEffectiveAreaLeafFilters,
} from '@/features/discover/selectors/effectiveDiscoverContext';
import { toSelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

/**
 * One visual AREA cluster's member set, as focused by a map cluster-marker
 * click (Issue #1956 PR 3, Slice 4). `members` and `countLabel` are derived
 * HERE, below, from the SAME `journey.node.children`/`journey.children` the
 * map's `AreaDestinationMarkerLayer` reads and the SAME
 * `presentClusterRepresentatives` function it calls internally — filtered to
 * exactly the `focusedClusterMemberAreaKeys` the map's own visual clustering
 * (pan/zoom-dependent pixel grouping) reported back, so map and panel can
 * never disagree on the visible set or the total (AC4.12).
 */
export interface FocusedAreaClusterSummary {
  members: ReadonlyArray<{
    nodeKey: string;
    areaKey: string;
    displayLabel: string;
    listingCount: number;
    schoolCount?: number | null;
  }>;
  /** The exact "+N areas with matches" / "N areas with matches" copy the map cluster marker shows. */
  countLabel: string;
}

/**
 * Issue #1956 PR-5 (Slice 3, AC5.6) — extracted, byte-for-byte-identical pure
 * derivation, factored OUT of the `focusedCluster` useMemo below so the new
 * mobile Map-mode cluster sheet (`src/features/discover/views/mobile/
 * MobileClusterSheet.tsx`) can compute the IDENTICAL member subset + count
 * copy from the SAME `journey`/`focusedClusterMemberAreaKeys` MapDiscovery
 * already threads to both this panel and the map layer, without a second,
 * potentially-diverging implementation (AC5.6's "consuming the existing
 * seam" requirement). No behaviour change versus the pre-extraction inline
 * body — see this component's own `focusedCluster` useMemo call site.
 */
export function deriveFocusedAreaClusterSummary(
  journey: Pick<UseAreasNavigationJourneyResult, 'node' | 'children'>,
  focusedClusterMemberAreaKeys: readonly string[] | null | undefined,
  eligibilityJourney: 'areas' | 'schools' = 'areas',
): FocusedAreaClusterSummary | null {
  if (!focusedClusterMemberAreaKeys || focusedClusterMemberAreaKeys.length === 0) return null;
  const rawByNodeKey = new Map((journey.node?.children ?? []).map((c) => [c.nodeKey, c] as const));
  const wanted = new Set(focusedClusterMemberAreaKeys);
  const clusterable: ClusterableAreaMember[] = [];
  for (const child of journey.children) {
    const raw = rawByNodeKey.get(child.nodeKey);
    // Minor fix-up (review) — the backend guarantees a non-null areaKey for
    // AREA children; a child missing one is SKIPPED rather than borrowing
    // its nodeKey as a stand-in areaKey (mirrors the coordinate fail-safe
    // in areaClustering.ts's isUsableCentroid — never fabricate identity).
    if (raw?.areaKey == null || !wanted.has(raw.areaKey)) continue;
    clusterable.push({
      nodeKey: child.nodeKey,
      areaKey: raw.areaKey,
      displayLabel: child.displayLabel,
      lat: raw.centreLat ?? Number.NaN,
      lon: raw.centreLon ?? Number.NaN,
      listingCount: child.listingCount,
      displayOrder: child.displayOrder,
      schoolCount: child.schoolCount,
    });
  }
  if (clusterable.length === 0) return null;
  // REQUIRED CHANGE 1 (AC4.12) — partition through the SAME journey-aware
  // eligibility predicate the map's clusterVisibleAreaMembers
  // (areaClustering.ts) applies BEFORE clustering, so a focused member that
  // has dropped to zero-content (e.g. a filter tightened) is excluded from
  // this panel exactly as it is excluded from the map's cluster. Falls back
  // to the normal level panel (returns null) when nothing eligible
  // survives — this panel only ever mounts for the areas journey (see
  // module doc), so the eligibility dimension is always 'areas'.
  const eligible = clusterable.filter((m) =>
    isMemberEligible(
      {
        areaKey: m.areaKey,
        displayLabel: m.displayLabel,
        eligibleListingCount: m.listingCount,
        eligibleSchoolCount: m.schoolCount ?? 0,
        displayOrder: m.displayOrder,
      },
      eligibilityJourney,
    ),
  );
  if (eligible.length === 0) return null;
  // REQUIRED CHANGE 2 — pass the panel's REAL (post-eligibility) displayed
  // count as the limit so `presentClusterRepresentatives` never advertises
  // a hidden "+N" for rows that are ALL already on screen here. The map
  // marker (AreaMarkerLayer.tsx) keeps calling this with the default
  // MAX_REPRESENTATIVE_NAMES cap — unaffected by this change.
  const { countResult } = presentClusterRepresentatives(eligible, eligibilityJourney, eligible.length);
  return {
    members: eligible.map((m) => ({
      nodeKey: m.nodeKey,
      areaKey: m.areaKey,
      displayLabel: m.displayLabel,
      listingCount: m.listingCount,
      schoolCount: m.schoolCount,
    })),
    countLabel: countResult.label,
  };
}

export interface DiscoverAreasJourneyPanelProps {
  journey: UseAreasNavigationJourneyResult;
  representativeAreaNamesByNodeKey?: ReadonlyMap<string, string[]>;
  selectedNodeKey?: string | null;
  hoveredNodeKey?: string | null;
  onHoverChange?: (nodeKey: string | null) => void;
  /**
   * Issue #1956 PR 2 (Slice 5) — the pure href builder for the visible
   * in-app hierarchy Back control (`urlActions.buildNodeHref`, unchanged).
   * See `HierarchyBackButton`'s module doc for why this control resolves the
   * server-declared canonical parent rather than browser history.
   */
  buildNodeHref: (nodeKey: string) => string | null;
  /**
   * Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
   * visual-AREA-cluster identity the caller (MapDiscovery) owns alongside
   * `hoveredNavigationNodeKey`, mirrored unchanged from
   * `AreaMarkerLayer`'s/`AreaDestinationMarkerLayer`'s own
   * `focusedClusterMemberAreaKeys`/`onClusterFocusChange` prop pair. When
   * non-null, a visual AREA cluster is currently focused (a map cluster
   * marker was clicked) — this panel renders ONLY that cluster's member
   * subset (derived below via `presentClusterRepresentatives`), with its own
   * distinct testid (`areas-cluster-focus-panel`, NEVER
   * `navigation-level-panel`) plus a "Show all areas" control that clears
   * focus by calling `onClusterFocusChange(null)`. `node=`/breadcrumb/
   * `historyAdjacencyLog` are completely untouched by this — focus is
   * presentation-only (AC4.5 item 4).
   */
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  /** Fired to clear focus (`null`) or, for parity with the map's own callback shape, report a new member set. A caller that owns this state feeds it straight back into `focusedClusterMemberAreaKeys` to keep the map and panel in lock-step. */
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  /**
   * Issue #1956 PR-4 FIX CYCLE 3 (blocking Fix B) — MapDiscovery's OWN
   * committed `filters` local state (useDiscoverPageState) and its single
   * writer `handleFiltersChange`. This is the SAME state
   * `useDiscoverMapData`'s `effectiveFilters` feeds the map's listing/marker
   * query with, threaded here (via `DiscoverRightPanelContainer`, which
   * already receives both for the legacy `DiscoverRightPanel`) so an
   * AREA-leaf chip toggle writes into that ONE state instead of a parallel
   * URL-only `setFiltersCommitted` write the map's page-local state never
   * observes — see `AreaLeafListingsSurface`'s `onFiltersChange` below for
   * the actual routing. Optional only so the pre-existing loading/error/
   * empty/children-level tests above (which never resolve an AREA leaf)
   * keep compiling and passing unchanged.
   */
  areaLeafFilters?: PropertyFilters;
  onAreaLeafFiltersChange?: (next: PropertyFilters) => void;
  /**
   * Issue #2353 — the map's ALREADY-FETCHED area listings for the current
   * AREA leaf (`useDiscoverMapData`'s `areaListings`, keyed on the same
   * `effectiveSelectedArea` bridge this journey's node resolves to), plus its
   * loading/error state. When supplied, `AreaLeafListingsSurface` uses this as
   * its PRIMARY data source instead of issuing its own duplicate
   * `useDiscoverCityListings` query — see that component's own doc comment.
   * Optional so every pre-existing render path/test that never resolves an
   * AREA leaf (and the surface's own isolated-render/standalone test path)
   * keeps compiling and rendering unchanged: omitting it falls back to the
   * surface's own query, exactly as before this issue.
   */
  mapAreaListings?: DiscoverCityListingItem[];
  mapAreaListingsLoading?: boolean;
  mapAreaListingsError?: boolean;
  /**
   * Issue #2353 (code-review fix) — the areaKey `mapAreaListings` is actually
   * keyed to (the caller's `effectiveSelectedArea.areaKey`). `mapAreaListings`
   * is trusted as the primary data source ONLY when this matches the resolved
   * leaf's own `areaPoint.areaKey` — `resolveEffectiveSelectedArea` prefers a
   * legacy `areaKey=` URL param over the canonical `node=` resolution when
   * both are present, so the two CAN diverge on a hand-built/bookmarked URL.
   * On a mismatch (or when omitted), the surface falls back to its own query
   * — exactly current pre-#2353 behaviour — rather than ever rendering one
   * area's listings under a different area's heading/breadcrumb.
   */
  mapAreaListingsAreaKey?: string | null;
  /**
   * Issue #2353 (code-review fix) — the SAME query `mapAreaListings` came
   * from, so the surface's error-state Retry button is a real refetch instead
   * of a no-op. Optional so the standalone-render fallback path (no map data
   * supplied at all) keeps compiling.
   */
  mapAreaListingsRefetch?: () => void;
  /**
   * Issue #2353 (code-review fix) — the SAME query's `isFetching`.
   * `useDiscoverCityListings` uses `placeholderData: keepPreviousData`, so on
   * a query-key change (filter/search rekey) it deliberately keeps rendering
   * the PREVIOUS response while a new one is in flight — `isFetching: true`
   * while `mapAreaListingsLoading` can stay `false`. Without this, the
   * surface would present stale cards as fully settled during a refetch,
   * recreating the stale-cards/new-controls incoherence #2353 exists to
   * close. Optional so the standalone-render fallback path keeps compiling.
   */
  mapAreaListingsFetching?: boolean;
  /**
   * Issue #1956 PR-4 FINAL FIX PASS (regression fix) — the SAME
   * `urlActions.enterSchoolPicking` handler `DiscoverRightPanelContainer`
   * already wires to the legacy `DiscoverRightPanel`'s `onAddSchool` (see
   * that container's call site). Enters the area-first school-picking
   * sub-step (Issue #1157) WITHOUT flipping `journey`, so Back restores the
   * selected area instead of deleting it. Forwarded unchanged to
   * `AreaSelectedPanel` via `AreaLeafListingsSurface` below — no new
   * handler is created here. Optional only so the pre-existing tests that
   * never resolve an AREA leaf keep compiling and passing unchanged.
   */
  onAddSchool?: () => void;
  /**
   * Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — lifts the currently-selected
   * listing's anonymous-safe preview projection (derived from the SAME
   * ALREADY-FETCHED `DiscoverCityListingItem[]` this surface's own
   * `useDiscoverCityListings` call resolved — never a second query) up to
   * the caller (MapDiscovery), which renders the mobile Map-mode preview
   * sheet from it. `null` whenever no listing is selected or the selected
   * id is not present in this area's own result set. Optional so every
   * pre-existing render path/test that never resolves an AREA leaf keeps
   * compiling unchanged.
   */
  onSelectedListingPreviewChange?: (preview: SelectedListingPreview | null) => void;
  /**
   * Issue #2084 (AC6) — display name of the current city, forwarded unchanged
   * to `NavigationLevelPanel` for the city-ROOT-only invitational eyebrow.
   * Optional so every pre-existing render path/test that never resolves the
   * literal city root keeps compiling and rendering unchanged.
   */
  cityLabel?: string;
  isNodeListingsActive?: boolean;
  onClearNodeListings?: () => void;
  onBrowseListings?: () => void;
  /**
   * Issue #2124 (fix-cycle) — the canonical area-first "schools-in-area" sub-step
   * (`schoolPicking=1`, journey stays `area-first`, `node=`/canonical area unchanged)
   * and its follow-on area+school combined view (`schoolId` set). These props mirror
   * the legacy `DiscoverRightPanel`'s own `schools`/`selectedSchool`/`schoolListings`/
   * `radiusKm` props byte-for-byte — the SAME MapDiscovery-owned query results and
   * journeyCommands actions, never re-fetched or re-derived here. All optional so
   * every pre-existing render path/test that never resolves an AREA leaf (or never
   * supplies them) keeps compiling and rendering unchanged.
   */
  schools?: SchoolResult[];
  schoolsLoading?: boolean;
  schoolsError?: boolean;
  onSchoolsRetry?: () => void;
  schoolsFetching?: boolean;
  selectedSchool?: SchoolResult | null;
  schoolListings?: DiscoverCityListingItem[];
  schoolListingsLoading?: boolean;
  radiusKm?: number | null;
  onRadiusChange?: (radiusKm: number) => void;
  onClearSchool?: () => void;
  onSelectSchool?: (schoolId: string) => void;
  onStartOver?: () => void;
  /**
   * Issue #2124 (fix-cycle) — `MapDiscovery.handleAreaFirstBack`'s existing 3-rung
   * ladder (schoolId -> backToSchoolPicking; schoolPicking -> clearSchoolPicking;
   * else -> area back), forwarded unchanged. Drives in-app Back from both the
   * schools-in-area and area+school-combined sub-steps below.
   */
  onBackFromSchoolFlow?: () => void;
}

export function DiscoverAreasJourneyPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  buildNodeHref,
  focusedClusterMemberAreaKeys = null,
  onClusterFocusChange,
  areaLeafFilters,
  onAreaLeafFiltersChange,
  mapAreaListings,
  mapAreaListingsLoading,
  mapAreaListingsError,
  mapAreaListingsFetching,
  mapAreaListingsAreaKey,
  mapAreaListingsRefetch,
  onAddSchool,
  onSelectedListingPreviewChange,
  cityLabel,
  isNodeListingsActive,
  onClearNodeListings,
  onBrowseListings,
  schools,
  schoolsLoading,
  schoolsError,
  onSchoolsRetry,
  schoolsFetching,
  selectedSchool,
  schoolListings,
  schoolListingsLoading,
  radiusKm,
  onRadiusChange,
  onClearSchool,
  onSelectSchool,
  onStartOver,
  onBackFromSchoolFlow,
}: DiscoverAreasJourneyPanelProps) {
  // Issue #1956 PR 3 (bounded state-lift, AC4.12) — derive the focused
  // cluster's member list + count copy from the SAME `journey.node.children`
  // (raw, carries `areaKey`)/`journey.children` (enriched, carries
  // `displayLabel`/`listingCount`/`schoolCount`/`displayOrder`) the map reads,
  // filtered to exactly the areaKeys `focusedClusterMemberAreaKeys` names —
  // never re-clustered here (clustering is pan/zoom-dependent pixel geometry
  // the map alone computes; this only looks up display data for the members
  // the map already chose). `presentClusterRepresentatives` is the SAME pure
  // function `AreaMarkerLayer` calls internally for its own cluster-marker
  // count copy, so the "N areas with matches" text can never drift between
  // map and panel (AC4.12). This panel only ever mounts for the area-first
  // journey (see `DiscoverRightPanelContainer`'s `showAreasNavigationJourney`
  // gate), so the eligibility dimension is always 'areas', never 'schools'.
  const focusedCluster = useMemo(
    () => deriveFocusedAreaClusterSummary(journey, focusedClusterMemberAreaKeys),
    [focusedClusterMemberAreaKeys, journey.node, journey.children],
  );

  // Issue #1956 PR-4 (AC4.1/AC4.2/AC4.7/AC4.9) — `selectedAreaPoint` is a
  // PURE (hook-free) re-derivation of the SAME node this component already
  // receives via `journey.node` (identical to MapDiscovery.tsx's own
  // `nodeAreaPoint` bridge) — no extra fetch, no new navigation state, and
  // deliberately NOT itself calling any hook, so every existing render path
  // that never resolves an AREA leaf (loading/error/node-null/focused-
  // cluster/structural-empty/success-with-children) is completely unaffected
  // by the new listings surface below. The surface's own data hooks
  // (useAuth/useDiscoverNav/useDiscoverActions/useDiscoverCityListings) live
  // in `AreaLeafListingsSurface` (below), which only ever MOUNTS when this
  // is non-null — see that component's doc comment for the full contract.
  // FIX CYCLE 2 (opus review, Finding 7) — `deriveAreaPointFromNode` returns a
  // fresh object literal on every call; without memoisation this flowed a
  // new `selectedArea`/`areaKeys: [areaPoint.areaKey]` object identity into
  // `AreaSelectedPanel` and `AreaLeafListingsSurface` on every render.
  // Memoised on `journey.node`'s identity, matching MapDiscovery.tsx's own
  // `nodeAreaPoint` useMemo (same derivation, same dep) — an unconditional
  // hook above the early returns is fine (matches the PR-3 hooks already
  // declared before them in this component).
  const selectedAreaPoint = useMemo(() => deriveAreaPointFromNode(journey.node), [journey.node]);

  // Issue #2087: Bounded eligibility guard at the panel level.
  // If nodeListings=1 is set in the URL but the resolved node is ineligible
  // (root node or >15 canonical descendant areas), clear the URL flag instead
  // of rendering NodeListingsSurface. This prevents URL/deep-link bypass of
  // the <=15 constraint — the server also enforces this, but the UI should
  // degrade gracefully rather than showing an error.
  const nodeIsEligibleForBrowse = (() => {
    if (!journey.node) return false;
    if (journey.node.nodeKey === ROOT_NODE_KEY) return false;
    const count = journey.node.descendantAreaKeys?.length ?? 0;
    return count > 0 && count <= 15;
  })();

  useEffect(() => {
    if (isNodeListingsActive && journey.node && !nodeIsEligibleForBrowse) {
      onClearNodeListings?.();
    }
  }, [isNodeListingsActive, nodeIsEligibleForBrowse, journey.node, onClearNodeListings]);

  if (journey.isLoading) {
    return (
      <div className="p-4 space-y-3" data-testid="areas-journey-panel-loading">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (journey.isError) {
    return (
      <div
        className="p-4 flex flex-col items-center text-center gap-2"
        data-testid="areas-journey-panel-error"
      >
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          We couldn't load this area of the map. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={journey.refetch}>
          Retry
        </Button>
      </div>
    );
  }

  if (!journey.node) {
    // Disabled/not-yet-mounted — render nothing (the legacy panel is showing instead).
    return null;
  }

  if (focusedCluster) {
    // Issue #2083 RC_D — restores the region heading + listing-count
    // subtitle this early return previously dropped ENTIRELY on a map
    // cluster-bubble click, leaving the panel with no functional context
    // (which Direction/region this cluster belongs to, how many listings
    // in total). Mirrors NavigationLevelPanel's own heading block — SAME
    // node (`journey.node`), SAME `journey.nodeCount.listingCount` source —
    // so this can never disagree with what the normal (non-focused) level
    // panel would show for the same node. Purely additive: the member
    // list + count-label below (cluster-MEMBERSHIP scoped, legitimately
    // zoom-derived, and correct per this issue's binding instruction) is
    // UNCHANGED, and the panel is not otherwise restructured (#2084 owns
    // that).
    const clusterHeadingListingsLabel =
      journey.nodeCount != null ? formatListingCount(journey.nodeCount.listingCount) : null;
    return (
      <div className="p-4" data-testid="areas-cluster-focus-panel">
        <HierarchyBackButton
          node={journey.node}
          buildHref={buildNodeHref}
          cityLabel={cityLabel ?? 'the city'}
          historyAdjacencyLog={journey.historyAdjacencyLog}
          className="mb-3"
        />
        <div className="mb-3" data-testid="areas-cluster-focus-heading">
          <h2 className="text-base font-semibold text-foreground">{journey.node.displayLabel}</h2>
          {clusterHeadingListingsLabel != null && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="areas-cluster-focus-heading-listings"
            >
              {clusterHeadingListingsLabel}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-3" data-testid="areas-cluster-focus-summary">
          {focusedCluster.countLabel}
        </p>
        {/* Issue #2088 (commit 7, AC4) — "<n> areas in this map view" subset
            copy: the focused cluster's member subset is a SPATIAL/zoom-driven
            subset of `journey.children`'s complete set, never a filtered
            result set of its own — this line makes that relationship
            explicit rather than leaving the member list looking like the
            node's full child set. `journey.children.length` is the SAME
            complete, uncapped direct-child count `NavigationLevelPanel`
            renders (AC3 — no client-side cap), so "total" here can never
            drift from what "Show all" below actually restores. */}
        <p className="text-xs text-muted-foreground mb-3" data-testid="areas-cluster-focus-subset-note">
          {focusedCluster.members.length} area{focusedCluster.members.length === 1 ? '' : 's'} in this map view
        </p>
        <ul className="space-y-2">
          {focusedCluster.members.map((member) => (
            <li key={member.nodeKey}>
              <button
                type="button"
                data-testid={`areas-cluster-focus-member-${member.nodeKey}`}
                data-node-key={member.nodeKey}
                className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:border-primary/60"
                onClick={() => journey.selectNode(member.nodeKey)}
              >
                <span className="font-medium text-sm text-foreground">{member.displayLabel}</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {formatListingCount(member.listingCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          data-testid="areas-cluster-focus-clear"
          // Issue #2088 (commit 7, AC4/BR6) — `onClusterFocusChange(null)` is
          // now backed by `clusterFocus.ts`'s `applyClusterFocusDelta`, which
          // treats `null` as a clear (a `{replace:true}` URL write, never a
          // hierarchy navigation) — this call site itself is unchanged from
          // before this issue; only what it is WIRED TO (the caller's
          // `onClusterFocusChange`, MapDiscovery.tsx) changed.
          onClick={() => onClusterFocusChange?.(null)}
        >
          Show all {journey.children.length} area{journey.children.length === 1 ? '' : 's'}
        </Button>
      </div>
    );
  }

  if (isNodeListingsActive && journey.node && nodeIsEligibleForBrowse) {
    return (
      <NodeListingsSurface
        node={journey.node}
        buildNodeHref={buildNodeHref}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        committedFilters={areaLeafFilters}
        onCommittedFiltersChange={onAreaLeafFiltersChange}
        onAddSchool={onAddSchool}
        selectNode={journey.selectNode}
        onSelectedListingPreviewChange={onSelectedListingPreviewChange}
        onClearNodeListings={onClearNodeListings}
      />
    );
  }

  // Issue #1956 PR-4 — has-listings branch, ADDITIVE and inserted BEFORE the
  // structural empty branch below (render order: has-children/focusedCluster
  // [unchanged, above] -> has-listings [this] -> empty [unchanged, below]).
  // A canonical AREA leaf always has `journey.children.length === 0` (it is
  // the terminal destination — nothing to drill into further), which is
  // exactly why it fell into the structural "areas-journey-panel-empty"
  // branch before this PR. The empty branch below still fires whenever
  // there are no children AND no resolved AreaPoint (cold load, a
  // Direction/Cluster with genuinely zero children, or a node still
  // resolving) — AC4.7's zero-LISTING state is a DIFFERENT, normal listing
  // empty state, rendered here (via AreaSelectedPanel's own loading/empty
  // handling), never the structural "No matches with current filters"
  // literal that belongs to Direction/Local-Destination levels only.
  if (selectedAreaPoint) {
    return (
      <AreaLeafListingsSurface
        areaPoint={selectedAreaPoint}
        node={journey.node}
        buildNodeHref={buildNodeHref}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        committedFilters={areaLeafFilters}
        onCommittedFiltersChange={onAreaLeafFiltersChange}
        mapAreaListings={mapAreaListings}
        mapAreaListingsLoading={mapAreaListingsLoading}
        mapAreaListingsError={mapAreaListingsError}
        mapAreaListingsFetching={mapAreaListingsFetching}
        mapAreaListingsAreaKey={mapAreaListingsAreaKey}
        mapAreaListingsRefetch={mapAreaListingsRefetch}
        onAddSchool={onAddSchool}
        // Issue #1956 PR-5 (AC5.9 breadcrumb omission-class fix) — the SAME
        // journey.selectNode reference (AC3.9's ONE selection action) every
        // other affordance on this surface already dispatches through
        // (cluster-member click, "Show all areas"), so a breadcrumb crumb
        // click can never diverge from the canonical node-navigation path
        // (state/url/navigation.ts's writeNode/applyNodeDelta — the SAME
        // delta buildNodeHref encodes, differentially pinned by
        // navigationCommandMatrix.test.ts). No second history mechanism.
        selectNode={journey.selectNode}
        onSelectedListingPreviewChange={onSelectedListingPreviewChange}
        schools={schools}
        schoolsLoading={schoolsLoading}
        schoolsError={schoolsError}
        onSchoolsRetry={onSchoolsRetry}
        schoolsFetching={schoolsFetching}
        selectedSchool={selectedSchool}
        schoolListings={schoolListings}
        schoolListingsLoading={schoolListingsLoading}
        radiusKm={radiusKm}
        onRadiusChange={onRadiusChange}
        onClearSchool={onClearSchool}
        onSelectSchool={onSelectSchool}
        onStartOver={onStartOver}
        onBackFromSchoolFlow={onBackFromSchoolFlow}
      />
    );
  }

  if (journey.children.length === 0) {
    return (
      <div className="p-4" data-testid="areas-journey-panel-empty">
        <HierarchyBackButton
          node={journey.node}
          buildHref={buildNodeHref}
          cityLabel={cityLabel ?? 'the city'}
          historyAdjacencyLog={journey.historyAdjacencyLog}
          className="mb-3"
        />
        <NavigationLevelPanel
          journey={journey}
          representativeAreaNamesByNodeKey={representativeAreaNamesByNodeKey}
          selectedNodeKey={selectedNodeKey}
          hoveredNodeKey={hoveredNodeKey}
          onHoverChange={onHoverChange}
          cityLabel={cityLabel}
          onBrowseListings={onBrowseListings}
        />
      </div>
    );
  }

  return (
    <div className="p-4" data-testid="areas-journey-panel">
      <HierarchyBackButton
        node={journey.node}
        buildHref={buildNodeHref}
        cityLabel={cityLabel ?? 'the city'}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        className="mb-3"
      />
      <NavigationLevelPanel
        journey={journey}
        representativeAreaNamesByNodeKey={representativeAreaNamesByNodeKey}
        selectedNodeKey={selectedNodeKey}
        hoveredNodeKey={hoveredNodeKey}
        onHoverChange={onHoverChange}
        cityLabel={cityLabel}
        onBrowseListings={onBrowseListings}
      />
    </div>
  );
}

interface AreaLeafListingsSurfaceProps {
  areaPoint: NonNullable<ReturnType<typeof deriveAreaPointFromNode>>;
  node: NavigationNodeResponse;
  buildNodeHref: (nodeKey: string) => string | null;
  historyAdjacencyLog: UseAreasNavigationJourneyResult['historyAdjacencyLog'];
  /**
   * Issue #1956 PR-4 FIX CYCLE 3 (Fix B) — see
   * `DiscoverAreasJourneyPanelProps.areaLeafFilters`/`onAreaLeafFiltersChange`.
   * Optional so `DiscoverAreasJourneyPanel`'s own defensive fallback (used
   * only if a caller omits them) keeps typechecking.
   */
  committedFilters?: PropertyFilters;
  onCommittedFiltersChange?: (next: PropertyFilters) => void;
  /** See `DiscoverAreasJourneyPanelProps.mapAreaListings` — the map's already-fetched primary data source. */
  mapAreaListings?: DiscoverCityListingItem[];
  mapAreaListingsLoading?: boolean;
  mapAreaListingsError?: boolean;
  /** See `DiscoverAreasJourneyPanelProps.mapAreaListingsFetching` — the keepPreviousData refresh-in-flight signal. */
  mapAreaListingsFetching?: boolean;
  /** See `DiscoverAreasJourneyPanelProps.mapAreaListingsAreaKey` — the identity guard. */
  mapAreaListingsAreaKey?: string | null;
  /** See `DiscoverAreasJourneyPanelProps.mapAreaListingsRefetch` — the working Retry handler. */
  mapAreaListingsRefetch?: () => void;
  /** See `DiscoverAreasJourneyPanelProps.onAddSchool` — forwarded unchanged to `AreaSelectedPanel`. */
  onAddSchool?: () => void;
  /**
   * Issue #1956 PR-5 (AC5.9) — the caller's `journey.selectNode` (the ONE
   * canonical selection action, AC3.9), passed through so this surface's
   * breadcrumb Home/City/Region/Group crumbs can navigate without a second,
   * parallel navigation mechanism. Never re-derived here.
   */
  selectNode: (nodeKey: string) => void;
  /** See `DiscoverAreasJourneyPanelProps.onSelectedListingPreviewChange`. */
  onSelectedListingPreviewChange?: (preview: SelectedListingPreview | null) => void;
  /** See `DiscoverAreasJourneyPanelProps` — the #2124 schools-in-area / combined-view props, forwarded unchanged. */
  schools?: SchoolResult[];
  schoolsLoading?: boolean;
  schoolsError?: boolean;
  onSchoolsRetry?: () => void;
  schoolsFetching?: boolean;
  selectedSchool?: SchoolResult | null;
  schoolListings?: DiscoverCityListingItem[];
  schoolListingsLoading?: boolean;
  radiusKm?: number | null;
  onRadiusChange?: (radiusKm: number) => void;
  onClearSchool?: () => void;
  onSelectSchool?: (schoolId: string) => void;
  onStartOver?: () => void;
  onBackFromSchoolFlow?: () => void;
}

/**
 * Issue #1956 PR-4 (AC4.1/AC4.2/AC4.7/AC4.9) — lights up the EXISTING
 * listing surface (`AreaSelectedPanel`: cards, quick filters, within-area
 * search, favourites via `PropertyCard`, trust badges, anonymous price
 * coarsening, Browse All) at a canonical AREA leaf, WITHOUT reaching through
 * the forbidden `DiscoverRightPanel`/`DiscoverRightPanelContainer` legacy
 * panel — this component derives everything it needs directly from the
 * DiscoverProvider facade (the SAME `useDiscoverNav`/`useDiscoverActions`
 * pattern `DiscoverRightPanelContainer` itself uses), FALLING BACK to that
 * pattern only when the caller does not supply `committedFilters`/
 * `onCommittedFiltersChange`. Issue #1956 PR-4 FIX CYCLE 3 (Fix B) —
 * `DiscoverRightPanelContainer` NOW forwards its own `filters`/
 * `handleFiltersChange` props (already received for the legacy
 * `DiscoverRightPanel`, see that container's own prop list) into
 * `DiscoverAreasJourneyPanel` as `areaLeafFilters`/`onAreaLeafFiltersChange`,
 * so the AREA-leaf chip toggle below routes through the SAME page-local
 * filters state `useDiscoverMapData`'s `effectiveFilters` feeds the map's
 * listing/marker query with — one filter identity, not two independent
 * stores.
 *
 * DELIBERATELY a separate component, mounted ONLY from
 * `DiscoverAreasJourneyPanel`'s `if (selectedAreaPoint)` branch: every
 * hook this component calls (useAuth/useDiscoverNav/useDiscoverActions/
 * useDiscoverCityListings) needs its own provider context
 * (AuthProvider/DiscoverProvider/QueryClientProvider). Keeping them OUT of
 * the parent component means every other `DiscoverAreasJourneyPanel` render
 * path (loading/error/node-null/focused-cluster/structural-empty/success-
 * with-children) — including the parent's own pre-existing component test,
 * which renders those paths without those providers — is completely
 * unaffected by this addition.
 */
function AreaLeafListingsSurface({
  areaPoint,
  node,
  buildNodeHref,
  historyAdjacencyLog,
  committedFilters,
  onCommittedFiltersChange,
  mapAreaListings,
  mapAreaListingsLoading,
  mapAreaListingsError,
  mapAreaListingsFetching,
  mapAreaListingsAreaKey,
  mapAreaListingsRefetch,
  onAddSchool,
  selectNode,
  onSelectedListingPreviewChange,
  schools,
  schoolsLoading,
  schoolsError,
  onSchoolsRetry,
  schoolsFetching,
  selectedSchool,
  schoolListings,
  schoolListingsLoading,
  radiusKm,
  onRadiusChange,
  onClearSchool,
  onSelectSchool,
  onStartOver,
  onBackFromSchoolFlow,
}: AreaLeafListingsSurfaceProps) {
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = !authLoading && user !== null;
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const intentListingPurpose = nav.intent === 'rent' ? 'rent' : 'sale';
  const { searchQuery, debouncedSearch, handleSearchChange } = useDiscoverSearchState({
    urlQ: nav.q,
    setUrlSearch: actions.setSearchQuery,
  });
  // Issue #1956 PR-4 FIX PASS 4 (blocking, performance-analyst REQUEST_CHANGES
  // against FIX CYCLE 3's Fix B) — FIX CYCLE 3 pointed the CHIP display at
  // `committedFilters` (below, `effectiveFilters`) but left THIS query's
  // propertyType/bedrooms/minPrice/maxPrice args reading `nav.filters`
  // directly — the URL-derived, ~300ms-debounced copy. That reintroduced the
  // exact class of bug Fix B was meant to close: immediately after a chip
  // toggle, the chips showed the new value while this query (and therefore
  // the cards + "N verified properties" count below) still reflected the
  // stale URL filters until the debounce caught up.
  //
  // `effectiveFilters` (declared once, below) is now the ONE source both this
  // query's four filter args AND the chip-display `filters` prop passed to
  // AreaSelectedPanel read from — `committedFilters` (MapDiscovery's
  // page-local `filters` state, the same state `useDiscoverMapData`'s
  // `effectiveFilters` feeds the map's own listing/marker query with) when
  // the caller supplies it, else `nav.filters` as a defensive fallback for
  // callers/tests that render this component in isolation. Because chips,
  // query args, and (by construction, since areaListingsForPanel/cards/count
  // are derived from this same query's result) cards+count all read the
  // identical `effectiveFilters` value on every render, a chip toggle can
  // never show new chip state next to stale cards/count again.
  //
  // Issue #2353 — true single-sourcing is now implemented: when the caller
  // (AreaFirstJourneyPanel, via `mapAreaListings`) supplies the map's
  // ALREADY-FETCHED `areaListings` (from `useDiscoverMapData`, keyed on the
  // same `effectiveSelectedArea` bridge this journey's node resolves to),
  // this component's OWN `useDiscoverCityListings` call below is disabled
  // (empty `areaKeys`) and the prop data is used instead — closing the
  // duplicate-fetch this comment used to describe as a "named PR-5
  // structural option, not implemented here". `q`/chips/filters identity
  // agreement (the rest of this comment) is unaffected either way: the prop
  // path skips this component's own query+cards divergence risk entirely,
  // and the fallback query path (no prop supplied — this component's own
  // isolated-render/standalone tests) keeps the exact pre-#2353 behaviour
  // described below.
  // A minimal PropertyFilters projection (propertyType/bedrooms/price only —
  // the fuller date/seller/board/category chip set stays on the legacy
  // ActiveContextChips-driven surface; a documented simplification, see the
  // PR-4 report), used by BOTH the query above and the chip-display `filters`
  // prop below.
  // Issue #2353 — the projection logic itself now lives in
  // resolveEffectiveAreaLeafFilters (single source, see that module's doc),
  // called here inside the same useMemo so this component's memoization
  // semantics (recompute only when committedFilters or the four nav.filters
  // fields change) are unchanged.
  const effectiveFilters: PropertyFilters = useMemo(
    () => resolveEffectiveAreaLeafFilters(committedFilters, nav.filters),
    [
      committedFilters,
      nav.filters.propertyTypes,
      nav.filters.bedrooms,
      nav.filters.priceMin,
      nav.filters.priceMax,
      nav.filters.readyToMove,
    ],
  );
  // Issue #2353 — true when the caller supplied the map's already-fetched
  // area listings AND they are actually keyed to THIS resolved leaf. When
  // true, the own query below is disabled (empty `areaKeys` trips
  // `useDiscoverCityListings`' own `enabled: areaKeys.length > 0` gate — see
  // that hook) so this surface never issues a second, identically-scoped
  // fetch. `mapAreaListings` is checked for `undefined` specifically (not
  // falsiness) so a genuinely empty resolved array (`[]`, e.g. an area with
  // zero listings) still counts as "supplied" and is not mistaken for "no
  // prop given".
  //
  // Issue #2353 (code-review fix) — the areaKey check is REQUIRED, not
  // defensive decoration: `resolveEffectiveSelectedArea` (the map-side
  // bridge `mapAreaListings` is fetched against) prefers a legacy `areaKey=`
  // URL param over the canonical `node=` resolution when a URL carries both
  // (a hand-built/bookmarked link — the in-app click path never produces
  // this). Without this guard, that divergence would silently render one
  // area's listings under a DIFFERENT area's heading/breadcrumb here. On any
  // mismatch (or `mapAreaListingsAreaKey` omitted), this falls back to the
  // surface's own query — exactly current pre-#2353 behaviour, i.e. the
  // failure mode degrades to "one extra fetch", never "wrong data".
  const hasMapAreaListings =
    mapAreaListings !== undefined && mapAreaListingsAreaKey === areaPoint.areaKey;
  const areaListingsQuery = useDiscoverCityListings({
    city: resolveEffectiveCity(nav.city),
    areaKeys: hasMapAreaListings ? [] : [areaPoint.areaKey],
    limitPerArea: 50,
    propertyType:
      effectiveFilters.propertyTypes?.length === 1 ? effectiveFilters.propertyTypes[0] : undefined,
    bedrooms: effectiveFilters.bedrooms?.length === 1 ? effectiveFilters.bedrooms[0] : undefined,
    minPrice: effectiveFilters.priceMin != null ? effectiveFilters.priceMin * 100 : undefined,
    maxPrice: effectiveFilters.priceMax != null ? effectiveFilters.priceMax * 100 : undefined,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose: intentListingPurpose,
    // Issue #2023 — CityAreaListingsService now filters on possession_status = 'READY'
    // for this endpoint too, matching markers/navigation-counts/authenticated Browse-all.
    readyToMove: effectiveFilters.readyToMove,
    isAuthenticated,
  });
  // The resolved listings/loading/error/fetching signals this surface renders
  // from — the map-supplied prop when present (and identity-matched), else
  // this component's own (now-disabled-when-prop-present) query above.
  const rawAreaListings = useMemo(
    () =>
      hasMapAreaListings
        ? (mapAreaListings ?? [])
        : (areaListingsQuery.data?.areas.flatMap((a) => a.listings) ?? []),
    [hasMapAreaListings, mapAreaListings, areaListingsQuery.data],
  );
  const isLoadingAreaListingsResolved = hasMapAreaListings
    ? (mapAreaListingsLoading ?? false)
    : areaListingsQuery.isLoading;
  // Issue #2353 (code-review fix) — was hardcoded `false` on the prop path.
  // `useDiscoverCityListings` uses `placeholderData: keepPreviousData`, so on
  // a filter/search rekey it deliberately keeps rendering the PREVIOUS
  // response while a new one is in flight (`isFetching: true`,
  // `isLoading: false`). Hardcoding `false` here dropped that signal
  // entirely, letting the panel present stale cards as fully settled with no
  // fetching indicator — recreating the exact stale-cards/new-controls
  // incoherence #2353 exists to close. `mapAreaListingsFetching` is the SAME
  // query's real `isFetching` (see `useDiscoverMapData.isFetchingAreaListings`).
  const isFetchingAreaListingsResolved = hasMapAreaListings
    ? (mapAreaListingsFetching ?? false)
    : areaListingsQuery.isFetching;
  const isErrorAreaListingsResolved = hasMapAreaListings
    ? (mapAreaListingsError ?? false)
    : areaListingsQuery.isError;
  // Issue #2353 (code-review fix) — was a no-op (`() => undefined`) on the
  // prop path, leaving Retry visibly clickable but non-functional on a real
  // map-fetch error. `mapAreaListingsRefetch` is the SAME query
  // `mapAreaListings`/`mapAreaListingsError` came from
  // (`useDiscoverMapData.refetchAreaListings`), threaded down through
  // `AreaFirstJourneyPanel`, so Retry now re-issues the actual failed
  // request — mirrors the `onSchoolsRetry={schoolsQuery.refetch}` pattern
  // one call site above. Falls back to a no-op only if a caller supplies
  // `mapAreaListings` without also supplying `mapAreaListingsRefetch`
  // (defensive — production always supplies both together).
  const refetchAreaListings = hasMapAreaListings
    ? (mapAreaListingsRefetch ?? (() => undefined))
    : () => areaListingsQuery.refetch();
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
    // stripped for the identical reason, or an anonymous caller viewing this
    // surface would see the exact monthly rent via a backend regression.
    return isAuthenticated
      ? listings
      : listings.map((l) => ({ ...l, pricePaise: undefined, monthlyRentRupees: undefined }));
  }, [rawAreaListings, isAuthenticated]);

  // Issue #1956 PR-5 (AC5.9 breadcrumb omission-class fix) — `node.ancestry`
  // is the SAME server-declared ancestry `HierarchyBackButton` already reads
  // (never re-derived/reconstructed client-side). For a canonical AREA leaf
  // the live tree is City -> DIRECTION -> AREA (depth 1, ancestry length 1)
  // or City -> DIRECTION -> CLUSTER -> AREA (depth 2, ancestry length 2,
  // types.ts's MAX_PUBLIC_DEPTH invariant #14) — so ancestry[0] is always
  // the macro "Region" (DIRECTION) and, when present, ancestry[1] is the
  // "Group" (CLUSTER/Local Destination). Null/undefined when absent, so
  // AreaFirstBreadcrumb omits the crumb entirely (its own established
  // contract) rather than rendering a falsy label.
  const regionAncestor = node.ancestry[0] ?? null;
  const groupAncestor = node.ancestry[1] ?? null;
  const regionName = regionAncestor?.displayLabel ?? null;
  const groupName = groupAncestor?.displayLabel ?? null;

  // Issue #1956 PR-5 (AC5.9) — every crumb dispatches through the SAME
  // `journey.selectNode` (AC3.9's ONE selection action) the cluster-member
  // list and "Show all areas" clear already use elsewhere in this file —
  // never a raw onClick/navigate(-1)/hand-built node key, and never a
  // second history mechanism. "Home" and "City" both resolve to the city
  // root: this canonical node-based journey has no destination between the
  // city's Areas root and leaving Discover entirely, so a distinct "Home"
  // target would have to invent one; instead both crumbs honestly point at
  // the same real, reachable destination (mirrors AreasBreadcrumbTrail's own
  // trail, which likewise begins at the city root as its leading segment).
  const onCrumbHome = () => selectNode(ROOT_NODE_KEY);
  const onCrumbCity = () => selectNode(ROOT_NODE_KEY);
  const onCrumbRegion = regionAncestor ? () => selectNode(regionAncestor.nodeKey) : undefined;
  const onCrumbGroup = groupAncestor ? () => selectNode(groupAncestor.nodeKey) : undefined;

  // Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — projects the currently
  // URL-selected listing (`nav.selectedListing`) against THIS surface's own
  // ALREADY-FETCHED `areaListingsForPanel` (a real `DiscoverCityListingItem[]`
  // — the live DTO `toSelectedListingPreview` is contracted against, re-proven
  // at AC5.10c) — never a second query, never the map's separate
  // `selectedMarkerListing` (a differently-shaped `PropertyListingWithImages`
  // sourced from the marker layer's own fetch). `null` whenever nothing is
  // selected or the selected id fell out of this area's own result set
  // (e.g. a filter tightened after the URL was written).
  const selectedListingPreview = useMemo<SelectedListingPreview | null>(() => {
    if (!nav.selectedListing) return null;
    const match = areaListingsForPanel.find((l) => l.id === nav.selectedListing);
    if (!match) return null;
    return toSelectedListingPreview(match, { isAuthenticated, areaLabel: areaPoint.areaLabel });
  }, [nav.selectedListing, areaListingsForPanel, isAuthenticated, areaPoint.areaLabel]);

  // Reports the derived preview UP to the caller (MapDiscovery), which
  // mounts the mobile Map-mode preview sheet from it — this component makes
  // no assumption about Map/List mode or mobile/desktop; it only reports
  // what listing is currently selected within its own already-fetched set.
  useEffect(() => {
    onSelectedListingPreviewChange?.(selectedListingPreview);
  }, [selectedListingPreview, onSelectedListingPreviewChange]);

  // Issue #1956 PR-4 FIX PASS 4 (blocking, performance-analyst REQUEST_CHANGES,
  // item 3) — `isLoadingListings` (below) was threaded from
  // `areaListingsQuery` but `isError` never was, so a 404/500/timeout settled
  // to `isLoading:false, data:undefined` -> `areaListingsForPanel = []` ->
  // AreaSelectedPanel's own listing-empty branch, presenting a backend
  // failure as the factual claim "0 verified properties in {areaLabel}".
  // `AreaSelectedPanel` (out of this PR's allowed_file_globs — see the panel
  // module doc) has no error/retry prop of its own; it only distinguishes
  // loading vs. empty vs. success. The error/retry AFFORDANCE this codebase
  // already uses ON THIS SURFACE is the one this same component renders for
  // `journey.isError` above (AlertCircle icon + message + Retry button) —
  // reused verbatim here rather than inventing a second error presentation,
  // with its own testid/copy/refetch target for this query.
  if (isErrorAreaListingsResolved) {
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
  // the combined view, never back to the picker) — selecting a school in the
  // schools-in-area branch below writes `schoolId` via `onSelectSchool`
  // (`journeyCommands.selectSchoolById`, made canonical-area-aware in
  // useDiscoverJourneyTransitions.ts) WITHOUT touching `journey`/`node`, so this
  // branch picks it up on the very next render. Both branches reuse the SAME
  // `SchoolsInAreaPanel`/`AreaSchoolCombinedPanel` components + MapDiscovery-owned
  // schools/schoolListings props the legacy `DiscoverRightPanel` already renders
  // for the identical states — no new panel UI, only new callers of it. Wrapped in
  // the SAME bounded flex-column container `AreaSelectedPanel` below relies on
  // (see the FIX CYCLE 4 comment on that wrapper): both panels return a bare
  // Fragment (PanelHeader + an internal `flex-1 overflow-y-auto` region) that
  // needs a real flex-column ancestor with a bounded height to lay out correctly,
  // exactly like `AreaSelectedPanel` needs it in the branch below.
  if (nav.schoolId) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="areas-journey-panel-school-combined">
        <AreaSchoolCombinedPanel
          selectedArea={areaPoint}
          selectedSchool={selectedSchool ?? null}
          listings={schoolListings ?? []}
          isLoadingListings={schoolListingsLoading ?? false}
          isFetching={isFetchingAreaListingsResolved}
          radiusKm={radiusKm ?? null}
          onRadiusChange={onRadiusChange ?? (() => undefined)}
          onClearSchool={onClearSchool ?? (() => undefined)}
          onClearArea={() => undefined}
          filters={effectiveFilters}
          onFiltersChange={(next) => {
            if (onCommittedFiltersChange) {
              onCommittedFiltersChange({
                ...(committedFilters ?? {}),
                propertyTypes: next.propertyTypes,
                bedrooms: next.bedrooms,
                priceMin: next.priceMin,
                priceMax: next.priceMax,
              });
              return;
            }
            actions.setFiltersCommitted({
              ...nav.filters,
              propertyTypes: next.propertyTypes,
              bedrooms: next.bedrooms,
              priceMin: next.priceMin,
              priceMax: next.priceMax,
            });
          }}
          isAuthenticated={isAuthenticated}
          onStartOver={onStartOver}
          onBack={onBackFromSchoolFlow}
          journey="area-first"
          intent={nav.intent}
          selectedListingId={nav.selectedListing}
          onSelectListing={(id) => actions.setSelectedListing(id)}
        />
      </div>
    );
  }

  if (nav.schoolPicking) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="areas-journey-panel-schools-in-area">
        <SchoolsInAreaPanel
          selectedArea={areaPoint}
          onStartOver={onStartOver}
          onBack={onBackFromSchoolFlow}
          journey="area-first"
          schools={schools ?? []}
          schoolsLoading={schoolsLoading}
          schoolsError={schoolsError}
          onSchoolsRetry={onSchoolsRetry}
          schoolsFetching={schoolsFetching}
          onSelectSchool={onSelectSchool}
          areaListings={areaListingsForPanel}
          isLoadingAreaListings={isLoadingAreaListingsResolved}
          isFetching={isFetchingAreaListingsResolved}
          isAuthenticated={isAuthenticated}
          intent={nav.intent}
          selectedListingId={nav.selectedListing}
          onSelectListing={(id) => actions.setSelectedListing(id)}
        />
      </div>
    );
  }

  return (
    // Issue #1956 PR-4 FIX CYCLE 4 (scope_amendment n=4, mobile reachability)
    // — was a plain `<div className="p-4">`: a block-level box with no
    // bounded height, so AreaSelectedPanel's OWN root classes (`flex flex-1
    // flex-col overflow-y-auto` — AreaSelectedPanel.tsx:240, out of this PR's
    // allowed_file_globs, unedited) were inert: `flex-1` needs a flex
    // parent, `overflow-y-auto` needs a bounded height, and this wrapper
    // supplied neither. The card list only "scrolled" via the whole
    // document growing past the viewport, leaving `View details` on card 1
    // structurally below the 844px mobile viewport (confirmed live at
    // 390x844: y=1193.9). Making THIS wrapper a real bounded flex column
    // (`flex-1 min-h-0` on the mobile column-direction ancestor,
    // `overflow-hidden` to stop content leaking into ancestors) is the
    // SAME pattern the legacy `DiscoverRightPanel` root already uses
    // (`flex flex-col ... overflow-hidden`,
    // src/components/discover/DiscoverRightPanel.tsx:1878) — no new layout
    // abstraction, just the missing constraint. `p-4` is unchanged (still
    // applies to both children identically), so AreaSelectedPanel's visual
    // inset is unaffected. Desktop is unaffected: on the row-direction
    // desktop layout this div already got its full height via flex
    // align-items:stretch (the same mechanism the legacy root relies on,
    // since neither sets an explicit height); `overflow-hidden` merely
    // makes that already-present height a real clipping boundary, matching
    // legacy. `flex-1` on the row's main axis (width) competes for the
    // remaining space exactly as the previous unconstrained block div did.
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4"
      data-testid="areas-journey-panel-listings"
    >
      <HierarchyBackButton
        node={node}
        buildHref={buildNodeHref}
        cityLabel={CITY_CONFIG[nav.city]?.label ?? nav.city}
        historyAdjacencyLog={historyAdjacencyLog}
        className="mb-3 shrink-0"
      />
      <AreaSelectedPanel
        selectedArea={areaPoint}
        // FIX CYCLE 2 (opus review, nit) — was omitted, so AreaSelectedPanel's
        // breadcrumb fell back to the area label for cityLabel too, rendering
        // "Manipal › Manipal" instead of "Udupi › Manipal". Same
        // `CITY_CONFIG[city]?.label ?? city` derivation MapDiscovery.tsx and
        // DiscoverMapContextOverlay.tsx already use for this exact prop.
        cityLabel={CITY_CONFIG[nav.city]?.label ?? nav.city}
        // Issue #1956 PR-5 (AC5.9 breadcrumb omission-class fix) — the six
        // previously-omitted breadcrumb props (this call site passed ONLY
        // `cityLabel` before this fix — a sibling omission to PR-4 FIX
        // CYCLE 2, which fixed `cityLabel` alone and left these six). See
        // this component's own derivation above for regionName/groupName/
        // onCrumb* semantics.
        regionName={regionName}
        groupName={groupName}
        onCrumbHome={onCrumbHome}
        onCrumbCity={onCrumbCity}
        onCrumbRegion={onCrumbRegion}
        onCrumbGroup={onCrumbGroup}
        areaListings={areaListingsForPanel}
        isLoadingListings={isLoadingAreaListingsResolved}
        // Issue #2353 (code-review fix) — was omitted at this call site, so
        // AreaSelectedPanel's own `isFetching && !isInitialLoading` dimmed/
        // disabled-overlay convention (its established signal for "showing
        // stale keepPreviousData while a refetch is in flight") never fired
        // here, even once `isFetchingAreaListingsResolved` itself was fixed
        // to stop being hardcoded `false`. This is the plain (no-school)
        // AREA-leaf branch — the one a filter/search rekey most commonly
        // hits — so it is exactly the path the stale-cards-as-settled bug
        // described.
        isFetching={isFetchingAreaListingsResolved}
        isAuthenticated={isAuthenticated}
        filters={effectiveFilters}
        onFiltersChange={(next) => {
          // Issue #1956 PR-4 FIX CYCLE 3 (blocking Fix B) — route through the
          // SAME committed filters state/handler the map's query is built
          // from (see the module doc above) so a chip toggle produces ONE
          // filter identity across the URL, this panel's cards/count, and
          // the map's markers. Falls back to the old URL-only
          // `setFiltersCommitted` write only when no caller-supplied handler
          // is present (defensive — production always supplies one via
          // `DiscoverRightPanelContainer`).
          if (onCommittedFiltersChange) {
            onCommittedFiltersChange({
              ...(committedFilters ?? {}),
              propertyTypes: next.propertyTypes,
              bedrooms: next.bedrooms,
              priceMin: next.priceMin,
              priceMax: next.priceMax,
              // Issue #2023 — was missing, so a readyToMove toggle from
              // AreaSelectedPanel's quick-filter chip was silently dropped on commit.
              readyToMove: next.readyToMove,
            });
            return;
          }
          actions.setFiltersCommitted({
            ...nav.filters,
            propertyTypes: next.propertyTypes,
            bedrooms: next.bedrooms,
            priceMin: next.priceMin,
            priceMax: next.priceMax,
            readyToMove: next.readyToMove,
          });
        }}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedListingId={nav.selectedListing}
        onSelectListing={(id) => actions.setSelectedListing(id)}
        intent={nav.intent}
        onAddSchool={onAddSchool}
        // Issue #2023 (BLOCKING review fix) — this AREA-leaf surface's listings
        // come from `useDiscoverCityListings` (see `areaListingsForPanel` /
        // `areaListingsQuery` above), which now forwards `readyToMove` to
        // `CityAreaListingsService` and filters on `possession_status = 'READY'`,
        // for both anon and authenticated callers — the same predicate
        // markers/navigation-counts/authenticated "Browse all" already apply.
        // The chip is genuinely functional here now, so it stays enabled —
        // prop omitted, relying on AreaSelectedPanel's own `= true` default,
        // same as `NodeListingsSurface`'s "Browse all" surface.
      />
    </div>
  );
}
