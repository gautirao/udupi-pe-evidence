package com.example.realestate.intelligence;

/**
 * Projection interface for the native GROUP BY aggregate query in
 * {@link AreaIntelligenceRepository}.
 *
 * <p>All numeric types are nullable-safe: {@code scoredCount} and {@code live90dCount}
 * are {@link Long} to accommodate JDBC mapping from SQL COUNT; {@code avgQuality} is
 * {@link Double} and will be {@code null} when no rows have a non-null quality_score.
 */
public interface AreaIntelligenceRow {

    /** The area key, e.g. {@code IN|KA|Udupi|Manipal}. Never null (filtered by query). */
    String getAreaKey();

    /** Human-readable area label; may be null if no label has been set. */
    String getAreaLabel();

    /** Total count of LIVE, non-archived, non-duplicate listings created in the last 90 days. */
    Long getLive90dCount();

    /**
     * Count of listings in the LIVE-90d window that have a non-null quality_score.
     * Zero when backfill has not yet run for this area.
     */
    Long getScoredCount();

    /**
     * Average quality score over listings where quality_score IS NOT NULL.
     * {@code null} when {@code scoredCount} = 0 (backfill-incomplete state).
     * MUST NOT be coerced to 0.
     */
    Double getAvgQuality();
}
