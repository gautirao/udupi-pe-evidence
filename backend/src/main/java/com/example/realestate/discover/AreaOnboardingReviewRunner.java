package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * ApplicationRunner that triggers {@link AreaOnboardingReviewService#approve} on startup (#1887
 * PR2). Mirrors {@link AreaOnboardingRunner}'s gated, no-HTTP-endpoint shape exactly.
 *
 * <p>Gated by {@code app.area-onboarding.review.enabled=true} (default: false) — the bean is not
 * created at all when the property is absent or false. There is NO HTTP endpoint anywhere in this
 * PR. Errors are logged, never rethrown — a review failure is not fatal to application startup.
 *
 * <h2>Never run alongside the apply runner in the same startup (#1887 rework FIX 1)</h2>
 * See {@link AreaOnboardingApplyRunner}'s matching javadoc — the two {@code ApplicationRunner}
 * beans have no guaranteed relative execution order, so this runner FAILS FAST (before doing any
 * work, and NOT swallowed by the fire-and-log try/catch below) if
 * {@code app.area-onboarding.apply.enabled} is ALSO {@code true} at the same startup.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.area-onboarding.review",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false
)
public class AreaOnboardingReviewRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AreaOnboardingReviewRunner.class);

    private final AreaOnboardingReviewService reviewService;
    private final long batchId;
    private final String reviewedBy;
    private final boolean applyRunnerAlsoEnabled;

    public AreaOnboardingReviewRunner(
            AreaOnboardingReviewService reviewService,
            @Value("${app.area-onboarding.review.batch-id:-1}") long batchId,
            @Value("${app.area-onboarding.review.reviewed-by:system}") String reviewedBy,
            @Value("${app.area-onboarding.apply.enabled:false}") boolean applyRunnerAlsoEnabled) {
        this.reviewService = reviewService;
        this.batchId = batchId;
        this.reviewedBy = reviewedBy;
        this.applyRunnerAlsoEnabled = applyRunnerAlsoEnabled;
    }

    @Override
    public void run(ApplicationArguments args) {
        // Fail fast, OUTSIDE the try/catch below — a startup misconfiguration (both runners
        // enabled at once) must abort startup, not be logged-and-swallowed like a review failure.
        if (applyRunnerAlsoEnabled) {
            throw new IllegalStateException(
                    "AreaOnboardingReviewRunner: app.area-onboarding.apply.enabled=true is ALSO set for "
                            + "this startup — the review and apply runners have no guaranteed relative "
                            + "execution order and must never both be enabled in the same application "
                            + "startup (#1887 rework FIX 1). Run review and apply as separate startups.");
        }

        log.info("AreaOnboardingReviewRunner: app.area-onboarding.review.enabled=true batchId={} reviewedBy={} "
                + "— starting approve", batchId, reviewedBy);
        try {
            if (batchId <= 0) {
                log.error("AreaOnboardingReviewRunner: app.area-onboarding.review.batch-id is required — skipping");
                return;
            }
            int approved = reviewService.approve(batchId, reviewedBy);
            log.info("AreaOnboardingReviewRunner: batchId={} reviewedBy={} — {} candidate(s) approved",
                    batchId, reviewedBy, approved);
        } catch (Exception e) {
            // Log and allow application to continue — a review failure is not fatal.
            log.error("AreaOnboardingReviewRunner: approve failed for batchId={} — application continues",
                    batchId, e);
        }
    }
}
