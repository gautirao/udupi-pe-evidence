package com.example.realestate.discover.navigation;

/**
 * Resolution kind for {@code GET /api/discover/cities/{city}/navigation/resolve} (#1956 AC17/
 * AC18) — how the requested {@code node} key mapped onto the CURRENT active {@link
 * NavigationGraph}.
 *
 * <p>{@link #ALIAS} is a RESERVED rung: this build has no alias store (no persisted
 * old-key-to-new-key mapping table or service), so no code path in {@code NavigationController}
 * ever returns it. It exists in this enum because the issue's "resolves to the canonical node
 * alias where available" wording licenses a future alias-store slice to wire this value in
 * without a response-shape change. {@code NavigationResolveIT} asserts {@code ALIAS} is
 * unreachable in THIS build precisely so that assertion breaks — flagging the gap loudly — the
 * day an alias store lands and someone forgets this rung is no longer reserved-only.
 */
public enum NavigationResolution {
    /** {@code node} is still present, unchanged, in the current active graph. */
    EXACT,

    /** RESERVED — never returned by this build. See class javadoc. */
    ALIAS,

    /** {@code node} no longer exists as-is, but the current graph offers a re-clustering-safe
     *  substitute that GENUINELY CONTAINS the requested geography. For a stale {@code "a:"} area
     *  key: the deepest surviving ancestor of that area. For a stale {@code "c:"} cluster key: the
     *  deepest CLUSTER whose subtree contains ALL surviving representative areas parsed out of the
     *  key's representative segment, else the deepest node of any type that does (which is how a
     *  region collapsed to bare depth-0 AREA leaves still resolves) — when the CLUSTER preference
     *  fires, the result is deliberately NOT necessarily the single deepest containing node overall.
     *
     *  <p>Containment is total, never partial: if no node anywhere contains EVERY surviving
     *  representative, this value is NOT used and the ladder falls through to {@link #CITY_ROOT}.
     *  A node holding only SOME of the requested areas is a disjoint relative, not an ancestor, and
     *  labelling one {@code ANCESTOR} would silently discard the rest of the caller's geography. */
    ANCESTOR,

    /** Nothing else resolved for an otherwise-active city; the synthetic city root is always a
     *  safe fallback. */
    CITY_ROOT
}
