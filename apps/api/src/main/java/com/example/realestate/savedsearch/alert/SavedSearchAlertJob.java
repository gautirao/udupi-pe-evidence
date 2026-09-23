package com.example.realestate.savedsearch.alert;

import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

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
 *   <li>{@code pg_try_advisory_xact_lock(2019, 0)} for the claim phase (namespace distinct from the
 *       city-launch lock 2163). A second scheduler instance/overlapping tick returns immediately;</li>
 *   <li>per-search watermark compare-and-set inside {@link SavedSearchAlertBookkeeper#record}, so
 *       even without the lock no listing is delivered twice.</li>
 * </ul>
 *
 * <p>#2482 — a run is two phases, and the boundary between them is a transaction commit:
 * <ol>
 *   <li><b>claim</b> (inside {@link #claimTransaction}): take the advisory lock, find due searches,
 *       match and commit bookkeeping. Database only, no network peer;</li>
 *   <li><b>send</b> (after that transaction commits): the blocking outbound email HTTP.</li>
 * </ol>
 * Because the lock is an {@code xact} lock, committing phase 1 releases it — so a slow or hanging
 * email provider pins no connection and blocks no subsequent tick. The second layer above is what
 * keeps this safe: once the claim commits, the watermark has already advanced, so an overlapping
 * run that acquires the freed lock finds nothing new to deliver, and the
 * {@code saved_search_alert_deliveries} PK remains the backstop.
 *
 * <p>The transaction is managed programmatically rather than with {@code @Transactional} so the
 * boundary is explicit and, unlike a proxy-based annotation, holds on the self-invoked
 * {@link #run()} -> {@link #runNow} path too.
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
    private final TransactionTemplate claimTransaction;

    public SavedSearchAlertJob(
            SavedSearchRepository savedSearchRepository,
            SavedSearchAlertDeliveryService deliveryService,
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager) {
        this.savedSearchRepository = savedSearchRepository;
        this.deliveryService = deliveryService;
        this.jdbcTemplate = jdbcTemplate;
        this.claimTransaction = new TransactionTemplate(transactionManager);
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

    /** What the claim phase hands the send phase: the counters, and the emails still to go out. */
    private record Claimed(RunSummary summary, List<SavedSearchAlertDeliveryService.PendingEmail> pending) {
        static final Claimed SKIPPED_LOCKED = new Claimed(RunSummary.SKIPPED_LOCKED, List.of());
    }

    public RunSummary runNow(OffsetDateTime now) {
        Claimed claimed = Objects.requireNonNullElse(
                claimTransaction.execute(status -> claimDue(now)), Claimed.SKIPPED_LOCKED);
        // The claim transaction has now COMMITTED, which releases pg_try_advisory_xact_lock. Every
        // send below therefore runs with no transaction open and no advisory lock held (#2482).
        for (SavedSearchAlertDeliveryService.PendingEmail pending : claimed.pending()) {
            try {
                deliveryService.deliver(pending, now);
            } catch (RuntimeException e) {
                // deliver() records transport failure as EmailStatus.FAILED itself and does not
                // throw; this is a backstop so one unexpected send failure cannot abandon the
                // remaining sends of an already-committed batch.
                log.error("Saved-search alert send failed savedSearchId={} batchId={}",
                        pending.savedSearchId(), pending.batchId(), e);
            }
        }
        return claimed.summary();
    }

    /**
     * Phase 1, inside {@link #claimTransaction}: take the advisory lock and commit each due
     * search's bookkeeping. Performs no outbound I/O, so nothing here can block on a network peer
     * while the lock is held.
     *
     * <p>{@code delivered} counts searches whose bookkeeping committed — unchanged from when the
     * email was inline, because a batch has always counted as delivered regardless of the email's
     * outcome (the in-app notification is the guaranteed channel).
     */
    private Claimed claimDue(OffsetDateTime now) {
        Boolean locked = jdbcTemplate.queryForObject(
                "SELECT pg_try_advisory_xact_lock(?, 0)", Boolean.class, ADVISORY_LOCK_NAMESPACE);
        if (!Boolean.TRUE.equals(locked)) {
            log.info("SavedSearchAlertJob: another run holds the advisory lock; skipping");
            return Claimed.SKIPPED_LOCKED;
        }

        List<SavedSearch> due = savedSearchRepository.findDueForAlertEvaluation(now);
        List<SavedSearchAlertDeliveryService.PendingEmail> pending = new ArrayList<>();
        int delivered = 0;
        int failed = 0;
        for (SavedSearch s : due) {
            try {
                SavedSearchAlertDeliveryService.Claim claim = deliveryService.evaluate(s, now);
                if (claim.outcome().delivered()) {
                    delivered++;
                }
                claim.pendingEmail().ifPresent(pending::add);
            } catch (RuntimeException e) {
                // Already logged + marked ERROR by the delivery service; isolate per search.
                failed++;
            }
        }
        return new Claimed(new RunSummary(true, due.size(), delivered, failed), pending);
    }
}
