package com.example.realestate.area;

import java.util.List;
import java.util.Map;

/**
 * Response DTO for GET /api/public/areas/{areaKey}/overview.
 *
 * <p>snapshot and fallback are mutually exclusive:
 * <ul>
 *   <li>confidence=full|limited → snapshot non-null, fallback null, activity non-null</li>
 *   <li>confidence=fallback     → snapshot from district row (or null if district row missing),
 *                                 fallback non-null, activity null</li>
 * </ul>
 */
public record AreaOverviewResponse(
        String areaKey,
        String areaLabel,
        String districtKey,
        String districtLabel,
        String confidence,
        Integer listingCount90d,
        SnapshotData snapshot,
        FallbackData fallback,
        List<ComparisonEntry> comparison,
        List<SchoolEntry> schools,
        ActivityData activity
) {

    public record SnapshotData(
            Long medianPricePaise,
            Long priceP10Paise,
            Long priceP90Paise,
            Map<String, Double> propertyTypeDist,
            String trendDirection,
            Double trendPctChange
    ) {}

    public record FallbackData(
            String level,
            String districtKey,
            String districtLabel,
            Integer listingCount90d
    ) {}

    public record ComparisonEntry(
            String areaKey,
            String areaLabel,
            Long medianPricePaise,
            Integer listingCount90d,
            String trendDirection,
            Boolean isApproximate
    ) {}

    public record SchoolEntry(
            String id,
            String name,
            Double distanceKm,
            String board,
            String prominenceTier
    ) {}

    public record ActivityData(
            Integer activeCount,
            Integer new30d
    ) {}
}
