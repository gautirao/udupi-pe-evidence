package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Scheduled job that runs the area demand-signal rollup hourly (UTC).
 *
 * <p>Computes rolling 7d and 30d demand-vs-supply signal buckets via
 * {@link AreaDemandSignalService#runRollup}, then collapses the 30d buckets
 * into one {@code demand_score} per area and writes it back to
 * {@code area_intelligence_snapshot} via {@link AreaDemandSignalService#writeBackDemandScores}.
 *
 * <p>Runs hourly at the start of each UTC hour ({@code cron = "0 0 * * * *", zone = "UTC"}),
 * mirroring the {@code DiscoverEventRetentionJob} cron convention.
 *
 * <p>{@code @EnableScheduling} is already present on
 * {@link com.example.realestate.RealEstateApplication}; no duplicate annotation needed.
 *
 * <p>The core compute is invokable directly (via {@link #runNow(Instant)}) so tests
 * can drive the full pipeline without a scheduler.
 */
@Component
public class AreaDemandSignalRollupJob {

    private static final Logger log = LoggerFactory.getLogger(AreaDemandSignalRollupJob.class);

    /** Rolling window lengths to compute in each run (7d for short-term, 30d canonical). */
    static final int[] WINDOW_DAYS = {7, 30};

    /** The canonical window used for demand_score collapse (D9). */
    static final int CANONICAL_WINDOW_DAYS = 30;

    private final AreaDemandSignalService service;

    public AreaDemandSignalRollupJob(AreaDemandSignalService service) {
        this.service = service;
    }

    /**
     * Scheduled entry point — runs at the start of every UTC hour.
     *
     * <p>Computes a fresh UTC period_start anchor each invocation so the rollup is
     * deterministically UTC-consistent regardless of JVM timezone.
     */
    @Scheduled(cron = "0 0 * * * *", zone = "UTC")
    public void run() {
        Instant periodStart = AreaDemandSignalService.currentUtcHourAnchor();
        log.info("AreaDemandSignalRollupJob: starting hourly run periodStart={}", periodStart);
        runNow(periodStart);
        log.info("AreaDemandSignalRollupJob: completed hourly run periodStart={}", periodStart);
    }

    /**
     * Execute the full rollup pipeline for the given period_start anchor.
     *
     * <p>Called by {@link #run()} and directly invokable by tests.
     * Runs 7d and 30d windows, then writes demand_score back to the snapshot.
     *
     * @param periodStart UTC-hour-truncated anchor for this run
     */
    public void runNow(Instant periodStart) {
        for (int windowDays : WINDOW_DAYS) {
            int rows = service.runRollup(windowDays, periodStart);
            log.info("AreaDemandSignalRollupJob: windowDays={} rows={}", windowDays, rows);
        }
        // Collapse 30d non-suppressed buckets → one demand_score per area.
        service.writeBackDemandScores(periodStart);
    }
}
