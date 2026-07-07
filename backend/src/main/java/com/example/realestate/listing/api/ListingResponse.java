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
        /**
         * Computed trust tier: A, B, C, or D. Null only for legacy rows before V46.
         *
         * <p>#1786: this is the RAW internal grade. It is populated ONLY on internal
         * admin/owner responses ({@link ListingResponseMapper#toResponse}); public responses
         * ({@link ListingResponseMapper#toPublicResponse}) always null this out and populate
         * {@link #trustBadge} instead — never expose the raw letter grade to public callers.
         */
        String trustTier,
        /**
         * #1786: public-safe projected trust badge word (one of {@code verified}/{@code trusted}/
         * {@code listed}), or {@code null} if no badge should be shown. Populated ONLY on public
         * listing responses via {@link com.example.realestate.discover.TrustBadge#publicBadge},
         * projected from the raw {@link #trustTier}. Always {@code null} on internal admin/owner
         * responses, which carry the raw grade in {@link #trustTier} instead.
         */
        String trustBadge,
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
        String landCategory,
        Boolean farmhouseAvailable,
        Boolean fencingDone,
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
        BigDecimal computedAreaAcres,
        // Residential typed listing fields (M38-13A / #1626) — nullable, honest-null.
        // Never defaulted to false/empty at this layer; a null boolean means "not declared".
        Integer bathrooms,
        Integer balconies,
        String facing,
        String availabilityTimeline,
        BigDecimal superBuiltArea,
        String superBuiltAreaUnit,
        String propertyAge,
        String residentialWaterSource,
        Integer parking2wCount,
        Integer parking4wCount,
        BigDecimal roadWidthFt,
        String plotDimensions,
        String conversionStatus,
        String khataNumber,
        String propertyTaxPid,
        String approvingAuthority,
        String projectName,
        String builderName,
        Long maintenancePaise,
        Boolean hasLift,
        Boolean hasPowerBackup,
        Boolean isGated,
        Boolean hasGarden,
        Boolean hasTerrace,
        Boolean hasCompound,
        Boolean hasServantRoom,
        Boolean isCornerPlot,
        Boolean hasBoundaryWall,
        Boolean isGatedLayout,
        Boolean hasWaterConnection,
        Boolean hasElectricityConnection,
        Boolean hasDrainage,
        Boolean priceNegotiable,
        Boolean rentNegotiable,
        Boolean petsAllowed,
        Boolean maintenanceIncluded,
        /**
         * Multi-select child sets. Populated ONLY on the single-listing detail path
         * (mirrors {@link #images}); list/batch endpoints always set these to empty lists.
         */
        List<String> amenities,
        List<String> specialLocationViews,
        List<String> preferredTenants,
        // Commercial typed listing fields (M38-FU2 / #1730) — nullable, honest-null.
        // commercialSubtype is null for legacy commercial rows (V102 backfill) and for
        // any-ambiguity 'commercial' listings never given a subtype on write.
        String commercialSubtype,
        String floorChoice,
        String floorMode,
        String hubType,
        Integer washroomsPublic,
        Integer washroomsPrivate,
        Integer parkingPublicCount,
        Integer parkingPrivateCount,
        Integer officeSeats,
        Integer officeCabins,
        Integer officeMeetingRooms,
        String occupancyStatus,
        BigDecimal powerLoadKva,
        BigDecimal warehouseClearHeightFt,
        Integer warehouseLoadingBays,
        Boolean warehouseTruckAccess,
        String warehouseFlooring,
        String commercialZoning,
        String commercialOwnership,
        String commercialApprovals,
        BigDecimal expectedRentalYieldPct,
        Long currentMonthlyIncomePaise,
        Integer leaseTermMonths,
        BigDecimal leaseEscalationPct,
        String commercialFurnishingStatus,
        String commercialAvailability,
        String commercialAreaUnit,
        /**
         * Multi-select child sets. Populated ONLY on the single-listing detail path
         * (mirrors {@link #amenities}); list/batch endpoints always set these to empty lists.
         */
        List<String> suitableUses,
        List<String> utilities
) {
    /** Raw regex for Karnataka RERA registration number format (e.g. PRM/KA/2023/0042). */
    public static final String RERA_REGEXP = "^[A-Z]{3}/[A-Z]{2}/\\d{4}/\\d{4}$";
    /** Compiled form of {@link #RERA_REGEXP} — use for read-side matching. */
    public static final Pattern RERA_PATTERN = Pattern.compile(RERA_REGEXP);
}
