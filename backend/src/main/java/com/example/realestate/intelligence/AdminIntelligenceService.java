package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service for the admin intelligence validator.
 *
 * <p>Fetches and maps LIVE-90d area aggregates from {@link AreaIntelligenceRepository}.
 * All reads are {@code @Transactional(readOnly = true)}. No writes occur in this service.
 */
@Service
public class AdminIntelligenceService {

    private static final Logger log = LoggerFactory.getLogger(AdminIntelligenceService.class);

    private final AreaIntelligenceRepository areaIntelligenceRepository;

    public AdminIntelligenceService(AreaIntelligenceRepository areaIntelligenceRepository) {
        this.areaIntelligenceRepository = areaIntelligenceRepository;
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

        return rows.stream()
                .map(this::toResponse)
                .toList();
    }

    private AreaIntelligenceResponse toResponse(AreaIntelligenceRow row) {
        String areaKey = row.getAreaKey();
        String district = parseDistrict(areaKey);

        int live90dCount = row.getLive90dCount() != null ? row.getLive90dCount().intValue() : 0;
        int scoredCount = row.getScoredCount() != null ? row.getScoredCount().intValue() : 0;

        // avgQuality is null when scoredCount=0 (SQL AVG ignores NULLs, returns NULL).
        // We never coerce this to 0 — null signals backfill-incomplete to the client.
        Double avgQuality = row.getAvgQuality();

        String confidence = AreaConfidence.classify(live90dCount).name().toLowerCase();

        return new AreaIntelligenceResponse(
                areaKey,
                row.getAreaLabel(),
                district,
                live90dCount,
                scoredCount,
                avgQuality,
                confidence,
                null,   // demandEventCount — M30 not populated; always null
                null    // topGaps          — M30 not populated; always null
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
