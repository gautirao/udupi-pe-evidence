/**
 * Issue #2660 — the Areas journey's component contracts, as cohesive
 * capability groups (the issue's binding "Prop modelling / component-
 * contract directive"). Each group answers one sentence:
 *
 *   view.hierarchy      — where the shopper is in the canonical node tree.
 *   view.cluster        — which visual map cluster (if any) is focused.
 *   view.results        — the AREA leaf's committed filters and result source.
 *   view.schools        — the area-first schools-in-area / combined-view data.
 *   view.city           — the city display label.
 *   commands.hierarchy  — select / hover a node, retry the hierarchy load.
 *   commands.cluster    — change or clear the focused cluster.
 *   commands.results    — change filters, report the selected listing, redraw.
 *   commands.schools    — enter picking, pick / clear a school, radius, retry, back.
 *   commands.navigation — hierarchy Back href, node Browse-all on/off, start over.
 *
 * Field types are derived from their authoritative owners (the journey hook,
 * NavigationLevelPanel, the School panels' shared contracts) wherever one
 * exists, so an upstream rename is a compile error here rather than drift.
 */
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { NavigationLevelPanelProps } from '@/components/discover/navigation/NavigationLevelPanel';
import type { SchoolQueryState } from '@/components/discover/panels/schools/shared/schoolJourneyContracts';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { AreaLeafResultSourceView } from './results/areaLeafResultSources';

// ── Hierarchy ──────────────────────────────────────────────────────────────

/**
 * The read side of the ONE `useAreasNavigationJourney` result (#2142 — the
 * map and this panel read the same instance, so they can never diverge on
 * node identity or counts). Callers pass the hook result object itself; this
 * Pick only narrows what the panel may read. Its actions are NOT here — they
 * arrive as `commands.hierarchy`.
 */
export type AreasJourneyHierarchyState = Pick<
  UseAreasNavigationJourneyResult,
  | 'isLoading'
  | 'isError'
  | 'node'
  | 'levelKind'
  | 'children'
  | 'resolutionNotice'
  | 'nodeCount'
  | 'historyAdjacencyLog'
>;

export interface AreasJourneyHierarchyView {
  journey: AreasJourneyHierarchyState;
  /** `nodeListings=1` — the node-level Browse-all surface is requested (#2087 gates it). */
  isNodeListingsActive?: boolean;
  selectedNodeKey?: NavigationLevelPanelProps['selectedNodeKey'];
  hoveredNodeKey?: NavigationLevelPanelProps['hoveredNodeKey'];
  representativeAreaNamesByNodeKey?: NavigationLevelPanelProps['representativeAreaNamesByNodeKey'];
}

export interface AreasJourneyHierarchyCommands {
  /** The ONE canonical selection action (AC3.9) — every crumb/member/child dispatches through it. */
  selectNode: UseAreasNavigationJourneyResult['selectNode'];
  retry: UseAreasNavigationJourneyResult['refetch'];
  hoverNode?: NavigationLevelPanelProps['onHoverChange'];
}

// ── Cluster focus (presentation-only; never writes `node=`) ──────────────────

export interface AreasJourneyClusterView {
  /** The member areaKeys of the focused visual AREA cluster; null/empty = no focus. */
  focusedMemberAreaKeys?: readonly string[] | null;
}

export interface AreasJourneyClusterCommands {
  /** `null` clears focus (a `{replace:true}` URL write, never a hierarchy navigation — #2088 BR6). */
  changeFocus?: (memberAreaKeys: readonly string[] | null) => void;
}

// ── AREA-leaf results ────────────────────────────────────────────────────────

export interface AreasJourneyResultsView {
  /** The page-local committed filters the map's own query reads (#1956 PR-4 Fix B). */
  filters?: PropertyFilters;
  /** The ONE discriminated result-source contract (see `areaLeafResultSources.ts`). */
  source: AreaLeafResultSourceView;
}

export interface AreasJourneyResultsCommands {
  /** The single writer for `view.results.filters`. */
  changeFilters?: (next: PropertyFilters) => void;
  /** Lifts the selected listing's anonymous-safe preview to the page (AC5.10). */
  reportSelectedListingPreview?: (preview: SelectedListingPreview | null) => void;
  /** POLYGON zero-result "Adjust boundary" (#2018 slice 3) — commits nothing itself. */
  redrawPolygon?: () => void;
}

// ── Schools within the Area journey (#2124) ──────────────────────────────────

export interface AreasJourneySchoolView {
  /** The schools-in-area query (MapDiscovery-owned; never re-fetched here). */
  inArea: SchoolQueryState<SchoolResult[] | undefined>;
  /** The school picked for the combined area+school view (`schoolId=`). */
  selected?: SchoolResult | null;
  /** Listings around the selected school (MapDiscovery-owned query). */
  selectedListings: Pick<SchoolQueryState<DiscoverCityListingItem[] | undefined>, 'data' | 'loading'>;
  radiusKm?: number | null;
}

export interface AreasJourneySchoolCommands {
  /** Enters the area-first school-picking sub-step without flipping `journey` (#1157). */
  enterPicking?: () => void;
  select?: (schoolId: string) => void;
  clear?: () => void;
  retry?: () => void;
  changeRadius?: (radiusKm: number) => void;
  /** The page's 3-rung area-first Back ladder (schoolId -> schoolPicking -> area). */
  back?: () => void;
}

// ── Navigation between hierarchy destinations ────────────────────────────────

export interface AreasJourneyNavigationCommands {
  /** Pure href builder for the in-app hierarchy Back control (canonical parent). */
  buildNodeHref: (nodeKey: string) => string | null;
  /** Enter the node-level Browse-all listings surface (`nodeListings=1`). */
  browseListings?: () => void;
  /** Leave it (also the #2087 ineligible deep-link clear). */
  clearNodeListings?: () => void;
  startOver?: () => void;
}

// ── Public panel contract ────────────────────────────────────────────────────

export interface DiscoverAreasJourneyPanelView {
  hierarchy: AreasJourneyHierarchyView;
  cluster: AreasJourneyClusterView;
  results: AreasJourneyResultsView;
  schools: AreasJourneySchoolView;
  city: { label?: string };
}

export interface DiscoverAreasJourneyPanelCommands {
  hierarchy: AreasJourneyHierarchyCommands;
  cluster: AreasJourneyClusterCommands;
  results: AreasJourneyResultsCommands;
  schools: AreasJourneySchoolCommands;
  navigation: AreasJourneyNavigationCommands;
}

// ── AREA-leaf surface contract ───────────────────────────────────────────────

export interface AreaLeafListingsSurfaceView {
  /** The resolved canonical AREA leaf this surface lists. */
  leaf: {
    areaPoint: NonNullable<ReturnType<typeof deriveAreaPointFromNode>>;
    node: NavigationNodeResponse;
    historyAdjacencyLog: UseAreasNavigationJourneyResult['historyAdjacencyLog'];
  };
  results: AreasJourneyResultsView;
  schools: AreasJourneySchoolView;
}

export interface AreaLeafListingsSurfaceCommands {
  hierarchy: Pick<AreasJourneyHierarchyCommands, 'selectNode'>;
  navigation: Pick<AreasJourneyNavigationCommands, 'buildNodeHref' | 'startOver'>;
  results: AreasJourneyResultsCommands;
  schools: AreasJourneySchoolCommands;
}
