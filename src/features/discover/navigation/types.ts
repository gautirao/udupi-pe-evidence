/**
 * Typed canonical navigation model — Issue #1956 PR 1 (FE-2).
 *
 * Wire types for the public navigation API, mirrored field-by-field against the
 * COMMITTED Java sources (read, never edited, from this branch):
 *   backend/src/main/java/com/example/realestate/discover/navigation/NavigationNodeResponse.java
 *   backend/src/main/java/com/example/realestate/discover/navigation/NavigationCountsResponse.java
 *   backend/src/main/java/com/example/realestate/discover/navigation/AreaCountRollupService.java
 *   backend/src/main/java/com/example/realestate/discover/navigation/NavigationTreeValidationService.java
 * so future drift in FIELD SET or NAME surfaces as a type error rather than a
 * silent runtime shape mismatch.
 *
 * Pure types + structural constants only. No React, no fetch, no I/O.
 *
 * ── HIERARCHY SHAPE (authoritative, verified live on Bangalore revision 8) ──
 * The live tree is `City -> DIRECTION (depth 0) -> AREA (depth 1)`: five
 * Directions (`d:central`, `d:n`, `d:e`, `d:s`, `d:w`, display order 1..5) over
 * 323 AREA nodes (`a:<areaKey>`). CLUSTER ("Local Destination") is a LEGAL type
 * that simply has zero instances in Bangalore today; it may occupy depth 1 only.
 *
 * The server pins this with two invariants that this module mirrors:
 *   • #14 — node kinds are exactly {DIRECTION, CLUSTER, AREA}; roots must be
 *     DIRECTION; DIRECTION only at depth 0; no node deeper than depth 2; a
 *     CLUSTER at depth >= 2 is a forbidden third public level.
 *   • #4 — a CLUSTER with exactly one child is degenerate; a one-child
 *     DIRECTION is legitimate (a region may hold a single canonical area).
 *
 * Consumers must still DISPATCH ON TYPE, never on a depth literal — `depth` is
 * carried here as DATA (and as validator input) and nothing may branch level
 * KIND on it. See `nodeLevelKind.ts`.
 */

/**
 * A node's own type on the wire.
 *
 * `'ROOT'` is the SYNTHETIC city-top-level node minted by
 * `NavigationNodeResponse#forRoot` (depth `-1`, no `NavigationNode` row backs
 * it). The three PERSISTED kinds are `DIRECTION | CLUSTER | AREA` — those, and
 * only those, are what invariant #14's `VALID_NODE_KINDS` accepts.
 */
export type NavigationNodeType = 'ROOT' | 'DIRECTION' | 'CLUSTER' | 'AREA';

/** The three persisted node kinds — invariant #14's `VALID_NODE_KINDS`, verbatim. */
export const PERSISTED_NODE_TYPES = ['DIRECTION', 'CLUSTER', 'AREA'] as const;
export type PersistedNodeType = (typeof PERSISTED_NODE_TYPES)[number];

/** The literal synthetic city-root key (`NavigationController.ROOT_NODE_KEY`). */
export const ROOT_NODE_KEY = 'root';

/** Depth the synthetic city root reports (`forRoot` passes `-1`). */
export const CITY_ROOT_DEPTH = -1;

/** Invariant #14(d): a DIRECTION node may only ever occupy depth 0. */
export const DIRECTION_DEPTH = 0;

/**
 * Invariant #14(e): the locked product contract permits exactly
 * `City -> Direction -> AREA` and `City -> Direction -> Local Destination -> AREA`
 * — depth 2 is the ceiling and a CLUSTER may only occupy depth 1.
 */
export const MAX_PUBLIC_DEPTH = 2;

/**
 * What following a child link leads to. `'LISTINGS'` is minted explicitly for an
 * AREA leaf; every other value is the homogeneous `nodeType` of the first child.
 * `null` is a REAL, DESIGNED empty level (a childless CLUSTER, or a root with no
 * children) — never an invalid-node fallback.
 */
export type NextLevelType = 'DIRECTION' | 'CLUSTER' | 'AREA' | 'LISTINGS' | null;

/**
 * Resolution rung from `GET .../navigation/resolve` (`NavigationResolution`).
 * `ALIAS` is RESERVED — this build has no alias store, so no server path returns
 * it. Kept so a future alias rung is a compile-time-visible addition.
 */
export type NavigationResolution = 'EXACT' | 'ALIAS' | 'ANCESTOR' | 'CITY_ROOT';

