/**
 * Pure, Leaflet-free area-marker degradation / bucketing algorithm.
 *
 * Issue #1798 PR-B — design-spec-area-marker-ux.md §1-§3. Extracted as a pure
 * module (no browser/map dependency) so the acceptance-critical ranking +
 * spatial-spread logic is unit-testable without mounting a map. A thin
 * Leaflet-aware wrapper (AreaMarkerLayer.tsx) supplies the real projection via
 * `useMap().latLngToContainerPoint`.
 *
 * Determinism is mandatory: identical input MUST produce identical output.
 * No Math.random, no Date, no reliance on Set/Map iteration order for
 * anything that affects the result (Set inputs are materialized into sorted
 * arrays before use).
 */

export interface RankableArea {
  id: string;
  name: string;
  count: number;
  lat: number;
  lon: number;
}

export interface AreaMarkerProjection {
  x: number;
  y: number;
}

export interface AreaMarkerViewport {
  width: number;
  height: number;
}

export interface AreaMarkerGroupBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface AreaMarkerForcedInput {
  selectedId?: string | null;
  searchMatchIds?: Set<string>;
  hoveredOrFocusedId?: string | null;
}

export interface ComputeAreaMarkersInput {
  areas: RankableArea[];
  project: (lat: number, lon: number) => AreaMarkerProjection;
  viewport: AreaMarkerViewport;
  zoom: number;
  /** Grid cell size in px. Default 110 (design-spec §3: 100-120px). */
  cellPx?: number;
  /** Global cap on labelled representative pins. Default 12. */
  labelCap?: number;
  forced: AreaMarkerForcedInput;
  groupBounds: AreaMarkerGroupBounds;
}

export interface AreaCluster {
  cellKey: string;
  areas: RankableArea[];
  dominantName: string;
  /** Member AREA count — never a property/listing count sum. */
  count: number;
  anchor: { lat: number; lon: number };
}

export type AreaMarkerBand = '1-8' | '9-15' | '16-30' | '30+';

export interface BucketingResult {
  representatives: RankableArea[];
  clusters: AreaCluster[];
  dots: RankableArea[];
  band: AreaMarkerBand;
}

const DEFAULT_CELL_PX = 110;
const DEFAULT_LABEL_CAP = 12;
// design-spec §1: 9-15 band shows "top ~6-8 by rank labeled; rest are dots".
const BAND_9_15_REP_CAP = 8;

// ─── Band selection ─────────────────────────────────────────────────────────

export function computeBand(areaCount: number): AreaMarkerBand {
  if (areaCount <= 8) return '1-8';
  if (areaCount <= 15) return '9-15';
  if (areaCount <= 30) return '16-30';
  return '30+';
}

// ─── Ranking ────────────────────────────────────────────────────────────────

function squaredDistanceToCentroid(area: RankableArea, bounds: AreaMarkerGroupBounds): number {
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLon = (bounds.minLon + bounds.maxLon) / 2;
  const dLat = area.lat - centerLat;
  const dLon = area.lon - centerLon;
  return dLat * dLat + dLon * dLon;
}

/**
 * Rank comparator (design-spec §2, forced-always excluded — handled separately):
 *   1. Property count, descending (primary relevance signal).
 *   2. Centrality — distance to group-bounds centroid, ascending (closer wins ties).
 *   3. Stable id tiebreak, ascending — guarantees full determinism regardless of
 *      input array order or Set iteration order.
 */
function makeRankComparator(bounds: AreaMarkerGroupBounds) {
  return (a: RankableArea, b: RankableArea): number => {
    if (b.count !== a.count) return b.count - a.count;
    const da = squaredDistanceToCentroid(a, bounds);
    const db = squaredDistanceToCentroid(b, bounds);
    if (da !== db) return da - db;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  };
}

// ─── Quadrant coverage guarantee ────────────────────────────────────────────

type QuadrantKey = 'NE' | 'NW' | 'SE' | 'SW';

function quadrantOf(area: RankableArea, bounds: AreaMarkerGroupBounds): QuadrantKey {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLon = (bounds.minLon + bounds.maxLon) / 2;
  const ns = area.lat >= midLat ? 'N' : 'S';
  const ew = area.lon >= midLon ? 'E' : 'W';
  return `${ns}${ew}` as QuadrantKey;
}

// ─── Grid bucketing (16-30 / 30+ bands) ─────────────────────────────────────

