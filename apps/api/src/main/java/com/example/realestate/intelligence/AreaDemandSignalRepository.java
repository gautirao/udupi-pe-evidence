package com.example.realestate.intelligence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

/**
 * Repository for {@link AreaDemandSignal}.
 *
 * <p>Provides:
 * <ol>
 *   <li>A single native aggregate query ({@link #findRawAggregates}) — ONE SQL statement
 *       per window, no N+1. Uses a DEMAND CTE FULL OUTER JOIN SUPPLY CTE on the 5 bucket
 *       keys, COALESCEing counts to 0 for half-present buckets.
 *   <li>A DELETE-before-insert helper ({@link #deleteByPeriodStartAndWindowDays}) for
 *       idempotent batch replacement of a (period_start, window_days) run.
 *   <li>A targeted batched UPDATE ({@link #updateDemandScore}) to write the collapsed
 *       demand_score back to {@code area_intelligence_snapshot} without re-running the
 *       full snapshot recompute.
 * </ol>
 *
 * <p><b>No N+1 guarantee (AC11):</b> the entire rollup for one window is ONE SQL statement.
 * Classification and suppression are pure Java over the returned list. The demand_score
 * collapse is set-based (weighted mean over non-suppressed rows in the service).
 * The snapshot write-back is one batched UPDATE per (city_slug, area_key) pair.
 *
 * <p><b>Idempotency (AC9):</b> DELETE WHERE (period_start, window_days) before INSERT
 * ensures re-running the rollup over the same data produces no PK duplicates.
 *
 * <p><b>budget_band CASE for SUPPLY (D2/b2, AC12):</b> EXACT paise thresholds reproducing
 * client {@code toPriceBand} half-open intervals (1 rupee = 100 paise):
 * 5L = 50_000_000 paise, 20L = 200_000_000, 50L = 500_000_000,
 * 1CR = 1_000_000_000, 2CR = 2_000_000_000.
 * Boundary: {@code price_paise < 50_000_000} → UNDER_5L;
 * exactly 50_000_000 → 5L_20L (half-open [lo, hi)).
 *
 * <p><b>INNER JOINs (AC13, D6):</b> listings or events with unmapped area_key (no matching
 * row in {@code areas}) are silently excluded on both sides — consistent with the existing
 * supply aggregate in {@link AreaIntelligenceSnapshotRepository}.
 */
