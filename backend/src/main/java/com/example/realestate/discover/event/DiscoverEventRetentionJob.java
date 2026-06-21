package com.example.realestate.discover.event;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Scheduled retention purge for the {@code discover_event} table.
 *
 * <p>Deletes rows older than 180 days (UTC) in bounded batches to avoid
 * long table locks on large tables. Each iteration deletes at most
 * {@link #DELETE_BATCH_SIZE} rows; the loop continues until a batch
 * returns 0 (no more eligible rows for this run).
 *
 * <p>Runs daily at 03:00 UTC. Idempotent: re-running the job with the
 * same cutoff deletes 0 rows after the first successful run.
 *
 * <p>Emits a Micrometer counter on every run including zero-row runs.
 * Metric tags are LOW-CARDINALITY (no session_id, no per-event data).
 *
 * <p>{@code @EnableScheduling} is already present on
 * {@link com.example.realestate.RealEstateApplication}; no duplicate needed.
 */
@Component
public class DiscoverEventRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(DiscoverEventRetentionJob.class);

    /** Retention window in days. */
    static final int RETENTION_DAYS = 180;

    /**
     * Maximum rows deleted per SQL statement. Chosen to keep each DELETE
     * under ~50 ms on a standard Postgres instance (assume ~200 µs/row).
     * The loop repeats until 0 rows remain past the cutoff.
     */
    static final int DELETE_BATCH_SIZE = 500;

    /**
     * Metric name. Type: counter. Tags: (none beyond defaults).
     * Reports total rows purged across all batches in a single job run.
     * Emitted even when 0 rows are deleted (so absence of the counter
     * in Prometheus signals the job itself did not run).
     */
    public static final String METRIC_ROWS_PURGED = "discover_event.retention.rows_purged";

    private final DiscoverEventRepository repository;
    private final Counter rowsPurgedCounter;

    public DiscoverEventRetentionJob(DiscoverEventRepository repository,
                                     MeterRegistry meterRegistry) {
        this.repository = repository;
        // Counter registered once at construction. Tags are deliberately empty —
        // no session_id, no per-event cardinality.
        this.rowsPurgedCounter = Counter.builder(METRIC_ROWS_PURGED)
                .description("Total discover_event rows purged by the 180-day retention job")
                .register(meterRegistry);
    }

    /**
     * Runs daily at 03:00 UTC.
     *
     * <p>Each call computes a fresh UTC cutoff (now - 180 days) so the job
     * is unambiguously UTC-consistent regardless of the JVM timezone.
     *
     * <p>NOT annotated with {@code @Transactional}: each batch call on the
     * repository commits independently so row locks are bounded to one batch
     * at a time. Wrapping the whole do/while loop in a single transaction
     * would hold row locks for the entire purge run — negating the bounded-lock
     * guarantee that is the point of batching.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    public void purgeExpiredEvents() {
        OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minusDays(RETENTION_DAYS);
        log.info("discover_event retention purge starting cutoff={}", cutoff);

        int totalDeleted = 0;
        int batch;

        do {
            batch = repository.deleteBatchOlderThan(cutoff, DELETE_BATCH_SIZE);
            totalDeleted += batch;
        } while (batch == DELETE_BATCH_SIZE);
        // Loop exits when the last batch was smaller than the limit — no more eligible rows.

        // Emit metric on every run, including zero-row runs.
        rowsPurgedCounter.increment(totalDeleted);
        log.info("discover_event retention purge completed totalDeleted={} cutoff={}", totalDeleted, cutoff);
    }
}
