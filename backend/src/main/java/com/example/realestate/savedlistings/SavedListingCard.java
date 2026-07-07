package com.example.realestate.savedlistings;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

/**
 * Compact card summary of a user's saved listing, for GET /api/me/saved-listings.
 *
 * <p>This endpoint is always behind a valid JWT (any authenticated user) — there is
 * no anonymous caller path here, unlike the public discover endpoints — so {@code
 * pricePaise} is always the exact price and no coarse price-band projection is
 * needed.
 *
 * <p>{@code status} / {@code available} let the caller badge a listing that was
 * saved while LIVE but has since been archived, rather than surfacing a 404/500 for
 * a listing the user still has bookmarked.
 *
 * @param id              saved-listing row id
 * @param listingId       the underlying property listing's id
 * @param savedAt         ISO-8601 timestamp when the listing was saved
 * @param title           listing title, or null
 * @param pricePaise      exact asking price in paise, or null
 * @param propertyType    e.g. "house", "apartment", "land"
 * @param locality        locality label, or null
 * @param primaryImageUrl URL of the lowest-position image, or null if none uploaded
 * @param listingPurpose  "sale" or "rent"
 * @param bedrooms        bedroom count, or null
 * @param bathrooms       bathroom count, or null
 * @param builtArea       built-up area value, or null
 * @param builtAreaUnit   unit for builtArea (e.g. "sq ft"), or null
 * @param landArea        land area value, or null
 * @param landAreaUnit    unit for landArea, or null
 * @param status          the listing's current lifecycle status (e.g. LIVE, ARCHIVED)
 * @param available       true when the listing is LIVE and not archived; false otherwise
 *                        so the caller can badge it (e.g. "no longer available")
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SavedListingCard(
        UUID id,
        UUID listingId,
        String savedAt,
        String title,
        Long pricePaise,
        String propertyType,
        String locality,
        String primaryImageUrl,
        String listingPurpose,
        Integer bedrooms,
        Integer bathrooms,
        Double builtArea,
        String builtAreaUnit,
        Double landArea,
        String landAreaUnit,
        String status,
        boolean available
) {}
