package com.example.realestate.listing.api;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Minimal public teaser for an anonymous (unauthenticated) caller.
 *
 * <p>Deliberately omits sensitive fields for non-agri listings: latitude, longitude,
 * full address, description, sellerType, bedrooms, builtArea, reraNumber,
 * contactPhone, and createdBy. The caller must authenticate to receive the
 * full {@link ListingResponse}.
 *
 * <p>For {@code agricultural_land} listings only, the following additional fields
 * are populated when available. All other property types receive {@code null} for
 * these fields, which are omitted from the JSON response by {@code @JsonInclude(NON_NULL)}.
 *
 * <p>IC-2 contract (issue #1407): boundary is full-precision PostGIS geometry (non-approximate).
 * Frontend rendering (#1406) MUST always display the legal-verification disclaimer alongside boundary.
 *
 * @param id                 listing UUID
 * @param primaryImageUrl    URL of the first image, or null if no images
 * @param imageCount         total number of images (including those behind auth gate)
 * @param price              listing price in rupees (deprecated column), or null
 * @param pricePaise         listing price in paise (source of truth); null for rows that predate migration
 * @param propertyType       e.g. "house", "land", "apartment", "agricultural_land"
 * @param locality           locality/city name (spec label: "city")
 * @param listingPurpose     e.g. "SALE", "RENT", or null
 * @param boundary           GeoJSON string from findBoundaryGeoJson; agri-only
 * @param latitude           latitude coordinate; agri-only (Double matches Listing entity type)
 * @param longitude          longitude coordinate; agri-only (Double matches Listing entity type)
 * @param landArea           broker-declared land area; agri-only
 * @param landAreaUnit       unit for landArea (e.g. "acres", "cents"); agri-only
 * @param computedAreaAcres  derived acreage from PostGIS ST_Area on boundary geography; agri-only
 * @param waterSource        water source description; agri-only
 * @param soilType           soil type description; agri-only
 * @param roadAccess         road access description; agri-only
 * @param cultivationStatus  cultivation status; agri-only
 * @param ownershipType      ownership type; agri-only
 * @param surveyNumber       survey/plot number; agri-only
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListingTeaserResponse(
        UUID id,
        String primaryImageUrl,
        int imageCount,
        BigDecimal price,
        Long pricePaise,
        String propertyType,
        String locality,
        String listingPurpose,
        // IC-1: agri-only fields — null for all other property types.
        // @JsonInclude(NON_NULL) ensures non-agri responses stay 7-field only.
        String boundary,
        Double latitude,
        Double longitude,
        BigDecimal landArea,
        String landAreaUnit,
        BigDecimal computedAreaAcres,
        String waterSource,
        String soilType,
        String roadAccess,
        String cultivationStatus,
        String ownershipType,
        String surveyNumber
) {}
