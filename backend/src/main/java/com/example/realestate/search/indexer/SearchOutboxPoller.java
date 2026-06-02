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
 * <p>Error handling: a failure processing one entry marks that entry FAILED and
 * records the truncated exception message, but does NOT abort the rest of the batch.
 * FAILED entries are excluded from future polls by the repository query — they require
 * manual intervention or a separate retry mechanism to reprocess.
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
    private static final String STATUS_FAILED = "FAILED";
    private static final int ERROR_MESSAGE_MAX_LENGTH = 1000;

    private final ListingSearchOutboxRepository repository;
    private final OpenSearchIndexingAdapter indexingAdapter;
    private final SearchIndexerProperties props;
    private final ListingRepository listingRepository;

    public SearchOutboxPoller(
            ListingSearchOutboxRepository repository,
            OpenSearchIndexingAdapter indexingAdapter,
            SearchIndexerProperties props,
            ListingRepository listingRepository) {
        this.repository = repository;
        this.indexingAdapter = indexingAdapter;
        this.props = props;
        this.listingRepository = listingRepository;
    }

    /**
     * Polls unpublished outbox entries and dispatches OpenSearch operations.
     * Runs on a fixed delay after the previous execution completes.
     * FAILED entries are excluded by the repository query and will not be reprocessed here.
     */
    @Scheduled(fixedDelayString = "${search.outbox.poll-interval-seconds:30}000")
    public void pollAndPublish() {
        Instant maxAge = Instant.now().minusSeconds(props.getOutbox().getMinEventAgeSeconds());
        List<ListingSearchOutboxEntry> batch = repository.findUnpublishedBatch(
                maxAge,
                PageRequest.of(0, props.getOutbox().getBatchSize()));

        if (batch.isEmpty()) {
            return;
        }

        log.debug("SearchOutboxPoller: processing batch of {} entries", batch.size());

        for (ListingSearchOutboxEntry entry : batch) {
            try {
                processEntry(entry);
                entry.setPublishedAt(Instant.now());
            } catch (Exception e) {
                log.warn("SearchOutboxPoller: failed to process entryId={} listingId={}: {}",
                        entry.getId(), entry.getListingId(), e.getMessage(), e);
                entry.setStatus(STATUS_FAILED);
                entry.setErrorMessage(truncate(e.getMessage(), ERROR_MESSAGE_MAX_LENGTH));
                entry.setFailedAt(Instant.now());
            }
            repository.save(entry);
        }

        log.info("SearchOutboxPoller: processed {} entries", batch.size());
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
