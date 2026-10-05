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
import java.util.Optional;

@Service
public class AreaSummaryService {

    private static final Logger log = LoggerFactory.getLogger(AreaSummaryService.class);

    private final JdbcOperations jdbcOperations;

    public AreaSummaryService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Returns all areas for the given city slug with blended (all-property-type, all-purpose)
     * listing counts. Backwards-compatible overload — equivalent to no {@code propertyType} and no
     * {@code purpose} filter.
     */
    public AreaSummaryResponse getAreasByCity(String city) {
        return getAreasByCity(city, null, null);
    }

    /**
     * Backwards-compatible overload — equivalent to no {@code purpose} filter (#1371 callers).
     *
     * @param city         city slug
     * @param propertyType optional singular property type (e.g. {@code agricultural_land}); blank → no filter
     */
    public AreaSummaryResponse getAreasByCity(String city, String propertyType) {
        return getAreasByCity(city, propertyType, null);
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
     * <p>{@code purpose} (#2083 RC_C) is an ORTHOGONAL, independently-optional scope on the SAME
     * count subquery — {@code sale}/{@code rent} (case-insensitive), normalised via the shared
     * {@link DiscoverFilterNormalizer#normalizePurpose}, the same helper {@link
     * com.example.realestate.discover.navigation.AreaCountQuery} and {@code RegionSummaryService}
     * use, so an unrecognised/blank value drops to blended (never a 400) — matching this
     * codebase's established convention (AC11: absent → byte-identical to today). Both filters may
     * be supplied together; each is bound as its own {@code ?} parameter, never string-interpolated.
     *
     * @param city         city slug
     * @param propertyType optional singular property type (e.g. {@code agricultural_land}); blank → no filter
     * @param purpose      optional {@code sale}/{@code rent} scope; blank/unrecognised → no filter (blended)
     */
    public AreaSummaryResponse getAreasByCity(String city, String propertyType, String purpose) {
        String typeFilter = normalizeFilter(propertyType);
        String purposeFilter = DiscoverFilterNormalizer.normalizePurpose(purpose);
        log.debug("getAreasByCity city={} propertyType={} (filterActive={}) purpose={} (filterActive={})",
                city, propertyType, typeFilter != null, purpose, purposeFilter != null);

        String template = typeFilter == null ? AREAS_BY_CITY_SQL : AREAS_BY_CITY_TYPE_FILTERED_SQL;
        // The purpose clause is a fixed, code-owned literal (never user data) substituted into a
        // placeholder token — NOT the '?' bind value itself, which is still bound positionally
        // below. This keeps the clause optional (absent purpose = today's exact SQL text, AC11)
        // without maintaining four fully-duplicated SQL constants for every propertyType x purpose
        // combination.
        String purposeClause = purposeFilter == null
                ? ""
                : (typeFilter == null ? "AND listing_purpose = ?" : "AND pl.listing_purpose = ?");
        String sql = template.replace(PURPOSE_CLAUSE_TOKEN, purposeClause);

        // Positional args MUST align with the '?' order in the chosen SQL, left to right:
        //   - blended,  no purpose:      [city]
        //   - blended,  purpose:         [purpose, city]
        //   - filtered, no purpose:      [type, city]
        //   - filtered, purpose:         [type, purpose, city]
        List<Object> argsList = new ArrayList<>();
        if (typeFilter != null) {
            argsList.add(typeFilter);
        }
        if (purposeFilter != null) {
            argsList.add(purposeFilter);
        }
        argsList.add(city);
        Object[] args = argsList.toArray();

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
            areas = attachAgriAcreage(city, typeFilter, purposeFilter, areas);
        }

        log.debug("getAreasByCity city={} returned {} areas", city, areas.size());
        return new AreaSummaryResponse(city, areas);
    }

    /**
     * Server-owned bounds of one canonical Area row (#2767). {@code null} components mean the
     * {@code areas} row exists but carries no bounds; callers must treat that as "unavailable",
     * never as "unbounded".
     */
    public record AreaBounds(Double minLat, Double minLon, Double maxLat, Double maxLon) {
        /** {@code true} when all four components are present and form a non-inverted rectangle. */
        public boolean isUsable() {
            return minLat != null && minLon != null && maxLat != null && maxLon != null
                    && minLat <= maxLat && minLon <= maxLon;
        }
    }

    /**
     * Resolves the authoritative rectangle of ONE canonical Area for the given city slug (#2767) —
     * the {@code areas.min_lat/min_lon/max_lat/max_lon} columns {@link #getAreasByCity} already
     * serves to the UI as {@code DiscoverArea.minLat..maxLon}. FROM/JOIN/WHERE are the same as
     * {@link #AREAS_BY_CITY_SQL} (city slug, active city, 4-segment area_key) plus
     * {@code a.area_key = ?}, so an unknown key, a key of another city, a key of an inactive city
     * and a non-locality key all yield {@link Optional#empty()}.
     *
     * <p>Both values are bound parameters; nothing is interpolated.
     *
     * @return empty when no such Area exists for that city; otherwise its bounds (possibly with
     *         {@code null} components — see {@link AreaBounds#isUsable()})
     */
    public Optional<AreaBounds> findAreaBounds(String citySlug, String areaKey) {
        List<AreaBounds> rows = jdbcOperations.query(AREA_BOUNDS_SQL,
                (rs, rowNum) -> new AreaBounds(
                        nullableDouble(rs.getObject("min_lat")),
                        nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")),
                        nullableDouble(rs.getObject("max_lon"))),
                citySlug, areaKey);
        return rows.stream().findFirst();
    }

    /**
     * Computes per-area acreage in Java for the matching approved listings and returns a new list
     * with {@code agriAcreage} populated. The acreage column is summed using a PER-ROW-SKIP rule
     * (see {@link #sumParseableAcres}). Areas with no parseable row (or no matching listing) keep a
     * null acreage so {@code @JsonInclude(NON_NULL)} omits the field.
     *
     * <p>{@code purposeFilter} (#2083 RC_C), when present, narrows this pass the SAME way it
     * narrows the count subquery — so the acreage population set stays identical to the counted
     * set even when {@code propertyType=agricultural_land} and {@code purpose} are both supplied.
     */
    private List<AreaSummary> attachAgriAcreage(
            String city, String typeFilter, String purposeFilter, List<AreaSummary> areas) {
        Map<String, Double> acreageByArea = new HashMap<>();
        Map<String, List<BigDecimal>> parseableByArea = new HashMap<>();

        String purposeClause = purposeFilter == null ? "" : "AND pl.listing_purpose = ?";
        String sql = AGRI_AREA_LAND_SQL.replace(PURPOSE_CLAUSE_TOKEN, purposeClause);
        List<Object> argsList = new ArrayList<>();
        argsList.add(typeFilter);
        if (purposeFilter != null) {
            argsList.add(purposeFilter);
        }
        argsList.add(city);

        // Same approved-only + property_type (+ purpose, when supplied) guards as the count
        // subquery, mirrored here so the acreage population set is identical to the counted set.
        jdbcOperations.query(sql,
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
                argsList.toArray());

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

    /**
     * Correlated scalar subquery counting a curated area's schools THROUGH
     * {@code school_discover_area_coverage} (#1828 PR1) instead of the legacy
     * {@code schools.area_key} string equality. Uses the POSITIVE relationship_type IN-list
     * — {@code 'contained','primary','reviewed_override'} — never a negative
     * {@code <> 'nearby'}: a negative form is default-allow, so a future new
     * relationship_type would silently start being counted (and would stop matching
     * {@code idx_school_coverage_counted}'s identical partial-index predicate, causing a seq
     * scan instead of a wrong count). 'nearby' is recorded but deliberately never counted.
     *
     * <p>Interpolated as a SQL literal — contains ZERO {@code '?'} bind parameters — because
     * the relationship-type vocabulary is a closed, code-owned constant set. A bound
     * parameter here would sit textually BEFORE the existing {@code '?'}s in
     * {@link #AREAS_BY_CITY_TYPE_FILTERED_SQL} and silently shift every downstream binding
     * (see the {@code Object[] args} hand-alignment warning above): all values are String,
     * so JDBC would raise nothing and the endpoint would silently return zeros.
     *
     * <p>Defined ONCE and reused in both {@link #AREAS_BY_CITY_SQL} and
     * {@link #AREAS_BY_CITY_TYPE_FILTERED_SQL} so the two constants cannot drift from each
     * other (further enforced by {@code AreaSummaryServiceCoverageCountTest}'s byte-identity
     * assertion — editing one copy and not the other is the single most likely error here).
     *
     * <p>Kept as a correlated SCALAR subquery (not a {@code LEFT JOIN + GROUP BY}) so an area
     * with zero schools yields {@code 0}, never {@code NULL} — {@link AreaSummary#schoolCount}
     * is a primitive {@code long} and this shape removes the NULL-vs-0 hazard by construction.
     *
     * <p>Package-private (not {@code private}) so {@link NearbyAreaCandidatesService} (#2017) can
     * reuse it verbatim for its own per-area school count, rather than maintaining a second copy
     * that could silently drift from this one. Requires the correlated outer query to alias the
     * {@code areas} table as {@code a}, exactly as both queries in this class do.
     */
    static final String SCHOOL_COUNT_SUBQUERY = """
            (SELECT COUNT(*)
             FROM school_discover_area_coverage c
             WHERE c.curated_area_key = a.area_key
               AND c.relationship_type IN ('contained','primary','reviewed_override'))""";

    /**
     * Placeholder token substituted (via {@link String#replace}, never {@link String#format}) with
     * either {@code ""} or a fixed, code-owned {@code "AND ... listing_purpose = ?"} literal at
     * request time (#2083 RC_C) — see {@link #getAreasByCity(String, String, String)}. This keeps
     * the {@code purpose} filter ORTHOGONAL to {@code propertyType} without maintaining four fully
     * duplicated SQL constants for every propertyType x purpose combination. The token itself never
     * carries user data — only the {@code ?} bind value it introduces does, and that value is
     * always bound positionally through {@code jdbcOperations}, never interpolated.
     */
    private static final String PURPOSE_CLAUSE_TOKEN = "__PURPOSE_CLAUSE__";

    private static final String AREAS_BY_CITY_SQL = ("""
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
            """
            + SCHOOL_COUNT_SUBQUERY + """
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
                  __PURPOSE_CLAUSE__
                GROUP BY area_key
            ) pl ON pl.area_key = a.area_key
            WHERE c.slug = ?
              AND c.is_active = true
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
            ORDER BY COALESCE(pl.listing_count, 0) DESC, a.name
            """).formatted(PropertyType.AGRICULTURAL_LAND.getValue());

    /**
     * #2767 single-Area bounds lookup. Same table, joins and WHERE predicates as
     * {@link #AREAS_BY_CITY_SQL} (kept textually parallel on purpose), plus the exact
     * {@code a.area_key = ?} match. Bound-arg order: [citySlug, areaKey].
     */
    private static final String AREA_BOUNDS_SQL = """
            SELECT a.min_lat, a.min_lon, a.max_lat, a.max_lon
            FROM areas a
            JOIN cities c ON c.id = a.city_id
            WHERE c.slug = ?
              AND c.is_active = true
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
              AND a.area_key = ?
            """;

    /**
     * Variant of {@link #AREAS_BY_CITY_SQL} that scopes the per-area count subquery to a single
     * property type (#1371). The approved-only guards are RETAINED; the extra
     * {@code LOWER(pl.property_type) = LOWER(?)} clause is conjunctive. Casing parity with
     * {@code CityAreaListingsService} (the area-click path), which also uses {@code LOWER(...)}.
     * Bound-arg order: [propertyType, city]. The median/trend (area_overview_stats) join is
     * intentionally left blended — only the count is agri-scoped.
     */
    // NOTE (tech debt, not fixed here): unlike AREAS_BY_CITY_SQL, this constant concatenates
    // SCHOOL_COUNT_SUBQUERY WITHOUT wrapping the result in .formatted(...) — harmless today
    // because the subquery contains no '%', but if a future edit to SCHOOL_COUNT_SUBQUERY
    // ever introduced one, only AREAS_BY_CITY_SQL's .formatted(...) call would blow up at
    // class-init (UnknownFormatConversionException), not this constant.
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
            """
            + SCHOOL_COUNT_SUBQUERY + """
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
                  __PURPOSE_CLAUSE__
                GROUP BY pl.area_key
            ) pl ON pl.area_key = a.area_key
            WHERE c.slug = ?
              AND c.is_active = true
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
              __PURPOSE_CLAUSE__
              AND c.slug = ?
              AND c.is_active = true
              AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
            """;
}
