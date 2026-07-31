/**
 * Issue #1956 PR-4 (scope amendment n=1) — the ONE canonical marker-popover
 * render/capture eligibility predicate.
 *
 * Before this extraction the same boolean formula existed as TWO
 * byte-identical, unexported inline locals — `isMarkerPopoverEligible` in
 * `src/pages/MapDiscovery.tsx` (the popover RENDER gate) and the equivalent
 * guard inside `handleMarkerClickWithPosition` in
 * `src/features/discover/state/useMarkerSelection.ts` (the click CAPTURE
 * gate) — plus TWO test-side REPLICAS that reimplemented the formula instead
 * of importing it (`tests/discover/marker-popover-1738-gating.test.ts`'s
 * `isMarkerPopoverEligibleReplica`, `tests/discover/
 * marker-popover-1798-group-results-gating.test.ts`'s local helpers). A
 * replica cannot detect production drift by construction — it only proves
 * itself equal to itself. All FOUR sites now import this one function; there
 * is no remaining copy anywhere to drift (see #1798, the exact bug this
 * pattern already caused once: a click sets state but no popover renders
 * because the render gate and the capture gate silently diverged).
 *
 * Issue #1956 PR-4 — widened with ONE new arm: a resolved canonical AREA leaf
 * (the `node=` journey, `useAreasNavigationJourney`) in the area-first
 * journey is now admitted even though the legacy `areaKey` URL param is null
 * there (the node journey never writes it — see team-lead-plan-pr4.toml
 * [scope.three_areakeys]). Precise null handling: a node whose `areaKey` is
 * null (not yet resolved, or not an AREA leaf) must NEVER be admitted by this
 * arm — callers must resolve `isNodeAreaLeaf` via
 * `isResolvedAreaLeafNode`/`deriveAreaPointFromNode` (nodeAreaPoint.ts)
 * before passing it in; this module never inspects a node itself. Never
 * broadened to Direction or Local-Destination (Cluster) levels, and never to
 * school-first (the new arm is unconditionally ANDed with
 * `journey === 'area-first'`).
 *
 * Pure module: no React, no hooks, no import-time side effects.
 */
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export interface MarkerPopoverEligibilityInput {
  journey: DiscoverJourney | null;
  areaKey: string | null;
  schoolId: string | null;
  /**
   * True only when: `journey === 'area-first'` AND the resolved
   * `useAreasNavigationJourney` node is a canonical AREA leaf with a
   * non-null `areaKey` (see `isResolvedAreaLeafNode` in nodeAreaPoint.ts).
   * Defaults to `false` so every pre-existing caller/behaviour (including
   * both guard tests, pre-widening) is unaffected.
   */
  isNodeAreaLeaf?: boolean;
}

export interface MarkerAreaContextInput {
  journey: DiscoverJourney | null;
  areaKey: string | null;
  /** See `MarkerPopoverEligibilityInput.isNodeAreaLeaf` doc above. */
  isNodeAreaLeaf?: boolean;
}

/**
 * FIX CYCLE 2 (opus review, Finding 6) — the exact area-context sub-formula
 * `areaKey != null || (isNodeAreaLeaf && journey === 'area-first')`, extracted
 * so it lives in exactly ONE place. Before this extraction it was byte-copied
 * inline as `hasAreaContextForUrlWrite` in `useMarkerSelection.ts`'s
 * `handleMarkerClickWithPosition` (the URL-write gate deliberately does NOT
 * call the full `isMarkerPopoverEligible` below — that would admit pure
 * school-first URL writes and break #1973's "stays 'click'" contract) —
 * exactly the drift class the original scope-amendment extraction (see this
 * file's header) existed to kill. `isMarkerPopoverEligible` below is now
 * expressed in terms of this function instead of re-deriving it.
 */
export function hasMarkerAreaContext({
  journey,
  areaKey,
  isNodeAreaLeaf = false,
}: MarkerAreaContextInput): boolean {
  return areaKey != null || (isNodeAreaLeaf && journey === 'area-first');
}

export function isMarkerPopoverEligible({
  journey,
  areaKey,
  schoolId,
  isNodeAreaLeaf = false,
}: MarkerPopoverEligibilityInput): boolean {
  if (journey === 'agri-first') return false;
  // Issue #1956 PR-4 — the ORIGINAL #1738/#1973 `areaKey != null` clause is
  // unchanged; `isNodeAreaLeaf` is an ADDITIVE alternative, never a
  // replacement, and is only ever true for `journey === 'area-first'`.
  const hasAreaContext = hasMarkerAreaContext({ journey, areaKey, isNodeAreaLeaf });
  return (
    (hasAreaContext && (schoolId == null || journey === 'area-first')) ||
    (journey === 'school-first' && schoolId != null)
  );
}
