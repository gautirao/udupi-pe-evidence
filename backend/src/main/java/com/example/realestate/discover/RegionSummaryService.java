package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Read model for GET /api/discover/cities/{citySlug}/regions (#1882 Track A PR1).
 *
 * <p>Serves entirely from the Postgres materialization built by
 * {@link CityRegionOnboardingService#apply(int)} — {@code city_regions} +
 * {@code city_region_memberships} — never recomputing the projection at read time.
 *
 * <p>{@code listingCount} reuses {@link DiscoverListingPredicateBuilder#build}, the SAME
 * guarded predicate (LIVE, not archived, not duplicate) used by
 * {@link DiscoverSummaryService}, so region counts reconcile with the rest of the discover
 * read path. The 4-segment {@code area_key} guard is enforced implicitly here: only 4-segment
 * areas ever get a {@code city_region_memberships} row (mirrors
 * {@code RegionalClassificationBackfillService}'s eligibility filter), so no separate guard is
 * needed on the listings join.
 *
 * <p>{@code countStatus} is always {@code "OK"} in PR1 — reserved for a future OpenSearch
 * cutover (#1882 Track B) that could report a degraded/stale count without changing the
 * response shape.
 *
 * <p>{@code boundsStatus} / {@code missingBoundsAreaCount} are derived at read time from the
 * SAME per-area bbox-completeness predicate ({@link CityRegionProjection#hasCompleteValidBbox})
 * that {@link CityRegionOnboardingService#apply(int)} already uses to decide whether a member
 * area's bbox or its centroid gets unioned into a region's bounds — no new column, no change to
 * that aggregate-bounds math, purely a surfaced read of an existing fact.
 *
 * <p>#1882 consumes existing canonical areas and their bounds. Completeness of the city area
 * catalogue and correction of missing bounds belong to #1887.
 *
 * <p>{@code listingPurpose} (#1882 rework, ADVISORY-1) is an independent optional filter applied
 * ONLY to {@code listingCount} — {@code "sale"}/{@code "rent"} — passed to the shared
 * {@link DiscoverListingPredicateBuilder}'s {@code listingPurpose} predicate exactly as
 * {@link DiscoverSummaryService} does. See {@link #normalizeListingPurpose(String)}: since the
 * #1956 PR1 review correction both delegate to the ONE shared
 * {@link DiscoverFilterNormalizer#normalizePurpose} rather than each mirroring their own copy of
 * the allowed set. Region geometry/membership/ordering/{@code boundsStatus} are entirely unaffected;
 * only the {@code pl} JOIN predicate (and therefore {@code listing_count}) changes.
 */
@Service
public class RegionSummaryService {

    private static final Logger log = LoggerFactory.getLogger(RegionSummaryService.class);

    // The allowed listingPurpose vocabulary (#1882 rework) is no longer duplicated here: it lives
    // ONCE in DiscoverFilterNormalizer (#1956 PR1 review correction), which every Discover surface
    // — listings, markers, counts, summary, regions, groups — now shares. The values still mirror
    // the chk_listing_purpose CHECK constraint from V32.

    private final JdbcOperations jdbcOperations;

    public RegionSummaryService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Backward-compatible overload — omitted {@code listingPurpose} = current (blended)
     * behaviour. Keeps every pre-#1882-rework caller (e.g. {@code
     * CityRegionOnboardingRegenerationIT}, a PR1 file out of this rework's scope) source- and
     * behaviour-compatible without modification.
     */
    @Transactional(readOnly = true)
    public RegionSummaryResponse getRegions(String citySlug) {
        return getRegions(citySlug, null);
    }

    @Transactional(readOnly = true)
    public RegionSummaryResponse getRegions(String citySlug, String listingPurpose) {
        Integer cityId = jdbcOperations.query(
                "SELECT id FROM cities WHERE slug = ? AND is_active = true",
                rs -> rs.next() ? rs.getInt("id") : null,
                citySlug);

        if (cityId == null) {
            log.debug("getRegions: unknown citySlug={} — returning empty regions", citySlug);
            return new RegionSummaryResponse(null, citySlug, List.of());
        }

        String normalizedPurpose = normalizeListingPurpose(listingPurpose);
        log.debug("getRegions citySlug={} listingPurpose={}", citySlug, normalizedPurpose);

        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                citySlug, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, normalizedPurpose, null, null
        );
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(filters);

        StringBuilder sb = new StringBuilder("""
                SELECT cr.region_key AS region_key, cr.display_label AS display_label,
                       cr.display_order AS display_order,
                       cr.min_lat AS min_lat, cr.max_lat AS max_lat,
                       cr.min_lon AS min_lon, cr.max_lon AS max_lon,
                       cr.centre_lat AS centre_lat, cr.centre_lon AS centre_lon,
                       COUNT(DISTINCT crm.area_key) AS area_count,
                       COUNT(DISTINCT crm.area_key) FILTER (
                           WHERE crm.area_key IS NOT NULL AND NOT (
                               a.min_lat IS NOT NULL AND a.max_lat IS NOT NULL
                               AND a.min_lon IS NOT NULL AND a.max_lon IS NOT NULL
                           )
                       ) AS missing_bounds_area_count,
                       COUNT(pl.id) AS listing_count
                FROM city_regions cr
                LEFT JOIN city_region_memberships crm
                       ON crm.city_id = cr.city_id AND crm.region_key = cr.region_key
                LEFT JOIN areas a
                       ON a.area_key = crm.area_key
                LEFT JOIN property_listings pl
                       ON pl.area_key = crm.area_key
                      AND
                """)
                .append(sql.whereFragment())
                .append("""

                WHERE cr.city_id = ?
                GROUP BY cr.region_key, cr.display_label, cr.display_order,
                         cr.min_lat, cr.max_lat, cr.min_lon, cr.max_lon,
                         cr.centre_lat, cr.centre_lon
                ORDER BY cr.display_order
                """);

        List<Object> params = new ArrayList<>(sql.params());
        params.add(cityId);

        List<RegionSummaryResponse.Region> regions = jdbcOperations.query(sb.toString(),
                (rs, rowNum) -> {
                    long missingBoundsAreaCount = rs.getLong("missing_bounds_area_count");
                    return new RegionSummaryResponse.Region(
                            rs.getString("region_key"),
                            rs.getString("display_label"),
                            rs.getInt("display_order"),
                            new RegionSummaryResponse.Bounds(
                                    nullableDouble(rs.getObject("min_lat")),
                                    nullableDouble(rs.getObject("max_lat")),
                                    nullableDouble(rs.getObject("min_lon")),
                                    nullableDouble(rs.getObject("max_lon"))),
                            new RegionSummaryResponse.Centre(
                                    nullableDouble(rs.getObject("centre_lat")),
                                    nullableDouble(rs.getObject("centre_lon"))),
                            rs.getLong("area_count"),
                            rs.getLong("listing_count"),
                            "OK",
                            missingBoundsAreaCount == 0 ? "COMPLETE" : "APPROXIMATE",
                            missingBoundsAreaCount
                    );
                },
                params.toArray());

        return new RegionSummaryResponse(cityId, citySlug, regions);
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    /**
     * Normalises {@code listingPurpose} (#1882 rework) — blank/whitespace-only values and any value
     * outside the allowed vocabulary fall back to {@code null} (blended, all-purposes), matching the
     * repo's established invalid-purpose handling (silently ignored, not a 400).
     *
     * <p>Package-private (not {@code private}) so {@link AreaGroupsService} (#1910 PR1) can reuse
     * this exact validation for its region-scoped groups endpoint's {@code listingPurpose} param
     * without reimplementing it.
     *
     * <p><b>Delegates to {@link DiscoverFilterNormalizer#normalizePurpose}</b> (#1956 PR1 review
     * correction). This method used to own an exact-match allowlist, so {@code ?listingPurpose=SALE}
     * produced BLENDED region/group counts beside a sale-only listings result — the same
     * count-overstates-its-results defect AC1.16 closes. Allowlisting semantics are otherwise
     * unchanged; only the casing tolerance is new.
     */
    static String normalizeListingPurpose(String listingPurpose) {
        return DiscoverFilterNormalizer.normalizePurpose(listingPurpose);
    }
}
