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
 * Production-ready {@link AreaCountProvider} (#1955 Areas PR A, SLICE 2e, AC12; #1956 PR1
 * Decision 2): ONE area-level {@code GROUP BY area_key} aggregation per (city, filter context) over
 * {@code property_listings} — the single query every caller (the navigation-counts endpoint's
 * roll-up, and {@link com.example.realestate.discover.DiscoverSummaryService}'s hotspots/region
 * rollups) shares, rather than one aggregate query per region/grouping as before.
 *
 * <p>Reuses {@link DiscoverListingPredicateBuilder#build} via {@link
 * AreaCountQuery#toPredicateFilters()} for the ENTIRE filter predicate — including {@code
 * propertyTypes}, which used to be a bespoke {@code LOWER(pl.property_type) = LOWER(?)} fragment
 * maintained only here. That bespoke fragment is deleted: {@link AreaCountQuery}'s compact
 * constructor now allowlist-canonicalises {@code propertyTypes} to its {@link
 * com.example.realestate.ai.PropertyType} stored (lower-case) value, so routing through the SAME
 * case-SENSITIVE {@code IN (?)} predicate the cards/markers path uses no longer disagrees with it
 * on casing (the #1956 PR1 live-bug fix — see {@link AreaCountQuery}'s class javadoc). Only the
 * 4-segment {@code area_key} guard remains provider-specific (a hierarchy invariant, not a filter).
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
     * placeholders are, in order: the shared predicate WHERE fragment, then the 4-segment guard.
     */
    static final String COUNT_BY_AREA_SQL_TEMPLATE = """
            SELECT pl.area_key AS area_key, COUNT(*) AS listing_count
            FROM property_listings pl
            WHERE %s AND %s
            GROUP BY pl.area_key
            """;

    private final JdbcOperations jdbcOperations;

    public PostgresAreaCountProvider(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Long> countsByAreaKey(AreaCountQuery query) {
        // Provably-empty filter sets never reach the database (#1956 PR1 AC1.15 #7/#8). An
        // unsatisfiable propertyTypes/sellerTypes request cannot match a row whatever the other
        // filters say, so an arbitrary-string cardinality lever costs ZERO queries here rather than
        // one aggregate scan each. The answer is identical to running the query — every area would
        // simply be absent from the map, which callers already read as 0 via getOrDefault.
        if (query.isProvablyEmpty()) {
            return Map.of();
        }

        DiscoverListingPredicateBuilder.Filters filters = query.toPredicateFilters();
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(filters);

        List<Object> params = new ArrayList<>(sql.params());
        String sqlText = COUNT_BY_AREA_SQL_TEMPLATE.formatted(sql.whereFragment(), FOUR_SEGMENT_GUARD);

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
