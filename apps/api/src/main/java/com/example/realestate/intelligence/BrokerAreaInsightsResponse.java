package com.example.realestate.intelligence;

import java.math.BigDecimal;

/**
 * Broker-facing area-insights response DTO.
 *
 * <p>Returned by {@link BrokerAreaInsightsController} for
 * {@code GET /api/broker/areas/{citySlug}/{areaKey}/insights}.
 *
 * <h3>Two-category suppression model (AC5 / [suppression_model])</h3>
 * <ul>
 *   <li><b>SHARED aggregates</b> ({@link AreaMetrics}): use
 *       {@link BuyerAreaIntelligenceResponse.Metric Metric&lt;T&gt;} with BOXED values.
 *       A {@code null} value signals k-anon suppression or absent data — NEVER a fake 0.
 *       Confidence label carries the honest state.</li>
 *   <li><b>BROKER-OWN counts</b> ({@link BrokerMetrics}): primitive {@code int}s — always
 *       present, always first-party. A real 0 is a TRUE ZERO rendered with broker framing,
 *       NOT an unavailable/suppressed signal. Distinct type + distinct UI from category (a).</li>
 * </ul>
 *
 * <p>Reuses {@link BuyerAreaIntelligenceResponse.Metric Metric&lt;T&gt;} from the buyer API
 * for the shared area sub-object — identical k-anon semantics.
 */
public record BrokerAreaInsightsResponse(
        String citySlug,
        String areaKey,
        String areaLabel,
        boolean available,
        String confidenceLabel,
        AreaMetrics area,
        BrokerMetrics broker
) {

    /**
     * SHARED area-level metrics — sourced from {@code area_intelligence_snapshot}
     * and {@code area_demand_signal}.
     *
     * <p>Every field uses {@link BuyerAreaIntelligenceResponse.Metric Metric&lt;T&gt;}
     * so k-anon suppression is represented as a JSON-null value + honest label.
     * Never renders 0 for a suppressed value.
     */
    public record AreaMetrics(
            BuyerAreaIntelligenceResponse.Metric<Long>       medianPricePaise,
            BuyerAreaIntelligenceResponse.Metric<String>     dominantPropertyType,
            BuyerAreaIntelligenceResponse.Metric<Integer>    activeListingCount,
            BuyerAreaIntelligenceResponse.Metric<Integer>    freshListingCount,
            BuyerAreaIntelligenceResponse.Metric<BigDecimal> avgListingQuality,
            BuyerAreaIntelligenceResponse.Metric<Integer>    topBuyerNeedSignalCount
    ) {}

    /**
     * BROKER-SCOPED first-party metrics — derived from the calling broker's own
     * LIVE listings and enquiries via CallerInfo.userId(). Always present as
     * primitive {@code int}s; 0 is a true zero, NOT a suppressed-null surrogate.
     *
     * <p>Every predicate in each count MUST include {@code created_by/broker_id = brokerId}
     * per [idor_enforcement.predicates] — any missing filter is an IDOR defect.
     */
    public record BrokerMetrics(
            /** Count of the broker's own LIVE, non-archived, non-duplicate, non-scraped listings in this area. */
            int liveListingsInArea,
            /** Subset of liveListingsInArea where quality_score IS NOT NULL AND quality_score < threshold. */
            int listingsNeedingAttention,
            /** Count of viewing_requests on the broker's own LIVE area listings. */
            int enquiriesOnBrokerListings,
            /**
             * Qualifying demand-signal gaps (confidence != 'insufficient_data') for this area
             * MINUS the broker's own capturing LIVE listings.
             * Broker-side term uses created_by=brokerId; shared signal term is area-keyed only.
             */
            int opportunitiesToAct
    ) {}
}
