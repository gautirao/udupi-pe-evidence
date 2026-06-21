package com.example.realestate.discover.event;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Success response for POST /api/discover/events.
 */
public record DiscoverEventResponse(
        @JsonProperty("accepted") int accepted
) {}
