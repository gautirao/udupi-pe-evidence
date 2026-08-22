/**
 * hierarchyCameraFit.ts — Issue #1943, Slice A.
 *
 * PURE resolver that picks a camera (centre + zoom) for a hierarchy level's
 * direct children such that their rendered destination cards are legible
 * (no card clipped off the usable viewport, no two cards overlapping) —
 * without ever looping, without ever observing its own prior output, and
 * without importing Leaflet. Slice A ships this dark: nothing in the app
 * calls it yet (see the "ships dark" verification in the PR description).
 *
 * ── ALGORITHM ──
 * `project(lat, lon, zoom)` is injected (the caller supplies the map's own
 * lat/lon -> container-pixel projection). Unlike `areaClustering.ts`'s
 * `ProjectFn` (bound to a single already-current zoom), this resolver must
 * compare candidate CAMERA zooms against each other, so it needs to project
 * the SAME point at several different zooms.
 *
 * `centre` is the unweighted arithmetic-mean lat/lon of every USABLE anchor
 * (mirrors `areaClustering.ts`'s own "arithmetic-mean centroid... a group
 * locator, not a real place" convention) — never an inverse-projected pixel
 * centroid, because `project` has no inverse. The SAME `centre` is used at
 * every candidate zoom, which mirrors how the real camera will actually be
 * driven (`map.setView(centre, zoom)`): the geometry this module reasons
 * about is the geometry that will actually be painted.
 *
 * `zBase` is the largest integer zoom (searched from
 * `min(maxZoom, LEAF_FIT_MAX_ZOOM)` down to `minZoom`) at which the union of
 * every child's CARD RECT (its anchor projected at that zoom, then expanded
 * bottom-centre by its footprint) fits inside the usable viewport sub-rect
 * once centred on `centre`. Deliberately RECTS, not bare centroids — a
 * bare-centroid fit lets a card's edge clip off-screen by construction,
 * which is exactly the defect this module exists to prevent. If no zoom in
 * range fits, `zBase` falls back to `minZoom` (the least-bad available
 * option; the resulting camera may legitimately not be legible, which is
 * exactly what `needsDeclutter: true` communicates).
 *
 * ── `containmentBounds` IS A SOFT STARTING-POINT FLOOR, NOT AN ENFORCED
 * ENVELOPE (code review F2 — read this before "fixing" the apparent gap) ──
 * The optional `containmentBounds` (e.g. a Direction/Cluster's own bbox) is
 * folded into the SAME union rect used ONLY for the `zBase` SEARCH — never
 * into the per-candidate `clipped`/`pairs`/`overlapAreaPx2` metrics, and
 * never re-checked once a winning candidate is chosen. This is deliberate,
 * not an oversight:
 *
 *   - PURPOSE: `zBase` is the resolver's STARTING point before it looks for
 *     a legible zoom. Without `containmentBounds`, a node with one child (or
 *     several tightly-coincident children) has a near-zero child-rect union,
 *     so an unconstrained `zBase` would climb straight to the clamp
 *     (`LEAF_FIT_MAX_ZOOM`) and slam the camera into a meaningless pinpoint
 *     — this is exactly the "sparse destinations do not cause unreasonable
 *     over-zoom" acceptance criterion. Pulling `zBase` DOWN via the node's
 *     own envelope is what prevents that; the approved plan calls this
 *     retaining node bounds "ONLY as containment/fallback", i.e. a floor to
 *     start searching from, not a hard ceiling to enforce forever after.
 *
 *   - WHY IT IS NOT ALSO ENFORCED AT THE WINNING CANDIDATE: for a
 *     geographically WIDE node (e.g. a `d:central`-sized Direction whose
 *     bbox spans much of a city), the whole point of zooming past `zBase`
 *     is to separate cards that overlap at the node's own scale — and
 *     separating them necessarily spreads them out far enough that the
 *     node's own (wide) envelope no longer fits on screen. That is CORRECT
 *     behaviour: the camera is now framing the children that matter, not
 *     the node's full historical extent. Enforcing the envelope at every
 *     candidate (as first proposed in review) would make exactly the dense
 *     nodes this issue exists to fix UNABLE to ever reach a legible
 *     candidate — `needsDeclutter` would fire permanently on the cases this
 *     module is supposed to resolve, which defeats the feature.
 *
 *   - NET EFFECT: `containmentBounds` can only ever pull `zBase` DOWN
 *     (never up — folding a rect into a union can only grow it, and a
 *     larger union can only fail the fit check at zooms it would otherwise
 *     have passed), so it is safe-direction with respect to the OVER-ZOOM
 *     guard. It offers NO guarantee that the FINAL chosen camera keeps the
 *     node's full envelope on screen — a wide node's envelope MAY be
 *     (correctly) cropped once the resolver zooms in to legibly separate
 *     its children. This is the documented, intentional trade-off; do not
 *     "fix" it by enforcing the envelope at every candidate.
 *
 * Candidates are EXACTLY `[zBase, zBase+1, zBase+2, zBase+3]`, each clamped
 * to `[minZoom, min(maxZoom, LEAF_FIT_MAX_ZOOM)]`
 * (`LEAF_FIT_MAX_ZOOM` imported verbatim from `zoomPolicy.ts`, never
 * redefined), duplicates dropped after clamping. `zBase - 1` is never tried:
 * zooming OUT can only shrink inter-card pixel distances, so it can only
 * ever make collisions equal or worse, never better — trying it would only
 * waste a candidate slot.
 *
 * For each candidate zoom, `centre` is re-projected at that zoom, every
 * usable child's card rect is computed at that zoom, and the whole set is
 * translated so `centre`'s projected point lands on the usable sub-rect's
 * centre (this is the same "camera is centred on `centre`" placement used
 * for the `zBase` search, just repeated per-candidate so the metrics are
 * self-consistent with what the camera will really show). From the
 * translated rects: `clipped` = how many card rects are not fully contained
 * within the usable sub-rect; `pairs` = how many DISTINCT pairs of card
 * rects intersect; `overlapAreaPx2` = the summed intersection area (px^2)
 * over those intersecting pairs.
 *
 * `score = 1_000_000*clipped + 10_000*pairs + 1*overlapAreaPx2 +
 * 1_000*zoomDelta` (`zoomDelta = candidateZoom - zBase`, 0..3). The FIRST
 * candidate (in `[zBase, zBase+1, zBase+2, zBase+3]` order) with `clipped
 * === 0 && pairs === 0` — "LEGIBLE" — is accepted immediately, without
 * scoring the rest. Otherwise the candidate with the lowest score wins, ties
 * broken by the SMALLER zoom (a total order over the at-most-4 deduplicated
 * candidates, so no ambiguity is possible). The resolver never loops and
 * never re-invokes itself with its own output — evaluating exactly these
 * <=4 fixed candidates once is the entire algorithm, so termination is
 * structural, not empirical.
 */
