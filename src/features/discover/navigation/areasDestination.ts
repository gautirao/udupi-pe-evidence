/**
 * AC1.10 — dedup identities + the typed destination model — Issue #1956 PR 1 (FE-2).
 *
 * ── Totals are SERVER-COMPUTED ──
 * Nothing in this module sums anything the server already returns. Re-deriving a
 * node total from the per-area map, or from a children array, is the exact bug
 * class this PR exists to prevent: the two numbers drift the moment a filter,
 * a revision or a rollup rule changes on one side only, and the screen then shows
 * a count the results cannot justify. `buildAreasDestination` therefore takes the
 * server's totals as INPUTS and carries them through unchanged.
 *
 * ── Distinct schools across a cluster's member areas ──
 * Already applied SERVER-SIDE: the node's own `schoolCount` is a union-distinct
 * rollup over its descendant areas, so a school present in several member areas
 * is counted once in it. The frontend must NOT re-run a dedup pass over member
 * areas — a second pass can only double-count or disagree — and must not sum the
 * per-area school map to re-derive a total, because that map counts such a school
 * under every area it is in. This module models the CONSUMPTION of the server's
 * number (see {@link distinctSchoolCountForNode}).
 *
 * The rollup model itself is stated ONCE, canonically, on
 * `NavigationCountsResponse.areaSchoolCounts` in `./types`. Read it there rather
 * than restating it here.
 *
 * ── School-count semantics, locked ──
 * `schoolCount` = distinct schools physically LOCATED INSIDE the represented
 * canonical area or its member areas. "Serving an area" is NOT "located inside"
 * and is not adopted. No radius, catchment, travel-time, admission or quality
 * semantics attach to this number.
 *
 * School counts are SECONDARY METADATA. In the Areas-first journey the LISTING
 * count is primary and `schoolCount` is optional secondary — the mock's
 * school-count-primary ordering is explicitly out of scope for #1956 and is not
 * adopted here (which is why `schoolCount` is nullable and `listingCount` is not).
 *
 * Pure. No React, no I/O.
 */
import type { NavigationNodeCount } from './types';

/* ────────────────────────────── dedup identities ────────────────────────────── */

/**
 * Order-preserving, FIRST-WINS dedup over an explicit identity function.
 *
 * First-wins rather than last-wins because the arrays being deduped arrive in
 * server display order, and the first occurrence is the one whose position the
 * user's eye has already fixed on.
 */
function dedupeBy<T>(items: readonly T[], identityOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const identity = identityOf(item);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    result.push(item);
  }
  return result;
}

/** Areas dedup on `area_key` — the canonical area identity. */
export function dedupeAreas<T extends { areaKey: string }>(areas: readonly T[]): T[] {
  return dedupeBy(areas, (area) => area.areaKey);
}

/**
 * Listings dedup on canonical listing identity.
 *
 * A listing reachable through two member areas of the same cluster must be ONE
 * card, not two.
 */
export function dedupeListings<T extends { listingId: string }>(listings: readonly T[]): T[] {
  return dedupeBy(listings, (listing) => listing.listingId);
}

/**
 * Schools dedup on stable school identity.
 *
 * This is a RENDER-LIST guard for a school list a caller assembled itself. It is
 * NOT a correction to `schoolCount` — see {@link distinctSchoolCountForNode}.
 */
export function dedupeSchools<T extends { schoolId: string }>(schools: readonly T[]): T[] {
  return dedupeBy(schools, (school) => school.schoolId);
}

/* ─────────────────────── the typed destination model ────────────────────────── */

/**
 * Every level the Areas journey can land on.
 *
 * `'area-cluster'` is the VISUAL cluster (a map-side grouping of AREA nodes) as
 * distinct from `'local-destination'` (the persisted CLUSTER node type). They are
 * different things and only the visual one may carry the `+N` form.
 */
export type AreasDestinationLevel =
  | 'city-root'
  | 'direction'
  | 'local-destination'
  | 'area-cluster'
  | 'area'
  | 'listings';

