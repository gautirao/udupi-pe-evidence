/**
 * AC1.7 — the `+N` arithmetic for VISUAL AREA CLUSTERS — Issue #1956 PR 1 (FE-2).
 *
 * Locked contract, quote-level exact:
 *   hiddenCount = visibleMemberCount − displayedRepresentativeCount
 *   hiddenCount  > 0  ->  "+N areas with matches"
 *   hiddenCount == 0  ->  "N areas with matches"
 *   "+0" is NEVER emitted.
 *
 * `hiddenCount` must never be negative. The two inputs can arrive from DIFFERENT
 * SNAPSHOTS (a member list refreshed by a filter change beside a representative
 * list computed a beat earlier), so a negative combination is reachable at
 * runtime and is a DEFECT. It is handled explicitly — clamped AND reported —
 * never silently clamped, because a silent clamp turns a real data-flow bug into
 * a plausible-looking label nobody ever investigates.
 *
 * This `+N` form applies to VISUAL AREA CLUSTERS ONLY. Structural levels
 * (DIRECTION and CLUSTER / Local Destination) never use it — see
 * `journeyVisibility.ts`, which owns that rule and asserts it negatively.
 *
 * Pure. No React, no I/O. Functions that need a rendered string RETURN the string.
 */
import type { AreaMember } from './types';
import { eligibleCountFor, type DiscoverJourney } from './journeyVisibility';

/** Why a `+N` computation was not trustworthy. Reported, never swallowed. */
export type NearbyAreaCountProblemCode =
  | 'NEGATIVE_HIDDEN_COUNT'
  | 'NON_INTEGER_INPUT'
  | 'NEGATIVE_INPUT';

export interface NearbyAreaCountProblem {
  code: NearbyAreaCountProblemCode;
  message: string;
}

export interface NearbyAreaCountInput {
  /** Members that survived journey-aware visibility for this cluster. */
  visibleMemberCount: number;
  /** Representative names actually rendered for this cluster. */
  displayedRepresentativeCount: number;
}

export interface NearbyAreaCountResult {
  /** Clamped to >= 0. Never negative, whatever the inputs were. */
  hiddenCount: number;
  /** The exact string to render. Never `"+0 ..."`. */
  label: string;
  /** True when the `+N` form was used. */
  usesPlusForm: boolean;
  /** Empty when the inputs were coherent. Non-empty means a real defect upstream. */
  problems: NearbyAreaCountProblem[];
}

/** The locked noun phrase. Shared so the two label forms can never drift apart. */
const AREAS_WITH_MATCHES = 'areas with matches';

function sanitiseCount(
  value: number,
  label: string,
  problems: NearbyAreaCountProblem[],
): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    problems.push({
      code: 'NON_INTEGER_INPUT',
      message: `${label} must be a non-negative integer but was ${value}`,
    });
    return 0;
  }
  if (value < 0) {
    problems.push({
      code: 'NEGATIVE_INPUT',
      message: `${label} must be a non-negative integer but was ${value}`,
    });
    return 0;
  }
  return value;
}

/**
 * The `+N` computation for one visual AREA cluster.
 *
 * Note which number the zero-hidden form carries: it is the VISIBLE MEMBER COUNT,
 * not the hidden count — "2 areas with matches" for a cluster of 2 whose names are
 * both already on screen. The `+` form instead carries the HIDDEN count, because
 * `+3` means "three more beyond the names you can see".
 */
export function computeNearbyAreaCount(
  input: NearbyAreaCountInput,
): NearbyAreaCountResult {
  const problems: NearbyAreaCountProblem[] = [];
  const visible = sanitiseCount(input.visibleMemberCount, 'visibleMemberCount', problems);
  const displayed = sanitiseCount(
    input.displayedRepresentativeCount,
    'displayedRepresentativeCount',
    problems,
  );

  const rawHidden = visible - displayed;
  let hiddenCount = rawHidden;

  if (rawHidden < 0) {
    // Clamp AND report — the two inputs disagreed, which can only happen if they
    // came from different snapshots. The label stays renderable; the problem is
    // surfaced so the caller can log/alert rather than trust the number.
    problems.push({
      code: 'NEGATIVE_HIDDEN_COUNT',
      message:
        `displayedRepresentativeCount (${displayed}) exceeds visibleMemberCount (${visible}) — ` +
        'hiddenCount would be negative; the two counts came from inconsistent snapshots',
    });
    hiddenCount = 0;
  }

  const usesPlusForm = hiddenCount > 0;
  const label = usesPlusForm
    ? `+${hiddenCount} ${AREAS_WITH_MATCHES}`
    : `${visible} ${AREAS_WITH_MATCHES}`;

  return { hiddenCount, label, usesPlusForm, problems };
}

/* ───────────────── deterministic representative ranking (AC1.7) ──────────────── */

/**
 * A cluster member as the ranker sees it: an {@link AreaMember} plus whether
 * journey-aware visibility kept it.
 */
export interface RankableClusterMember extends AreaMember {
  visible: boolean;
}

/**
 * Picks a cluster's representative names.
 *
 * Two properties this must have, both tested:
 *   1. Representatives come ONLY from VISIBLE members. A hidden (zero-content)
 *      member can never have its name shown, because the `+N` beside it asserts
 *      that every named area is itself a match.
 *   2. The ranking is DETERMINISTIC: the same inputs always yield the same names
 *      in the same order, regardless of the order they arrived in. The comparator
 *      ends on `areaKey`, which is unique, so it is a TOTAL order — no pair of
 *      distinct members can ever compare equal and leave the result at the mercy
 *      of the sort's stability.
 *
 * Ranking, strongest first: the JOURNEY'S eligible count, then lower server
 * `displayOrder`, then label, then `areaKey`. Label and key are compared by
 * CODE POINT (`<`/`>`), not `localeCompare` — a locale-sensitive collation makes
 * the output environment-dependent, which is the opposite of determinism.
 *
 * ── AC1.9 — WHY THE JOURNEY IS A REQUIRED ARGUMENT ──
 * The primary key is `eligibleCountFor(member, journey)` from
 * `journeyVisibility.ts` — the SAME function that decides `visible`. It is not a
 * hardcoded `eligibleListingCount`. Ranking a Schools cluster by listing counts
 * would name the areas with the most FLATS beside a `+N` describing SCHOOLS, so
 * the names and the number would be answering different questions. Sharing one
 * accessor with the visibility rule is what stops the two from drifting apart.
 *
 * Returns a NEW array; the input is never mutated.
 */
export function rankClusterRepresentatives(
  members: readonly RankableClusterMember[],
  limit: number,
  journey: DiscoverJourney,
): RankableClusterMember[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }
  return members
    .filter((member) => member.visible)
    .slice()
    .sort((a, b) => compareRepresentatives(a, b, journey))
    .slice(0, limit);
}

/**
 * The comparator, parameterised on journey. Exported so a test can pin the
 * ordering rules directly rather than only through {@link rankClusterRepresentatives}.
 */
export function compareRepresentatives(
  a: RankableClusterMember,
  b: RankableClusterMember,
  journey: DiscoverJourney,
): number {
  const countA = eligibleCountFor(a, journey);
  const countB = eligibleCountFor(b, journey);
  if (countA !== countB) {
    return countB - countA;
  }
  const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  if (a.displayLabel !== b.displayLabel) {
    return a.displayLabel < b.displayLabel ? -1 : 1;
  }
  if (a.areaKey === b.areaKey) {
    return 0;
  }
  return a.areaKey < b.areaKey ? -1 : 1;
}
