package com.example.realestate.broker.demand;

import com.example.realestate.intelligence.AggregationConstants;
import com.example.realestate.intelligence.BuyerAreaIntelligenceResponse.Metric;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Service for the broker-facing demand-gaps API.
 *
 * <h3>Core design (PATH_C_MINIMAL, #1534)</h3>
 * <ul>
 *   <li>The full page payload is DERIVED READ-ONLY from merged infra:
 *       {@code area_demand_signal} (#1532 V96), LIVE supply from {@code property_listings},
 *       and optional {@code broker_market_focus} (#1533 V95).</li>
 *   <li>Auto-resolve is DERIVED VISIBILITY only — a gap disappears from the payload
 *       when the broker has a matching LIVE listing. No state-table write occurs for
 *       auto-resolve (the gap simply drops out).</li>
 *   <li>The ONLY persisted state is dismiss/read timestamps in
 *       {@code broker_demand_gap_state} (V97). Dismissed buckets are suppressed from the
 *       payload. A broker can also view them via GET /api/broker/alerts?status=all.</li>
 * </ul>
 *
 * <h3>Ownership contract</h3>
 * <ul>
 *   <li>broker_id is always the JWT-resolved userId passed by the controller.
 *       No client-supplied broker identity is accepted.</li>
 *   <li>Every SQL predicate includes {@code broker_id = :brokerId} (or
 *       {@code created_by = :brokerId} for listings). Ownership is enforced at the SQL
 *       layer on BOTH reads and dismiss/read writes.</li>
 *   <li>IDOR protection: load-then-verify-owner before any state mutation — the
 *       state row is loaded via {@link BrokerDemandGapStateRepository#findByIdAndBrokerId}
 *       which includes {@code broker_id = :brokerId} in the WHERE clause.</li>
 * </ul>
 *
 * <h3>K-anonymity rules</h3>
 * <ul>
 *   <li>{@link AggregationConstants#K_ANON_MIN} = 10 is the single source of truth.</li>
 *   <li>Buckets with {@code confidence = 'insufficient_data'} (gap_score IS NULL upstream)
 *       are excluded from the page payload entirely. They are never surfaced as a zero or
 *       fake number — the null value is preserved and excluded before exposure.</li>
 *   <li>The broker's OWN listing counts are never k-anon suppressed.</li>
 *   <li>Aggregates over suppressed buckets (e.g. buyerSearches sum) yield null, never 0.</li>
 * </ul>
 *
 * <h3>action_type mapping (presentation-only, AC5)</h3>
 * <pre>
 *   supply_gap      -> add_listing
 *   information_gap -> improve_listing
 *   price_signal    -> review_gap
 *   possible_gap    -> review_gap
 *   unknown / other -> review_gap  (safe-degrade — never throws)
 * </pre>
 * signal_type is READ from area_demand_signal; NEVER re-derived here.
 *
 * <h3>Broker focus / coverage fallback (plan open question)</h3>
 * <p>When the broker has rows in {@code broker_market_focus}, gaps are scoped to those
 * buckets. When no focus rows exist (focus is empty), the service falls back to the
 * broker's own LIVE listing (area_key, property_type, listing_purpose) buckets as a
 * conservative coverage set. No over-match is performed.
 */
@Service
public class BrokerDemandGapsService {

    private static final Logger log = LoggerFactory.getLogger(BrokerDemandGapsService.class);

    /** Confidence label for suppressed/insufficient data. Matches area_demand_signal.confidence CHECK. */
    private static final String INSUFFICIENT_DATA = "insufficient_data";

    /** Confidence display labels for surfaced data (passed through from area_demand_signal). */
    private static final String NOT_ENOUGH_DATA_LABEL = "Not enough data yet";
    private static final String OPEN_STATUS = "open";
    private static final String ALL_STATUS = "all";

    // ── SQL ──────────────────────────────────────────────────────────────────

    /**
     * Loads the latest area_demand_signal rows for the broker's coverage buckets.
     *
     * <p>Coverage = (area_key, property_type, listing_purpose) tuples that appear in
     * broker_market_focus for this broker. If no focus rows exist, falls back to the
     * broker's own LIVE listing (area_key, property_type, listing_purpose) as coverage.
     *
     * <p>Uses the most recent row per bucket (MAX period_start) to avoid surfacing
     * stale multi-window duplicates. Filters out insufficient_data (k-anon suppressed) rows.
     *
     * <p>Left-joins broker_demand_gap_state to surface dismiss/read state and to filter
     * out dismissed rows (dismissed_at IS NULL = not dismissed = should appear in open payload).
     *
     * <p>The budget_band 'UNSPECIFIED' is included — the broker may have demand in that band.
     */
    private static final String GAP_SQL = """
            WITH coverage AS (
                -- Preferred: broker's declared focus buckets
                SELECT area_key, property_type, listing_purpose
                FROM broker_market_focus
                WHERE broker_id = ?
                UNION
                -- Fallback: broker's LIVE listing buckets (when no focus rows exist for this broker)
                SELECT area_key, property_type, listing_purpose
                FROM property_listings
                WHERE created_by = ?
                  AND status = 'LIVE'
                  AND area_key IS NOT NULL
                  AND property_type IS NOT NULL
                  AND listing_purpose IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM broker_market_focus WHERE broker_id = ?
                  )
            ),
            latest_signal AS (
                SELECT DISTINCT ON (ads.area_key, ads.property_type, ads.listing_purpose, ads.budget_band)
                    ads.area_key,
                    ads.property_type,
                    ads.listing_purpose,
                    ads.budget_band,
                    ads.gap_score,
                    ads.signal_type,
                    ads.confidence,
                    ads.lead_intent_count,
                    ads.search_count
                FROM area_demand_signal ads
                INNER JOIN coverage c
                    ON c.area_key        = ads.area_key
                   AND c.property_type   = ads.property_type
                   AND c.listing_purpose = ads.listing_purpose
                WHERE ads.confidence != 'insufficient_data'
                ORDER BY ads.area_key, ads.property_type, ads.listing_purpose, ads.budget_band,
                         ads.period_start DESC
            ),
            broker_live AS (
                SELECT
                    area_key,
                    property_type,
                    listing_purpose,
                    CASE
                        WHEN price_paise IS NULL OR price_paise <= 0  THEN 'UNSPECIFIED'
                        WHEN price_paise <   50000000                 THEN 'UNDER_5L'
                        WHEN price_paise <  200000000                 THEN '5L_20L'
                        WHEN price_paise <  500000000                 THEN '20L_50L'
                        WHEN price_paise < 1000000000                 THEN '50L_1CR'
                        WHEN price_paise < 2000000000                 THEN '1CR_2CR'
                        ELSE                                               'ABOVE_2CR'
                    END AS budget_band,
                    COUNT(*) AS live_count
                FROM property_listings
                WHERE created_by = ?
                  AND status = 'LIVE'
                  AND area_key IS NOT NULL
                GROUP BY area_key, property_type, listing_purpose, budget_band
            )
            SELECT
                ls.area_key,
                ls.property_type,
                ls.listing_purpose,
                ls.budget_band,
                ls.gap_score,
                ls.signal_type,
                ls.confidence,
                ls.lead_intent_count,
                ls.search_count,
                COALESCE(bl.live_count, 0) AS broker_live_count,
                bdgs.id                     AS state_id,
                bdgs.read_at,
                bdgs.dismissed_at
            FROM latest_signal ls
            LEFT JOIN broker_live bl
                ON  bl.area_key        = ls.area_key
                AND bl.property_type   = ls.property_type
                AND bl.listing_purpose = ls.listing_purpose
                AND bl.budget_band     = ls.budget_band
            LEFT JOIN broker_demand_gap_state bdgs
                ON  bdgs.broker_id        = ?
                AND bdgs.area_key         = ls.area_key
                AND bdgs.property_type    = ls.property_type
                AND bdgs.listing_purpose  = ls.listing_purpose
                AND bdgs.budget_band      = ls.budget_band
                AND bdgs.week             = DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')::date
            ORDER BY ls.gap_score DESC NULLS LAST, ls.area_key, ls.property_type, ls.listing_purpose, ls.budget_band
            """;

    /**
     * Loads LIVE listings owned by the calling broker that match at least one qualifying
     * gap bucket (area_key, property_type, listing_purpose). Excludes non-LIVE and
     * external/scraped records. raw_post_id IS NULL guards against scraped-origin rows
     * (#1520 scraped records always have a raw_post_id; broker-created listings do not).
     */
    private static final String CAPTURE_LISTINGS_SQL = """
            SELECT DISTINCT ON (pl.id)
                pl.id,
                pl.title,
                pl.area_key,
                pl.property_type,
                pl.listing_purpose,
                pl.price_paise,
                pl.quality_score
            FROM property_listings pl
            INNER JOIN area_demand_signal ads
                ON  ads.area_key        = pl.area_key
                AND ads.property_type   = pl.property_type
                AND ads.listing_purpose = pl.listing_purpose
                AND ads.confidence      != 'insufficient_data'
            WHERE pl.created_by    = ?
              AND pl.status        = 'LIVE'
              AND pl.archived_at   IS NULL
              AND pl.is_duplicate  = false
              AND pl.raw_post_id   IS NULL
            LIMIT 20
            """;

    // ── Row mappers ──────────────────────────────────────────────────────────

    /**
     * Maps a gap query row to a raw intermediate record for further processing.
     *
     * <p>leadIntentCount and searchCount are boxed Integer (nullable) so that a SQL NULL
     * in the column is preserved as Java null rather than coerced to 0 by rs.getInt().
     * A null here propagates to a null Metric value in the response (k-anon null-honesty).
     *
     * <p>Package-private (not private) to allow unit tests in the same package to construct
     * GapRow instances with specific null/non-null count values for null-honesty assertions.
     */
    record GapRow(
            String areaKey, String propertyType, String listingPurpose, String budgetBand,
            Float gapScore, String signalType, String confidence,
            Integer leadIntentCount, Integer searchCount,
            int brokerLiveCount,
            UUID stateId, Instant readAt, Instant dismissedAt
    ) {}

    private static final RowMapper<GapRow> GAP_ROW_MAPPER = new RowMapper<>() {
        @Override
        public GapRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            Object gapScoreObj = rs.getObject("gap_score");
            Float gapScore = (gapScoreObj != null) ? ((Number) gapScoreObj).floatValue() : null;

            String stateIdStr = rs.getString("state_id");
            UUID stateId = (stateIdStr != null) ? UUID.fromString(stateIdStr) : null;

            Timestamp readAtTs = rs.getTimestamp("read_at");
            Timestamp dismissedAtTs = rs.getTimestamp("dismissed_at");

            // Use getObject with Integer.class to preserve SQL NULL as Java null.
            // rs.getInt() coerces NULL to 0, which would fabricate a fake zero for k-anon
            // purposes — a suppressed/absent count must surface as null, never as 0.
            Integer leadIntentCount = rs.getObject("lead_intent_count", Integer.class);
            Integer searchCount     = rs.getObject("search_count",      Integer.class);

            return new GapRow(
                    rs.getString("area_key"),
                    rs.getString("property_type"),
                    rs.getString("listing_purpose"),
                    rs.getString("budget_band"),
                    gapScore,
                    rs.getString("signal_type"),
                    rs.getString("confidence"),
                    leadIntentCount,
                    searchCount,
                    rs.getInt("broker_live_count"),
                    stateId,
                    (readAtTs != null) ? readAtTs.toInstant() : null,
                    (dismissedAtTs != null) ? dismissedAtTs.toInstant() : null
            );
        }
    };

    private static final RowMapper<BrokerDemandGapsResponse.CaptureDemandListing> CAPTURE_LISTING_MAPPER =
            new RowMapper<>() {
                @Override
                public BrokerDemandGapsResponse.CaptureDemandListing mapRow(ResultSet rs, int rowNum)
                        throws SQLException {
                    Object qs = rs.getObject("quality_score");
                    Short qualityScore = (qs != null) ? ((Number) qs).shortValue() : null;
                    Object price = rs.getObject("price_paise");
                    Long pricePaise = (price != null) ? ((Number) price).longValue() : null;
                    return new BrokerDemandGapsResponse.CaptureDemandListing(
                            UUID.fromString(rs.getString("id")),
                            rs.getString("title"),
                            rs.getString("area_key"),
                            rs.getString("property_type"),
                            rs.getString("listing_purpose"),
                            pricePaise,
                            qualityScore
                    );
                }
            };

    // ── Constructor injection ────────────────────────────────────────────────

    private final JdbcOperations jdbcOperations;
    private final BrokerDemandGapStateRepository stateRepository;

    public BrokerDemandGapsService(JdbcOperations jdbcOperations,
                                   BrokerDemandGapStateRepository stateRepository) {
        this.jdbcOperations = jdbcOperations;
        this.stateRepository = stateRepository;
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Returns the full demand-gaps page payload for the calling broker.
     *
     * <p>Derives gap buckets read-only from area_demand_signal × broker coverage ×
     * LIVE supply × state table. Dismissed gaps are excluded. Auto-resolve is derived
     * visibility only (no state write).
     *
     * @param brokerId JWT-resolved broker UUID; never client-supplied
     * @return page payload with summary, topGaps (top 5 by gap_score), allGaps, and
     *         captureDemandListings
     */
    @Transactional(readOnly = true)
    public BrokerDemandGapsResponse getDemandGaps(UUID brokerId) {
        log.debug("getDemandGaps brokerId={}", brokerId);

        List<GapRow> rows = jdbcOperations.query(GAP_SQL, GAP_ROW_MAPPER,
                brokerId, brokerId, brokerId, brokerId, brokerId);

        LocalDate currentWeek = currentWeekMonday();

        // Separate open (not dismissed) from all
        List<GapRow> openRows = rows.stream()
                .filter(r -> r.dismissedAt() == null)
                .toList();

        List<BrokerDemandGapsResponse.GapItem> allGapItems = openRows.stream()
                .map(r -> toGapItem(r, currentWeek))
                .toList();

        List<BrokerDemandGapsResponse.GapItem> topGaps = allGapItems.stream()
                .limit(5)
                .toList();

        BrokerDemandGapsResponse.Summary summary = buildSummary(openRows, allGapItems.size());

        List<BrokerDemandGapsResponse.CaptureDemandListing> captureListings =
                jdbcOperations.query(CAPTURE_LISTINGS_SQL, CAPTURE_LISTING_MAPPER, brokerId);

        log.debug("getDemandGaps brokerId={} openGaps={} captureListings={}",
                brokerId, allGapItems.size(), captureListings.size());

        return new BrokerDemandGapsResponse(summary, topGaps, allGapItems, captureListings);
    }

    /**
     * Returns the broker's gap alert list.
     *
     * @param brokerId JWT-resolved broker UUID
     * @param status   "open" (non-dismissed) or "all" (including dismissed). Default "open".
     * @return list of gap items (open or all)
     */
    @Transactional(readOnly = true)
    public List<BrokerDemandGapsResponse.GapItem> getAlerts(UUID brokerId, String status) {
        log.debug("getAlerts brokerId={} status={}", brokerId, status);

        List<GapRow> rows = jdbcOperations.query(GAP_SQL, GAP_ROW_MAPPER,
                brokerId, brokerId, brokerId, brokerId, brokerId);

        LocalDate currentWeek = currentWeekMonday();
        boolean includeAll = ALL_STATUS.equalsIgnoreCase(status);

        return rows.stream()
                .filter(r -> includeAll || r.dismissedAt() == null)
                .map(r -> toGapItem(r, currentWeek))
                .toList();
    }

    /**
     * Marks a demand-gap state row as read (idempotent).
     *
     * <p>Ownership is enforced via {@code findByIdAndBrokerId} which includes
     * {@code broker_id = :brokerId} — a broker cannot read another broker's gap.
     * When the state row does not exist for the given id, the operation returns 404.
     *
     * <p>If the state row exists but read_at is already set, the upsert COALESCE
     * preserves the first read_at — the operation is a no-op (idempotent).
     *
     * @param stateId  the broker_demand_gap_state.id from /alerts/{id}/read path
     * @param brokerId JWT-resolved broker UUID; never client-supplied
     * @throws ResponseStatusException 404 when the row does not exist or is not owned by caller
     */
    @Transactional
    public void markRead(UUID stateId, UUID brokerId) {
        log.debug("markRead stateId={} brokerId={}", stateId, brokerId);

        BrokerDemandGapState state = stateRepository.findByIdAndBrokerId(stateId, brokerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Demand gap not found"));

        stateRepository.upsertReadAt(
                state.getBrokerId(),
                state.getAreaKey(),
                state.getPropertyType(),
                state.getListingPurpose(),
                state.getBudgetBand(),
                state.getWeek(),
                Instant.now()
        );
    }

    /**
     * Marks a demand-gap state row as dismissed (idempotent).
     *
     * <p>Ownership enforced via {@code findByIdAndBrokerId}. Dismissed gaps are suppressed
     * from the open page payload on subsequent requests. Re-dismissing is idempotent.
     *
     * @param stateId  the broker_demand_gap_state.id from /alerts/{id}/dismiss path
     * @param brokerId JWT-resolved broker UUID; never client-supplied
     * @throws ResponseStatusException 404 when the row does not exist or is not owned by caller
     */
    @Transactional
    public void dismiss(UUID stateId, UUID brokerId) {
        log.debug("dismiss stateId={} brokerId={}", stateId, brokerId);

        BrokerDemandGapState state = stateRepository.findByIdAndBrokerId(stateId, brokerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Demand gap not found"));

        stateRepository.upsertDismissedAt(
                state.getBrokerId(),
                state.getAreaKey(),
                state.getPropertyType(),
                state.getListingPurpose(),
                state.getBudgetBand(),
                state.getWeek(),
                Instant.now()
        );
    }

    // ── Package-private for unit tests ───────────────────────────────────────

    /**
     * Maps a signal_type string to a presentation action_type.
     *
     * <p>Mapping (AC5, binding user-decision):
     * <ul>
     *   <li>supply_gap      → add_listing</li>
     *   <li>information_gap → improve_listing</li>
     *   <li>price_signal    → review_gap</li>
     *   <li>possible_gap    → review_gap</li>
     *   <li>unknown / other → review_gap (safe-degrade; never throws)</li>
     * </ul>
     *
     * <p>signal_type is READ from area_demand_signal. This method does NOT re-derive it
     * and does NOT add new classification thresholds.
     *
     * @param signalType the signal_type string from area_demand_signal (may be null/unknown)
     * @return presentation action_type string
     */
    static String toActionType(String signalType) {
        if (signalType == null) {
            return "review_gap";
        }
        return switch (signalType) {
            case "supply_gap"      -> "add_listing";
            case "information_gap" -> "improve_listing";
            case "price_signal"    -> "review_gap";
            case "possible_gap"    -> "review_gap";
            default                -> "review_gap";   // safe-degrade for any future signal type
        };
    }

    /**
     * Returns the ISO week Monday UTC for the current instant.
     * Deterministic formula: LocalDate.now(UTC) truncated to Monday of the ISO week.
     */
    static LocalDate currentWeekMonday() {
        return LocalDate.now(ZoneOffset.UTC).with(DayOfWeek.MONDAY);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    BrokerDemandGapsResponse.GapItem toGapItem(GapRow r, LocalDate currentWeek) {
        // gap_score: null upstream (suppressed) → Metric with null value; non-null → Metric with label
        Metric<Float> gapScoreMetric = r.gapScore() != null
                ? new Metric<>(r.gapScore(), confidenceDisplayLabel(r.confidence()))
                : new Metric<>(null, NOT_ENOUGH_DATA_LABEL);

        // confidence: passes through from area_demand_signal (already filtered to non-insufficient)
        Metric<String> confidenceMetric = new Metric<>(r.confidence(), confidenceDisplayLabel(r.confidence()));

        // buyerEnquiries: lead_intent_count from area_demand_signal.
        // Null when the column is NULL upstream (SQL NULL preserved via getObject, never coerced to 0).
        // NEVER fabricated; NEVER 0 as a surrogate for absent data (k-anon null-honesty rule, AC4).
        Long leadIntentValue = r.leadIntentCount() != null ? (long) r.leadIntentCount() : null;
        Metric<Long> buyerEnquiriesMetric = new Metric<>(
                leadIntentValue,
                leadIntentValue != null ? confidenceDisplayLabel(r.confidence()) : NOT_ENOUGH_DATA_LABEL
        );

        return new BrokerDemandGapsResponse.GapItem(
                r.stateId(),
                r.areaKey(),
                r.propertyType(),
                r.listingPurpose(),
                r.budgetBand(),
                currentWeek,
                gapScoreMetric,
                r.signalType(),
                toActionType(r.signalType()),
                confidenceMetric,
                buyerEnquiriesMetric,
                r.brokerLiveCount(),
                r.readAt(),
                r.dismissedAt()
        );
    }

    private BrokerDemandGapsResponse.Summary buildSummary(List<GapRow> openRows, int demandGapsFound) {
        // buyerSearches: sum of search_count across all surfaced (non-suppressed) open rows.
        // If no rows have data (all suppressed upstream, though our SQL filters those out)
        // we still have a valid count. If openRows is empty, return null for both aggregate metrics.
        if (openRows.isEmpty()) {
            return new BrokerDemandGapsResponse.Summary(
                    new Metric<>(null, NOT_ENOUGH_DATA_LABEL),
                    new Metric<>(null, NOT_ENOUGH_DATA_LABEL),
                    0, 0, 0
            );
        }

        // Sum only non-null contributors to preserve null-honesty.
        // If ALL rows have a null search_count / lead_intent_count (e.g. all counts are DB-NULL),
        // the summary metric value is null — never emit a fabricated 0.
        // A real-zero is distinguishable: it arises when all rows have searchCount/leadIntentCount = 0
        // (non-null integer 0), which is a legitimate value, unlike a missing/suppressed null.
        boolean anySearchCountPresent   = openRows.stream().anyMatch(r -> r.searchCount()     != null);
        boolean anyEnquiryCountPresent  = openRows.stream().anyMatch(r -> r.leadIntentCount() != null);

        Long totalSearches  = anySearchCountPresent
                ? openRows.stream().filter(r -> r.searchCount()     != null).mapToLong(GapRow::searchCount).sum()
                : null;
        Long totalEnquiries = anyEnquiryCountPresent
                ? openRows.stream().filter(r -> r.leadIntentCount() != null).mapToLong(GapRow::leadIntentCount).sum()
                : null;

        // Determine the best confidence label across the open rows for the summary metrics.
        // If any row has enough_data, use that; otherwise limited_data; this is a presentation choice.
        boolean anyEnoughData = openRows.stream().anyMatch(r -> "enough_data".equals(r.confidence()));
        String summaryConfidenceLabel = anyEnoughData ? "Enough data" : "Limited data";

        Metric<Long> buyerSearches  = new Metric<>(totalSearches,
                totalSearches  != null ? summaryConfidenceLabel : NOT_ENOUGH_DATA_LABEL);
        // buyerEnquiries: prefer lead_intent_count (highest-intent signal; plan resolution)
        Metric<Long> buyerEnquiries = new Metric<>(totalEnquiries,
                totalEnquiries != null ? summaryConfidenceLabel : NOT_ENOUGH_DATA_LABEL);

        int brokerMatchingListings = (int) openRows.stream()
                .filter(r -> r.brokerLiveCount() >= BrokerDemandGapsConfig.BROKER_LIVE_MIN)
                .count();
        int opportunitiesToAct = demandGapsFound - brokerMatchingListings;

        return new BrokerDemandGapsResponse.Summary(
                buyerSearches,
                buyerEnquiries,
                demandGapsFound,
                brokerMatchingListings,
                opportunitiesToAct
        );
    }

    /**
     * Converts a raw confidence string from area_demand_signal to a display label.
     * Defensive: unknown values fall back to NOT_ENOUGH_DATA_LABEL (no throw).
     */
    private static String confidenceDisplayLabel(String confidence) {
        if (confidence == null) {
            return NOT_ENOUGH_DATA_LABEL;
        }
        return switch (confidence) {
            case "enough_data"     -> "Enough data";
            case "limited_data"    -> "Limited data";
            case "insufficient_data" -> NOT_ENOUGH_DATA_LABEL;
            default                -> NOT_ENOUGH_DATA_LABEL;
        };
    }
}
