package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/**
 * Response body for GET /api/discover/summary (#1745 P5).
 *
 * @param city                 city slug echoed back
 * @param propertyType         echoed singular property type filter; {@code null} (omitted) when blended
 * @param groupBy              region grouping axis echoed back ({@code "area_group"} or {@code "corridor"})
 * @param totalActiveListings  count over the guarded predicate (LIVE, not archived, not duplicate,
 *                             4-segment area_key, optional property type)
 * @param regions              per-region counts, ordered count DESC then label ASC
 * @param hotspots             top-N areas by count, ordered count DESC, then name ASC, then areaKey ASC
 * @param generatedAt          freshness hint — instant this response was computed
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverSummaryResponse(
        String city,
        String propertyType,
        String groupBy,
        long totalActiveListings,
        List<RegionCount> regions,
        List<Hotspot> hotspots,
        Instant generatedAt
) {

    public record RegionCount(String regionKey, String regionLabel, long listingCount) {}

    public record Hotspot(
            String areaKey,
            String name,
            long listingCount,
            Double geoCenterLat,
            Double geoCenterLon
    ) {}
}