public interface AreaDemandSignalRepository
        extends JpaRepository<AreaDemandSignal, AreaDemandSignalId> {

    /**
     * Execute the DEMAND CTE FULL OUTER JOIN SUPPLY CTE rollup for a given rolling window.
     *
     * <p>ONE SQL statement per window — no N+1. Returns one row per
     * {@code (city_slug, area_key, property_type, listing_purpose, budget_band)} bucket
     * that appears in either demand or supply (FULL OUTER JOIN). Counts are COALESCEd
     * to 0 for the absent side.
     *
     * <p>DEMAND CTE: aggregates {@code discover_event} rows within
     * {@code [:windowDays * INTERVAL '1 day']} by the 5 bucket keys; JOINs
     * {@code areas} and {@code cities} for {@code city_slug}; excludes rows where
     * {@code area_key}, {@code property_type}, or {@code listing_purpose} is NULL;
     * uses {@code COALESCE(price_band, 'UNSPECIFIED')} for budget_band.
     *
     * <p>SUPPLY CTE: counts LIVE-90d non-archived non-duplicate listings from
     * {@code property_listings} by the same 5 bucket keys; uses the EXACT area-aggregate
     * LIVE predicate; maps {@code price_paise} to budget_band via the locked D2 CASE.
     *
     * <p>FULL OUTER JOIN on all 5 bucket keys; output COALESCE(d.city_slug, s.city_slug) etc.
     *
     * @param windowDays rolling window length in days (e.g. 7 or 30)
     * @return one row per bucket; empty list when no demand or supply data exists
     */
    @Query(value = """
            WITH demand AS (
                SELECT
                    c.slug                                                           AS city_slug,
                    de.area_key                                                      AS area_key,
                    de.property_type                                                 AS property_type,
                    de.listing_purpose                                               AS listing_purpose,
                    COALESCE(de.price_band, 'UNSPECIFIED')                          AS budget_band,
                    COUNT(*) FILTER (WHERE de.event_type = 'FILTER_APPLY')          AS search_count,
                    COUNT(*) FILTER (WHERE de.event_type = 'PANEL_OPEN')            AS panel_open_count,
                    COUNT(*) FILTER (WHERE de.event_type = 'LEAD_INTENT')           AS lead_intent_count
                FROM discover_event de
                INNER JOIN areas a  ON a.area_key = de.area_key
                INNER JOIN cities c ON c.id       = a.city_id
                WHERE de.ts              >= NOW() - (:windowDays * INTERVAL '1 day')
                  AND de.area_key         IS NOT NULL
                  AND de.property_type    IS NOT NULL
                  AND de.listing_purpose  IS NOT NULL
                GROUP BY c.slug, de.area_key, de.property_type, de.listing_purpose, budget_band
            ),
            supply AS (
                SELECT
                    c.slug                                                           AS city_slug,
                    pl.area_key                                                      AS area_key,
                    pl.property_type                                                 AS property_type,
                    pl.listing_purpose                                               AS listing_purpose,
                    CASE
                        WHEN pl.price_paise IS NULL OR pl.price_paise <= 0  THEN 'UNSPECIFIED'
                        WHEN pl.price_paise <   50000000                    THEN 'UNDER_5L'
                        WHEN pl.price_paise <  200000000                    THEN '5L_20L'
                        WHEN pl.price_paise <  500000000                    THEN '20L_50L'
                        WHEN pl.price_paise < 1000000000                    THEN '50L_1CR'
                        WHEN pl.price_paise < 2000000000                    THEN '1CR_2CR'
                        ELSE                                                      'ABOVE_2CR'
                    END                                                              AS budget_band,
                    COUNT(*)                                                         AS listing_count
                FROM property_listings pl
                INNER JOIN areas a  ON a.area_key = pl.area_key
                INNER JOIN cities c ON c.id       = a.city_id
                WHERE pl.status       = 'LIVE'
                  AND pl.archived_at  IS NULL
                  AND pl.is_duplicate = false
                  AND pl.created_at  >= NOW() - INTERVAL '90 days'
                  AND pl.area_key     IS NOT NULL
                GROUP BY c.slug, pl.area_key, pl.property_type, pl.listing_purpose, budget_band
            )
            SELECT
                COALESCE(d.city_slug,       s.city_slug)        AS "citySlug",
                COALESCE(d.area_key,        s.area_key)         AS "areaKey",
                COALESCE(d.property_type,   s.property_type)    AS "propertyType",
                COALESCE(d.listing_purpose, s.listing_purpose)  AS "listingPurpose",
                COALESCE(d.budget_band,     s.budget_band)      AS "budgetBand",
                COALESCE(d.search_count,       0)               AS "searchCount",
                COALESCE(d.panel_open_count,   0)               AS "panelOpenCount",
                COALESCE(d.lead_intent_count,  0)               AS "leadIntentCount",
                COALESCE(s.listing_count,      0)               AS "listingCount"
            FROM demand d
            FULL OUTER JOIN supply s
                ON  d.city_slug       = s.city_slug
                AND d.area_key        = s.area_key
                AND d.property_type   = s.property_type
                AND d.listing_purpose = s.listing_purpose
                AND d.budget_band     = s.budget_band
            ORDER BY
                COALESCE(d.city_slug,       s.city_slug),
                COALESCE(d.area_key,        s.area_key),
                COALESCE(d.property_type,   s.property_type),
                COALESCE(d.listing_purpose, s.listing_purpose),
                COALESCE(d.budget_band,     s.budget_band)
            """,
            nativeQuery = true)
    List<AreaDemandSignalRow> findRawAggregates(@Param("windowDays") int windowDays);

    /**
     * Load all {@link AreaDemandSignal} rows for a specific (window_days, period_start) pair.
     *
     * <p>Used by {@link AreaDemandSignalService#writeBackDemandScores} to fetch ONLY the
     * canonical 30d rows for the current run — avoids a full-table scan and OOM risk at
     * production cadence (replaces the previous {@code findAll().stream().filter()} pattern).
     *
     * <p>Spring Data derives the query as:
     * {@code SELECT * FROM area_demand_signal WHERE window_days = ? AND period_start = ?}.
     * The secondary index on (city_slug, area_key) does not cover this predicate; Postgres
     * will use a sequential scan on the bounded result set for the given period_start.
     * This is acceptable: the result set is O(buckets for one run), not the full table.
     *
     * @param windowDays  rolling window length (pass {@link AreaDemandSignalRollupJob#CANONICAL_WINDOW_DAYS})
     * @param periodStart UTC-hour-truncated anchor for this run
     * @return all signal rows for this window and period (may be empty)
     */
    List<AreaDemandSignal> findByWindowDaysAndPeriodStart(int windowDays, Instant periodStart);

    /**
     * Delete all rows for a given (period_start, window_days) batch.
     *
     * <p>Called before inserting the new batch to ensure idempotent re-runs produce
     * no PK duplicates. Using DELETE-before-insert rather than ON CONFLICT UPDATE
     * because the service computes gap_score + classification in Java and then writes
     * fully formed entities via saveAllAndFlush.
     *
     * @param periodStart the period_start anchor for this run (UTC-truncated to hour)
     * @param windowDays  the rolling window length
     * @return number of rows deleted
     */
    @Modifying
    @Query(value = """
            DELETE FROM area_demand_signal
            WHERE period_start = :periodStart
              AND window_days  = :windowDays
            """,
            nativeQuery = true)
    int deleteByPeriodStartAndWindowDays(@Param("periodStart") Instant periodStart,
                                          @Param("windowDays") int windowDays);

    /**
     * Write the collapsed demand_score back to {@code area_intelligence_snapshot}
     * for a single (city_slug, area_key) pair.
     *
     * <p>Additive-only: only {@code demand_score} is updated; no other snapshot column
     * is touched. This is a runtime UPDATE, NOT a DDL change. Runs after the
     * {@code area_demand_signal} rows for the canonical 30d window have been persisted.
     *
     * <p>Setting {@code demand_score = NULL} (when all buckets are suppressed) is
     * intentional and required — explicitly marks the area as having no valid demand
     * signal this run. NEVER passes 0 as a surrogate.
     *
     * @param demandScore the volume-weighted mean gap_score (HALF_UP, scale 2), or NULL
     * @param citySlug    city slug identifying the snapshot row
     * @param areaKey     area key identifying the snapshot row
     * @return number of rows updated (0 when snapshot row does not yet exist; 1 otherwise)
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE area_intelligence_snapshot
               SET demand_score = :demandScore
             WHERE city_slug = :citySlug
               AND area_key  = :areaKey
            """,
            nativeQuery = true)
    int updateDemandScore(@Param("demandScore") java.math.BigDecimal demandScore,
                          @Param("citySlug") String citySlug,
                          @Param("areaKey") String areaKey);

    /**
     * Return per-area demand event totals from the LATEST 30-day rollup run.
     *
     * <p>Reads PERSISTED {@code area_demand_signal} rows — does NOT re-derive from
     * {@code discover_event} or {@code property_listings}. Uses a subquery to pin
     * {@code period_start} to the single latest run for {@code window_days = 30}
     * so multiple historical runs do not double-count.
     *
     * <p>ONE SQL statement, no N+1. The secondary index
     * {@code idx_area_demand_signal_city_area (city_slug, area_key)} is used.
     *
     * <p>Both suppressed (gap_score IS NULL) and non-suppressed rows contribute to the
     * total — suppression is applied at the area level in {@link AdminIntelligenceService}
     * using {@link AggregationConstants#K_ANON_MIN}.
     *
     * @return one row per (city_slug, area_key) in the latest 30d window;
     *         empty list when no data has been rolled up yet
     */
    @Query(value = """
            SELECT
                ads.city_slug                                              AS "citySlug",
                ads.area_key                                               AS "areaKey",
                SUM(ads.search_count + ads.panel_open_count
                    + ads.lead_intent_count)                               AS "demandEventTotal"
            FROM area_demand_signal ads
            WHERE ads.window_days  = 30
              AND ads.period_start = (
                  SELECT MAX(period_start)
                  FROM area_demand_signal
                  WHERE window_days = 30
              )
            GROUP BY ads.city_slug, ads.area_key
            ORDER BY ads.city_slug, ads.area_key
            """,
            nativeQuery = true)
    List<AreaDemandSummaryRow> findDemandTotalsByLatestWindow30();

    /**
     * Return the top-3 non-suppressed gap buckets per area from the LATEST 30-day rollup run.
     *
     * <p>Reads PERSISTED {@code area_demand_signal} rows only. Excludes suppressed buckets
     * ({@code gap_score IS NULL}). Orders by {@code gap_score DESC} with a stable tie-break
     * on {@code (property_type, listing_purpose, budget_band)} to ensure deterministic output
     * when multiple buckets share the same gap_score.
     *
     * <p>Uses a windowed {@code ROW_NUMBER()} sub-select to pick at most 3 rows per
     * {@code (city_slug, area_key)} in ONE SQL statement — no N+1.
     *
     * @return at most 3 rows per (city_slug, area_key) in the latest 30d window;
     *         empty list when no non-suppressed buckets exist
     */
    @Query(value = """
            SELECT
                rn.city_slug       AS "citySlug",
                rn.area_key        AS "areaKey",
                rn.property_type   AS "propertyType",
                rn.listing_purpose AS "listingPurpose",
                rn.budget_band     AS "budgetBand",
                rn.signal_type     AS "signalType",
                rn.gap_score       AS "gapScore",
                rn.confidence      AS "confidence"
            FROM (
                SELECT
                    ads.city_slug,
                    ads.area_key,
                    ads.property_type,
                    ads.listing_purpose,
                    ads.budget_band,
                    ads.signal_type,
                    ads.gap_score,
                    ads.confidence,
                    ROW_NUMBER() OVER (
                        PARTITION BY ads.city_slug, ads.area_key
                        ORDER BY ads.gap_score DESC,
                                 ads.property_type,
                                 ads.listing_purpose,
                                 ads.budget_band
                    ) AS rn
                FROM area_demand_signal ads
                WHERE ads.window_days  = 30
                  AND ads.period_start = (
                      SELECT MAX(period_start)
                      FROM area_demand_signal
                      WHERE window_days = 30
                  )
                  AND ads.gap_score IS NOT NULL
            ) rn
            WHERE rn.rn <= 3
            ORDER BY rn.city_slug, rn.area_key, rn.rn
            """,
            nativeQuery = true)
    List<AreaTopGapRow> findTop3GapsByLatestWindow30();
}