import { isUsableCentroid } from './areaClustering';
import { LEAF_FIT_MAX_ZOOM } from '@/shared/map/zoomPolicy';

export interface ProjectedPoint {
  x: number;
  y: number;
}

/** The map's own lat/lon -> container-pixel projection AT A GIVEN ZOOM. */
export type HierarchyProjectFn = (lat: number, lon: number, zoom: number) => ProjectedPoint;

/** One direct child of the hierarchy level being fitted. */
export interface HierarchyChildAnchor {
  lat: number | null | undefined;
  lon: number | null | undefined;
  footprintWidthPx: number;
  footprintHeightPx: number;
}

/**
 * A lat/lon bounding box (e.g. a Direction/Cluster's own bbox) — a SOFT
 * `zBase`-search starting-point floor, not an enforced envelope. See the
 * module doc's "`containmentBounds` IS A SOFT STARTING-POINT FLOOR" section.
 */
export interface HierarchyContainmentBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * The portion of the viewport actually usable for content, after UI chrome.
 * Insets may be ASYMMETRIC (in practice only the bottom is, for a bottom
 * sheet/filter bar) — this is a SUPPORTED case, never validated/rejected.
 */
export interface UsableViewportRect {
  widthPx: number;
  heightPx: number;
  insetTopPx: number;
  insetRightPx: number;
  insetBottomPx: number;
  insetLeftPx: number;
}

