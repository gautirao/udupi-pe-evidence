/**
 * areaClustering.ts — Issue #1956 PR 3 (Slice 4).
 *
 * Deterministic SCREEN-SPACE grid clustering for dense AREA children of the
 * canonical Areas hierarchy. This module is PURE: no DOM, no Leaflet import,
 * no React, no randomness, no async, no reliance on object-iteration order.
 * The caller (`AreaMarkerLayer.tsx`) supplies a `project` function (the map's
 * own lat/lon -> container-pixel projection) and the current zoom; this
 * module never touches a map instance itself.
 *
 * ── ALGORITHM ──
 * Cell assignment is a pure function of (projected pixel x/y at the supplied
 * zoom, a fixed cell size): each member is projected once, floor-divided into
 * an integer grid cell, and grouped by that cell. Nothing here depends on the
 * ORDER members arrive in — every member array is deterministically sorted
 * (by `areaKey`, which is unique, so the sort is a TOTAL order with no ties)
 * before it is returned, and the cluster list itself is sorted by grid
 * coordinate. Two calls with identical members + `project` + `zoom` therefore
 * produce byte-identical output, including when every member sits at the
 * exact same coordinate (determinism then comes entirely from the `areaKey`
 * tie-break, never from incidental coordinate separation).
 *
 * ── MEMBERSHIP IS BY areaKey, NEVER BY displayLabel ──
 * A cluster's members are the literal `ClusterableAreaMember` objects passed
 * in, keyed and de-duplicated by `areaKey`. Two members may legitimately share
 * a `displayLabel` (or have labels that look swapped) without that ever
 * affecting which cluster they land in or how they sort within it.
 *
 * ── FAIL-SAFE (AC4.21) ──
 * A member with a null/undefined/non-finite centroid, `(0, 0)` ("Null
 * Island"), or a lat/lon outside the physically valid range is OMITTED from
 * clustering entirely — never fabricated, interpolated, or defaulted to zero.
 * Omitted members are returned separately (`omitted`) so a caller can still
 * account for them (e.g. in diagnostics) without ever rendering them at an
 * invented position. An optional `plausibilityBounds` lets a caller additionally
 * reject a coordinate that is technically valid lat/lon but implausible for
 * the current city/viewport (e.g. a data-entry error placing an area on
 * another continent).
 *
 * ── VISIBILITY BEFORE CLUSTERING ──
 * `clusterVisibleAreaMembers` composes the existing journey-aware visibility
 * predicate (`journeyVisibility.isMemberEligible`) with this module's grid
 * clusterer so a zero-content member NEVER reaches a cluster and is NEVER
 * counted in any hidden/representative arithmetic downstream
 * (`representativeNames.ts`). Visibility is applied strictly BEFORE grouping,
 * never after — a cluster can never advertise a member it would not itself
 * show.
 */
import { isMemberEligible, type DiscoverJourney } from './journeyVisibility';

