package com.example.realestate.discover.opensearch;

/**
 * Unchecked exception thrown when an OpenSearch query or response parsing fails.
 *
 * <p>Caught by {@link com.example.realestate.discover.RoutingDiscoverMarkersService} and
 * {@link com.example.realestate.discover.RoutingDiscoverListingsService} as part of the
 * fallback-to-Postgres error path.
 */
public class OpenSearchQueryException extends RuntimeException {

    public OpenSearchQueryException(String message) {
        super(message);
    }

    public OpenSearchQueryException(String message, Throwable cause) {
        super(message, cause);
    }
}
