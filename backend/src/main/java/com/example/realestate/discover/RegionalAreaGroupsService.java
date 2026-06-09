package com.example.realestate.discover;

import com.example.realestate.listing.area.AreaNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Computes regional area groups for a given city and property type.
 *
 * <p>Design:
 * <ul>
 *   <li>Single SQL join: regional_area_classifications ⋈ regional_directions
 *       ⋈ regional_distance_bands ⋈ live agri listing aggregates per area_key.</li>
 *   <li>Listing counts and acreage are computed LIVE at request time — they are
 *       NOT read from the classification table (which stores only geometry data).</li>
 *   <li>Groups with zero live listings are omitted from the response.</li>
 *   <li>Ordering: band sort_order ASC, then direction sort_order ASC.</li>
 *   <li>Label composed at request time, e.g. "North of Udupi · 10–25 km".</li>
 * </ul>
 *
 * <p>NOTE: This endpoint has no dependency on /api/discover/markers or OpenSearch.
 * It reads from Postgres only (regional_area_classifications + property_listings).
 * If OpenSearch is later added as a listing source, this service must be updated
 * independently — it intentionally does NOT route through RoutingDiscoverListingsService.
 *
 * <p>SQL-injection guard: all user-supplied values are bound as positional '?' parameters.
 */
@Service
public class RegionalAreaGroupsService {

    private static final Logger log = LoggerFactory.getLogger(RegionalAreaGroupsService.class);

    private final JdbcOperations jdbcOperations;

    public RegionalAreaGroupsService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Returns regional area groups for the given city and property type.
     *
     * @param city         city slug (normalised to lowercase)
     * @param propertyType property type filter (e.g. "agricultural_land")
     * @return response with ordered groups (only groups with ≥ 1 live listing)
     */
    @Transactional(readOnly = true)
    public RegionalAreaGroupsResponse getRegionalGroups(String city, String propertyType) {
        String normalizedCity = city.toLowerCase();
        String normalizedType = propertyType == null ? "" : propertyType.trim().toLowerCase();
        log.debug("getRegionalGroups city={} propertyType={}", normalizedCity, normalizedType);

        // ── Step 1: fetch classification rows joined with band/direction metadata
        //    and live agri listing counts per area_key.
        //    Only rows where listing_count > 0 are returned (HAVING clause).
        //    Ordering: band sort_order ASC, direction sort_order ASC.
        // Bound args for REGIONAL_GROUPS_SQL: [propertyType, city_key]
        // propertyType feeds the LOWER(?) in the listing subquery; city_key feeds WHERE rac.city_key = ?
        List<ClassificationRow> rows = jdbcOperations.query(
                REGIONAL_GROUPS_SQL,
                (rs, rowNum) -> new ClassificationRow(
                        rs.getString("area_key"),
                        rs.getString("direction_key"),
                        rs.getString("direction_label"),
                        rs.getInt("direction_sort_order"),
                        rs.getString("band_key"),
                        rs.getString("band_label"),
                        rs.getInt("band_sort_order"),
                        rs.getLong("listing_count")
                ),
                normalizedType, normalizedCity
        );

        if (rows.isEmpty()) {
            log.debug("getRegionalGroups city={} — no classification rows with live listings", normalizedCity);
            return new RegionalAreaGroupsResponse(normalizedCity, List.of());
        }

        // ── Step 2: fetch (area_key, land_area, land_area_unit) for acreage computation.
        //    Same approved-only guards as counts — mirrored exactly from AreaSummaryService.
        //    Bound args: [propertyType, city].
        Map<String, List<BigDecimal>> parseableByArea = new HashMap<>();
        jdbcOperations.query(AGRI_AREA_LAND_SQL,
                rs -> {
                    String areaKey = rs.getString("area_key");
                    BigDecimal landArea = rs.getBigDecimal("land_area");
                    String unit = rs.getString("land_area_unit");
                    AreaNormalizer.NormalizedArea normalized = AreaNormalizer.normalize(landArea, unit);
                    BigDecimal acres = AreaNormalizer.sqmToAcres(normalized.areaSqm());
                    if (acres != null) {
                        parseableByArea.computeIfAbsent(areaKey, k -> new ArrayList<>()).add(acres);
                    }
                },
                normalizedType, normalizedCity
        );

        // ── Step 3: fold rows into groups keyed by (band_key, direction_key).
        //    LinkedHashMap preserves the SQL ORDER BY (band sort_order, direction sort_order).
        Map<String, GroupAccumulator> accumulators = new LinkedHashMap<>();
        for (ClassificationRow row : rows) {
            String groupKey = row.bandKey() + "|" + row.directionKey();
            GroupAccumulator acc = accumulators.computeIfAbsent(groupKey,
                    k -> new GroupAccumulator(
                            row.directionKey(), row.directionLabel(), row.directionSortOrder(),
                            row.bandKey(), row.bandLabel(), row.bandSortOrder()
                    )
            );
            acc.addArea(row.areaKey(), row.listingCount(),
                    parseableByArea.getOrDefault(row.areaKey(), List.of()));
        }

        // ── Step 4: compose DTOs.
        List<RegionalAreaGroup> groups = new ArrayList<>(accumulators.size());
        for (GroupAccumulator acc : accumulators.values()) {
            if (acc.totalListingCount() == 0) continue; // belt-and-suspenders (HAVING already filters)
            String label = composeLabel(acc.directionLabel(), normalizedCity, acc.bandLabel());
            Double acreage = acc.totalAcreage();
            groups.add(new RegionalAreaGroup(
                    label,
                    acc.directionKey(),
                    acc.bandKey(),
                    acc.totalListingCount(),
                    acreage,
                    List.copyOf(acc.areaKeys())
            ));
        }

        log.debug("getRegionalGroups city={} returned {} groups", normalizedCity, groups.size());
        return new RegionalAreaGroupsResponse(normalizedCity, List.copyOf(groups));
    }

