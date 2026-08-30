package com.example.realestate.listing.crud;

import com.example.realestate.listing.api.BrokerQualitySummaryResponse;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse.ActionSignalBucket;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse.ActionSignals;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse.DemandGap;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse.Engagement;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse.Portfolio;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse.Quality;
import com.example.realestate.listing.core.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Service for broker-scoped portfolio quality aggregates.
 *
 * <p>All data is read from persisted {@code quality_score} (smallint, nullable) and
 * {@code quality_breakdown} (jsonb, nullable) columns in {@code property_listings}.
 * Null-honest protocol: {@code averageQualityScore} is null when no scores exist;
 * {@code percentageComputed} is null when the broker has no listings.
 * No COALESCE-to-zero in SQL — caller distinguishes "no data" from "zero score".
 *
 * <p>Engagement and demandGap are honest stubs — no event data exists until #1531 / M30.
 */
@Service
public class BrokerDashboardService {

    private static final Logger log = LoggerFactory.getLogger(BrokerDashboardService.class);

    // --- Tunable thresholds ---

    /** Listings with quality_score strictly below this value appear in needsFixes. Score 60 is NOT needsFixes. */
    static final int NEEDS_FIXES_THRESHOLD = 60;

    /** Listings with quality_score >= this value appear in buyerReady. Score 80 IS buyerReady. */
    static final int BUYER_READY_THRESHOLD = 80;

    /**
     * LOCATION component score strictly below this value triggers missingLocation.
     * Score 75 is NOT missing-location.
     */
    static final int MISSING_LOCATION_THRESHOLD = 75;

    /**
     * KEY_FIELDS / PHOTOS / DESCRIPTION component score strictly below this value triggers incomplete.
     * Score 50 is NOT incomplete (for this component-level check; DRAFT status always triggers incomplete).
     */
    static final int INCOMPLETE_THRESHOLD = 50;

    private final ListingRepository listingRepository;

    public BrokerDashboardService(ListingRepository listingRepository) {
        this.listingRepository = listingRepository;
    }

    /**
     * Returns a null-safe quality summary for the caller's non-archived listings.
     *
     * <p>Ownership is enforced at the SQL layer (WHERE created_by = userId).
     * This method never receives a brokerId from the client — the caller passes
     * the JWT-resolved userId only.
     *
     * @param userId  JWT-resolved broker UUID; never client-supplied
     * @return populated response; never null; sub-fields may contain null integers
     *         when data is absent (zero listings, all-null scores, etc.)
     */
    @Transactional(readOnly = true)
    public BrokerQualitySummaryResponse getQualitySummary(UUID userId) {

        // COUNT(*) guarantees exactly one row; use List<Object[]> return type to match
        // Hibernate 6 / Spring Data JPA 3 native-query unwrapping behaviour (same pattern
        // as countByStatusForUser). Never empty because COUNT(*) always returns a row.
        List<Object[]> rows = listingRepository.findQualitySummaryForUser(
                userId,
                NEEDS_FIXES_THRESHOLD,
                BUYER_READY_THRESHOLD,
                MISSING_LOCATION_THRESHOLD,
                INCOMPLETE_THRESHOLD);
        Object[] row = rows.get(0);

        // Individual cells may be null (e.g. avg_score when no scores exist).
        int totalCount    = toLong(row[0]).intValue();
        int computedCount = toLong(row[1]).intValue();
        Double avgScore   = toDouble(row[2]);        // null when computedCount == 0
        int activeCount   = toLong(row[3]).intValue();
        int needsFixes    = toLong(row[4]).intValue();
        int buyerReady    = toLong(row[5]).intValue();
        int missingLoc    = toLong(row[6]).intValue();
        int incomplete    = toLong(row[7]).intValue();

        log.debug("BrokerDashboardService.getQualitySummary userId={} total={} computed={} avg={}",
                userId, totalCount, computedCount, avgScore);

        // --- quality.state ---
        String qualityState = deriveState(computedCount, totalCount);

        // --- averageQualityScore: null when no scores; never COALESCE to 0 ---
        Integer averageQualityScore = (computedCount == 0 || avgScore == null)
                ? null
                : (int) Math.round(avgScore);

        // --- percentageComputed: null when broker has no listings at all; integer truncation (floor)
        //     so that coverage is never overstated. 2 computed / 3 total → 66, not 67.
        Integer percentageComputed = (totalCount == 0)
                ? null
                : (computedCount * 100) / totalCount;

        // --- action signals: each mirrors the portfolio quality state ---
        String signalState = qualityState;

        return new BrokerQualitySummaryResponse(
                new Portfolio(activeCount, totalCount),
                new Quality(qualityState, averageQualityScore, computedCount, totalCount, percentageComputed),
                new ActionSignals(
                        new ActionSignalBucket(needsFixes, signalState),
                        new ActionSignalBucket(missingLoc, signalState),
                        new ActionSignalBucket(incomplete, signalState),
                        new ActionSignalBucket(buyerReady, signalState)
                ),
                new Engagement("UNAVAILABLE", null, null,
                        "Engagement tracking is not yet available (#1531)"),
                new DemandGap("LIMITED_DATA", null,
                        "Demand gap analysis requires area-level demand signals (M30)")
        );
    }

    // --- private helpers ---

    /**
     * Derives the quality coverage state.
     * PENDING  — no scores computed yet
     * COMPLETE — all listings have scores
     * PARTIAL  — some but not all
     */
    private static String deriveState(int computedCount, int totalCount) {
        if (computedCount == 0) return "PENDING";
        if (computedCount == totalCount) return "COMPLETE";
        return "PARTIAL";
    }

    /**
     * Safely converts a nullable Number to Long.
     * Native SQL aggregate COUNT(*) always returns a non-null Number;
     * COUNT(col) also always returns a non-null Number (zero when none matched).
     * This guard is defensive against unexpected nulls from the result row.
     */
    private static Long toLong(Object value) {
        if (value == null) return 0L;
        return ((Number) value).longValue();
    }

    /**
     * Converts a nullable Number to Double; returns null when value is null.
     * AVG returns null when there are no non-null input values.
     */
    private static Double toDouble(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal bd) return bd.doubleValue();
        return ((Number) value).doubleValue();
    }
}