export interface HierarchyCameraFitInput {
  anchors: readonly HierarchyChildAnchor[];
  containmentBounds?: HierarchyContainmentBounds | null;
  viewport: UsableViewportRect;
  project: HierarchyProjectFn;
  minZoom: number;
  maxZoom: number;
}

export interface HierarchyCameraFitCandidateEvaluation {
  zoom: number;
  clipped: number;
  pairs: number;
  overlapAreaPx2: number;
  score: number;
}

export interface HierarchyCameraFitResult {
  centre: [number, number];
  zoom: number;
  needsDeclutter: boolean;
  chosen: HierarchyCameraFitCandidateEvaluation;
  evaluated: readonly HierarchyCameraFitCandidateEvaluation[];
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface UsableAnchor {
  lat: number;
  lon: number;
  footprintWidthPx: number;
  footprintHeightPx: number;
}

/** Card rect anchored bottom-centre at `p` (matches the divIcon `translate(-50%,-100%)` contract). */
function cardRectAt(p: ProjectedPoint, widthPx: number, heightPx: number): Rect {
  const halfW = widthPx / 2;
  return { left: p.x - halfW, right: p.x + halfW, top: p.y - heightPx, bottom: p.y };
}

function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    if (r.left < left) left = r.left;
    if (r.right > right) right = r.right;
    if (r.top < top) top = r.top;
    if (r.bottom > bottom) bottom = r.bottom;
  }
  return { left, right, top, bottom };
}

function rectWidth(r: Rect): number {
  return r.right - r.left;
}
function rectHeight(r: Rect): number {
  return r.bottom - r.top;
}
function rectCentreX(r: Rect): number {
  return (r.left + r.right) / 2;
}
function rectCentreY(r: Rect): number {
  return (r.top + r.bottom) / 2;
}

function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy };
}

