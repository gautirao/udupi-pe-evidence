package com.example.realestate.search.indexer;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.search.outbox.ListingSearchOutboxEntry;
import com.example.realestate.search.outbox.ListingSearchOutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Polls the listing_search_outbox table on a fixed delay and drives OpenSearch
 * index/delete operations for each unpublished event.
 *
 * <p>Only instantiated when {@code search.indexer.enabled=true}. The poll interval
 * is driven by {@code @Scheduled(fixedDelayString)} so each poll cycle starts only
 * after the previous one completes — no concurrent overlapping polls.
 *
 * <p><b>Concurrency invariant (LOAD-BEARING):</b>
 * This poller is correct only when a single instance is active at a time. Safety is
 * provided by {@code @Scheduled(fixedDelay)} with the default single-threaded scheduler
 * and a single application instance. If the scheduler thread-pool size is increased, or
 * this application is deployed to multiple instances, a distributed lock (e.g.
 * {@code SELECT ... FOR UPDATE SKIP LOCKED} or ShedLock) MUST be introduced before
 * enabling that change. Without a lock, concurrent pollers can double-process the same
 * batch, leading to duplicate OpenSearch operations and incorrect retry_count increments.
 *
 * <p>Error handling: a failure processing one entry increments {@code retry_count}.
 * If {@code retry_count >= maxRetryAttempts} the entry transitions to DEAD (terminal);
 * otherwise {@code next_attempt_at} is set to {@code now + retryDelaySeconds} so the
 * entry is re-armed for a future poll cycle. One entry failure never aborts the batch
 * (poison-event isolation).
 *
 * <p><b>processEntry routing:</b>
 * <ul>
 *   <li>operation=DELETE → always delete from index</li>
 *   <li>operation=INDEX AND status=LIVE AND listing found → index full document</li>
 *   <li>operation=INDEX AND status=LIVE AND listing NOT found → delete from index (safe fallback)</li>
 *   <li>operation=INDEX AND status≠LIVE → delete from index (non-live listings must not appear)</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "search.indexer.enabled", havingValue = "true")
public class SearchOutboxPoller {

    private static final Logger log = LoggerFactory.getLogger(SearchOutboxPoller.class);

    private static final String OPERATION_DELETE = "DELETE";
    private static final String OPERATION_INDEX = "INDEX";
    private static final String STATUS_LIVE = "LIVE";
    private static final String STATUS_DEAD = "DEAD";
    private static final int ERROR_MESSAGE_MAX_LENGTH = 1000;

    private final ListingSearchOutboxRepository repository;
    private final OpenSearchIndexingAdapter indexingAdapter;
    private final SearchIndexerProperties props;
    private final ListingRepository listingRepository;
    private final SearchOutboxMetrics metrics;

    public SearchOutboxPoller(
            ListingSearchOutboxRepository repository,
            OpenSearchIndexingAdapter indexingAdapter,
            SearchIndexerProperties props,
            ListingRepository listingRepository,
            SearchOutboxMetrics metrics) {
        this.repository = repository;
        this.indexingAdapter = indexingAdapter;
        this.props = props;
        this.listingRepository = listingRepository;
        this.metrics = metrics;
    }

    /**
     * Polls unpublished outbox entries and dispatches OpenSearch operations.
     * Runs on a fixed delay after the previous execution completes (single-threaded).
     *
     * <p>See class-level Javadoc for the load-bearing single-instance concurrency invariant.
     */
    @Scheduled(fixedDelayString = "${search.outbox.poll-interval-seconds:30}000")
    public void pollAndPublish() {
        Instant now = Instant.now();
        Instant maxAge = now.minusSeconds(props.getOutbox().getMinEventAgeSeconds());
        List<ListingSearchOutboxEntry> batch = repository.findUnpublishedBatch(
                maxAge,
                now,
                PageRequest.of(0, props.getOutbox().getBatchSize()));

        if (batch.isEmpty()) {
            return;
        }

        log.debug("SearchOutboxPoller: processing batch of {} entries", batch.size());

        for (ListingSearchOutboxEntry entry : batch) {
            try {
                processEntry(entry);
                // Use Instant.now() here (time-of-completion) to record when this
                // specific entry was published, which may differ slightly from the
                // poll-cycle start time captured in `now`.
                entry.setPublishedAt(Instant.now());
                entry.setNextAttemptAt(null);
            } catch (Exception e) {
                // Pass the poll-cycle `now` so nextAttemptAt = now + retryDelaySeconds
                // is consistent with the single Instant captured at the top of this cycle.
                handleFailure(entry, e, now);
            }
            repository.save(entry);
        }

        log.info("SearchOutboxPoller: processed {} entries", batch.size());
    }