/**
 * The EXHAUSTIVE set of levels that receive a school count: Direction, Local
 * Destination, visual AREA cluster, individual AREA — and the selected
 * shared-marker variants of those, which are the same four levels with
 * `sharedMarkerSelected` set, not extra levels. Nowhere else.
 */
export const SCHOOL_COUNT_LEVELS: readonly AreasDestinationLevel[] = [
  'direction',
  'local-destination',
  'area-cluster',
  'area',
];

/** Whether a level receives a school count at all. */
export function levelReceivesSchoolCount(level: AreasDestinationLevel): boolean {
  return SCHOOL_COUNT_LEVELS.includes(level);
}

export interface AreasDestinationInput {
  level: AreasDestinationLevel;
  /** `null` at the city root. */
  nodeKey: string | null;
  /** Stable canonical label from the server. */
  displayLabel: string;
  /**
   * SERVER-computed listing total for this destination. PRIMARY metric.
   * Passed through verbatim — never recomputed from `areaKeys`.
   */
  serverListingCount: number;
  /**
   * SERVER-computed distinct-school total. SECONDARY metadata, and `null` when
   * the server did not supply one. Passed through verbatim.
   */
  serverSchoolCount: number | null;
  /** Member area keys, deduped on entry. */
  areaKeys: readonly string[];
  /** Whether this destination is the selected shared-marker variant of its level. */
  sharedMarkerSelected?: boolean;
}

export interface AreasDestination {
  level: AreasDestinationLevel;
  nodeKey: string | null;
  displayLabel: string;
  /** PRIMARY. Server's number, unmodified. */
  listingCount: number;
  /**
   * SECONDARY. Server's number, unmodified; `null` both when the server supplied
   * none AND when this level does not receive school counts at all.
   */
  schoolCount: number | null;
  /** Deduped on `area_key`, order preserved. */
  areaKeys: string[];
  sharedMarkerSelected: boolean;
}

/**
 * Builds the typed destination.
 *
 * The two counts are COPIED, not computed. If you ever find yourself wanting to
 * add `areaKeys.reduce(...)` here, stop: the server already returns that number
 * and a second implementation of it is a divergence waiting to happen.
 *
 * A school count supplied for a level that does not receive one is DROPPED to
 * `null` rather than carried, so the exhaustive level list above is the single
 * enforcement point rather than a comment nobody checks.
 */
export function buildAreasDestination(input: AreasDestinationInput): AreasDestination {
  const receivesSchoolCount = levelReceivesSchoolCount(input.level);
  return {
    level: input.level,
    nodeKey: input.nodeKey,
    displayLabel: input.displayLabel,
    listingCount: input.serverListingCount,
    schoolCount: receivesSchoolCount ? input.serverSchoolCount : null,
    areaKeys: dedupeBy(input.areaKeys, (key) => key),
    sharedMarkerSelected: input.sharedMarkerSelected ?? false,
  };
}

/**
 * The distinct-school total for a node, read straight off the server's rollup.
 *
 * Exists as a NAMED function rather than a property access so the guarantee it
 * consumes has somewhere to be written down and somewhere to be tested: summing
 * `children[].schoolCount` is NOT equivalent and must never be substituted. Each
 * child's count is union-distinct within THAT CHILD only, so a school reachable
 * under two children is counted in both; the parent's own `schoolCount` is the
 * one number that unions across them. See
 * `NavigationCountsResponse.areaSchoolCounts` in `./types` for the canonical
 * statement.
 */
export function distinctSchoolCountForNode(nodeCount: NavigationNodeCount): number {
  return nodeCount.schoolCount;
}

/**
 * The listing total for a node, read straight off the server's rollup. Same
 * reasoning as {@link distinctSchoolCountForNode}: `count` keeps its name and has
 * deliberately no `listingCount` alias on the wire.
 */
export function listingCountForNode(nodeCount: NavigationNodeCount): number {
  return nodeCount.count;
}
