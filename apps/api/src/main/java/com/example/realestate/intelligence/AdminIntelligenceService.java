package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Service for the admin intelligence validator.
 *
 * <p>Fetches and maps LIVE-90d area aggregates from {@link AreaIntelligenceRepository}.
 * Also populates demand columns ({@code demandEventCount}, {@code topGaps}) from the
 * PERSISTED {@code area_demand_signal} table (latest 30-day window) via
 * {@link AreaDemandSignalRepository} — reads only, no recomputation.
 *
 * <p>All reads are {@code @Transactional(readOnly = true)}. No writes occur in this service.
 */
@Service
public class AdminIntelligenceService {

    private static final Logger log = LoggerFactory.getLogger(AdminIntelligenceService.class);

    private final AreaIntelligenceRepository areaIntelligenceRepository;
    private final AreaDemandSignalRepository areaDemandSignalRepository;

    public AdminIntelligenceService(AreaIntelligenceRepository areaIntelligenceRepository,
                                    AreaDemandSignalRepository areaDemandSignalRepository) {
        this.areaIntelligenceRepository = areaIntelligenceRepository;
        this.areaDemandSignalRepository = areaDemandSignalRepository;
    }

    /**
     * Return area intelligence rows, optionally filtered by city/district.
     *
     * <p>The {@code city} parameter maps to the 3rd pipe-delimited segment of area_key
     * (e.g. "Udupi" in {@code IN|KA|Udupi|Manipal}). Null, blank, or empty city
     * returns all areas.
     *
     * @param city optional district filter; null/blank = no filter
     * @return list of area intelligence responses, empty list when no matches (never null)
     */
    @Transactional(readOnly = true)
    public List<AreaIntelligenceResponse> getAreaIntelligence(String city) {
        List<AreaIntelligenceRow> rows;

        if (city == null || city.isBlank()) {
            log.debug("AdminIntelligenceService: fetching all LIVE-90d area aggregates");
            rows = areaIntelligenceRepository.findLive90dAggregates();
        } else {
            String district = city.trim();
            log.debug("AdminIntelligenceService: fetching LIVE-90d aggregates for district='{}'", district);
            rows = areaIntelligenceRepository.findLive90dAggregatesByDistrict(district);
        }

        // Fetch demand data ONCE — no N+1. Key by area_key (area_key is globally unique).
        Map<String, Long> demandTotals = buildDemandTotalsMap();
        Map<String, List<AreaTopGapRow>> topGapsMap = buildTopGapsMap();

        return rows.stream()
                .map(row -> toResponse(row, demandTotals, topGapsMap))
                .toList();
    }

    // ── Demand map builders (called once per request) ─────────────────────────

    /**
     * Build a map of area_key → demandEventTotal from the latest 30d window.
     * One repository call; assembled in O(rows) Java.
     */
    private Map<String, Long> buildDemandTotalsMap() {
        List<AreaDemandSummaryRow> summaries = areaDemandSignalRepository.findDemandTotalsByLatestWindow30();
        return summaries.stream()
                .collect(Collectors.toMap(
                        AreaDemandSummaryRow::getAreaKey,
                        AreaDemandSummaryRow::getDemandEventTotal,
                        // In the unlikely case of duplicate area_key across city_slugs, keep the first
                        // and log a warning so the collision is observable in production.
                        (a, b) -> {
                            log.warn("AdminIntelligenceService: duplicate area_key in demand totals map "
                                    + "(multi-city collision?); keeping first value={}, discarding={}", a, b);
                            return a;
                        }
                ));
    }

    /**
     * Build a map of area_key → top-3 gap rows from the latest 30d window.
     * One repository call; assembled in O(rows) Java.
     */
    private Map<String, List<AreaTopGapRow>> buildTopGapsMap() {
        List<AreaTopGapRow> allGaps = areaDemandSignalRepository.findTop3GapsByLatestWindow30();
        return allGaps.stream()
                .collect(Collectors.groupingBy(AreaTopGapRow::getAreaKey));
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private AreaIntelligenceResponse toResponse(AreaIntelligenceRow row,
                                                 Map<String, Long> demandTotals,
                                                 Map<String, List<AreaTopGapRow>> topGapsMap) {
        String areaKey = row.getAreaKey();
        String district = parseDistrict(areaKey);

        int live90dCount = row.getLive90dCount() != null ? row.getLive90dCount().intValue() : 0;
        int scoredCount = row.getScoredCount() != null ? row.getScoredCount().intValue() : 0;

        // avgQuality is null when scoredCount=0 (SQL AVG ignores NULLs, returns NULL).
        // We never coerce this to 0 — null signals backfill-incomplete to the client.
        Double avgQuality = row.getAvgQuality();

        String confidence = AreaConfidence.classify(live90dCount).name().toLowerCase();

        // ── Demand fields (sourced from persisted area_demand_signal) ─────────
        Long demandTotal = demandTotals.get(areaKey);

        Integer demandEventCount = null;
        if (demandTotal != null) {
            // Use DemandConfidence.classify to apply the single k-anon boundary.
            // INSUFFICIENT_DATA (demandTotal < K_ANON_MIN) → suppress (null).
            // LIMITED_DATA or ENOUGH_DATA → expose the total. NEVER 0.
            DemandConfidence dc = DemandConfidence.classify(demandTotal.intValue());
            if (dc != DemandConfidence.INSUFFICIENT_DATA) {
                demandEventCount = demandTotal.intValue();
            }
        }

        List<AreaTopGap> topGaps = Collections.emptyList();
        List<AreaTopGapRow> gapRows = topGapsMap.get(areaKey);
        if (gapRows != null && !gapRows.isEmpty()) {
            topGaps = gapRows.stream()
                    .map(g -> new AreaTopGap(
                            g.getPropertyType(),
                            g.getListingPurpose(),
                            g.getBudgetBand(),
                            g.getSignalType(),
                            g.getGapScore(),
                            g.getConfidence()))
                    .toList();
        }

        return new AreaIntelligenceResponse(
                areaKey,
                row.getAreaLabel(),
                district,
                live90dCount,
                scoredCount,
                avgQuality,
                confidence,
                demandEventCount,
                topGaps
        );
    }

    /**
     * Extract the district segment (index 2) from an area_key of the form
     * {@code IN|KA|{district}|{locality}}.
     *
     * <p>Returns null (not throws) for malformed area_key values that have fewer than
     * 3 pipe-delimited segments, so a bad row in the DB cannot crash the endpoint.
     *
     * @param areaKey area key string; may be malformed
     * @return district string, or null if parsing fails
     */
    static String parseDistrict(String areaKey) {
        if (areaKey == null) {
            return null;
        }
        String[] parts = areaKey.split("\\|", -1);
        // area_key format: IN|KA|{district}|{locality} — district is at index 2
        if (parts.length < 3) {
            return null;
        }
        String district = parts[2];
        return district.isBlank() ? null : district;
    }
}
