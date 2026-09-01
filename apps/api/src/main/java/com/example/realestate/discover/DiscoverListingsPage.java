package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverListingsPage(
        List<DiscoverListingResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        DiscoverListingsAggregates aggregates,   // null when includeAggregates=false
        /**
         * Opaque client-supplied echo (#2016): the {@code scopeFingerprint} query param the
         * caller sent is returned here UNCHANGED. This is a pure passthrough — never computed,
         * validated, or interpreted by the server — used by the frontend to detect and discard
         * a response that raced ahead of a newer result-scope change. Null when the caller did
         * not supply one.
         */
        String scopeFingerprint
) {

    /**
     * Backward-compatible constructor for callers that predate the #2016 fingerprint echo
     * (e.g. the dormant OpenSearch listings adapter, shadow-comparison tests). Defaults
     * {@code scopeFingerprint} to null.
     */
    public DiscoverListingsPage(List<DiscoverListingResponse> content, int page, int size,
            long totalElements, int totalPages, DiscoverListingsAggregates aggregates) {
        this(content, page, size, totalElements, totalPages, aggregates, null);
    }
}
