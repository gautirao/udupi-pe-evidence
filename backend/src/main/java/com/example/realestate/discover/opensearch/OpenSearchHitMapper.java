package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverListingsService;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersService;
import com.example.realestate.listing.api.ListingResponse;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * Maps an OpenSearch hit's {@code _source} map to discover DTO types.
 *
 * <p>Computed fields match the logic in {@link com.example.realestate.discover.DiscoverListingsService}:
 * <ul>
 *   <li>{@code daysOnMarket}: days since {@code first_published_at} (or {@code created_at} when absent)</li>
 *   <li>{@code backOnMarket}: {@code back_to_market_at} non-null and within the last 30 days</li>
 *   <li>{@code reraValid}: {@code rera_number} matches {@link ListingResponse#RERA_PATTERN}</li>
 * </ul>
 */
final class OpenSearchHitMapper {

    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private OpenSearchHitMapper() {
        // static utility only
    }

    // -----------------------------------------------------------------------
    // DiscoverMarker
    // -----------------------------------------------------------------------

    static DiscoverMarker toMarker(Map<String, Object> source) {
        String id = string(source, "id");
        Number latNum = number(source, "latitude");
        Number lonNum = number(source, "longitude");
        if (latNum == null || lonNum == null) {
            return null; // should not happen if OS filter is correct; skip gracefully
        }
        Number price = number(source, "price_paise");
        String locality = string(source, "locality");
        String propertyType = string(source, "property_type");

        // #1726: route through the same DTO-construction funnel as the Postgres path so this
        // (currently dormant) OpenSearch backend cannot reintroduce the exact-pin leak.
        return DiscoverMarkersService.buildMarker(
                id,
                latNum.doubleValue(),
                lonNum.doubleValue(),
                price != null ? price.longValue() : null,
                locality,
                propertyType,
                null  // boundary GeoJSON not available from OpenSearch index
        );
    }

    // -----------------------------------------------------------------------
    // DiscoverListingResponse
    // -----------------------------------------------------------------------

    static DiscoverListingResponse toListing(Map<String, Object> source) {
        String id = string(source, "id");
        String listingNumber = string(source, "listing_number");
        String propertyType = string(source, "property_type");
        String title = string(source, "title");
        String locality = string(source, "locality");
        String areaKey = string(source, "area_key");

        Number priceNum = number(source, "price_paise");
        Long pricePaise = priceNum != null ? priceNum.longValue() : null;

        Number landAreaNum = number(source, "land_area");
        Double landArea = landAreaNum != null ? landAreaNum.doubleValue() : null;
        String landAreaUnit = string(source, "land_area_unit");

        Number builtAreaNum = number(source, "built_area");
        Double builtArea = builtAreaNum != null ? builtAreaNum.doubleValue() : null;
        String builtAreaUnit = string(source, "built_area_unit");

        Number bedroomsNum = number(source, "bedrooms");
        Integer bedrooms = bedroomsNum != null ? bedroomsNum.intValue() : null;

        Number latNum = number(source, "latitude");
        Double latitude = latNum != null ? latNum.doubleValue() : null;
        Number lonNum = number(source, "longitude");
        Double longitude = lonNum != null ? lonNum.doubleValue() : null;

        String heroImageUrl = string(source, "hero_image_url");

        OffsetDateTime createdAt = parseOffsetDateTime(string(source, "created_at"));
        OffsetDateTime updatedAt = parseOffsetDateTime(string(source, "updated_at"));
        OffsetDateTime firstPublishedAt = parseOffsetDateTime(string(source, "first_published_at"));
        OffsetDateTime lastUpdatedAt = parseOffsetDateTime(string(source, "last_updated_at"));
        // #1794 Phase 1: last_confirmed_at is not currently indexed into OpenSearch documents
        // (this backend is dormant — discover.opensearch.enabled). Parses to null when absent,
        // which is honest — never fabricated.
        OffsetDateTime confirmedAt = parseOffsetDateTime(string(source, "last_confirmed_at"));
        OffsetDateTime backToMarketAt = parseOffsetDateTime(string(source, "back_to_market_at"));

        // daysOnMarket: days since first_published_at; fall back to created_at
        LocalDate referenceDate;
        if (firstPublishedAt != null) {
            referenceDate = firstPublishedAt.toLocalDate();
        } else if (createdAt != null) {
            referenceDate = createdAt.toLocalDate();
        } else {
            referenceDate = LocalDate.now(ZoneOffset.UTC);
        }
        int daysOnMarket = (int) ChronoUnit.DAYS.between(referenceDate, LocalDate.now(ZoneOffset.UTC));

        // backOnMarket: back_to_market_at non-null and within last 30 days
        boolean backOnMarket = backToMarketAt != null
                && backToMarketAt.isAfter(OffsetDateTime.now(ZoneOffset.UTC).minusDays(BACK_ON_MARKET_WINDOW_DAYS));

        String reraNumber = string(source, "rera_number");
        boolean reraValid = reraNumber != null && ListingResponse.RERA_PATTERN.matcher(reraNumber).matches();

        String trustTier = string(source, "trust_tier");
        String possessionStatus = string(source, "possession_status");
        String sellerType = string(source, "seller_type");
        String listingPurpose = string(source, "listing_purpose");
        String status = string(source, "status");

        // #1726: route through the same DTO-construction funnel as the Postgres path so this
        // (currently dormant) OpenSearch backend cannot reintroduce the exact-pin leak.
        return DiscoverListingsService.buildListing(
                id,
                listingNumber,
                propertyType,
                title,
                locality,
                areaKey,
                pricePaise,
                landArea,
                landAreaUnit,
                builtArea,
                builtAreaUnit,
                bedrooms,
                latitude,
                longitude,
                heroImageUrl,
                createdAt,
                updatedAt,
                firstPublishedAt,
                lastUpdatedAt,
                confirmedAt,
                daysOnMarket,
                backOnMarket,
                reraNumber,
                reraValid,
                trustTier,
                possessionStatus,
                sellerType,
                listingPurpose,
                status
        );
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private static String string(Map<String, Object> source, String key) {
        Object val = source.get(key);
        if (val == null) return null;
        return val.toString();
    }

    private static Number number(Map<String, Object> source, String key) {
        Object val = source.get(key);
        if (val instanceof Number n) return n;
        return null;
    }

    private static OffsetDateTime parseOffsetDateTime(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return OffsetDateTime.parse(value);
        } catch (DateTimeParseException e) {
            // OpenSearch may return dates in various ISO-8601 formats; try LocalDate fallback
            try {
                return LocalDate.parse(value).atStartOfDay().atOffset(java.time.ZoneOffset.UTC);
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }
}
