package com.example.realestate.listing.api;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Minimal public teaser for an anonymous (unauthenticated) caller.
 *
 * <p>Deliberately omits sensitive fields: latitude, longitude, full address,
 * description, sellerType, bedrooms, builtArea, landArea, reraNumber,
 * contactPhone, and createdBy. The caller must authenticate to receive the
 * full {@link ListingResponse}.
 *
 * @param id              listing UUID
 * @param primaryImageUrl URL of the first image, or null if no images
 * @param imageCount      total number of images (including those behind auth gate)
 * @param price           listing price in rupees, or null
 * @param propertyType    e.g. "house", "land", "apartment"
 * @param locality        locality/city name (spec label: "city")
 * @param listingPurpose  e.g. "SALE", "RENT", or null
 */
public record ListingTeaserResponse(
        UUID id,
        String primaryImageUrl,
        int imageCount,
        BigDecimal price,
        String propertyType,
        String locality,
        String listingPurpose
) {}
