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

// ─── Chip-offset declutter pass (Issue #1810 Stage 2A) ──────────────────────
//
// Design spec: docs/design/retrends-design-system/ui_kits/discover/src/
// MARKER_PLACEMENT_SPEC.md §1/§3/§4. ONLY area-cluster CHIPS may be offset in
// screen space — representative/dot labels are never moved (they truncate
// instead, handled presentationally in AreaMarkerLayer.tsx). A chip starts at
// its true member centroid; on a DETECTED footprint collision against an
// already-placed chip it is moved to the zero-overlap candidate among 15
// deterministic offsets, or — if the map is genuinely full (no zero-overlap
// candidate exists) — merged into the first colliding chip rather than left
// visually overlapping. Pure + deterministic: no Math.random/Date, and the
// input cluster order is re-sorted by cellKey defensively so output never
// depends on caller iteration order.

/** Chip footprint (design-spec §4): 176x64px, centre-anchored on the placed point. */
const CHIP_W = 176;
const CHIP_H = 64;
/** Leader-line rule (design-spec §1): below this offset distance, no leader is drawn. */
const LEADER_THRESHOLD_PX = 16;

/**
 * 15 deterministic candidate offsets: the true centroid itself (tried first —
 * so a chip with no collision never moves), then two rings of 7 evenly-spaced
 * angular positions. Fixed constants only (no Math.random/Date).
 */
function buildCandidateOffsets(): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
  const ringRadii = [56, 96];
  const perRing = 7;
  for (const radius of ringRadii) {
    for (let i = 0; i < perRing; i++) {
      const angle = (2 * Math.PI * i) / perRing;
      offsets.push({
        dx: Math.round(Math.cos(angle) * radius),
        dy: Math.round(Math.sin(angle) * radius),
      });
    }
  }
  return offsets;
}

const CANDIDATE_OFFSETS = buildCandidateOffsets();

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return Math.abs(ax - bx) * 2 < (aw + bw) && Math.abs(ay - by) * 2 < (ah + bh);
}

export interface ClusterChipPlacement {
  offsetX: number;
  offsetY: number;
  /** True when the chip's visual centre is >=16px from its true centroid (design-spec §1). */
  showLeader: boolean;
}

export interface ChipPlacementResult {
  /** Post-merge cluster list, in deterministic cellKey order. Anchors are unchanged (never moved). */
  clusters: AreaCluster[];
  /** Presentation-only offsets keyed by the (possibly merged) cluster's cellKey. */
  placements: Record<string, ClusterChipPlacement>;
}

/**
 * Computes presentation-only screen-space offsets for area-cluster CHIPS only.
 * Never persisted, never URL round-tripped, never mutates a true geo anchor —
 * callers must re-run this on zoom/level/dataset/resize only (never on pan or
 * hover) to satisfy the stability contract (design-spec §5).
 */
export function computeClusterChipPlacements(
  clusters: AreaCluster[],
  project: (lat: number, lon: number) => AreaMarkerProjection,
): ChipPlacementResult {
  const sorted = [...clusters].sort((a, b) => (a.cellKey < b.cellKey ? -1 : a.cellKey > b.cellKey ? 1 : 0));

  const placedChips: { cellKey: string; x: number; y: number }[] = [];
  const outClusters: AreaCluster[] = [];
  const placements: Record<string, ClusterChipPlacement> = {};

  for (const cluster of sorted) {
    const centroid = project(cluster.anchor.lat, cluster.anchor.lon);

    let zeroOverlapCandidate: { dx: number; dy: number } | null = null;
    let bestOverlapCount = Infinity;
    let mergeTargetIndex = -1;

    for (const candidate of CANDIDATE_OFFSETS) {
      const cx = centroid.x + candidate.dx;
      const cy = centroid.y + candidate.dy;
      let overlapCount = 0;
      let firstOverlapIdx = -1;
      for (let i = 0; i < placedChips.length; i++) {
        const placed = placedChips[i];
        if (rectsOverlap(cx, cy, CHIP_W, CHIP_H, placed.x, placed.y, CHIP_W, CHIP_H)) {
          overlapCount++;
          if (firstOverlapIdx === -1) firstOverlapIdx = i;
        }
      }
      if (overlapCount === 0) {
        zeroOverlapCandidate = candidate;
        break;
      }
      if (overlapCount < bestOverlapCount) {
        bestOverlapCount = overlapCount;
        mergeTargetIndex = firstOverlapIdx;
      }
    }

    if (zeroOverlapCandidate) {
      placedChips.push({
        cellKey: cluster.cellKey,
        x: centroid.x + zeroOverlapCandidate.dx,
        y: centroid.y + zeroOverlapCandidate.dy,
      });
      const dist = Math.hypot(zeroOverlapCandidate.dx, zeroOverlapCandidate.dy);
      placements[cluster.cellKey] = {
        offsetX: zeroOverlapCandidate.dx,
        offsetY: zeroOverlapCandidate.dy,
        showLeader: dist >= LEADER_THRESHOLD_PX,
      };
      outClusters.push(cluster);
    } else {
      // Genuinely full (no zero-overlap candidate among the 15) — merge into
      // the first colliding already-placed chip rather than render a residual
      // overlap (design-spec §3: "chips whose footprints overlap merge").
      const targetCellKey = placedChips[mergeTargetIndex]?.cellKey;
      const targetIdx = outClusters.findIndex((c) => c.cellKey === targetCellKey);
      if (targetIdx >= 0) {
        const target = outClusters[targetIdx];
        const mergedAreas = [...target.areas, ...cluster.areas];
        outClusters[targetIdx] = { ...target, areas: mergedAreas, count: mergedAreas.length };
      }
    }
  }

  return { clusters: outClusters, placements };
}

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
