package com.example.realestate.discover;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Drains {@code area_region_reclass_outbox} on a fixed delay, calling
 * {@link CityRegionOnboardingService#apply(int)} for each pending event (#1887 PR3). This is the
 * CONSUMER half of the enqueue-only {@link AreaRegionReclassOutbox} written in PR2 — apply() is
 * NEVER called synchronously from any listing-write or area-apply transaction; only this
 * scheduled poller calls it.
 *
 * <p>Only instantiated when {@code area.region-reclass.enabled=true}. This is a DISTINCT
 * property/table namespace from the search indexer: it never reads/writes
 * {@code listing_search_outbox} and never reuses {@code search.indexer.enabled}.
 *
 * <p><b>Concurrency invariant (LOAD-BEARING, mirrors {@code SearchOutboxPoller}):</b> this poller
 * is correct only when a single instance is active at a time. Safety is provided by
 * {@code @Scheduled(fixedDelay)} with the default single-threaded scheduler and a single
 * application instance — there is deliberately NO {@code FOR UPDATE SKIP LOCKED} or distributed
 * lock. If the scheduler thread-pool size is increased, or this application is deployed to
 * multiple instances, a distributed lock (e.g. {@code SELECT ... FOR UPDATE SKIP LOCKED} or
 * ShedLock) MUST be introduced before enabling that change.
 *
 * <p><b>Error handling:</b>
 * <ul>
 *   <li>{@link RegionOnboardingBlockedException} (e.g. MISSING_POLICY, MISSING_CLASSIFICATIONS) —
 *       a legitimate, self-healing precondition gap. The event is re-armed with exponential
 *       backoff (capped at {@code maxBackoffSeconds}) and NEVER marked DEAD — once the missing
 *       precondition is fixed (e.g. a policy is assigned), the next poll cycle succeeds.</li>
 *   <li>Any other exception — an unexpected failure. Retried up to {@code maxRetryAttempts}, then
 *       marked DEAD (terminal, never re-polled).</li>
 * </ul>
 * One event's failure never aborts the batch (poison-event isolation) — each entry is processed
 * in its own try/catch.
 */
@Component
@EnableConfigurationProperties(AreaRegionReclassProperties.class)
@ConditionalOnProperty(name = "area.region-reclass.enabled", havingValue = "true")
public class AreaRegionReclassOutboxPoller {

    private static final Logger log = LoggerFactory.getLogger(AreaRegionReclassOutboxPoller.class);

    private static final String STATUS_PUBLISHED = "PUBLISHED";
    private static final String STATUS_DEAD = "DEAD";
    private static final int ERROR_MESSAGE_MAX_LENGTH = 1000;

    private final JdbcOperations jdbcOperations;
    private final CityRegionOnboardingService cityRegionOnboardingService;
    private final AreaRegionReclassProperties props;
    private final Counter blockedCounter;
    private final Counter retryCounter;
    private final Counter deadCounter;

    public AreaRegionReclassOutboxPoller(
            JdbcOperations jdbcOperations,
            CityRegionOnboardingService cityRegionOnboardingService,
            AreaRegionReclassProperties props,
            MeterRegistry meterRegistry) {
        this.jdbcOperations = jdbcOperations;
        this.cityRegionOnboardingService = cityRegionOnboardingService;
        this.props = props;
        this.blockedCounter = Counter.builder("area.region_reclass.blocked")
                .description("Region-reclass outbox events re-armed after a RegionOnboardingBlockedException "
                        + "(e.g. missing policy/classifications) — never marked DEAD.")
                .register(meterRegistry);
        this.retryCounter = Counter.builder("area.region_reclass.retry")
                .description("Region-reclass outbox events re-armed after an unexpected processing failure.")
                .register(meterRegistry);
        this.deadCounter = Counter.builder("area.region_reclass.dead")
                .description("Region-reclass outbox events that exhausted max retry attempts and became DEAD.")
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${area.region-reclass.poll-interval-seconds:30}000")
    public void pollAndPublish() {
        Instant now = Instant.now();
        Instant maxOccurredAt = now.minusSeconds(props.getMinEventAgeSeconds());

        List<PendingEvent> batch = jdbcOperations.query(
                SELECT_PENDING_SQL,
                (rs, rowNum) -> new PendingEvent(
                        rs.getLong("id"), rs.getInt("city_id"), rs.getInt("retry_count")),
                ts(now), ts(maxOccurredAt), props.getBatchSize());

        if (batch.isEmpty()) {
            return;
        }

        log.debug("AreaRegionReclassOutboxPoller: processing batch of {} events", batch.size());

        for (PendingEvent event : batch) {
            try {
                cityRegionOnboardingService.apply(event.cityId());
                jdbcOperations.update(MARK_PUBLISHED_SQL, ts(Instant.now()), STATUS_PUBLISHED, event.id());
            } catch (RegionOnboardingBlockedException e) {
                handleBlocked(event, e, now);
            } catch (Exception e) {
                handleUnexpectedFailure(event, e, now);
            }
        }

        log.info("AreaRegionReclassOutboxPoller: processed {} events", batch.size());
    }

    /**
     * A blocked-precondition failure is self-healing, never terminal: re-arm with exponential
     * backoff (capped) and leave {@code status} untouched (NOT DEAD).
     */
    private void handleBlocked(PendingEvent event, RegionOnboardingBlockedException e, Instant failureTime) {
        int newRetryCount = event.retryCount() + 1;
        long delaySeconds = cappedBackoffSeconds(newRetryCount);
        Instant nextAttemptAt = failureTime.plusSeconds(delaySeconds);

        jdbcOperations.update(RE_ARM_SQL,
                newRetryCount, ts(nextAttemptAt), truncate(e.getMessage(), ERROR_MESSAGE_MAX_LENGTH), ts(failureTime),
                event.id());
        blockedCounter.increment();
        log.warn("AreaRegionReclassOutboxPoller: eventId={} cityId={} blocked (reason={}) — retry {}/unbounded "
                        + "at {}: {}",
                event.id(), event.cityId(), e.reason(), newRetryCount, nextAttemptAt, e.getMessage());
    }

    /**
     * An unexpected failure counts toward {@code maxRetryAttempts}; once exhausted the event is
     * marked DEAD (terminal, never re-polled).
     */
    private void handleUnexpectedFailure(PendingEvent event, Exception e, Instant failureTime) {
        int newRetryCount = event.retryCount() + 1;
        String truncatedMessage = truncate(e.getMessage(), ERROR_MESSAGE_MAX_LENGTH);

        if (newRetryCount >= props.getMaxRetryAttempts()) {
            jdbcOperations.update(MARK_DEAD_SQL, newRetryCount, truncatedMessage, ts(failureTime), event.id());
            deadCounter.increment();
            log.warn("AreaRegionReclassOutboxPoller: eventId={} cityId={} exhausted {} attempts — marked DEAD: {}",
                    event.id(), event.cityId(), props.getMaxRetryAttempts(), e.getMessage(), e);
        } else {
            long delaySeconds = cappedBackoffSeconds(newRetryCount);
            Instant nextAttemptAt = failureTime.plusSeconds(delaySeconds);
            jdbcOperations.update(RE_ARM_SQL, newRetryCount, ts(nextAttemptAt), truncatedMessage, ts(failureTime), event.id());
            retryCounter.increment();
            log.warn("AreaRegionReclassOutboxPoller: eventId={} cityId={} attempt {}/{} failed — retry at {}: {}",
                    event.id(), event.cityId(), newRetryCount, props.getMaxRetryAttempts(), nextAttemptAt,
                    e.getMessage(), e);
        }
    }

    /** Exponential backoff: retryDelaySeconds * 2^(retryCount - 1), capped at maxBackoffSeconds. */
    private long cappedBackoffSeconds(int retryCount) {
        long exponent = Math.max(0, retryCount - 1);
        long uncapped;
        try {
            uncapped = Math.multiplyExact(props.getRetryDelaySeconds(), 1L << Math.min(exponent, 32));
        } catch (ArithmeticException overflow) {
            uncapped = props.getMaxBackoffSeconds();
        }
        return Math.min(uncapped, props.getMaxBackoffSeconds());
    }

    /**
     * Converts an {@link Instant} to {@link Timestamp} before binding via {@link JdbcOperations}.
     * The raw JDBC driver used here cannot infer a SQL type for {@code java.time.Instant} directly
     * (unlike Spring Data JPA/Hibernate-backed repositories such as {@code SearchOutboxPoller}'s,
     * which handle {@code Instant} natively) — {@link Timestamp} binds unambiguously via
     * {@code PreparedStatement.setTimestamp}.
     */
    private static Timestamp ts(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static String truncate(String message, int maxLength) {
        if (message == null) {
            return null;
        }
        return message.length() <= maxLength ? message : message.substring(0, maxLength);
    }

    private record PendingEvent(long id, int cityId, int retryCount) {}

    private static final String SELECT_PENDING_SQL = """
            SELECT id, city_id, retry_count
            FROM area_region_reclass_outbox
            WHERE published_at IS NULL
              AND (status IS NULL OR status NOT IN ('DEAD', 'FAILED'))
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
              AND occurred_at <= ?
            ORDER BY id
            LIMIT ?
            """;

    private static final String MARK_PUBLISHED_SQL = """
            UPDATE area_region_reclass_outbox
            SET published_at = ?, status = ?, next_attempt_at = NULL
            WHERE id = ?
            """;

    private static final String RE_ARM_SQL = """
            UPDATE area_region_reclass_outbox
            SET retry_count = ?, next_attempt_at = ?, error_message = ?, failed_at = ?
            WHERE id = ?
            """;

    private static final String MARK_DEAD_SQL = """
            UPDATE area_region_reclass_outbox
            SET status = 'DEAD', retry_count = ?, error_message = ?, failed_at = ?, next_attempt_at = NULL
            WHERE id = ?
            """;
}
