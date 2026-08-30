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
 * `zBase` starts from CHILD PLACEMENT alone and is pulled down to the
 * ENVELOPE SCALE FLOOR only when the anchors THEMSELVES are structurally
 * degenerate — fewer than 2 usable anchors, or every usable anchor
 * geographically coincident (see Issue #1943 remaining-scope fix, below).
 * These two independently-computed, largest-satisfying integer zooms (each
 * searched from
 * `min(maxZoom, LEAF_FIT_MAX_ZOOM)` down to `minZoom`) answer two DIFFERENT
 * questions and are deliberately NEVER merged into one rect list (external
 * review, post-first-fix-round — they used to be, and that was itself a
 * defect; see below):
 *
 *   1. CHILD PLACEMENT (the real question): the largest zoom at which every
 *      child's CARD RECT (its anchor projected at that zoom, then expanded
 *      bottom-centre by its footprint) is ACTUALLY CONTAINED within the
 *      usable viewport sub-rect under the SAME centre-pinned placement
 *      `evaluateCandidate` uses below — i.e. every rect is translated by
 *      `(usable-rect centre − projected `centre` point)`, then checked
 *      individually, not just as a union's overall dimensions (a pure
 *      width/height dimension check on the rects' union is NOT equivalent
 *      to real containment here, because the placement is centre-PINNED,
 *      not freely re-centrable — see `placeRectsForCentrePinnedCamera`
 *      below for why bottom-centre anchoring AND an uneven anchor
 *      distribution both make the union's own midpoint diverge from where
 *      the camera actually places it).
 *   2. ENVELOPE SCALE FLOOR (`containmentBounds`, see its own section
 *      below): a pure DIMENSION check — does `containmentBounds`'s
 *      projected width/height fit inside the usable sub-rect's
 *      width/height — with NO translation and NO position sensitivity.
 *
 * If no zoom in range satisfies (1), that half falls back to `minZoom` (the
 * least-bad available option; the resulting camera may legitimately not be
 * legible, which is exactly what `needsDeclutter: true` communicates); same
 * fallback for (2) when `containmentBounds` is supplied but never fits.
 * When `containmentBounds` is absent, (2) contributes no constraint at all
 * (its "largest satisfying zoom" is simply the ceiling), so `zBase` reduces
 * to (1) alone.
 *
 * ── `containmentBounds` IS A SOFT, SCALE-ONLY STARTING-POINT FLOOR, NEVER A
 * POSITION-SENSITIVE CONSTRAINT (code review F2, then F1 of the follow-up
 * round — read this before "fixing" the apparent gap) ──
 * The optional `containmentBounds` (e.g. a Direction/Cluster's own bbox)
 * contributes ONLY its projected SIZE to `zBase` (requirement 2 above) —
 * never its position relative to `centre`, never the per-candidate
 * `clipped`/`pairs`/`overlapAreaPx2` metrics, and never re-checked once a
 * winning candidate is chosen. This is deliberate, not an oversight:
 *
 *   - PURPOSE: `zBase` is the resolver's STARTING point before it looks for
 *     a legible zoom. Without `containmentBounds`, a node with one child (or
 *     several tightly-coincident children) has a near-zero child-rect
 *     footprint, so an unconstrained `zBase` would climb straight to the
 *     clamp (`LEAF_FIT_MAX_ZOOM`) and slam the camera into a meaningless
 *     pinpoint — this is exactly the "sparse destinations do not cause
 *     unreasonable over-zoom" acceptance criterion. Pulling `zBase` DOWN via
 *     the node's own envelope SIZE is what prevents that; the approved plan
 *     calls this retaining node bounds "ONLY as containment/fallback", i.e.
 *     a floor to start searching from, not a hard ceiling to enforce
 *     forever after.
 *
 *   - FALLBACK ONLY, NOT A CO-EQUAL FLOOR (Issue #1943 remaining-scope fix —
 *     "useful-first root/structural presentation") — an earlier version of
 *     this module applied `containmentBounds` UNCONDITIONALLY via
 *     `zBase = Math.min(childZBase, envelopeZBase)`. That let a node's own
 *     (frequently much larger — e.g. the union of every child's full
 *     descendant-area extent, not just the child ANCHORS actually rendered
 *     as cards) envelope silently override an already-correct `childZBase`
 *     whenever the envelope was merely SMALLER, not only when the anchors
 *     themselves degenerated. A city ROOT with several well-separated
 *     Direction children is the production case this broke: `childZBase`
 *     alone already finds a legible zoom for the 5 rendered cards, but the
 *     ROOT's own envelope — sized off each Direction's full descendant-area
 *     bbox, tens of km wider than the 5 anchors' own spread — dragged the
 *     window down anyway, so the declutter fallback merged every child into
 *     one catch-all card on first arrival.
 *
 *     `isAnchorSpreadDegenerate` gates the envelope on a STRUCTURAL property
 *     of the anchors — fewer than 2 usable anchors, or every anchor sharing
 *     the exact same lat AND lon — matching PURPOSE above ("a node with one
 *     child, or several tightly-coincident children") and mirroring
 *     `PropertyMap.tsx`'s identical check for `derivedMinZoom`. A first
 *     attempt at this gate used `childZBase === effectiveMaxZoom` instead
 *     (inferring degeneracy from where the search happened to land) — code
 *     review caught that this is NOT equivalent and is actively wrong: two
 *     genuinely DISTINCT, non-overlapping anchors (e.g. 0.3deg apart, 100px
 *     cards) on a large-enough usable rect are trivially contained even at
 *     the ceiling zoom simply because the viewport has room to spare, not
 *     because the anchors are degenerate — that fixture reproducibly
 *     misfired the old gate, applying the envelope to a perfectly legible
 *     pair and dragging them down into an overlap. The STRUCTURAL check
 *     never confuses "the viewport happens to be roomy" with "the anchors
 *     are degenerate": it only fires for the actual documented failure mode.
 *
 *     Gating the envelope floor on this exact condition still fully covers
 *     the documented degenerate case, while no longer overriding a
 *     genuinely-computed `childZBase` for every other shape. This can only
 *     ever RAISE `zBase` relative to the old unconditional `Math.min`
 *     (removing a MIN operand cannot lower the result), so it is monotone-
 *     safe: no node shape can end up with a LESS legible starting point than
 *     before this fix.
 *
 *   - WHY THE ENVELOPE'S *POSITION* MUST NOT GATE `zBase` (the bug this
 *     section now corrects): an earlier version of this fix folded the
 *     envelope into the SAME rect list checked for requirement (1), so its
 *     admissibility depended on where `centre` (the anchor mean) happened
 *     to sit inside it. A child anchored near an EDGE of its own node's bbox
 *     — legitimate geometry for a padded or elongated Direction, e.g. a
 *     child at `lat=0.9` inside a `[-1,1]` bbox — pins the envelope's
 *     translated position off-centre, so a real, cleanly-separating camera
 *     several zoom levels higher becomes structurally unreachable: the
 *     resolver reports `needsDeclutter: true` when a perfectly good camera
 *     exists, purely because the STARTING-POINT floor became
 *     position-sensitive. That is the SAME CLASS of defect as the
 *     bottom-centre/uneven-distribution bug this module was built to fix —
 *     mirrored, from under-zoom instead of over-zoom. The envelope's
 *     ADMISSIBILITY must therefore never depend on `centre`'s position
 *     within it — only on whether its SIZE, at that zoom, could fit at all.
 *
 *   - WHY IT IS NOT ALSO ENFORCED AT THE WINNING CANDIDATE: for a
 *     geographically WIDE node (e.g. a `d:central`-sized Direction whose
 *     bbox spans much of a city), the whole point of zooming past `zBase`
 *     is to separate cards that overlap at the node's own scale — and
 *     separating them necessarily spreads them out far enough that the
 *     node's own (wide) envelope no longer fits on screen. That is CORRECT
 *     behaviour: the camera is now framing the children that matter, not
 *     the node's full historical extent. Enforcing the envelope's DIMENSION
 *     (let alone its position) at every candidate would make exactly the
 *     dense nodes this issue exists to fix UNABLE to ever reach a legible
 *     candidate — `needsDeclutter` would fire permanently on the cases this
 *     module is supposed to resolve, which defeats the feature.
 *
 *   - NET EFFECT: `containmentBounds`'s SIZE can only ever pull `zBase` DOWN
 *     (never up — a bigger required footprint can only fail the dimension
 *     check at zooms it would otherwise have passed), so it is safe-
 *     direction with respect to the OVER-ZOOM guard, and — because it is
 *     position-INSENSITIVE — it can never manufacture the under-zoom defect
 *     above either. It offers NO guarantee that the FINAL chosen camera
 *     keeps the node's full envelope on screen — a wide node's envelope MAY
 *     be (correctly) cropped once the resolver zooms in to legibly separate
 *     its children. This is the documented, intentional trade-off; do not
 *     "fix" it by enforcing the envelope (size OR position) at every
 *     candidate, and do not fold it back into the child placement check.
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
 * within the usable sub-rect; `clipOverflowPx` = the summed MAGNITUDE of
 * that clipping — for each card rect, how many px it protrudes past each
 * usable-sub-rect edge it crosses (0 for a rect that's fully contained),
 * summed across all edges and all rects; `pairs` = how many DISTINCT pairs
 * of card rects intersect; `overlapAreaPx2` = the summed intersection area
 * (px^2) over those intersecting pairs.
 *
 * `clipOverflowPx` exists because `clipped` alone is magnitude-blind
 * (issue #2312): once every candidate in the zoom window clips at least one
 * anchor, `clipped` is IDENTICAL (or near-identical) across all of them, so
 * `1_000_000*clipped` stops discriminating between candidates and the
 * comparison falls through entirely to `pairs`/`overlapAreaPx2` — which
 * reward zooming IN further, and zooming in only ever spreads card rects
 * apart, so it can raise (never lower) each clipped rect's overflow. That
 * silently traded "identical clip count, worse overflow" for "fewer pairs",
 * with no term able to see the cost. `clipOverflowPx` is weighted between
 * the `clipped` and `pairs` terms specifically so it breaks that tie the
 * other way: among same-`clipped`-count candidates, LESS total overflow
 * wins, even at the cost of a bit more pair-overlap.
 *
 * `score = 1_000_000*clipped + 100*clipOverflowPx + 10_000*pairs +
 * 1*overlapAreaPx2 + 1_000*zoomDelta` (`zoomDelta = candidateZoom - zBase`,
 * 0..3). The FIRST candidate (in `[zBase, zBase+1, zBase+2, zBase+3]` order)
 * with `clipped === 0 && pairs === 0` — "LEGIBLE" — is accepted immediately,
 * without scoring the rest (note `clipOverflowPx` is necessarily 0 whenever
 * `clipped` is 0, so this fast path is unaffected). Otherwise the candidate
 * with the lowest score wins, ties broken by the SMALLER zoom (a total order
 * over the at-most-4 deduplicated candidates, so no ambiguity is possible).
 * The resolver never loops and never re-invokes itself with its own output —
 * evaluating exactly these <=4 fixed candidates once is the entire
 * algorithm, so termination is structural, not empirical.
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
 * A lat/lon bounding box (e.g. a Direction/Cluster's own bbox) — a SOFT,
 * SIZE-ONLY `zBase`-search starting-point floor, never a position-sensitive
 * constraint and never an enforced envelope. See the module doc's
 * "`containmentBounds` IS A SOFT, SCALE-ONLY STARTING-POINT FLOOR" section.
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
  /** Summed px a clipped card rect protrudes past the usable sub-rect's edges. 0 iff `clipped === 0`. */
  clipOverflowPx: number;
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

/**
 * How many px `inner` protrudes past `outer`'s edges, summed over every edge
 * it crosses (0 if `inner` is fully contained). This is the MAGNITUDE
 * counterpart to `rectContainedIn`'s boolean — see the module doc's
 * `clipOverflowPx` section for why the score needs both.
 */
function clipOverflowPx(inner: Rect, outer: Rect): number {
  return (
    Math.max(0, outer.left - inner.left) +
    Math.max(0, inner.right - outer.right) +
    Math.max(0, outer.top - inner.top) +
    Math.max(0, inner.bottom - outer.bottom)
  );
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

/**
 * Every child's card rect at `zoom` (anchor projected, then expanded
 * bottom-centre by its footprint). Anchors with a non-finite projection are
 * dropped. Shared by the `zBase` child-placement search and
 * `evaluateCandidate` (code review F4 — construction must not drift apart
 * the way the two placement checks once did).
 */
function cardRectsAt(anchors: readonly UsableAnchor[], project: HierarchyProjectFn, zoom: number): Rect[] {
  const rects: Rect[] = [];
  for (const a of anchors) {
    const p = project(a.lat, a.lon, zoom);
    if (!isFinitePoint(p)) continue;
    rects.push(cardRectAt(p, a.footprintWidthPx, a.footprintHeightPx));
  }
  return rects;
}

/**
 * `containmentBounds`'s own projected envelope rect at `zoom` — used ONLY
 * for the SIZE-only `zBase` scale-floor check (never merged with child card
 * rects; see the module doc's "IS A SOFT, SCALE-ONLY STARTING-POINT FLOOR"
 * section for why merging them was itself a defect).
 */
function envelopeRectAt(
  containmentBounds: HierarchyContainmentBounds,
  project: HierarchyProjectFn,
  zoom: number,
): Rect | null {
  const corners = boundsCorners(containmentBounds)
    .map(([lat, lon]) => project(lat, lon, zoom))
    .filter(isFinitePoint);
  if (corners.length === 0) return null;
  return unionRect(corners.map((p) => ({ left: p.x, right: p.x, top: p.y, bottom: p.y })));
}

/**
 * Whether `rect` is small enough to fit inside `usable` by DIMENSION alone
 * — no translation, no position sensitivity. This is intentionally the
 * "old", weaker check: correct for a pure scale floor (`containmentBounds`),
 * WRONG for real card placement (see `allRectsContained` below and the
 * module doc for why those are different questions with different answers).
 */
function fitsByDimension(rect: Rect, usable: Rect): boolean {
  return rect.right - rect.left <= usable.right - usable.left + EPS && rect.bottom - rect.top <= usable.bottom - usable.top + EPS;
}

/**
 * THE single placement routine shared by the `zBase` search and
 * `evaluateCandidate` (external review: the two must never drift apart
 * again — that drift, not bottom-centre anchoring alone, was the root
 * cause of a prior defect). The camera is CENTRE-PINNED: it places the
 * PROJECTED `centre` POINT (the arithmetic mean of usable anchors'
 * lat/lon — see the module doc) at the usable sub-rect's own centre, then
 * translates every rect by that SAME fixed `(dx, dy)` offset. This is NOT a
 * free re-centring of each rect's own union — a rect's final position
 * depends on where `centre`'s pinned point lands relative to it, which
 * diverges from the union's own midpoint whenever:
 *   (a) cards are anchored bottom-centre (so a card's vertical extent is
 *       NOT symmetric around its anchor point — the anchor sits at the
 *       card's bottom edge, not its middle), or
 *   (b) anchors are unevenly distributed (the arithmetic mean of anchor
 *       lat/lon is not the same point as the geometric centre of the
 *       resulting card-rect union — true on BOTH axes, not just vertical).
 * A pure "does the union's WIDTH/HEIGHT fit inside the usable rect's
 * width/height" dimension check (the prior, now-removed `fitsWithinUsable`)
 * silently assumed the union could always be freely re-centred to make that
 * true — false under this pinned placement, and the reason `zBase` could
 * previously be set ABOVE the highest zoom that genuinely places cleanly.
 */
function placeRectsForCentrePinnedCamera(
  rects: readonly Rect[],
  centreProjected: ProjectedPoint,
  usableRect: Rect,
): Rect[] {
  const dx = rectCentreX(usableRect) - centreProjected.x;
  const dy = rectCentreY(usableRect) - centreProjected.y;
  return rects.map((r) => translateRect(r, dx, dy));
}

/** Whether EVERY one of `rects` is actually contained in `usable` once centre-pinned-placed (not just their union's dimensions). */
function allRectsContained(rects: readonly Rect[], centreProjected: ProjectedPoint, usableRect: Rect): boolean {
  const placed = placeRectsForCentrePinnedCamera(rects, centreProjected, usableRect);
  return placed.every((r) => rectContainedIn(r, usableRect));
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
  const cardRects = cardRectsAt(anchors, project, zoom);
  if (cardRects.length === 0) return null;

  const centreProjected = project(centreLat, centreLon, zoom);
  if (!isFinitePoint(centreProjected)) return null;

  const translated = placeRectsForCentrePinnedCamera(cardRects, centreProjected, usableRect);

  let clipped = 0;
  let clipOverflow = 0;
  for (const r of translated) {
    if (!rectContainedIn(r, usableRect)) {
      clipped += 1;
      clipOverflow += clipOverflowPx(r, usableRect);
    }
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
  const score =
    1_000_000 * clipped + 100 * clipOverflow + 10_000 * pairs + overlapAreaPx2 + 1_000 * zoomDelta;

  // `containmentBounds` is a SOFT, SIZE-ONLY zBase-search floor only —
  // deliberately not enforced here at the winning candidate, and (per the
  // module doc's "SCALE-ONLY STARTING-POINT FLOOR" section) never folded in
  // by POSITION even at the zBase search itself. Enforcing it here would
  // make dense/wide nodes permanently unable to reach a legible candidate.
  void containmentBounds;

  return {
    evaluation: { zoom, clipped, clipOverflowPx: clipOverflow, pairs, overlapAreaPx2, score },
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

  // ── zBase: childZBase, pulled down to envelopeZBase ONLY when childZBase
  // hit the degenerate sparse/coincident-anchor signature — see the module
  // doc's "FALLBACK ONLY, NOT A CO-EQUAL FLOOR" section (Issue #1943
  // remaining-scope fix). These stay two separate searches, never merged
  // into one rect list. ──

  // 1. childZBase: largest zoom at which every CHILD card rect is actually
  // contained under the real centre-pinned placement (never a union-only
  // dimension check — see `placeRectsForCentrePinnedCamera`'s doc).
  let childZBase = input.minZoom;
  let foundChildFit = false;
  for (let z = Math.floor(effectiveMaxZoom); z >= Math.ceil(input.minZoom); z -= 1) {
    const cardRects = cardRectsAt(usable, input.project, z);
    if (cardRects.length === 0) continue;
    const centreAtZ = input.project(centreLat, centreLon, z);
    if (!isFinitePoint(centreAtZ)) continue;
    if (allRectsContained(cardRects, centreAtZ, usableRect)) {
      childZBase = z;
      foundChildFit = true;
      break;
    }
  }
  if (!foundChildFit) childZBase = input.minZoom;

  // 2. envelopeZBase: largest zoom at which `containmentBounds`'s projected
  // envelope fits usable's DIMENSIONS alone — position-insensitive by
  // construction (`fitsByDimension` never translates). Absent bounds, this
  // contributes no constraint (defaults to the ceiling). Only ever computed
  // when it can matter (see the `isAnchorSpreadDegenerate` gate below) —
  // still a pure function of `containmentBounds`/`usableRect`, unrelated to
  // that gate.
  //
  // `isAnchorSpreadDegenerate` — a STRUCTURAL property of the anchors
  // themselves (fewer than 2 usable anchors, or every usable anchor sharing
  // the exact same lat AND lon), never inferred from where childZBase's
  // search happened to land. `childZBase === effectiveMaxZoom` was tried
  // first and is WRONG: it also fires for two genuinely DISTINCT,
  // non-overlapping anchors whenever the viewport is large enough (relative
  // to their real spread) that they are trivially contained even at the
  // ceiling — e.g. two anchors 0.3deg apart, 100px cards, on a 2000px-wide
  // usable rect are 480px apart (well-separated, non-overlapping) and still
  // pass containment at zoom 16, so the old condition misclassified them as
  // "degenerate" and applied the envelope anyway, dragging a perfectly
  // legible pair down to a zoom where they overlap — precisely the
  // catch-all defect this fix exists to remove. The anchors' own SIZE (this
  // property, mirroring PropertyMap.tsx's identical `isAnchorSpreadDegenerate`
  // check for `derivedMinZoom`) is the one thing this module's own PURPOSE
  // paragraph actually describes: "a node with one child (or several
  // tightly-coincident children)". Any other shape — including one where
  // childZBase happens to reach the ceiling because the viewport is roomy —
  // is genuinely non-degenerate and must not have the envelope applied.
  const isAnchorSpreadDegenerate =
    usable.length < 2 ||
    (usable.every((a) => a.lat === usable[0].lat) && usable.every((a) => a.lon === usable[0].lon));
  let envelopeZBase = effectiveMaxZoom;
  if (isAnchorSpreadDegenerate && input.containmentBounds != null) {
    const bounds = input.containmentBounds;
    let foundEnvelopeFit = false;
    for (let z = Math.floor(effectiveMaxZoom); z >= Math.ceil(input.minZoom); z -= 1) {
      const envelopeRect = envelopeRectAt(bounds, input.project, z);
      if (!envelopeRect) continue;
      if (fitsByDimension(envelopeRect, usableRect)) {
        envelopeZBase = z;
        foundEnvelopeFit = true;
        break;
      }
    }
    if (!foundEnvelopeFit) envelopeZBase = input.minZoom;
  }

  const zBase = isAnchorSpreadDegenerate ? Math.min(childZBase, envelopeZBase) : childZBase;

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