    /**
     * Handles a processing failure for a single outbox entry.
     *
     * <p>Increments {@code retry_count} first, then decides fate:
     * <ul>
     *   <li>retry_count {@literal >=} maxRetryAttempts → DEAD (terminal; never re-polled)</li>
     *   <li>retry_count {@literal <} maxRetryAttempts → re-arm: set next_attempt_at to future</li>
     * </ul>
     *
     * <p>The success path never calls this method and never touches retry_count,
     * so a first-attempt success leaves retry_count=0.
     *
     * <p><b>Clock invariant:</b> {@code failureTime} must be the single {@code Instant} captured
     * at the top of the enclosing poll cycle (not a fresh {@code Instant.now()} call here), so
     * that {@code next_attempt_at = failureTime + retryDelaySeconds} is deterministic and
     * consistent with the {@code now} value passed to the repository query.
     */
    private void handleFailure(ListingSearchOutboxEntry entry, Exception e, Instant failureTime) {
        int newRetryCount = entry.getRetryCount() + 1;
        entry.setRetryCount(newRetryCount);
        entry.setErrorMessage(truncate(e.getMessage(), ERROR_MESSAGE_MAX_LENGTH));
        entry.setFailedAt(failureTime);

        int maxAttempts = props.getOutbox().getMaxRetryAttempts();
        if (newRetryCount >= maxAttempts) {
            entry.setStatus(STATUS_DEAD);
            entry.setNextAttemptAt(null);
            metrics.recordTerminal();
            log.warn("SearchOutboxPoller: entryId={} listingId={} exhausted {} attempts — marked DEAD: {}",
                    entry.getId(), entry.getListingId(), maxAttempts, e.getMessage(), e);
        } else {
            long delaySeconds = props.getOutbox().getRetryDelaySeconds();
            entry.setNextAttemptAt(failureTime.plusSeconds(delaySeconds));
            metrics.recordRetry();
            log.warn("SearchOutboxPoller: entryId={} listingId={} attempt {}/{} failed — retry at {}: {}",
                    entry.getId(), entry.getListingId(), newRetryCount, maxAttempts,
                    entry.getNextAttemptAt(), e.getMessage(), e);
        }
    }

    /**
     * Dispatches the appropriate OpenSearch operation for a single outbox entry.
     *
     * <p>Routing:
     * <ul>
     *   <li>DELETE operation → always call deleteListing</li>
     *   <li>INDEX + LIVE status + listing found → call indexListing with full document</li>
     *   <li>INDEX + LIVE status + listing NOT found → call deleteListing (safe fallback;
     *       listing was deleted between outbox write and poll cycle)</li>
     *   <li>INDEX + non-LIVE status → call deleteListing (non-live must not be in index)</li>
     * </ul>
     */
    private void processEntry(ListingSearchOutboxEntry entry) {
        String listingId = entry.getListingId();
        String operation = entry.getOperation();
        String status = entry.getStatus();

        if (OPERATION_DELETE.equals(operation)) {
            indexingAdapter.deleteListing(listingId);
        } else if (OPERATION_INDEX.equals(operation) && STATUS_LIVE.equals(status)) {
            Optional<Listing> listingOpt = listingRepository.findById(UUID.fromString(listingId));
            if (listingOpt.isPresent()) {
                ListingIndexDocument doc = ListingIndexDocument.fromListing(listingOpt.get());
                indexingAdapter.indexListing(listingId, doc);
            } else {
                // Listing was deleted between the outbox write and this poll cycle.
                // Issue a delete to ensure no stale document remains in the index.
                log.warn("SearchOutboxPoller: listingId={} not found during INDEX poll — issuing delete", listingId);
                indexingAdapter.deleteListing(listingId);
            }
        } else {
            // INDEX operation but listing is not LIVE — remove from index to prevent stale data
            indexingAdapter.deleteListing(listingId);
        }
    }

    private static String truncate(String message, int maxLength) {
        if (message == null) {
            return null;
        }
        return message.length() <= maxLength ? message : message.substring(0, maxLength);
    }
}
