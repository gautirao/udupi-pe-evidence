package com.example.realestate.discover;

/**
 * Result of {@link AreaOnboardingApplyService#apply} (#1887 PR2) — every canonical change (or
 * deliberately-skipped candidate) made while applying one reviewed, apply-allowed batch.
 *
 * <p>#1887 rework FIX 5: {@code aliasesAdded}/{@code skippedAlias} counters were REMOVED —
 * {@code apply()} no longer populates {@code area_alias} at all (alias population is deferred to a
 * future PR once an explicit, reviewed alias contract exists).
 *
 * @param batchId            the {@code area_onboarding_batch.id} that was applied
 * @param created            number of brand-new {@code areas} rows inserted
 * @param updated            number of existing {@code areas} rows whose name/district/geometry
 *                           actually changed
 * @param unchanged          number of clean, approved candidates whose target area already had
 *                           identical values (compare-before-write no-op — see #1887 D6)
 * @param geometryPreserved  number of candidates whose geometry was NOT written because the
 *                           candidate's {@link GeometryTrust} rank was lower than the existing
 *                           area's (#1887 D4)
 * @param auditRows          total NEW {@code area_onboarding_apply_audit} rows actually inserted
 *                           this apply (#1887 rework FIX 2: an idempotent no-op re-audit — e.g. a
 *                           repeat {@code GEOMETRY_PRESERVED} on an unchanged re-apply — does NOT
 *                           count here)
 * @param outboxEnqueued     1 if a NEW {@code area_region_reclass_outbox} row was inserted this
 *                           apply, 0 if none was needed or the deterministic event_id already
 *                           existed (idempotent re-apply — see #1887 AC4)
 * @param skippedNotApproved number of candidates NOT applied because their outcome was not clean
 *                           or their {@code review_decision} was not {@code APPROVED} (e.g.
 *                           {@code REJECTED})
 */
public record ApplyReport(
        long batchId,
        int created,
        int updated,
        int unchanged,
        int geometryPreserved,
        int auditRows,
        int outboxEnqueued,
        int skippedNotApproved
) {}