/**
 * Thin ancestry/children entry (`NavigationNodeResponse.NavigationChildSummary`).
 *
 * Issue #1956 PR 3 (Slice 4) widened this record ADDITIVELY on the backend:
 *   • `areaKey` is non-null ONLY for an AREA child; `null` for DIRECTION/CLUSTER.
 *   • `centreLat`/`centreLon` are populated for real child nodes (AREA and
 *     CLUSTER/DIRECTION alike) — the CENTROID (arithmetic mean) of member area
 *     centres, not a bounding-box centre. Both are null together, never one
 *     without the other.
 *
 * All three fields are OPTIONAL AND NULLABLE. This is deliberate, not lazy
 * typing: `AreasBreadcrumbTrail.tsx` constructs a synthetic
 * `NavigationChildSummary` literal that has no coordinates to give, so the
 * fields must stay optional for that literal to keep compiling. Every
 * consumer MUST treat `undefined` and `null` IDENTICALLY here — never branch
 * on one but not the other.
 *
 * ── COORDINATES ARE FOR THE children[] MAP-DESTINATION PATH ONLY ──
 * This same shape backs BOTH `children[]` and `ancestry[]` (it is one nested
 * record on the wire). No consumer may read `centreLat`/`centreLon`/`areaKey`
 * off an `ancestry` entry — those fields exist for the current node's direct
 * map-rendered children, not for the breadcrumb trail.
 *
 * ── ISSUE #2086 WIDENING (S3, additive) ──
 * `descendantAreaCount`, `representativeAreaKeys`, `bounds` and
 * `bearingDegrees` mirror `NavigationChildSummary` on the Java side field for
 * field. `descendantAreaCount` is the CANONICAL area count including
 * zero-listing areas — never conflate it with the listing-derived
 * `NavigationNodeCount.matchingAreaCount` on `/counts`; the backend proves
 * they differ for the same node in the same request. `representativeAreaKeys`
 * is never null on the wire (may be empty) but is typed optional here for the
 * same synthetic-literal reason as the coordinate fields above.
 * `bearingDegrees` is null for depth-0 children (Directions under ROOT), and
 * within [0,360) below — treat a present-and-null value as a real "no
 * bearing" answer, not a missing field.
 */
export interface NavigationChildSummary {
  nodeKey: string;
  nodeType: NavigationNodeType;
  displayLabel: string;
  displayOrder: number;
  /** Non-null ONLY for an AREA child. `null`/`undefined` for DIRECTION/CLUSTER — treat identically. */
  areaKey?: string | null;
  /** Centroid latitude of this child's member area centres. `null`/`undefined` together with `centreLon`. */
  centreLat?: number | null;
  /** Centroid longitude of this child's member area centres. `null`/`undefined` together with `centreLat`. */
  centreLon?: number | null;
  /**
   * Canonical descendant AREA count under this child, INCLUDING zero-listing
   * areas. Distinct from the listing-derived `matchingAreaCount` on
   * `/counts` — never conflate the two. Optional/nullable per the wire
   * contract.
   */
  descendantAreaCount?: number | null;
  /** Never null on the wire (may be empty); optional here for the synthetic-literal case. */
  representativeAreaKeys?: string[];
  /** Same shape as the outer node's bounds. */
  bounds?: NavigationBounds | null;
  /**
   * Bearing in degrees [0,360) from the PARENT node's centre to this child's
   * centre — never relative to the user or camera. `null` for depth-0
   * children (Directions under ROOT); present-and-null is a real value, not
   * an absent field.
   */
  bearingDegrees?: number | null;
}

/**
 * `NavigationBoundsResponse` — each coordinate is independently nullable
 * server-side; the WHOLE object is null only for the synthetic root.
 */
export interface NavigationBounds {
  centreLat: number | null;
  centreLon: number | null;
  minLat: number | null;
  minLon: number | null;
  maxLat: number | null;
  maxLon: number | null;
}

/**
 * STRICT/normalized shape of `GET .../navigation/{nodeKey}`.
 *
 * `NavigationNodeResponse` is `@JsonInclude(NON_NULL)` with no global inclusion
 * override, so a null-valued field is OMITTED from the JSON entirely rather than
 * sent as `"field": null`. This interface is therefore the LOGICAL shape after
 * absent-key-to-null normalisation; `NavigationNodeWire` below is the literal
 * wire shape. Consumers must only ever see this strict type.
 */
export interface NavigationNodeResponse {
  nodeKey: string;
  nodeType: NavigationNodeType;
  displayLabel: string;
  /** Structural DATA only. Never branch level KIND on this — see `nodeLevelKind.ts`. */
  depth: number;
  regionKey: string | null;
  ancestry: NavigationChildSummary[];
  nextLevelType: NextLevelType;
  children: NavigationChildSummary[];
  revisionId: number;
  bounds: NavigationBounds | null;
  descendantAreaKeys: string[] | null;
  areaKey: string | null;
}

