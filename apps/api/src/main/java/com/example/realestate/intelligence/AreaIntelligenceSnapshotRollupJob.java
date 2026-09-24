package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled job that drives {@link AreaIntelligenceSnapshotService#buildSnapshots()} so that
 * {@code area_intelligence_snapshot} is kept fresh for every product-reachable area.
 *
 * <p>Prior to this job, {@code area_intelligence_snapshot} (introduced by V94, see #1526) had no
 * scheduler or trigger caller at all — the table only ever contained the handful of rows written
 * during manual/ad-hoc verification. As a result, {@link BuyerAreaIntelligenceService} fell back
 * to {@code buildUnavailableResponse()} ("Not enough data") for almost every area, including areas
 * with plenty of live inventory, simply because no snapshot row existed yet (see #2581).
 *
 * <p>Runs daily at 02:30 UTC, matching the {@code AreaOverviewRollupJob} cadence for the
 * area-analytics rollup family.
 *
 * <p>{@code @EnableScheduling} is already present on
 * {@link com.example.realestate.RealEstateApplication}; no duplicate annotation needed.
 *
 * <p>The core compute is invokable directly (via {@link #run()}) so tests and operational
 * backfills can drive the full pipeline without waiting on the scheduler.
 */
@Component
public class AreaIntelligenceSnapshotRollupJob {

    private static final Logger log = LoggerFactory.getLogger(AreaIntelligenceSnapshotRollupJob.class);

    private final AreaIntelligenceSnapshotService snapshotService;

    public AreaIntelligenceSnapshotRollupJob(AreaIntelligenceSnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    /**
     * Daily at 02:30 UTC.
     *
     * <p>{@code zone = "UTC"} is required so the trigger time is independent of the host JVM's
     * default timezone.
     */
    @Scheduled(cron = "0 30 2 * * *", zone = "UTC")
    public void runScheduled() {
        run();
    }

    /**
     * Executes the snapshot rollup.
     * Exposed public so integration tests (and operational backfills) can invoke it directly.
     * Transaction boundary is owned by {@link AreaIntelligenceSnapshotService#buildSnapshots()}.
     */
    public void run() {
        log.info("AreaIntelligenceSnapshotRollupJob: starting snapshot rollup");
        int rows = snapshotService.buildSnapshots();
        log.info("AreaIntelligenceSnapshotRollupJob: completed snapshot rollup rows={}", rows);
    }
}
