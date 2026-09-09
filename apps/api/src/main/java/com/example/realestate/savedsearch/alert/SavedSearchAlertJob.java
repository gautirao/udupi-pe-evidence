package com.example.realestate.savedsearch.alert;

import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * #2019 Slice B: hourly scheduled entry point for saved-search alert evaluation.
 *
 * <p>Conventions mirrored from {@code AreaDemandSignalRollupJob}: {@code @Component} +
 * {@code @Scheduled(cron, zone = "UTC")}, {@code @EnableScheduling} already on the application
 * class, {@code spring.task.scheduling.enabled=false} suppresses it in tests via
 * {@code SchedulingSuppressionConfig}, and the core is invokable directly ({@link #runNow}).
 *
 * <p>Idempotent under overlapping runs, two layers deep:
 * <ul>
 *   <li>{@code pg_try_advisory_xact_lock(2019, 0)} for the whole run (namespace distinct from the
 *       city-launch lock 2163). A second scheduler instance/overlapping tick returns immediately;</li>
 *   <li>per-search watermark compare-and-set inside {@link SavedSearchAlertBookkeeper#record}, so
 *       even without the lock no listing is delivered twice.</li>
 * </ul>
 *
 * <p>Frequency: a search is due when {@code last_alerted_at} is NULL or older than its
 * {@code alert_frequency} interval minus a 30-minute tolerance for scheduler jitter
 * (DAILY = 24h, WEEKLY = 7d, INSTANT = every run, i.e. within ~1h; OFF = never). Owner decision,
 * reversible.
 */
@Component
public class SavedSearchAlertJob {

    private static final Logger log = LoggerFactory.getLogger(SavedSearchAlertJob.class);

    /** Advisory-lock namespace; no other code takes (2019, *) (searched before choosing). */
    static final int ADVISORY_LOCK_NAMESPACE = 2019;

    private final SavedSearchRepository savedSearchRepository;
    private final SavedSearchAlertDeliveryService deliveryService;
    private final JdbcTemplate jdbcTemplate;

    public SavedSearchAlertJob(
            SavedSearchRepository savedSearchRepository,
            SavedSearchAlertDeliveryService deliveryService,
            JdbcTemplate jdbcTemplate) {
        this.savedSearchRepository = savedSearchRepository;
        this.deliveryService = deliveryService;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Result of one run, for logging/tests. */
    public record RunSummary(boolean lockAcquired, int evaluated, int delivered, int failed) {
        static final RunSummary SKIPPED_LOCKED = new RunSummary(false, 0, 0, 0);
    }

    /** Hourly at :17 UTC (off the :00 mark shared by the rollup jobs). */
    @Scheduled(cron = "0 17 * * * *", zone = "UTC")
    public void run() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        log.info("SavedSearchAlertJob: starting run now={}", now);
        RunSummary summary = runNow(now);
        log.info("SavedSearchAlertJob: completed run lockAcquired={} evaluated={} delivered={} failed={}",
                summary.lockAcquired(), summary.evaluated(), summary.delivered(), summary.failed());
    }

    /**
     * The outer transaction exists to scope the advisory xact lock; every search's bookkeeping
     * commits in its own {@code REQUIRES_NEW} transaction inside it.
     */
    @Transactional
    public RunSummary runNow(OffsetDateTime now) {
        Boolean locked = jdbcTemplate.queryForObject(
                "SELECT pg_try_advisory_xact_lock(?, 0)", Boolean.class, ADVISORY_LOCK_NAMESPACE);
        if (!Boolean.TRUE.equals(locked)) {
            log.info("SavedSearchAlertJob: another run holds the advisory lock; skipping");
            return RunSummary.SKIPPED_LOCKED;
        }

        List<SavedSearch> due = savedSearchRepository.findDueForAlertEvaluation(now);
        int delivered = 0;
        int failed = 0;
        for (SavedSearch s : due) {
            try {
                if (deliveryService.evaluateAndDeliver(s, now).delivered()) {
                    delivered++;
                }
            } catch (RuntimeException e) {
                // Already logged + marked ERROR by the delivery service; isolate per search.
                failed++;
            }
        }
        return new RunSummary(true, due.size(), delivered, failed);
    }
}
