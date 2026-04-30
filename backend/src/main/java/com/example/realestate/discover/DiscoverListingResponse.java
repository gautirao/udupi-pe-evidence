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
        Integer daysOnMarket,
        Boolean backOnMarket,
        String reraNumber,
        Boolean reraValid,
        String trustTier,
        String possessionStatus,
        String sellerType,
        String listingPurpose,
        String status
) {}