interface GridCell {
  cellKey: string;
  /** Members sorted best-ranked first. */
  members: RankableArea[];
}

function buildGridCells(
  areas: RankableArea[],
  project: (lat: number, lon: number) => AreaMarkerProjection,
  cellPx: number,
  rankComparator: (a: RankableArea, b: RankableArea) => number,
): GridCell[] {
  const cellMap = new Map<string, RankableArea[]>();
  for (const area of areas) {
    const { x, y } = project(area.lat, area.lon);
    const cellKey = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    const members = cellMap.get(cellKey);
    if (members) {
      members.push(area);
    } else {
      cellMap.set(cellKey, [area]);
    }
  }
  const cells: GridCell[] = [];
  // Sort cellKeys for deterministic iteration regardless of Map insertion order.
  const cellKeys = [...cellMap.keys()].sort();
  for (const cellKey of cellKeys) {
    const members = [...(cellMap.get(cellKey) ?? [])].sort(rankComparator);
    cells.push({ cellKey, members });
  }
  return cells;
}

/**
 * Selects which occupied cells get a labelled representative, applying the
 * global cap while guaranteeing >=1 representative per non-empty quadrant
 * (design-spec §3 step 4).
 */
function selectCellsForRepresentation(
  cells: GridCell[],
  cap: number,
  bounds: AreaMarkerGroupBounds,
  rankComparator: (a: RankableArea, b: RankableArea) => number,
): Set<string> {
  if (cells.length <= cap) {
    return new Set(cells.map((c) => c.cellKey));
  }

  // Cells ranked globally by their best (top-ranked) member, best first.
  const cellsByRank = [...cells].sort((a, b) => rankComparator(a.members[0], b.members[0]));

  const byQuadrant = new Map<QuadrantKey, GridCell[]>();
  for (const cell of cellsByRank) {
    const q = quadrantOf(cell.members[0], bounds);
    const list = byQuadrant.get(q);
    if (list) {
      list.push(cell);
    } else {
      byQuadrant.set(q, [cell]);
    }
  }

  const selected = new Set<string>();
  // Reserve the single best-ranked cell from each non-empty quadrant first,
  // in a deterministic (alphabetical) quadrant order.
  const quadrantKeys = [...byQuadrant.keys()].sort();
  for (const q of quadrantKeys) {
    if (selected.size >= cap) break;
    const best = byQuadrant.get(q)?.[0];
    if (best) selected.add(best.cellKey);
  }

  // Fill remaining slots with the next-best-ranked cells globally.
  for (const cell of cellsByRank) {
    if (selected.size >= cap) break;
    if (!selected.has(cell.cellKey)) selected.add(cell.cellKey);
  }

  return selected;
}

function computeGridBands(
  areas: RankableArea[],
  input: ComputeAreaMarkersInput,
  rankComparator: (a: RankableArea, b: RankableArea) => number,
): { representatives: RankableArea[]; clusters: AreaCluster[]; dots: RankableArea[] } {
  const cellPx = input.cellPx ?? DEFAULT_CELL_PX;
  const labelCap = input.labelCap ?? DEFAULT_LABEL_CAP;

  const cells = buildGridCells(areas, input.project, cellPx, rankComparator);
  const selectedCellKeys = selectCellsForRepresentation(cells, labelCap, input.groupBounds, rankComparator);

  const representatives: RankableArea[] = [];
  const clusters: AreaCluster[] = [];
  const dots: RankableArea[] = [];

  for (const cell of cells) {
    if (selectedCellKeys.has(cell.cellKey)) {
      // Cell keeps its labelled representative; remaining members fold into
      // a cluster (2+ extras) or a lone hover-dot (exactly 1 extra).
      const [rep, ...rest] = cell.members;
      representatives.push(rep);
      if (rest.length === 1) {
        dots.push(rest[0]);
      } else if (rest.length >= 2) {
        clusters.push({
          cellKey: cell.cellKey,
          areas: rest,
          dominantName: rep.name,
          count: rest.length,
          anchor: { lat: rep.lat, lon: rep.lon },
        });
      }
    } else {
      // Cell was cut by the global cap — the whole cell (including its
      // would-be representative) folds together so the demoted anchor is
      // never silently dropped from the data model.
      if (cell.members.length === 1) {
        dots.push(cell.members[0]);
      } else {
        const [rep, ...rest] = cell.members;
        clusters.push({
          cellKey: cell.cellKey,
          areas: cell.members,
          dominantName: rep.name,
          count: cell.members.length,
          anchor: { lat: rep.lat, lon: rep.lon },
        });
        void rest; // rest already included in cluster.areas via cell.members
      }
    }
  }

  return { representatives, clusters, dots };
}

