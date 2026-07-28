/**
 * The ONE visible-member set — Issue #1956 PR 1 (FE-3, item 2).
 *
 * AC1.12 requires that the map's destination counts and the panel's destination
 * counts can never disagree. Two independently-derived member sets are exactly
 * how they come to disagree: the map filters one list, the panel filters
 * another, the two are computed a beat apart, and `hiddenCount` in
 * `nearbyAreaArithmetic.ts` goes negative. This module exists so that BOTH
 * consumers read ONE set, derived ONCE by one function, carrying one identity.
 *
 * ── STATUS IN PR 1: ADDITIVE AND INERT ──
 * PR 1's shopper outcome is deliberately NONE. `useDiscoverMapData` derives this
 * set and exposes it; `useDiscoverMapPresentation` accepts it and re-exposes the
 * SAME OBJECT (by reference, so identity — not just value — is shared).
 * NOTHING renders it. No existing output of either hook changes. When a later PR
 * wires the Areas journey, both sides already have the same set to read.
 *
 * ── PRE-EXISTING HAZARD THIS DOES NOT PRETEND TO SOLVE ──
 * `areaMarkerCounts` in the map layer derives from
 * `AreaMarkerLayer.onMarkersComputed`, a ONE-TIME render callback. Live-fetched
 * counts do NOT auto-sync with it. Nothing here changes that; syncing is new
 * responsibility for the PR that actually consumes the set, and this module must
 * not be mistaken for having delivered it.
 *
 * Pure. No React, no I/O.
 */

/** Inputs the visible-member set is derived from. */
export interface VisibleMemberSetInput {
  /**
   * Every area key the current view knows about (the loaded area universe).
   * Duplicates are tolerated and collapsed.
   */
  candidateAreaKeys: readonly string[];
  /**
   * The active destination's member keys, when a destination scope is active.
   *
   * Three states, matching the pre-existing `groupAreaKeys` contract in
   * `useDiscoverMapData`:
   *   `undefined`/`null` — no destination scope; every candidate is a member.
   *   `[]`               — a destination IS active but has not resolved yet.
   *                        The set is EMPTY, never the full candidate list —
   *                        fail-safe, the same choice the marker fetch makes.
   *   `[k1, k2, ...]`    — members are the candidates that are also scoped.
   */
  scopedAreaKeys?: readonly string[] | null;
}

/**
 * A resolved visible-member set.
 *
 * `fingerprint` is a VALUE identity: two sets with the same members share it,
 * so a consumer can assert "these two numbers came from the same set" without
 * relying on object reference equality surviving a memo boundary.
 */
export interface VisibleMemberSet {
  readonly fingerprint: string;
  /** Sorted (code point) and de-duplicated, so the fingerprint is stable. */
  readonly areaKeys: readonly string[];
  readonly size: number;
  has(areaKey: string): boolean;
}

function buildSet(sortedKeys: string[]): VisibleMemberSet {
  const lookup = new Set(sortedKeys);
  return Object.freeze({
    fingerprint: sortedKeys.join('\0'),
    areaKeys: Object.freeze(sortedKeys.slice()),
    size: sortedKeys.length,
    has: (areaKey: string) => lookup.has(areaKey),
  });
}

/** The set for "no members at all". A shared constant so it has one identity. */
export const EMPTY_VISIBLE_MEMBER_SET: VisibleMemberSet = buildSet([]);

/**
 * Derives the visible-member set. THE only derivation — both map and panel
 * sides call this, never their own inline filter.
 *
 * Sorting is by code point (`<`/`>` via the default string sort), not
 * `localeCompare`: a locale-sensitive collation would make the fingerprint
 * environment-dependent, which defeats its purpose.
 */
export function deriveVisibleMemberSet(input: VisibleMemberSetInput): VisibleMemberSet {
  const { candidateAreaKeys, scopedAreaKeys } = input;

  if (scopedAreaKeys != null) {
    if (scopedAreaKeys.length === 0 || candidateAreaKeys.length === 0) {
      return EMPTY_VISIBLE_MEMBER_SET;
    }
    const scoped = new Set(scopedAreaKeys);
    const members = Array.from(new Set(candidateAreaKeys)).filter((key) => scoped.has(key));
    if (members.length === 0) return EMPTY_VISIBLE_MEMBER_SET;
    return buildSet(members.sort());
  }

  if (candidateAreaKeys.length === 0) return EMPTY_VISIBLE_MEMBER_SET;
  return buildSet(Array.from(new Set(candidateAreaKeys)).sort());
}
