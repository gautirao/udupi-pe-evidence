package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Response body for GET /api/discover/cities/{citySlug}/regions (#1882 Track A PR1).
 *
 * <p>Unknown {@code citySlug} yields {@code regions = []} with {@code cityId = null} — 200 OK,
 * never a 404 — mirroring {@link DiscoverSummaryController}'s unknown-city contract.
 *
 * @param cityId   resolved city id, or {@code null} if citySlug is unknown
 * @param citySlug echoed back as-received
 * @param regions  materialized regions in stable displayOrder, including zero-listing regions;
 *                 empty when the city is unknown OR has not been onboarded yet (no city_regions rows)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RegionSummaryResponse(
        Integer cityId,
        String citySlug,
        List<Region> regions
) {

    /**
     * @param countStatus              always {@code "OK"} in PR1 — reserved for a future
     *                                 OpenSearch-backed cutover where a degraded/stale count
     *                                 could be surfaced without a response-shape change
     * @param boundsStatus             {@code "COMPLETE"} if every member area contributed a
     *                                 complete, valid bbox to this region's bounds union;
     *                                 {@code "APPROXIMATE"} if one or more member areas lacked
     *                                 one and fell back to their centroid point instead. Derived
     *                                 at read time — not persisted. See #1882 / #1887.
     * @param missingBoundsAreaCount   count of this region's member areas that lacked a
     *                                 complete, valid bbox (i.e. fell back to centroid). 0 when
     *                                 {@code boundsStatus == "COMPLETE"} (including zero-member
     *                                 regions).
     */
    public record Region(
            String key,
            String label,
            int displayOrder,
            Bounds bounds,
            Centre centre,
            long areaCount,
            long listingCount,
            String countStatus,
            String boundsStatus,
            long missingBoundsAreaCount
    ) {}

    public record Bounds(Double minLat, Double maxLat, Double minLon, Double maxLon) {}

    public record Centre(Double lat, Double lon) {}
}
