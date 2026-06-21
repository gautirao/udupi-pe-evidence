package com.example.realestate.intelligence;

import java.util.List;

/**
 * Response DTO for one area row returned by GET /api/admin/intelligence/areas.
 *
 * <p>Null-safety invariants:
 * <ul>
 *   <li>{@code avgQualityScore} is null when no listings in this area have been scored
 *       (backfill-incomplete). MUST NOT be coerced to 0.</li>
 *   <li>{@code demandEventCount} and {@code topGaps} are ALWAYS null in this release (M30
 *       not yet populated). Never emit 0; never fabricate values.</li>
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
 * @param demandEventCount   always null — M30 not populated
 * @param topGaps            always null — M30 not populated
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
        List<String> topGaps
) {
}
