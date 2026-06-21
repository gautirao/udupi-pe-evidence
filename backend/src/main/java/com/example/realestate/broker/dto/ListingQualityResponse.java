package com.example.realestate.broker.dto;

import java.time.Instant;
import java.util.List;

/**
 * Top-level response for GET /api/broker/listing-quality.
 *
 * @param generatedAt  Server timestamp when the response was assembled.
 * @param backfill     Backfill completeness summary.
 * @param aggregates   Server-side aggregates across all owner non-archived listings.
 * @param listings     Per-listing quality items.
 */
public record ListingQualityResponse(
        Instant generatedAt,
        BackfillStatus backfill,
        Aggregates aggregates,
        List<ListingQualityItem> listings
) {

    /**
     * Indicates whether the quality backfill is complete for the owner's listings.
     *
     * @param status       COMPLETE when scoredCount == totalCount, else INCOMPLETE.
     * @param scoredCount  Number of listings with a non-null quality_score.
     * @param totalCount   Total number of non-archived listings.
     */
    public record BackfillStatus(
            String status,
            int scoredCount,
            int totalCount
    ) {}

    /**
     * Server-side aggregates spanning all non-archived owner listings.
     *
     * @param averageQuality      Mean quality score over scored listings; null when none scored.
     * @param buyerReadyCount     Count of BUYER_READY listings.
     * @param needImprovementCount Count of NEEDS_IMPROVEMENT listings.
     * @param priorityFixesCount  DISTINCT count: PRIORITY_FIX band OR has >=1 HIGH-impact fix.
     * @param filterCounts        Counts per filter tab.
     */
    public record Aggregates(
            Double averageQuality,
            int buyerReadyCount,
            int needImprovementCount,
            int priorityFixesCount,
            FilterCounts filterCounts
    ) {}

    /**
     * Counts used to drive UI filter tabs.
     *
     * @param all             Total non-archived listings.
     * @param buyerReady      BUYER_READY band count.
     * @param needImprovement NEEDS_IMPROVEMENT band count.
     * @param priorityFix     PRIORITY_FIX band count (raw band count, not DISTINCT priorityFix rule).
     * @param notScored       UNSCORED listings count.
     */
    public record FilterCounts(
            int all,
            int buyerReady,
            int needImprovement,
            int priorityFix,
            int notScored
    ) {}
}
