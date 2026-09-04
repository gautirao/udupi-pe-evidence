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
 * @param polygonSearchAvailable
 *        Issue #2419 (PR-2) — whether this city has a VALID canonical CITY boundary, so the
 *        client can hide the "Draw search area" entry where a drawn polygon could never be
 *        accepted.
 *
 *        <p>Read-only projection of a fact the client otherwise has no way to learn:
 *        {@code canonical_boundary_geometry} is backend-only, and
 *        {@link PolygonGeographicSafetyPolicy} FAILS CLOSED when a city has no VALID CITY row,
 *        so without this signal every polygon in such a city is rejected only AFTER the shopper
 *        has drawn it.
 *
 *        <p>Deliberately a boolean rather than the geometry, the status enum, or a row count:
 *        the client's only question is "could a polygon be accepted here at all", and exposing
 *        more would invite the frontend to re-derive a policy #2420 owns. It is NOT a substitute
 *        for that validation — the server still rejects an out-of-bounds or over-broad polygon
 *        on commit.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverSummaryResponse(
        String city,
        String propertyType,
        String groupBy,
        long totalActiveListings,
        List<RegionCount> regions,
        List<Hotspot> hotspots,
        Instant generatedAt,
        boolean polygonSearchAvailable
) {

    /**
     * Back-compat constructor for call sites that predate {@code polygonSearchAvailable}
     * (fixtures, and the routing/rate-limit tests that only care about the count fields).
     *
     * <p>Defaults to {@code false} — the CONSERVATIVE value: the client reads it as "do not
     * offer the draw entry", so a caller that has not been taught about the flag can only
     * withhold a feature, never advertise one the server would then refuse. Production builds
     * this record through the canonical constructor with a real answer; see
     * {@code DiscoverSummaryService#hasValidCityBoundary}.
     */
    public DiscoverSummaryResponse(
            String city,
            String propertyType,
            String groupBy,
            long totalActiveListings,
            List<RegionCount> regions,
            List<Hotspot> hotspots,
            Instant generatedAt
    ) {
        this(city, propertyType, groupBy, totalActiveListings, regions, hotspots, generatedAt, false);
    }

    public record RegionCount(String regionKey, String regionLabel, long listingCount) {}

    public record Hotspot(
            String areaKey,
            String name,
            long listingCount,
            Double geoCenterLat,
            Double geoCenterLon
    ) {}
}
