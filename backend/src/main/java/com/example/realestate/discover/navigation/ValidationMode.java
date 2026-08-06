package com.example.realestate.discover.navigation;

/**
 * Discriminates how {@link NavigationTreeValidationService} treats checks #15 (breadth/Local
 * Destination mandate) and #16 (label provenance) — the two #2086-ADDITIVE checks — for a given
 * {@code validate(...)} call. Introduced by the PR #2111 rework fix (issue #2086 PR_REVIEW
 * rework_cycle 1): {@link NavigationGraphLoader} previously ran the SAME strict validation on every
 * runtime load of an already-PROMOTED revision as it does on a brand-new generated candidate, which
 * made the currently-promoted Bangalore revision (pre-#2086 shape, 36-86 direct AREA children)
 * unloadable on a fresh/restarted instance — a real availability regression, not a false positive.
 *
 * <p><b>Call-site mode, not a revision/version discriminator:</b> a per-row "generator version" or
 * "validated-under-contract-version" column would let the loader decide leniency per REVISION
 * rather than per CALL SITE, but was deliberately not chosen here: (1) it needs a new column/
 * migration, which this fix's scope explicitly excludes (no V124 changes, no new migration); (2)
 * the loader's three call sites ({@link NavigationCachePreloadRunner}, {@link
 * NavigationHierarchySafetyPoller} via {@link NavigationGraphCache}, and {@link
 * NavigationGraphCache#getActiveGraph}'s request-time lazy load) exist ONLY to load rows the
 * promotion step already accepted in the past — they never validate a candidate or drive a
 * promotion decision — so the call site alone already tells you unambiguously "this is a runtime
 * load of previously-promoted data, not a candidate being judged for promotion"; (3) a compliant
 * #2086 tree behaves IDENTICALLY under both modes (checks #15/#16 simply never fire), so leaving
 * the loader permanently on {@link #LENIENT_RUNTIME_LOAD} costs nothing once every promoted
 * revision is #2086-compliant — there is no future cleanup step this design requires. If a later
 * need arises to distinguish "known-legacy" from "known-compliant" revisions more precisely (e.g.
 * to alert once compliance is universal), a revision-scoped marker can be layered on top of this
 * enum without changing its meaning.
 */
public enum ValidationMode {

    /**
     * Every check (#1-#16) is fail-closed. The ONLY mode used for tree generation ({@link
     * NavigationTreeGenerationService}), admin candidate/preview validation ({@link
     * com.example.realestate.discover.citylaunch.CityLaunchNavigationOverrideService}), and — via
     * every {@code validate(...)} overload that does not explicitly request {@link
     * #LENIENT_RUNTIME_LOAD} — the safe DEFAULT for any future call site that does not specify a
     * mode.
     */
    STRICT,

    /**
     * Checks #1-#14 (cycles, orphans, depth/parentage, one-child clusters, area-leaf integrity,
     * sibling ordering, descendant counts, bounds, max depth, overrides, ancestry, hierarchy shape,
     * etc.) remain fully fail-closed — a genuinely corrupt legacy tree still fails to load. ONLY
     * checks #15 (breadth/Local Destination mandate) and #16 (label provenance) — the two checks
     * #2086 ADDED — are downgraded from a blocking {@link ValidationError} to a
     * {@link ValidationReport#lenientWarnings()} entry, so an already-PROMOTED pre-#2086 revision
     * that was valid under the OLD (pre-#2086) contract can still be loaded and served. Used ONLY by
     * {@link NavigationGraphLoader}, the sole entry point for loading an already-promoted revision at
     * runtime — never by generation or candidate-validation paths.
     */
    LENIENT_RUNTIME_LOAD
}
