package com.example.realestate.broker.focus;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code DELETE /api/broker/market-focus}.
 *
 * <p>Identifies the tuple to remove. broker_id is never accepted from the client —
 * it is always derived from the JWT via {@link com.example.realestate.security.CallerInfo}.
 * If no row exists for the calling broker with these coordinates, the service returns 404.
 */
public record RemoveFocusRequest(

        @NotBlank(message = "citySlug must not be blank")
        @Size(max = 200, message = "citySlug must not exceed 200 characters")
        String citySlug,

        @NotBlank(message = "areaKey must not be blank")
        @Size(max = 500, message = "areaKey must not exceed 500 characters")
        String areaKey,

        @NotBlank(message = "propertyType must not be blank")
        @Size(max = 100, message = "propertyType must not exceed 100 characters")
        String propertyType,

        @NotBlank(message = "listingPurpose must not be blank")
        @Size(max = 100, message = "listingPurpose must not exceed 100 characters")
        String listingPurpose
) {}
