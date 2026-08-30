package com.example.realestate.discover;

/**
 * One canonical-change (or deliberately-protected non-change) action recorded per
 * {@code area_onboarding_apply_audit} row (#1887 PR2, design decision D2).
 *
 * <p>{@link #INACTIVATE_AREA}, {@link #MERGE_AREA}, and (as of the #1887 rework) {@link
 * #ALIAS_ADDED} are reserved CHECK-constraint values only — no PR2 code path in {@link
 * AreaOnboardingApplyService} writes them. {@code INACTIVATE_AREA}/{@code MERGE_AREA} because no
 * dry-run outcome drives an inactivate/merge decision yet (see {@link AreaLifecycleStatus});
 * {@code ALIAS_ADDED} because automatic alias population was REMOVED from {@code apply()} (#1887
 * rework FIX 5) — alias population is deferred to a future PR once an explicit, reviewed alias
 * contract exists. The {@code area_onboarding_apply_audit} CHECK constraint still allows the value
 * so a future PR can start writing it without another migration.
 *
 * <p>{@link #CREATE_AREA}, {@link #UPDATE_AREA}, and {@link #GEOMETRY_PRESERVED} audit rows'
 * {@code after_json} payload also carries the batch's {@code provider} and the candidate's
 * {@code external_source_id} (#1887 rework FIX 6) — see {@code AreaOnboardingApplyService}'s
 * {@code AreaSnapshotWithProvenance}. This is provenance WITHIN the existing audit row, not a new
 * subsystem; a durable, cross-batch provider-ID -&gt; area mapping is explicitly deferred to PR3.
 */
public enum ApplyAction {
    /** A brand-new {@code areas} row was inserted from a READY_TO_CREATE candidate. */
    CREATE_AREA,
    /** An existing {@code areas} row's name/district/geometry was updated from a candidate. */
    UPDATE_AREA,
    /**
     * A candidate's geometry was NOT written because its {@link GeometryTrust} rank was lower
     * than the existing area's — the existing (higher-trust) geometry columns were preserved
     * unchanged (#1887 D4). Recorded via an idempotent insert (#1887 rework FIX 2) so an unchanged
     * re-apply of the same batch does not re-audit this decision.
     */
    GEOMETRY_PRESERVED,
    /**
     * Reserved — NOT written by any PR2 code path (#1887 rework FIX 5). Automatic alias creation
     * from apply() was removed; a future PR will populate this once a reviewed alias contract
     * exists.
     */
    ALIAS_ADDED,
    /** A durable {@code area_region_reclass_outbox} row was enqueued for this batch's city. */
    REGION_RECLASS_ENQUEUED,
    /** Reserved — not written by any PR2 code path. */
    INACTIVATE_AREA,
    /** Reserved — not written by any PR2 code path. */
    MERGE_AREA
}
