package com.example.realestate.quality;

import org.springframework.stereotype.Component;

/**
 * Determines whether a newly-computed quality breakdown is materially different from
 * the previous one, and therefore warrants appending a new history row.
 *
 * <h3>Materiality rule</h3>
 * <ul>
 *   <li>If {@code prevBreakdownJson == null} (first-ever computation for this listing):
 *       always material — append.</li>
 *   <li>Otherwise: compare the canonical JSON strings byte-for-byte.
 *       Identical → not material (suppress). Different → material (append).</li>
 * </ul>
 *
 * <p>Canonical equality is guaranteed because {@link QualityScoreService#toCanonicalJson}
 * produces a deterministic, byte-identical JSON string for identical inputs (fixed field
 * order, same formatting, same rounding). The insufficient-data diagnostic JSON
 * ({@code {"status":"insufficient_data","missing":[...]}}) participates in the same
 * materiality check — it is appended the first time it occurs, then suppressed until
 * the breakdown changes.
 *
 * <p>This component is package-private so that only {@link QualityRecomputeService}
 * in the same package can use it. No other caller should bypass the orchestrator.
 */
@Component
public class QualityHistoryPolicy {

    /**
     * Returns {@code true} if the new breakdown should be appended to
     * {@code listing_quality_history}.
     *
     * @param prevBreakdownJson canonical JSON of the latest prior history row, or
     *                          {@code null} if no history exists yet
     * @param newBreakdownJson  canonical JSON (or diagnostic JSON) of the new computation
     * @return {@code true} when an append is warranted
     */
    public boolean isMaterial(String prevBreakdownJson, String newBreakdownJson) {
        // First-ever computation: always append
        if (prevBreakdownJson == null) {
            return true;
        }
        // Same canonical string → identical result, suppress duplicate history row
        return !prevBreakdownJson.equals(newBreakdownJson);
    }
}
