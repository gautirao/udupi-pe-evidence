package com.example.realestate.poi;

import java.util.Optional;

/**
 * Seam for Overpass API HTTP calls.
 * <p>
 * Defined as a {@link FunctionalInterface} so tests can inject a mock lambda
 * without needing a full HTTP stack. The production implementation is provided
 * as a bean in {@link OverpassService}.
 */
@FunctionalInterface
public interface OverpassHttpClient {

    /**
     * POST a query body to the given Overpass interpreter URL.
     *
     * @param url  the Overpass interpreter endpoint (primary or fallback)
     * @param body the QL query body (plain text)
     * @return the raw JSON response body, or {@link Optional#empty()} on failure
     */
    Optional<String> post(String url, String body);
}
