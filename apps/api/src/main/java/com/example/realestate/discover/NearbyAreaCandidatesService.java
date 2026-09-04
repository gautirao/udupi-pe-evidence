package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Backs {@code GET /api/discover/areas/nearby-candidates} — bounded, filter-aware "nearby area"
 * suggestions for the AREA_SET multi-area chip strip (#2017).
 *
 * <p>Unlike the frontend's prior stopgap ({@code useDiscoverAreas(nav.city)}), every candidate's
 * {@code eligibleListingCount} is computed from the SAME active-filter predicate the map/listing
 * endpoints use ({@link DiscoverListingPredicateBuilder#build}) — reused verbatim, never
 * duplicated, so counts cannot drift from what the user actually sees.
 *
 * <p>Ranking: when {@code selected} is non-empty, candidates are ordered by squared distance from
 * the CENTROID of the selected areas' {@code geo_center_lat/lon} (closest first) — a monotonic
 * proxy for actual distance that avoids a SQRT per row. When {@code selected} is empty, ranking
 * falls back to {@code eligibleListingCount DESC, name}, mirroring {@code AREAS_BY_CITY_SQL}'s
 * default ordering in {@link AreaSummaryService}.
 *
 * <p>Single CTE-based query — no N+1: one JDBC round trip computes the selected-area centroid,
 * per-area eligible counts, and per-area school counts together.
 */
@Service
public class NearbyAreaCandidatesService {

    private static final Logger log = LoggerFactory.getLogger(NearbyAreaCandidatesService.class);

    /** Safety bound on how many {@code selected} area keys this query will honor (defense in depth;
     *  the product-level cap of 3 lives in frontend state, not here). */
    static final int MAX_SELECTED_KEYS = 10;

    static final int MIN_LIMIT = 1;
    static final int MAX_LIMIT = 12;
    static final int DEFAULT_LIMIT = 6;

    private final JdbcOperations jdbcOperations;

    public NearbyAreaCandidatesService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * @param city                city slug; unknown/inactive city yields an empty candidate list,
     *                             never a 404/500 (matches {@code AreaSummaryController}'s convention)
     * @param rawSelectedAreaKeys optional area keys already committed to the AREA_SET; excluded from
     *                             candidates and used as the distance-ranking anchor. Deduplicated and
     *                             capped at {@link #MAX_SELECTED_KEYS} here (defense in depth — the
     *                             controller also caps before calling in).
     * @param rawLimit             desired candidate count; clamped to [{@link #MIN_LIMIT}, {@link #MAX_LIMIT}]
     * @param filters              active discover filters; {@code filters.city()} MUST equal {@code city}
     */
    public NearbyAreaCandidatesResponse findCandidates(
            String city,
            List<String> rawSelectedAreaKeys,
            Integer rawLimit,
            DiscoverListingPredicateBuilder.Filters filters) {

        List<String> selected = dedupeAndCap(rawSelectedAreaKeys);
        int limit = clampLimit(rawLimit);

        DiscoverListingPredicateBuilder.Sql filterSql = DiscoverListingPredicateBuilder.build(filters);

        boolean hasSelection = !selected.isEmpty();
        String selectedInClause = hasSelection
                ? "a.area_key IN (" + placeholders(selected.size()) + ")"
                : "1 = 0";
        String exclusionClause = hasSelection
                ? "a.area_key NOT IN (" + placeholders(selected.size()) + ")"
                : "1 = 1";

        // NOTE: the SQL is assembled into a plain String FIRST, then `.formatted(...)` is invoked as
        // a separate statement. `.formatted()`/`String.format()` binds only to the literal it is
        // called on — inside `"""a""" + CONST + """b""".formatted(...)`, Java's method-call
        // precedence attaches `.formatted(...)` to the trailing text block ONLY, not to the full
        // concatenated result, silently leaving earlier `%s` tokens unsubstituted. Splitting the
        // concatenation and the `.formatted()` call into two statements avoids that trap.
        String sqlTemplate = """
                WITH sel AS (
                    SELECT AVG(a.geo_center_lat) AS centroid_lat,
                           AVG(a.geo_center_lon) AS centroid_lon,
                           COUNT(*)              AS selected_count
                    FROM areas a
                    JOIN cities c ON c.id = a.city_id
                    WHERE c.slug = ?
                      AND %s
                ),
                elig AS (
                    SELECT pl.area_key, COUNT(*) AS eligible_listing_count
                    FROM property_listings pl
                    WHERE %s
                    GROUP BY pl.area_key
                ),
                cand AS (
                    SELECT
                        a.area_key,
                        a.name,
                        a.geo_center_lat,
                        a.geo_center_lon,
                        COALESCE(elig.eligible_listing_count, 0) AS eligible_listing_count,
                """
                + AreaSummaryService.SCHOOL_COUNT_SUBQUERY + """
                                                             AS school_count,
                        sel.centroid_lat   AS sel_centroid_lat,
                        sel.centroid_lon   AS sel_centroid_lon,
                        sel.selected_count AS sel_selected_count
                    FROM areas a
                    JOIN cities c ON c.id = a.city_id
                    LEFT JOIN elig ON elig.area_key = a.area_key
                    CROSS JOIN sel
                    WHERE c.slug = ?
                      AND c.is_active = true
                      AND array_length(string_to_array(a.area_key, '|'), 1) = 4
                      AND %s
                )
                SELECT area_key, name, geo_center_lat, geo_center_lon,
                       eligible_listing_count, school_count
                FROM cand
                WHERE NOT (eligible_listing_count = 0 AND school_count = 0)
                ORDER BY
                    CASE WHEN sel_selected_count > 0
                         THEN POWER(geo_center_lat - sel_centroid_lat, 2)
                                  + POWER(geo_center_lon - sel_centroid_lon, 2)
                         ELSE NULL
                    END ASC NULLS LAST,
                    eligible_listing_count DESC,
                    name ASC
                LIMIT ?
                """;
        String sql = sqlTemplate.formatted(selectedInClause, filterSql.whereFragment(), exclusionClause);

        // Positional args MUST align with the '?' order in the assembled SQL, left to right:
        //   sel:  [city, (selected keys)]
        //   elig: [filter params...]
        //   cand: [city, (selected keys again — reused for the NOT IN exclusion)]
        //   LIMIT: [limit]
        List<Object> args = new ArrayList<>();
        args.add(city);
        args.addAll(selected);
        args.addAll(filterSql.params());
        args.add(city);
        args.addAll(selected);
        args.add(limit);

        List<NearbyAreaCandidate> candidates = jdbcOperations.query(sql,
                (rs, rowNum) -> new NearbyAreaCandidate(
                        rs.getString("area_key"),
                        rs.getString("name"),
                        rs.getDouble("geo_center_lat"),
                        rs.getDouble("geo_center_lon"),
                        rs.getLong("eligible_listing_count"),
                        rs.getLong("school_count")
                ),
                args.toArray());

        log.debug("findCandidates city={} selected={} limit={} returned {} candidates",
                city, selected, limit, candidates.size());
        return new NearbyAreaCandidatesResponse(city, selected, candidates);
    }

    private static List<String> dedupeAndCap(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String key : raw) {
            if (key != null && !key.isBlank()) {
                seen.add(key);
            }
            if (seen.size() == MAX_SELECTED_KEYS) {
                break;
            }
        }
        return List.copyOf(seen);
    }

    private static int clampLimit(Integer rawLimit) {
        int value = rawLimit != null ? rawLimit : DEFAULT_LIMIT;
        return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, value));
    }

    private static String placeholders(int count) {
        return String.join(",", java.util.Collections.nCopies(count, "?"));
    }
}
