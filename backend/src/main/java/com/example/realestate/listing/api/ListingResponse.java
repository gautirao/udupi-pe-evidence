package com.example.realestate.listing.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

public record ListingResponse(
        UUID id,
        Integer listingNumber,
        String displayId,
        String status,
        String propertyType,
        String title,
        String locality,
        BigDecimal price,
        Long pricePaise,
        String description,
        BigDecimal landArea,
        Integer bedrooms,
        BigDecimal builtArea,
        String landAreaUnit,
        String builtAreaUnit,
        Double latitude,
        Double longitude,
        boolean addressConfirmed,
        String rejectionReason,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        int imageCount,
        String firstImageUrl,
        String videoUrl,
        String reraNumber,
        // Commercial & rent fields
        String listingPurpose,
        BigDecimal carpetArea,
        String carpetAreaUnit,
        Integer floorNumber,
        Integer totalFloors,
        String furnishingStatus,
        Integer washrooms,
        Integer parkingCount,
        BigDecimal roadFrontageFt,
        String commercialUsage,
        Integer numberOfUnits,
        Long monthlyRent,
        Integer securityDepositMonths,
        Integer lockInMonths,
        String sellerType,
        // Transparency fields (RE-94)
        int daysOnMarket,
        boolean backOnMarket,
        OffsetDateTime lastUpdatedAt,
        OffsetDateTime firstPublishedAt,
        // RERA & possession fields (RE-99)
        String possessionStatus,
        LocalDate expectedPossessionDate,
        String approvalsDeclared,
        /** true when reraNumber matches Karnataka RERA format; computed at read time, not stored. */
        boolean reraValid,
        /** Number of EARNED (Verified) trust badges for this listing. Never negative. */
        int earnedBadgeCount,
        /** Computed trust tier: A, B, C, or D. Null only for legacy rows before V46. */
        String trustTier,
        String areaKey,
        /**
         * Ordered image gallery for the listing detail view.
         *
         * <p>Populated ONLY on single-listing endpoints (public detail, broker preview).
         * List/batch endpoints always set this to an empty list to keep list payloads
         * unchanged — {@code imageCount} + {@code firstImageUrl} remain the source of
         * truth for list views.
         */
        List<ListingImageDTO> images,
        // Agricultural land fields (nullable for non-agri listings)
        String waterSource,
        String soilType,
        String roadAccess,
        String cultivationStatus,
        String ownershipType,
        String surveyNumber,
        // Polygon boundary (null for non-agri listings and list endpoints)
        String boundary,
        /**
         * Approximate plot area in acres, DERIVED at read time from the saved PostGIS
         * {@code boundary} geography via {@code ST_Area(boundary) / 4046.8564224}, rounded
         * HALF_UP to 2 decimals (#1367). Distinct from the broker-declared {@code landArea} —
         * never reads or overwrites it. Populated ONLY on the single-listing path for
         * agricultural_land listings with a saved boundary; null otherwise (incl. list/batch).
         * Serialized as a JSON number, mirroring {@code landArea}.
         */
        BigDecimal computedAreaAcres
) {
    /** Raw regex for Karnataka RERA registration number format (e.g. PRM/KA/2023/0042). */
    public static final String RERA_REGEXP = "^[A-Z]{3}/[A-Z]{2}/\\d{4}/\\d{4}$";
    /** Compiled form of {@link #RERA_REGEXP} — use for read-side matching. */
    public static final Pattern RERA_PATTERN = Pattern.compile(RERA_REGEXP);
}
