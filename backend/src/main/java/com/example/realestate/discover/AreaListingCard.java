package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

/**
 * Slim listing card returned per area in the city-first discover endpoint.
 *
 * @param id              listing UUID
 * @param pricePaise      asking price in paise, or null
 * @param propertyType    e.g. "house", "apartment", "land"
 * @param locality        locality label from the listing record
 * @param primaryImageUrl URL of the lowest-position image, or null if none uploaded
 * @param listingPurpose  "sale" or "rent"
 * @param bedrooms        bedroom count, or null when not set
 * @param title             listing title, or null
 * @param bathrooms         bathroom count, or null
 * @param builtArea         built-up area value, or null
 * @param builtAreaUnit     unit for builtArea (e.g. "sq ft"), or null
 * @param landArea          land area value, or null (agricultural / land plots)
 * @param landAreaUnit      unit for landArea (e.g. "cent", "acre"), or null
 * @param totalFloors       total floors in building, or null (commercial)
 * @param parkingCount      parking spots, or null (commercial)
 * @param furnishingStatus  "furnished", "semi-furnished", "unfurnished", or null (residential rent)
 * @param createdAt         ISO-8601 timestamp when listing was first saved, or null
 * @param trustTier         backend trust score: A, B, C, or D; null for legacy rows
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaListingCard(
        UUID id,
        Long pricePaise,
        String propertyType,
        String locality,
        String primaryImageUrl,
        String listingPurpose,
        Integer bedrooms,
        String title,
        Integer bathrooms,
        Double builtArea,
        String builtAreaUnit,
        Double landArea,
        String landAreaUnit,
        Integer totalFloors,
        Integer parkingCount,
        String furnishingStatus,
        String createdAt,
        String trustTier
) {}
