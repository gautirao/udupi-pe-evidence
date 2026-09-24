package com.example.realestate.discover;

import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Admin HTTP surface for #2676 Slice B1b: reviewing and applying an already-staged
 * {@code area_onboarding_batch} (a batch is created by {@link AreaOnboardingService#dryRun}, out
 * of scope here). Deliberately three separate endpoints — no approve+apply fusion endpoint and no
 * per-candidate reject endpoint (out of B1b scope). {@code batchId} is always taken from the path,
 * never from a request body, and the acting admin's identity is always derived from the JWT via
 * {@link CallerInfo}, never client-supplied.
 *
 * <p>{@code @IsAdmin} gates all three endpoints with no per-city scoping, matching the same
 * single-operator-MVP decision already documented on
 * {@link com.example.realestate.discover.citylaunch.AdminCityLaunchLaunchController#launch} — see
 * that method's javadoc for the full rationale. {@code @IsAdmin} IS the authorization boundary for
 * every endpoint here — it alone decides who may call approve()/apply()/getBatch() at all. Each
 * service's own guarded row lock and state-machine checks are a SEPARATE, narrower concern:
 * {@link AreaOnboardingReviewService#approve} and {@link AreaOnboardingApplyService#apply} both take
 * the same first {@code FOR UPDATE} lock on the {@code area_onboarding_batch} row (in that order,
 * within their own single transaction), so a concurrent approve()/apply() pair on the SAME batch —
 * from two already-authorized admin callers — always serializes rather than racing or
 * double-applying. That lock protects concurrency/state integrity AFTER authorization; it plays no
 * part in deciding whether a caller is allowed to invoke these endpoints in the first place.
 */
@RestController
@RequestMapping("/api/admin/area-onboarding/batches/{batchId}")
public class AdminAreaOnboardingController {

    private static final Logger log = LoggerFactory.getLogger(AdminAreaOnboardingController.class);

    private final AreaOnboardingReviewService reviewService;
    private final AreaOnboardingApplyService applyService;
    private final AreaOnboardingBatchQuery batchQuery;

    public AdminAreaOnboardingController(
            AreaOnboardingReviewService reviewService,
            AreaOnboardingApplyService applyService,
            AreaOnboardingBatchQuery batchQuery) {
        this.reviewService = reviewService;
        this.applyService = applyService;
        this.batchQuery = batchQuery;
    }

    @IsAdmin
    @GetMapping
    public AreaOnboardingBatchDetail getBatch(@PathVariable long batchId) {
        return batchQuery.findBatchDetail(batchId);
    }

    @IsAdmin
    @PostMapping("/approve")
    public ApproveResult approve(@PathVariable long batchId, CallerInfo caller) {
        log.info("POST area-onboarding approve batchId={} adminId={}", batchId, caller.userId());
        int approvedCount = reviewService.approve(batchId, caller.userId().toString());
        return new ApproveResult(batchId, approvedCount);
    }

    @IsAdmin
    @PostMapping("/apply")
    public ApplyReport apply(@PathVariable long batchId, CallerInfo caller) {
        log.info("POST area-onboarding apply batchId={} adminId={}", batchId, caller.userId());
        return applyService.apply(batchId, caller.userId().toString());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleConflict(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", ex.getMessage()));
    }

    record ApproveResult(long batchId, int approvedCount) {}
}
