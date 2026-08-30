package com.example.realestate.discover.event;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * Inbound DTO for POST /api/discover/events.
 *
 * <p>Validation beyond basic null checks is performed in {@link DiscoverEventService}
 * against {@link DiscoverEventAllowList} constants. Bean-validation annotations are
 * intentionally minimal here to keep all policy in one place.
 *
 * <p>PII GUARANTEE: this DTO contains no user-identity, IP, or device fields.
 * session_id is a client-generated UUID unlinked from auth.users.
 */
public record DiscoverEventRequest(
        @JsonProperty("events") List<EventItem> events
) {

    /**
     * A single anonymous discover event.
     */
    public record EventItem(
            /**
             * Client-generated UUID. Must parse as UUID. NOT linked to any user identity.
             */
            @JsonProperty("session_id") String sessionId,

            /**
             * One of: FILTER_APPLY, PANEL_OPEN, LEAD_INTENT.
             */
            @JsonProperty("event_type") String eventType,

            /**
             * Pipe-delimited area key, e.g. "IN|KA|Udupi|Manipal". Optional.
             */
            @JsonProperty("area_key") String areaKey,

            /**
             * Coarse property type, e.g. "residential", "agricultural_land". Optional.
             */
            @JsonProperty("property_type") String propertyType,

            /**
             * Listing purpose, e.g. "sale", "rent". Optional.
             */
            @JsonProperty("listing_purpose") String listingPurpose,

            /**
             * Coarse price band label from {@link DiscoverEventAllowList#ALLOWED_PRICE_BANDS}.
             * Raw numeric prices are rejected.
             */
            @JsonProperty("price_band") String priceBand,

            /**
             * Additional filter signals. Keys must be from
             * {@link DiscoverEventAllowList#ALLOWED_FILTER_KEYS}.
             * Values must be scalar (String, Number, Boolean).
             * Nested objects and arrays are rejected.
             */
            @JsonProperty("filters") Map<String, Object> filters
    ) {}
}
