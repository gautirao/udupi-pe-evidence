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
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaListingCard(
        UUID id,
        Long pricePaise,
        String propertyType,
        String locality,
        String primaryImageUrl,
        String listingPurpose
) {}