    // ── Label composition ─────────────────────────────────────────────────────

    /**
     * Composes a human-readable group label.
     * Example: directionLabel="North", city="udupi", bandLabel="10–25 km"
     *          → "North of Udupi · 10–25 km"
     */
    static String composeLabel(String directionLabel, String citySlug, String bandLabel) {
        String cityDisplay = Character.toUpperCase(citySlug.charAt(0)) + citySlug.substring(1);
        return directionLabel + " of " + cityDisplay + " · " + bandLabel;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Double sumParseableAcres(List<BigDecimal> acres) {
        if (acres.isEmpty()) return null;
        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal a : acres) {
            sum = sum.add(a);
        }
        return sum.doubleValue();
    }

    // ── Private row/accumulator types ────────────────────────────────────────

    private record ClassificationRow(
            String areaKey,
            String directionKey,
            String directionLabel,
            int directionSortOrder,
            String bandKey,
            String bandLabel,
            int bandSortOrder,
            long listingCount
    ) {}

    private static final class GroupAccumulator {
        private final String directionKey;
        private final String directionLabel;
        private final int directionSortOrder;
        private final String bandKey;
        private final String bandLabel;
        private final int bandSortOrder;
        private final List<String> areaKeys = new ArrayList<>();
        private long totalListingCount = 0;
        private final List<BigDecimal> allAcres = new ArrayList<>();

        GroupAccumulator(String directionKey, String directionLabel, int directionSortOrder,
                         String bandKey, String bandLabel, int bandSortOrder) {
            this.directionKey = directionKey;
            this.directionLabel = directionLabel;
            this.directionSortOrder = directionSortOrder;
            this.bandKey = bandKey;
            this.bandLabel = bandLabel;
            this.bandSortOrder = bandSortOrder;
        }

        void addArea(String areaKey, long listingCount, List<BigDecimal> parsedAcres) {
            areaKeys.add(areaKey);
            totalListingCount += listingCount;
            allAcres.addAll(parsedAcres);
        }

        String directionKey()       { return directionKey; }
        String directionLabel()     { return directionLabel; }
        int directionSortOrder()    { return directionSortOrder; }
        String bandKey()            { return bandKey; }
        String bandLabel()          { return bandLabel; }
        int bandSortOrder()         { return bandSortOrder; }
        List<String> areaKeys()     { return areaKeys; }
        long totalListingCount()    { return totalListingCount; }

        /** Returns sum of parseable acreage, or null if no parseable rows. */
        Double totalAcreage() {
            return sumParseableAcres(allAcres);
        }
    }

    // ── SQL ───────────────────────────────────────────────────────────────────

    /**
     * Single join: regional_area_classifications ⋈ regional_directions
     *             ⋈ regional_distance_bands ⋈ live agri listing aggregates.
     *
     * <p>Only areas with ≥ 1 live listing are returned (WHERE listing_count > 0 via subquery).
     * Bound args: [propertyType (for LOWER in subquery), city_key].
     *
     * <p>Live-listing guards mirror AreaSummaryService exactly:
     *   status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
     *   AND LOWER(property_type) = LOWER(?) AND array_length(string_to_array(area_key,'|'),1) = 4
     */
    private static final String REGIONAL_GROUPS_SQL = """
            SELECT
                rac.area_key,
                rac.direction_key,
                rd.label      AS direction_label,
                rd.sort_order AS direction_sort_order,
                rac.distance_band_key AS band_key,
                rdb.label     AS band_label,
                rdb.sort_order AS band_sort_order,
                COALESCE(agg.listing_count, 0) AS listing_count
            FROM regional_area_classifications rac
            JOIN regional_directions rd
                ON rd.direction_key = rac.direction_key
            JOIN regional_distance_bands rdb
                ON rdb.band_key = rac.distance_band_key
            LEFT JOIN (
                SELECT pl.area_key, COUNT(*) AS listing_count
                FROM property_listings pl
                WHERE pl.status = 'LIVE'
                  AND pl.archived_at IS NULL
                  AND pl.is_duplicate = false
                  AND LOWER(pl.property_type) = LOWER(?)
                  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
                GROUP BY pl.area_key
            ) agg ON agg.area_key = rac.area_key
            WHERE rac.city_key = ?
              AND COALESCE(agg.listing_count, 0) > 0
            ORDER BY rdb.sort_order ASC, rd.sort_order ASC
            """;

    /**
     * Fetches (area_key, land_area, land_area_unit) for acreage computation.
     * Mirrors AGRI_AREA_LAND_SQL in AreaSummaryService exactly:
     *   same approved-only + property_type guards so acreage set = counted set.
     * Bound args: [propertyType, city].
     */
    private static final String AGRI_AREA_LAND_SQL = """
            SELECT pl.area_key, pl.land_area, pl.land_area_unit
            FROM property_listings pl
            JOIN areas a ON a.area_key = pl.area_key
            JOIN cities c ON c.id = a.city_id
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND LOWER(pl.property_type) = LOWER(?)
              AND c.slug = ?
              AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
            """;
}
