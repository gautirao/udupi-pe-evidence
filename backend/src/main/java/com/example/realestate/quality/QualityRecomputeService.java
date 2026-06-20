package com.example.realestate.quality;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

/**
 * Registers afterCommit quality-recompute hooks on write-path service methods.
 *
 * <h3>Responsibility split</h3>
 * <ul>
 *   <li>This class owns hook registration ({@link #recomputeAfterCommit}) and
 *       catch+log+never-rethrow safety ({@code safeRecompute}). It holds no
 *       transactional logic.</li>
 *   <li>{@link QualityRecomputeExecutor} owns the actual scoring, DB writes, and
 *       history management, all inside a {@code REQUIRES_NEW} transaction. Invoking
 *       that bean from here is a cross-bean call — Spring's proxy is active, so
 *       {@code REQUIRES_NEW} is honoured correctly (no same-bean self-invocation issue).</li>
 * </ul>
 *
 * <h3>Isolation guarantee</h3>
 * A recompute failure NEVER rolls back the listing write that triggered it because:
 * <ol>
 *   <li>The hook fires in {@code afterCommit} — the listing transaction is already committed.</li>
 *   <li>The executor runs in {@code REQUIRES_NEW} — its own transaction is independent.</li>
 *   <li>{@code safeRecompute} catches all exceptions and logs them without rethrowing.</li>
 * </ol>
 */
@Service
public class QualityRecomputeService {

    private static final Logger log = LoggerFactory.getLogger(QualityRecomputeService.class);

    /** Outcome of a single recompute — exposed for {@link QualityBackfillRunner}. */
    public enum RecomputeOutcome {
        /** Score computed and stored (sufficient data). */
        SCORED,
        /** Stored as NULL (honest-null / insufficient data). */
        INSUFFICIENT,
        /** Listing not found — skipped. */
        SKIPPED
    }

    private final QualityRecomputeExecutor executor;

    public QualityRecomputeService(QualityRecomputeExecutor executor) {
        this.executor = executor;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Write-path entry point
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Registers a quality recompute to run after the current transaction commits.
     *
     * <p>Call this at the END of any write-path method (create/update/approve/image change).
     * The recompute runs in its own {@code REQUIRES_NEW} transaction via
     * {@link QualityRecomputeExecutor#recompute}. A recompute failure never rolls back the
     * listing write.
     *
     * <p>If no transaction is active (e.g. test or backfill context), the recompute runs
     * inline immediately.
     *
     * @param listingId the listing to recompute after commit
     */
    public void recomputeAfterCommit(UUID listingId) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    safeRecompute(listingId);
                }
            });
        } else {
            // No active transaction — run inline (test / backfill context)
            safeRecompute(listingId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Delegates to {@link QualityRecomputeExecutor#recompute}, catching and logging all
     * exceptions. Never rethrows — a recompute failure must not surface to callers.
     */
    private void safeRecompute(UUID listingId) {
        try {
            executor.recompute(listingId);
        } catch (Exception e) {
            log.error("Quality recompute failed listingId={} — score left stale (backfill will repair): {}",
                    listingId, e.getMessage(), e);
        }
    }

    /**
     * Builds the insufficient-data diagnostic JSON.
     * Format: {@code {"status":"insufficient_data","missing":["TYPE1","TYPE2",...]}}
     * Hand-built (no reflection) for byte-identical output across calls.
     *
     * <p>Static so {@link QualityRecomputeExecutor} can reuse it without a circular dependency.
     */
    static String buildInsufficientBreakdown(List<String> missingTypes) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"status\":\"insufficient_data\",\"missing\":[");
        for (int i = 0; i < missingTypes.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(missingTypes.get(i)).append('"');
        }
        sb.append("]}");
        return sb.toString();
    }
}