/**
 * Literal wire shape: the five server-nullable fields arrive as ABSENT KEYS
 * (`undefined` after `JSON.parse`), never as present-and-null.
 */
export interface NavigationNodeWire {
  nodeKey: string;
  nodeType: NavigationNodeType;
  displayLabel: string;
  depth: number;
  regionKey?: string | null;
  ancestry: NavigationChildSummary[];
  nextLevelType?: NextLevelType;
  children: NavigationChildSummary[];
  revisionId: number;
  bounds?: NavigationBounds | null;
  descendantAreaKeys?: string[] | null;
  areaKey?: string | null;
}

/**
 * `GET .../navigation/resolve?node=<key>`. This route 404s ONLY when the city has
 * no active hierarchy at all — a stale/unknown/malformed key is resolved
 * SERVER-SIDE (EXACT -> ANCESTOR -> CITY_ROOT) and always returns 200 for an
 * active city. Callers must not conflate the two.
 */
export interface NavigationResolveResponse {
  requested: string;
  resolution: NavigationResolution;
  node: NavigationNodeResponse;
  revisionId: number;
}

/** Literal wire shape of the resolve response (unnormalized inlined `node`). */
export interface NavigationResolveResponseWire {
  requested: string;
  resolution: NavigationResolution;
  node: NavigationNodeWire;
  revisionId: number;
}

/**
 * One node's rolled-up display-time totals — `AreaCountRollupService.NodeCount`,
 * which #1956 PR 1 extended with `schoolCount` alongside the pre-existing
 * `count`.
 *
 * `count` KEEPS its name for the listing total and there is deliberately NO
 * `listingCount` alias: two names for one number invites drift. Do not add one
 * here either.
 */
export interface NavigationNodeCount {
  nodeKey: string;
  /** This node's rolled-up LISTING total. Server-computed. Never summed client-side. */
  count: number;
  /**
   * This node's rolled-up DISTINCT-SCHOOL total. Server-computed.
   *
   * Distinctness across a cluster's member areas is ALREADY APPLIED here: the
   * server unions on school identity across the node's descendant areas, so a
   * school present in two of them is counted once in this number. The frontend
   * must therefore NOT re-run a dedup pass over member areas, and must not
   * re-derive this number by adding anything up.
   *
   * See {@link NavigationCountsResponse.areaSchoolCounts} for the canonical
   * statement of the rollup model and why the per-area map over-counts relative
   * to this field.
   */
  schoolCount: number;
  /**
   * DISTINCT descendant AREA count under this child whose filtered
   * {@link NavigationCountsResponse.areaCounts} value is > 0 — the number
   * `presentStructuralLevel`'s `matchingAreaCount` parameter needs, computed
   * SERVER-SIDE from data already held by the counts path.
   *
   * This is an AREA count, NOT a listing count — a child with 1,736 listings
   * across 12 eligible areas reports `12` here, never `1736`; do not conflate
   * it with {@link count}. Summing this across siblings to derive any total
   * is the same arithmetically-wrong move {@link areaCounts} warns against —
   * treat it as this child's own number only.
   *
   * ALWAYS PRESENT: `0` is a REAL, MEANINGFUL value (this child has no
   * descendant area with an eligible listing under the current filters), not
   * an absent/unknown signal — unlike the historical client-side
   * "entailed-zero-or-null" compromise this field replaces, `0` here is never
   * ambiguous with "not computed."
   */
  matchingAreaCount: number;
}

/**
 * `GET .../navigation/{nodeKey}/counts` (`NavigationCountsResponse`).
 *
 * Every field is non-null server-side (`count`/`schoolCount`/`revisionId` are
 * primitive `long`; `areaCounts`, `areaSchoolCounts` and `children` are always
 * constructed), so the record's `@JsonInclude(NON_NULL)` never elides anything
 * here and no wire/strict split is needed — unlike `NavigationNodeResponse`.
 *
 * ONE call returns the node's own totals AND every direct child's totals AND the
 * whole-city per-area listing AND per-area school maps, so a level render costs a
 * bounded number of requests independent of child count.
 */
