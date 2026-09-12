package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverCommercialFacts;
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
                null,  // boundary GeoJSON not available from OpenSearch index
                // #2431 — indexed as `commercial_subtype` (keyword) by ListingIndexDocument and
                // requested in DiscoverQueryDsl.SOURCE_FIELDS. Absent for non-commercial listings
                // and for legacy commercial rows whose subtype was never recorded; parses to null
                // in both cases, which is the honest answer. The shared buildMarker funnel applies
                // the same UPPER-case canonicalisation the Postgres path gets.
                string(source, "commercial_subtype")
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
        // #2431 — indexed as `commercial_subtype` (keyword) by ListingIndexDocument. Absent for
        // non-commercial listings and for legacy commercial rows whose subtype was never
        // recorded; parses to null in both cases, which is the honest answer. The shared
        // buildListing funnel below applies the same UPPER-case canonicalisation the Postgres
        // path gets, so the two engines cannot emit different spellings for the same listing.
        String commercialSubtype = string(source, "commercial_subtype");

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
                status,
                commercialSubtype,
                commercialFacts(source)
        );
    }

    /**
     * #2433 — the OpenSearch counterpart of the Postgres Commercial-facts projection.
     *
     * <p>Reads the SAME allowlist under the SAME snake_case keys the indexer writes, so a
     * listing produces an equal {@link DiscoverCommercialFacts} on either backend. A key
     * the index does not carry reads as absent rather than as a fabricated zero — which is
     * also why the numeric reads go through {@link #number} and an explicit null check
     * instead of {@code intValue()} on a possibly-null Number.
     *
     * <p>The coalesced Postgres columns ({@code total_floors}, {@code road_frontage_ft})
     * are flattened to one indexed field each by the indexer, so no coalescing is needed
     * here — the equality the parity test asserts is between the two mappers' OUTPUT, not
     * between their internal shapes.
     */
    private static DiscoverCommercialFacts commercialFacts(Map<String, Object> source) {
        Number floorNumber = number(source, "floor_number");
        Number totalFloors = number(source, "total_floors");
        Number officeSeats = number(source, "office_seats");
        Number clearHeight = number(source, "warehouse_clear_height_ft");
        Number loadingBays = number(source, "warehouse_loading_bays");
        Number roadFrontage = number(source, "road_frontage_ft");

        return DiscoverCommercialFacts.orNullIfEmpty(new DiscoverCommercialFacts(
                string(source, "floor_choice"),
                string(source, "floor_mode"),
                floorNumber == null ? null : floorNumber.intValue(),
                totalFloors == null ? null : totalFloors.intValue(),
                string(source, "hub_type"),
                officeSeats == null ? null : officeSeats.intValue(),
                string(source, "occupancy_status"),
                clearHeight == null ? null : clearHeight.doubleValue(),
                loadingBays == null ? null : loadingBays.intValue(),
                roadFrontage == null ? null : roadFrontage.doubleValue(),
                string(source, "commercial_zoning")));
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
