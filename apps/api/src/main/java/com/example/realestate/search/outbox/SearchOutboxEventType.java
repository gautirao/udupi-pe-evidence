package com.example.realestate.search.outbox;

/**
 * Domain event types written to the listing_search_outbox table.
 * Each value corresponds to a lifecycle transition that may trigger an
 * OpenSearch index or delete operation.
 */
public enum SearchOutboxEventType {
    LISTING_CREATED,
    LISTING_APPROVED,
    LISTING_UPDATED,
    LISTING_UNPUBLISHED,
    LISTING_REJECTED,
    LISTING_ARCHIVED,
    LISTING_DELETED
}
