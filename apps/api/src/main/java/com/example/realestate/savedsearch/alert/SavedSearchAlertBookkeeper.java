package com.example.realestate.savedsearch.alert;

import com.example.realestate.notification.NotificationRepository;
import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * #2019 Slice B: the transactional "delivery bookkeeping" unit for ONE saved search and ONE run.
 *
 * <p>{@code REQUIRES_NEW} (mirrors {@code SavedSearchInserter}): each search commits on its own,
 * inside the job's advisory-locked outer transaction, so one search's failure never rolls back
 * another's delivery and the email step (post-commit, in {@link SavedSearchAlertDeliveryService})
 * only ever runs against durable bookkeeping.
 *
 * <p>Atomically, or not at all:
 * <ol>
 *   <li>compare-and-set the watermark: {@code UPDATE saved_searches ... WHERE status='ACTIVE' AND
 *       alert_watermark IS NOT DISTINCT FROM :expected}. Zero rows = an overlapping run already
 *       advanced this search (or it was paused/deleted mid-run) → rollback, nothing delivered;</li>
 *   <li>insert the batch row ({@code email_status = PENDING});</li>
 *   <li>insert one delivery row per listing — the PK is the once-per-search guard, so a duplicate
 *       (which the CAS should already make impossible) fails the whole transaction loudly rather
 *       than double-delivering;</li>
 *   <li>insert the in-app notification (the guaranteed channel).</li>
 * </ol>
 */
@Component
public class SavedSearchAlertBookkeeper {

    private static final Logger log = LoggerFactory.getLogger(SavedSearchAlertBookkeeper.class);

    public static final String NOTIFICATION_TYPE = "saved_search_alert";

    /** Committed bookkeeping for one run; what the post-commit email step needs. */
    public record Batch(UUID batchId, UUID savedSearchId, UUID userId, int matchCount, OffsetDateTime watermarkTo) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final SavedSearchRepository savedSearchRepository;
    private final NotificationRepository notificationRepository;
    private final ObjectMapper objectMapper;

    public SavedSearchAlertBookkeeper(
            JdbcTemplate jdbcTemplate,
            SavedSearchRepository savedSearchRepository,
            NotificationRepository notificationRepository,
            ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.savedSearchRepository = savedSearchRepository;
        this.notificationRepository = notificationRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * @param expectedWatermark          the {@code alert_watermark} the matcher evaluated against
     *                                   (nullable — first run); half of the CAS guard
     * @param expectedWatermarkListingId the {@code alert_watermark_listing_id} the matcher
     *                                   evaluated against (nullable); the other half
     * @return the committed batch, or empty when the CAS lost (overlapping run / paused / deleted)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Batch> record(
            SavedSearch savedSearch,
            OffsetDateTime expectedWatermark,
            UUID expectedWatermarkListingId,
            List<SavedSearchAlertMatcher.Match> matches,
            OffsetDateTime now) {
        if (matches.isEmpty()) {
            return Optional.empty();
        }
        SavedSearchAlertMatcher.Match last = matches.get(matches.size() - 1);
        OffsetDateTime watermarkTo = last.eligibleAt();
        UUID watermarkToListingId = last.listingId();

        int updated = savedSearchRepository.advanceWatermark(
                savedSearch.getId(), expectedWatermark, expectedWatermarkListingId, watermarkTo, watermarkToListingId, now);
        if (updated != 1) {
            log.info("Saved-search alert CAS lost: savedSearchId={} expectedCursor=({}, {}) (overlapping run, paused or deleted)",
                    savedSearch.getId(), expectedWatermark, expectedWatermarkListingId);
            return Optional.empty();
        }

        UUID batchId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO saved_search_alert_batches"
                        + " (id, saved_search_id, user_id, match_count, watermark_to, watermark_to_listing_id, email_status, created_at)"
                        + " VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)",
                batchId, savedSearch.getId(), savedSearch.getUserId(), matches.size(), watermarkTo, watermarkToListingId, now);

        jdbcTemplate.batchUpdate(
                "INSERT INTO saved_search_alert_deliveries (saved_search_id, listing_id, batch_id, delivered_at)"
                        + " VALUES (?, ?, ?, ?)",
                matches,
                matches.size(),
                (ps, m) -> {
                    ps.setObject(1, savedSearch.getId());
                    ps.setObject(2, m.listingId());
                    ps.setObject(3, batchId);
                    ps.setObject(4, now, Types.TIMESTAMP_WITH_TIMEZONE);
                });

        insertNotification(savedSearch, batchId, matches.size());

        return Optional.of(new Batch(batchId, savedSearch.getId(), savedSearch.getUserId(), matches.size(), watermarkTo));
    }

    /** Post-commit email outcome for support/debugging; never affects delivery state. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markEmail(UUID batchId, EmailStatus status, OffsetDateTime attemptedAt) {
        jdbcTemplate.update(
                "UPDATE saved_search_alert_batches SET email_status = ?, email_attempted_at = ? WHERE id = ?",
                status.name(), attemptedAt, batchId);
    }

    /** Matcher/bookkeeping failure marker (no watermark change). */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markError(UUID savedSearchId) {
        savedSearchRepository.markAlertError(savedSearchId);
    }

    /** SKIPPED = no address on file; OPTED_OUT = owner disabled email for this search. */
    public enum EmailStatus {
        SENT, FAILED, SKIPPED, OPTED_OUT
    }

    private void insertNotification(SavedSearch s, UUID batchId, int matchCount) {
        String scope = SavedSearchSummary.scopeSummary(s);
        String label = s.getLabel() != null ? s.getLabel() : scope;
        String title = matchCount == 1
                ? "1 new listing matches \"" + label + "\""
                : matchCount + " new listings match \"" + label + "\"";
        String filters = SavedSearchSummary.filtersSummary(s);
        String message = "New listings in " + scope + (filters.isEmpty() ? "" : " · " + filters) + ".";

        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("saved_search_id", s.getId().toString());
        metadata.put("batch_id", batchId.toString());
        metadata.put("match_count", matchCount);
        metadata.put("restore_path", SavedSearchRestoreLink.restorePath(s));
        try {
            notificationRepository.insertNotification(
                    s.getUserId(), NOTIFICATION_TYPE, title, message, objectMapper.writeValueAsString(metadata));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("saved-search alert notification metadata could not be serialised", e);
        }
    }
}