function isFinitePoint(p: ProjectedPoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function usableSubRect(viewport: UsableViewportRect): Rect {
  return {
    left: viewport.insetLeftPx,
    right: viewport.widthPx - viewport.insetRightPx,
    top: viewport.insetTopPx,
    bottom: viewport.heightPx - viewport.insetBottomPx,
  };
}

const EPS = 1e-6;

function rectContainedIn(inner: Rect, outer: Rect): boolean {
  return (
    inner.left >= outer.left - EPS &&
    inner.right <= outer.right + EPS &&
    inner.top >= outer.top - EPS &&
    inner.bottom <= outer.bottom + EPS
  );
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right - EPS && a.right > b.left + EPS && a.top < b.bottom - EPS && a.bottom > b.top + EPS;
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function boundsCorners(b: HierarchyContainmentBounds): Array<[number, number]> {
  return [
    [b.south, b.west],
    [b.south, b.east],
    [b.north, b.west],
    [b.north, b.east],
  ];
}

/** All card rects (+ optional containment bounds envelope) at `zoom`, centred at `centre`. */
function contentRectsAt(
  anchors: readonly UsableAnchor[],
  containmentBounds: HierarchyContainmentBounds | null | undefined,
  project: HierarchyProjectFn,
  zoom: number,
): Rect[] | null {
  const cardRects: Rect[] = [];
  for (const a of anchors) {
    const p = project(a.lat, a.lon, zoom);
    if (!isFinitePoint(p)) continue;
    cardRects.push(cardRectAt(p, a.footprintWidthPx, a.footprintHeightPx));
  }
  if (cardRects.length === 0) return null;

  if (containmentBounds != null) {
    const corners = boundsCorners(containmentBounds)
      .map(([lat, lon]) => project(lat, lon, zoom))
      .filter(isFinitePoint);
    if (corners.length > 0) {
      const bRect = unionRect(corners.map((p) => ({ left: p.x, right: p.x, top: p.y, bottom: p.y })));
      if (bRect) cardRects.push(bRect);
    }
  }
  return cardRects;
}

/**
 * Whether the union of `rects` is small enough to fit inside `usable` once
 * centred — a pure dimension comparison. Fit does not depend on WHERE the
 * union is centred (any rect that fits dimensionally can always be
 * translated to sit fully inside), so this deliberately does not need to
 * know the actual camera centre.
 */
function fitsWithinUsable(rects: readonly Rect[], usable: Rect): boolean {
  const union = unionRect(rects);
  if (!union) return false;
  return rectWidth(union) <= rectWidth(usable) + EPS && rectHeight(union) <= rectHeight(usable) + EPS;
}

function evaluateCandidate(
  anchors: readonly UsableAnchor[],
  containmentBounds: HierarchyContainmentBounds | null | undefined,
  project: HierarchyProjectFn,
  zoom: number,
  centreLat: number,
  centreLon: number,
  usableRect: Rect,
  zBase: number,
): { evaluation: HierarchyCameraFitCandidateEvaluation; cardRectCount: number } | null {
  // Only the CHILD card rects count toward clipped/pairs/overlap — the
  // containment envelope (if any) is excluded from this list deliberately.
  const cardRects: Rect[] = [];
  for (const a of anchors) {
    const p = project(a.lat, a.lon, zoom);
    if (!isFinitePoint(p)) continue;
    cardRects.push(cardRectAt(p, a.footprintWidthPx, a.footprintHeightPx));
  }
  if (cardRects.length === 0) return null;

  const centreProjected = project(centreLat, centreLon, zoom);
  if (!isFinitePoint(centreProjected)) return null;

  const usableCentreX = rectCentreX(usableRect);
  const usableCentreY = rectCentreY(usableRect);
  const dx = usableCentreX - centreProjected.x;
  const dy = usableCentreY - centreProjected.y;

  const translated = cardRects.map((r) => translateRect(r, dx, dy));

  let clipped = 0;
  for (const r of translated) {
    if (!rectContainedIn(r, usableRect)) clipped += 1;
  }

  let pairs = 0;
  let overlapAreaPx2 = 0;
  for (let i = 0; i < translated.length; i += 1) {
    for (let j = i + 1; j < translated.length; j += 1) {
      if (rectsIntersect(translated[i], translated[j])) {
        pairs += 1;
        overlapAreaPx2 += overlapArea(translated[i], translated[j]);
      }
    }
  }

  const zoomDelta = zoom - zBase;
  const score = 1_000_000 * clipped + 10_000 * pairs + overlapAreaPx2 + 1_000 * zoomDelta;

  // `containmentBounds` is a SOFT zBase-search floor only — deliberately not
  // enforced here at the winning candidate. See the module doc's
  // "`containmentBounds` IS A SOFT STARTING-POINT FLOOR" section (code
  // review F2) for why: enforcing it here would make dense/wide nodes
  // permanently unable to reach a legible candidate.
  void containmentBounds;

  return {
    evaluation: { zoom, clipped, pairs, overlapAreaPx2, score },
    cardRectCount: cardRects.length,
  };
}

/**
 * Resolves a camera (centre + zoom) for a hierarchy level's direct children.
 * Returns `null` when there are no usable anchors. Never mutates `input`.
 */
export function resolveHierarchyCameraFit(
  input: HierarchyCameraFitInput,
): HierarchyCameraFitResult | null {
  const effectiveMaxZoom = Math.min(input.maxZoom, LEAF_FIT_MAX_ZOOM);

  // An anchor is usable only if it (a) has a plausible geographic centroid
  // AND (b) actually projects to a finite pixel point. (b) is probed once,
  // at `effectiveMaxZoom` — a real `project` function's finiteness depends
  // on the (lat, lon) it was given, not on which zoom it is asked to
  // project at, so one probe is representative of every candidate zoom.
  // An anchor that fails (b) is unusable EVERYWHERE (including for the
  // `centre` computation below), not just at the zooms where it happens to
  // be probed again later.
  const usable: UsableAnchor[] = [];
  for (const a of input.anchors) {
    if (!isUsableCentroid(a.lat, a.lon)) continue;
    // isUsableCentroid narrows null/undefined/NaN/out-of-range away, but TS
    // doesn't see through it — the values are known-finite numbers here.
    const lat = a.lat as number;
    const lon = a.lon as number;
    if (!isFinitePoint(input.project(lat, lon, effectiveMaxZoom))) continue;
    usable.push({
      lat,
      lon,
      footprintWidthPx: a.footprintWidthPx,
      footprintHeightPx: a.footprintHeightPx,
    });
  }
  if (usable.length === 0) return null;

  const centreLat = usable.reduce((sum, a) => sum + a.lat, 0) / usable.length;
  const centreLon = usable.reduce((sum, a) => sum + a.lon, 0) / usable.length;

  const usableRect = usableSubRect(input.viewport);

  // ── zBase: largest integer zoom in range at which the union of card rects
  // (+ containment bounds envelope) fits inside the usable sub-rect. ──
  let zBase = input.minZoom;
  let foundFit = false;
  for (let z = Math.floor(effectiveMaxZoom); z >= Math.ceil(input.minZoom); z -= 1) {
    const rects = contentRectsAt(usable, input.containmentBounds, input.project, z);
    if (!rects) continue;
    if (fitsWithinUsable(rects, usableRect)) {
      zBase = z;
      foundFit = true;
      break;
    }
  }
  if (!foundFit) zBase = input.minZoom;

  // ── Candidates: [zBase, zBase+1, zBase+2, zBase+3], clamped, deduped. ──
  const rawCandidates = [zBase, zBase + 1, zBase + 2, zBase + 3];
  const clamped = rawCandidates.map((z) =>
    Math.min(effectiveMaxZoom, Math.max(input.minZoom, z)),
  );
  const dedupedZooms: number[] = [];
  for (const z of clamped) {
    if (!dedupedZooms.includes(z)) dedupedZooms.push(z);
  }

  const evaluated: HierarchyCameraFitCandidateEvaluation[] = [];
  let winner: HierarchyCameraFitCandidateEvaluation | null = null;
  let legibleWinner: HierarchyCameraFitCandidateEvaluation | null = null;

  for (const zoom of dedupedZooms) {
    const result = evaluateCandidate(
      usable,
      input.containmentBounds,
      input.project,
      zoom,
      centreLat,
      centreLon,
      usableRect,
      zBase,
    );
    if (!result) continue;
    evaluated.push(result.evaluation);

    if (result.evaluation.clipped === 0 && result.evaluation.pairs === 0) {
      legibleWinner = result.evaluation;
      break; // accept the FIRST legible candidate immediately.
    }
  }

  if (legibleWinner) {
    winner = legibleWinner;
  } else {
    for (const evaluation of evaluated) {
      if (
        winner == null ||
        evaluation.score < winner.score ||
        (evaluation.score === winner.score && evaluation.zoom < winner.zoom)
      ) {
        winner = evaluation;
      }
    }
  }

  if (!winner) return null;

  return {
    centre: [centreLat, centreLon],
    zoom: winner.zoom,
    needsDeclutter: !(winner.clipped === 0 && winner.pairs === 0),
    chosen: winner,
    evaluated,
  };
}
