package com.example.realestate.intelligence;

import com.example.realestate.booking.ViewingRequestRepository;
import com.example.realestate.listing.core.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Broker-facing area-insights read service.
 *
 * <h3>Composition model</h3>
 * <ol>
 *   <li>SHARED aggregates: {@link AreaIntelligenceSnapshotRepository#findById} (composite key)
 *       for pre-computed snapshot data. Missing snapshot → {@code available=false}, NOT 404.</li>
 *   <li>BROKER-SCOPED counts: ADD-ONLY count queries in {@link ListingRepository} and
 *       {@link ViewingRequestRepository}, all filtered by {@code created_by/broker_id = brokerId}
 *       from the JWT — NEVER from the request path/query/body.</li>
 * </ol>
 *
 * <h3>Suppression model (AC5 / [suppression_model])</h3>
 * <ul>
 *   <li>SHARED aggregates use {@link BuyerAreaIntelligenceResponse.Metric Metric&lt;T&gt;} (boxed null).
 *       Sub-threshold or absent → {@code value=null}, honest {@code confidenceLabel}.</li>
 *   <li>BROKER-OWN counts are primitive {@code int} — always present; 0 = true zero, not suppression.</li>
 * </ul>
 *
 * <h3>IDOR enforcement (AC3 / AC12 / [idor_enforcement])</h3>
 * <ul>
 *   <li>{@code brokerId} is ALWAYS {@link com.example.realestate.security.CallerInfo#userId()}
 *       passed by the controller. The service accepts it as a parameter and never reads
 *       any broker identity from a request field.</li>
 *   <li>Every broker-scoped count includes {@code created_by=:brokerId} or
 *       {@code broker_id=:brokerId} per [idor_enforcement.predicates].</li>
 * </ul>
 *
 * <h3>Scraped-supply exclusion (AC7)</h3>
 * <ul>
 *   <li>All broker-scoped queries filter {@code status='LIVE'} AND {@code raw_post_id IS NULL},
 *       excluding scraped/M28-prep supply. No reuse of existing scraped-inclusive methods.</li>
 * </ul>
 */
@Service
public class BrokerAreaInsightsService {

    private static final Logger log = LoggerFactory.getLogger(BrokerAreaInsightsService.class);

    /**
     * Quality score threshold for "needs attention" — listings with a non-null quality_score
     * below this value are counted in {@code listingsNeedingAttention}.
     * NULL quality_score = unscored, excluded (not counted as needing attention).
     *
     * <p>Value aligns with the #1521 "needs fixes" band (quality_score < 60). Named here
     * as a single source of truth per [team_lead_decisions.needs_attention_threshold].
     */
    static final int QUALITY_NEEDS_ATTENTION_MAX = 60;

    private static final String NOT_ENOUGH_DATA =
            BuyerConfidenceLabel.NOT_ENOUGH_DATA.getDisplayLabel();

    private final AreaIntelligenceSnapshotRepository snapshotRepository;
    private final ListingRepository listingRepository;
    private final ViewingRequestRepository viewingRequestRepository;

    public BrokerAreaInsightsService(
            AreaIntelligenceSnapshotRepository snapshotRepository,
            ListingRepository listingRepository,
            ViewingRequestRepository viewingRequestRepository) {
        this.snapshotRepository = snapshotRepository;
        this.listingRepository = listingRepository;
        this.viewingRequestRepository = viewingRequestRepository;
    }

    /**
     * Returns broker-facing area insights for the given city/area pair and broker.
     *
     * <p>Always returns a populated response — never throws for a missing snapshot row.
     * The {@code available} field distinguishes "data present" from "no snapshot data".
     * Broker-scoped counts are ALWAYS returned (primitive int, 0 = true zero).
     *
     * @param citySlug  city slug (e.g. "udupi") — JWT-agnostic, identifies the area
     * @param areaKey   area key (e.g. "IN|KA|Udupi|Malpe") — path param, identifies the area
     * @param brokerId  the calling broker's UUID from CallerInfo.userId() — NEVER client-supplied
     * @return populated response; available=false when no snapshot exists
     */
    @Transactional(readOnly = true)
    public BrokerAreaInsightsResponse getAreaInsights(String citySlug, String areaKey, UUID brokerId) {
        log.debug("getAreaInsights citySlug={} areaKey={} brokerId={}", citySlug, areaKey, brokerId);

        Optional<AreaIntelligenceSnapshot> snapshotOpt =
                snapshotRepository.findById(new AreaIntelligenceSnapshotId(citySlug, areaKey));

        // BROKER-SCOPED counts — always derived from brokerId regardless of snapshot presence.
        // liveListingsInArea, listingsNeedingAttention, and enquiriesOnBrokerListings are the
        // broker's own first-party data and are returned even when no area snapshot exists.
        int liveListings = listingRepository.countBrokerLiveListingsInArea(brokerId, areaKey);
        int needsAttention = listingRepository.countBrokerListingsNeedingAttention(
                brokerId, areaKey, QUALITY_NEEDS_ATTENTION_MAX);
        int enquiries = viewingRequestRepository.countEnquiriesOnBrokerAreaListings(brokerId, areaKey);

        if (snapshotOpt.isEmpty()) {
            // No area intelligence context — opportunitiesToAct requires shared demand-signal data
            // which is only meaningful alongside a snapshot. Return 0 to avoid surfacing "N
            // opportunities" while every shared metric reads as unavailable (available=false).
            // Do NOT query countQualifyingDemandSignalsForArea in this branch.
            log.debug("No snapshot for citySlug={} areaKey={} — returning available=false", citySlug, areaKey);
            BrokerAreaInsightsResponse.BrokerMetrics unavailableBrokerMetrics =
                    new BrokerAreaInsightsResponse.BrokerMetrics(liveListings, needsAttention, enquiries, 0);
            return buildUnavailableResponse(citySlug, areaKey, unavailableBrokerMetrics);
        }

        // Snapshot is present — derive opportunitiesToAct from shared demand signals.
        // Query is scoped to this area only (no broker identity needed — demand signals are shared/anonymous).
        // confidence != 'insufficient_data' rows only (k-anon guard, mirrors the snapshot's confidence model).
        int qualifyingSignals = listingRepository.countQualifyingDemandSignalsForArea(areaKey);
        int opportunitiesToAct = Math.max(0, qualifyingSignals - liveListings);

        BrokerAreaInsightsResponse.BrokerMetrics brokerMetrics = new BrokerAreaInsightsResponse.BrokerMetrics(
                liveListings,
                needsAttention,
                enquiries,
                opportunitiesToAct
        );

        return mapSnapshot(snapshotOpt.get(), brokerMetrics);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private BrokerAreaInsightsResponse mapSnapshot(
            AreaIntelligenceSnapshot s, BrokerAreaInsightsResponse.BrokerMetrics brokerMetrics) {

        String overallLabel = resolveOverallLabel(s);

        // k-anon suppression: when price_comparison_supported=false, area has < K_ANON_MIN listings
        boolean suppressed = !s.isPriceComparisonSupported();

        BrokerAreaInsightsResponse.AreaMetrics areaMetrics = new BrokerAreaInsightsResponse.AreaMetrics(
                metricOf(s.getMedianPricePaise(), overallLabel),
                metricOf(s.getDominantPropertyType(), overallLabel),
                countMetric(s.getActiveListingCount(), suppressed, overallLabel),
                countMetric(s.getFreshListingCount(), suppressed, overallLabel),
                metricOf(s.getAvgListingQuality(), overallLabel),
                // topBuyerNeedSignalCount: always suppressed/null here — demand_signal aggregation
                // is kept simple; the top buyer need is the opportunitiesToAct signal itself
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA)
        );

        return new BrokerAreaInsightsResponse(
                s.getCitySlug(),
                s.getAreaKey(),
                s.getAreaLabel(),
                true,
                overallLabel,
                areaMetrics,
                brokerMetrics
        );
    }

    /**
     * Coherent UNAVAILABLE response for the no-snapshot case.
     * Broker-scoped counts are still included (always present, possibly all-0).
     */
    private BrokerAreaInsightsResponse buildUnavailableResponse(
            String citySlug, String areaKey, BrokerAreaInsightsResponse.BrokerMetrics brokerMetrics) {

        BrokerAreaInsightsResponse.AreaMetrics areaMetrics = new BrokerAreaInsightsResponse.AreaMetrics(
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA)
        );

        return new BrokerAreaInsightsResponse(
                citySlug,
                areaKey,
                null,
                false,
                NOT_ENOUGH_DATA,
                areaMetrics,
                brokerMetrics
        );
    }

    /**
     * Resolves the overall buyer confidence display label from the snapshot's stored confidence
     * string. Defensive: drifted confidence values log a WARN and fall back to NOT_ENOUGH_DATA.
     */
    private String resolveOverallLabel(AreaIntelligenceSnapshot s) {
        try {
            return BuyerConfidenceLabel.ofLabel(s.getConfidence()).getDisplayLabel();
        } catch (IllegalArgumentException ex) {
            log.warn("Unrecognised confidence '{}' for city={} areaKey={}; defaulting to NOT_ENOUGH_DATA",
                    s.getConfidence(), s.getCitySlug(), s.getAreaKey());
            return NOT_ENOUGH_DATA;
        }
    }

    /**
     * Wraps a nullable value in a {@link BuyerAreaIntelligenceResponse.Metric}.
     * When value is null the metric label is always "Not enough data yet".
     */
    private <T> BuyerAreaIntelligenceResponse.Metric<T> metricOf(T value, String overallLabel) {
        if (value == null) {
            return new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA);
        }
        return new BuyerAreaIntelligenceResponse.Metric<>(value, overallLabel);
    }

    /**
     * Wraps an integer count metric with k-anonymity suppression.
     * When suppressed=true the exact count is withheld (null + NOT_ENOUGH_DATA).
     */
    private BuyerAreaIntelligenceResponse.Metric<Integer> countMetric(
            int value, boolean suppressed, String overallLabel) {
        if (suppressed) {
            return new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA);
        }
        return new BuyerAreaIntelligenceResponse.Metric<>(value, overallLabel);
    }
}