export interface NavigationCountsResponse {
  nodeKey: string;
  /** This node's own rolled-up LISTING total. */
  count: number;
  /** This node's own rolled-up DISTINCT-SCHOOL total. */
  schoolCount: number;
  /**
   * WHOLE-CITY `area_key -> listing count` map the totals were rolled up from,
   * exposed so per-area listing counts need no follow-up round trip.
   *
   * This is a LOOKUP, not an aggregation input. Summing it client-side to
   * re-derive a node total is the exact bug class this PR exists to prevent.
   */
  areaCounts: Record<string, number>;
  /**
   * WHOLE-CITY `area_key -> distinct-school count` map — the school-dimension
   * mirror of {@link areaCounts}, same shape, same `Map<String, Long>` on the
   * wire. It is what makes AC1.9's Schools-journey per-area visibility
   * (`eligibleSchoolCount > 0`) implementable without inventing numbers.
   *
   * ══ CANONICAL STATEMENT OF THE SCHOOL-COUNT ROLLUP MODEL ══
   * This is the ONE place the model is written out. Every other site that needs
   * it — {@link NavigationNodeCount.schoolCount}, `areasDestination.ts`,
   * `useDiscoverNavigationCounts.ts` — links here and states only its own
   * operative rule. Four paraphrases of this paragraph are what let it drift out
   * of date once already; do not add a fifth.
   *
   * A school is counted in EVERY area it has qualifying coverage in. There is no
   * canonical-area partition: the server does NOT collapse each school to one
   * area, so a school genuinely present in two areas appears under BOTH keys
   * here. A parent's total is then a UNION-DISTINCT over its descendant areas —
   * that school counts ONCE for the parent, having been counted twice across
   * these per-area entries.
   *
   * Two consequences, and they pull in opposite directions:
   *   • `sum(areaSchoolCounts) >= schoolCount`, often strictly. Summing this map
   *     to derive ANY total is arithmetically WRONG — not merely the discouraged
   *     shortcut it is for {@link areaCounts}. Read it as a per-area LOOKUP only;
   *     every total comes from `schoolCount` / `children[].schoolCount`.
   *   • Equally, the frontend must NOT re-run a dedup pass over member areas to
   *     "correct" a parent total. The server already unioned on school identity;
   *     a second pass client-side can only double-count or disagree.
   *
   * An area with no counted schools is ABSENT from this map, not zero-valued.
   */
  areaSchoolCounts: Record<string, number>;
  /** Each direct child's own rolled-up listing + school totals, in display order. */
  children: NavigationNodeCount[];
  revisionId: number;
  /**
   * #2170: `true` ONLY on the Admin City Launch PREVIEW route
   * (`CityLaunchPreviewService#getNavigationCounts`), which has no per-revision
   * schools simulation at all yet (unlike Agri's
   * `sandbox_agri_destination_classification` pipeline, #2167) and so hardcodes
   * `schoolCount`/`areaSchoolCounts` to zero/empty for EVERY revision. Without
   * this flag, a genuinely schools-less city and an un-simulated preview are
   * indistinguishable on the wire — both render as a flat zero.
   *
   * `undefined`/absent on every PRODUCTION response
   * (`NavigationController#getCounts`), whose `schoolCount`/`areaSchoolCounts`
   * are always real, precise counts — never `false`, so a consumer's presence
   * check (`schoolsNotSimulatedForRevision === true`) cannot be spoofed by a
   * stray literal, and production's wire shape is unaffected by this field.
   */
  schoolsNotSimulatedForRevision?: boolean;
}

/**
 * `GET .../cities/{city}/areas/{areaKey}/navigation-path` — the direct-search
 * convergence path, resolved from the SAME cached graph the structural routes
 * read, so direct-search and guided-navigation ancestry can never disagree for a
 * given revision.
 */
export interface NavigationPathResponse {
  areaKey: string;
  nodeKey: string;
  displayLabel: string;
  ancestry: NavigationChildSummary[];
  revisionId: number;
}

/**
 * A single AREA member of a browse cluster or structural level, as the pure
 * arithmetic/visibility modules consume it.
 *
 * Both eligibility counts are SERVER-provided (`areaCounts` for listings, the
 * school provider for schools). This type lives here rather than in
 * `journeyVisibility.ts` so `nearbyAreaArithmetic.ts` and `areasDestination.ts`
 * can both use it without an import cycle.
 */
export interface AreaMember {
  areaKey: string;
  /** Stable canonical label from the server's `displayLabel`. Never slug-inferred. */
  displayLabel: string;
  /** Server-provided count of listings eligible under the CURRENT filters. */
  eligibleListingCount: number;
  /** Server-provided count of distinct schools located inside this area. */
  eligibleSchoolCount: number;
  /** Server-provided sibling display order, when known. Used only as a tiebreak. */
  displayOrder?: number;
}
