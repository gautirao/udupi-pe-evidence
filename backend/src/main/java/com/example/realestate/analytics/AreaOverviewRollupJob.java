package com.example.realestate.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Scheduled job that computes area-level overview statistics from listings.
 *
 * <p>Runs daily at 02:30 UTC. Produces two row types in {@code area_overview_stats}:
 * <ul>
 *   <li><b>locality</b> rows — 4-segment area_key (e.g. IN|KA|Udupi|Manipal)</li>
 *   <li><b>district</b> rows — 3-segment area_key (e.g. IN|KA|Udupi), aggregated from locality listings</li>
 * </ul>
 *
 * <p>Each run covers a rolling 90-day window. Trend computation compares the current 90-day
 * window against the prior 90–180-day window (minimum 3 listings in prior window required).
 *
 * <p>The job is idempotent: repeated runs update existing rows via UPSERT.
 *
 * <p>Both passes run inside a single {@code @Transactional} boundary so that a failure in
 * Pass 2 (district) rolls back Pass 1 (locality) as well.
 */
@Component
public class AreaOverviewRollupJob {

    private static final Logger log = LoggerFactory.getLogger(AreaOverviewRollupJob.class);

    private final JdbcOperations jdbcOperations;

    public AreaOverviewRollupJob(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    // -------------------------------------------------------------------------
    // Scheduled entry point
    // -------------------------------------------------------------------------

    /**
     * Daily at 02:30 UTC.
     *
     * <p>{@code @Transactional} is placed here (the scheduler entry point) so that the
     * Spring AOP proxy is entered from outside the bean. Placing it on {@link #run()}
     * instead would cause a self-invocation bypass: {@code this.run()} never goes
     * through the proxy, so each of the 7 SQL statements would commit independently.
     */
    @Scheduled(cron = "0 30 2 * * *")
    @Transactional
    public void computeAreaOverview() {
        log.info("Starting area_overview_stats rollup");
        run();
        log.info("area_overview_stats rollup complete");
    }

    // -------------------------------------------------------------------------
    // Public run() — called by computeAreaOverview() and integration tests
    // -------------------------------------------------------------------------

    /**
     * Executes both passes (locality + district).
     * Exposed public so integration tests can invoke it directly.
     * Transaction boundary is owned by {@link #computeAreaOverview()}.
     */
    public void run() {
        log.debug("Pass 1 — locality UPSERT");
        int localityRows = jdbcOperations.update(LOCALITY_UPSERT_SQL);
        log.debug("Pass 1 locality rows upserted={}", localityRows);

        log.debug("Pass 1 — locality trend UPDATE");
        jdbcOperations.update(LOCALITY_TREND_SQL);

        log.debug("Pass 1 — locality property_type_dist UPDATE");
        jdbcOperations.update(PROPERTY_TYPE_DIST_LOCALITY_SQL);

        log.debug("Pass 1 — locality nearby_area_keys UPDATE");
        jdbcOperations.update(NEARBY_AREA_KEYS_SQL);

        log.debug("Pass 2 — district UPSERT");
        int districtRows = jdbcOperations.update(DISTRICT_UPSERT_SQL);
        log.debug("Pass 2 district rows upserted={}", districtRows);

        log.debug("Pass 2 — district trend UPDATE");
        jdbcOperations.update(DISTRICT_TREND_SQL);

        log.debug("Pass 2 — district property_type_dist UPDATE");
        jdbcOperations.update(PROPERTY_TYPE_DIST_DISTRICT_SQL);
    }

    // -------------------------------------------------------------------------
    // Pure utility methods — extracted for unit testing without a DB
    // -------------------------------------------------------------------------

    /**
     * Derives the 3-segment district key from a 4-segment locality area_key.
     * Returns {@code null} if the input is not a 4-segment key.
     *
     * <p>Examples:
     * <ul>
     *   <li>{@code "IN|KA|Udupi|Manipal"} → {@code "IN|KA|Udupi"}</li>
     *   <li>{@code "IN|KA|Udupi"} → {@code null}</li>
     * </ul>
     */
    static String deriveDistrictKey(String areaKey) {
        if (areaKey == null) {
            return null;
        }
        String[] parts = areaKey.split("\\|", -1);
        if (parts.length != 4) {
            return null;
        }
        return parts[0] + "|" + parts[1] + "|" + parts[2];
    }

    /**
     * Returns the confidence tier string for a given listing count.
     * <ul>
     *   <li>count &ge; 20 → {@code "full"}</li>
     *   <li>count &ge; 5  → {@code "limited"}</li>
     *   <li>otherwise     → {@code "fallback"}</li>
     * </ul>
     */
    static String confidenceTier(int listingCount) {
        if (listingCount >= 20) {
            return "full";
        } else if (listingCount >= 5) {
            return "limited";
        } else {
            return "fallback";
        }
    }

    /**
     * Computes the trend direction given current and previous window medians.
     *
     * <p>Rules:
     * <ul>
     *   <li>prevCount &lt; 3 → {@code null} (not enough prior data)</li>
     *   <li>|delta| &gt; 5% and current &gt; prev → {@code "rising"}</li>
     *   <li>|delta| &gt; 5% and current &lt; prev → {@code "falling"}</li>
     *   <li>otherwise → {@code "stable"}</li>
     * </ul>
     *
     * @param currentMedian  median price in the current 90-day window
     * @param prevMedian     median price in the prior 90–180-day window
     * @param prevCount      listing count in the prior 90–180-day window (0 signals no prior data)
     * @return direction string or {@code null}
     */
    static String trendDirection(double currentMedian, double prevMedian, int prevCount) {
        if (prevCount < 3) {
            return null;
        }
        if (prevMedian == 0) {
            return "stable";
        }
        double pctChange = (currentMedian - prevMedian) * 100.0 / prevMedian;
        if (Math.abs(pctChange) > 5.0) {
            return currentMedian > prevMedian ? "rising" : "falling";
        }
        return "stable";
    }

    // -------------------------------------------------------------------------
    // SQL constants
    // -------------------------------------------------------------------------

    /** Pass 1a — UPSERT locality rows with price stats and centroids. */
    private static final String LOCALITY_UPSERT_SQL = """
            WITH centroid_cte AS (
              SELECT area_key,
                     AVG(latitude)  AS centroid_lat,
                     AVG(longitude) AS centroid_lon
              FROM property_listings
              WHERE area_key IS NOT NULL
                AND array_length(string_to_array(area_key, '|'), 1) = 4
                AND is_duplicate = false
                AND is_valid = true
                AND status IN ('SCRAPED', 'LIVE')
                AND created_at >= NOW() - INTERVAL '90 days'
                AND latitude IS NOT NULL
                AND longitude IS NOT NULL
              GROUP BY area_key
            ),
            stats_cte AS (
              SELECT
                pl.area_key,
                'locality'                                                    AS area_level,
                COUNT(*)                                                      AS listing_count_90d,
                PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY pl.price_per_cent_paise) AS median_price_paise,
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY pl.price_per_cent_paise) AS price_p10_paise,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY pl.price_per_cent_paise) AS price_p90_paise,
                cc.centroid_lat,
                cc.centroid_lon,
                CONCAT(
                  split_part(pl.area_key, '|', 1), '|',
                  split_part(pl.area_key, '|', 2), '|',
                  split_part(pl.area_key, '|', 3)
                ) AS district_area_key
              FROM property_listings pl
              LEFT JOIN centroid_cte cc ON cc.area_key = pl.area_key
              WHERE pl.area_key IS NOT NULL
                AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
                AND pl.price_per_cent_paise IS NOT NULL
                AND pl.is_duplicate = false
                AND pl.is_valid = true
                AND pl.status IN ('SCRAPED', 'LIVE')
                AND pl.created_at >= NOW() - INTERVAL '90 days'
              GROUP BY pl.area_key, cc.centroid_lat, cc.centroid_lon
            )
            INSERT INTO area_overview_stats (
              area_key, area_level, listing_count_90d,
              median_price_paise, price_p10_paise, price_p90_paise,
              centroid_lat, centroid_lon, district_area_key,
              confidence_tier, updated_at
            )
            SELECT
              area_key, area_level, listing_count_90d,
              median_price_paise, price_p10_paise, price_p90_paise,
              centroid_lat, centroid_lon, district_area_key,
              CASE
                WHEN listing_count_90d >= 20 THEN 'full'
                WHEN listing_count_90d >= 5  THEN 'limited'
                ELSE 'fallback'
              END AS confidence_tier,
              NOW() AS updated_at
            FROM stats_cte
            ON CONFLICT (area_key) DO UPDATE SET
              area_level         = EXCLUDED.area_level,
              listing_count_90d  = EXCLUDED.listing_count_90d,
              median_price_paise = EXCLUDED.median_price_paise,
              price_p10_paise    = EXCLUDED.price_p10_paise,
              price_p90_paise    = EXCLUDED.price_p90_paise,
              centroid_lat       = EXCLUDED.centroid_lat,
              centroid_lon       = EXCLUDED.centroid_lon,
              district_area_key  = EXCLUDED.district_area_key,
              confidence_tier    = EXCLUDED.confidence_tier,
              updated_at         = EXCLUDED.updated_at,
              trend_direction    = NULL,
              trend_pct_change   = NULL,
              property_type_dist = NULL,
              nearby_area_keys   = NULL
            """;

    /**
     * Pass 1b — UPDATE trend columns on locality rows.
     *
     * <p>Uses {@code aos.median_price_paise} (stored in Pass 1a) as the current-window
     * median. Re-scanning {@code property_listings} for the current window here would
     * risk a race if new listings arrive between Pass 1a and Pass 1b.
     */
    private static final String LOCALITY_TREND_SQL = """
            WITH prev_window AS (
              SELECT area_key,
                     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise) AS prev_median,
                     COUNT(*) AS prev_count
              FROM property_listings
              WHERE area_key IS NOT NULL
                AND array_length(string_to_array(area_key, '|'), 1) = 4
                AND price_per_cent_paise IS NOT NULL
                AND is_duplicate = false AND is_valid = true
                AND status IN ('SCRAPED', 'LIVE')
                AND created_at >= NOW() - INTERVAL '180 days'
                AND created_at <  NOW() - INTERVAL '90 days'
              GROUP BY area_key
            )
            UPDATE area_overview_stats aos
            SET
              trend_direction = CASE
                WHEN pw.prev_count IS NULL OR pw.prev_count < 3 THEN NULL
                WHEN ABS(aos.median_price_paise - pw.prev_median) * 100.0 / NULLIF(pw.prev_median, 0) > 5
                     AND aos.median_price_paise > pw.prev_median THEN 'rising'
                WHEN ABS(aos.median_price_paise - pw.prev_median) * 100.0 / NULLIF(pw.prev_median, 0) > 5
                     AND aos.median_price_paise < pw.prev_median THEN 'falling'
                ELSE 'stable'
              END,
              trend_pct_change = CASE
                WHEN pw.prev_count IS NULL OR pw.prev_count < 3 THEN NULL
                ELSE ROUND(
                  (aos.median_price_paise - pw.prev_median) * 100.0 / NULLIF(pw.prev_median, 0),
                  2
                )
              END
            FROM prev_window pw
            WHERE aos.area_key = pw.area_key
              AND aos.area_level = 'locality'
              AND aos.median_price_paise IS NOT NULL
            """;

    /** Pass 1c — UPDATE property_type_dist on locality rows. */
    private static final String PROPERTY_TYPE_DIST_LOCALITY_SQL = """
            WITH type_counts AS (
              SELECT area_key, property_type, COUNT(*) AS cnt
              FROM property_listings
              WHERE area_key IS NOT NULL
                AND array_length(string_to_array(area_key, '|'), 1) = 4
                AND property_type IS NOT NULL
                AND is_duplicate = false AND is_valid = true
                AND status IN ('SCRAPED', 'LIVE')
                AND created_at >= NOW() - INTERVAL '90 days'
              GROUP BY area_key, property_type
            ),
            totals AS (
              SELECT area_key, SUM(cnt) AS total FROM type_counts GROUP BY area_key
            ),
            dist AS (
              SELECT tc.area_key,
                     jsonb_object_agg(tc.property_type,
                       ROUND(tc.cnt::NUMERIC / t.total, 2)) AS dist
              FROM type_counts tc JOIN totals t ON t.area_key = tc.area_key
              GROUP BY tc.area_key
            )
            UPDATE area_overview_stats SET property_type_dist = d.dist
            FROM dist d
            WHERE area_overview_stats.area_key = d.area_key
              AND area_overview_stats.area_level = 'locality'
            """;

    /**
     * Pass 1d — UPDATE nearby_area_keys on locality rows using Euclidean distance
     * approximation on stored centroids. Avoids PostGIS dependency; accurate enough
     * for within-Karnataka area ordering.
     *
     * <p>Uses a single-pass ROW_NUMBER() window function instead of a correlated
     * subquery so the table is scanned once (O(N log N)) rather than once per
     * source row (O(N²)).
     */
    private static final String NEARBY_AREA_KEYS_SQL = """
            WITH ranked AS (
              SELECT
                a.area_key AS source_key,
                b.area_key AS neighbor_key,
                ROW_NUMBER() OVER (
                  PARTITION BY a.area_key
                  ORDER BY
                    (a.centroid_lat - b.centroid_lat)^2 +
                    (a.centroid_lon - b.centroid_lon)^2
                ) AS rn
              FROM area_overview_stats a
              JOIN area_overview_stats b
                ON a.area_key != b.area_key
               AND b.area_level = 'locality'
               AND b.centroid_lat IS NOT NULL
               AND b.centroid_lon IS NOT NULL
               AND b.listing_count_90d >= 1
              WHERE a.area_level = 'locality'
                AND a.centroid_lat IS NOT NULL
                AND a.centroid_lon IS NOT NULL
            )
            UPDATE area_overview_stats aos
            SET nearby_area_keys = (
              SELECT ARRAY_AGG(r.neighbor_key ORDER BY r.rn)
              FROM ranked r
              WHERE r.source_key = aos.area_key
                AND r.rn <= 4
            )
            WHERE aos.area_level = 'locality'
              AND aos.centroid_lat IS NOT NULL
              AND aos.centroid_lon IS NOT NULL
            """;

    /** Pass 2a — UPSERT district rows. */
    private static final String DISTRICT_UPSERT_SQL = """
            WITH district_stats AS (
              SELECT
                CONCAT(
                  split_part(pl.area_key, '|', 1), '|',
                  split_part(pl.area_key, '|', 2), '|',
                  split_part(pl.area_key, '|', 3)
                ) AS district_key,
                'district' AS area_level,
                COUNT(*) AS listing_count_90d,
                PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY pl.price_per_cent_paise) AS median_price_paise,
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY pl.price_per_cent_paise) AS price_p10_paise,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY pl.price_per_cent_paise) AS price_p90_paise,
                AVG(pl.latitude)  AS centroid_lat,
                AVG(pl.longitude) AS centroid_lon
              FROM property_listings pl
              WHERE pl.area_key IS NOT NULL
                AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
                AND pl.price_per_cent_paise IS NOT NULL
                AND pl.is_duplicate = false AND pl.is_valid = true
                AND pl.status IN ('SCRAPED', 'LIVE')
                AND pl.created_at >= NOW() - INTERVAL '90 days'
              GROUP BY district_key
            )
            INSERT INTO area_overview_stats (
              area_key, area_level, listing_count_90d,
              median_price_paise, price_p10_paise, price_p90_paise,
              centroid_lat, centroid_lon,
              district_area_key, nearby_area_keys,
              confidence_tier, updated_at
            )
            SELECT
              district_key, area_level, listing_count_90d,
              median_price_paise, price_p10_paise, price_p90_paise,
              centroid_lat, centroid_lon,
              NULL AS district_area_key,
              NULL AS nearby_area_keys,
              CASE
                WHEN listing_count_90d >= 20 THEN 'full'
                WHEN listing_count_90d >= 5  THEN 'limited'
                ELSE 'fallback'
              END AS confidence_tier,
              NOW() AS updated_at
            FROM district_stats
            ON CONFLICT (area_key) DO UPDATE SET
              listing_count_90d  = EXCLUDED.listing_count_90d,
              median_price_paise = EXCLUDED.median_price_paise,
              price_p10_paise    = EXCLUDED.price_p10_paise,
              price_p90_paise    = EXCLUDED.price_p90_paise,
              centroid_lat       = EXCLUDED.centroid_lat,
              centroid_lon       = EXCLUDED.centroid_lon,
              confidence_tier    = EXCLUDED.confidence_tier,
              updated_at         = EXCLUDED.updated_at,
              trend_direction    = NULL,
              trend_pct_change   = NULL,
              property_type_dist = NULL
            """;

    /**
     * Pass 2b — UPDATE trend columns on district rows.
     *
     * <p>Uses {@code aos.median_price_paise} (stored in Pass 2a) as the current-window
     * median for the same consistency reason as {@link #LOCALITY_TREND_SQL}.
     */
    private static final String DISTRICT_TREND_SQL = """
            WITH prev_window AS (
              SELECT
                CONCAT(
                  split_part(area_key, '|', 1), '|',
                  split_part(area_key, '|', 2), '|',
                  split_part(area_key, '|', 3)
                ) AS district_key,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise) AS prev_median,
                COUNT(*) AS prev_count
              FROM property_listings
              WHERE area_key IS NOT NULL
                AND array_length(string_to_array(area_key, '|'), 1) = 4
                AND price_per_cent_paise IS NOT NULL
                AND is_duplicate = false AND is_valid = true
                AND status IN ('SCRAPED', 'LIVE')
                AND created_at >= NOW() - INTERVAL '180 days'
                AND created_at <  NOW() - INTERVAL '90 days'
              GROUP BY district_key
            )
            UPDATE area_overview_stats aos
            SET
              trend_direction = CASE
                WHEN pw.prev_count IS NULL OR pw.prev_count < 3 THEN NULL
                WHEN ABS(aos.median_price_paise - pw.prev_median) * 100.0 / NULLIF(pw.prev_median, 0) > 5
                     AND aos.median_price_paise > pw.prev_median THEN 'rising'
                WHEN ABS(aos.median_price_paise - pw.prev_median) * 100.0 / NULLIF(pw.prev_median, 0) > 5
                     AND aos.median_price_paise < pw.prev_median THEN 'falling'
                ELSE 'stable'
              END,
              trend_pct_change = CASE
                WHEN pw.prev_count IS NULL OR pw.prev_count < 3 THEN NULL
                ELSE ROUND(
                  (aos.median_price_paise - pw.prev_median) * 100.0 / NULLIF(pw.prev_median, 0),
                  2
                )
              END
            FROM prev_window pw
            WHERE aos.area_key = pw.district_key
              AND aos.area_level = 'district'
              AND aos.median_price_paise IS NOT NULL
            """;

    /** Pass 2c — UPDATE property_type_dist on district rows. */
    private static final String PROPERTY_TYPE_DIST_DISTRICT_SQL = """
            WITH type_counts AS (
              SELECT
                CONCAT(
                  split_part(area_key, '|', 1), '|',
                  split_part(area_key, '|', 2), '|',
                  split_part(area_key, '|', 3)
                ) AS district_key,
                property_type,
                COUNT(*) AS cnt
              FROM property_listings
              WHERE area_key IS NOT NULL
                AND array_length(string_to_array(area_key, '|'), 1) = 4
                AND property_type IS NOT NULL
                AND is_duplicate = false AND is_valid = true
                AND status IN ('SCRAPED', 'LIVE')
                AND created_at >= NOW() - INTERVAL '90 days'
              GROUP BY district_key, property_type
            ),
            totals AS (
              SELECT district_key, SUM(cnt) AS total FROM type_counts GROUP BY district_key
            ),
            dist AS (
              SELECT tc.district_key,
                     jsonb_object_agg(tc.property_type,
                       ROUND(tc.cnt::NUMERIC / t.total, 2)) AS dist
              FROM type_counts tc JOIN totals t ON t.district_key = tc.district_key
              GROUP BY tc.district_key
            )
            UPDATE area_overview_stats SET property_type_dist = d.dist
            FROM dist d
            WHERE area_overview_stats.area_key = d.district_key
              AND area_overview_stats.area_level = 'district'
            """;
}
