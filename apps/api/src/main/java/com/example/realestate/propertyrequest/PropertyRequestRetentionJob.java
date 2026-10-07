package com.example.realestate.propertyrequest;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Scheduled retention purge for the {@code property_requests} table (#2792).
 *
 * <p>Hard-deletes rows whose {@code retain_until} is strictly before now (UTC), in bounded
 * batches of {@link #DELETE_BATCH_SIZE}. The retention period is deliberately NOT a constant
 * in Java: it is the V146 {@code retain_until} column default ({@code now() + 12 months}),
 * the single source of truth that the UI consent copy and backend already describe.
 *
 * <p>Runs daily at 03:00 UTC. Deliberately has NO {@code @ConditionalOnProperty}: it must run
 * even when {@code app.property-requests.enabled=false}, so rows captured while the feature
 * was on still expire.
 *
 * <p>Idempotent and correct under concurrent runs (no error, no double count): the predicate is
 * a pure function of stored data and the DELETE is set-based, so a deleted row cannot match
 * again. An overlapping run may stop early and leave rows for the next day; no data is lost.
 *
 * <p>PII: rows are never loaded. Logs and metrics carry counts and the cutoff only.
 */
@Component
public class PropertyRequestRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(PropertyRequestRetentionJob.class);

    /** Maximum rows deleted per SQL statement (one transaction each). */
    static final int DELETE_BATCH_SIZE = 500;

    /** Counter of rows purged across all batches; no tags. Emitted on every run, including zero-row runs. */
    public static final String METRIC_ROWS_PURGED = "property_requests.retention.rows_purged";

    private final PropertyRequestRepository repository;
    private final Counter rowsPurgedCounter;

    public PropertyRequestRetentionJob(PropertyRequestRepository repository,
                                       MeterRegistry meterRegistry) {
        this.repository = repository;
        this.rowsPurgedCounter = Counter.builder(METRIC_ROWS_PURGED)
                .description("Total property_requests rows purged by the retention job")
                .register(meterRegistry);
    }

    /**
     * NOT {@code @Transactional}: each repository batch commits independently so row locks
     * stay bounded to one batch.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    public void purgeExpiredRequests() {
        purgeExpiredBefore(OffsetDateTime.now(ZoneOffset.UTC));
    }

    /** Package-private so tests can pin an exact cutoff. Returns total rows deleted. */
    int purgeExpiredBefore(OffsetDateTime cutoff) {
        log.info("property_requests retention purge starting cutoff={}", cutoff);

        int totalDeleted = 0;
        int batch;
        do {
            batch = repository.deleteBatchExpired(cutoff, DELETE_BATCH_SIZE);
            totalDeleted += batch;
        } while (batch == DELETE_BATCH_SIZE);

        rowsPurgedCounter.increment(totalDeleted);
        log.info("property_requests retention purge completed totalDeleted={} cutoff={}", totalDeleted, cutoff);
        return totalDeleted;
    }
}
