package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;

/**
 * Anon-safe projection for one listing in a school-radius result.
 *
 * <p>Contains EXACTLY the 20 approved public fields. Excluded fields
 * (trustTier, reraNumber, reraValid, sellerType, status, updatedAt,
 * lastUpdatedAt, firstPublishedAt) are not declared in this record
 * and are never selected or serialized.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicSchoolRadiusListingCard(
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
        String listingPurpose,
        String possessionStatus,
        Integer daysOnMarket,
        Boolean backOnMarket,
        OffsetDateTime createdAt
) {}
