package com.example.realestate.savedsearch.alert;

import com.example.realestate.insights.SavedAreaRepository;
import com.example.realestate.notification.EmailService;
import com.example.realestate.savedsearch.AlertFrequency;
import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchRepository;
import com.example.realestate.savedsearch.SavedSearchStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * #2019 Slice B: evaluates ONE saved search and delivers its new matches.
 *
 * <p>Sequence (deliberately NOT transactional at this level — the transactional unit is
 * {@link SavedSearchAlertBookkeeper#record}, and the email must only ever run after that commit):
 * <ol>
 *   <li>skip unless {@code status == ACTIVE} and {@code alertFrequency != OFF} (paused/deleted
 *       searches are never evaluated; OFF keeps a search browsable without alerting);</li>
 *   <li>effective watermark = {@code alert_watermark}, or {@code created_at} for a search no run
 *       has advanced yet (owner decision: listings LIVE before the alert existed are never "new";
 *       Slice A resets the watermark to NULL on scope/filter edit, and the deliveries PK still
 *       stops anything previously delivered from reappearing);</li>
 *   <li>match via {@link SavedSearchAlertMatcher} (same predicate as the live query);</li>
 *   <li>commit bookkeeping (CAS watermark + batch + deliveries + in-app notification);</li>
 *   <li>then, and only then, email the owner. Transport failure is recorded on the batch and never
 *       retried or re-delivered here (the in-app notification is the guaranteed channel).</li>
 * </ol>
 *
 * <p>#2482 — that sequence is split across two <em>callable</em> phases so the caller can close its
 * transaction (and release the run's advisory lock) between them:
 * <ul>
 *   <li>{@link #evaluate} — steps 1-4. Database only; performs no outbound I/O and never blocks on
 *       a network peer. Safe to run inside the job's advisory-locked transaction;</li>
 *   <li>{@link #deliver} — step 5, the blocking HTTP send. <strong>Must be called with no
 *       transaction open and no advisory lock held.</strong> It takes a {@link PendingEmail}
 *       value, not the entity, so it cannot depend on a persistence context that has since closed.</li>
 * </ul>
 * {@link #evaluateAndDeliver} composes the two for single-search callers; the split changes
 * <em>when</em> the send happens relative to the caller's transaction, never what it does.
 */
@Service
public class SavedSearchAlertDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(SavedSearchAlertDeliveryService.class);

    /** Owner decision (reversible): max listings recorded per (search, run); overflow rolls to the next run. */
    static final int DEFAULT_MAX_MATCHES_PER_RUN = 200;

    private final SavedSearchAlertMatcher matcher;
    private final SavedSearchAlertBookkeeper bookkeeper;
    private final SavedAreaRepository savedAreaRepository;
    private final SavedSearchRepository savedSearchRepository;
    private final EmailService emailService;
    private final String publicBaseUrl;
    private final int maxMatchesPerRun;

    public SavedSearchAlertDeliveryService(
            SavedSearchAlertMatcher matcher,
            SavedSearchAlertBookkeeper bookkeeper,
            SavedAreaRepository savedAreaRepository,
            SavedSearchRepository savedSearchRepository,
            EmailService emailService,
            @Value("${app.saved-search-alerts.public-base-url:}") String publicBaseUrl,
            @Value("${app.saved-search-alerts.max-matches-per-run:" + DEFAULT_MAX_MATCHES_PER_RUN + "}") int maxMatchesPerRun) {
        this.matcher = matcher;
        this.bookkeeper = bookkeeper;
        this.savedAreaRepository = savedAreaRepository;
        this.savedSearchRepository = savedSearchRepository;
        this.emailService = emailService;
        this.publicBaseUrl = publicBaseUrl;
        this.maxMatchesPerRun = maxMatchesPerRun;
    }

    /** Outcome of one evaluation, for logging/tests. */
    public record Outcome(int matched, boolean delivered, Optional<SavedSearchAlertBookkeeper.Batch> batch) {
        static final Outcome SKIPPED = new Outcome(0, false, Optional.empty());
    }

    /**
     * #2482: everything {@link #deliver} needs, captured from the entity during {@link #evaluate}
     * while it is still in scope. Carrying values rather than the {@link SavedSearch} is what makes
     * the send safe to run after the caller's transaction (and persistence context) has closed.
     *
     * <p>Deliberately NOT carrying the email address: consent and the address are both re-read at
     * send time (#2481), so a snapshot taken here could not go stale into an unwanted send.
     */
    public record PendingEmail(
            UUID savedSearchId,
            UUID userId,
            UUID batchId,
            String label,
            String scopeSummary,
            String filtersSummary,
            int matchCount,
            String restoreUrl) {
    }

    /**
     * #2482: the result of the DB-only phase — the {@link Outcome} the caller reports, plus the
     * send (if any) it must perform once it has committed and released its lock.
     */
    public record Claim(Outcome outcome, Optional<PendingEmail> pendingEmail) {
        static Claim of(Outcome outcome) {
            return new Claim(outcome, Optional.empty());
        }
    }

    /**
     * Steps 1-4: match and commit bookkeeping. Database only — no outbound I/O, so this is safe to
     * call inside the job's advisory-locked transaction.
     *
     * <p>Failure semantics are unchanged: a matcher/bookkeeping failure marks {@code alert_status
     * = ERROR} and rethrows, so the caller can isolate it per search.
     */
    public Claim evaluate(SavedSearch savedSearch, OffsetDateTime now) {
        if (savedSearch.getStatus() != SavedSearchStatus.ACTIVE
                || savedSearch.getAlertFrequency() == AlertFrequency.OFF) {
            return Claim.of(Outcome.SKIPPED);
        }
        OffsetDateTime expectedWatermark = savedSearch.getAlertWatermark();
        UUID expectedWatermarkListingId = savedSearch.getAlertWatermarkListingId();
        OffsetDateTime cursorAt = expectedWatermark != null ? expectedWatermark : savedSearch.getCreatedAt();

        List<SavedSearchAlertMatcher.Match> matches;
        Optional<SavedSearchAlertBookkeeper.Batch> batch;
        try {
            matches = matcher.findNewMatches(savedSearch, cursorAt, expectedWatermarkListingId, maxMatchesPerRun);
            if (matches.isEmpty()) {
                return Claim.of(new Outcome(0, false, Optional.empty()));
            }
            batch = bookkeeper.record(savedSearch, expectedWatermark, expectedWatermarkListingId, matches, now);
        } catch (RuntimeException e) {
            log.error("Saved-search alert evaluation failed savedSearchId={}", savedSearch.getId(), e);
            bookkeeper.markError(savedSearch.getId());
            throw e;
        }
        if (batch.isEmpty()) {
            return Claim.of(new Outcome(matches.size(), false, Optional.empty()));
        }

        return new Claim(new Outcome(matches.size(), true, batch), Optional.of(pendingEmail(savedSearch, batch.get())));
    }

    /**
     * Composes both phases for single-search callers. The job uses {@link #evaluate} and
     * {@link #deliver} separately so it can commit and release its advisory lock in between
     * (#2482); callers that hold no lock can keep using this.
     */
    public Outcome evaluateAndDeliver(SavedSearch savedSearch, OffsetDateTime now) {
        Claim claim = evaluate(savedSearch, now);
        claim.pendingEmail().ifPresent(pending -> deliver(pending, now));
        return claim.outcome();
    }

    /** Snapshot taken while the entity is in scope, so the send never touches it. */
    private PendingEmail pendingEmail(SavedSearch s, SavedSearchAlertBookkeeper.Batch batch) {
        return new PendingEmail(
                s.getId(),
                s.getUserId(),
                batch.batchId(),
                s.getLabel(),
                SavedSearchSummary.scopeSummary(s),
                SavedSearchSummary.filtersSummary(s),
                batch.matchCount(),
                SavedSearchRestoreLink.restoreUrl(publicBaseUrl, s));
    }

    /**
     * Step 5: the blocking outbound send.
     *
     * <p>#2482 — the caller MUST have committed and released the run's advisory lock before calling
     * this. Every database touch below ({@code findEmailAlertsEnabledById}, the address lookup,
     * {@code markEmail}) opens and closes its own short transaction, so a hung email provider pins
     * no connection and blocks no other run.
     */
    public void deliver(PendingEmail pending, OffsetDateTime now) {
        UUID savedSearchId = pending.savedSearchId();
        UUID batchId = pending.batchId();
        // #2481: re-check consent with a fresh scalar DB read at the last safe point, immediately
        // before the outbound send. The entity this batch came from was read earlier in the run
        // (and, since #2482, in a transaction that has since committed and closed), so its
        // in-memory `emailAlertsEnabled` may be minutes stale; findById could still be served from
        // a Hibernate L1 cache, so this deliberately uses a projection query instead.
        // Fail closed on every branch: false -> opted out (unchanged), empty -> skipped (row gone,
        // never misreported as an opt-out), thrown -> failed and logged, never silently swallowed
        // and never allowed to escape uncaught (this method runs outside evaluate's try/catch, so
        // an uncaught exception here would count toward the job's failed++ and leave the batch
        // stuck PENDING).
        Optional<Boolean> currentEmailAlertsEnabled;
        try {
            currentEmailAlertsEnabled = savedSearchRepository.findEmailAlertsEnabledById(savedSearchId);
        } catch (RuntimeException e) {
            log.error("Saved-search alert consent check failed savedSearchId={} batchId={}",
                    savedSearchId, batchId, e);
            bookkeeper.markEmail(batchId, SavedSearchAlertBookkeeper.EmailStatus.FAILED, now);
            return;
        }
        if (currentEmailAlertsEnabled.isEmpty()) {
            bookkeeper.markEmail(batchId, SavedSearchAlertBookkeeper.EmailStatus.SKIPPED, now);
            log.info("Saved-search alert email skipped (saved search no longer exists) savedSearchId={} batchId={}",
                    savedSearchId, batchId);
            return;
        }
        boolean emailAlertsEnabled = currentEmailAlertsEnabled.get();
        // Consent gate BEFORE any send: the per-subscription email opt-out (mirrors the
        // user_saved_areas.alerts_enabled precedent — no user-level email preference exists in
        // this app). Bookkeeping + in-app notification are already committed regardless.
        if (!emailAlertsEnabled) {
            bookkeeper.markEmail(batchId, SavedSearchAlertBookkeeper.EmailStatus.OPTED_OUT, now);
            log.info("Saved-search alert email not sent (owner opted out) savedSearchId={} batchId={}",
                    savedSearchId, batchId);
            return;
        }
        List<String> emails = savedAreaRepository.findEmailsByUserIds(List.of(pending.userId()));
        if (emails.isEmpty()) {
            bookkeeper.markEmail(batchId, SavedSearchAlertBookkeeper.EmailStatus.SKIPPED, now);
            log.info("Saved-search alert email skipped (no email on file) savedSearchId={} batchId={}",
                    savedSearchId, batchId);
            return;
        }
        try {
            emailService.sendSavedSearchAlert(
                    emails.get(0),
                    pending.label(),
                    pending.scopeSummary(),
                    pending.filtersSummary(),
                    pending.matchCount(),
                    pending.restoreUrl(),
                    SavedSearchRestoreLink.manageUrl(publicBaseUrl));
            bookkeeper.markEmail(batchId, SavedSearchAlertBookkeeper.EmailStatus.SENT, now);
        } catch (Exception e) {
            // Never log the address (PII); the batch id is the support handle.
            log.error("Saved-search alert email failed savedSearchId={} batchId={}", savedSearchId, batchId, e);
            bookkeeper.markEmail(batchId, SavedSearchAlertBookkeeper.EmailStatus.FAILED, now);
        }
    }
}