/** One AREA child as the clusterer consumes it. */
export interface ClusterableAreaMember {
  nodeKey: string;
  areaKey: string;
  displayLabel: string;
  lat: number;
  lon: number;
  /** Journey-aware LISTING count (Areas journey eligibility dimension). */
  listingCount: number;
  /** Stable server sibling order — used only as a downstream tie-break. */
  displayOrder: number;
  /** Journey-aware SCHOOL count (Schools journey eligibility dimension). `null` when not loaded. */
  schoolCount: number | null;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

/** The map's own lat/lon -> container-pixel projection at the current zoom. */
export type ProjectFn = (lat: number, lon: number) => ProjectedPoint;

/** An optional coarse plausibility box (e.g. the current city/viewport bounds). */
export interface CentroidPlausibilityBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** One screen-space grid cell's resolved members + centroid anchor. */
export interface AreaClusterCell {
  /**
   * Deterministic identity for this render pass: `z<zoom>:<first member's
   * areaKey>` — a merged cell (see UD-1's `mergeOverlappingCells`) no longer
   * corresponds to a single grid coordinate, so identity is keyed on the
   * areaKey-sorted member list's first entry (unique -> total order) instead.
   */
  cellKey: string;
  /** Members sorted by `areaKey` (unique -> total order, no ties). Never mutated. */
  members: readonly ClusterableAreaMember[];
  /** Arithmetic-mean centroid of the cell's member coordinates — a group locator, not a real place. */
  anchor: { lat: number; lon: number };
}

export interface AreaClusteringResult {
  /**
   * Every resolved grid cell, ONE entry per cell, sorted deterministically by
   * grid coordinate. A cell with exactly one member is a "single" — the
   * caller renders it as a single-AREA marker; a cell with two or more
   * members is a visual cluster.
   */
  clusters: readonly AreaClusterCell[];
  /** Members dropped for an unusable centroid (AC4.21) — never clustered, never rendered at an invented position. */
  omitted: readonly ClusterableAreaMember[];
}

const DEFAULT_CELL_SIZE_PX = 64;

/**
 * UD-1 (fix-cycle-3) — the single source of truth for a rendered AREA-level
 * card's on-screen footprint, anchored bottom-center (matches the divIcon
 * `transform:translate(-50%,-100%)` contract both `makeSingleAreaChildCard`
 * and `makeAreaVisualClusterCard` in `AreaMarkerLayer.tsx` use). Those two
 * builders set their card's CSS `width` to this SAME exported constant (never
 * a locally re-typed `110px`/`96px`), so the geometry this module reasons
 * about and the pixels the browser actually paints cannot drift apart.
 * Height cannot be pinned as exactly by CSS (a card may render 1-4 optional
 * content lines depending on journey/school-count availability), so this is
 * a deliberately conservative worst-case bound — comfortably exceeds every
 * line-count variant's real rendered height. Over-estimating the footprint
 * only ever causes an EXTRA merge (still correct, just more conservative);
 * under-estimating is the only way this invariant could actually fail.
 */
export const AREA_CARD_FOOTPRINT_WIDTH_PX = 110;
export const AREA_CARD_FOOTPRINT_HEIGHT_PX = 100;

function compareByAreaKey(a: ClusterableAreaMember, b: ClusterableAreaMember): number {
  if (a.areaKey === b.areaKey) return 0;
  return a.areaKey < b.areaKey ? -1 : 1;
}

interface FootprintRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Card footprint rect anchored bottom-center at `anchorPx` (see the constants' doc above). */
function footprintRectAt(anchorPx: ProjectedPoint): FootprintRect {
  const halfW = AREA_CARD_FOOTPRINT_WIDTH_PX / 2;
  return {
    left: anchorPx.x - halfW,
    right: anchorPx.x + halfW,
    top: anchorPx.y - AREA_CARD_FOOTPRINT_HEIGHT_PX,
    bottom: anchorPx.y,
  };
}

function footprintsIntersect(a: FootprintRect, b: FootprintRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

interface MergeWorkingCell {
  members: ClusterableAreaMember[];
}

/**
 * UD-1 (fix-cycle-3) — deterministic collision-correction pass. Merely
 * enlarging the grid cell (`DEFAULT_CELL_SIZE_PX`) is EXPLICITLY
 * INSUFFICIENT: two boundary-adjacent points (e.g. x=63 and x=65 at a 64px
 * cell) can sit 2px apart in screen space yet land in different grid cells
 * no matter how large the cell is, and their rendered CARDS — 96-140px wide,
 * far bigger than a single grid cell — necessarily overlap. This pass runs
 * AFTER the cheap grid bucketing below and unions any two of its output
 * cells whose projected card FOOTPRINTS (see `footprintRectAt`) would
 * intersect on screen, repeating until a full scan finds no more overlapping
 * pairs — the only way to actually PROVE the no-overlap invariant.
 *
 * Determinism (AC4.15): every pass re-sorts the current working list by its
 * first member's `areaKey` (members within a cell are already areaKey-sorted
 * by the caller, and every `areaKey` is unique, so this is a TOTAL order —
 * never an incidental Map/array iteration order) before scanning row-major
 * for the first intersecting pair. Two calls with identical members +
 * `project` + `zoom` therefore always merge the same pair first, in the same
 * order, and produce byte-identical output. A merge recomputes the anchor as
 * the arithmetic-mean centroid of ALL combined members (the same
 * `centroidOf` a single grid cell already uses) and re-sorts the combined
 * member list by `areaKey`.
 */
function mergeOverlappingCells(
  cells: readonly MergeWorkingCell[],
  project: ProjectFn,
): MergeWorkingCell[] {
  let working: MergeWorkingCell[] = cells.map((cell) => ({ members: cell.members.slice() }));
  let mergedSomething = true;
  while (mergedSomething) {
    mergedSomething = false;
    working.sort((a, b) => compareByAreaKey(a.members[0], b.members[0]));
    const rects = working.map((cell) => {
      const anchor = centroidOf(cell.members);
      return footprintRectAt(project(anchor.lat, anchor.lon));
    });
    for (let i = 0; i < working.length && !mergedSomething; i++) {
      for (let j = i + 1; j < working.length; j++) {
        if (footprintsIntersect(rects[i], rects[j])) {
          const combinedMembers = working[i].members.concat(working[j].members).sort(compareByAreaKey);
          const next = working.filter((_, idx) => idx !== i && idx !== j);
          next.push({ members: combinedMembers });
          working = next;
          mergedSomething = true;
          break;
        }
      }
    }
  }
  return working;
}

/**
 * True when a centroid is safe to plot. Rejects null/undefined, non-finite,
 * `(0, 0)` ("Null Island" — near-certainly a missing-data sentinel, never a
 * real Bangalore/Udupi area), out-of-range lat/lon, and — when `bounds` is
 * supplied — a coordinate outside that coarse plausibility box.
 */
export function isUsableCentroid(
  lat: number | null | undefined,
  lon: number | null | undefined,
  bounds?: CentroidPlausibilityBounds,
): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (bounds) {
    if (lat < bounds.minLat || lat > bounds.maxLat) return false;
    if (lon < bounds.minLon || lon > bounds.maxLon) return false;
  }
  return true;
}

function centroidOf(members: readonly ClusterableAreaMember[]): { lat: number; lon: number } {
  let sumLat = 0;
  let sumLon = 0;
  for (const member of members) {
    sumLat += member.lat;
    sumLon += member.lon;
  }
  return { lat: sumLat / members.length, lon: sumLon / members.length };
}

interface InternalCell {
  cellX: number;
  cellY: number;
  members: ClusterableAreaMember[];
}

/**
 * The grid clusterer. Pure: given the same `members` (as VALUES — order does
 * not matter), `project`, `zoom` and `options`, always returns the same
 * result.
 */
export function clusterAreaMembers(
  members: readonly ClusterableAreaMember[],
  project: ProjectFn,
  zoom: number,
  options?: { cellSizePx?: number; plausibilityBounds?: CentroidPlausibilityBounds },
): AreaClusteringResult {
  const cellSizePx = options?.cellSizePx ?? DEFAULT_CELL_SIZE_PX;
  const bounds = options?.plausibilityBounds;

  const usable: ClusterableAreaMember[] = [];
  const omitted: ClusterableAreaMember[] = [];
  for (const member of members) {
    if (isUsableCentroid(member.lat, member.lon, bounds)) {
      usable.push(member);
    } else {
      omitted.push(member);
    }
  }

  const cellsByKey = new Map<string, InternalCell>();
  for (const member of usable) {
    const point = project(member.lat, member.lon);
    const cellX = Math.floor(point.x / cellSizePx);
    const cellY = Math.floor(point.y / cellSizePx);
    const key = `${cellX}:${cellY}`;
    const existing = cellsByKey.get(key);
    if (existing) {
      existing.members.push(member);
    } else {
      cellsByKey.set(key, { cellX, cellY, members: [member] });
    }
  }

  const griddedCells: MergeWorkingCell[] = Array.from(cellsByKey.values()).map((cell) => ({
    members: cell.members.slice().sort(compareByAreaKey),
  }));

  // UD-1 (fix-cycle-3) — the grid pass above groups near-identical
  // coordinates cheaply, but two boundary-adjacent points can still land in
  // separate grid cells (see `mergeOverlappingCells`'s doc). This refinement
  // pass unions any grid-pass cells whose card footprints would actually
  // overlap on screen, so the returned `clusters` are guaranteed non-
  // overlapping regardless of where a member happened to fall in the grid.
  const mergedCells = mergeOverlappingCells(griddedCells, project);

  // Final deterministic ordering (AC4.15): sort by first (areaKey-sorted)
  // member's areaKey — a total order, never incidental array/Map order — and
  // derive each cluster's cellKey from that same identity, since a merged
  // cell no longer corresponds to a single grid coordinate.
  const clusters: AreaClusterCell[] = mergedCells
    .slice()
    .sort((a, b) => compareByAreaKey(a.members[0], b.members[0]))
    .map((cell) => ({
      cellKey: `z${zoom}:${cell.members[0].areaKey}`,
      members: cell.members,
      anchor: centroidOf(cell.members),
    }));

  return { clusters, omitted: omitted.slice().sort(compareByAreaKey) };
}

export interface ClusterVisibleAreaMembersResult extends AreaClusteringResult {
  /** Members excluded by journey-aware visibility, BEFORE clustering ever saw them. */
  hidden: readonly ClusterableAreaMember[];
}

/**
 * Composes journey-aware visibility with the grid clusterer: a zero-content
 * member (per `journeyVisibility.isMemberEligible`) is removed BEFORE
 * grouping, so it can never appear inside a cluster's `members` and can never
 * be counted by `representativeNames.ts`'s `+N` arithmetic. This is the ONE
 * call site that should feed dense AREA children into `clusterAreaMembers` —
 * callers must not run visibility afterwards as a "corrective" filter.
 */
export function clusterVisibleAreaMembers(
  members: readonly ClusterableAreaMember[],
  journey: DiscoverJourney,
  project: ProjectFn,
  zoom: number,
  options?: { cellSizePx?: number; plausibilityBounds?: CentroidPlausibilityBounds },
): ClusterVisibleAreaMembersResult {
  const visible: ClusterableAreaMember[] = [];
  const hidden: ClusterableAreaMember[] = [];
  for (const member of members) {
    // Minor fix-up (review) — `null` schoolCount means "not yet loaded", not
    // "zero schools". Coercing it to 0 here would hide every area in the
    // schools journey while counts are still in flight. Treat null as
    // unknown -> keep VISIBLE (the caller's copy already omits the number
    // when schoolCount is null — see makeSingleAreaChildCard/
    // makeDestinationCard's schoolLabel guards); this only affects the
    // 'schools' journey, since the 'areas' journey never reads
    // eligibleSchoolCount.
    const eligible =
      journey === 'schools' && member.schoolCount == null
        ? true
        : isMemberEligible(
            {
              areaKey: member.areaKey,
              displayLabel: member.displayLabel,
              eligibleListingCount: member.listingCount,
              eligibleSchoolCount: member.schoolCount ?? 0,
              displayOrder: member.displayOrder,
            },
            journey,
          );
    (eligible ? visible : hidden).push(member);
  }
  const result = clusterAreaMembers(visible, project, zoom, options);
  return { ...result, hidden: hidden.slice().sort(compareByAreaKey) };
}

/** Union bounds of a set of members' centroids — used for a cluster-focus camera fit. */
export interface MemberBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** `null` for an empty member list — there is no bounds to fit. */
export function boundsOfMembers(members: readonly ClusterableAreaMember[]): MemberBounds | null {
  if (members.length === 0) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  for (const member of members) {
    minLat = Math.min(minLat, member.lat);
    minLon = Math.min(minLon, member.lon);
    maxLat = Math.max(maxLat, member.lat);
    maxLon = Math.max(maxLon, member.lon);
  }
  return { minLat, minLon, maxLat, maxLon };
}
