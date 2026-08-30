package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

/**
 * Service that computes per-area aggregate statistics and upserts them into
 * {@code area_intelligence_snapshot}.
 *
 * <p><b>Design:</b> a single native aggregate query ({@link AreaIntelligenceSnapshotRepository#findRawAggregates})
 * produces one row per {@code (city_slug, area_key)} bucket with NO N+1 round trips.
 * The service applies k-anonymity suppression, confidence classification, and saves all
 * rows in one batch via {@code saveAllAndFlush}.
 *
 * <p><b>Upsert semantics:</b> JPA merge ({@code saveAllAndFlush}) on an existing
 * composite PK performs an UPDATE, which is functionally equivalent to
 * {@code INSERT ... ON CONFLICT DO UPDATE}. The repository JPA provider (Hibernate)
 * issues a SELECT-before-INSERT sequence; for a full replace pattern this is acceptable
 * because snapshots are refreshed in bulk periodically, not at high-concurrency per-row rate.
 *
 * <p><b>k-anonymity suppression rule ({@link AggregationConstants#K_ANON_MIN}):</b>
 * When {@code activeListingCount < K_ANON_MIN}, precise values ({@code median_price_paise},
 * {@code dominant_property_type}) are suppressed (set to NULL, never 0).
 * {@code price_comparison_supported} is set to false. Suppressing to NULL (not 0) is
 * required because 0 is a false value that could mislead callers into thinking there is
 * zero price, not that price is unknown.
 *
 * <p><b>demand_score:</b> ALWAYS null in this issue (#1526). Populated by #1532.
 * Never fabricate a value.
 *
 * <p><b>avg_listing_quality:</b> SQL AVG returns NULL when no scored rows exist.
 * The service passes the raw Double (which may be null) through directly — NEVER coerces
 * null to 0.
 */
@Service
public class AreaIntelligenceSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(AreaIntelligenceSnapshotService.class);

    private final AreaIntelligenceSnapshotRepository snapshotRepository;

    public AreaIntelligenceSnapshotService(AreaIntelligenceSnapshotRepository snapshotRepository) {
        this.snapshotRepository = snapshotRepository;
    }

    /**
     * Compute per-area aggregates and upsert one {@link AreaIntelligenceSnapshot} row per
     * {@code (city_slug, area_key)} bucket.
     *
     * <p>This method is idempotent: calling it multiple times produces the same stable
     * snapshot state (latest data wins via upsert). {@code computed_at} is refreshed on
     * every invocation to record when the snapshot was last computed.
     *
     * @return count of snapshot rows written (for monitoring/logging)
     */
    @Transactional
    public int buildSnapshots() {
        log.info("AreaIntelligenceSnapshotService: starting snapshot build");

        List<AreaIntelligenceSnapshotRow> rows =
                snapshotRepository.findRawAggregates(AggregationConstants.FRESH_WINDOW_DAYS);

        log.debug("AreaIntelligenceSnapshotService: aggregate query returned {} buckets", rows.size());

        Instant now = Instant.now();
        List<AreaIntelligenceSnapshot> snapshots = rows.stream()
                .map(row -> toSnapshot(row, now))
                .toList();

        snapshotRepository.saveAllAndFlush(snapshots);

        log.info("AreaIntelligenceSnapshotService: upserted {} snapshot rows", snapshots.size());
        return snapshots.size();
    }

    /**
     * Map one aggregate query row to an {@link AreaIntelligenceSnapshot} entity,
     * applying k-anonymity suppression and confidence classification.
     *
     * @param row   raw aggregate row from the native query
     * @param now   snapshot computation timestamp (caller-supplied for consistency)
     * @return fully populated snapshot entity (demand_score stays null)
     */
    AreaIntelligenceSnapshot toSnapshot(AreaIntelligenceSnapshotRow row, Instant now) {
        int activeCount = row.getActiveListingCount() != null
                ? row.getActiveListingCount().intValue()
                : 0;

        // Confidence classification — reuses AreaConfidence as-is; thresholds not redefined here.
        String confidence = AreaConfidence.classify(activeCount).name().toLowerCase();

        // k-anonymity suppression: precise values MUST be NULL (not 0) below K_ANON_MIN.
        boolean supported = activeCount >= AggregationConstants.K_ANON_MIN;

        // PERCENTILE_CONT over BIGINT returns DOUBLE PRECISION via JDBC; convert to Long via
        // Math.round() for the entity's BIGINT column. NULL propagates (no price rows → null).
        Long medianPricePaise = (supported && row.getMedianPricePaise() != null)
                ? Math.round(row.getMedianPricePaise())
                : null;
        String dominantPropertyType = supported ? row.getDominantPropertyType() : null;

        // avg_listing_quality: preserve the SQL AVG result (null when scoredCount=0).
        // MUST NOT coerce to 0 — null signals backfill-incomplete state.
        // setScale(2, HALF_UP) ensures the in-memory value deterministically matches the
        // NUMERIC(5,2) column scale rather than relying on Hibernate's implicit rounding.
        BigDecimal avgListingQuality = null;
        if (row.getAvgQuality() != null) {
            avgListingQuality = BigDecimal.valueOf(row.getAvgQuality())
                    .setScale(2, RoundingMode.HALF_UP);
        }

        int freshListingCount = row.getFreshListingCount() != null
                ? row.getFreshListingCount().intValue()
                : 0;

        // price_comparison_sample_count = activeListingCount (the bucket itself; approved D4).
        int priceComparisonSampleCount = activeCount;

        AreaIntelligenceSnapshot snapshot = new AreaIntelligenceSnapshot();
        snapshot.setCitySlug(row.getCitySlug());
        snapshot.setAreaKey(row.getAreaKey());
        snapshot.setAreaLabel(row.getAreaLabel());
        snapshot.setComputedAt(now);
        snapshot.setActiveListingCount(activeCount);
        snapshot.setMedianPricePaise(medianPricePaise);
        snapshot.setDominantPropertyType(dominantPropertyType);
        snapshot.setFreshListingCount(freshListingCount);
        snapshot.setAvgListingQuality(avgListingQuality);
        snapshot.setPriceComparisonSampleCount(priceComparisonSampleCount);
        snapshot.setPriceComparisonSupported(supported);
        snapshot.setConfidence(confidence);
        // demand_score intentionally not set — stays null (reserved for #1532).

        return snapshot;
    }
}
