package com.example.realestate.discover;

import com.example.realestate.listing.area.AreaNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Computes regional corridor groups (corridor-first cumulative) for a given city and property type.
 *
 * <p>Design (post #1435 refactor):
 * <ul>
 *   <li>Single SQL join: regional_area_classifications ⋈ regional_directions
 *       ⋈ regional_distance_bands ⋈ live agri listing aggregates per area_key.</li>
 *   <li>A second SQL loads city_regional_direction_labels for human-readable group names.</li>
 *   <li>Listing counts and acreage are computed LIVE at request time — they are
 *       NOT read from the classification table (which stores only geometry data).</li>
 *   <li>Groups with zero live listings across all tiers are omitted from the response.</li>
 *   <li>Within each direction, 4 cumulative tiers are built:
 *     <ul>
 *       <li>maxKm=10:  bands [0_10]</li>
 *       <li>maxKm=25:  bands [0_10, 10_25]</li>
 *       <li>maxKm=50:  bands [0_10, 10_25, 25_50]</li>
 *       <li>maxKm=100: bands [0_10, 10_25, 25_50, 50_up]</li>
 *     </ul>
 *     Tiers with zero cumulative listings are omitted.</li>
 *   <li>Ordering: sort_order from labels table ASC; fallback to natural compass order.</li>
 * </ul>
 *
 * <p>NOTE: This endpoint has no dependency on /api/discover/markers or OpenSearch.
 * It reads from Postgres only (regional_area_classifications + property_listings +
 * city_regional_direction_labels).
 * If OpenSearch is later added as a listing source, this service must be updated
 * independently — it intentionally does NOT route through RoutingDiscoverListingsService.
 *
 * <p>SQL-injection guard: all user-supplied values are bound as positional '?' parameters.
 */
@Service
public class RegionalAreaGroupsService {

    private static final Logger log = LoggerFactory.getLogger(RegionalAreaGroupsService.class);

    // Natural compass order for fallback sorting when a direction has no label row.
    private static final List<String> COMPASS_ORDER =
            List.of("N", "NE", "E", "SE", "S", "SW", "W", "NW");

    // Cumulative tier definitions: ordered closest-to-furthest.
    private record TierDef(int maxKm, String label, List<String> bands) {}

    private static final List<TierDef> TIER_DEFS = List.of(
            new TierDef(10,  "Within 10 km",  List.of("0_10")),
            new TierDef(25,  "Up to 25 km",   List.of("0_10", "10_25")),
            new TierDef(50,  "Up to 50 km",   List.of("0_10", "10_25", "25_50")),
            new TierDef(100, "Up to 100 km",  List.of("0_10", "10_25", "25_50", "50_up"))
    );

    private final JdbcOperations jdbcOperations;

    public RegionalAreaGroupsService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Returns regional corridor groups for the given city and property type.
     *
     * @param city         city slug (normalised to lowercase)
     * @param propertyType property type filter (e.g. "agricultural_land")
     * @return response with ordered corridor groups (only groups with &gt;= 1 live listing)
     */
    @Transactional(readOnly = true)
    public RegionalAreaGroupsResponse getRegionalGroups(String city, String propertyType) {
        String normalizedCity = city.toLowerCase();
        String normalizedType = propertyType == null ? "" : propertyType.trim().toLowerCase();
        log.debug("getRegionalGroups city={} propertyType={}", normalizedCity, normalizedType);

        // ── Step 1: fetch classification rows joined with band/direction metadata
        //    and live agri listing counts per area_key.
        //    Only rows where listing_count > 0 are returned (HAVING clause).
        //    Bound args: [propertyType, city_key]
        List<ClassificationRow> rows = jdbcOperations.query(
                REGIONAL_GROUPS_SQL,
                (rs, rowNum) -> new ClassificationRow(
                        rs.getString("area_key"),
                        rs.getString("direction_key"),
                        rs.getInt("direction_sort_order"),
                        rs.getString("band_key"),
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

        // ── Step 3: load direction labels from city_regional_direction_labels.
        //    Returns Map<directionCode, LabelEntry(groupName, sortOrder)>.
        //    Bound arg: [city_key].
        Map<String, LabelEntry> labelsMap = new LinkedHashMap<>();
        jdbcOperations.query(LABELS_SQL,
                (RowCallbackHandler) rs -> labelsMap.put(
                        rs.getString("direction_code"),
                        new LabelEntry(rs.getString("group_name"), rs.getInt("sort_order"))
                ),
                normalizedCity
        );

        // ── Step 4: index classification rows by direction -> band -> area rows.
        //    direction_sort_order from REGIONAL_GROUPS_SQL (regional_directions.sort_order)
        //    is preserved as a fallback ordering field.
        Map<String, DirectionAccumulator> dirAccumulators = new LinkedHashMap<>();
        for (ClassificationRow row : rows) {
            dirAccumulators
                    .computeIfAbsent(row.directionKey(),
                            k -> new DirectionAccumulator(row.directionKey(), row.directionSortOrder()))
                    .addRow(row.bandKey(), row.areaKey(), row.listingCount(),
                            parseableByArea.getOrDefault(row.areaKey(), List.of()));
        }

        // ── Step 5: for each direction build cumulative tiers; compose CorridorGroup.
        List<CorridorGroup> corridors = new ArrayList<>(dirAccumulators.size());
        for (DirectionAccumulator dirAcc : dirAccumulators.values()) {
            List<AvailableMaxDistance> tiers = buildCumulativeTiers(dirAcc);

            if (tiers.isEmpty()) continue; // direction has no live listings in any tier

            String dirCode = dirAcc.directionKey();
            LabelEntry labelEntry = labelsMap.get(dirCode);
            String groupName = labelEntry != null ? labelEntry.groupName() : dirCode + " corridor";
            corridors.add(new CorridorGroup(dirCode, groupName, List.copyOf(tiers)));
        }

        // ── Step 6: sort corridors by label sort_order if available, else compass order.
        corridors.sort((a, b) -> {
            LabelEntry la = labelsMap.get(a.directionCode());
            LabelEntry lb = labelsMap.get(b.directionCode());
            if (la != null && lb != null) return Integer.compare(la.sortOrder(), lb.sortOrder());
            if (la != null) return -1;
            if (lb != null) return 1;
            // both unlabeled: natural compass order
            int ia = COMPASS_ORDER.indexOf(a.directionCode());
            int ib = COMPASS_ORDER.indexOf(b.directionCode());
            if (ia < 0) ia = Integer.MAX_VALUE;
            if (ib < 0) ib = Integer.MAX_VALUE;
            return Integer.compare(ia, ib);
        });

        log.debug("getRegionalGroups city={} returned {} corridors", normalizedCity, corridors.size());
        return new RegionalAreaGroupsResponse(normalizedCity, List.copyOf(corridors));
    }

    // ── Tier construction ─────────────────────────────────────────────────────

    private static List<AvailableMaxDistance> buildCumulativeTiers(DirectionAccumulator dirAcc) {
        Map<String, BandData> bands = dirAcc.bands();
        List<AvailableMaxDistance> tiers = new ArrayList<>(TIER_DEFS.size());
        for (TierDef tier : TIER_DEFS) {
            long cumCount = 0;
            List<BigDecimal> cumAcres = new ArrayList<>();
            boolean anyAcreage = false;
            LinkedHashSet<String> cumAreaKeys = new LinkedHashSet<>();

            for (String bandCode : tier.bands()) {
                BandData band = bands.get(bandCode);
                if (band == null) continue;
                cumCount += band.listingCount();
                if (!band.acreage().isEmpty()) {
                    cumAcres.addAll(band.acreage());
                    anyAcreage = true;
                }
                cumAreaKeys.addAll(band.areaKeys());
            }

            if (cumCount == 0) continue; // suppress empty tier

            Double acreage = anyAcreage ? sumParseableAcres(cumAcres) : null;
            tiers.add(new AvailableMaxDistance(
                    tier.maxKm(),
                    tier.label(),
                    List.copyOf(tier.bands()),
                    cumCount,
                    acreage,
                    List.copyOf(cumAreaKeys)
            ));
        }
        return tiers;
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
            int directionSortOrder,
            String bandKey,
            long listingCount
    ) {}

    private record LabelEntry(String groupName, int sortOrder) {}

    private record BandData(long listingCount, List<BigDecimal> acreage, List<String> areaKeys) {}

    private static final class DirectionAccumulator {
        private final String directionKey;
        private final int directionSortOrder;
        // band_key -> accumulated data for that band
        private final Map<String, MutableBandData> bandMap = new LinkedHashMap<>();

        DirectionAccumulator(String directionKey, int directionSortOrder) {
            this.directionKey = directionKey;
            this.directionSortOrder = directionSortOrder;
        }

        void addRow(String bandKey, String areaKey, long listingCount, List<BigDecimal> acres) {
            bandMap.computeIfAbsent(bandKey, k -> new MutableBandData())
                    .add(areaKey, listingCount, acres);
        }

        String directionKey() { return directionKey; }

        /** Returns an immutable snapshot of band_key -> BandData. */
        Map<String, BandData> bands() {
            Map<String, BandData> result = new LinkedHashMap<>();
            for (Map.Entry<String, MutableBandData> e : bandMap.entrySet()) {
                MutableBandData m = e.getValue();
                result.put(e.getKey(), new BandData(
                        m.listingCount,
                        List.copyOf(m.acreage),
                        List.copyOf(m.areaKeys)
                ));
            }
            return result;
        }

        private static final class MutableBandData {
            long listingCount = 0;
            final List<BigDecimal> acreage = new ArrayList<>();
            final List<String> areaKeys = new ArrayList<>();

            void add(String areaKey, long count, List<BigDecimal> acres) {
                areaKeys.add(areaKey);
                listingCount += count;
                acreage.addAll(acres);
            }
        }
    }

    // ── SQL ───────────────────────────────────────────────────────────────────

    /**
     * Single join: regional_area_classifications ⋈ regional_directions
     *             ⋈ regional_distance_bands ⋈ live agri listing aggregates.
     *
     * <p>Only areas with >= 1 live listing are returned (WHERE listing_count > 0 via subquery).
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
                rd.sort_order AS direction_sort_order,
                rac.distance_band_key AS band_key,
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
            ORDER BY rd.sort_order ASC, rdb.sort_order ASC
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

    /**
     * Loads direction labels from city_regional_direction_labels.
     * Returns rows ordered by sort_order ASC so the map insertion order matches
     * desired display order.
     * Bound arg: [city_key].
     */
    private static final String LABELS_SQL =
            "SELECT direction_code, group_name, sort_order FROM city_regional_direction_labels " +
            "WHERE city_key = ? ORDER BY sort_order ASC";
}
