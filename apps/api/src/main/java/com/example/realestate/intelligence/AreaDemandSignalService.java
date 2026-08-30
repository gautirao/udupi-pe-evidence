package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Orchestrates the hourly area demand-signal rollup.
 *
 * <p><b>Per-window pipeline:</b>
 * <ol>
 *   <li>Run ONE aggregate SQL query (DEMAND CTE FULL OUTER JOIN SUPPLY CTE) via
 *       {@link AreaDemandSignalRepository#findRawAggregates}.</li>
 *   <li>Compute weighted_demand and supply_intensity per row.</li>
 *   <li>Group rows into peer populations sharing
 *       {@code (city_slug, property_type, listing_purpose, budget_band)} and compute
 *       z-scores using STDDEV_POP. sigma=0 guard: z=0 (never NaN/Infinity). Peer N &lt;
 *       {@link DemandSignalThresholds#MIN_PEER_POPULATION}: gap_score = NULL (statistical guard).</li>
 *   <li>Clamp gap_score to [-3, 3]; round HALF_UP.</li>
 *   <li>Apply k-anon suppression: demand_total &lt; {@link AggregationConstants#K_ANON_MIN}
 *       → gap_score = NULL, confidence = insufficient_data.</li>
 *   <li>Classify signal_type and confidence using named constants from
 *       {@link DemandSignalThresholds}.</li>
 *   <li>Delete previous rows for (period_start, window_days) then saveAllAndFlush —
 *       idempotent re-run, no PK duplicates.</li>
 * </ol>
 *
 * <p><b>Demand-score collapse (D9, canonical 30d window):</b>
 * <ul>
 *   <li>Only non-suppressed buckets (gap_score NOT NULL) contribute.</li>
 *   <li>demand_score = volume-weighted mean of gap_score (weight = demand_total),
 *       setScale(2, HALF_UP).</li>
 *   <li>All-suppressed or no-valid-demand area → demand_score = NULL
 *       (never 0, never fabricated, never stale).</li>
 * </ul>
 *
 * <p><b>gap_score invariants (AC4, c3):</b>
 * <ul>
 *   <li>NEVER NaN or Infinity. sigma=0 → z=0 (explicit NULLIF guard before division).</li>
 *   <li>Peer N &lt; {@link DemandSignalThresholds#MIN_PEER_POPULATION} → NULL.</li>
 *   <li>K-anon thin → NULL.</li>
 *   <li>Clamp to [-3, 3].</li>
 * </ul>
 *
 * <p><b>No PII:</b> reads only PII-free fields from discover_event
 * (event_type, area_key, property_type, listing_purpose, price_band, ts).
 * session_id and filters_jsonb are never read.
 */
@Service
public class AreaDemandSignalService {

    private static final Logger log = LoggerFactory.getLogger(AreaDemandSignalService.class);

    /**
     * Gap score floor/ceiling (inclusive). gap_score = clamp(raw, -GAP_SCORE_BOUND, +GAP_SCORE_BOUND).
     */
    static final float GAP_SCORE_BOUND = 3.0f;

    private final AreaDemandSignalRepository repository;

    public AreaDemandSignalService(AreaDemandSignalRepository repository) {
        this.repository = repository;
    }

    /**
     * Run the demand-signal rollup for a given window length and period anchor.
     *
     * <p>Called by {@link AreaDemandSignalRollupJob} for each window (7d and 30d).
     * Also directly callable in tests (no scheduler dependency).
     *
     * @param windowDays  rolling window length in days (7 or 30)
     * @param periodStart UTC-hour-truncated anchor for this run
     * @return count of area_demand_signal rows persisted
     */
    @Transactional
    public int runRollup(int windowDays, Instant periodStart) {
        Instant periodEnd = periodStart.plus(windowDays, ChronoUnit.DAYS);
        Instant now = Instant.now();

        log.info("AreaDemandSignalService: starting rollup windowDays={} periodStart={}",
                windowDays, periodStart);

        // ── Step 1: One aggregate SQL statement (no N+1) ──────────────────────
        List<AreaDemandSignalRow> rows = repository.findRawAggregates(windowDays);
        log.debug("AreaDemandSignalService: raw aggregate returned {} buckets for windowDays={}",
                rows.size(), windowDays);

        if (rows.isEmpty()) {
            log.info("AreaDemandSignalService: no buckets for windowDays={}, nothing to persist", windowDays);
            return 0;
        }

        // ── Step 2: Compute weighted_demand and supply_intensity per row ───────
        record BucketMetrics(AreaDemandSignalRow row, int demandTotal,
                             double weightedDemand, double supplyIntensity) {}

        List<BucketMetrics> metrics = rows.stream().map(r -> {
            int search  = safeInt(r.getSearchCount());
            int panel   = safeInt(r.getPanelOpenCount());
            int lead    = safeInt(r.getLeadIntentCount());
            int listing = safeInt(r.getListingCount());
            int demandTotal = search + panel + lead;
            double weightedDemand =
                    (double) DemandSignalThresholds.DEMAND_WEIGHT_SEARCH       * search
                  + (double) DemandSignalThresholds.DEMAND_WEIGHT_PANEL_OPEN   * panel
                  + (double) DemandSignalThresholds.DEMAND_WEIGHT_LEAD_INTENT  * lead;
            return new BucketMetrics(r, demandTotal, weightedDemand, (double) listing);
        }).toList();

        // ── Step 3: Group into peer populations and compute z-scores ──────────
        // Peer key = (city_slug, property_type, listing_purpose, budget_band) per D1.
        record PeerKey(String citySlug, String propertyType, String listingPurpose, String budgetBand) {}

        Map<PeerKey, List<BucketMetrics>> peerGroups = metrics.stream()
                .collect(Collectors.groupingBy(m ->
                        new PeerKey(
                                m.row().getCitySlug(),
                                m.row().getPropertyType(),
                                m.row().getListingPurpose(),
                                m.row().getBudgetBand())));

        // For each bucket, compute gap_score.
        // Map from row identity (same object reference) → gap_score (null if suppressed).
        Map<AreaDemandSignalRow, Float> gapScoreMap = new HashMap<>();

        for (Map.Entry<PeerKey, List<BucketMetrics>> entry : peerGroups.entrySet()) {
            List<BucketMetrics> peers = entry.getValue();
            int peerN = peers.size();

            if (peerN < DemandSignalThresholds.MIN_PEER_POPULATION) {
                // Statistical guard: peer N < 3 → gap_score NULL for ALL buckets in this peer group.
                for (BucketMetrics m : peers) {
                    gapScoreMap.put(m.row(), null);
                }
                continue;
            }

            // Compute STDDEV_POP and AVG for both weighted_demand and supply_intensity.
            double sumWd = 0, sumSi = 0;
            for (BucketMetrics m : peers) {
                sumWd += m.weightedDemand();
                sumSi += m.supplyIntensity();
            }
            double avgWd = sumWd / peerN;
            double avgSi = sumSi / peerN;

            double sumSqWd = 0, sumSqSi = 0;
            for (BucketMetrics m : peers) {
                double dWd = m.weightedDemand() - avgWd;
                double dSi = m.supplyIntensity() - avgSi;
                sumSqWd += dWd * dWd;
                sumSqSi += dSi * dSi;
            }
            double sigmaWd = Math.sqrt(sumSqWd / peerN); // STDDEV_POP
            double sigmaSi = Math.sqrt(sumSqSi / peerN);

            for (BucketMetrics m : peers) {
                // sigma=0 guard: z=0 (never NaN/Infinity from 0/0 or x/0).
                double zWd = (sigmaWd > 0) ? (m.weightedDemand() - avgWd) / sigmaWd : 0.0;
                double zSi = (sigmaSi > 0) ? (m.supplyIntensity() - avgSi) / sigmaSi : 0.0;

                double rawGap = zWd - zSi;
                // Clamp to [-3, 3].
                float clamped = (float) Math.max(-GAP_SCORE_BOUND, Math.min(GAP_SCORE_BOUND, rawGap));
                gapScoreMap.put(m.row(), clamped);
            }
        }

        // ── Step 4: Build entities with suppression, classification, confidence ─
        List<AreaDemandSignal> entities = new ArrayList<>(metrics.size());

        // Pre-compute per-(city_slug, area_key, property_type, listing_purpose) total listing counts
        // for PRICE_SIGNAL classification (fraction of area's matching supply in this band).
        // key = (citySlug, areaKey, propertyType, listingPurpose) → total listing_count
        record SupplyKey(String citySlug, String areaKey, String propertyType, String listingPurpose) {}
        Map<SupplyKey, Integer> totalSupplyByAreaNeed = new HashMap<>();
        for (BucketMetrics m : metrics) {
            SupplyKey sk = new SupplyKey(
                    m.row().getCitySlug(), m.row().getAreaKey(),
                    m.row().getPropertyType(), m.row().getListingPurpose());
            totalSupplyByAreaNeed.merge(sk, safeInt(m.row().getListingCount()), Integer::sum);
        }

        for (BucketMetrics m : metrics) {
            AreaDemandSignalRow r = m.row();
            int demandTotal = m.demandTotal();
            Float rawGapScore = gapScoreMap.get(r);

            // K-anon suppression: demand_total < K_ANON_MIN → gap_score NULL.
            DemandConfidence confidence = DemandConfidence.classify(demandTotal);
            boolean kAnonSuppressed = (confidence == DemandConfidence.INSUFFICIENT_DATA);

            Float gapScore = kAnonSuppressed ? null : rawGapScore;
            // rawGapScore may also be null from statistical guard (peer N<3); both stay null.

            // signal_type classification (deterministic, D8).
            // Suppressed buckets still need a signal_type (CHECK NOT NULL) → POSSIBLE_GAP.
            DemandSignalType signalType = classifySignalType(
                    gapScore, confidence, demandTotal,
                    safeInt(r.getLeadIntentCount()),
                    safeInt(r.getPanelOpenCount()),
                    safeInt(r.getListingCount()),
                    totalSupplyByAreaNeed.getOrDefault(
                            new SupplyKey(r.getCitySlug(), r.getAreaKey(),
                                    r.getPropertyType(), r.getListingPurpose()), 0)
            );

            AreaDemandSignal signal = new AreaDemandSignal();
            signal.setCitySlug(r.getCitySlug());
            signal.setAreaKey(r.getAreaKey());
            signal.setPropertyType(r.getPropertyType());
            signal.setListingPurpose(r.getListingPurpose());
            signal.setBudgetBand(r.getBudgetBand());
            signal.setPeriodStart(periodStart);
            signal.setPeriodEnd(periodEnd);
            signal.setWindowDays(windowDays);
            signal.setSearchCount(safeInt(r.getSearchCount()));
            signal.setPanelOpenCount(safeInt(r.getPanelOpenCount()));
            signal.setLeadIntentCount(safeInt(r.getLeadIntentCount()));
            signal.setListingCount(safeInt(r.getListingCount()));
            signal.setGapScore(gapScore);
            signal.setSignalType(signalType.dbValue());
            signal.setConfidence(confidence.dbValue());
            signal.setComputedAt(now);
            entities.add(signal);
        }

        // ── Step 5: Idempotent persist (DELETE-before-INSERT for this batch) ───
        int deleted = repository.deleteByPeriodStartAndWindowDays(periodStart, windowDays);
        log.debug("AreaDemandSignalService: deleted {} stale rows for periodStart={} windowDays={}",
                deleted, periodStart, windowDays);

        repository.saveAllAndFlush(entities);
        log.info("AreaDemandSignalService: persisted {} rows for windowDays={}", entities.size(), windowDays);
        return entities.size();
    }

    /**
     * Collapse non-suppressed 30d-window bucket gap_scores per area into one
     * demand_score and write it back to {@code area_intelligence_snapshot}.
     *
     * <p>demand_score = volume-weighted mean of non-suppressed gap_scores (D9).
     * Weight = bucket demand_total. HALF_UP, scale 2.
     * All-suppressed or no-valid-demand area → demand_score = NULL (never 0).
     *
     * <p>Runs after {@link #runRollup(int, Instant)} for the 30d window.
     *
     * @param periodStart the same period_start anchor used in the 30d rollup
     */
    @Transactional
    public void writeBackDemandScores(Instant periodStart) {
        log.info("AreaDemandSignalService: writing demand_score back to snapshot for periodStart={}",
                periodStart);

        // Load ONLY the 30d rows for this period — targeted query, no full-table scan.
        List<AreaDemandSignal> signals30d =
                repository.findByWindowDaysAndPeriodStart(AreaDemandSignalRollupJob.CANONICAL_WINDOW_DAYS, periodStart);

        if (signals30d.isEmpty()) {
            log.info("AreaDemandSignalService: no 30d signals for periodStart={}, skipping write-back",
                    periodStart);
            return;
        }

        // Group by (citySlug, areaKey).
        record AreaKey(String citySlug, String areaKey) {}
        Map<AreaKey, List<AreaDemandSignal>> byArea = signals30d.stream()
                .collect(Collectors.groupingBy(s -> new AreaKey(s.getCitySlug(), s.getAreaKey())));

        for (Map.Entry<AreaKey, List<AreaDemandSignal>> entry : byArea.entrySet()) {
            AreaKey ak = entry.getKey();
            List<AreaDemandSignal> areaBuckets = entry.getValue();

            // Volume-weighted mean over non-suppressed (gap_score NOT NULL) buckets.
            double weightedSum = 0.0;
            double totalWeight = 0.0;

            for (AreaDemandSignal s : areaBuckets) {
                if (s.getGapScore() == null) continue; // suppressed — skip
                int demandTotal = s.getSearchCount() + s.getPanelOpenCount() + s.getLeadIntentCount();
                if (demandTotal <= 0) continue; // no demand weight; skip
                weightedSum += (double) s.getGapScore() * demandTotal;
                totalWeight += demandTotal;
            }

            BigDecimal demandScore;
            if (totalWeight == 0.0) {
                // All buckets suppressed or no valid demand → explicitly NULL (never 0).
                demandScore = null;
            } else {
                demandScore = BigDecimal.valueOf(weightedSum / totalWeight)
                        .setScale(2, RoundingMode.HALF_UP);
            }

            int updated = repository.updateDemandScore(demandScore, ak.citySlug(), ak.areaKey());
            if (updated == 0) {
                log.debug("AreaDemandSignalService: snapshot row not found for citySlug={} areaKey={}, skipping demand_score write",
                        ak.citySlug(), ak.areaKey());
            }
        }

        log.info("AreaDemandSignalService: demand_score write-back complete for {} areas, periodStart={}",
                byArea.size(), periodStart);
    }

    // ── Signal-type classification (deterministic, D8) ────────────────────────

    /**
     * Classify a bucket's signal_type using the deterministic D8 rule chain.
     *
     * <p>Evaluated in order; first match wins. All numeric cutoffs are named constants
     * from {@link DemandSignalThresholds} (provisional, tunable).
     * Suppressed buckets (gapScore == null) fall through to the default POSSIBLE_GAP
     * because the CHECK constraint requires a non-null signal_type.
     *
     * <p>Classification order (per approved spec):
     * <ol>
     *   <li>possible_gap — if confidence == limited_data OR |gap_score| &lt; POSSIBLE_GAP_ABS_GAP_MAX</li>
     *   <li>price_signal — demand_total &gt;= K_ANON_MIN AND band listing_count &lt; PRICE_SIGNAL_SUPPLY_SHARE_MAX of total</li>
     *   <li>supply_gap — gap_score &gt;= SUPPLY_GAP_MIN_SCORE</li>
     *   <li>information_gap — listing_count &gt; 0 AND lead_intent == 0 AND panel_open &gt;= INFO_GAP_MIN_PANEL_OPENS</li>
     *   <li>default — possible_gap</li>
     * </ol>
     */
    static DemandSignalType classifySignalType(Float gapScore,
                                               DemandConfidence confidence,
                                               int demandTotal,
                                               int leadIntentCount,
                                               int panelOpenCount,
                                               int listingCount,
                                               int totalAreaSupply) {
        // Suppressed (gapScore null): always POSSIBLE_GAP (DB constraint requires non-null signal_type).
        if (gapScore == null) {
            return DemandSignalType.POSSIBLE_GAP;
        }

        // 1. possible_gap: limited confidence OR weak signal.
        if (confidence == DemandConfidence.LIMITED_DATA
                || Math.abs(gapScore) < DemandSignalThresholds.POSSIBLE_GAP_ABS_GAP_MAX) {
            return DemandSignalType.POSSIBLE_GAP;
        }

        // 2. price_signal: demand present but this band holds very little matching supply.
        if (demandTotal >= AggregationConstants.K_ANON_MIN && totalAreaSupply > 0) {
            double supplyShare = (double) listingCount / totalAreaSupply;
            if (supplyShare < DemandSignalThresholds.PRICE_SIGNAL_SUPPLY_SHARE_MAX) {
                return DemandSignalType.PRICE_SIGNAL;
            }
        }

        // 3. supply_gap: strong unmet demand (high positive gap_score).
        if (gapScore >= DemandSignalThresholds.SUPPLY_GAP_MIN_SCORE) {
            return DemandSignalType.SUPPLY_GAP;
        }

        // 4. information_gap: listings exist, users are browsing but not converting.
        if (listingCount > 0
                && leadIntentCount == 0
                && panelOpenCount >= DemandSignalThresholds.INFO_GAP_MIN_PANEL_OPENS) {
            return DemandSignalType.INFORMATION_GAP;
        }

        // 5. Default.
        return DemandSignalType.POSSIBLE_GAP;
    }

    // ── UTC period anchor ─────────────────────────────────────────────────────

    /**
     * Compute the current UTC hour-truncated period_start anchor.
     *
     * <p>DATE_TRUNC('hour', NOW() AT TIME ZONE 'UTC') equivalent in Java.
     * Called by {@link AreaDemandSignalRollupJob} to obtain the canonical anchor
     * for each run.
     *
     * @return Instant truncated to the current UTC hour
     */
    public static Instant currentUtcHourAnchor() {
        return Instant.now().atOffset(ZoneOffset.UTC)
                .truncatedTo(ChronoUnit.HOURS)
                .toInstant();
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private static int safeInt(Long value) {
        return value == null ? 0 : value.intValue();
    }
}
