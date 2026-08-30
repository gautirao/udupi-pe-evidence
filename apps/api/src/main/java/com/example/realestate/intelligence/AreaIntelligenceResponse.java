package com.example.realestate.intelligence;

import java.util.List;

/**
 * Response DTO for one area row returned by GET /api/admin/intelligence/areas.
 *
 * <p>Null-safety invariants:
 * <ul>
 *   <li>{@code avgQualityScore} is null when no listings in this area have been scored
 *       (backfill-incomplete). MUST NOT be coerced to 0.</li>
 *   <li>{@code demandEventCount} is null when the area's demand total is below
 *       {@link AggregationConstants#K_ANON_MIN} (k-anonymity suppressed) or when the
 *       area is absent from {@code area_demand_signal}. NEVER emit 0.</li>
 *   <li>{@code topGaps} is an empty list when the area has no non-suppressed
 *       ({@code gap_score IS NOT NULL}) buckets or is absent from {@code area_demand_signal}.
 *       Never null — callers may iterate directly.</li>
 *   <li>{@code areaLabel} and {@code district} may be null for areas without metadata.</li>
 * </ul>
 *
 * @param areaKey            canonical area key, e.g. {@code IN|KA|Udupi|Manipal}
 * @param areaLabel          human-readable label; nullable
 * @param district           3rd pipe-segment of areaKey; nullable if areaKey is malformed
 * @param live90dCount       count of LIVE-90d listings (always >= 1 since grouped)
 * @param scoredListingCount count of listings with non-null quality_score in the LIVE-90d set
 * @param avgQualityScore    AVG(quality_score) where quality_score IS NOT NULL; null if none scored
 * @param confidence         confidence label derived from live90dCount (full/limited/insufficient)
 * @param demandEventCount   SUM of all demand events (search + panel_open + lead_intent) across
 *                           buckets in the latest 30-day window; null when suppressed below
 *                           {@link AggregationConstants#K_ANON_MIN} or area absent from signal table
 * @param topGaps            top-3 non-suppressed gap buckets ordered by gap_score DESC (stable
 *                           tie-break); empty list when none exist or area absent from signal table
 */
public record AreaIntelligenceResponse(
        String areaKey,
        String areaLabel,
        String district,
        int live90dCount,
        int scoredListingCount,
        Double avgQualityScore,
        String confidence,
        Integer demandEventCount,
        List<AreaTopGap> topGaps
) {
}
