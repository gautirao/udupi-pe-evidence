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

    public Outcome evaluateAndDeliver(SavedSearch savedSearch, OffsetDateTime now) {
        if (savedSearch.getStatus() != SavedSearchStatus.ACTIVE
                || savedSearch.getAlertFrequency() == AlertFrequency.OFF) {
            return Outcome.SKIPPED;
        }
        OffsetDateTime expectedWatermark = savedSearch.getAlertWatermark();
        UUID expectedWatermarkListingId = savedSearch.getAlertWatermarkListingId();
        OffsetDateTime cursorAt = expectedWatermark != null ? expectedWatermark : savedSearch.getCreatedAt();

        List<SavedSearchAlertMatcher.Match> matches;
        Optional<SavedSearchAlertBookkeeper.Batch> batch;
        try {
            matches = matcher.findNewMatches(savedSearch, cursorAt, expectedWatermarkListingId, maxMatchesPerRun);
            if (matches.isEmpty()) {
                return new Outcome(0, false, Optional.empty());
            }
            batch = bookkeeper.record(savedSearch, expectedWatermark, expectedWatermarkListingId, matches, now);
        } catch (RuntimeException e) {
            log.error("Saved-search alert evaluation failed savedSearchId={}", savedSearch.getId(), e);
            bookkeeper.markError(savedSearch.getId());
            throw e;
        }
        if (batch.isEmpty()) {
            return new Outcome(matches.size(), false, Optional.empty());
        }

        sendEmail(savedSearch, batch.get(), now);
        return new Outcome(matches.size(), true, batch);
    }

    private void sendEmail(SavedSearch s, SavedSearchAlertBookkeeper.Batch batch, OffsetDateTime now) {
        // #2481: re-check consent with a fresh scalar DB read at the last safe point, immediately
        // before the outbound send. `s.isEmailAlertsEnabled()` is the in-memory field of an entity
        // loaded (possibly minutes) earlier in this run; findById would return the same stale,
        // managed instance from the L1 cache, so this deliberately uses a projection query instead.
        // Fail closed on every branch: false -> opted out (unchanged), empty -> skipped (row gone,
        // never misreported as an opt-out), thrown -> failed and logged, never silently swallowed
        // and never allowed to escape uncaught (this method runs outside evaluateAndDeliver's
        // try/catch, so an uncaught exception here would count toward the job's failed++ and leave
        // the batch stuck PENDING).
        Optional<Boolean> currentEmailAlertsEnabled;
        try {
            currentEmailAlertsEnabled = savedSearchRepository.findEmailAlertsEnabledById(s.getId());
        } catch (RuntimeException e) {
            log.error("Saved-search alert consent check failed savedSearchId={} batchId={}",
                    s.getId(), batch.batchId(), e);
            bookkeeper.markEmail(batch.batchId(), SavedSearchAlertBookkeeper.EmailStatus.FAILED, now);
            return;
        }
        if (currentEmailAlertsEnabled.isEmpty()) {
            bookkeeper.markEmail(batch.batchId(), SavedSearchAlertBookkeeper.EmailStatus.SKIPPED, now);
            log.info("Saved-search alert email skipped (saved search no longer exists) savedSearchId={} batchId={}",
                    s.getId(), batch.batchId());
            return;
        }
        boolean emailAlertsEnabled = currentEmailAlertsEnabled.get();
        // Consent gate BEFORE any send: the per-subscription email opt-out (mirrors the
        // user_saved_areas.alerts_enabled precedent — no user-level email preference exists in
        // this app). Bookkeeping + in-app notification are already committed regardless.
        if (!emailAlertsEnabled) {
            bookkeeper.markEmail(batch.batchId(), SavedSearchAlertBookkeeper.EmailStatus.OPTED_OUT, now);
            log.info("Saved-search alert email not sent (owner opted out) savedSearchId={} batchId={}",
                    s.getId(), batch.batchId());
            return;
        }
        List<String> emails = savedAreaRepository.findEmailsByUserIds(List.of(s.getUserId()));
        if (emails.isEmpty()) {
            bookkeeper.markEmail(batch.batchId(), SavedSearchAlertBookkeeper.EmailStatus.SKIPPED, now);
            log.info("Saved-search alert email skipped (no email on file) savedSearchId={} batchId={}",
                    s.getId(), batch.batchId());
            return;
        }
        try {
            emailService.sendSavedSearchAlert(
                    emails.get(0),
                    s.getLabel(),
                    SavedSearchSummary.scopeSummary(s),
                    SavedSearchSummary.filtersSummary(s),
                    batch.matchCount(),
                    SavedSearchRestoreLink.restoreUrl(publicBaseUrl, s),
                    SavedSearchRestoreLink.manageUrl(publicBaseUrl));
            bookkeeper.markEmail(batch.batchId(), SavedSearchAlertBookkeeper.EmailStatus.SENT, now);
        } catch (Exception e) {
            // Never log the address (PII); the batch id is the support handle.
            log.error("Saved-search alert email failed savedSearchId={} batchId={}", s.getId(), batch.batchId(), e);
            bookkeeper.markEmail(batch.batchId(), SavedSearchAlertBookkeeper.EmailStatus.FAILED, now);
        }
    }
}
