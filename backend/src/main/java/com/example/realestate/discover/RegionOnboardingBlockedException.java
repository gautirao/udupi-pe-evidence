package com.example.realestate.discover;

/**
 * Thrown by {@link CityRegionOnboardingService#apply(int)} when onboarding a city's regions
 * cannot proceed safely (#1882). The transaction rolls back — zero writes occur when this is
 * thrown.
 *
 * <p>Reasons:
 * <ul>
 *   <li>{@link Reason#MISSING_POLICY} — no {@code city_region_policy} row for the city; the
 *       city has not been assigned a region_model yet.</li>
 *   <li>{@link Reason#MISSING_CLASSIFICATIONS} — {@code regional_area_classifications} has no
 *       rows for the city; {@code RegionalClassificationBackfillService} must run first.</li>
 *   <li>{@link Reason#UNRESOLVED_SPLIT_OR_DEGENERATE} — at least one active {@code area_group}
 *       projects to more than one region (SPLIT) or has no eligible/overridden member
 *       (DEGENERATE), and no {@code regional_area_overrides} row resolves it. This is a
 *       correctness gate, not a bug — some cities' curated groups may legitimately span
 *       multiple auto-projected regions under a given policy; that must be resolved by an
 *       explicit override, never by silent first-member/majority/focus-point fallback.</li>
 *   <li>{@link Reason#ASSIGNMENT_INTEGRITY_BREACH} — internal invariant failure: an eligible
 *       area ended up assigned to zero or more than one region in the computed membership set.</li>
 *   <li>{@link Reason#NAMESPACE_COLLISION} — a region_key about to be materialized for this city
 *       (per its {@code region_model}) collides with an active {@code area_groups.slug} for the
 *       same city (#1910). Region keys and area_group slugs must be disjoint — never silently
 *       resolved by a "region wins" tie-break. This is the friendly, apply()-time check; the
 *       {@code fn_reject_area_group_region_key_collision}/
 *       {@code fn_reject_city_region_area_group_collision} database triggers added in
 *       {@code V119__enforce_area_group_region_key_disjointness.sql} (#1910 PR2 review follow-up)
 *       back it up at the database level, rejecting the same collision on any non-concurrent write
 *       to either table — a later migration adding a colliding {@code area_group}, not just a
 *       re-run of {@code apply()} itself. (Concurrent-write locking is a tracked follow-up, not
 *       solved by these triggers.)</li>
 * </ul>
 */
class RegionOnboardingBlockedException extends RuntimeException {

    enum Reason {
        MISSING_POLICY,
        MISSING_CLASSIFICATIONS,
        UNRESOLVED_SPLIT_OR_DEGENERATE,
        ASSIGNMENT_INTEGRITY_BREACH,
        NAMESPACE_COLLISION
    }

    private final Reason reason;

    RegionOnboardingBlockedException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    Reason reason() {
        return reason;
    }
}
