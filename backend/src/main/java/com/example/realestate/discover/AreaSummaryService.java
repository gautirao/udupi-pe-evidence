package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.listing.area.AreaNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AreaSummaryService {

    private static final Logger log = LoggerFactory.getLogger(AreaSummaryService.class);

    private final JdbcOperations jdbcOperations;

    public AreaSummaryService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Returns all areas for the given city slug with blended (all-property-type) listing counts.
     * Backwards-compatible overload — equivalent to no {@code propertyType} filter.
     */
    public AreaSummaryResponse getAreasByCity(String city) {
        return getAreasByCity(city, null);
    }

    /**
     * Returns all areas for the given city slug.
     *
     * <p>When {@code propertyType} is non-blank (#1371), the per-area listing count is scoped to
     * approved listings of that type (retaining the LIVE / not-archived / not-duplicate guards) and
     * an additive per-area {@code agriAcreage} is computed in Java from the matching listings'
     * {@code land_area}/{@code land_area_unit} via {@link AreaNormalizer}. When blank, the legacy
     * blended path runs byte-identically (no acreage computed, no extra query).
     *
     * @param city         city slug
     * @param propertyType optional singular property type (e.g. {@code agricultural_land}); blank → no filter
     */
    public AreaSummaryResponse getAreasByCity(String city, String propertyType) {
        String typeFilter = normalizeFilter(propertyType);
        log.debug("getAreasByCity city={} propertyType={} (filterActive={})",
                city, propertyType, typeFilter != null);

        String sql = typeFilter == null ? AREAS_BY_CITY_SQL : AREAS_BY_CITY_TYPE_FILTERED_SQL;
        // Positional args MUST align with the '?' order in the chosen SQL:
        //   - blended:  [city]   (single '?' in WHERE c.slug = ?)
        //   - filtered: [type, city]  (the count subquery's '?' precedes WHERE c.slug = ?)
        Object[] args = typeFilter == null
                ? new Object[]{city}
                : new Object[]{typeFilter, city};

        List<AreaSummary> areas = jdbcOperations.query(sql,
                (rs, rowNum) -> new AreaSummary(
                        rs.getString("area_key"),
                        rs.getString("name"),
                        rs.getDouble("geo_center_lat"),
                        rs.getDouble("geo_center_lon"),
                        nullableDouble(rs.getObject("min_lat")),
                        nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")),
                        nullableDouble(rs.getObject("max_lon")),
                        rs.getLong("listing_count"),
                        nullableLong(rs.getObject("median_price_paise")),
                        rs.getString("trend_direction"),
                        rs.getString("confidence_tier"),
                        rs.getLong("school_count"),
                        // Acreage is attached in a second pass below (filtered path only).
                        null
                ),
                args);

        if (typeFilter != null) {
            areas = attachAgriAcreage(city, typeFilter, areas);
        }

        log.debug("getAreasByCity city={} returned {} areas", city, areas.size());
        return new AreaSummaryResponse(city, areas);
    }

    /**
     * Computes per-area acreage in Java for the matching approved listings and returns a new list
     * with {@code agriAcreage} populated. The acreage column is summed using a PER-ROW-SKIP rule
     * (see {@link #sumParseableAcres}). Areas with no parseable row (or no matching listing) keep a
     * null acreage so {@code @JsonInclude(NON_NULL)} omits the field.
     */
    private List<AreaSummary> attachAgriAcreage(String city, String typeFilter, List<AreaSummary> areas) {
        Map<String, Double> acreageByArea = new HashMap<>();
        Map<String, List<BigDecimal>> parseableByArea = new HashMap<>();

        // Same approved-only + property_type guards as the count subquery, mirrored here so the
        // acreage population set is identical to the counted set.
        jdbcOperations.query(AGRI_AREA_LAND_SQL,
                rs -> {
                    String areaKey = rs.getString("area_key");
                    BigDecimal landArea = rs.getBigDecimal("land_area");
                    String unit = rs.getString("land_area_unit");
                    AreaNormalizer.NormalizedArea normalized = AreaNormalizer.normalize(landArea, unit);
                    BigDecimal acres = AreaNormalizer.sqmToAcres(normalized.areaSqm());
                    if (acres != null) {
                        // PER-ROW-SKIP: only parseable rows contribute; unparseable rows are skipped,
                        // not nulling the whole area. Acreage is null only when ZERO rows parse.
                        parseableByArea.computeIfAbsent(areaKey, k -> new ArrayList<>()).add(acres);
                    }
                },
                typeFilter, city);

        for (Map.Entry<String, List<BigDecimal>> e : parseableByArea.entrySet()) {
            acreageByArea.put(e.getKey(), sumParseableAcres(e.getValue()));
        }

        List<AreaSummary> result = new ArrayList<>(areas.size());
        for (AreaSummary a : areas) {
            Double acreage = acreageByArea.get(a.areaKey());
            result.add(new AreaSummary(
                    a.areaKey(), a.name(), a.geoCenterLat(), a.geoCenterLon(),
                    a.minLat(), a.minLon(), a.maxLat(), a.maxLon(),
                    a.listingCount(), a.medianPricePaise(), a.trendDirection(),
                    a.confidenceTier(), a.schoolCount(),
                    acreage));
        }
        return result;
    }

    /** Sums the parseable per-row acreages (BigDecimal) and returns a primitive double. */
    private static Double sumParseableAcres(List<BigDecimal> acres) {
        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal a : acres) {
            sum = sum.add(a);
        }
        return sum.doubleValue();
    }

    /** Trims and null/empty/whitespace-collapses the filter; returns null when no filter applies. */
    private static String normalizeFilter(String propertyType) {
        if (propertyType == null) {
            return null;
        }
        String trimmed = propertyType.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    private static Long nullableLong(Object val) {
        return val == null ? null : ((Number) val).longValue();
    }

    private static final String AREAS_BY_CITY_SQL = """
            SELECT
                a.area_key,
                a.name,
                a.geo_center_lat,
                a.geo_center_lon,
                a.min_lat,
                a.min_lon,
                a.max_lat,
                a.max_lon,
                COALESCE(pl.listing_count, 0)        AS listing_count,
                aos.median_price_paise,
                aos.trend_direction,
                aos.confidence_tier,
                (SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key)
                                                     AS school_count
            FROM areas a
            JOIN cities c ON c.id = a.city_id
            LEFT JOIN area_overview_stats aos
                ON  aos.area_key   = a.area_key
                AND aos.area_level = 'locality'
            LEFT JOIN (
                SELECT area_key, COUNT(*) AS listing_count
                FROM property_listings
                WHERE status = 'LIVE'
                  AND archived_at IS NULL
                  AND is_duplicate = false
                  AND LOWER(property_type) != LOWER('%s')
                GROUP BY area_key
            ) pl ON pl.area_key = a.area_key
            WHERE c.slug = ?
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
            ORDER BY COALESCE(pl.listing_count, 0) DESC, a.name
            """.formatted(PropertyType.AGRICULTURAL_LAND.getValue());

    /**
     * Variant of {@link #AREAS_BY_CITY_SQL} that scopes the per-area count subquery to a single
     * property type (#1371). The approved-only guards are RETAINED; the extra
     * {@code LOWER(pl.property_type) = LOWER(?)} clause is conjunctive. Casing parity with
     * {@code CityAreaListingsService} (the area-click path), which also uses {@code LOWER(...)}.
     * Bound-arg order: [propertyType, city]. The median/trend (area_overview_stats) join is
     * intentionally left blended — only the count is agri-scoped.
     */
    private static final String AREAS_BY_CITY_TYPE_FILTERED_SQL = """
            SELECT
                a.area_key,
                a.name,
                a.geo_center_lat,
                a.geo_center_lon,
                a.min_lat,
                a.min_lon,
                a.max_lat,
                a.max_lon,
                COALESCE(pl.listing_count, 0)        AS listing_count,
                aos.median_price_paise,
                aos.trend_direction,
                aos.confidence_tier,
                (SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key)
                                                     AS school_count
            FROM areas a
            JOIN cities c ON c.id = a.city_id
            LEFT JOIN area_overview_stats aos
                ON  aos.area_key   = a.area_key
                AND aos.area_level = 'locality'
            LEFT JOIN (
                SELECT area_key, COUNT(*) AS listing_count
                FROM property_listings pl
                WHERE pl.status = 'LIVE'
                  AND pl.archived_at IS NULL
                  AND pl.is_duplicate = false
                  AND LOWER(pl.property_type) = LOWER(?)
                GROUP BY pl.area_key
            ) pl ON pl.area_key = a.area_key
            WHERE c.slug = ?
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
            ORDER BY COALESCE(pl.listing_count, 0) DESC, a.name
            """;

    /**
     * Fetches (area_key, land_area, land_area_unit) for the approved listings of one property type
     * within a city, scoped to 4-segment locality areas. Same approved-only + type guards as the
     * count subquery so the acreage set matches the counted set exactly. Bound-arg order:
     * [propertyType, city].
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
