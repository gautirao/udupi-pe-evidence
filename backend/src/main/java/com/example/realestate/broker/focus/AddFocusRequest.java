package com.example.realestate.broker.focus;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/broker/market-focus}.
 *
 * <p>Three tuple fields are required. {@code citySlug} is intentionally absent:
 * the server resolves it from {@code areaKey} via the authoritative
 * {@code areas → cities} join (same join used by seed). Accepting
 * {@code citySlug} from the client would allow a stale or split-derived value to
 * land in a different composite-PK bucket than the seed path produces for the same
 * real area (the Kundapur rule).
 *
 * <p>{@code broker_id} is also never accepted from the client — it is always
 * derived from the JWT via {@link com.example.realestate.security.CallerInfo}.
 */
public record AddFocusRequest(

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
