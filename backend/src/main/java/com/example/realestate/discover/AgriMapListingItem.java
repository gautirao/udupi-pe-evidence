package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

/**
 * Immutable DTO for a single item in the public agri-map endpoint response.
 *
 * <p>Only fields safe for public anonymous access are included.
 * Seller identity, rejection reason, internal admin fields, and status are
 * intentionally excluded.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AgriMapListingItem(
        String id,
        String title,
        String areaKey,
        Double latitude,
        Double longitude,
        String propertyType,
        String locality,
        String boundaryGeoJson,
        BigDecimal landArea,
        String landAreaUnit,
        BigDecimal computedAreaAcres,
        Long pricePaise,
        String listingPurpose,
        String waterSource,
        String landCategory,
        Boolean farmhouseAvailable,
        Boolean fencingDone
) {}
