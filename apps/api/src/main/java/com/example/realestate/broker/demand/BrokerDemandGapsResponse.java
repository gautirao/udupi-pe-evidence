package com.example.realestate.broker.demand;

import com.example.realestate.intelligence.BuyerAreaIntelligenceResponse.Metric;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Page payload DTO for {@code GET /api/broker/demand-gaps}.
 *
 * <p>All buyer-demand numeric fields are wrapped in {@link Metric}{@code <T>} — the
 * {@code value} field is null (JSON {@code null}) when suppressed or unavailable, NEVER 0
 * or a fabricated number. This is binding (k-anon null-honesty rule, AC4).
 *
 * <p>Fields are derived read-only from:
 * <ul>
 *   <li>{@code area_demand_signal} — demand counts, gap_score, signal_type, confidence</li>
 *   <li>{@code property_listings} LIVE — broker supply counts (never k-anon suppressed
 *       for the broker's OWN listing counts)</li>
 *   <li>{@code broker_market_focus} — optional focus buckets (fallback to broker LIVE buckets)</li>
 *   <li>{@code broker_demand_gap_state} — dismiss/read state (left-joined)</li>
 * </ul>
 *
 * <p>None of the demand-science values (gap_score, signal_type) are re-derived here —
 * they are read from {@code area_demand_signal} and passed through unchanged (AC5).
 */
public record BrokerDemandGapsResponse(
        Summary summary,
        List<GapItem> topGaps,
        List<GapItem> allGaps,
        List<CaptureDemandListing> captureDemandListings
) {

    /**
     * Page-level summary metrics for the broker.
     *
     * <p>All demand metrics are wrapped in {@link Metric} — null value = suppressed or
     * unavailable. brokerMatchingListings and opportunitiesToAct are derived counts;
     * they use Integer (not Metric) because they reflect the broker's own data,
     * which is never k-anon suppressed.
     */
    public record Summary(
            /**
             * Total buyer FILTER_APPLY event count across the broker's focus/coverage buckets
             * for the latest window. Source: area_demand_signal.search_count aggregate.
             * Null when all relevant buckets are suppressed (k-anon insufficient_data).
             */
            Metric<Long> buyerSearches,

            /**
             * Total LEAD_INTENT event count (highest-intent signal) across the broker's
             * focus/coverage buckets. Source: area_demand_signal.lead_intent_count.
             * Preferred source per plan open question resolution: lead_intent_count.
             * Null when no reliable source or all buckets suppressed.
             * NEVER fabricated; NEVER 0 to mask suppression.
             */
            Metric<Long> buyerEnquiries,

            /**
             * Count of demand-gap buckets qualifying for display after k-anon filtering
             * and derived-visibility resolution (dismissed + auto-resolved excluded).
             * Never null (broker count — not k-anon gated).
             */
            int demandGapsFound,

            /**
             * Count of qualifying gap buckets where the broker already has at least
             * {@link BrokerDemandGapsConfig#BROKER_LIVE_MIN} LIVE listing.
             * Never null (broker's own LIVE count — not k-anon gated).
             */
            int brokerMatchingListings,

            /**
             * Count of qualifying gap buckets where the broker has NO LIVE listing —
             * i.e., demandGapsFound - brokerMatchingListings.
             * Never null.
             */
            int opportunitiesToAct
    ) {}

    /**
     * A single demand-gap bucket surfaced to the broker.
     *
     * <p>Dismissed gaps are excluded from the payload — they exist in
     * {@code broker_demand_gap_state} with dismissed_at set but are not emitted here.
     * Derived-visibility auto-resolve: gaps where the broker already has a matching
     * LIVE listing are still shown (but marked via brokerLiveCount > 0) so the broker
     * can see their coverage; the bucket does NOT write to the state table for
     * auto-resolve — it simply remains visible with the coverage indicator.
     *
     * <p>The {@code id} is the {@code broker_demand_gap_state.id} UUID if a state row
     * exists for this bucket; null if the broker has not yet interacted with this gap.
     * The /alerts/{id}/read and /alerts/{id}/dismiss endpoints take this id.
     * When id is null the broker must first create the state row by calling the endpoint
     * — the service handles first-time upsert transparently.
     */
    public record GapItem(
            /** State row UUID — null if no state row exists yet for this broker/bucket. */
            UUID id,

            String areaKey,
            String propertyType,
            String listingPurpose,
            String budgetBand,

            /**
             * ISO week Monday UTC — the temporal identifier of this demand-gap bucket.
             * Matches broker_demand_gap_state.week if a state row exists.
             */
            java.time.LocalDate week,

            /**
             * Gap score from area_demand_signal.gap_score. Null when suppressed
             * (k-anon insufficient_data or degenerate peer population). NEVER 0 as surrogate.
             */
            Metric<Float> gapScore,

            /**
             * Signal classification READ from area_demand_signal.signal_type.
             * NOT re-derived here. Values: supply_gap | information_gap | price_signal | possible_gap.
             */
            String signalType,

            /**
             * Presentation action hint derived from signalType (READ-ONLY mapping):
             * supply_gap -> add_listing; information_gap -> improve_listing;
             * price_signal -> review_gap; possible_gap -> review_gap;
             * unknown/any-other -> review_gap (safe-degrade). See AC5.
             */
            String actionType,

            /** Demand confidence level from area_demand_signal.confidence. */
            Metric<String> confidence,

            /**
             * Buyer enquiries (lead_intent_count) for this bucket.
             * Null when suppressed. NEVER fabricated.
             */
            Metric<Long> buyerEnquiries,

            /**
             * Count of LIVE listings the calling broker has in this exact bucket.
             * Never null — the broker's own supply count is never k-anon suppressed.
             */
            int brokerLiveCount,

            /** Timestamp when the broker marked this gap as read. Null if not yet read. */
            Instant readAt,

            /** Timestamp when the broker dismissed this gap. Should always be null in the open payload. */
            Instant dismissedAt
    ) {}

    /**
     * A broker-owned LIVE listing surfaced as a "capture demand" opportunity.
     *
     * <p>Only LIVE listings owned by the calling broker ({@code created_by = brokerId}) and
     * matching at least one qualifying gap bucket are included. External/scraped records
     * from #1520 are never exposed here (R6 of the risk register).
     */
    public record CaptureDemandListing(
            UUID listingId,
            String title,
            String areaKey,
            String propertyType,
            String listingPurpose,
            /** Listing price in paise. Null if not set. */
            Long pricePaise,
            /**
             * Listing quality score (Short — boxed, nullable). Null until quality
             * scoring (#1521) has run for this listing. Never substituted with 0.
             */
            Short qualityScore
    ) {}
}
