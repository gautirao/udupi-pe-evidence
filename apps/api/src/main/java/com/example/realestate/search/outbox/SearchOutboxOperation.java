package com.example.realestate.search.outbox;

/**
 * The OpenSearch operation to be performed for an outbox event.
 * INDEX: upsert the listing document into the search index.
 * DELETE: remove the listing document from the search index.
 */
public enum SearchOutboxOperation {
    INDEX,
    DELETE
}
