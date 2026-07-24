package com.example.realestate.discover.navigation;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Production-ready {@link AreaCountProvider} (#1955 Areas PR A, SLICE 2e, AC12): ONE area-level
 * {@code GROUP BY area_key} aggregation per (city, filter context) over {@code property_listings}
 * — the single query every caller (the navigation-counts endpoint's roll-up, and {@link
 * com.example.realestate.discover.DiscoverSummaryService}'s hotspots/region rollups) shares,
 * rather than one aggregate query per region/grouping as before.
 *
 * <p>Reuses {@link DiscoverListingPredicateBuilder#build} for the shared LIVE / not-archived /
 * not-duplicate / active-city predicate (mirrors {@code DiscoverSummaryService}'s own usage
 * exactly), plus the SAME 4-segment {@code area_key} guard and case-insensitive property-type
 * match that every other discover-summary read path applies, so counts reconcile everywhere.
 */
@Component
public class PostgresAreaCountProvider implements AreaCountProvider {

    /** Mirrors {@code DiscoverSummaryService#FOUR_SEGMENT_GUARD} exactly. */
    private static final String FOUR_SEGMENT_GUARD =
            "array_length(string_to_array(pl.area_key, '|'), 1) = 4";

    /**
     * The ONE area-level GROUP BY aggregation this provider ever issues — captured as a named,
     * documented template (rather than assembled ad hoc inline) so a later EXPLAIN ANALYZE pass
     * (qa step) can run this exact query shape directly against a representative city. {@code %s}
     * placeholders are, in order: the shared predicate WHERE fragment, the 4-segment guard, and an
     * optional trailing property-type filter fragment (empty string when no propertyType filter
     * applies).
     */
    static final String COUNT_BY_AREA_SQL_TEMPLATE = """
            SELECT pl.area_key AS area_key, COUNT(*) AS listing_count
            FROM property_listings pl
            WHERE %s AND %s%s
            GROUP BY pl.area_key
            """;

    private final JdbcOperations jdbcOperations;

    public PostgresAreaCountProvider(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Long> countsByAreaKey(AreaCountQuery query) {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                query.citySlug(), null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, query.listingPurpose(), null, null
        );
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(filters);

        List<Object> params = new ArrayList<>(sql.params());
        String typeFilterFragment = "";
        String propertyType = query.propertyType();
        if (propertyType != null && !propertyType.isBlank()) {
            typeFilterFragment = " AND LOWER(pl.property_type) = LOWER(?)";
            params.add(propertyType);
        }

        String sqlText = COUNT_BY_AREA_SQL_TEMPLATE.formatted(sql.whereFragment(), FOUR_SEGMENT_GUARD, typeFilterFragment);

        List<Map.Entry<String, Long>> rows = jdbcOperations.query(sqlText,
                (rs, rowNum) -> Map.entry(rs.getString("area_key"), rs.getLong("listing_count")),
                params.toArray());

        Map<String, Long> counts = new LinkedHashMap<>();
        for (Map.Entry<String, Long> row : rows) {
            counts.put(row.getKey(), row.getValue());
        }
        return counts;
    }
}
