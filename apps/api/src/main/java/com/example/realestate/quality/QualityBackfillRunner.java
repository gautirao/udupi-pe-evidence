package com.example.realestate.quality;

import com.example.realestate.listing.core.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One-shot quality score backfill runner.
 *
 * <p>Activated only when {@code app.quality-backfill.enabled=true} is set in the
 * environment or application properties. Never runs in the normal application boot.
 *
 * <p>How to trigger:
 * <pre>
 *   mvn spring-boot:run -Dspring-boot.run.arguments='--app.quality-backfill.enabled=true'
 * </pre>
 *
 * <h3>Algorithm</h3>
 * <ol>
 *   <li>Keyset-page over LIVE listings (status=LIVE, archived_at IS NULL, is_duplicate=false)
 *       in ascending UUID order (id &gt; lastId). Default batch size: 500.</li>
 *   <li>For each listing, call {@link QualityRecomputeExecutor#recompute(UUID)} directly
 *       (cross-bean call — Spring proxy active, {@code REQUIRES_NEW} honoured).</li>
 *   <li>Per-row try/catch: a bad row is logged and counted as failed; processing continues.</li>
 *   <li>Emit a structured summary log at the end: processed/scored/insufficient/skipped/failed/durationMs.</li>
 * </ol>
 *
 * <h3>Idempotency</h3>
 * Re-running the backfill is safe:
 * <ul>
 *   <li>Quality columns are always overwritten with the freshest score.</li>
 *   <li>History rows are suppressed by the materiality check — a rerun with unchanged
 *       data produces no new history rows (the materiality key excludes {@code computedAt}).</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(prefix = "app.quality-backfill", name = "enabled",
        havingValue = "true", matchIfMissing = false)
public class QualityBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(QualityBackfillRunner.class);

    /** UUID string sentinel for "start from beginning" keyset page. */
    private static final String KEYSET_START = "00000000-0000-0000-0000-000000000000";

    private static final int DEFAULT_BATCH_SIZE = 500;

    private final ListingRepository listingRepository;
    private final QualityRecomputeExecutor executor;

    public QualityBackfillRunner(ListingRepository listingRepository,
                                 QualityRecomputeExecutor executor) {
        this.listingRepository = listingRepository;
        this.executor = executor;
    }

    @Override
    public void run(ApplicationArguments args) {
        BackfillResult result = runBackfill(DEFAULT_BATCH_SIZE);
        log.info("Quality backfill complete — processed={} scored={} insufficient={} skipped={} failed={} durationMs={}",
                result.processed(), result.scored(), result.insufficient(),
                result.skipped(), result.failed(), result.durationMs());
    }

    /**
     * Executes the backfill and returns a summary result. Exposed for testing.
     *
     * @param batchSize number of listings to process per DB page
     * @return summary counts and duration
     */
    public BackfillResult runBackfill(int batchSize) {
        Instant start = Instant.now();
        log.info("Quality backfill starting batchSize={}", batchSize);

        int processed = 0;
        int scored = 0;
        int insufficient = 0;
        int skipped = 0;
        int failed = 0;

        String lastId = KEYSET_START;

        while (true) {
            List<UUID> ids = listingRepository.findLiveListingIdsAfter(lastId, batchSize);
            if (ids.isEmpty()) {
                break;
            }

            for (UUID id : ids) {
                try {
                    QualityRecomputeService.RecomputeOutcome outcome = executor.recompute(id);
                    processed++;
                    switch (outcome) {
                        case SCORED      -> scored++;
                        case INSUFFICIENT -> insufficient++;
                        case SKIPPED     -> skipped++;
                    }
                } catch (Exception e) {
                    failed++;
                    log.warn("Quality backfill: recompute failed for listingId={} — skipping: {}",
                            id, e.getMessage(), e);
                }
            }

            lastId = ids.get(ids.size() - 1).toString();
            log.debug("Quality backfill batch complete lastId={} processed={} failed={}", lastId, processed, failed);

            if (ids.size() < batchSize) {
                break; // last page
            }
        }

        long durationMs = Duration.between(start, Instant.now()).toMillis();
        return new BackfillResult(processed, scored, insufficient, skipped, failed, durationMs);
    }

    /**
     * Summary result of a backfill run.
     *
     * @param processed    total rows attempted (success + failure)
     * @param scored       rows where a real score was stored (not null/insufficient)
     * @param insufficient rows where result was null/insufficient_data
     * @param skipped      rows skipped (listing not found mid-batch)
     * @param failed       rows that threw an exception (logged + continued)
     * @param durationMs   wall-clock time of the run
     */
    public record BackfillResult(
            int processed,
            int scored,
            int insufficient,
            int skipped,
            int failed,
            long durationMs
    ) {}
}
