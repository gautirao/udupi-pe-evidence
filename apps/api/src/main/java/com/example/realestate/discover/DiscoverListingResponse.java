package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverListingResponse(
        String id,
        String listingNumber,
        String propertyType,
        String title,
        String locality,
        String areaKey,
        Long pricePaise,
        Double landArea,
        String landAreaUnit,
        Double builtArea,
        String builtAreaUnit,
        Integer bedrooms,
        Double latitude,
        Double longitude,
        String heroImageUrl,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime firstPublishedAt,
        OffsetDateTime lastUpdatedAt,
        // #1794 Phase 1: set to the transition timestamp every time the listing enters LIVE
        // (publish or reconfirm). Null when never confirmed since this column was introduced —
        // honest absence, never backfilled/fabricated.
        OffsetDateTime confirmedAt,
        Integer daysOnMarket,
        Boolean backOnMarket,
        String reraNumber,
        Boolean reraValid,
        // Public-safe trust badge word ("verified"/"trusted"/"listed"), or null when the
        // listing has no badge. Never the raw internal letter grade — see TrustBadge.
        String trustBadge,
        String possessionStatus,
        String sellerType,
        String listingPurpose,
        String status
) {}
