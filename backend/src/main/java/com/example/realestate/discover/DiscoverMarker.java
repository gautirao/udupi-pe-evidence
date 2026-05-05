package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Lightweight map marker payload.
 *
 * <p>Jackson serializes Java record component names verbatim, so {@code @JsonProperty} is placed
 * on each component that must use a different JSON key.  {@code latitude} → {@code lat} and
 * {@code longitude} → {@code lon} shrink marker payloads and match the frontend contract
 * (issue #984).
 */
public record DiscoverMarker(
        String id,
        @JsonProperty("lat") double latitude,
        @JsonProperty("lon") double longitude,
        Long pricePaise,
        String locality
) {}
