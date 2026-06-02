package com.example.realestate.search.indexer;

import com.example.realestate.discover.opensearch.OpenSearchProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Adapter that performs OpenSearch index and delete operations for listing documents.
 *
 * <p>Only instantiated when {@code search.indexer.enabled=true}. Uses the
 * {@code searchIndexerRestClient} bean (distinct from the discover read-path client)
 * and targets the same index alias as the read path ({@link OpenSearchProperties#indexAlias()}).
 *
 * <p>DELETE operations treat HTTP 404 as a no-op: the document may have already been
 * removed or may never have been indexed (e.g. was never LIVE). This is the correct
 * idempotent behaviour for a delete-on-best-effort basis.
 */
@Component
@ConditionalOnProperty(name = "search.indexer.enabled", havingValue = "true")
public class OpenSearchIndexingAdapter {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchIndexingAdapter.class);

    private final RestClient restClient;
    private final OpenSearchProperties props;
    private final ObjectMapper objectMapper;

    public OpenSearchIndexingAdapter(
            @Qualifier("searchIndexerRestClient") RestClient restClient,
            OpenSearchProperties props,
            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    /**
     * Upserts a listing document into the search index.
     *
     * @param listingId the listing's UUID string (used as the document _id)
     * @param doc       the document to index
     * @throws RuntimeException if serialization fails or OpenSearch returns a non-2xx error
     *                          other than 404 (404 would not occur on PUT anyway)
     */
    public void indexListing(String listingId, ListingIndexDocument doc) {
        String body;
        try {
            body = objectMapper.writeValueAsString(doc);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(
                    "Failed to serialize ListingIndexDocument for listingId=" + listingId, e);
        }

        restClient.put()
                .uri("/{index}/_doc/{id}", props.indexAlias(), listingId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();

        log.debug("OpenSearchIndexingAdapter: indexed listingId={} index={}", listingId, props.indexAlias());
    }

    /**
     * Removes a listing document from the search index.
     * A 404 response is treated as a no-op (idempotent delete).
     *
     * @param listingId the listing's UUID string (document _id to delete)
     */
    public void deleteListing(String listingId) {
        try {
            restClient.delete()
                    .uri("/{index}/_doc/{id}", props.indexAlias(), listingId)
                    .retrieve()
                    .toBodilessEntity();

            log.debug("OpenSearchIndexingAdapter: deleted listingId={} index={}", listingId, props.indexAlias());
        } catch (HttpClientErrorException.NotFound e) {
            // Document did not exist in the index — idempotent, not an error
            log.debug("OpenSearchIndexingAdapter: delete no-op, listingId={} not found in index", listingId);
        }
    }
}