// ─── Forced-always promotion ─────────────────────────────────────────────────

function collectForcedIds(forced: AreaMarkerForcedInput): string[] {
  const ids = new Set<string>();
  if (forced.selectedId) ids.add(forced.selectedId);
  if (forced.hoveredOrFocusedId) ids.add(forced.hoveredOrFocusedId);
  if (forced.searchMatchIds) {
    for (const id of forced.searchMatchIds) ids.add(id);
  }
  // Sorted for deterministic iteration — Set insertion order is not relied upon.
  return [...ids].sort();
}

/**
 * Pulls forced-always areas (selected / search-matched / hovered-focused) out
 * of clusters and dots into representatives, bypassing the label cap
 * (design-spec §2 rule 1, §5, §7).
 */
function applyForcedAlways(
  result: { representatives: RankableArea[]; clusters: AreaCluster[]; dots: RankableArea[] },
  forcedIds: string[],
): { representatives: RankableArea[]; clusters: AreaCluster[]; dots: RankableArea[] } {
  if (forcedIds.length === 0) return result;

  const forcedIdSet = new Set(forcedIds);
  const repIds = new Set(result.representatives.map((a) => a.id));
  const representatives = [...result.representatives];
  const dots: RankableArea[] = [];
  const clusters: AreaCluster[] = [];

  for (const area of result.dots) {
    if (forcedIdSet.has(area.id) && !repIds.has(area.id)) {
      representatives.push(area);
      repIds.add(area.id);
    } else {
      dots.push(area);
    }
  }

  for (const cluster of result.clusters) {
    const remaining: RankableArea[] = [];
    for (const area of cluster.areas) {
      if (forcedIdSet.has(area.id) && !repIds.has(area.id)) {
        representatives.push(area);
        repIds.add(area.id);
      } else {
        remaining.push(area);
      }
    }
    if (remaining.length === 0) {
      // The whole cluster was promoted away — drop it.
      continue;
    }
    if (remaining.length === cluster.areas.length) {
      // Nothing changed — keep as-is.
      clusters.push(cluster);
      continue;
    }
    // Cluster shrank; recompute dominantName/anchor from the remaining
    // best-ranked member so a promoted dominant area doesn't leave stale
    // metadata behind.
    const stillDominant = remaining.find((a) => a.name === cluster.dominantName);
    const newAnchorArea = stillDominant ?? remaining[0];
    if (remaining.length === 1) {
      // A single leftover reads better as a hover dot than a "+1 areas" chip.
      dots.push(remaining[0]);
    } else {
      clusters.push({
        cellKey: cluster.cellKey,
        areas: remaining,
        dominantName: newAnchorArea.name,
        count: remaining.length,
        anchor: { lat: newAnchorArea.lat, lon: newAnchorArea.lon },
      });
    }
  }

  return { representatives, clusters, dots };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function computeAreaMarkers(input: ComputeAreaMarkersInput): BucketingResult {
  const band = computeBand(input.areas.length);
  const rankComparator = makeRankComparator(input.groupBounds);
  const sortedAreas = [...input.areas].sort(rankComparator);

  let core: { representatives: RankableArea[]; clusters: AreaCluster[]; dots: RankableArea[] };

  if (band === '1-8') {
    core = { representatives: sortedAreas, clusters: [], dots: [] };
  } else if (band === '9-15') {
    const repCount = Math.min(BAND_9_15_REP_CAP, sortedAreas.length);
    core = {
      representatives: sortedAreas.slice(0, repCount),
      clusters: [],
      dots: sortedAreas.slice(repCount),
    };
  } else {
    core = computeGridBands(sortedAreas, input, rankComparator);
  }

  const forcedIds = collectForcedIds(input.forced);
  const withForced = applyForcedAlways(core, forcedIds);

  // Deterministic output ordering: representatives + dots by rank, clusters by cellKey.
  const representatives = [...withForced.representatives].sort(rankComparator);
  const dots = [...withForced.dots].sort(rankComparator);
  const clusters = [...withForced.clusters].sort((a, b) => (a.cellKey < b.cellKey ? -1 : a.cellKey > b.cellKey ? 1 : 0));

  return { representatives, clusters, dots, band };
}
