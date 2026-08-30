package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * ApplicationRunner that triggers {@link AreaOnboardingApplyService#apply} on startup (#1887
 * PR2). Mirrors {@link AreaOnboardingRunner}'s gated, no-HTTP-endpoint shape exactly.
 *
 * <p>Gated by {@code app.area-onboarding.apply.enabled=true} (default: false) — the bean is not
 * created at all when the property is absent or false. There is NO HTTP endpoint anywhere in this
 * PR, and no live OSM/Nominatim/geo-provider call — apply() reads only the persisted
 * {@code candidate_payload} snapshot. Errors are logged, never rethrown — an apply failure is not
 * fatal to application startup (the transaction itself still rolls back cleanly; only the
 * ApplicationRunner's own error handling is fire-and-log).
 *
 * <h2>Never run alongside the review runner in the same startup (#1887 rework FIX 1)</h2>
 * {@link AreaOnboardingReviewRunner} and this class are independent {@code ApplicationRunner}
 * beans with NO guaranteed relative execution order if both happen to be enabled at once. Rather
 * than relying on Spring bean-discovery ordering, this runner FAILS FAST (before doing any work,
 * and NOT swallowed by the fire-and-log try/catch below) if
 * {@code app.area-onboarding.review.enabled} is ALSO {@code true} at the same startup — review and
 * apply must be run as separate application startups.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.area-onboarding.apply",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false
)
public class AreaOnboardingApplyRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AreaOnboardingApplyRunner.class);

    private final AreaOnboardingApplyService applyService;
    private final long batchId;
    private final String appliedBy;
    private final boolean reviewRunnerAlsoEnabled;

    public AreaOnboardingApplyRunner(
            AreaOnboardingApplyService applyService,
            @Value("${app.area-onboarding.apply.batch-id:-1}") long batchId,
            @Value("${app.area-onboarding.apply.applied-by:system}") String appliedBy,
            @Value("${app.area-onboarding.review.enabled:false}") boolean reviewRunnerAlsoEnabled) {
        this.applyService = applyService;
        this.batchId = batchId;
        this.appliedBy = appliedBy;
        this.reviewRunnerAlsoEnabled = reviewRunnerAlsoEnabled;
    }

    @Override
    public void run(ApplicationArguments args) {
        // Fail fast, OUTSIDE the try/catch below — a startup misconfiguration (both runners
        // enabled at once) must abort startup, not be logged-and-swallowed like an apply failure.
        if (reviewRunnerAlsoEnabled) {
            throw new IllegalStateException(
                    "AreaOnboardingApplyRunner: app.area-onboarding.review.enabled=true is ALSO set for "
                            + "this startup — the review and apply runners have no guaranteed relative "
                            + "execution order and must never both be enabled in the same application "
                            + "startup (#1887 rework FIX 1). Run review and apply as separate startups.");
        }

        log.info("AreaOnboardingApplyRunner: app.area-onboarding.apply.enabled=true batchId={} appliedBy={} "
                + "— starting apply", batchId, appliedBy);
        try {
            if (batchId <= 0) {
                log.error("AreaOnboardingApplyRunner: app.area-onboarding.apply.batch-id is required — skipping");
                return;
            }
            ApplyReport report = applyService.apply(batchId, appliedBy);
            log.info("AreaOnboardingApplyRunner: batchId={} — created={} updated={} unchanged={} "
                            + "geometryPreserved={} auditRows={} outboxEnqueued={} skippedNotApproved={}",
                    batchId, report.created(), report.updated(), report.unchanged(), report.geometryPreserved(),
                    report.auditRows(), report.outboxEnqueued(), report.skippedNotApproved());
        } catch (Exception e) {
            // Log and allow application to continue — apply failure is not fatal to startup. The
            // @Transactional method itself has already rolled back cleanly on any thrown exception.
            log.error("AreaOnboardingApplyRunner: apply failed for batchId={} — application continues",
                    batchId, e);
        }
    }
}
