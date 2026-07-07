package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

/**
 * Slim listing card returned per area in the city-first discover endpoint.
 *
 * <p>Auth-aware price projection:
 * <ul>
 *   <li>Authenticated callers: {@code pricePaise} populated, {@code priceBand} null (omitted by NON_NULL).</li>
 *   <li>Anonymous callers: {@code pricePaise} null (omitted), {@code priceBand} populated with
 *       a coarse band label from {@link PriceBand}.</li>
 *   <li>Null price_paise in DB: both fields null/absent for all callers — price is never fabricated.</li>
 * </ul>
 *
 * @param id              listing UUID
 * @param pricePaise      exact asking price in paise (authenticated callers only); null for anon
 * @param priceBand       coarse price band label (anonymous callers only, e.g. "₹50L–1Cr"); null for authed
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
 * @param trustBadge        public-safe trust badge word ("verified"/"trusted"/"listed"), or null
 *                          when the listing has no badge (D tier, legacy rows, or unknown grade).
 *                          Never the raw internal letter grade — see {@link TrustBadge}.
 * @param latitude          geo-coordinate latitude, or null when not geocoded
 * @param longitude         geo-coordinate longitude, or null when not geocoded
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaListingCard(
        UUID id,
        Long pricePaise,
        String priceBand,
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
        String trustBadge,
        Double latitude,
        Double longitude
) {}
