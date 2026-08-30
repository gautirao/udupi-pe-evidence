package com.example.realestate.search.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Writes events to the listing_search_outbox table.
 *
 * <p>This service is always active (no @ConditionalOnProperty). It writes rows
 * regardless of whether the indexer poller is enabled, so no events are silently
 * dropped when the flag is toggled.
 *
 * <p>All writes use {@link Propagation#REQUIRED} so they join the caller's
 * transaction. If the outer transaction rolls back, the outbox row is also rolled
 * back — preventing phantom index updates for operations that failed.
 *
 * <p><b>Privacy invariant:</b> The payload written to the outbox contains ONLY
 * non-sensitive fields (listing_id, event_type, operation, status). Contact info,
 * phone numbers, created_by, and all private fields are intentionally excluded.
 * The payload map is built explicitly key-by-key (no reflection-based copying).
 */
@Service
public class SearchOutboxWriter {

    private static final Logger log = LoggerFactory.getLogger(SearchOutboxWriter.class);

    private final ListingSearchOutboxRepository repository;
    private final ObjectMapper objectMapper;

    public SearchOutboxWriter(ListingSearchOutboxRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /**
     * Writes an outbox event for the given listing lifecycle transition.
     *
     * @param listingId       the listing's UUID
     * @param eventType       the domain event type (e.g. LISTING_APPROVED)
     * @param operation       INDEX (upsert) or DELETE (remove from index)
     * @param listingStatus   the listing's current status string (e.g. "LIVE", "DRAFT")
     * @param sourceUpdatedAt the listing's updated_at timestamp at the time of the event
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public void writeEvent(UUID listingId,
                           SearchOutboxEventType eventType,
                           SearchOutboxOperation operation,
                           String listingStatus,
                           Instant sourceUpdatedAt) {
        ListingSearchOutboxEntry entry = new ListingSearchOutboxEntry();
        entry.setEventId(UUID.randomUUID());
        entry.setListingId(listingId.toString());
        entry.setEventType(eventType.name());
        entry.setOperation(operation.name());
        entry.setStatus(listingStatus);
        entry.setOccurredAt(Instant.now());
        entry.setSourceUpdatedAt(sourceUpdatedAt);
        entry.setPayload(buildMinimalPayload(listingId, eventType, operation, listingStatus));
        repository.save(entry);

        log.debug("SearchOutboxWriter: wrote eventType={} operation={} listingId={} status={}",
                eventType, operation, listingId, listingStatus);
    }

    /**
     * Builds the minimal JSON payload stored in the outbox row using {@link ObjectMapper}
     * for correct escaping of any special characters in field values.
     *
     * <p>Only non-sensitive, search-relevant fields are included. The map is built
     * key-by-key (never via reflection or bean-copying) to guarantee the allowlist.
     */
    private String buildMinimalPayload(UUID listingId,
                                       SearchOutboxEventType eventType,
                                       SearchOutboxOperation operation,
                                       String listingStatus) {
        // LinkedHashMap preserves insertion order for deterministic JSON output in tests.
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("listing_id", listingId.toString());
        payload.put("event_type", eventType.name());
        payload.put("operation", operation.name());
        payload.put("status", listingStatus);
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize outbox payload for listingId=" + listingId, e);
        }
    }
}
