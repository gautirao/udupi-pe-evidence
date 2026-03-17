package com.example.realestate.listing.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
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
        boolean reraValid
) {
    /** Karnataka RERA registration number format (e.g. PRM/KA/2023/0042). */
    public static final Pattern RERA_PATTERN =
            Pattern.compile("^[A-Z]{3}/[A-Z]{2}/\\d{4}/\\d{4}$");
}
